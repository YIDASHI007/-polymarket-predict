import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { polymarketService } from '../services/polymarketService';

interface GetMarketsQuery {
  limit?: string;
  offset?: string;
}

interface GetOrderbookQuery {
  tokenId: string;
}

export async function polymarketRoutes(fastify: FastifyInstance) {
  // 获取市场列表
  fastify.get('/markets', async (
    request: FastifyRequest<{ Querystring: GetMarketsQuery }>, 
    reply: FastifyReply
  ) => {
    const limit = parseInt(request.query.limit || '100');
    const offset = parseInt(request.query.offset || '0');

    try {
      const markets = await polymarketService.getMarkets(limit, offset);
      // 转换为统一格式
      const unifiedMarkets = polymarketService.toUnifiedMarkets(markets);
      return { 
        data: unifiedMarkets, 
        count: unifiedMarkets.length,
        timestamp: Date.now()
      };
    } catch (error: any) {
      fastify.log.error('Error fetching Polymarket markets:', error.message);
      return reply.status(500).send({ 
        error: 'Failed to fetch markets',
        message: error.message 
      });
    }
  });

  // 获取所有市场（使用 events endpoint 获取正确的 slug，动态获取全部）
  fastify.get('/markets/all', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 使用 getAllEvents 获取正确的 slug（动态获取全部）
      const events = await polymarketService.getAllEvents();
      // 转换为统一格式
      const unifiedMarkets = polymarketService.eventsToUnifiedMarkets(events);
      return { 
        data: unifiedMarkets, 
        count: unifiedMarkets.length,
        timestamp: Date.now()
      };
    } catch (error: any) {
      fastify.log.error('Error fetching all Polymarket markets:', error.message);
      return reply.status(500).send({ 
        error: 'Failed to fetch markets',
        message: error.message 
      });
    }
  });

  // 获取订单簿
  fastify.get('/orderbook', async (
    request: FastifyRequest<{ Querystring: GetOrderbookQuery }>, 
    reply: FastifyReply
  ) => {
    const { tokenId } = request.query;

    if (!tokenId) {
      return reply.status(400).send({ error: 'tokenId query parameter is required' });
    }

    try {
      const orderbook = await polymarketService.getOrderbook(tokenId);
      return orderbook;
    } catch (error: any) {
      fastify.log.error(`Error fetching orderbook for token ${tokenId}:`, error.message);
      return reply.status(500).send({ 
        error: 'Failed to fetch orderbook',
        message: error.message 
      });
    }
  });
}
