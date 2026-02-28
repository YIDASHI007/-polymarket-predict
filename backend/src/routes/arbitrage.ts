import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createPredictService } from '../services/predictService';
import { polymarketService } from '../services/polymarketService';
import { arbitrageService } from '../services/arbitrageService';
import { ArbitrageSettings } from '../types';

interface GetOpportunitiesQuery {
  minProfit?: string;
  maxProfit?: string;
  minConfidence?: 'high' | 'medium' | 'low';
  minLiquidity?: string;
  minVolume24h?: string;
}

export async function arbitrageRoutes(fastify: FastifyInstance) {
  // 获取套利机会
  fastify.get('/opportunities', async (
    request: FastifyRequest<{ Querystring: GetOpportunitiesQuery }>, 
    reply: FastifyReply
  ) => {
    const predictApiKey = request.headers['x-predict-api-key'] as string;
    const polymarketApiKey = request.headers['x-polymarket-api-key'] as string;
    
    const {
      minProfit = '1.5',
      maxProfit = '100',
      minConfidence = 'medium',
      minLiquidity = '0',
      minVolume24h = '0',
    } = request.query;

    if (!predictApiKey) {
      return reply.status(401).send({ error: 'Predict.fun API Key required in x-predict-api-key header' });
    }

    try {
      // 并行获取两个平台的市场
      const [predictMarketsRaw, polymarketMarketsRaw] = await Promise.all([
        createPredictService(predictApiKey).getAllMarkets(),
        polymarketService.getAllMarkets(),
      ]);

      // 转换为统一格式
      const predictService = createPredictService(predictApiKey);
      const predictMarkets = await predictService.toUnifiedMarkets(predictMarketsRaw.markets);
      const polymarketMarkets = polymarketService.toUnifiedMarkets(polymarketMarketsRaw);

      // 计算套利机会
      const settings: ArbitrageSettings = {
        minProfitPercent: parseFloat(minProfit),
        maxProfitPercent: parseFloat(maxProfit),
        minConfidence,
        minLiquidity: parseFloat(minLiquidity),
        minVolume24h: parseFloat(minVolume24h),
      };

      const opportunities = arbitrageService.findOpportunities(
        predictMarkets,
        polymarketMarkets,
        settings
      );

      const stats = arbitrageService.getStats(opportunities);

      return {
        data: opportunities,
        count: opportunities.length,
        stats,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      fastify.log.error('Error calculating arbitrage opportunities:', error.message);
      return reply.status(500).send({ 
        error: 'Failed to calculate arbitrage opportunities',
        message: error.message 
      });
    }
  });

  // 获取统计信息
  fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const predictApiKey = request.headers['x-predict-api-key'] as string;

    if (!predictApiKey) {
      return reply.status(401).send({ error: 'Predict.fun API Key required in x-predict-api-key header' });
    }

    try {
      const [predictMarketsRaw, polymarketMarketsRaw] = await Promise.all([
        createPredictService(predictApiKey).getAllMarkets(),
        polymarketService.getAllMarkets(),
      ]);

      const predictService = createPredictService(predictApiKey);
      const predictMarkets = await predictService.toUnifiedMarkets(predictMarketsRaw.markets);
      const polymarketMarkets = polymarketService.toUnifiedMarkets(polymarketMarketsRaw);

      // 获取所有套利机会
      const opportunities = arbitrageService.findOpportunities(
        predictMarkets,
        polymarketMarkets,
        { minProfitPercent: 0 } // 不过滤，获取全部
      );

      const stats = arbitrageService.getStats(opportunities);

      return {
        stats,
        marketCounts: {
          predict: predictMarkets.length,
          polymarket: polymarketMarkets.length,
        },
        timestamp: Date.now(),
      };
    } catch (error: any) {
      fastify.log.error('Error fetching arbitrage stats:', error.message);
      return reply.status(500).send({ 
        error: 'Failed to fetch stats',
        message: error.message 
      });
    }
  });
}
