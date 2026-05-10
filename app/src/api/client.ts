// API 客户端 - 连接后端代理服务
// 策略：优先从本地缓存读取，后台静默更新
//
// 本文件只负责 HTTP 请求编排，缓存/转换逻辑已拆出：
//   - cacheStorage.ts: localStorage 读写
//   - transformers.ts:  原始数据 -> UnifiedMarket 纯函数

import type { UnifiedMarket, ArbitrageOpportunity, ArbitrageStats } from '@/types';
import {
  MARKET_CACHE_KEYS,
  getCachedMarkets,
  saveMarketsToCache,
} from './cacheStorage';
import { transformPolymarketEvent, transformPredictMarket } from './transformers';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  // ============ 基础请求方法 ============

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    apiKey?: string
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // ============ Predict.fun API ============

  async getPredictMarkets(
    apiKey: string,
    cursor?: string
  ): Promise<{ data: any[]; cursor?: string; hasMore?: boolean }> {
    const query = cursor ? `?cursor=${cursor}` : '';
    return this.request(`/api/predict/markets${query}`, {}, apiKey);
  }

  /**
   * 获取所有 Predict.fun 市场（缓存优先，秒开体验）
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
    const cached = getCachedMarkets(MARKET_CACHE_KEYS.PREDICT_MARKETS, MARKET_CACHE_KEYS.PREDICT_TIME);

    if (cached && cached.length > 0) {
      console.log(`[ApiClient] Using cached Predict markets: ${cached.length}`);
      this.fetchPredictMarketsInBackground(apiKey, withPrices, maxPriceFetch, onUpdate);
      return {
        markets: cached,
        isFirstFetch: false,
        count: cached.length,
        pricesFetched: 0,
      };
    }

    console.log('[ApiClient] No cache, fetching from API...');
    return this.fetchPredictMarketsFromAPI(apiKey, withPrices, maxPriceFetch);
  }

  private async fetchPredictMarketsInBackground(
    apiKey: string,
    withPrices: boolean,
    maxPriceFetch: number,
    onUpdate?: (markets: UnifiedMarket[]) => void
  ) {
    try {
      const result = await this.fetchPredictMarketsFromAPI(apiKey, withPrices, maxPriceFetch);
      saveMarketsToCache(
        MARKET_CACHE_KEYS.PREDICT_MARKETS,
        MARKET_CACHE_KEYS.PREDICT_TIME,
        result.markets
      );
      onUpdate?.(result.markets);
      console.log(`[ApiClient] Background update complete: ${result.markets.length} markets`);
    } catch (err) {
      console.warn('[ApiClient] Background update failed:', err);
    }
  }

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

    saveMarketsToCache(MARKET_CACHE_KEYS.PREDICT_MARKETS, MARKET_CACHE_KEYS.PREDICT_TIME, markets);

    return {
      markets,
      isFirstFetch: response.isFirstFetch,
      count: response.count,
      pricesFetched: response.pricesFetched,
    };
  }

  /** 获取单个市场详情（包含价格） */
  async getPredictMarketById(apiKey: string, marketId: string): Promise<UnifiedMarket> {
    const response = await this.request<{ data: UnifiedMarket }>(
      `/api/predict/markets/${marketId}`,
      {},
      apiKey
    );
    return response.data;
  }

  async searchPredictMarkets(apiKey: string, query: string): Promise<UnifiedMarket[]> {
    const response = await this.request<{ data: any[] }>(
      `/api/predict/search?q=${encodeURIComponent(query)}`,
      {},
      apiKey
    );
    return response.data.map((m) => transformPredictMarket(m));
  }

  // ============ Polymarket API (缓存优先) ============

  async getAllPolymarketMarkets(
    onUpdate?: (markets: UnifiedMarket[]) => void
  ): Promise<UnifiedMarket[]> {
    const cached = getCachedMarkets(
      MARKET_CACHE_KEYS.POLYMARKET_MARKETS,
      MARKET_CACHE_KEYS.POLYMARKET_TIME
    );

    if (cached && cached.length > 0) {
      console.log(`[ApiClient] Using cached Polymarket markets: ${cached.length}`);
      this.fetchPolymarketInBackground(onUpdate);
      return cached;
    }

    console.log('[ApiClient] No Polymarket cache, fetching from API...');
    return this.fetchPolymarketFromAPI();
  }

  private async fetchPolymarketInBackground(onUpdate?: (markets: UnifiedMarket[]) => void) {
    try {
      const markets = await this.fetchPolymarketFromAPI();
      saveMarketsToCache(
        MARKET_CACHE_KEYS.POLYMARKET_MARKETS,
        MARKET_CACHE_KEYS.POLYMARKET_TIME,
        markets
      );
      onUpdate?.(markets);
      console.log(`[ApiClient] Polymarket background update complete: ${markets.length} markets`);
    } catch (err) {
      console.warn('[ApiClient] Polymarket background update failed:', err);
    }
  }

  private async fetchPolymarketFromAPI(): Promise<UnifiedMarket[]> {
    try {
      console.log('[ApiClient] Fetching Polymarket from backend...');
      const response = await fetch(`${this.baseURL}/api/polymarket/markets/all`);

      if (!response.ok) {
        throw new Error(`Backend API error: ${response.status}`);
      }

      const result = await response.json();
      const markets = result.data || [];

      saveMarketsToCache(
        MARKET_CACHE_KEYS.POLYMARKET_MARKETS,
        MARKET_CACHE_KEYS.POLYMARKET_TIME,
        markets
      );

      console.log(`[ApiClient] Polymarket API success: ${markets.length} markets`);
      return markets;
    } catch (backendError: any) {
      console.warn('[ApiClient] Backend fetch failed:', backendError.message);
      console.log('[ApiClient] Trying direct fetch as fallback...');
      return this.fetchPolymarketDirect();
    }
  }

  private async fetchPolymarketDirect(): Promise<UnifiedMarket[]> {
    const limit = 100;

    try {
      const response = await fetch(
        `https://gamma-api.polymarket.com/events?limit=${limit}&offset=0&closed=false`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      console.log(`[ApiClient] Direct fetch success: ${data.length} events`);

      return data
        .filter((e: any) => e.active && !e.closed)
        .map((event: any) => transformPolymarketEvent(event));
    } catch (error: any) {
      console.error('[ApiClient] Direct fetch failed:', error.message);
      return [];
    }
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
      Pragma: 'no-cache',
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
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async getVersion(): Promise<{
    version: number;
    lastUpdate: number;
    nextScheduledUpdate: number;
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

  async getArbitrageStats(
    predictApiKey: string
  ): Promise<{
    stats: ArbitrageStats;
    marketCounts: { predict: number; polymarket: number };
  }> {
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

  async refreshPredictPrices(
    apiKey: string,
    marketIds: string[]
  ): Promise<Map<string, { yesPrice: number; noPrice: number }>> {
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

  async getPredictMarketPrice(
    apiKey: string,
    marketId: string
  ): Promise<{
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
}

export const apiClient = new ApiClient(API_BASE_URL);
