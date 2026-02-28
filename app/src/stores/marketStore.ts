// 市场数据状态管理

import { create } from 'zustand';
import type { UnifiedMarket, ArbitrageOpportunity, ArbitrageStats } from '@/types';
import { apiClient } from '@/api/client';

// LocalStorage 缓存配置 - 统一使用 markets_cache_v3
const MARKETS_CACHE_KEY = 'markets_cache_v3';
const MARKETS_CACHE_TIME_KEY = 'markets_cache_time_v3';
const CACHE_MAX_AGE = 10 * 60 * 1000; // 缓存10分钟

// 清除旧版本缓存（统一前的旧缓存）
localStorage.removeItem('arbitrage_monitor_markets_v1');
localStorage.removeItem('arbitrage_monitor_markets_time_v1');
localStorage.removeItem('arbitrage_monitor_markets_v2');
localStorage.removeItem('arbitrage_monitor_markets_time_v2');
localStorage.removeItem('arbitrage_monitor_markets_v3');
localStorage.removeItem('arbitrage_monitor_markets_time_v3');
localStorage.removeItem('arbitrage_monitor_markets_v4');
localStorage.removeItem('arbitrage_monitor_markets_time_v4');
localStorage.removeItem('arbitrage_monitor_markets_v5');
localStorage.removeItem('arbitrage_monitor_markets_time_v5');
localStorage.removeItem('markets_cache_v2');
localStorage.removeItem('markets_cache_time_v2');
localStorage.removeItem('polymarket_markets_cache_v1');
localStorage.removeItem('polymarket_markets_time_v1');

// 从 localStorage 加载缓存
const loadCachedMarkets = (): UnifiedMarket[] | null => {
  try {
    const cached = localStorage.getItem(MARKETS_CACHE_KEY);
    const cachedAt = localStorage.getItem(MARKETS_CACHE_TIME_KEY);
    
    if (!cached || !cachedAt) return null;
    
    const age = Date.now() - Number(cachedAt);
    if (age > CACHE_MAX_AGE) {
      localStorage.removeItem(MARKETS_CACHE_KEY);
      localStorage.removeItem(MARKETS_CACHE_TIME_KEY);
      return null;
    }
    
    return JSON.parse(cached);
  } catch {
    return null;
  }
};

// 保存到 localStorage
const saveMarketsToCache = (markets: UnifiedMarket[]) => {
  try {
    localStorage.setItem(MARKETS_CACHE_KEY, JSON.stringify(markets));
    localStorage.setItem(MARKETS_CACHE_TIME_KEY, String(Date.now()));
  } catch (err) {
    console.warn('Failed to save markets to cache:', err);
  }
};

// 初始空状态
const emptyStats: ArbitrageStats = {
  totalOpportunities: 0,
  highConfidenceCount: 0,
  mediumConfidenceCount: 0,
  lowConfidenceCount: 0,
  predictToPolymarketCount: 0,
  polymarketToPredictCount: 0,
  avgProfitPercent24h: 0,
  maxProfitPercent24h: 0,
  lastUpdated: Date.now(),
};

interface MarketStore {
  // 数据
  markets: UnifiedMarket[];
  arbitrageOpportunities: ArbitrageOpportunity[];
  stats: ArbitrageStats;
  
  // 加载状态
  isLoadingMarkets: boolean;
  isLoadingArbitrage: boolean;
  lastUpdateTime: number | null;
  
  // 首次抓取状态
  isFirstFetch: boolean;
  firstFetchProgress: number;
  
  // 价格获取状态
  pricesFetched: number;  // 有多少个市场获取了价格
  
  // 错误状态
  error: string | null;
  
  // 筛选和排序
  searchQuery: string;
  selectedCategory: string | null;
  selectedPlatform: 'all' | 'predict' | 'polymarket';
  selectedStatus: 'all' | 'trading' | 'closing' | 'closed';
  sortBy: 'price' | 'volume' | 'volumeTotal' | 'time' | 'profit';
  sortOrder: 'asc' | 'desc';
  
  // Actions
  fetchMarkets: (apiKey?: string, silent?: boolean) => Promise<void>;
  refreshPredictPrices: (apiKey?: string, silent?: boolean) => Promise<void>;
  fetchArbitrageOpportunities: (apiKey?: string, filters?: any, silent?: boolean) => Promise<void>;
  refreshAll: (apiKey?: string, silent?: boolean) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string | null) => void;
  setSelectedPlatform: (platform: 'all' | 'predict' | 'polymarket') => void;
  setSelectedStatus: (status: 'all' | 'trading' | 'closing' | 'closed') => void;
  setSortBy: (sortBy: 'price' | 'volume' | 'volumeTotal' | 'time' | 'profit') => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
  clearError: () => void;
  
  // 选择器
  getFilteredMarkets: () => UnifiedMarket[];
  getFilteredArbitrage: () => ArbitrageOpportunity[];
  getMarketById: (id: string) => UnifiedMarket | undefined;
  getArbitrageById: (id: string) => ArbitrageOpportunity | undefined;
  getMarketsWithoutPrice: () => UnifiedMarket[];  // 获取没有价格的市场
}

export const useMarketStore = create<MarketStore>((set, get) => ({
  // 初始状态
  markets: [],
  arbitrageOpportunities: [],
  stats: emptyStats,
  pricesFetched: 0,
  
  // 加载状态
  isLoadingMarkets: false,
  isLoadingArbitrage: false,
  lastUpdateTime: null,
  
  // 首次抓取状态
  isFirstFetch: false,
  firstFetchProgress: 0,
  
  // 错误状态
  error: null,
  
  // 筛选和排序
  searchQuery: '',
  selectedCategory: null,
  selectedPlatform: 'all',
  selectedStatus: 'all',
  sortBy: 'volumeTotal',
  sortOrder: 'desc',
  
  // Actions
  fetchMarkets: async (apiKey?: string, silent?: boolean) => {
    if (!apiKey) {
      set({ 
        error: '请先配置 Predict.fun API Key',
        isLoadingMarkets: false,
        markets: [],
        isFirstFetch: false,
      });
      return;
    }

    // 非静默模式下，先尝试从缓存加载
    if (!silent) {
      const cached = loadCachedMarkets();
      if (cached && cached.length > 0) {
        set({ 
          markets: cached,
          isLoadingMarkets: false,
          lastUpdateTime: Number(localStorage.getItem(MARKETS_CACHE_TIME_KEY)),
          error: null,
          isFirstFetch: false,
        });
        console.log(`[MarketStore] Loaded ${cached.length} markets from cache`);
      } else {
        set({ isLoadingMarkets: true, error: null, isFirstFetch: false });
      }
    }
    
    try {
      // 定义后台更新回调（缓存优先模式下，后台获取到新数据后更新UI）
      const onPredictUpdate = (markets: UnifiedMarket[]) => {
        const currentPolymarket = get().markets.filter(m => m.source === 'polymarket');
        const allMarkets = [...markets, ...currentPolymarket];
        saveMarketsToCache(allMarkets);
        set({ 
          markets: allMarkets,
          lastUpdateTime: Date.now(),
          pricesFetched: markets.filter(m => m.yesPrice > 0).length,
        });
        console.log(`[MarketStore] Predict background update: ${markets.length} markets`);
      };
      
      const onPolymarketUpdate = (markets: UnifiedMarket[]) => {
        const currentPredict = get().markets.filter(m => m.source === 'predict');
        const allMarkets = [...currentPredict, ...markets];
        saveMarketsToCache(allMarkets);
        set({ 
          markets: allMarkets,
          lastUpdateTime: Date.now(),
        });
        console.log(`[MarketStore] Polymarket background update: ${markets.length} markets`);
      };
      
      // 获取 Predict.fun 数据（缓存优先，带后台更新）
      const predictResult = await apiClient.getAllPredictMarkets(apiKey, true, 50, onPredictUpdate);
      
      // 如果是首次抓取（API返回空，需要等待后端初始化），显示加载状态
      if (predictResult.isFirstFetch || predictResult.markets.length === 0) {
        console.log('[MarketStore] First fetch or empty cache, waiting for data...');
        
        // 如果已经有缓存数据，直接显示
        if (predictResult.markets.length > 0) {
          set({ 
            isLoadingMarkets: false,
            isFirstFetch: false,
          });
        } else {
          set({ 
            isFirstFetch: true,
            firstFetchProgress: 0,
            isLoadingMarkets: true,
          });
        }
        
        // 后台轮询等待首次数据（最多等3分钟）
        const maxWaitTime = 3 * 60 * 1000;
        const pollInterval = 5000;
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          
          const elapsed = Date.now() - startTime;
          const progress = Math.min(95, Math.floor((elapsed / 72000) * 100));
          set({ firstFetchProgress: progress });
          
          const checkResult = await apiClient.getAllPredictMarkets(apiKey, true, 50);
          if (!checkResult.isFirstFetch && checkResult.count > 0) {
            const polymarketMarkets = await apiClient.getAllPolymarketMarkets(onPolymarketUpdate);
            const allMarkets = [...checkResult.markets, ...polymarketMarkets];
            
            saveMarketsToCache(allMarkets);
            
            set({ 
              markets: allMarkets,
              isLoadingMarkets: false,
              isFirstFetch: false,
              firstFetchProgress: 100,
              pricesFetched: checkResult.pricesFetched,
              lastUpdateTime: Date.now(),
              error: null,
            });
            
            console.log(`[MarketStore] First fetch completed: ${allMarkets.length} markets`);
            return;
          }
        }
        
        // 超时但有缓存数据，继续显示缓存
        if (predictResult.markets.length > 0) {
          console.log('[MarketStore] Timeout but using cached data');
          return;
        }
        
        set({ 
          error: '首次抓取数据超时，请稍后重试',
          isLoadingMarkets: false,
          isFirstFetch: false,
        });
        return;
      }
      
      // 有缓存数据，立即显示并获取 Polymarket
      set({ 
        isLoadingMarkets: false,
        isFirstFetch: false,
      });
      
      // 获取 Polymarket（缓存优先，带后台更新）
      const polymarketMarkets = await apiClient.getAllPolymarketMarkets(onPolymarketUpdate);
      
      const allMarkets = [...predictResult.markets, ...polymarketMarkets];
      
      saveMarketsToCache(allMarkets);
      
      set({ 
        markets: allMarkets,
        isLoadingMarkets: false,
        isFirstFetch: false,
        pricesFetched: predictResult.pricesFetched,
        lastUpdateTime: Date.now(),
        error: null,
      });
      
      console.log(`[MarketStore] Fetched ${allMarkets.length} markets, ${predictResult.pricesFetched} with prices`);
    } catch (err: any) {
      console.error('Failed to fetch markets:', err);
      
      const cached = loadCachedMarkets();
      if (cached && cached.length > 0) {
        console.log('[MarketStore] API failed, using cached data');
        set({ 
          isLoadingMarkets: false,
          error: null,
          isFirstFetch: false,
        });
      } else {
        set({ 
          error: err.message || '获取市场数据失败',
          isLoadingMarkets: false,
          isFirstFetch: false,
          markets: [],
        });
      }
    }
  },
  
  // 单独刷新 Predict.fun 价格（使用新的批量接口）
  refreshPredictPrices: async (apiKey?: string, _silent?: boolean) => {
    if (!apiKey) return;
    
    const { markets } = get();
    
    // 只获取 Predict.fun 市场的 ID（最多100个）
    const predictMarketIds = markets
      .filter(m => m.source === 'predict' && m.id.startsWith('predict-'))
      .map(m => m.id.replace('predict-', ''))
      .slice(0, 100);
    
    if (predictMarketIds.length === 0) return;
    
    try {
      // 调用批量价格刷新接口（后端现在使用并发控制）
      const priceUpdates = await apiClient.refreshPredictPrices(apiKey, predictMarketIds);
      
      // 更新市场价格
      const updatedMarkets = markets.map(market => {
        if (market.source !== 'predict') return market;
        
        const marketId = market.id.replace('predict-', '');
        const updates = priceUpdates.get(marketId);
        
        if (updates) {
          return {
            ...market,
            yesPrice: updates.yesPrice,
            noPrice: updates.noPrice,
            lastUpdated: Date.now(),
          };
        }
        return market;
      });
      
      set({ 
        markets: updatedMarkets,
        pricesFetched: priceUpdates.size,
        lastUpdateTime: Date.now(),
      });
      
      console.log(`[MarketStore] Refreshed prices for ${priceUpdates.size} markets`);
    } catch (err: any) {
      console.warn('Failed to refresh Predict.fun prices:', err.message);
    }
  },
  
  fetchArbitrageOpportunities: async (apiKey?: string, filters?: any, silent?: boolean) => {
    if (!apiKey) {
      set({ 
        error: '请先配置 Predict.fun API Key',
        isLoadingArbitrage: false,
        arbitrageOpportunities: [],
        stats: emptyStats,
      });
      return;
    }

    if (!silent) {
      set({ isLoadingArbitrage: true, error: null });
    }
    
    try {
      const result = await apiClient.getArbitrageOpportunities(apiKey, filters);
      
      set({ 
        arbitrageOpportunities: result.opportunities,
        stats: result.stats,
        isLoadingArbitrage: false,
        lastUpdateTime: Date.now(),
        error: null,
      });
    } catch (err: any) {
      console.error('Failed to fetch arbitrage opportunities:', err);
      set({ 
        error: err.message || '获取套利机会失败',
        isLoadingArbitrage: false,
        arbitrageOpportunities: [],
        stats: emptyStats,
      });
    }
  },
  
  refreshAll: async (apiKey?: string, silent?: boolean) => {
    const { fetchMarkets, fetchArbitrageOpportunities } = get();
    if (!apiKey) {
      set({ error: '请先配置 Predict.fun API Key' });
      return;
    }
    await Promise.all([
      fetchMarkets(apiKey, silent),
      fetchArbitrageOpportunities(apiKey, undefined, silent),
    ]);
  },
  
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setSelectedPlatform: (platform) => set({ selectedPlatform: platform }),
  setSelectedStatus: (status) => set({ selectedStatus: status }),
  setSortBy: (sortBy) => set({ sortBy }),
  setSortOrder: (order) => set({ sortOrder: order }),
  clearError: () => set({ error: null }),
  
  // 选择器
  getFilteredMarkets: () => {
    const { markets, searchQuery, selectedCategory, selectedPlatform, selectedStatus, sortBy, sortOrder } = get();
    
    let filtered = [...markets];
    
    // 搜索筛选
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m => 
        m.title.toLowerCase().includes(query) ||
        m.description.toLowerCase().includes(query) ||
        m.parentTitle?.toLowerCase().includes(query)
      );
    }
    
    // 类别筛选
    if (selectedCategory) {
      filtered = filtered.filter(m => m.categorySlug === selectedCategory);
    }
    
    // 平台筛选
    if (selectedPlatform !== 'all') {
      filtered = filtered.filter(m => m.source === selectedPlatform);
    }
    
    // 状态筛选
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(m => {
        if (selectedStatus === 'trading') return m.isTradable;
        if (selectedStatus === 'closed') return !m.isActive;
        return true;
      });
    }
    
    // 排序
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'price':
          comparison = a.yesPrice - b.yesPrice;
          break;
        case 'volume':
          comparison = a.volume24h - b.volume24h;
          break;
        case 'volumeTotal':
          comparison = a.volumeTotal - b.volumeTotal;
          break;
        case 'time':
          comparison = a.lastUpdated - b.lastUpdated;
          break;
        case 'profit':
          comparison = a.yesPrice - b.yesPrice;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return filtered;
  },
  
  getFilteredArbitrage: () => {
    const { arbitrageOpportunities, sortBy, sortOrder } = get();
    
    let filtered = [...arbitrageOpportunities];
    
    // 排序
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'profit':
          comparison = a.roi - b.roi;
          break;
        case 'price':
          comparison = a.priceDiff - b.priceDiff;
          break;
        case 'time':
          comparison = a.detectedAt - b.detectedAt;
          break;
        default:
          comparison = a.roi - b.roi;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return filtered;
  },
  
  getMarketById: (id) => {
    return get().markets.find(m => m.id === id);
  },
  
  getArbitrageById: (id) => {
    return get().arbitrageOpportunities.find(a => a.id === id);
  },
  
  // 获取没有价格的市场（用于批量刷新）
  getMarketsWithoutPrice: () => {
    return get().markets.filter(m => m.source === 'predict' && m.yesPrice === 0.5 && m.noPrice === 0.5);
  },
}));
