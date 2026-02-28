// API 客户端 - 连接后端代理服务
// 策略：优先从本地缓存读取，后台静默更新

import type { UnifiedMarket, ArbitrageOpportunity, ArbitrageStats } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// localStorage 缓存键 - 分别存储，最后由 marketStore 合并
const CACHE_KEYS = {
  PREDICT_MARKETS: 'markets_cache_predict_v3',
  PREDICT_TIME: 'markets_cache_predict_time_v3',
  POLYMARKET_MARKETS: 'markets_cache_polymarket_v3',
  POLYMARKET_TIME: 'markets_cache_polymarket_time_v3',
};
const CACHE_MAX_AGE = 10 * 60 * 1000; // 10分钟

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  // ============ 缓存工具方法 ============
  
  private getCachedMarkets(key: string, timeKey: string): UnifiedMarket[] | null {
    try {
      const cached = localStorage.getItem(key);
      const cachedAt = localStorage.getItem(timeKey);
      
      if (!cached || !cachedAt) return null;
      
      const age = Date.now() - Number(cachedAt);
      // 缓存不过期（或20分钟内）都可用
      if (age > CACHE_MAX_AGE * 2) {
        console.log(`[Cache] Data too old (${Math.floor(age/1000)}s), ignoring`);
        return null;
      }
      
      const data = JSON.parse(cached);
      console.log(`[Cache] Loaded ${data.length} markets from cache (${Math.floor(age/1000)}s old)`);
      return data;
    } catch (err) {
      console.warn('[Cache] Failed to load from cache:', err);
      return null;
    }
  }
  
  private saveMarketsToCache(key: string, timeKey: string, markets: UnifiedMarket[]) {
    try {
      localStorage.setItem(key, JSON.stringify(markets));
      localStorage.setItem(timeKey, String(Date.now()));
      console.log(`[Cache] Saved ${markets.length} markets to cache`);
    } catch (err) {
      console.warn('[Cache] Failed to save to cache:', err);
    }
  }

  private async request<T>(
    endpoint: string, 
    options: RequestInit = {},
    apiKey?: string
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // ============ Predict.fun API ============
  
  async getPredictMarkets(apiKey: string, cursor?: string): Promise<{ data: any[]; cursor?: string; hasMore?: boolean }> {
    const query = cursor ? `?cursor=${cursor}` : '';
    return this.request(`/api/predict/markets${query}`, {}, apiKey);
  }

  /**
   * 获取所有 Predict.fun 市场（缓存优先，秒开体验）
   * @param apiKey API Key
   * @param withPrices 是否获取价格（默认 true，只获取前 50 个活跃市场的价格）
   * @param maxPriceFetch 最多获取多少个市场的价格
   * @param onUpdate 后台更新回调（可选）
   */
  async getAllPredictMarkets(
    apiKey: string, 
    withPrices: boolean = true, 
    maxPriceFetch: number = 50,
    onUpdate?: (markets: UnifiedMarket[]) => void
  ): Promise<{ 
    markets: UnifiedMarket[]; 
    isFirstFetch: boolean;
    count: number;
    pricesFetched: number;
  }> {
    // 1. 优先从本地缓存读取（秒开）
    const cached = this.getCachedMarkets(CACHE_KEYS.PREDICT_MARKETS, CACHE_KEYS.PREDICT_TIME);
    
    if (cached && cached.length > 0) {
      console.log(`[ApiClient] Using cached Predict markets: ${cached.length}`);
      
      // 2. 后台静默更新（不阻塞UI）
      this.fetchPredictMarketsInBackground(apiKey, withPrices, maxPriceFetch, onUpdate);
      
      return {
        markets: cached,
        isFirstFetch: false,
        count: cached.length,
        pricesFetched: 0,
      };
    }
    
    // 3. 无缓存时，走实时API（首次加载）
    console.log('[ApiClient] No cache, fetching from API...');
    return this.fetchPredictMarketsFromAPI(apiKey, withPrices, maxPriceFetch);
  }
  
  // 后台静默获取并更新缓存
  private async fetchPredictMarketsInBackground(
    apiKey: string, 
    withPrices: boolean, 
    maxPriceFetch: number,
    onUpdate?: (markets: UnifiedMarket[]) => void
  ) {
    try {
      const result = await this.fetchPredictMarketsFromAPI(apiKey, withPrices, maxPriceFetch);
      
      // 保存到缓存
      this.saveMarketsToCache(CACHE_KEYS.PREDICT_MARKETS, CACHE_KEYS.PREDICT_TIME, result.markets);
      
      // 通知更新
      if (onUpdate) {
        onUpdate(result.markets);
      }
      
      console.log(`[ApiClient] Background update complete: ${result.markets.length} markets`);
    } catch (err) {
      console.warn('[ApiClient] Background update failed:', err);
    }
  }
  
  // 实时API请求
  private async fetchPredictMarketsFromAPI(
    apiKey: string, 
    withPrices: boolean, 
    maxPriceFetch: number
  ): Promise<{ 
    markets: UnifiedMarket[]; 
    isFirstFetch: boolean;
    count: number;
    pricesFetched: number;
  }> {
    const query = new URLSearchParams();
    if (withPrices) query.append('withPrices', 'true');
    if (maxPriceFetch) query.append('maxPriceFetch', maxPriceFetch.toString());
    
    const response = await this.request<{ 
      data: any[]; 
      isFirstFetch: boolean;
      count: number;
      pricesFetched: number;
    }>(`/api/predict/markets/all?${query}`, {}, apiKey);
    
    const markets = response.data;
    
    // 保存到缓存
    this.saveMarketsToCache(CACHE_KEYS.PREDICT_MARKETS, CACHE_KEYS.PREDICT_TIME, markets);
    
    return {
      markets,
      isFirstFetch: response.isFirstFetch,
      count: response.count,
      pricesFetched: response.pricesFetched,
    };
  }

  /**
   * 获取单个市场详情（包含价格）
   */
  async getPredictMarketById(apiKey: string, marketId: string): Promise<UnifiedMarket> {
    const response = await this.request<{ data: UnifiedMarket }>(
      `/api/predict/markets/${marketId}`, 
      {}, 
      apiKey
    );
    return response.data;
  }

  async searchPredictMarkets(apiKey: string, query: string): Promise<UnifiedMarket[]> {
    const response = await this.request<{ data: any[] }>(`/api/predict/search?q=${encodeURIComponent(query)}`, {}, apiKey);
    return response.data.map(m => this.transformPredictMarket(m));
  }

  // ============ Polymarket API (缓存优先) ============
  
  async getAllPolymarketMarkets(onUpdate?: (markets: UnifiedMarket[]) => void): Promise<UnifiedMarket[]> {
    // 1. 优先从本地缓存读取（秒开）
    const cached = this.getCachedMarkets(CACHE_KEYS.POLYMARKET_MARKETS, CACHE_KEYS.POLYMARKET_TIME);
    
    if (cached && cached.length > 0) {
      console.log(`[ApiClient] Using cached Polymarket markets: ${cached.length}`);
      
      // 2. 后台静默更新
      this.fetchPolymarketInBackground(onUpdate);
      
      return cached;
    }
    
    // 3. 无缓存时，走实时API
    console.log('[ApiClient] No Polymarket cache, fetching from API...');
    return this.fetchPolymarketFromAPI();
  }
  
  // 后台静默获取 Polymarket
  private async fetchPolymarketInBackground(onUpdate?: (markets: UnifiedMarket[]) => void) {
    try {
      const markets = await this.fetchPolymarketFromAPI();
      
      // 保存到缓存
      this.saveMarketsToCache(CACHE_KEYS.POLYMARKET_MARKETS, CACHE_KEYS.POLYMARKET_TIME, markets);
      
      // 通知更新
      if (onUpdate) {
        onUpdate(markets);
      }
      
      console.log(`[ApiClient] Polymarket background update complete: ${markets.length} markets`);
    } catch (err) {
      console.warn('[ApiClient] Polymarket background update failed:', err);
    }
  }
  
  // 实时获取 Polymarket
  private async fetchPolymarketFromAPI(): Promise<UnifiedMarket[]> {
    try {
      console.log('[ApiClient] Fetching Polymarket from backend...');
      const response = await fetch(`${this.baseURL}/api/polymarket/markets/all`);
      
      if (!response.ok) {
        throw new Error(`Backend API error: ${response.status}`);
      }
      
      const result = await response.json();
      const markets = result.data || [];
      
      // 保存到缓存
      this.saveMarketsToCache(CACHE_KEYS.POLYMARKET_MARKETS, CACHE_KEYS.POLYMARKET_TIME, markets);
      
      console.log(`[ApiClient] Polymarket API success: ${markets.length} markets`);
      return markets;
    } catch (backendError: any) {
      console.warn('[ApiClient] Backend fetch failed:', backendError.message);
      
      // 备用：尝试直接请求
      console.log('[ApiClient] Trying direct fetch as fallback...');
      return this.fetchPolymarketDirect();
    }
  }
  
  private async fetchPolymarketDirect(): Promise<UnifiedMarket[]> {
    const limit = 100;
    
    try {
      const response = await fetch(`https://gamma-api.polymarket.com/events?limit=${limit}&offset=0&closed=false`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      console.log(`[ApiClient] Direct fetch success: ${data.length} events`);
      
      return data
        .filter((e: any) => e.active && !e.closed)
        .map((event: any) => this.transformPolymarketEvent(event));
    } catch (error: any) {
      console.error('[ApiClient] Direct fetch failed:', error.message);
      return [];
    }
  }
  
  private transformPolymarketEvent(event: any): UnifiedMarket {
    // 解析价格
    let yesPrice = 0;
    let noPrice = 0;
    let volume = 0;
    let liquidity = 0;
    let conditionId = event.conditionId || '';
    let clobTokenIds: string[] = [];

    if (event.markets && event.markets.length > 0) {
      const firstMarket = event.markets[0];
      
      try {
        const outcomePrices = firstMarket.outcomePrices;
        if (outcomePrices) {
          const prices = typeof outcomePrices === 'string' ? JSON.parse(outcomePrices) : outcomePrices;
          if (Array.isArray(prices) && prices.length >= 2) {
            yesPrice = parseFloat(prices[0]) || 0;
            noPrice = parseFloat(prices[1]) || 0;
          }
        }
      } catch (e) {
        console.warn('Failed to parse prices for event:', event.id);
      }

      volume = firstMarket.volume || 0;
      liquidity = firstMarket.liquidity || 0;
      conditionId = firstMarket.conditionId || conditionId;
      clobTokenIds = this.normalizeClobTokenIds(firstMarket.clobTokenIds);
    }

    return {
      id: `polymarket-${event.id}`,
      source: 'polymarket',
      sourceId: event.id,
      conditionId: conditionId,
      categorySlug: this.extractCategoryFromSlug(event.slug),
      title: event.title,
      description: event.description || '',
      url: `https://polymarket.com/event/${event.slug}`,
      isActive: event.active,
      isTradable: event.active && !event.closed,
      yesPrice: yesPrice,
      noPrice: noPrice,
      yesPriceChange24h: 0,
      noPriceChange24h: 0,
      volume24h: event.volume24hr || 0,
      volumeTotal: event.volume || volume,
      liquidity: event.liquidity || liquidity,
      lastUpdated: Date.now(),
      feeRate: 0.002,
      endDate: event.endDate,
      clobTokenIds,
    };
  }

  private normalizeClobTokenIds(raw: unknown): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map(String).filter(Boolean);
        }
      } catch {
        // fallback
      }
      return raw
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((v) => v.replace(/^"+|"+$/g, '').trim())
        .filter(Boolean);
    }
    return [];
  }
  
  private extractCategoryFromSlug(slug?: string): string | undefined {
    if (!slug) return undefined;
    const categories = ['crypto', 'bitcoin', 'ethereum', 'politics', 'sports', 'finance', 'entertainment'];
    for (const cat of categories) {
      if (slug.includes(cat)) return cat;
    }
    return undefined;
  }

  // ============ 分页市场 API（按需加载） ============
  
  async getPaginatedMarkets(
    params: {
      page: number;
      limit: number;
      source?: 'all' | 'predict' | 'polymarket';
      search?: string;
      category?: string;
      sortBy?: 'volume' | 'time' | 'price';
      sortOrder?: 'asc' | 'desc';
    },
    apiKey?: string
  ): Promise<{
    data: UnifiedMarket[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
      hasPrev: boolean;
    };
    filters: any;
    timestamp: number;
  }> {
    const query = new URLSearchParams();
    query.append('page', params.page.toString());
    query.append('limit', params.limit.toString());
    if (params.source) query.append('source', params.source);
    if (params.search) query.append('search', params.search);
    if (params.category) query.append('category', params.category);
    if (params.sortBy) query.append('sortBy', params.sortBy);
    if (params.sortOrder) query.append('sortOrder', params.sortOrder);
    
    const url = `/api/markets/paginated?${query}`;
    
    const headers: Record<string, string> = {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    };
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    
    const response = await fetch(`${this.baseURL}${url}`, { headers });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }

  // ============ 缓存联动 API ============
  
  // 从后端缓存文件快速读取（秒开）
  async getMarketsFromCache(
    params: {
      source?: 'all' | 'predict' | 'polymarket';
      search?: string;
      category?: string;
    },
    apiKey?: string
  ): Promise<{
    data: UnifiedMarket[];
    count: number;
    source: 'cache';
    timestamp: number;
  }> {
    const query = new URLSearchParams();
    if (params.source) query.append('source', params.source);
    if (params.search) query.append('search', params.search);
    if (params.category) query.append('category', params.category);
    
    const url = `/api/markets/cached?${query}`;
    
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    
    const response = await fetch(`${this.baseURL}${url}`, { headers });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }
  
  // 强制刷新 - 调用 API 获取最新数据（1-2分钟）
  async refreshMarkets(apiKey: string): Promise<{
    data: UnifiedMarket[];
    count: number;
    source: 'api';
    timestamp: number;
  }> {
    const response = await fetch(`${this.baseURL}/api/markets/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({}), // 发送空 body，避免后端解析错误
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }

  // 获取后端版本号（用于检查数据是否需要更新）
  async getVersion(): Promise<{
    version: number;
    lastUpdate: number;
    nextScheduledUpdate: number;  // 下次自动更新时间
    isUpdating: boolean;
  }> {
    const response = await fetch(`${this.baseURL}/api/version`);
    if (!response.ok) {
      throw new Error(`Failed to get version: ${response.status}`);
    }
    return response.json();
  }

  // ============ Arbitrage API ============
  
  async getArbitrageOpportunities(
    predictApiKey: string,
    filters: {
      minProfit?: number;
      maxProfit?: number;
      minConfidence?: 'high' | 'medium' | 'low';
      minLiquidity?: number;
      minVolume24h?: number;
    } = {}
  ): Promise<{ opportunities: ArbitrageOpportunity[]; stats: ArbitrageStats }> {
    const params = new URLSearchParams();
    if (filters.minProfit) params.append('minProfit', filters.minProfit.toString());
    if (filters.maxProfit) params.append('maxProfit', filters.maxProfit.toString());
    if (filters.minConfidence) params.append('minConfidence', filters.minConfidence);
    if (filters.minLiquidity) params.append('minLiquidity', filters.minLiquidity.toString());
    if (filters.minVolume24h) params.append('minVolume24h', filters.minVolume24h.toString());

    const response = await this.request<{
      data: ArbitrageOpportunity[];
      stats: ArbitrageStats;
    }>(`/api/arbitrage/opportunities?${params}`, {
      headers: {
        'x-predict-api-key': predictApiKey,
      },
    });

    return {
      opportunities: response.data,
      stats: response.stats,
    };
  }

  async getArbitrageStats(predictApiKey: string): Promise<{ stats: ArbitrageStats; marketCounts: { predict: number; polymarket: number } }> {
    return this.request('/api/arbitrage/stats', {
      headers: {
        'x-predict-api-key': predictApiKey,
      },
    });
  }

  // ============ Realtime Pair Monitor API ============

  async startRealtimePairMonitor(payload: {
    cardId: string;
    predictMarketId: string;
    polymarketYesTokenId: string;
    polymarketNoTokenId: string;
    predictApiKey?: string;
    params: {
      feeBps: number;
      slippageBps: number;
      minProfit: number;
      minDepth: number;
    };
  }): Promise<{ ok: boolean; cardId: string; pollMs: number }> {
    return this.request('/api/realtime-pairs/cards/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async updateRealtimePairMonitorParams(
    cardId: string,
    params: { feeBps: number; slippageBps: number; minProfit: number; minDepth: number }
  ): Promise<{ ok: boolean }> {
    return this.request(`/api/realtime-pairs/cards/${encodeURIComponent(cardId)}/params`, {
      method: 'PUT',
      body: JSON.stringify({ params }),
    });
  }

  async stopRealtimePairMonitor(cardId: string): Promise<{ ok: boolean }> {
    return this.request(`/api/realtime-pairs/cards/${encodeURIComponent(cardId)}`, {
      method: 'DELETE',
    });
  }

  async getRealtimePairCards(): Promise<{ data: any[]; count: number; ts: number }> {
    return this.request('/api/realtime-pairs/cards');
  }

  // ============ 批量价格刷新 ============
  
  async refreshPredictPrices(apiKey: string, marketIds: string[]): Promise<Map<string, { yesPrice: number; noPrice: number }>> {
    const response = await this.request<{
      data: Record<string, { yesPrice: number; noPrice: number }>;
      count: number;
    }>('/api/predict/markets/refresh-prices', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ marketIds }),
    });
    
    return new Map(Object.entries(response.data));
  }

  /**
   * 获取单个市场价格
   */
  async getPredictMarketPrice(apiKey: string, marketId: string): Promise<{
    yesPrice: number;
    noPrice: number;
    volume24h: number;
    volumeTotal: number;
    liquidity: number;
  }> {
    const response = await this.request<{
      data: {
        marketId: string;
        yesPrice: number;
        noPrice: number;
        volume24h: number;
        volumeTotal: number;
        liquidity: number;
      };
    }>(`/api/predict/markets/${marketId}/price`, {}, apiKey);
    
    return response.data;
  }

  // ============ 数据转换 - 仅用于兼容性 ============
  
  private transformPredictMarket(market: any): UnifiedMarket {
    // 后端已经转换为 UnifiedMarket，直接返回
    if (market.source === 'predict') {
      return market as UnifiedMarket;
    }
    
    // 兼容性处理：如果后端返回原始格式
    const yesPrice = market.yesPrice || 0.5;
    return {
      id: `predict-${market.id}`,
      source: 'predict',
      sourceId: market.id,
      conditionId: market.conditionId,
      categorySlug: market.categorySlug,
      parentTitle: market.parentTitle,
      title: market.title,
      description: market.description || '',
      url: market.url || `https://predict.fun/market/${market.id}`,
      isActive: market.isActive !== undefined ? market.isActive : market.status === 'REGISTERED',
      isTradable: market.isTradable !== undefined ? market.isTradable : (market.status === 'REGISTERED' && market.tradingStatus === 'OPEN'),
      yesPrice: yesPrice,
      noPrice: 1 - yesPrice,
      yesPriceChange24h: 0,
      noPriceChange24h: 0,
      volume24h: market.volume24h || 0,
      volumeTotal: market.volume || 0,
      liquidity: market.liquidity || 0,
      lastUpdated: Date.now(),
      feeRate: 0.002,
      endDate: market.endDate || market.endsAt,
      polymarketConditionIds: Array.isArray(market.polymarketConditionIds)
        ? market.polymarketConditionIds.map(String)
        : [],
    };
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
