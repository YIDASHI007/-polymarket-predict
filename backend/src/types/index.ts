// ==================== 统一市场模型 ====================
export interface UnifiedMarket {
  id: string;
  source: 'predict' | 'polymarket';
  sourceId: string;
  conditionId: string;
  categorySlug?: string;
  parentTitle?: string;    // 父事件/Category 标题（如 "Manchester City vs Newcastle United"）
  title: string;           // 子市场名称（如 "Manchester City"）
  description: string;
  isActive: boolean;
  isTradable: boolean;
  yesPrice: number;
  noPrice: number;
  yesPriceChange24h: number;
  noPriceChange24h: number;
  volume24h: number;
  volumeTotal: number;
  liquidity: number;
  lastUpdated: number;
  feeRate: number;
  endDate?: string;
  url?: string; // optional external URL
  clobTokenIds?: string[]; // Polymarket CLOB token IDs [YES_ID, NO_ID]
  polymarketConditionIds?: string[]; // Predict -> mapped polymarket condition IDs
}

// ==================== 套利机会 ====================
export interface ArbitrageOpportunity {
  id: string;
  conditionId: string;
  categorySlug?: string;
  title: string;
  predictMarket: UnifiedMarket;
  polymarketMarket: UnifiedMarket;
  direction: 'predict_to_polymarket' | 'polymarket_to_predict';
  tokenType: 'Yes' | 'No';
  buyPlatform: 'predict' | 'polymarket';
  buyPrice: number;
  sellPlatform: 'predict' | 'polymarket';
  sellPrice: number;
  priceDiff: number;
  priceDiffPercent: number;
  roi: number;
  netProfit: number;
  confidence: 'high' | 'medium' | 'low';
  recommendedAmount: number;
  detectedAt: number;
  expiresAt?: number;
}

// ==================== API 响应类型 ====================
export interface PredictMarket {
  id: string;
  conditionId: string;
  categorySlug?: string;    // 子市场的 slug（如 "september-30th-2026"）
  categoryId?: number;      // 父市场/Category ID
  category?: number;        // 可能API返回的是这个字段名
  title: string;            // 子事件标签（如 "<10k BTC"）
  question?: string;        // 父事件问题（如 "Will the Binance SAFU..."）
  description?: string;
  status: 'REGISTERED' | 'RESOLVED' | 'CANCELLED';
  tradingStatus: 'OPEN' | 'CLOSED';
  endDate?: string;
  imageUrl?: string;
  polymarketConditionIds?: string[]; // 关联的 Polymarket 条件ID
  slug?: string; // URL友好的标识符
}

export interface PredictMarketsResponse {
  data: PredictMarket[];
  cursor?: string;
  hasMore?: boolean;
}

// Predict.fun Category (父市场/多元市场组)
export interface PredictCategory {
  id: number;
  slug: string;           // URL slug，如 "will-opinion-launch-a-token-by"
  title: string;          // 父市场标题
  description?: string;
  imageUrl?: string;
  isNegRisk: boolean;     // 是否为多元市场
  isYieldBearing: boolean;
  marketVariant: string;
  status: 'OPEN' | 'RESOLVED' | 'CANCELLED';
  createdAt: string;
  publishedAt: string;
  markets?: PredictMarket[]; // 子市场列表
}

export interface PolymarketOutcome {
  name: string;
  price: number;
  bestBid?: number;
  bestAsk?: number;
}

export interface PolymarketMarket {
  id: string;
  conditionId: string;
  slug?: string;  // 可能不存在
  question: string;
  description?: string;
  active: boolean;
  closed: boolean;
  outcomes: PolymarketOutcome[];
  volume?: number;
  liquidity?: number;
  endDate?: string;
  events?: { id: string; title: string; slug: string; ticker?: string }[]; // parent event info
  clobTokenIds?: string[] | string; // API may return JSON string or array
}

// Polymarket Events API 返回的数据结构（更准确的 slug）
export interface PolymarketEvent {
  id: string;
  slug: string;
  ticker?: string;  // 用于构建正确的 URL
  title: string;
  description?: string;
  active: boolean;
  closed: boolean;
  conditionId?: string;
  markets?: PolymarketMarket[];
  volume?: number;
  liquidity?: number;
  endDate?: string;
}

export interface PolymarketMarketsResponse {
  markets: PolymarketMarket[];
  count?: number;
}

// ==================== 套利计算设置 ====================
export interface ArbitrageSettings {
  minProfitPercent: number;
  maxProfitPercent: number;
  minConfidence: 'high' | 'medium' | 'low';
  minLiquidity: number;
  minVolume24h: number;
}

// ==================== 订单簿 ====================
export interface OrderbookEntry {
  price: number;
  size: number;
}

export interface Orderbook {
  bids: OrderbookEntry[];
  asks: OrderbookEntry[];
  lastPrice?: number;
  timestamp?: number;
}
