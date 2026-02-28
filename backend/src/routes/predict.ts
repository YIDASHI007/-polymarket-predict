import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createPredictService } from '../services/predictService';

interface GetMarketsQuery {
  cursor?: string;
}

interface GetOrderbookParams {
  id: string;
}

export async function predictRoutes(fastify: FastifyInstance) {
  // 获取市场列表 (支持分页)
  fastify.get('/markets', async (request: FastifyRequest<{ Querystring: GetMarketsQuery }>, reply: FastifyReply) => {
    const apiKey = request.headers['x-api-key'] as string;
    const { cursor } = request.query;

    if (!apiKey) {
      return reply.status(401).send({ error: 'API Key required in x-api-key header' });
    }

    try {
      const service = createPredictService(apiKey);
      const data = await service.getMarkets(cursor);
      return data;
    } catch (error: any) {
      fastify.log.error('Error fetching Predict.fun markets:', error.message);
      return reply.status(500).send({ 
        error: 'Failed to fetch markets',
        message: error.message 
      });
    }
  });

  // 获取所有市场 (动态分页，获取全部)
  // ⚠️ 优化：只获取前 50 个活跃市场的价格，避免触发速率限制
  fastify.get('/markets/all', async (request: FastifyRequest<{ Querystring: { forceRefresh?: string; clientVersion?: string; withPrices?: string; maxPriceFetch?: string } }>, reply: FastifyReply) => {
    const apiKey = request.headers['x-api-key'] as string;
    const forceRefresh = request.query.forceRefresh === 'true';
    const clientVersion = parseInt(request.query.clientVersion || '0');
    const withPrices = request.query.withPrices === 'true';
    const maxPriceFetch = parseInt(request.query.maxPriceFetch || '50');

    if (!apiKey) {
      return reply.status(401).send({ error: 'API Key required in x-api-key header' });
    }

    try {
      const service = createPredictService(apiKey);
      
      // 检查版本号
      const serverVersion = service.getVersion();
      if (!forceRefresh && clientVersion >= serverVersion) {
        return {
          data: [],
          count: 0,
          version: serverVersion,
          isFresh: false,
          message: 'Data is up to date',
          timestamp: Date.now()
        };
      }
      
      // 动态获取全部市场
      const { markets, version, isFresh, isFirstFetch } = await service.getAllMarkets(forceRefresh);
      
      // 转换为统一格式
      let unifiedMarkets: any[];
      
      if (withPrices && markets.length > 0) {
        // 获取前 N 个市场的价格（避免触发速率限制）
        unifiedMarkets = await service.toUnifiedMarketsWithPrices(markets, maxPriceFetch);
      } else {
        // 不获取价格，使用默认值
        unifiedMarkets = service.toUnifiedMarkets(markets);
      }
      
      return { 
        data: unifiedMarkets, 
        count: unifiedMarkets.length,
        version,
        isFresh,
        isFirstFetch,
        pricesFetched: withPrices ? Math.min(markets.length, maxPriceFetch) : 0,
        timestamp: Date.now()
      };
    } catch (error: any) {
      fastify.log.error('Error fetching all Predict.fun markets:', error.message);
      return reply.status(500).send({ 
        error: 'Failed to fetch markets',
        message: error.message 
      });
    }
  });

  // 获取单个市场详情（包含价格）
  fastify.get('/markets/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const apiKey = request.headers['x-api-key'] as string;
    const { id } = request.params;

    if (!apiKey) {
      return reply.status(401).send({ error: 'API Key required in x-api-key header' });
    }

    try {
      const service = createPredictService(apiKey);
      
      // 获取市场详情
      const market = await service.getMarketById(id);
      if (!market) {
        return reply.status(404).send({ error: 'Market not found' });
      }
      
      // 转换为统一格式
      let unified = service.toUnifiedMarket(market);
      
      // 获取价格信息
      const stats = await service.getMarketStats(id);
      if (stats) {
        unified = {
          ...unified,
          yesPrice: stats.yesPrice,
          noPrice: stats.noPrice,
          volume24h: stats.volume24h || unified.volume24h,
          volumeTotal: stats.volumeTotal || unified.volumeTotal,
          liquidity: stats.liquidity || unified.liquidity,
          lastUpdated: Date.now(),
        };
      }
      
      return {
        data: unified,
        timestamp: Date.now()
      };
    } catch (error: any) {
      fastify.log.error(`Error fetching market ${id}:`, error.message);
      return reply.status(500).send({ 
        error: 'Failed to fetch market',
        message: error.message 
      });
    }
  });

  // 检查更新（用于前端轮询）
  fastify.get('/markets/check-update', async (request: FastifyRequest<{ Querystring: { clientVersion: string } }>, reply: FastifyReply) => {
    const apiKey = request.headers['x-api-key'] as string;
    const clientVersion = parseInt(request.query.clientVersion || '0');

    if (!apiKey) {
      return reply.status(401).send({ error: 'API Key required in x-api-key header' });
    }

    try {
      const service = createPredictService(apiKey);
      const { hasUpdate, version } = service.checkUpdate(clientVersion);
      return {
        hasUpdate,
        version,
        timestamp: Date.now()
      };
    } catch (error: any) {
      fastify.log.error('Error checking update:', error.message);
      return reply.status(500).send({ error: 'Failed to check update' });
    }
  });

  // 后台刷新接口（手动触发）
  fastify.post('/markets/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      return reply.status(401).send({ error: 'API Key required in x-api-key header' });
    }

    try {
      const service = createPredictService(apiKey);
      const result = await service.backgroundUpdate();
      return {
        success: true,
        ...result,
        version: service.getVersion(),
        timestamp: Date.now()
      };
    } catch (error: any) {
      fastify.log.error('Error refreshing markets:', error.message);
      return reply.status(500).send({ error: 'Failed to refresh markets' });
    }
  });

  // 搜索市场
  fastify.get('/search', async (request: FastifyRequest<{ Querystring: { q: string } }>, reply: FastifyReply) => {
    const apiKey = request.headers['x-api-key'] as string;
    const { q } = request.query;

    if (!apiKey) {
      return reply.status(401).send({ error: 'API Key required in x-api-key header' });
    }

    if (!q) {
      return reply.status(400).send({ error: 'Query parameter q is required' });
    }

    try {
      const service = createPredictService(apiKey);
      const markets = await service.searchMarkets(q);
      return { 
        data: markets, 
        count: markets.length,
        timestamp: Date.now()
      };
    } catch (error: any) {
      fastify.log.error('Error searching Predict.fun markets:', error.message);
      return reply.status(500).send({ 
        error: 'Failed to search markets',
        message: error.message 
      });
    }
  });

  // 获取订单簿
  fastify.get('/markets/:id/orderbook', async (
    request: FastifyRequest<{ Params: GetOrderbookParams }>, 
    reply: FastifyReply
  ) => {
    const apiKey = request.headers['x-api-key'] as string;
    const { id } = request.params;

    if (!apiKey) {
      return reply.status(401).send({ error: 'API Key required in x-api-key header' });
    }

    try {
      const service = createPredictService(apiKey);
      const orderbook = await service.getOrderbook(id);
      return orderbook;
    } catch (error: any) {
      fastify.log.error(`Error fetching orderbook for market ${id}:`, error.message);
      return reply.status(500).send({ 
        error: 'Failed to fetch orderbook',
        message: error.message 
      });
    }
  });

  // 批量刷新市场价格（使用新的并发控制）
  fastify.post('/markets/refresh-prices', async (request: FastifyRequest<{ Body: { marketIds: string[] | number[] } }>, reply: FastifyReply) => {
    const apiKey = request.headers['x-api-key'] as string;
    const { marketIds } = request.body;

    if (!apiKey) {
      return reply.status(401).send({ error: 'API Key required in x-api-key header' });
    }

    if (!marketIds || !Array.isArray(marketIds) || marketIds.length === 0) {
      return reply.status(400).send({ error: 'marketIds array is required' });
    }

    // 限制批量数量
    if (marketIds.length > 100) {
      return reply.status(400).send({ error: 'Maximum 100 marketIds allowed per request' });
    }

    try {
      const service = createPredictService(apiKey);
      // 使用新的批量获取方法（带并发控制）
      const prices = await service.batchGetMarketPrices(marketIds);
      return { 
        data: Object.fromEntries(prices), 
        count: prices.size,
        timestamp: Date.now()
      };
    } catch (error: any) {
      fastify.log.error('Error refreshing market prices:', error.message);
      return reply.status(500).send({ 
        error: 'Failed to refresh prices',
        message: error.message 
      });
    }
  });

  // 获取单个市场价格
  fastify.get('/markets/:id/price', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const apiKey = request.headers['x-api-key'] as string;
    const { id } = request.params;

    if (!apiKey) {
      return reply.status(401).send({ error: 'API Key required in x-api-key header' });
    }

    try {
      const service = createPredictService(apiKey);
      const stats = await service.getMarketStats(id);
      
      if (!stats) {
        return reply.status(404).send({ error: 'Price data not available' });
      }
      
      return {
        data: {
          marketId: id,
          yesPrice: stats.yesPrice,
          noPrice: stats.noPrice,
          volume24h: stats.volume24h,
          volumeTotal: stats.volumeTotal,
          liquidity: stats.liquidity,
        },
        timestamp: Date.now()
      };
    } catch (error: any) {
      fastify.log.error(`Error fetching price for market ${id}:`, error.message);
      return reply.status(500).send({ 
        error: 'Failed to fetch price',
        message: error.message 
      });
    }
  });

  // 获取所有 Categories
  fastify.get('/categories', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      return reply.status(401).send({ error: 'API Key required in x-api-key header' });
    }

    try {
      const service = createPredictService(apiKey);
      const categories = await service.getCategories();
      return { 
        data: categories, 
        count: categories.length,
        timestamp: Date.now()
      };
    } catch (error: any) {
      fastify.log.error('Error fetching Predict.fun categories:', error.message);
      return reply.status(500).send({ 
        error: 'Failed to fetch categories',
        message: error.message 
      });
    }
  });
}
