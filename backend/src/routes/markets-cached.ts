// 市场缓存接口 - 前后端缓存联动架构
// 1. /cached - 从后端 cache.json 快速读取（秒开）
// 2. /refresh - 强制调用 API 更新（1-2分钟）

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createPredictService } from '../services/predictService';
import { polymarketService } from '../services/polymarketService';

interface CachedQuery {
  source?: 'all' | 'predict' | 'polymarket';
  search?: string;
  category?: string;
}

export async function cachedMarketsRoutes(fastify: FastifyInstance) {
  
  // 1. 从后端缓存快速读取（秒开，用于首次加载和加载更多）
  fastify.get('/markets/cached', async (
    request: FastifyRequest<{ Querystring: CachedQuery }>,
    reply: FastifyReply
  ) => {
    const apiKey = request.headers['x-api-key'] as string;
    const source = request.query.source || 'all';
    const search = request.query.search || '';
    const category = request.query.category || '';

    try {
      let allMarkets: any[] = [];

      // Predict 数据 - 从后端缓存读取（不调用 API）
      if (source === 'all' || source === 'predict') {
        if (apiKey) {
          const predictService = createPredictService(apiKey);
          // 关键：使用 false 表示不强制刷新，优先从 cache.json 读取
          const predictResult = await predictService.getAllMarkets(false);
          const predictUnified = predictService.toUnifiedMarkets(predictResult.markets);
          allMarkets = [...allMarkets, ...predictUnified];
        }
      }

      // Polymarket 数据 - 从后端缓存读取
      if (source === 'all' || source === 'polymarket') {
        // 使用 getAllMarkets 获取全部数据（会从缓存读取）
        const markets = await polymarketService.getAllMarkets();
        const polymarketUnified = polymarketService.toUnifiedMarkets(markets);
        allMarkets = [...allMarkets, ...polymarketUnified];
      }

      // 筛选
      if (search) {
        const searchLower = search.toLowerCase();
        allMarkets = allMarkets.filter(m => 
          m.title.toLowerCase().includes(searchLower) ||
          m.description?.toLowerCase().includes(searchLower) ||
          m.parentTitle?.toLowerCase().includes(searchLower)
        );
      }

      if (category) {
        allMarkets = allMarkets.filter(m => m.categorySlug === category);
      }

      return {
        data: allMarkets,
        count: allMarkets.length,
        source: 'cache', // 标记数据来源是缓存
        timestamp: Date.now(),
      };
    } catch (error: any) {
      fastify.log.error('Error fetching cached markets:', error.message);
      return reply.status(500).send({
        error: 'Failed to fetch markets from cache',
        message: error.message,
      });
    }
  });

  // 2. 强制刷新 - 调用 API 获取最新数据（1-2分钟）
  fastify.post('/markets/refresh', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      return reply.status(401).send({ error: 'API Key required in x-api-key header' });
    }

    try {
      console.log('[Refresh] Starting forced refresh from APIs...');
      
      // 强制刷新 Predict 数据（调用 API）
      const predictService = createPredictService(apiKey);
      const predictResult = await predictService.getAllMarkets(true); // true = force refresh
      const predictUnified = predictService.toUnifiedMarkets(predictResult.markets);

      // 强制刷新 Polymarket 数据（调用 API）
      // 注意：polymarketService 没有 forceRefresh 参数，需要手动清除缓存
      const cacheKey = 'polymarket-active-events';
      const { cacheService } = await import('../utils/cache');
      cacheService.del(cacheKey);
      const events = await polymarketService.getAllEvents(); // 会重新从 API 获取
      const polymarketUnified = polymarketService.eventsToUnifiedMarkets(events);

      const allMarkets = [...predictUnified, ...polymarketUnified];

      console.log(`[Refresh] Completed: ${predictUnified.length} Predict + ${polymarketUnified.length} Polymarket = ${allMarkets.length} total`);

      return {
        data: allMarkets,
        count: allMarkets.length,
        source: 'api', // 标记数据来源是实时 API
        timestamp: Date.now(),
      };
    } catch (error: any) {
      fastify.log.error('Error refreshing markets:', error.message);
      return reply.status(500).send({
        error: 'Failed to refresh markets',
        message: error.message,
      });
    }
  });

  // 3. 检查后端缓存状态
  fastify.get('/markets/cache-status', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { cacheService } = await import('../utils/cache');
      const keys = cacheService.keys();
      
      const predictKey = 'predict-all-markets-v4';
      const polymarketKey = 'polymarket-active-events';
      
      const predictCached = keys.includes(predictKey);
      const polymarketCached = keys.includes(polymarketKey);
      
      return {
        hasPredictCache: predictCached,
        hasPolymarketCache: polymarketCached,
        totalKeys: keys.length,
        keys: keys.filter(k => k.includes('predict') || k.includes('polymarket')),
        timestamp: Date.now(),
      };
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });
}
