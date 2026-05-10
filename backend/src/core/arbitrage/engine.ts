// 套利引擎主入口。
//
// 核心逻辑修正（对比旧版）：
//   ❌ 旧版：在两家平台之间"低买高卖同一个代币" —— 这在跨平台上**不成立**，
//      因为 Polymarket 的 YES 代币和 Predict.fun 的 YES 代币是完全独立的链上资产，不可互转。
//   ✅ 新版：**"对冲组合"套利** —— 对于同一个现实事件：
//        买 A 家的 YES + 买 B 家的 NO
//      如果 YES_price_A + NO_price_B < 1 - fees，则无论事件结果，你都会有 1 USDC 的 payout，
//      成本小于 1，差价即净利。这才是跨平台预测市场套利的真实模型。

import { computeCostBreakdown, annualizeRoi } from './costModel';
import { walkBothAsks } from './orderbookMatcher';
import {
  ArbLeg,
  ArbOpportunity,
  DEFAULT_FEE_CONFIG,
  DEFAULT_SCAN_CONFIG,
  FeeConfig,
  MarketPair,
  Orderbook,
  ScanConfig,
} from './types';

export interface OrderbookSnapshot {
  /** Polymarket asks on YES token */
  readonly polyYes?: Orderbook;
  /** Polymarket asks on NO token */
  readonly polyNo?: Orderbook;
  /** Predict YES asks（从 predictOrderbook 直接来） */
  readonly predictYes?: Orderbook;
  /** Predict NO asks（由 predictYes 合成：NO_ask = 1 - YES_bid） */
  readonly predictNo?: Orderbook;
}

export interface ScanInput {
  readonly pair: MarketPair;
  readonly snapshot: OrderbookSnapshot;
  readonly feeConfig?: FeeConfig;
  readonly scanConfig?: ScanConfig;
  readonly maxShares?: number; // 外部封顶（UI 传入"想投多少"换算来）
}

export interface ScanOutput {
  readonly opportunity: ArbOpportunity | null;
  readonly rejectedReason?: string;
  readonly candidates: readonly ArbOpportunity[]; // 两个策略都算出来，返回最优 + 所有
}

/**
 * 扫描一对市场的当前订单簿，返回**最优**套利机会。
 */
export function scanPair(input: ScanInput): ScanOutput {
  const feeConfig = input.feeConfig ?? DEFAULT_FEE_CONFIG;
  const scanConfig = input.scanConfig ?? DEFAULT_SCAN_CONFIG;
  const maxShares = input.maxShares ?? 10_000;

  const candidates: ArbOpportunity[] = [];
  const rejectedReasons: string[] = [];

  // 策略 A: Polymarket-YES + Predict-NO
  const stratA = tryStrategy(
    'buy_poly_yes_and_predict_no',
    input.pair,
    input.snapshot.polyYes,
    input.snapshot.predictNo,
    { feeConfig, scanConfig, maxShares }
  );
  if (stratA.opportunity) candidates.push(stratA.opportunity);
  else if (stratA.reason) rejectedReasons.push(`A: ${stratA.reason}`);

  // 策略 B: Polymarket-NO + Predict-YES
  const stratB = tryStrategy(
    'buy_poly_no_and_predict_yes',
    input.pair,
    input.snapshot.polyNo,
    input.snapshot.predictYes,
    { feeConfig, scanConfig, maxShares }
  );
  if (stratB.opportunity) candidates.push(stratB.opportunity);
  else if (stratB.reason) rejectedReasons.push(`B: ${stratB.reason}`);

  if (candidates.length === 0) {
    return {
      opportunity: null,
      rejectedReason: rejectedReasons.join(' | ') || 'no viable strategy',
      candidates: [],
    };
  }

  // 两个策略都可行时选 ROI 更高的
  candidates.sort((a, b) => b.roiPct - a.roiPct);
  return {
    opportunity: candidates[0],
    candidates,
  };
}

// -------- internal --------

function tryStrategy(
  strategy: ArbOpportunity['strategy'],
  pair: MarketPair,
  askBook1: Orderbook | undefined,
  askBook2: Orderbook | undefined,
  opts: { feeConfig: FeeConfig; scanConfig: ScanConfig; maxShares: number }
): { opportunity: ArbOpportunity | null; reason?: string } {
  if (!askBook1 || !askBook2) {
    return { opportunity: null, reason: 'missing orderbook leg' };
  }

  // 订单簿新鲜度检查
  const now = Date.now();
  const ageMs1 = now - askBook1.ts;
  const ageMs2 = now - askBook2.ts;
  const maxAge = opts.scanConfig.maxOrderbookAgeMs;
  if (ageMs1 > maxAge || ageMs2 > maxAge) {
    return {
      opportunity: null,
      reason: `orderbook stale (age: ${Math.max(ageMs1, ageMs2)}ms)`,
    };
  }

  // 在两边 asks 上同步 walk
  const walk = walkBothAsks(askBook1.asks, askBook2.asks, {
    minEdgePerShare: 0, // 费前 edge 门槛，由下游用 ROI 再筛
    maxShares: opts.maxShares,
  });

  if (walk.shares < opts.scanConfig.minShares) {
    return {
      opportunity: null,
      reason: `shares ${walk.shares.toFixed(1)} < minShares ${opts.scanConfig.minShares} (${walk.stopReason})`,
    };
  }

  // 组装两条腿
  const leg1: ArbLeg = {
    venue: askBook1.venue,
    outcome: askBook1.outcome,
    marketKey: askBook1.marketKey,
    avgPrice: walk.avgPrice1,
    shares: walk.shares,
    notional: walk.notional1,
    slippageBps: walk.slippageBps1,
    fills: walk.fills1,
  };
  const leg2: ArbLeg = {
    venue: askBook2.venue,
    outcome: askBook2.outcome,
    marketKey: askBook2.marketKey,
    avgPrice: walk.avgPrice2,
    shares: walk.shares,
    notional: walk.notional2,
    slippageBps: walk.slippageBps2,
    fills: walk.fills2,
  };

  const totalCost = leg1.notional + leg2.notional;
  const totalPayout = walk.shares; // 1 USDC per share
  const costs = computeCostBreakdown([leg1, leg2], pair.endDate, opts.feeConfig, now);

  const netProfit = totalPayout - totalCost - costs.total;
  const roiPct = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;
  const grossEdge = (totalPayout - totalCost) / walk.shares;
  const annualizedRoiPct = annualizeRoi(roiPct, pair.endDate, now);

  if (roiPct < opts.scanConfig.minRoiPct) {
    return {
      opportunity: null,
      reason: `roi ${roiPct.toFixed(3)}% < minRoiPct ${opts.scanConfig.minRoiPct}%`,
    };
  }

  const confidence = classifyConfidence(roiPct, walk.shares, pair.matchConfidence);
  const expiresAt = Math.min(askBook1.ts, askBook2.ts) + opts.scanConfig.maxOrderbookAgeMs;

  return {
    opportunity: {
      pairId: pair.pairId,
      title: pair.title,
      endDate: pair.endDate,
      strategy,
      legs: [leg1, leg2],
      shares: walk.shares,
      grossEdge,
      totalCost,
      totalPayout,
      costs,
      netProfit,
      roiPct,
      annualizedRoiPct,
      confidence,
      detectedAt: now,
      expiresAt,
    },
  };
}

function classifyConfidence(
  roiPct: number,
  shares: number,
  matchConfidence: number
): 'high' | 'medium' | 'low' {
  let score = 0;
  if (roiPct >= 3) score += 3;
  else if (roiPct >= 1) score += 2;
  else score += 1;

  if (shares >= 500) score += 3;
  else if (shares >= 100) score += 2;
  else score += 1;

  if (matchConfidence >= 0.9) score += 3;
  else if (matchConfidence >= 0.7) score += 2;
  else score += 1;

  if (score >= 7) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}
