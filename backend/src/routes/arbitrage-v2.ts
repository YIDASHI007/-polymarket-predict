// V2 套利 API —— 真·实时。
//
// 核心端点：
//   GET  /api/v2/arbitrage/pairs                       列出当前监控中的市场对
//   POST /api/v2/arbitrage/pairs                       新增一对市场监控
//   DELETE /api/v2/arbitrage/pairs/:pairId             停止监控
//   GET  /api/v2/arbitrage/opportunities               当前活跃的套利机会快照
//   GET  /api/v2/arbitrage/stream  (SSE)               实时事件流（订单簿更新 → 扫描 → 推送）
//   GET  /api/v2/arbitrage/state                       协调器状态（连接 / 扫描速率）

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ArbOpportunity,
  DEFAULT_FEE_CONFIG,
  DEFAULT_SCAN_CONFIG,
  MarketPair,
} from '../core/arbitrage';
import { ArbitrageCoordinator } from '../core/realtime';

// -------- 单例协调器（整个进程共享）--------

let coordinatorSingleton: ArbitrageCoordinator | null = null;

export function getCoordinator(): ArbitrageCoordinator {
  if (!coordinatorSingleton) {
    coordinatorSingleton = new ArbitrageCoordinator({
      feeConfig: DEFAULT_FEE_CONFIG,
      scanConfig: DEFAULT_SCAN_CONFIG,
      minRescanMs: 200,
      opportunityTtlMs: 60_000,
    });
    void coordinatorSingleton.start();
  }
  return coordinatorSingleton;
}

// -------- Request 类型 --------

interface WatchPairBody {
  readonly pairId?: string;
  readonly title: string;
  readonly endDate?: string;
  readonly polymarket: {
    readonly conditionId: string;
    readonly yesAssetId: string;
    readonly noAssetId: string;
  };
  readonly predict: {
    readonly marketId: string;
  };
  readonly matchConfidence?: number;
  readonly matchReason?: string;
}

interface PairIdParam {
  readonly pairId: string;
}

// -------- 辅助：把请求 body 标准化成 MarketPair --------

function bodyToMarketPair(body: WatchPairBody): MarketPair {
  const pairId =
    body.pairId ??
    `${body.polymarket.conditionId}::${body.predict.marketId}`;
  return {
    pairId,
    title: body.title,
    endDate: body.endDate,
    polymarket: {
      conditionId: body.polymarket.conditionId,
      yesAssetId: body.polymarket.yesAssetId,
      noAssetId: body.polymarket.noAssetId,
    },
    predict: {
      marketId: body.predict.marketId,
    },
    matchConfidence: body.matchConfidence ?? 1.0,
    matchReason: body.matchReason ?? 'manual',
  };
}

// -------- 路由注册 --------

export async function arbitrageV2Routes(fastify: FastifyInstance): Promise<void> {
  const coord = getCoordinator();

  // ============ 列出当前监控中的 pair ============
  fastify.get('/pairs', async () => {
    const pairs = coord.listPairs();
    return {
      data: pairs,
      count: pairs.length,
      ts: Date.now(),
    };
  });

  // ============ 开始监控一对市场 ============
  fastify.post(
    '/pairs',
    async (req: FastifyRequest<{ Body: WatchPairBody }>, reply: FastifyReply) => {
      const body = req.body;
      if (
        !body?.polymarket?.conditionId ||
        !body?.polymarket?.yesAssetId ||
        !body?.polymarket?.noAssetId ||
        !body?.predict?.marketId ||
        !body?.title
      ) {
        return reply.status(400).send({
          error: 'missing required fields',
          required: ['title', 'polymarket.{conditionId,yesAssetId,noAssetId}', 'predict.marketId'],
        });
      }

      const pair = bodyToMarketPair(body);
      await coord.watchPair(pair);
      return {
        ok: true,
        pair,
        state: coord.getCoordinatorState(),
      };
    }
  );

  // ============ 停止监控 ============
  fastify.delete(
    '/pairs/:pairId',
    async (req: FastifyRequest<{ Params: PairIdParam }>) => {
      await coord.unwatchPair(req.params.pairId);
      return { ok: true, pairId: req.params.pairId };
    }
  );

  // ============ 当前活跃机会快照 ============
  fastify.get('/opportunities', async () => {
    const opps = coord.listOpportunities();
    return {
      data: opps,
      count: opps.length,
      ts: Date.now(),
    };
  });

  // ============ 协调器状态（连接 / 性能指标）============
  fastify.get('/state', async () => {
    return {
      data: coord.getCoordinatorState(),
      ts: Date.now(),
    };
  });

  // ============ SSE 实时事件流 ============
  // 前端通过 EventSource 订阅，实时收到：
  //   event: opportunity     机会新增/更新  data: ArbOpportunity
  //   event: opportunity_gone 机会消失       data: { pairId }
  //   event: state           状态变化        data: CoordinatorState
  //   event: ping            心跳           data: { ts }
  fastify.get('/stream', async (req: FastifyRequest, reply: FastifyReply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no'); // nginx: 禁用缓冲
    reply.raw.flushHeaders();

    const send = (event: string, data: unknown): void => {
      try {
        reply.raw.write(`event: ${event}\n`);
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        /* 客户端已断开 */
      }
    };

    // 启动时先推一次全量快照，前端无需"先 GET 再订阅"
    send('state', coord.getCoordinatorState());
    for (const opp of coord.listOpportunities()) send('opportunity', opp);

    const onOpp = (opp: ArbOpportunity): void => send('opportunity', opp);
    const onGone = (pairId: string): void => send('opportunity_gone', { pairId });
    const onState = (s: unknown): void => send('state', s);
    const ping = setInterval(() => send('ping', { ts: Date.now() }), 15_000);

    coord.on('opportunity', onOpp);
    coord.on('opportunity_gone', onGone);
    coord.on('state', onState);

    req.raw.on('close', () => {
      clearInterval(ping);
      coord.off('opportunity', onOpp);
      coord.off('opportunity_gone', onGone);
      coord.off('state', onState);
      try {
        reply.raw.end();
      } catch {
        /* noop */
      }
    });
  });
}
