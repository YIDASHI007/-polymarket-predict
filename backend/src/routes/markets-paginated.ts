import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createPredictService } from '../services/predictService';
import { polymarketService } from '../services/polymarketService';

interface PaginatedQuery {
  page?: string;
  limit?: string;
  search?: string;
  category?: string;
  source?: 'all' | 'predict' | 'polymarket';
  sortBy?: 'volume' | 'time' | 'price';
  sortOrder?: 'asc' | 'desc';
}

export async function paginatedMarketsRoutes(fastify: FastifyInstance) {
  // 分页获取所有市场（Predict + Polymarket 合并）
  fastify.get('/markets/paginated', async (
    request: FastifyRequest<{ Querystring: PaginatedQuery }>,
    reply: FastifyReply
  ) => {
    const apiKey = request.headers['x-api-key'] as string;
    const page = Math.max(1, parseInt(request.query.page || '1'));
    const limit = Math.min(50, Math.max(5, parseInt(request.query.limit || '20'))); // 5-50条/页
    const search = request.query.search || '';
    const category = request.query.category || '';
    const source = request.query.source || 'all';
    const sortBy = request.query.sortBy || 'volume';
    const sortOrder = request.query.sortOrder || 'desc';

    try {
      // 1. 从缓存获取全部市场（不调用API）
      let allMarkets: any[] = [];

      // Predict 数据（从后端缓存）
      if (source === 'all' || source === 'predict') {
        if (apiKey) {
          const predictService = createPredictService(apiKey);
          const predictResult = await predictService.getAllMarkets(false);
          const predictUnified = predictService.toUnifiedMarkets(predictResult.markets);
          allMarkets = [...allMarkets, ...predictUnified];
        }
      }

      // Polymarket 数据（从后端缓存）
      if (source === 'all' || source === 'polymarket') {
        const events = await polymarketService.getAllEvents();
        const polymarketUnified = polymarketService.eventsToUnifiedMarkets(events);
        allMarkets = [...allMarkets, ...polymarketUnified];
      }

      // 2. 搜索筛选
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

      // 3. 排序
      allMarkets.sort((a, b) => {
        let aVal = 0, bVal = 0;
        switch (sortBy) {
          case 'volume':
            aVal = a.volumeTotal || 0;
            bVal = b.volumeTotal || 0;
            break;
          case 'time':
            aVal = a.lastUpdated || 0;
            bVal = b.lastUpdated || 0;
            break;
          case 'price':
            aVal = a.yesPrice || 0;
            bVal = b.yesPrice || 0;
            break;
        }
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      });

      // 4. 分页
      const total = allMarkets.length;
      const start = (page - 1) * limit;
      const end = start + limit;
      const paginatedMarkets = allMarkets.slice(start, end);

      return {
        data: paginatedMarkets,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: end < total,
          hasPrev: page > 1,
        },
        filters: {
          search,
          category,
          source,
          sortBy,
          sortOrder,
        },
        timestamp: Date.now(),
      };
    } catch (error: any) {
      fastify.log.error('Error fetching paginated markets:', error.message);
      return reply.status(500).send({
        error: 'Failed to fetch markets',
        message: error.message,
      });
    }
  });

  // 获取总数（轻量接口，用于显示统计）
  fastify.get('/markets/count', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = request.headers['x-api-key'] as string;

    try {
      let predictCount = 0;
      let polymarketCount = 0;

      if (apiKey) {
        const predictService = createPredictService(apiKey);
        const predictResult = await predictService.getAllMarkets(false);
        predictCount = predictResult.markets.length;
      }

      const events = await polymarketService.getAllEvents();
      polymarketCount = events.length;

      return {
        predict: predictCount,
        polymarket: polymarketCount,
        total: predictCount + polymarketCount,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      fastify.log.error('Error fetching market counts:', error.message);
      return reply.status(500).send({
        error: 'Failed to fetch counts',
        message: error.message,
      });
    }
  });
}
