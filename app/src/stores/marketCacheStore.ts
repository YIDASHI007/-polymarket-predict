// 市场缓存 Store - V2 无过期 + 错峰同步版本
// 架构：后端缓存永不过期，前端每10分钟05秒同步

import { create } from 'zustand';
import type { UnifiedMarket } from '@/types';
import { apiClient } from '@/api/client';

// localStorage 键
const CACHE_KEY = 'markets_cache_v3';
const CACHE_TIME_KEY = 'markets_cache_time_v3';

// 版本号检查间隔：1分钟
const VERSION_CHECK_INTERVAL = 60 * 1000;
// 缓存最大年龄：20分钟（超过则强制刷新）
const CACHE_MAX_AGE = 20 * 60 * 1000;

// 压缩市场数据，只保留必要字段（减少localStorage占用）
const compressMarket = (m: UnifiedMarket): any => ({
  id: m.id,
  source: m.source,
  sourceId: m.sourceId,
  conditionId: m.conditionId,
  clobTokenIds: m.clobTokenIds,
  polymarketConditionIds: m.polymarketConditionIds,
  categorySlug: m.categorySlug,
  parentTitle: m.parentTitle,
  title: m.title,
  description: m.description?.slice(0, 200), // 截断长描述
  url: m.url,
  isActive: m.isActive,
  isTradable: m.isTradable,
  yesPrice: m.yesPrice,
  noPrice: m.noPrice,
  volume24h: m.volume24h,
  volumeTotal: m.volumeTotal,
  liquidity: m.liquidity,
  endDate: m.endDate,
});

// 保存到 localStorage（压缩后）
const saveToStorage = (markets: UnifiedMarket[], version?: number) => {
  try {
    const compressed = markets.map(compressMarket);
    const json = JSON.stringify(compressed);
    
    // 检查大小（localStorage通常限制5-10MB）
    const sizeMB = json.length / 1024 / 1024;
    console.log(`[Cache] Saving ${markets.length} markets, size: ${sizeMB.toFixed(2)} MB`);
    
    if (sizeMB > 4) {
      console.warn('[Cache] Data too large, only saving first 5000 markets');
      const trimmed = compressed.slice(0, 5000);
      localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(CACHE_KEY, json);
    }
    
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
    
    // 保存版本号
    if (version) {
      localStorage.setItem('markets_cache_version', String(version));
    }
  } catch (err: any) {
    console.error('[Cache] Save failed:', err.message);
    // 如果还是失败，尝试只保存一半数据
    try {
      const half = markets.slice(0, Math.floor(markets.length / 2));
      localStorage.setItem(CACHE_KEY, JSON.stringify(half.map(compressMarket)));
      console.log(`[Cache] Saved half data: ${half.length} markets`);
    } catch (e) {
      console.error('[Cache] Even half data failed:', e);
    }
  }
};

// 从 localStorage 加载
const loadFromStorage = (): UnifiedMarket[] | null => {
  try {
    const data = localStorage.getItem(CACHE_KEY);
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
};

interface MarketCacheStore {
  // 数据
  markets: UnifiedMarket[];
  filteredMarkets: UnifiedMarket[];
  displayedMarkets: UnifiedMarket[];
  
  // 状态
  isLoading: boolean;
  isRefreshing: boolean;
  refreshProgress: string;
  error: string | null;
  lastSyncTime: number;
  localVersion: number; // 本地数据版本号
  
  // 筛选
  source: 'all' | 'predict' | 'polymarket';
  searchQuery: string;
  displayLimit: number;
  PAGE_SIZE: number;
  
  // 排序
  sortBy: 'default' | 'volume' | 'liquidity';
  sortOrder: 'desc' | 'asc';
  
  // 后端自动更新倒计时
  nextBackendUpdate: number;  // 下次更新时间戳
  
  // 方法
  init: (apiKey?: string) => Promise<void>;
  syncWithBackend: (apiKey?: string) => Promise<void>;
  checkVersionAndSync: (apiKey?: string) => Promise<void>;
  loadMore: () => void;
  refresh: (apiKey: string) => Promise<void>;
  
  // 筛选
  setSource: (source: 'all' | 'predict' | 'polymarket', apiKey?: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  applyFilter: () => void;
  
  // 排序
  setSortBy: (sortBy: 'default' | 'volume' | 'liquidity') => void;
  setSortOrder: (sortOrder: 'desc' | 'asc') => void;
}

export const useMarketCacheStore = create<MarketCacheStore>((set, get) => ({
  markets: [],
  filteredMarkets: [],
  displayedMarkets: [],
  
  isLoading: false,
  isRefreshing: false,
  refreshProgress: '',
  error: null,
  lastSyncTime: 0,
  localVersion: 0,
  
  source: 'all',
  searchQuery: '',
  displayLimit: 20,
  PAGE_SIZE: 20,
  sortBy: 'default',
  sortOrder: 'desc',
  nextBackendUpdate: 0,  // 下次后端自动更新时间
  
  // 初始化
  init: async (apiKey?: string) => {
    const { checkVersionAndSync, applyFilter } = get();
    
    // 1. 先尝试从 localStorage 加载（秒开）
    const cached = loadFromStorage();
    const cachedVersion = Number(localStorage.getItem('markets_cache_version')) || 0;
    if (cached && cached.length > 0) {
      console.log(`[Init] Loaded from localStorage: ${cached.length} markets, version: ${cachedVersion}`);
      set({ 
        markets: cached,
        lastSyncTime: Number(localStorage.getItem(CACHE_TIME_KEY)) || 0,
        localVersion: cachedVersion,
      });
      applyFilter();
    }
    
    // 2. 立即检查版本号（非阻塞）
    checkVersionAndSync(apiKey);
    
    // 3. 每1分钟检查一次版本号
    setInterval(() => {
      console.log('[Scheduled] Checking backend version...');
      checkVersionAndSync(apiKey);
    }, VERSION_CHECK_INTERVAL);
  },
  
  // 从后端缓存同步
  syncWithBackend: async (apiKey?: string) => {
    const { applyFilter, searchQuery, source } = get();
    // 不在这里获取 localVersion，在保存时动态获取最新值
    
    set({ isLoading: true, error: null });
    
    try {
      // 调用后端只读缓存接口（根据当前 source 请求数据）
      const result = await apiClient.getMarketsFromCache(
        { source, search: searchQuery },
        apiKey
      );
      
      console.log(`[Sync] Loaded from backend: ${result.data.length} markets`);
      
      // 保存到 localStorage（带版本号）
      // 重新获取最新版本号
      const currentVersion = get().localVersion;
      saveToStorage(result.data, currentVersion);
      
      set({
        markets: result.data,
        lastSyncTime: Date.now(),
        isLoading: false,
      });
      
      applyFilter();
    } catch (error: any) {
      console.error('[Sync] Failed:', error);
      set({ error: error.message, isLoading: false });
    }
  },
  
  // 检查后端版本号，如果变化则同步数据
  checkVersionAndSync: async (apiKey?: string) => {
    const { localVersion } = get();
    
    try {
      const versionInfo = await apiClient.getVersion();
      console.log(`[Version] Backend: ${versionInfo.version}, Local: ${localVersion}`);
      
      // 更新下次后端自动更新时间
      if (versionInfo.nextScheduledUpdate) {
        set({ nextBackendUpdate: versionInfo.nextScheduledUpdate });
      }
      
      // 如果版本号变化或者本地没有版本号，则同步数据
      if (versionInfo.version > localVersion || localVersion === 0) {
        console.log('[Version] New version detected, syncing...');
        // 先更新版本号，确保同步时保存的是新版本号
        set({ localVersion: versionInfo.version });
        localStorage.setItem('markets_cache_version', String(versionInfo.version));
        // 再同步数据
        await get().syncWithBackend(apiKey);
      } else {
        console.log('[Version] No update needed');
      }
    } catch (error: any) {
      console.error('[Version] Failed to check version:', error);
      // 版本号检查失败时，如果缓存超过20分钟则强制刷新
      const lastSync = Number(localStorage.getItem(CACHE_TIME_KEY)) || 0;
      if (Date.now() - lastSync > CACHE_MAX_AGE) {
        console.log('[Version] Cache too old, forcing sync...');
        await get().syncWithBackend(apiKey);
      }
    }
  },
  
  // 加载更多（本地分页）
  loadMore: () => {
    const { displayLimit, PAGE_SIZE, applyFilter } = get();
    set({ displayLimit: displayLimit + PAGE_SIZE });
    applyFilter();
  },
  
  // 手动刷新（调用后端API，1-2分钟）
  refresh: async (apiKey: string) => {
    set({ 
      isRefreshing: true, 
      refreshProgress: '正在获取新数据，预计1-2分钟...',
      error: null,
    });
    
    try {
      const result = await apiClient.refreshMarkets(apiKey);
      
      console.log(`[Refresh] Completed: ${result.data?.length || 0} markets`);
      
      // 刷新后立即同步
      await get().syncWithBackend(apiKey);
      
      set({
        isRefreshing: false,
        refreshProgress: '',
        displayLimit: 20,
      });
    } catch (error: any) {
      console.error('[Refresh] Failed:', error);
      set({ 
        error: error.message, 
        isRefreshing: false,
        refreshProgress: '',
      });
    }
  },
  
  // 切换平台
  setSource: async (newSource: 'all' | 'predict' | 'polymarket', apiKey?: string) => {
    const { source } = get();
    if (newSource === source) return;
    
    set({ source: newSource, displayLimit: 20 });
    
    // 切换平台后重新从后端加载
    await get().syncWithBackend(apiKey);
  },
  
  // 搜索
  setSearchQuery: (query: string) => {
    set({ searchQuery: query, displayLimit: 20 });
    get().applyFilter();
  },
  
  // 排序
  setSortBy: (sortBy: 'default' | 'volume' | 'liquidity') => {
    set({ sortBy, displayLimit: 20 });
    get().applyFilter();
  },
  
  setSortOrder: (sortOrder: 'desc' | 'asc') => {
    set({ sortOrder, displayLimit: 20 });
    get().applyFilter();
  },
  
  // 应用筛选和排序
  applyFilter: () => {
    const { markets, searchQuery, displayLimit, sortBy, sortOrder, source } = get();
    
    let filtered = [...markets];
    
    // 平台筛选（all | predict | polymarket）
    if (source !== 'all') {
      filtered = filtered.filter(m => m.source === source);
    }
    
    // 搜索筛选
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(m => 
        m.title.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q) ||
        m.parentTitle?.toLowerCase().includes(q)
      );
    }
    
    // 排序
    if (sortBy !== 'default') {
      filtered.sort((a, b) => {
        let aValue = 0;
        let bValue = 0;
        
        if (sortBy === 'volume') {
          aValue = a.volumeTotal || 0;
          bValue = b.volumeTotal || 0;
        } else if (sortBy === 'liquidity') {
          aValue = a.liquidity || 0;
          bValue = b.liquidity || 0;
        }
        
        return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
      });
    }
    
    const displayed = filtered.slice(0, displayLimit);
    
    set({
      filteredMarkets: filtered,
      displayedMarkets: displayed,
    });
  },
}));
