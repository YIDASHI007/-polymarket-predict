// 缓存联动市场接口 - V2 无过期版本
// 架构：后端 cache.json 永不过期，前端每10分钟05秒同步

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createPredictService } from '../services/predictService';
import { polymarketService } from '../services/polymarketService';
import { cacheService } from '../utils/cache';

interface CachedQuery {
  source?: 'all' | 'predict' | 'polymarket';
  search?: string;
}

// 全局定时任务状态
let lastBackendUpdate = 0;
let nextScheduledUpdate = 0;  // 下次自动更新时间
let isUpdating = false;
let updateStartTime = 0;
const UPDATE_TIMEOUT = 5 * 60 * 1000; // 5分钟超时保护
const TEN_MINUTES = 10 * 60 * 1000;   // 10分钟更新间隔

// 全局版本号（数据更新后递增）
// 如果缓存文件存在，使用文件修改时间作为初始版本号
let dataVersion = 0;
try {
  const fs = require('fs');
  const path = require('path');
  const cacheFile = path.join(process.cwd(), 'data', 'cache.json');
  if (fs.existsSync(cacheFile)) {
    const stats = fs.statSync(cacheFile);
    dataVersion = stats.mtimeMs; // 使用文件修改时间作为版本号
    console.log(`[Init] Cache file exists, version set to: ${dataVersion}`);
  }
} catch (e) {
  console.log('[Init] Failed to read cache file version');
}

export async function cachedMarketsRoutesV2(fastify: FastifyInstance) {
  
  // ============ 0. 版本号接口（前端检查数据是否更新） ============
  fastify.get('/version', async () => {
    return {
      version: dataVersion,
      lastUpdate: lastBackendUpdate,
      nextScheduledUpdate,  // 下次自动更新时间
      isUpdating,
    };
  });
  
  // ============ 1. 只读缓存接口（前端根据版本号决定是否拉取） ============
  fastify.get('/markets/cached', async (
    request: FastifyRequest<{ Querystring: CachedQuery }>,
    reply: FastifyReply
  ) => {
    const apiKey = request.headers['x-api-key'] as string;
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
        const searchLower = search.toLowerCase();
        allMarkets = allMarkets.filter(m => 
          m.title.toLowerCase().includes(searchLower) ||
          m.description?.toLowerCase().includes(searchLower)
        );
      }

      return {
        data: allMarkets,
        count: allMarkets.length,
        lastBackendUpdate,
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

  // ============ 2. 手动刷新接口（刷新按钮，1-2分钟） ============
  fastify.post('/markets/refresh', async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      return reply.status(401).send({ error: 'API Key required' });
    }

    // 超时保护：如果更新超过5分钟，自动重置状态
    if (isUpdating && Date.now() - updateStartTime > UPDATE_TIMEOUT) {
      console.log('[Refresh] Update timeout, resetting state');
      isUpdating = false;
    }

    if (isUpdating) {
      return reply.status(429).send({ 
        error: 'Update already in progress',
        message: '正在刷新中，请稍候...'
      });
    }

    isUpdating = true;
    updateStartTime = Date.now();
    console.log('[Refresh] Starting manual refresh from APIs...');

    try {
      // 先尝试 Predict
      console.log('[Refresh] Fetching Predict markets...');
      const predictService = createPredictService(apiKey);
      let predictMarkets: any[] = [];
      try {
        predictMarkets = await predictService.fetchFromAPI();
        console.log(`[Refresh] Predict done: ${predictMarkets.length} markets`);
      } catch (predictError: any) {
        console.error('[Refresh] Predict fetch failed:', predictError.message);
        // 如果 Predict 失败，尝试从缓存读取
        predictMarkets = predictService.getAllMarketsFromCache();
        console.log(`[Refresh] Using Predict cache: ${predictMarkets.length} markets`);
      }
      
      // 再尝试 Polymarket
      console.log('[Refresh] Fetching Polymarket markets...');
      let polymarketMarkets: any[] = [];
      try {
        polymarketMarkets = await polymarketService.fetchFromAPI();
        console.log(`[Refresh] Polymarket done: ${polymarketMarkets.length} markets`);
      } catch (polymarketError: any) {
        console.error('[Refresh] Polymarket fetch failed:', polymarketError.message);
        // 如果 Polymarket 失败，尝试从缓存读取
        polymarketMarkets = polymarketService.getAllMarketsFromCache();
        console.log(`[Refresh] Using Polymarket cache: ${polymarketMarkets.length} markets`);
      }

      lastBackendUpdate = Date.now();
      dataVersion = Date.now(); // 数据更新完成后递增版本号

      // 转换为统一格式并返回（与 GET /markets/cached 一致）
      const predictUnified = predictService.toUnifiedMarkets(predictMarkets);
      const polymarketUnified = polymarketService.toUnifiedMarkets(polymarketMarkets);
      const allMarkets = [...predictUnified, ...polymarketUnified];

      console.log(`[Refresh] Completed: ${predictMarkets.length} Predict + ${polymarketMarkets.length} Polymarket = ${allMarkets.length} total`);

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
      isUpdating = false;
      updateStartTime = 0;
    }
  });

  // ============ 3. 后端定时任务（每10分钟00秒） ============
  // 硬编码 API Key（作为 fallback）
  const FALLBACK_API_KEY = '2969c30f-820c-4daa-bbae-d1cca9d6d5f3';
  
  // 初始化下次更新时间
  nextScheduledUpdate = Date.now() + TEN_MINUTES;
  
  setInterval(async () => {
    console.log('[Scheduled] Starting backend cache update...');
    
    // 尝试从环境变量获取API Key，如果没有则使用 fallback
    const apiKey = process.env.PREDICT_FUN_API_KEY || FALLBACK_API_KEY;
    if (!apiKey) {
      console.log('[Scheduled] No API Key configured, skipping update');
      // 即使没有执行，也更新下次时间
      nextScheduledUpdate = Date.now() + TEN_MINUTES;
      return;
    }

    if (isUpdating) {
      console.log('[Scheduled] Update already in progress, skipping');
      nextScheduledUpdate = Date.now() + TEN_MINUTES;
      return;
    }

    isUpdating = true;
    
    try {
      const predictService = createPredictService(apiKey);
      
      await Promise.all([
        predictService.fetchFromAPI(),
        polymarketService.fetchFromAPI(),
      ]);
      
      lastBackendUpdate = Date.now();
      dataVersion = Date.now(); // 数据更新完成后递增版本号
      console.log('[Scheduled] Backend cache update completed, version:', dataVersion);
    } catch (error) {
      console.error('[Scheduled] Update failed:', error);
    } finally {
      isUpdating = false;
      // 更新下次计划更新时间
      nextScheduledUpdate = Date.now() + TEN_MINUTES;
    }
  }, TEN_MINUTES);
  
  // 启动时立即执行一次（如果缓存为空或者需要刷新）
  setTimeout(async () => {
    const predictCache = cacheService.get('predict-all-markets-v4');
    const polymarketCache = cacheService.get('polymarket-active-markets-v2');
    
    if (!predictCache || !polymarketCache) {
      console.log('[Startup] Cache empty, triggering initial fetch...');
      
      const apiKey = process.env.PREDICT_FUN_API_KEY || FALLBACK_API_KEY;
      if (!apiKey) {
        console.log('[Startup] No API Key available, skipping initial fetch');
        return;
      }
      
      isUpdating = true;
      try {
        const predictService = createPredictService(apiKey);
        
        await Promise.all([
          predictService.fetchFromAPI(),
          polymarketService.fetchFromAPI(),
        ]);
        
        lastBackendUpdate = Date.now();
        dataVersion = Date.now();
        console.log('[Startup] Initial fetch completed, version:', dataVersion);
      } catch (error) {
        console.error('[Startup] Initial fetch failed:', error);
      } finally {
        isUpdating = false;
      }
    } else {
      console.log('[Startup] Cache exists, skipping initial fetch');
    }
  }, 5000);
}
