import { UnifiedMarket, ArbitrageOpportunity, ArbitrageSettings } from '../types';

export class ArbitrageService {
  /**
   * 查找套利机会
   */
  findOpportunities(
    predictMarkets: UnifiedMarket[],
    polymarketMarkets: UnifiedMarket[],
    settings: Partial<ArbitrageSettings> = {}
  ): ArbitrageOpportunity[] {
    const {
      minProfitPercent = 1.5,
      maxProfitPercent = 100,
      minConfidence = 'medium',
      minLiquidity = 0,
      minVolume24h = 0,
    } = settings;

    const opportunities: ArbitrageOpportunity[] = [];

    // 按 conditionId 分组匹配市场
    const marketMap = new Map<string, { predict?: UnifiedMarket; polymarket?: UnifiedMarket }>();

    predictMarkets.forEach(m => {
      if (!marketMap.has(m.conditionId)) marketMap.set(m.conditionId, {});
      marketMap.get(m.conditionId)!.predict = m;
    });

    polymarketMarkets.forEach(m => {
      if (!marketMap.has(m.conditionId)) marketMap.set(m.conditionId, {});
      marketMap.get(m.conditionId)!.polymarket = m;
    });

    // 遍历匹配的市场对
    marketMap.forEach(({ predict, polymarket }, conditionId) => {
      if (!predict || !polymarket) return;
      if (!predict.isTradable || !polymarket.isTradable) return;

      // 检查Yes代币套利
      const yesOpportunity = this.calculateArbitrage(
        predict,
        polymarket,
        'Yes',
        { minProfitPercent, maxProfitPercent, minConfidence, minLiquidity, minVolume24h }
      );
      if (yesOpportunity) opportunities.push(yesOpportunity);

      // 检查No代币套利
      const noOpportunity = this.calculateArbitrage(
        predict,
        polymarket,
        'No',
        { minProfitPercent, maxProfitPercent, minConfidence, minLiquidity, minVolume24h }
      );
      if (noOpportunity) opportunities.push(noOpportunity);
    });

    // 按ROI排序
    return opportunities.sort((a, b) => b.roi - a.roi);
  }

  /**
   * 计算单个套利机会
   */
  private calculateArbitrage(
    predictMarket: UnifiedMarket,
    polymarketMarket: UnifiedMarket,
    tokenType: 'Yes' | 'No',
    settings: ArbitrageSettings
  ): ArbitrageOpportunity | null {
    const predictPrice = tokenType === 'Yes' ? predictMarket.yesPrice : predictMarket.noPrice;
    const polymarketPrice = tokenType === 'Yes' ? polymarketMarket.yesPrice : polymarketMarket.noPrice;

    // 跳过无效价格
    if (predictPrice <= 0 || polymarketPrice <= 0) return null;

    // 确定买入和卖出平台
    let buyPlatform: 'predict' | 'polymarket';
    let buyPrice: number;
    let sellPlatform: 'predict' | 'polymarket';
    let sellPrice: number;

    if (predictPrice < polymarketPrice) {
      buyPlatform = 'predict';
      buyPrice = predictPrice;
      sellPlatform = 'polymarket';
      sellPrice = polymarketPrice;
    } else {
      buyPlatform = 'polymarket';
      buyPrice = polymarketPrice;
      sellPlatform = 'predict';
      sellPrice = predictPrice;
    }

    // 计算价差
    const priceDiff = sellPrice - buyPrice;
    const priceDiffPercent = buyPrice > 0 ? priceDiff / buyPrice : 0;

    // 计算手续费 (双边)
    const totalFee = predictMarket.feeRate + polymarketMarket.feeRate;

    // 计算ROI (扣除手续费后)
    const grossRoi = priceDiffPercent;
    const roi = grossRoi - totalFee;
    const netProfit = priceDiff * (1 - totalFee);

    // 检查是否满足最小收益率
    if (roi < settings.minProfitPercent / 100) return null;
    if (roi > settings.maxProfitPercent / 100) return null;

    // 检查流动性
    const minLiquidity = Math.min(predictMarket.liquidity, polymarketMarket.liquidity);
    if (minLiquidity < settings.minLiquidity) return null;

    // 检查交易量
    const minVolume = Math.min(predictMarket.volume24h, polymarketMarket.volume24h);
    if (minVolume < settings.minVolume24h) return null;

    // 计算置信度
    const confidence = this.calculateConfidence(roi, minLiquidity, minVolume);
    if (!this.meetsMinConfidence(confidence, settings.minConfidence)) return null;

    // 计算建议投入金额 (不超过流动性的10%, 最大$10,000)
    const recommendedAmount = Math.min(minLiquidity * 0.1, 10000);

    const direction = buyPlatform === 'predict' ? 'predict_to_polymarket' : 'polymarket_to_predict';
    const conditionId = predictMarket.conditionId;

    return {
      id: `arb-${conditionId}-${tokenType}-${Date.now()}`,
      conditionId,
      categorySlug: predictMarket.categorySlug,
      title: predictMarket.title,
      predictMarket,
      polymarketMarket,
      direction,
      tokenType,
      buyPlatform,
      buyPrice,
      sellPlatform,
      sellPrice,
      priceDiff,
      priceDiffPercent,
      roi,
      netProfit,
      confidence,
      recommendedAmount,
      detectedAt: Date.now(),
    };
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(
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

  /**
   * 检查是否满足最小置信度要求
   */
  private meetsMinConfidence(
    confidence: 'high' | 'medium' | 'low',
    minConfidence: 'high' | 'medium' | 'low'
  ): boolean {
    const levels = { high: 3, medium: 2, low: 1 };
    return levels[confidence] >= levels[minConfidence];
  }

  /**
   * 获取统计数据
   */
  getStats(opportunities: ArbitrageOpportunity[]) {
    const total = opportunities.length;
    const highConfidence = opportunities.filter(o => o.confidence === 'high').length;
    const mediumConfidence = opportunities.filter(o => o.confidence === 'medium').length;
    const lowConfidence = opportunities.filter(o => o.confidence === 'low').length;
    
    const avgRoi = total > 0 
      ? opportunities.reduce((sum, o) => sum + o.roi, 0) / total 
      : 0;
    
    const maxRoi = total > 0 
      ? Math.max(...opportunities.map(o => o.roi)) 
      : 0;

    return {
      total,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      avgRoi,
      maxRoi,
    };
  }
}

// 单例实例
export const arbitrageService = new ArbitrageService();
