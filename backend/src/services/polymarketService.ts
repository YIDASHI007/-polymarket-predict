// Polymarket Service - 无过期缓存版本
// 架构：cache.json 永不过期，每10分钟通过API更新

import { createPolymarketClient, createPolymarketClobClient, ApiClient } from '../utils/apiClient';
import { cacheService } from '../utils/cache';
import { PolymarketMarket, PolymarketEvent, Orderbook, UnifiedMarket } from '../types';

export class PolymarketService {
  private client: ApiClient;
  private clobClient: ApiClient;
  private readonly REQUEST_DELAY = 50;

  constructor() {
    this.client = createPolymarketClient();
    this.clobClient = createPolymarketClobClient();
  }

  // ============ 核心：只读缓存（永不触发API） ============
  
  /**
   * 获取所有市场 - 只从缓存读取，永不调用API
   */
  getAllMarketsFromCache(): PolymarketMarket[] {
    const cacheKey = 'polymarket-active-markets-v2';
    
    // 1. 先尝试从内存缓存读取
    const cached = cacheService.get<PolymarketMarket[]>(cacheKey);
    if (cached) {
      console.log(`[Polymarket] Using memory cache: ${cached.length} markets`);
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
          console.log(`[Polymarket] Using file cache: ${fileCache.length} markets`);
          // 加载到内存缓存
          cacheService.set(cacheKey, fileCache);
          return fileCache;
        }
      }
    } catch (error) {
      console.error('[Polymarket] Failed to read file cache:', error);
    }
    
    return [];
  }

  // ============ 核心：通过API更新缓存（定时任务/手动刷新） ============
  
  /**
   * 从API抓取最新数据并更新缓存（耗时1-2分钟）
   * 定时任务每10分钟调用一次，或手动刷新按钮调用
   */
  async fetchFromAPI(): Promise<PolymarketMarket[]> {
    const cacheKey = 'polymarket-active-markets-v2';
    
    console.log('[Polymarket] Starting API fetch...');
    const startTime = Date.now();
    
    const allMarkets: PolymarketMarket[] = [];
    let offset = 0;
    const limit = 100;
    let pageCount = 0;
    const MAX_SAFETY_LIMIT = 10000;

    try {
      do {
        const markets = await this.fetchMarketsFromAPI(limit, offset);
        console.log(`[Polymarket] Page ${pageCount + 1}: Got ${markets.length} markets`);
        
        if (markets.length === 0) break;
        
        allMarkets.push(...markets);
        offset += limit;
        pageCount++;

        // 如果返回数量少于limit，说明已到最后一页
        if (markets.length < limit) {
          console.log(`[Polymarket] Last page reached (${markets.length} < ${limit})`);
          break;
        }

        if (allMarkets.length >= MAX_SAFETY_LIMIT) {
          console.warn(`[Polymarket] Reached safety limit (${MAX_SAFETY_LIMIT})`);
          break;
        }

        await this.delay(this.REQUEST_DELAY);
      } while (true);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[Polymarket] API fetch completed: ${allMarkets.length} markets in ${duration}s`);
      
      // 过滤：只保留高质量的市场
      const now = Date.now();
      const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000; // 7天后
      
      const filteredMarkets = allMarkets.filter(m => {
        // 1. 结束日期必须在未来（至少还有7天）
        if (m.endDate) {
          const endTime = new Date(m.endDate).getTime();
          if (endTime < sevenDaysFromNow) return false;
        }
        
        // 2. 必须有流动性
        const liquidity = parseFloat(String(m.liquidity || '0'));
        if (liquidity < 1000) return false;
        
        return true;
      });
      
      // 3. 按交易量排序，取前2000个
      const sortedMarkets = filteredMarkets
        .sort((a, b) => parseFloat(String(b.volume || '0')) - parseFloat(String(a.volume || '0')))
        .slice(0, 2000);
      
      console.log(`[Polymarket] Filtered: ${sortedMarkets.length}/${allMarkets.length} markets`);
      
      // 更新缓存（无TTL，永不过期）
      cacheService.set(cacheKey, sortedMarkets);
      
      return sortedMarkets;
    } catch (error) {
      console.error('[Polymarket] API fetch failed:', error);
      throw error;
    }
  }
  
  /**
   * 内部：从API获取单页市场（不读缓存）
   */
  private async fetchMarketsFromAPI(limit: number, offset: number): Promise<PolymarketMarket[]> {
    const params = { 
      limit: limit.toString(),
      offset: offset.toString(),
      active: 'true',
      closed: 'false',
      archived: 'false',
      liquidity_min: '1000',    // 提高最小流动性到$1000，过滤低质量市场
    };

    const queryString = new URLSearchParams(params).toString();
    return this.client.get<PolymarketMarket[]>(`/markets?${queryString}`);
  }

  // ============ 数据转换 ============
  
  toUnifiedMarkets(markets: PolymarketMarket[]): UnifiedMarket[] {
    return markets.map(m => this.marketToUnifiedMarket(m));
  }

  private normalizeClobTokenIds(raw: unknown): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.map(String).filter(Boolean);
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map(String).filter(Boolean);
        }
      } catch {
        // ignore parse error, fallback below
      }
      return raw
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((v) => v.replace(/^"+|"+$/g, '').trim())
        .filter(Boolean);
    }
    return [];
  }
  
  private marketToUnifiedMarket(market: PolymarketMarket): UnifiedMarket {
    // 父事件标题（大字显示）
    const eventTitle = market.events?.[0]?.title;
    // 子问题（小字标签显示）
    const question = market.question;
    // 正确的 URL 使用 events[0].ticker 或 events[0].slug
    const eventSlug = market.events?.[0]?.ticker || market.events?.[0]?.slug || market.slug;
    const clobTokenIds = this.normalizeClobTokenIds((market as any).clobTokenIds);
    
    return {
      id: `polymarket-${market.id}`,
      source: 'polymarket',
      sourceId: market.id,
      conditionId: market.conditionId || '',
      categorySlug: this.extractCategory(eventSlug),
      title: question || '',              // 子问题（小字标签）
      parentTitle: eventTitle || '',      // 父标题（大字显示）
      description: market.description || '',
      url: `https://polymarket.com/event/${eventSlug}`,
      isActive: market.active && !market.closed,
      isTradable: market.active && !market.closed,
      yesPrice: 0,
      noPrice: 0,
      yesPriceChange24h: 0,
      noPriceChange24h: 0,
      volume24h: 0,
      volumeTotal: market.volume || 0,
      liquidity: market.liquidity || 0,
      lastUpdated: Date.now(),
      feeRate: 0.002,
      clobTokenIds,
    };
  }
  
  private extractCategory(slug?: string): string | undefined {
    if (!slug) return undefined;
    const categories = ['crypto', 'bitcoin', 'ethereum', 'politics', 'sports', 'finance'];
    for (const cat of categories) {
      if (slug.includes(cat)) return cat;
    }
    return undefined;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // ============ 向后兼容的方法 ============
  
  /**
   * 获取所有市场（向后兼容，返回旧格式）
   */
  async getAllMarkets(): Promise<PolymarketMarket[]> {
    const cached = this.getAllMarketsFromCache();
    if (cached.length > 0) return cached;
    return this.fetchFromAPI();
  }
  
  /**
   * 获取单个市场（向后兼容）
   */
  async getMarkets(limit: number, offset: number): Promise<PolymarketMarket[]> {
    // 如果有完整缓存，直接返回切片
    const allMarkets = this.getAllMarketsFromCache();
    if (allMarkets.length > 0) {
      return allMarkets.slice(offset, offset + limit);
    }
    // 否则从API获取
    return this.fetchMarketsFromAPI(limit, offset);
  }
  
  /**
   * 获取Events（向后兼容，返回市场数据）
   */
  async getAllEvents(): Promise<PolymarketEvent[]> {
    const markets = this.getAllMarketsFromCache();
    // 将 Markets 转换为 Events 格式
    return markets.map(m => ({
      id: m.id,
      slug: m.slug || '',
      title: m.question || '',
      description: m.description || '',
      active: m.active,
      closed: m.closed,
      conditionId: m.conditionId,
      markets: [{
        ...m,
        clobTokenIds: (m as any).clobTokenIds,
      }],
      volume: m.volume,
      liquidity: m.liquidity,
      endDate: m.endDate,
    }));
  }
  
  /**
   * Events 转 UnifiedMarkets（向后兼容）
   */
  eventsToUnifiedMarkets(events: PolymarketEvent[]): UnifiedMarket[] {
    // 从 events 中提取 markets 并转换
    const allMarkets: PolymarketMarket[] = [];
    events.forEach(e => {
      if (e.markets) allMarkets.push(...e.markets);
    });
    return this.toUnifiedMarkets(allMarkets);
  }
  
  /**
   * 获取订单簿（向后兼容）
   */
  async getOrderbook(tokenId: string): Promise<any> {
    try {
      return await this.clobClient.get(`/book?token_id=${tokenId}`);
    } catch (error) {
      console.error(`[Polymarket] Failed to get orderbook for ${tokenId}:`, error);
      return { bids: [], asks: [] };
    }
  }
}

// 导出单例
export const polymarketService = new PolymarketService();
