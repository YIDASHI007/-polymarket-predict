// 订单簿匹配器：在两个 asks（两腿各一）上"平行 walk-the-book"，
// 计算某个目标 shares 数的真实平均成交价和滑点。
//
// 核心算法：
//   在两个升序 asks 上各设指针，每一步把 dq = min(两边剩余 size) 数量"同时"推进两腿
//   → 保证两边成交份数严格相等（这对跨平台对冲是必须的）
//   → 遇到任一腿没深度则停
//   → 可设置 maxShares 上限（避免算出"虚高"的机会）

import type { Outcome, PriceLevel, Venue } from './types';

export interface WalkResult {
  /** 实际可以同时成交的份数 */
  readonly shares: number;
  /** 两腿各自的平均价 */
  readonly avgPrice1: number;
  readonly avgPrice2: number;
  /** 两腿吃的总金额 */
  readonly notional1: number;
  readonly notional2: number;
  /** 各档成交明细（用于前端 steps 展示） */
  readonly fills1: readonly { price: number; size: number }[];
  readonly fills2: readonly { price: number; size: number }[];
  /** 相对最优 ask 的滑点（bps） */
  readonly slippageBps1: number;
  readonly slippageBps2: number;
  /** 停止原因 */
  readonly stopReason:
    | 'max_shares_reached'
    | 'leg1_exhausted'
    | 'leg2_exhausted'
    | 'edge_negative'
    | 'no_liquidity';
}

export interface WalkOptions {
  /** 每份成交的最小毛边（price1 + price2 <= 1 - minEdge） */
  readonly minEdgePerShare: number;
  /** 硬性份数上限（流动性再好也不继续） */
  readonly maxShares: number;
}

/**
 * 同步推进两个 asks 直到：
 *   - 任一腿盘口吃光
 *   - 下一档的 edge 掉到 minEdgePerShare 以下
 *   - 或达到 maxShares
 */
export function walkBothAsks(
  asks1: readonly PriceLevel[],
  asks2: readonly PriceLevel[],
  options: WalkOptions
): WalkResult {
  if (asks1.length === 0 || asks2.length === 0) {
    return emptyResult('no_liquidity');
  }

  const best1 = asks1[0].price;
  const best2 = asks2[0].price;

  let i = 0;
  let j = 0;
  let rem1 = asks1[0].size;
  let rem2 = asks2[0].size;

  let shares = 0;
  let notional1 = 0;
  let notional2 = 0;
  const fills1: { price: number; size: number }[] = [];
  const fills2: { price: number; size: number }[] = [];

  let stopReason: WalkResult['stopReason'] = 'leg1_exhausted';

  while (i < asks1.length && j < asks2.length) {
    const p1 = asks1[i].price;
    const p2 = asks2[j].price;
    const edge = 1 - (p1 + p2);

    if (edge < options.minEdgePerShare) {
      stopReason = 'edge_negative';
      break;
    }

    if (shares >= options.maxShares) {
      stopReason = 'max_shares_reached';
      break;
    }

    const headroom = options.maxShares - shares;
    const dq = Math.min(rem1, rem2, headroom);
    if (dq <= 0) {
      stopReason = 'max_shares_reached';
      break;
    }

    shares += dq;
    notional1 += dq * p1;
    notional2 += dq * p2;
    fills1.push({ price: p1, size: dq });
    fills2.push({ price: p2, size: dq });

    rem1 -= dq;
    rem2 -= dq;

    if (rem1 <= 1e-9) {
      i += 1;
      rem1 = i < asks1.length ? asks1[i].size : 0;
      if (i >= asks1.length) {
        stopReason = 'leg1_exhausted';
      }
    }
    if (rem2 <= 1e-9) {
      j += 1;
      rem2 = j < asks2.length ? asks2[j].size : 0;
      if (j >= asks2.length && stopReason !== 'leg1_exhausted') {
        stopReason = 'leg2_exhausted';
      }
    }
  }

  if (shares === 0) {
    return emptyResult(stopReason);
  }

  const avgPrice1 = notional1 / shares;
  const avgPrice2 = notional2 / shares;
  const slippageBps1 = ((avgPrice1 - best1) / best1) * 10_000;
  const slippageBps2 = ((avgPrice2 - best2) / best2) * 10_000;

  return {
    shares,
    avgPrice1,
    avgPrice2,
    notional1,
    notional2,
    fills1,
    fills2,
    slippageBps1,
    slippageBps2,
    stopReason,
  };
}

function emptyResult(stopReason: WalkResult['stopReason']): WalkResult {
  return {
    shares: 0,
    avgPrice1: 0,
    avgPrice2: 0,
    notional1: 0,
    notional2: 0,
    fills1: [],
    fills2: [],
    slippageBps1: 0,
    slippageBps2: 0,
    stopReason,
  };
}

/** 便捷工具：给调用方生成 ArbLeg 元数据 */
export interface LegMeta {
  venue: Venue;
  outcome: Outcome;
  marketKey: string;
}
