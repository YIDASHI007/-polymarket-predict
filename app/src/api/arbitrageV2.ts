// V2 套利 API 前端客户端
//
// 对应 backend/src/routes/arbitrage-v2.ts 的 REST + SSE 端点。

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const V2_BASE = `${API_BASE_URL}/api/v2/arbitrage`;

// ---- 类型（与后端 core/arbitrage/types.ts 保持一致）----

export interface PriceLevelDTO {
  readonly price: number;
  readonly size: number;
}

export interface ArbLegDTO {
  readonly venue: 'polymarket' | 'predict';
  readonly outcome: 'yes' | 'no';
  readonly marketKey: string;
  readonly avgPrice: number;
  readonly shares: number;
  readonly notional: number;
  readonly slippageBps: number;
  readonly fills: readonly PriceLevelDTO[];
}

export interface CostBreakdownDTO {
  readonly tradingFees: number;
  readonly gasFees: number;
  readonly fundingCost: number;
  readonly total: number;
}

export interface ArbOpportunityDTO {
  readonly pairId: string;
  readonly title: string;
  readonly endDate?: string;
  readonly strategy: 'buy_poly_yes_and_predict_no' | 'buy_poly_no_and_predict_yes';
  readonly legs: readonly [ArbLegDTO, ArbLegDTO];
  readonly shares: number;
  readonly grossEdge: number;
  readonly totalCost: number;
  readonly totalPayout: number;
  readonly costs: CostBreakdownDTO;
  readonly netProfit: number;
  readonly roiPct: number;
  readonly annualizedRoiPct: number;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly detectedAt: number;
  readonly expiresAt: number;
}

export interface MarketPairDTO {
  readonly pairId: string;
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
  readonly matchConfidence: number;
  readonly matchReason: string;
}

export interface ConnectionStateDTO {
  readonly venue: 'polymarket' | 'predict';
  readonly status: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';
  readonly since: number;
  readonly lastMessageAt: number;
  readonly reconnectCount: number;
  readonly message?: string;
}

export interface CoordinatorStateDTO {
  readonly polymarket: ConnectionStateDTO;
  readonly predict: ConnectionStateDTO;
  readonly pairs: number;
  readonly activeOpportunities: number;
  readonly scansPerSecond: number;
}

// ---- REST 客户端 ----

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${V2_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.error || body.message || msg;
    } catch {
      /* noop */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const arbitrageApi = {
  listPairs: () => req<{ data: readonly MarketPairDTO[]; count: number }>('/pairs'),

  watchPair: (pair: {
    title: string;
    endDate?: string;
    polymarket: { conditionId: string; yesAssetId: string; noAssetId: string };
    predict: { marketId: string };
    matchConfidence?: number;
    matchReason?: string;
  }) =>
    req<{ ok: boolean; pair: MarketPairDTO; state: CoordinatorStateDTO }>('/pairs', {
      method: 'POST',
      body: JSON.stringify(pair),
    }),

  unwatchPair: (pairId: string) =>
    req<{ ok: boolean; pairId: string }>(`/pairs/${encodeURIComponent(pairId)}`, {
      method: 'DELETE',
    }),

  opportunities: () =>
    req<{ data: readonly ArbOpportunityDTO[]; count: number; ts: number }>('/opportunities'),

  state: () => req<{ data: CoordinatorStateDTO; ts: number }>('/state'),
};

// ---- SSE 流 ----

export type StreamEvent =
  | { type: 'opportunity'; data: ArbOpportunityDTO }
  | { type: 'opportunity_gone'; data: { pairId: string } }
  | { type: 'state'; data: CoordinatorStateDTO }
  | { type: 'ping'; data: { ts: number } };

/**
 * 打开 SSE 连接。返回 cleanup 函数。
 * 内置：连接失败时 EventSource 自动重连，onError 只上报不重建实例。
 */
export function openArbitrageStream(
  onEvent: (event: StreamEvent) => void,
  onError?: (err: Event) => void
): () => void {
  const es = new EventSource(`${V2_BASE}/stream`);

  const listener = (name: StreamEvent['type']) => (ev: MessageEvent) => {
    try {
      const data = JSON.parse(ev.data);
      onEvent({ type: name, data } as StreamEvent);
    } catch {
      /* noop */
    }
  };

  es.addEventListener('opportunity', listener('opportunity'));
  es.addEventListener('opportunity_gone', listener('opportunity_gone'));
  es.addEventListener('state', listener('state'));
  es.addEventListener('ping', listener('ping'));
  es.onerror = (e) => onError?.(e);

  return () => es.close();
}
