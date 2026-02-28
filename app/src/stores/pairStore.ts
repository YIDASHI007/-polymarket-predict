// 手动市场配对状态管理

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ManualMarketPair,
  PairedMarketStatus,
  UnifiedMarket,
  ArbitrageOpportunity,
  PairMonitorParams,
} from '@/types';

export const DEFAULT_PAIR_MONITOR_PARAMS: PairMonitorParams = {
  predictFeeRate: 0.002,
  polymarketFeeRate: 0.002,
  minProfitPercent: 2,
};

// 计算置信度（与 arbitrageService 逻辑一致）
function calculateConfidence(
  roi: number,
  liquidity: number,
  volume24h: number
): 'high' | 'medium' | 'low' {
  let score = 0;

  // ROI评分
  if (roi >= 0.10) score += 3;
  else if (roi >= 0.05) score += 2;
  else score += 1;

  // 流动性评分
  if (liquidity >= 500000) score += 3;
  else if (liquidity >= 100000) score += 2;
  else score += 1;

  // 交易量评分
  if (volume24h >= 1000000) score += 3;
  else if (volume24h >= 100000) score += 2;
  else score += 1;

  if (score >= 7) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}

function getSafeParams(pair: ManualMarketPair, defaults: PairMonitorParams): PairMonitorParams {
  return {
    ...defaults,
    ...(pair.monitorParams || {}),
    minProfitPercent: pair.monitorParams?.minProfitPercent ?? pair.minProfitAlert ?? defaults.minProfitPercent,
  };
}

interface PairStore {
  // 状态
  pairs: ManualMarketPair[];
  defaultMonitorParams: PairMonitorParams;
  selectedPairId: string | null;
  isCreating: boolean;  // 是否正在创建配对
  
  // 创建配对时的临时选择
  pendingPredictMarket: UnifiedMarket | null;
  pendingPolymarket: UnifiedMarket | null;
  
  // 从市场列表点击配对时预选择的市场
  initialPairingMarket: UnifiedMarket | null;
  
  // Actions
  createPair: (
    predictMarket: UnifiedMarket,
    polymarket: UnifiedMarket,
    notes?: string,
    monitorParams?: Partial<PairMonitorParams>
  ) => ManualMarketPair;
  removePair: (pairId: string) => void;
  updatePair: (pairId: string, updates: Partial<ManualMarketPair>) => void;
  updatePairMonitorParams: (pairId: string, updates: Partial<PairMonitorParams>) => void;
  updateDefaultMonitorParams: (updates: Partial<PairMonitorParams>) => void;
  togglePairActive: (pairId: string) => void;
  
  // 创建流程
  setPendingPredict: (market: UnifiedMarket | null) => void;
  setPendingPolymarket: (market: UnifiedMarket | null) => void;
  clearPending: () => void;
  setIsCreating: (value: boolean) => void;
  
  // 从市场列表配对
  setInitialPairingMarket: (market: UnifiedMarket | null) => void;
  
  // 选择
  setSelectedPair: (pairId: string | null) => void;
  
  // 查询
  getActivePairs: () => ManualMarketPair[];
  getPairById: (pairId: string) => ManualMarketPair | undefined;
  hasPair: (predictId: string, polymarketId: string) => boolean;
  
  // 计算配对状态(实时价格和套利分析)
  calculatePairStatus: (
    pair: ManualMarketPair,
    predictMarket?: UnifiedMarket,
    polymarket?: UnifiedMarket,
    globalFilters?: { minProfitPercent: number; maxProfitPercent: number; minLiquidity: number; minVolume24h: number; minConfidence: 'high' | 'medium' | 'low' }
  ) => PairedMarketStatus;
  
  // 将配对转换为套利机会格式(用于显示在套利列表)
  pairToOpportunity: (status: PairedMarketStatus) => ArbitrageOpportunity | null;
}

export const usePairStore = create<PairStore>()(
  persist(
    (set, get) => ({
      // 初始状态
      pairs: [],
      defaultMonitorParams: DEFAULT_PAIR_MONITOR_PARAMS,
      selectedPairId: null,
      isCreating: false,
      pendingPredictMarket: null,
      pendingPolymarket: null,
      initialPairingMarket: null,  // 从市场列表点击配对时预选择的市场
      
      // 创建配对
      createPair: (predictMarket, polymarket, notes = '', monitorParams = {}) => {
        const mergedParams: PairMonitorParams = {
          ...get().defaultMonitorParams,
          ...monitorParams,
        };
        const pair: ManualMarketPair = {
          id: `${predictMarket.sourceId}-${polymarket.sourceId}`,
          predictMarketId: predictMarket.id,
          polymarketId: polymarket.id,
          predictTitle: predictMarket.title,
          polymarketTitle: polymarket.title,
          predictConditionId: predictMarket.conditionId,
          polymarketConditionId: polymarket.conditionId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          notes,
          isActive: true,
          minProfitAlert: mergedParams.minProfitPercent,  // 兼容旧字段
          alertEnabled: true,
          monitorParams: mergedParams,
          maxProfitSeen: 0,
          opportunityCount: 0,
        };
        
        set((state) => ({
          pairs: [...state.pairs, pair],
          pendingPredictMarket: null,
          pendingPolymarket: null,
          isCreating: false,
        }));
        
        return pair;
      },
      
      // 删除配对
      removePair: (pairId) => {
        set((state) => ({
          pairs: state.pairs.filter((p) => p.id !== pairId),
          selectedPairId: state.selectedPairId === pairId ? null : state.selectedPairId,
        }));
      },
      
      // 更新配对
      updatePair: (pairId, updates) => {
        set((state) => ({
          pairs: state.pairs.map((p) =>
            p.id === pairId ? { ...p, ...updates, updatedAt: Date.now() } : p
          ),
        }));
      },

      updatePairMonitorParams: (pairId, updates) => {
        set((state) => ({
          pairs: state.pairs.map((p) => {
            if (p.id !== pairId) return p;
            const monitorParams = { ...p.monitorParams, ...updates };
            return {
              ...p,
              monitorParams,
              minProfitAlert: monitorParams.minProfitPercent,
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      updateDefaultMonitorParams: (updates) => {
        set((state) => ({
          defaultMonitorParams: { ...state.defaultMonitorParams, ...updates },
        }));
      },
      
      // 切换激活状态
      togglePairActive: (pairId) => {
        const pair = get().getPairById(pairId);
        if (pair) {
          get().updatePair(pairId, { isActive: !pair.isActive });
        }
      },
      
      // 设置待选市场
      setPendingPredict: (market) => set({ pendingPredictMarket: market }),
      setPendingPolymarket: (market) => set({ pendingPolymarket: market }),
      clearPending: () => set({ pendingPredictMarket: null, pendingPolymarket: null }),
      setIsCreating: (value) => set({ isCreating: value }),
      
      // 从市场列表配对
      setInitialPairingMarket: (market) => set({ initialPairingMarket: market }),
      
      // 选择配对
      setSelectedPair: (pairId) => set({ selectedPairId: pairId }),
      
      // 查询
      getActivePairs: () => get().pairs.filter((p) => p.isActive),
      getPairById: (pairId) => get().pairs.find((p) => p.id === pairId),
      hasPair: (predictId, polymarketId) =>
        get().pairs.some(
          (p) => p.predictMarketId === predictId && p.polymarketId === polymarketId
        ),
      
      // 计算配对状态
      calculatePairStatus: (pair, predictMarket, polymarket, globalFilters?) => {
        const now = Date.now();
        const safeParams = getSafeParams(pair, get().defaultMonitorParams);
        
        // 如果没有实时数据，返回基础状态
        if (!predictMarket || !polymarket) {
          return {
            pair,
            predictMarket,
            polymarketMarket: polymarket,
            yesDiff: 0,
            noDiff: 0,
            yesDiffPercent: 0,
            noDiffPercent: 0,
            currentRoi: 0,
            potentialProfit: 0,
            hasOpportunity: false,
            meetsFilters: false,
            lastCalculatedAt: now,
          };
        }
        
        // 计算价差
        const yesDiff = predictMarket.yesPrice - polymarket.yesPrice;
        const noDiff = predictMarket.noPrice - polymarket.noPrice;
        const yesDiffPercent = polymarket.yesPrice > 0 ? yesDiff / polymarket.yesPrice : 0;
        const noDiffPercent = polymarket.noPrice > 0 ? noDiff / polymarket.noPrice : 0;
        
        // 确定最佳套利方向
        let bestDirection: 'predict_to_polymarket' | 'polymarket_to_predict' | undefined;
        let bestToken: 'Yes' | 'No' | undefined;
        let maxRoi = 0;
        
        // 分析四种情况
        const scenarios = [
          { token: 'Yes' as const, buy: predictMarket.yesPrice, sell: polymarket.yesPrice, direction: 'predict_to_polymarket' as const },
          { token: 'Yes' as const, buy: polymarket.yesPrice, sell: predictMarket.yesPrice, direction: 'polymarket_to_predict' as const },
          { token: 'No' as const, buy: predictMarket.noPrice, sell: polymarket.noPrice, direction: 'predict_to_polymarket' as const },
          { token: 'No' as const, buy: polymarket.noPrice, sell: predictMarket.noPrice, direction: 'polymarket_to_predict' as const },
        ];
        
        const totalFee = safeParams.predictFeeRate + safeParams.polymarketFeeRate;
        
        for (const s of scenarios) {
          if (s.buy <= 0 || s.sell <= 0) continue;
          const diff = s.sell - s.buy;
          const roi = diff / s.buy - totalFee;
          if (roi > maxRoi) {
            maxRoi = roi;
            bestDirection = s.direction;
            bestToken = s.token;
          }
        }
        
        // 使用配对级别的提醒阈值，或全局筛选设置
        const minProfitThreshold = safeParams.minProfitPercent / 100;
        
        // 判断是否有套利机会（基于配对自身阈值）
        const hasOpportunity = maxRoi > minProfitThreshold;
        
        // 判断是否满足全局筛选条件
        let meetsFilters = true;
        if (globalFilters) {
          // 最小收益率筛选
          if (maxRoi < globalFilters.minProfitPercent / 100) {
            meetsFilters = false;
          }
          // 最大收益率筛选（过滤异常值）
          if (maxRoi > globalFilters.maxProfitPercent / 100) {
            meetsFilters = false;
          }
          // 最小流动性筛选
          const minLiquidity = Math.min(predictMarket.liquidity, polymarket.liquidity);
          if (minLiquidity < globalFilters.minLiquidity) {
            meetsFilters = false;
          }
          // 最小交易量筛选
          const minVolume = Math.min(predictMarket.volume24h, polymarket.volume24h);
          if (minVolume < globalFilters.minVolume24h) {
            meetsFilters = false;
          }
          // 置信度筛选（基于流动性和交易量计算）
          const confidence = calculateConfidence(maxRoi, minLiquidity, minVolume);
          const confidenceLevels = { high: 3, medium: 2, low: 1 };
          if (confidenceLevels[confidence] < confidenceLevels[globalFilters.minConfidence]) {
            meetsFilters = false;
          }
        }
        
        return {
          pair,
          predictMarket,
          polymarketMarket: polymarket,
          yesDiff,
          noDiff,
          yesDiffPercent,
          noDiffPercent,
          bestDirection,
          bestToken,
          currentRoi: maxRoi,
          potentialProfit: maxRoi * 1000, // 假设投入$1000
          hasOpportunity,
          meetsFilters, // 新增：是否满足全局筛选
          lastCalculatedAt: now,
        };
      },
      
      // 转换为套利机会格式
      pairToOpportunity: (status) => {
        if (!status.predictMarket || !status.polymarketMarket) return null;
        
        const { pair, predictMarket, polymarketMarket: polymarket, bestDirection, bestToken, currentRoi } = status;
        
        if (!bestDirection || !bestToken) return null;
        
        const isPredictToPoly = bestDirection === 'predict_to_polymarket';
        const buyMarket = isPredictToPoly ? predictMarket : polymarket;
        const sellMarket = isPredictToPoly ? polymarket : predictMarket;
        const buyPrice = bestToken === 'Yes' ? buyMarket.yesPrice : buyMarket.noPrice;
        const sellPrice = bestToken === 'Yes' ? sellMarket.yesPrice : sellMarket.noPrice;
        
        return {
          id: `pair-${pair.id}`,
          conditionId: pair.predictConditionId || pair.polymarketConditionId || pair.id,
          categorySlug: predictMarket.categorySlug,
          title: `${predictMarket.title} / ${polymarket.title}`,
          predictMarket,
          polymarketMarket: polymarket,
          direction: bestDirection,
          tokenType: bestToken,
          buyPlatform: isPredictToPoly ? 'predict' : 'polymarket',
          buyPrice,
          sellPlatform: isPredictToPoly ? 'polymarket' : 'predict',
          sellPrice,
          priceDiff: sellPrice - buyPrice,
          priceDiffPercent: buyPrice > 0 ? (sellPrice - buyPrice) / buyPrice : 0,
          roi: currentRoi,
          netProfit: currentRoi * 1000,
          confidence: currentRoi > 0.05 ? 'high' : currentRoi > 0.02 ? 'medium' : 'low',
          recommendedAmount: Math.min(predictMarket.liquidity, polymarket.liquidity) * 0.1,
          detectedAt: Date.now(),
        };
      },
    }),
    {
      name: 'arbitrage-pairs',
      partialize: (state) => ({
        pairs: state.pairs,
        defaultMonitorParams: state.defaultMonitorParams,
      }), // 持久化配对和默认参数
    }
  )
);
