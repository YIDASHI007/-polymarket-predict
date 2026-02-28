// 跨市场套利监控系统 - 类型定义

export type Platform = 'predict' | 'polymarket';
export type MarketStatus = 'trading' | 'closing' | 'closed' | 'resolved';
export type ArbitrageLevel = 'high' | 'medium' | 'low' | 'micro';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface PairMonitorParams {
  predictFeeRate: number;       // 市场1(Predict)手续费(小数: 0.002 = 0.2%)
  polymarketFeeRate: number;    // 市场2(Polymarket)手续费(小数)
  minProfitPercent: number;     // 播报最低理论利润率(%)
}

// 统一市场模型
export interface UnifiedMarket {
  id: string;
  source: Platform;
  sourceId: string;
  conditionId: string;
  categorySlug?: string;
  parentTitle?: string;      // 父事件/Category 标题（如 "Manchester City vs Newcastle United"）
  title: string;             // 子市场名称（如 "Manchester City"）
  description: string;
  url?: string;                      // 外部链接
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
  outcomes?: MarketOutcome[];
  clobTokenIds?: string[]; // Polymarket CLOB token IDs [YES_ID, NO_ID]
  polymarketConditionIds?: string[]; // Predict market mapped polymarket condition IDs
}

export interface MarketOutcome {
  id: string;
  name: string;
  price: number;
  bestBid: number;
  bestAsk: number;
}

// 订单簿
export interface Orderbook {
  bids: [number, number][];  // [价格, 数量]
  asks: [number, number][];
  lastPrice?: number;
  timestamp: number;
}

// 套利机会
export interface ArbitrageOpportunity {
  id: string;
  conditionId: string;
  categorySlug?: string;
  title: string;
  predictMarket: UnifiedMarket;
  polymarketMarket: UnifiedMarket;
  direction: 'predict_to_polymarket' | 'polymarket_to_predict';
  tokenType: 'Yes' | 'No';
  buyPlatform: Platform;
  buyPrice: number;
  sellPlatform: Platform;
  sellPrice: number;
  priceDiff: number;
  priceDiffPercent: number;
  roi: number;
  netProfit: number;
  confidence: ConfidenceLevel;
  recommendedAmount: number;
  detectedAt: number;
  expiresAt?: number;
}

// 用户配置
export interface UserSettings {
  apiKeys: {
    predictFun: string | null;
    polymarket: string | null;
  };
  monitoring: {
    enabled: boolean;
    refreshInterval: number;
    autoRefresh: boolean;
  };
  filters: {
    minProfitPercent: number;
    maxProfitPercent: number;
    minConfidence: ConfidenceLevel;
    minLiquidity: number;
    minVolume24h: number;
  };
  notifications: {
    enabled: boolean;
    minProfitForAlert: number;
    soundEnabled: boolean;
    browserNotification: boolean;
  };
  display: {
    theme: 'light' | 'dark' | 'system';
    compactMode: boolean;
    defaultSortBy: 'profit' | 'confidence' | 'time';
    itemsPerPage: number;
  };
}

// 导航项
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: number;
}

// 统计数据
export interface ArbitrageStats {
  totalOpportunities: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  predictToPolymarketCount: number;
  polymarketToPredictCount: number;
  avgProfitPercent24h: number;
  maxProfitPercent24h: number;
  lastUpdated: number;
}

// ==================== 手动市场配对 ====================

// 用户手动创建的跨市场配对
export interface ManualMarketPair {
  id: string;                      // 配对唯一ID (predictId + polymarketId)
  predictMarketId: string;         // Predict.fun 市场ID
  polymarketId: string;            // Polymarket 市场ID
  
  // 缓存市场信息(方便显示)
  predictTitle: string;
  polymarketTitle: string;
  predictConditionId?: string;
  polymarketConditionId?: string;
  
  // 配对元数据
  createdAt: number;               // 创建时间
  updatedAt: number;               // 更新时间
  notes?: string;                  // 用户备注
  
  // 监控配置
  isActive: boolean;               // 是否激活监控
  minProfitAlert: number;          // 最小利润提醒(%)
  alertEnabled: boolean;           // 是否开启提醒
  monitorParams: PairMonitorParams;// 套利监控参数(用于模块计算)
  
  // 统计信息
  lastCheckAt?: number;            // 上次检查时间
  maxProfitSeen: number;           // 历史最高利润率
  opportunityCount: number;        // 发现套利机会次数
}

// 配对监控状态(实时计算)
export interface PairedMarketStatus {
  pair: ManualMarketPair;
  predictMarket?: UnifiedMarket;   // 实时市场数据
  polymarketMarket?: UnifiedMarket;
  
  // 实时价差分析
  yesDiff: number;                 // Yes 价差 (Predict - Polymarket)
  noDiff: number;                  // No 价差
  yesDiffPercent: number;          // Yes 价差百分比
  noDiffPercent: number;           // No 价差百分比
  
  // 套利分析
  bestDirection?: 'predict_to_polymarket' | 'polymarket_to_predict';
  bestToken?: 'Yes' | 'No';
  currentRoi: number;              // 当前收益率
  potentialProfit: number;         // 潜在利润
  hasOpportunity: boolean;         // 是否有套利机会
  meetsFilters: boolean;           // 是否满足全局筛选条件
  
  lastCalculatedAt: number;        // 计算时间
}
