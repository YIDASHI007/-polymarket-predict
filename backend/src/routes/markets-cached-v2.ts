// 缓存联动市场接口 - V2 无过期版本
// 架构：后端 cache.json 永不过期，前端每 10 分钟同步
//
// 注意：所有定时任务/启动 warmup 逻辑已拆分到 scheduler/marketRefresher.ts
// 本文件只负责 HTTP 路由。

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createPredictService } from '../services/predictService';
import { polymarketService } from '../services/polymarketService';
import {
  getSchedulerState,
  markManualUpdateStart,
  markManualUpdateEnd,
} from '../scheduler/marketRefresher';

interface CachedQuery {
  source?: 'all' | 'predict' | 'polymarket';
  search?: string;
}

export async function cachedMarketsRoutesV2(fastify: FastifyInstance) {
  // ============ 0. 版本号接口 ============
  fastify.get('/version', async () => {
    const s = getSchedulerState();
    return {
      version: s.dataVersion,
      lastUpdate: s.lastBackendUpdate,
      nextScheduledUpdate: s.nextScheduledUpdate,
      isUpdating: s.isUpdating,
    };
  });

  // ============ 1. 只读缓存接口 ============
  fastify.get(
    '/markets/cached',
    async (request: FastifyRequest<{ Querystring: CachedQuery }>, reply: FastifyReply) => {
      const apiKey = request.headers['x-api-key'] as string | undefined;
      const source = request.query.source || 'all';
      const search = request.query.search || '';

      try {
        let allMarkets: any[] = [];

        // Predict 数据 - 只从缓存读取
        if (source === 'all' || source === 'predict') {
          if (apiKey) {
            const predictService = createPredictService(apiKey);
            const predictMarkets = predictService.getAllMarketsFromCache();
            const predictUnified = predictService.toUnifiedMarkets(predictMarkets);
            allMarkets = [...allMarkets, ...predictUnified];
          }
        }

        // Polymarket 数据 - 只从缓存读取
        if (source === 'all' || source === 'polymarket') {
          const polymarketMarkets = polymarketService.getAllMarketsFromCache();
          const polymarketUnified = polymarketService.toUnifiedMarkets(polymarketMarkets);
          allMarkets = [...allMarkets, ...polymarketUnified];
        }

        // 搜索筛选
        if (search) {
          const q = search.toLowerCase();
          allMarkets = allMarkets.filter(
            (m) => m.title.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q)
          );
        }

        return {
          data: allMarkets,
          count: allMarkets.length,
          lastBackendUpdate: getSchedulerState().lastBackendUpdate,
          timestamp: Date.now(),
        };
      } catch (error: any) {
        fastify.log.error('Error fetching cached markets:', error.message);
        return reply.status(500).send({
          error: 'Failed to fetch markets from cache',
          message: error.message,
        });
      }
    }
  );

  // ============ 2. 手动刷新接口（刷新按钮，1-2 分钟） ============
  fastify.post('/markets/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      return reply.status(401).send({ error: 'API Key required' });
    }

    if (!markManualUpdateStart()) {
      return reply.status(429).send({
        error: 'Update already in progress',
        message: '正在刷新中，请稍候...',
      });
    }

    console.log('[Refresh] Starting manual refresh from APIs...');
    try {
      // Predict
      console.log('[Refresh] Fetching Predict markets...');
      const predictService = createPredictService(apiKey);
      let predictMarkets: any[] = [];
      try {
        predictMarkets = await predictService.fetchFromAPI();
        console.log(`[Refresh] Predict done: ${predictMarkets.length} markets`);
      } catch (predictError: any) {
        console.error('[Refresh] Predict fetch failed:', predictError.message);
        predictMarkets = predictService.getAllMarketsFromCache();
        console.log(`[Refresh] Using Predict cache: ${predictMarkets.length} markets`);
      }

      // Polymarket
      console.log('[Refresh] Fetching Polymarket markets...');
      let polymarketMarkets: any[] = [];
      try {
        polymarketMarkets = await polymarketService.fetchFromAPI();
        console.log(`[Refresh] Polymarket done: ${polymarketMarkets.length} markets`);
      } catch (polymarketError: any) {
        console.error('[Refresh] Polymarket fetch failed:', polymarketError.message);
        polymarketMarkets = polymarketService.getAllMarketsFromCache();
        console.log(`[Refresh] Using Polymarket cache: ${polymarketMarkets.length} markets`);
      }

      const predictUnified = predictService.toUnifiedMarkets(predictMarkets);
      const polymarketUnified = polymarketService.toUnifiedMarkets(polymarketMarkets);
      const allMarkets = [...predictUnified, ...polymarketUnified];

      console.log(
        `[Refresh] Completed: ${predictMarkets.length} Predict + ${polymarketMarkets.length} Polymarket = ${allMarkets.length} total`
      );

      return {
        data: allMarkets,
        count: allMarkets.length,
        predict: predictMarkets.length,
        polymarket: polymarketMarkets.length,
        source: 'api',
        timestamp: Date.now(),
      };
    } catch (error: any) {
      console.error('[Refresh] Unexpected error:', error);
      return reply.status(500).send({
        error: 'Failed to refresh markets',
        message: error.message,
      });
    } finally {
      markManualUpdateEnd();
    }
  });
}
