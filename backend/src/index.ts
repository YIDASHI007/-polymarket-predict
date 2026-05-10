import fastify from 'fastify';
import cors from '@fastify/cors';

import { env, logEnvSummary } from './config/env';
import { predictRoutes } from './routes/predict';
import { polymarketRoutes } from './routes/polymarket';
import { arbitrageRoutes } from './routes/arbitrage';
import { paginatedMarketsRoutes } from './routes/markets-paginated';
import { cachedMarketsRoutesV2 } from './routes/markets-cached-v2';
import { realtimePairsRoutes } from './routes/realtime-pairs';
import { createPredictService } from './services/predictService';
import { polymarketService } from './services/polymarketService';
import { startMarketRefresher } from './scheduler/marketRefresher';

// 兼容旧的 /health dataAge 逻辑
const AUTO_REFRESH_INTERVAL = 10 * 60 * 1000;
let lastRefreshTime = 0;
let refreshTimer: NodeJS.Timeout | null = null;

const app = fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// 注册 CORS
app.register(cors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'x-predict-api-key', 'x-polymarket-api-key'],
});

// 注册路由
app.register(predictRoutes, { prefix: '/api/predict' });
app.register(polymarketRoutes, { prefix: '/api/polymarket' });
app.register(arbitrageRoutes, { prefix: '/api/arbitrage' });
app.register(paginatedMarketsRoutes, { prefix: '/api' });
app.register(cachedMarketsRoutesV2, { prefix: '/api' });
app.register(realtimePairsRoutes, { prefix: '/api/realtime-pairs' });

// 根路径
app.get('/', async () => ({
  name: 'Arbitrage Monitor API',
  version: '1.0.0',
  endpoints: {
    health: '/health',
    predict: '/api/predict',
    polymarket: '/api/polymarket',
    arbitrage: '/api/arbitrage',
    paginated: '/api/markets/paginated',
    realtimePairs: '/api/realtime-pairs/cards',
  },
}));

// 错误处理
app.setErrorHandler((error: any, _request, reply) => {
  app.log.error(error);
  reply.status(500).send({
    error: 'Internal Server Error',
    message: error.message,
  });
});

/**
 * 兼容性自动刷新任务（/health 用到 lastRefreshTime）。
 * 真正的缓存刷新已经交给 scheduler/marketRefresher。
 */
async function autoRefreshMarkets() {
  const apiKey = env.PREDICT_FUN_API_KEY;

  try {
    app.log.info('Starting auto-refresh of market data...');

    if (apiKey) {
      const predictService = createPredictService(apiKey);
      const { markets: predictMarkets, isFresh } = await predictService.getAllMarkets(true);
      app.log.info(`Predict.fun refreshed: ${predictMarkets.length} markets (fresh: ${isFresh})`);
    } else {
      app.log.warn('No PREDICT_FUN_API_KEY configured, skipping Predict.fun refresh');
    }

    const polymarketMarkets = await polymarketService.fetchFromAPI();
    app.log.info(`Polymarket refreshed: ${polymarketMarkets.length} markets`);

    lastRefreshTime = Date.now();
    app.log.info('Auto-refresh completed successfully');
  } catch (error: any) {
    app.log.error(`Auto-refresh failed: ${error.message}`);
  }
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(autoRefreshMarkets, AUTO_REFRESH_INTERVAL);
  app.log.info(`Auto-refresh scheduled every ${AUTO_REFRESH_INTERVAL / 60000} minutes`);
}

// 健康检查
app.get('/health', async () => ({
  status: 'ok',
  timestamp: Date.now(),
  uptime: process.uptime(),
  dataAge: lastRefreshTime > 0 ? Date.now() - lastRefreshTime : null,
  lastRefresh: lastRefreshTime,
}));

// 启动服务器
const start = async () => {
  try {
    logEnvSummary(app.log);

    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Server running on http://${env.HOST}:${env.PORT}`);

    // 启动缓存调度器
    startMarketRefresher();

    // 兼容性：保留原有的 /health dataAge 刷新
    startAutoRefresh();
    await autoRefreshMarkets();
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// 优雅关闭
process.on('SIGTERM', () => {
  app.log.info('SIGTERM received, closing server...');
  if (refreshTimer) clearInterval(refreshTimer);
  app.close();
});

process.on('SIGINT', () => {
  app.log.info('SIGINT received, closing server...');
  if (refreshTimer) clearInterval(refreshTimer);
  app.close();
});

start();
