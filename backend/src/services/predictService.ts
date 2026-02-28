import { createPredictClient, ApiClient } from '../utils/apiClient';
import { cacheService } from '../utils/cache';
import { PredictMarket, PredictMarketsResponse, PredictCategory, Orderbook, UnifiedMarket } from '../types';

export class PredictService {
  private client: ApiClient;
  
  // 缓存策略优化
  private readonly CACHE_TTL_MARKETS = 600;     // 市场列表缓存10分钟
  private readonly CACHE_TTL_PRICES = 60;       // 价格缓存1分钟
  private readonly CACHE_TTL_STATS = 300;       // 统计信息缓存5分钟
  private readonly CACHE_TTL_CATEGORIES = 600;  // 分类缓存10分钟
  private currentVersion = 1;                   // 数据版本号，每次更新+1
  private readonly REQUEST_DELAY = 250;         // 240 req/min = 4 req/sec

  // 缓存 category slug 映射 (categoryId -> slug)
  private categorySlugMap: Map<number, string> = new Map();
  // 缓存 category title 映射 (categoryId -> title)
  private categoryTitleMap: Map<number, string> = new Map();
  // 缓存 category slug -> title 映射 (用于通过 slug 查找父标题)
  private categorySlugToTitleMap: Map<string, string> = new Map();
  // 缓存子市场 ID -> 父事件标题 (最直接可靠的映射)
  private marketIdToParentTitleMap: Map<string, string> = new Map();

  constructor(apiKey: string) {
    this.client = createPredictClient(apiKey);
  }

  /**
   * 获取所有 Categories（父市场/多元市场组）
   * 用于获取正确的 URL slug
   */
  async getCategories(): Promise<PredictCategory[]> {
    const cacheKey = 'predict-categories';
    const cached = cacheService.get<PredictCategory[]>(cacheKey);
    if (cached) {
      console.log(`[Predict] Using cached categories: ${cached.length}`);
      return cached;
    }

    try {
      const response = await this.client.get<{ data?: PredictCategory[]; success?: boolean; message?: string }>('/categories?first=150&status=OPEN');
      
      // API 可能返回速率限制错误
      if (!response.success || !response.data) {
        console.warn('Categories API returned error or empty data:', response.message);
        return [];
      }
      
      const data = response.data;
      
      // 构建各种映射
      data.forEach(cat => {
        // 1. categoryId -> slug 映射
        if (cat.slug) {
          this.categorySlugMap.set(cat.id, cat.slug);
          this.categorySlugToTitleMap.set(cat.slug, cat.title);
        }
        // 2. marketVariant -> title 映射
        if (cat.marketVariant && cat.title) {
          this.categorySlugToTitleMap.set(cat.marketVariant, cat.title);
        }
        // 3. categoryId -> title 映射
        if (cat.title) {
          this.categoryTitleMap.set(cat.id, cat.title);
        }
        // 4. 子市场 ID -> 父标题映射（最可靠）
        if (cat.markets && Array.isArray(cat.markets)) {
          console.log(`[Predict] Category "${cat.title}" has ${cat.markets.length} markets`);
          cat.markets.forEach((market: any) => {
            if (market.id && cat.title) {
              this.marketIdToParentTitleMap.set(String(market.id), cat.title);
            }
          });
        } else {
          console.log(`[Predict] Category "${cat.title}" has no markets field`);
        }
      });
      
      console.log(`[Predict] Loaded ${data.length} categories, mapped ${this.categoryTitleMap.size} titles, ${this.categorySlugToTitleMap.size} slug mappings, ${this.marketIdToParentTitleMap.size} market-parent mappings`);
      
      cacheService.set(cacheKey, data, this.CACHE_TTL_CATEGORIES);
      return data;
    } catch (error: any) {
      if (error.response?.status === 429) {
        console.warn('Predict.fun categories rate limit exceeded');
      } else {
        console.error('Error fetching Predict.fun categories:', error.message);
      }
      return [];
    }
  }

  /**
   * 根据 categoryId 获取正确的 URL slug（从内存缓存中查找）
   */
  getCategorySlug(categoryId: number): string | undefined {
    return this.categorySlugMap.get(categoryId);
  }

  /**
   * 根据 categoryId 获取父事件标题（从内存缓存中查找）
   */
  getCategoryTitle(categoryId: number): string | undefined {
    return this.categoryTitleMap.get(categoryId);
  }

  /**
   * 获取当前数据版本号
   */
  getVersion(): number {
    return this.currentVersion;
  }

  /**
   * 检查数据是否有更新（对比版本号）
   */
  checkUpdate(clientVersion: number): { hasUpdate: boolean; version: number } {
    return {
      hasUpdate: clientVersion < this.currentVersion,
      version: this.currentVersion
    };
  }

  /**
   * 获取市场列表 (支持分页)
   */
  async getMarkets(cursor?: string, forceRefresh = false): Promise<PredictMarketsResponse> {
    const cacheKey = `predict-markets-${cursor || 'first'}`;
    
    if (!forceRefresh) {
      const cached = cacheService.get<PredictMarketsResponse>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const params: Record<string, string> = { 
      first: '150',
      status: 'OPEN',        // 只获取注册状态为 OPEN 的市场
      tradingStatus: 'OPEN'  // 只获取交易状态为 OPEN 的市场
    };
    if (cursor) params.after = cursor;

    const queryString = new URLSearchParams(params).toString();
    const data = await this.client.get<PredictMarketsResponse>(`/markets?${queryString}`);
    
    cacheService.set(cacheKey, data, this.CACHE_TTL_MARKETS);
    console.log(`[Predict] Markets fetched: ${data.data?.length || 0} items`);
    return data;
  }

  // ============ V2: 只读缓存 + API更新分离 ============
  
  /**
   * 获取所有市场 - 只从缓存读取（永不调用API）
   */
  getAllMarketsFromCache(): PredictMarket[] {
    const cacheKey = 'predict-all-markets-v4';
    
    // 1. 先尝试从内存缓存读取
    const cached = cacheService.get<PredictMarket[]>(cacheKey);
    if (cached) {
      console.log(`[Predict] Using memory cache: ${cached.length} markets`);
      return cached;
    }
    
    // 2. 内存没有，从 cache.json 文件读取
    try {
      const fs = require('fs');
      const path = require('path');
      const cacheFile = path.join(process.cwd(), 'data', 'cache.json');
      
      if (fs.existsSync(cacheFile)) {
        const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        if (data[cacheKey]) {
          const fileCache = data[cacheKey].value;
          console.log(`[Predict] Using file cache: ${fileCache.length} markets`);
          cacheService.set(cacheKey, fileCache);
          return fileCache;
        }
      }
    } catch (error) {
      console.error('[Predict] Failed to read file cache:', error);
    }
    
    return [];
  }
  
  /**
   * 从API抓取最新数据并更新缓存（耗时1-2分钟）
   * 定时任务每10分钟调用一次，或手动刷新按钮调用
   */
  async fetchFromAPI(): Promise<PredictMarket[]> {
    console.log('[Predict] ===== fetchFromAPI START =====');
    const startTime = Date.now();
    
    const allMarkets: PredictMarket[] = [];
    let cursor: string | undefined;
    let pageCount = 0;
    const MAX_SAFETY_LIMIT = 10000;

    try {
      do {
        const response = await this.getMarkets(cursor, true);
        const markets = response.data || [];
        
        if (markets.length > 0) {
          allMarkets.push(...markets);
        }
        
        console.log(`[Predict] Page ${pageCount + 1}: Got ${markets.length} markets`);
        
        if (markets.length === 0 || !response.cursor) break;
        
        cursor = response.cursor;
        pageCount++;

        if (allMarkets.length >= MAX_SAFETY_LIMIT) {
          console.warn('[Predict] Reached safety limit');
          break;
        }

        await this.delay(this.REQUEST_DELAY);
      } while (cursor);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[Predict] API fetch completed: ${allMarkets.length} markets in ${duration}s`);
      
      // 批量获取所有市场的统计数据（volume/liquidity）
      // 注意：这会耗时约2分钟（475个市场 × 250ms = ~2分钟）
      console.log(`[Predict] Fetching stats for ALL ${allMarkets.length} markets (estimated ${Math.ceil(allMarkets.length * 0.25 / 60)} minutes)...`);
      const statsMap = await this.batchGetMarketStats(allMarkets.map(m => m.id));
      console.log(`[Predict] Stats map size: ${statsMap.size}`);
      
      // 使用 Map 合并 stats 数据到市场对象
      let mergedCount = 0;
      for (const market of allMarkets) {
        const stats = statsMap.get(String(market.id));
        if (stats) {
          (market as any).volume = stats.volumeTotal;
          (market as any).volume24h = stats.volume24h;
          (market as any).liquidity = stats.liquidity;
          mergedCount++;
        }
      }
      
      console.log(`[Predict] Stats merged for ${mergedCount}/${allMarkets.length} markets`);
      
      // 更新缓存（无TTL）
      cacheService.set('predict-all-markets-v4', allMarkets);
      
      return allMarkets;
    } catch (error) {
      console.error('[Predict] API fetch failed:', error);
      throw error;
    }
  }

  /**
   * 获取所有市场 (动态分页) - 旧版本，保留兼容性
   */
  async getAllMarkets(forceRefresh = false): Promise<{ markets: PredictMarket[]; version: number; isFresh: boolean; isFirstFetch: boolean }> {
    const cacheKey = 'predict-all-markets-v4';
    
    const hasCache = !!cacheService.get<PredictMarket[]>(cacheKey);
    const isFirstFetch = !hasCache;
    
    if (!forceRefresh && hasCache) {
      const cached = cacheService.get<PredictMarket[]>(cacheKey)!;
      console.log(`[Predict] Using cached markets: ${cached.length}`);
      await this.getCategories();
      return { markets: cached, version: this.currentVersion, isFresh: false, isFirstFetch: false };
    }

    console.log(`[Predict] ${isFirstFetch ? 'FIRST FETCH' : 'Force refresh'}: Fetching markets...`);
    
    await this.getCategories();

    const allMarkets: PredictMarket[] = [];
    let cursor: string | undefined;
    let pageCount = 0;
    const MAX_SAFETY_LIMIT = 10000;

    try {
      do {
        const response = await this.getMarkets(cursor, forceRefresh);
        const marketCount = response.data?.length || 0;
        
        if (marketCount > 0) {
          allMarkets.push(...response.data);
        }
        
        if (marketCount === 0 || !response.cursor) {
          break;
        }
        
        cursor = response.cursor;
        pageCount++;

        if (allMarkets.length >= MAX_SAFETY_LIMIT) {
          console.warn(`[Predict] Reached safety limit of ${MAX_SAFETY_LIMIT} markets`);
          break;
        }

        await this.delay(this.REQUEST_DELAY);
      } while (cursor);

      console.log(`[Predict] Total markets: ${allMarkets.length} (${pageCount} pages)`);
      
      cacheService.set(cacheKey, allMarkets, this.CACHE_TTL_MARKETS);
      this.currentVersion++;
      
      return { markets: allMarkets, version: this.currentVersion, isFresh: true, isFirstFetch };
    } catch (error) {
      console.error('Error fetching all Predict.fun markets:', error);
      return { markets: allMarkets, version: this.currentVersion, isFresh: false, isFirstFetch };
    }
  }

  /**
   * 根据 ID 获取单个市场详情
   * 严格遵循 API 文档: GET /v1/markets/{id}
   */
  async getMarketById(marketId: string | number): Promise<PredictMarket | null> {
    const cacheKey = `predict-market-${marketId}`;
    const cached = cacheService.get<PredictMarket>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.get<{ success: boolean; data: PredictMarket }>(`/markets/${marketId}`);
      
      if (!response.success || !response.data) {
        console.warn(`[Predict] Market ${marketId} not found`);
        return null;
      }
      
      cacheService.set(cacheKey, response.data, this.CACHE_TTL_MARKETS);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.warn(`[Predict] Market ${marketId} not found (404)`);
      } else {
        console.error(`[Predict] Error fetching market ${marketId}:`, error.message);
      }
      return null;
    }
  }

  /**
   * 获取市场统计信息
   * 严格遵循 API 文档: GET /v1/markets/{id}/stats
   * 注意：stats 和 last-sale 是独立的两个端点
   */
  async getMarketStats(marketId: string | number): Promise<{ 
    volume24h: number; 
    volumeTotal: number; 
    liquidity: number;
    yesPrice: number;
    noPrice: number;
  } | null> {
    const cacheKey = `predict-stats-${marketId}`;
    const cached = cacheService.get<{ volume24h: number; volumeTotal: number; liquidity: number; yesPrice: number; noPrice: number }>(cacheKey);
    if (cached) return cached;

    try {
      // 1. 获取统计信息（文档确认存在，但返回格式未知）
      const statsResponse = await this.client.get<any>(`/markets/${marketId}/stats`);
      
      // 处理可能的包装格式 { success: true, data: {...} }
      const statsData = statsResponse.data || statsResponse;
      
      // 2. 获取最新成交价格（严格遵循文档格式）
      let yesPrice = 0.5;
      let noPrice = 0.5;
      
      try {
        const lastSaleResponse = await this.client.get<{
          success: boolean;
          data: {
            quoteType: string;
            outcome: 'Yes' | 'No';
            priceInCurrency: string;
            strategy: string;
          }
        }>(`/markets/${marketId}/last-sale`);
        
        // 严格遵循文档格式
        if (lastSaleResponse.success && lastSaleResponse.data) {
          const { outcome, priceInCurrency } = lastSaleResponse.data;
          const price = parseFloat(priceInCurrency);
          
          if (!isNaN(price) && price > 0 && price <= 1) {
            if (outcome === 'Yes') {
              yesPrice = price;
              noPrice = 1 - price;
            } else if (outcome === 'No') {
              noPrice = price;
              yesPrice = 1 - price;
            }
          }
        }
      } catch (lastSaleError) {
        // last-sale 可能 404（无成交记录），使用默认值
        console.log(`[Predict] No last-sale data for market ${marketId}`);
      }

      // 提取统计信息（处理可能的字段名差异）
      const stats = {
        volume24h: statsData?.volume24hUsd || statsData?.volume24h || statsData?.volume_24h || 0,
        volumeTotal: statsData?.volumeTotalUsd || statsData?.volumeTotal || statsData?.totalVolume || 0,
        liquidity: statsData?.totalLiquidityUsd || statsData?.liquidity || statsData?.totalLiquidity || 0,
        yesPrice,
        noPrice,
      };
      
      cacheService.set(cacheKey, stats, this.CACHE_TTL_STATS);
      return stats;
    } catch (error: any) {
      // 不再打印错误堆栈，避免刷屏
      if (error.response?.status === 404) {
        console.log(`[Predict] Stats not found for market ${marketId}`);
      } else if (error.response?.status === 429) {
        console.warn(`[Predict] Rate limited when fetching stats for market ${marketId}`);
      }
      return null;
    }
  }

  /**
   * 批量获取市场统计数据（volume/liquidity）
   * 用于定时任务获取所有市场的统计信息
   * 严格限制并发，避免触发速率限制
   */
  async batchGetMarketStats(marketIds: (string | number)[]): Promise<Map<string, { volume24h: number; volumeTotal: number; liquidity: number }>> {
    const results = new Map<string, { volume24h: number; volumeTotal: number; liquidity: number }>();
    
    console.log(`[Predict] Batch fetching stats for ${marketIds.length} markets`);
    
    // 严格限制并发：一次只处理 3 个，907f免触发 240 req/min 限制 (4 req/sec)
    const CONCURRENCY = 3;
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < marketIds.length; i += CONCURRENCY) {
      const batch = marketIds.slice(i, i + CONCURRENCY);
      
      await Promise.all(
        batch.map(async (marketId) => {
          try {
            // 直接调用 API 获取 stats
            const response = await this.client.get<any>(`/markets/${marketId}/stats`);
            const data = response.data || response;
            
            if (data && (data.volumeTotalUsd || data.volume24hUsd || data.totalLiquidityUsd)) {
              const stats = {
                volume24h: data.volume24hUsd || 0,
                volumeTotal: data.volumeTotalUsd || 0,
                liquidity: data.totalLiquidityUsd || 0,
              };
              results.set(String(marketId), stats);
              cacheService.set(`predict-stats-${marketId}`, { ...stats, yesPrice: 0.5, noPrice: 0.5 }, this.CACHE_TTL_STATS);
              successCount++;
            } else {
              errorCount++;
            }
          } catch (error: any) {
            errorCount++;
            if (error.response?.status === 429) {
              console.warn(`[Predict] Rate limited for market ${marketId}`);
            }
          }
        })
      );
      
      // 批次间延迟
      if (i + CONCURRENCY < marketIds.length) {
        await this.delay(this.REQUEST_DELAY);
      }
    }
    
    console.log(`[Predict] Batch stats fetched: ${results.size}/${marketIds.length} (success: ${successCount}, errors: ${errorCount})`);
    return results;
  }

  /**
   * 获取订单簿
   * 严格遵循 API 文档: GET /v1/markets/{id}/orderbook
   */
  async getOrderbook(marketId: string | number): Promise<Orderbook> {
    const cacheKey = `predict-orderbook-${marketId}`;
    const cached = cacheService.get<Orderbook>(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.client.get<any>(`/markets/${marketId}/orderbook`);
      
      // 处理可能的包装格式
      const orderbookData = data.data || data;
      
      // 转换格式为标准Orderbook
      // 注意：API 返回的 bids/asks 格式可能是 [[price, size], ...] 或 [{price, size}, ...]
      const parseOrders = (orders: any[]): { price: number; size: number }[] => {
        if (!Array.isArray(orders)) return [];
        return orders.map((o: any) => {
          if (Array.isArray(o)) {
            return { price: parseFloat(o[0]), size: parseFloat(o[1]) };
          } else if (typeof o === 'object' && o !== null) {
            return { price: parseFloat(o.price), size: parseFloat(o.size) };
          }
          return { price: 0, size: 0 };
        }).filter(o => o.price > 0);
      };

      const orderbook: Orderbook = {
        bids: parseOrders(orderbookData.bids),
        asks: parseOrders(orderbookData.asks),
        timestamp: Date.now(),
      };

      cacheService.set(cacheKey, orderbook, this.CACHE_TTL_PRICES);
      return orderbook;
    } catch (error) {
      console.error(`[Predict] Error fetching orderbook for market ${marketId}:`, error);
      return { bids: [], asks: [], timestamp: Date.now() };
    }
  }

  /**
   * 搜索市场
   * 严格遵循 API 文档: GET /v1/search?q={query}
   */
  async searchMarkets(query: string): Promise<PredictMarket[]> {
    const cacheKey = `predict-search-${query}`;
    const cached = cacheService.get<PredictMarket[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.get<{ data?: PredictMarket[]; success?: boolean }>(`/search?q=${encodeURIComponent(query)}`);
      const data = response.data || (response as any) || [];
      cacheService.set(cacheKey, data, this.CACHE_TTL_MARKETS);
      return data;
    } catch (error) {
      console.error('[Predict] Error searching markets:', error);
      return [];
    }
  }

  /**
   * 批量获取市场价格（带并发控制）
   * 严格限制并发数量，避免触发速率限制
   */
  async batchGetMarketPrices(marketIds: (string | number)[]): Promise<Map<string | number, { yesPrice: number; noPrice: number }>> {
    const results = new Map<string | number, { yesPrice: number; noPrice: number }>();
    
    console.log(`[Predict] Batch fetching prices for ${marketIds.length} markets`);
    
    // 严格限制并发：一次只处理 5 个，避免触发 240 req/min 限制
    const CONCURRENCY = 5;
    
    for (let i = 0; i < marketIds.length; i += CONCURRENCY) {
      const batch = marketIds.slice(i, i + CONCURRENCY);
      
      const batchResults = await Promise.all(
        batch.map(async (marketId) => {
          try {
            const stats = await this.getMarketStats(marketId);
            if (stats) {
              return { marketId, ...stats };
            }
            return null;
          } catch (error) {
            return null;
          }
        })
      );
      
      batchResults.forEach((result) => {
        if (result) {
          results.set(result.marketId, { 
            yesPrice: result.yesPrice, 
            noPrice: result.noPrice 
          });
        }
      });
      
      // 批次间延迟，确保不触发速率限制
      if (i + CONCURRENCY < marketIds.length) {
        await this.delay(this.REQUEST_DELAY);
      }
    }
    
    console.log(`[Predict] Batch prices fetched: ${results.size}/${marketIds.length}`);
    return results;
  }

  /**
   * 后台静默更新
   */
  async backgroundUpdate(): Promise<{ updated: number; added: number; removed: number }> {
    console.log(`[Predict] Starting background update...`);
    const startTime = Date.now();
    
    const oldMarkets = cacheService.get<PredictMarket[]>('predict-all-markets-v4') || [];
    const oldMap = new Map(oldMarkets.map(m => [m.id, m]));
    
    const { markets: newMarkets } = await this.getAllMarkets(true);
    const newMap = new Map(newMarkets.map(m => [m.id, m]));
    
    let updated = 0, added = 0, removed = 0;
    
    for (const [id, newMarket] of newMap) {
      const oldMarket = oldMap.get(id);
      if (!oldMarket) {
        added++;
      } else if (
        oldMarket.status !== newMarket.status ||
        oldMarket.tradingStatus !== newMarket.tradingStatus
      ) {
        updated++;
      }
    }
    
    for (const id of oldMap.keys()) {
      if (!newMap.has(id)) {
        removed++;
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[Predict] Background update: +${added}, ~${updated}, -${removed} in ${duration}ms`);
    
    return { updated, added, removed };
  }

  /**
   * 转换为统一市场格式
   * ⚠️ 重要变更：不再自动获取 stats，避免触发速率限制
   * 价格字段使用默认值，需要价格时调用方应使用 batchGetMarketPrices
   */
  toUnifiedMarket(market: PredictMarket): UnifiedMarket {
    // 获取正确的 URL slug
    let urlSlug: string;
    if (market.categoryId && this.categorySlugMap.has(market.categoryId)) {
      urlSlug = this.categorySlugMap.get(market.categoryId)!;
    } else if (market.categorySlug) {
      urlSlug = market.categorySlug;
    } else {
      urlSlug = market.title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
    }

    // 获取父事件标题
    // 注意：/markets 返回的 categorySlug 是子市场的 slug，不是父事件的 slug
    let parentTitle: string | undefined;
    
    // 方法1: 最可靠 - 使用 categoryId 查找（和 URL slug 查找用同一个 key）
    const categoryId = market.categoryId || (market as any).category;
    if (categoryId) {
      parentTitle = this.categoryTitleMap.get(categoryId);
    }
    
    // 方法2: 备用 - 通过子市场 ID 查找父标题（从 /categories 的 markets 列表建立）
    if (!parentTitle) {
      parentTitle = this.marketIdToParentTitleMap.get(String(market.id));
    }
    
    // 方法3: 备用 - 如果 slug 是从 categorySlugMap 获取的（即通过 categoryId 找到的），
    // 那说明这个 slug 就是父事件的 slug，可以直接查标题
    if (!parentTitle && market.categoryId && this.categorySlugMap.has(market.categoryId)) {
      const parentSlug = this.categorySlugMap.get(market.categoryId);
      if (parentSlug) {
        parentTitle = this.categorySlugToTitleMap.get(parentSlug);
      }
    }
    
    // 方法4: 最终备用 - 使用 URL slug 转换为可读标题
    // 例如: "2026-winter-olympics-most-medals" → "2026 Winter Olympics Most Medals"
    if (!parentTitle && urlSlug) {
      parentTitle = urlSlug
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
    }
    
    // 调试：打印前几个市场的映射情况
    if (Math.random() < 0.005) {  // 只打印 0.5% 的数据避免刷屏
      console.log(`[Predict] Market mapping: id=${market.id}, title="${market.title}", parentTitle="${parentTitle}"`);
    }

    // 正确的父子关系：
    // - question: 父事件问题（大字显示）
    // - title: 子事件标签（小字显示）
    const eventQuestion = market.question || parentTitle || market.title;
    const childTitle = market.title !== eventQuestion ? market.title : undefined;

    return {
      id: `predict-${market.id}`,
      source: 'predict',
      sourceId: market.id,
      conditionId: market.conditionId,
      categorySlug: market.categorySlug,
      parentTitle: eventQuestion,  // 父事件问题（大字）
      title: childTitle || market.title,  // 子事件标签（小字）
      description: market.description || '',
      url: `https://predict.fun/market/${urlSlug}`,
      isActive: market.status === 'REGISTERED',
      isTradable: market.status === 'REGISTERED' && market.tradingStatus === 'OPEN',
      // ⚠️ 使用默认价格，需要实时价格时请调用 batchGetMarketPrices
      yesPrice: 0.5,
      noPrice: 0.5,
      yesPriceChange24h: 0,
      noPriceChange24h: 0,
      // 如果市场数据中有交易量信息，直接使用
      volume24h: (market as any).volume24h || (market as any).volume24hUsd || 0,
      volumeTotal: (market as any).volume || (market as any).volumeTotal || 0,
      liquidity: (market as any).liquidity || (market as any).totalLiquidity || 0,
      lastUpdated: Date.now(),
      feeRate: 0.002,
      endDate: (market as any).endDate || (market as any).endsAt,
      polymarketConditionIds: Array.isArray((market as any).polymarketConditionIds)
        ? (market as any).polymarketConditionIds.map(String)
        : [],
    };
  }

  /**
   * 转换多个市场（不获取 stats）
   */
  toUnifiedMarkets(markets: PredictMarket[]): UnifiedMarket[] {
    return markets.map(m => this.toUnifiedMarket(m));
  }

  /**
   * 带价格的完整市场转换
   * 仅对前 N 个活跃市场获取价格，避免触发速率限制
   */
  async toUnifiedMarketsWithPrices(markets: PredictMarket[], maxPriceFetch: number = 50): Promise<UnifiedMarket[]> {
    const unified = this.toUnifiedMarkets(markets);
    
    // 只获取前 N 个活跃市场的价格
    const activeMarkets = unified
      .filter(m => m.isTradable)
      .slice(0, maxPriceFetch);
    
    if (activeMarkets.length === 0) {
      return unified;
    }
    
    console.log(`[Predict] Fetching prices for top ${activeMarkets.length} active markets...`);
    
    const prices = await this.batchGetMarketPrices(activeMarkets.map(m => m.sourceId));
    
    // 合并价格数据
    return unified.map(market => {
      const priceData = prices.get(market.sourceId);
      if (priceData) {
        return {
          ...market,
          yesPrice: priceData.yesPrice,
          noPrice: priceData.noPrice,
          lastUpdated: Date.now(),
        };
      }
      return market;
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 工厂函数
export const createPredictService = (apiKey: string): PredictService => {
  return new PredictService(apiKey);
};
