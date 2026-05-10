// 核心套利引擎类型定义
// 设计原则：
//   1. 纯数据类型，不依赖任何 HTTP/WS 框架
//   2. 所有价格都是小数（0.0 - 1.0），所有金额都是 USDC
//   3. 订单簿的 asks 按价格升序、bids 按价格降序

export type Venue = 'polymarket' | 'predict';
export type Outcome = 'yes' | 'no';

export interface PriceLevel {
  readonly price: number; // 0 < price < 1
  readonly size: number;  // shares available at this price
}

/** 标准化订单簿。snapshot 语义：这是当前可成交的完整切片 */
export interface Orderbook {
  readonly venue: Venue;
  readonly marketKey: string;     // venue-local 的唯一键（Poly=assetId, Predict=marketId+outcome）
  readonly outcome: Outcome;
  readonly asks: readonly PriceLevel[]; // 升序
  readonly bids: readonly PriceLevel[]; // 降序
  readonly ts: number;            // 最后更新时间戳 (ms)
}

/** 跨平台对冲对：同一事件在两家的 YES / NO 代币 */
export interface MarketPair {
  readonly pairId: string;
  readonly title: string;         // 人类可读标题（用于展示）
  readonly endDate?: string;      // ISO 结算时间
  readonly polymarket: {
    readonly conditionId: string;
    readonly yesAssetId: string;  // CLOB token id
    readonly noAssetId: string;
  };
  readonly predict: {
    readonly marketId: string;    // Predict 市场 id
  };
  readonly matchConfidence: number; // 0-1，匹配可信度
  readonly matchReason: string;     // "manual" | "endDate+title-similarity=0.82" 等
}

/** 套利的两条腿 - 每条腿是"在某个 venue 以某价格买某个 outcome 多少份" */
export interface ArbLeg {
  readonly venue: Venue;
  readonly outcome: Outcome;
  readonly marketKey: string;
  readonly avgPrice: number;       // 吃完这部分盘口的平均成交价
  readonly shares: number;
  readonly notional: number;       // avgPrice * shares
  readonly slippageBps: number;    // 相对于最优价的滑点
  readonly fills: readonly {       // 每档成交明细
    readonly price: number;
    readonly size: number;
  }[];
}

/** 费用拆解 */
export interface CostBreakdown {
  readonly tradingFees: number;    // 两边交易手续费之和
  readonly gasFees: number;        // Polygon gas 估算
  readonly fundingCost: number;    // 资金占用机会成本（持仓到结算）
  readonly total: number;
}

/** 单个套利机会（一个 MarketPair 在当前订单簿状态下的最优执行） */
export interface ArbOpportunity {
  readonly pairId: string;
  readonly title: string;
  readonly endDate?: string;
  readonly strategy: 'buy_poly_yes_and_predict_no' | 'buy_poly_no_and_predict_yes';
  readonly legs: readonly [ArbLeg, ArbLeg]; // leg0 + leg1

  // 经济指标
  readonly shares: number;           // 可套利份数（受限于两腿最小深度）
  readonly grossEdge: number;        // 1 - (p_yes + p_no) per share（未扣费）
  readonly totalCost: number;        // sum(leg.notional)
  readonly totalPayout: number;      // shares (每 share 必得 1 USDC)
  readonly costs: CostBreakdown;
  readonly netProfit: number;        // totalPayout - totalCost - costs.total
  readonly roiPct: number;           // netProfit / totalCost * 100
  readonly annualizedRoiPct: number; // 年化（按 endDate 外推）

  readonly confidence: 'high' | 'medium' | 'low';
  readonly detectedAt: number;
  readonly expiresAt: number;        // 订单簿最老快照 + maxAge
}

/** 费用模型的输入参数 */
export interface FeeConfig {
  readonly polymarketTakerBps: number;     // Polymarket taker fee (bps)
  readonly predictTakerBps: number;        // Predict.fun taker fee (bps)
  readonly polygonGasUsd: number;          // 每笔 polygon 交易 gas 折 USDC
  readonly annualFundingRateBps: number;   // 资金占用年化成本 (bps)，如 500 = 5%
}

export const DEFAULT_FEE_CONFIG: FeeConfig = {
  polymarketTakerBps: 0,     // Polymarket 目前 taker = 0
  predictTakerBps: 100,      // Predict.fun 1% 假设（你后续可在前端调整）
  polygonGasUsd: 0.02,       // 很便宜
  annualFundingRateBps: 500, // 5% 年化，代表 USDC 放 DeFi 或美债的机会成本
};

/** 扫描引擎配置 */
export interface ScanConfig {
  readonly minShares: number;        // 最小可套利份数（低于这个认为流动性太差）
  readonly minRoiPct: number;        // 最小 ROI% 门槛
  readonly maxOrderbookAgeMs: number; // 订单簿最大有效期（超过视为过期）
}

export const DEFAULT_SCAN_CONFIG: ScanConfig = {
  minShares: 50,
  minRoiPct: 0.5,            // >= 0.5% 净 ROI 才报告
  maxOrderbookAgeMs: 30_000, // 30s 以上视为过期（WS 正常时应 <5s）
};
