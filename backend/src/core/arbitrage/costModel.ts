// 费用模型
// 把"毛利"翻译成"真正能落袋的净利"。现实中大部分套利机会死在这一步。

import type { ArbLeg, CostBreakdown, FeeConfig } from './types';

/**
 * 按交易所费率 * notional 计算单腿交易费。
 */
export function tradingFeeFor(leg: ArbLeg, feeConfig: FeeConfig): number {
  const bps =
    leg.venue === 'polymarket' ? feeConfig.polymarketTakerBps : feeConfig.predictTakerBps;
  return (leg.notional * bps) / 10_000;
}

/**
 * 按照持仓时间到结算日估算资金占用成本。
 * - 如果 endDate 缺失或过去，则退化到 1 天的成本（保守估计）
 */
export function fundingCostFor(
  totalCost: number,
  endDate: string | undefined,
  feeConfig: FeeConfig,
  nowMs: number = Date.now()
): number {
  let daysToSettle = 1;
  if (endDate) {
    const endMs = new Date(endDate).getTime();
    if (Number.isFinite(endMs)) {
      const diffMs = endMs - nowMs;
      if (diffMs > 0) daysToSettle = diffMs / (24 * 3600 * 1000);
    }
  }
  const annualRate = feeConfig.annualFundingRateBps / 10_000;
  return totalCost * annualRate * (daysToSettle / 365);
}

/**
 * 综合费用拆解：两腿交易费 + 两次 gas + 资金占用
 */
export function computeCostBreakdown(
  legs: readonly [ArbLeg, ArbLeg],
  endDate: string | undefined,
  feeConfig: FeeConfig,
  nowMs: number = Date.now()
): CostBreakdown {
  const tradingFees = tradingFeeFor(legs[0], feeConfig) + tradingFeeFor(legs[1], feeConfig);
  const gasFees = feeConfig.polygonGasUsd * 2; // 两笔交易
  const totalCost = legs[0].notional + legs[1].notional;
  const fundingCost = fundingCostFor(totalCost, endDate, feeConfig, nowMs);

  return {
    tradingFees,
    gasFees,
    fundingCost,
    total: tradingFees + gasFees + fundingCost,
  };
}

/**
 * 年化 ROI：把绝对 ROI 按持仓时间外推到 365 天。
 * 例：0.3% 收益 + 持仓 2 天 → 约 54.75% 年化
 */
export function annualizeRoi(
  roiPct: number,
  endDate: string | undefined,
  nowMs: number = Date.now()
): number {
  if (!endDate) return roiPct * 365; // 假设 1 天
  const endMs = new Date(endDate).getTime();
  if (!Number.isFinite(endMs)) return roiPct * 365;
  const days = Math.max((endMs - nowMs) / (24 * 3600 * 1000), 1 / 24); // 最小 1 小时
  return (roiPct / days) * 365;
}
