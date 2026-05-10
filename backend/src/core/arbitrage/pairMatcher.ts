// 跨平台市场配对器
//
// 问题：Polymarket 和 Predict.fun 的 conditionId 不共享，
//      不能直接按 ID 匹配。必须用"语义 + 结构"特征匹配。
//
// 策略（按优先级）：
//   1. 手动映射表（manualPairs.json）—— 100% 可信，权重最高
//   2. 结构特征：endDate 相差 < 24h AND 标题相似度 > 0.7
//   3. 打分 = min(titleSim, endDateSim)
//
// 匹配可信度影响套利机会的 confidence：
//   matchConfidence < 0.7 的 pair 自动降级为 low confidence，不会进入默认扫描列表。

import type { MarketPair } from './types';

export interface PairCandidate {
  readonly polymarket: {
    readonly conditionId: string;
    readonly question: string;
    readonly endDate?: string;
    readonly yesAssetId: string;
    readonly noAssetId: string;
  };
  readonly predict: {
    readonly marketId: string;
    readonly title: string;
    readonly question?: string;
    readonly endDate?: string;
  };
}

/** 简单归一化：大小写、去除无关字符、塌缩空白 */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 基于 token 集合的 Jaccard 相似度，适合短文本 */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeTitle(a).split(' ').filter((t) => t.length > 1));
  const tb = new Set(normalizeTitle(b).split(' ').filter((t) => t.length > 1));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  ta.forEach((t) => {
    if (tb.has(t)) inter += 1;
  });
  const union = ta.size + tb.size - inter;
  return inter / union;
}

/** 结束时间相似度：相差越小越接近 1 */
export function endDateSimilarity(aIso?: string, bIso?: string): number {
  if (!aIso || !bIso) return 0.5; // 缺失数据时给中性分
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0.5;
  const diffDays = Math.abs(a - b) / (24 * 3600 * 1000);
  if (diffDays < 0.5) return 1.0;
  if (diffDays < 1) return 0.9;
  if (diffDays < 3) return 0.7;
  if (diffDays < 7) return 0.4;
  return 0.1;
}

export interface PairMatch {
  readonly candidate: PairCandidate;
  readonly titleSim: number;
  readonly dateSim: number;
  readonly score: number;
  readonly reason: string;
}

export function scorePairCandidate(candidate: PairCandidate): PairMatch {
  const titleSim = titleSimilarity(
    candidate.polymarket.question,
    candidate.predict.question ?? candidate.predict.title
  );
  const dateSim = endDateSimilarity(candidate.polymarket.endDate, candidate.predict.endDate);
  // 两个子分数取 min，防止只看一边刷分
  const score = Math.min(titleSim, dateSim);
  const reason = `titleSim=${titleSim.toFixed(2)} dateSim=${dateSim.toFixed(2)}`;
  return { candidate, titleSim, dateSim, score, reason };
}

/**
 * 从大批候选里找出最可能的配对。
 * 返回按 score 降序的匹配数组（只保留 score >= minScore）。
 */
export function findPairs(
  candidates: readonly PairCandidate[],
  minScore: number = 0.6
): readonly PairMatch[] {
  return candidates
    .map(scorePairCandidate)
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

/**
 * 将 PairMatch 转换为可被引擎使用的 MarketPair。
 */
export function buildMarketPair(
  match: PairMatch,
  opts: { pairIdPrefix?: string; manualOverride?: boolean } = {}
): MarketPair {
  const { candidate, score, reason } = match;
  return {
    pairId:
      (opts.pairIdPrefix ?? 'auto') + '::' + candidate.polymarket.conditionId + '::' + candidate.predict.marketId,
    title: candidate.polymarket.question,
    endDate: candidate.polymarket.endDate ?? candidate.predict.endDate,
    polymarket: {
      conditionId: candidate.polymarket.conditionId,
      yesAssetId: candidate.polymarket.yesAssetId,
      noAssetId: candidate.polymarket.noAssetId,
    },
    predict: {
      marketId: candidate.predict.marketId,
    },
    matchConfidence: opts.manualOverride ? 1.0 : score,
    matchReason: opts.manualOverride ? 'manual' : reason,
  };
}
