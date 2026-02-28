export type Venue = 'polymarket' | 'predict';
export type Outcome = 'yes' | 'no';

export interface PriceLevel {
  price: number;
  size: number;
}

export interface NormalizedOrderbook {
  asks: PriceLevel[];
  bids: PriceLevel[];
  bestAsk: number | null;
  bestBid: number | null;
  ts: number;
}

export interface CardParams {
  feeBps: number;
  slippageBps: number;
  minProfit: number;
  minDepth: number;
}

export interface PolymarketRef {
  yesId: string;
  noId: string;
}

export interface PredictRef {
  marketId: string;
}

export interface MonitorCardInput {
  cardId: string;
  polymarket: PolymarketRef;
  predict: PredictRef;
  params: CardParams;
}

export interface MonitorCardState {
  cardId: string;
  status: 'starting' | 'running' | 'reconnecting' | 'error' | 'stopped';
  message: string;
  updatedAt: number;
}

export interface MarketSnapshotOutput {
  type: 'market_snapshot';
  cardId: string;
  poly: {
    yes: NormalizedOrderbook | null;
    no: NormalizedOrderbook | null;
  };
  predict: {
    yes: NormalizedOrderbook | null;
    no: NormalizedOrderbook | null;
  };
  ts: number;
}

export interface ArbStep {
  qty: number;
  leg1: string;
  leg2: string;
  price1: number;
  price2: number;
  edgePerShare: number;
}

export type ArbStrategy = 'poly_yes_predict_no' | 'poly_no_predict_yes' | 'none';

export interface ArbResultOutput {
  type: 'arb_result';
  cardId: string;
  hasOpportunity: boolean;
  strategy: ArbStrategy;
  qty: number;
  costTotal: number;
  payoutTotal: number;
  grossProfit: number;
  netProfit: number;
  profitRate: number;
  minDepthSatisfied: boolean;
  reason: string;
  steps: ArbStep[];
  ts: number;
}

export interface CardStateOutput {
  type: 'card_state';
  cardId: string;
  status: MonitorCardState['status'];
  message: string;
  updatedAt: number;
}

export interface ParamsEchoOutput {
  type: 'params_echo';
  cardId: string;
  feeBps: number;
  slippageBps: number;
  minProfit: number;
  minDepth: number;
  ts: number;
}

export type CardOutputEvent =
  | CardStateOutput
  | MarketSnapshotOutput
  | ArbResultOutput
  | ParamsEchoOutput;

export interface OrderbookIngestEvent {
  venue: Venue;
  marketId: string;
  outcome: Outcome;
  orderbook: NormalizedOrderbook;
}

export interface ConnectionStateIngestEvent {
  venue: Venue;
  status: 'running' | 'reconnecting' | 'error';
  message: string;
}
