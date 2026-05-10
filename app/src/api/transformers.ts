// 前端数据转换工具 - 从第三方 API 原始数据转换为 UnifiedMarket
// 从 api/client.ts 抽出，保持纯函数，便于测试

import type { UnifiedMarket } from '@/types';

/**
 * 将 Polymarket events API 返回的事件转换为统一市场格式（前端直连 fallback 使用）
 */
export function transformPolymarketEvent(event: any): UnifiedMarket {
  let yesPrice = 0;
  let noPrice = 0;
  let volume = 0;
  let liquidity = 0;
  let conditionId = event.conditionId || '';
  let clobTokenIds: string[] = [];

  if (event.markets && event.markets.length > 0) {
    const firstMarket = event.markets[0];

    try {
      const outcomePrices = firstMarket.outcomePrices;
      if (outcomePrices) {
        const prices =
          typeof outcomePrices === 'string' ? JSON.parse(outcomePrices) : outcomePrices;
        if (Array.isArray(prices) && prices.length >= 2) {
          yesPrice = parseFloat(prices[0]) || 0;
          noPrice = parseFloat(prices[1]) || 0;
        }
      }
    } catch (e) {
      console.warn('Failed to parse prices for event:', event.id);
    }

    volume = firstMarket.volume || 0;
    liquidity = firstMarket.liquidity || 0;
    conditionId = firstMarket.conditionId || conditionId;
    clobTokenIds = normalizeClobTokenIds(firstMarket.clobTokenIds);
  }

  return {
    id: `polymarket-${event.id}`,
    source: 'polymarket',
    sourceId: event.id,
    conditionId,
    categorySlug: extractCategoryFromSlug(event.slug),
    title: event.title,
    description: event.description || '',
    url: `https://polymarket.com/event/${event.slug}`,
    isActive: event.active,
    isTradable: event.active && !event.closed,
    yesPrice,
    noPrice,
    yesPriceChange24h: 0,
    noPriceChange24h: 0,
    volume24h: event.volume24hr || 0,
    volumeTotal: event.volume || volume,
    liquidity: event.liquidity || liquidity,
    lastUpdated: Date.now(),
    feeRate: 0.002,
    endDate: event.endDate,
    clobTokenIds,
  };
}

/**
 * 将 Predict.fun 原始市场数据转换为统一市场格式（兼容后端未转换的情况）
 */
export function transformPredictMarket(market: any): UnifiedMarket {
  // 后端已经转换为 UnifiedMarket 时直接返回
  if (market.source === 'predict') {
    return market as UnifiedMarket;
  }

  const yesPrice = market.yesPrice || 0.5;
  return {
    id: `predict-${market.id}`,
    source: 'predict',
    sourceId: market.id,
    conditionId: market.conditionId,
    categorySlug: market.categorySlug,
    parentTitle: market.parentTitle,
    title: market.title,
    description: market.description || '',
    url: market.url || `https://predict.fun/market/${market.id}`,
    isActive: market.isActive !== undefined ? market.isActive : market.status === 'REGISTERED',
    isTradable:
      market.isTradable !== undefined
        ? market.isTradable
        : market.status === 'REGISTERED' && market.tradingStatus === 'OPEN',
    yesPrice,
    noPrice: 1 - yesPrice,
    yesPriceChange24h: 0,
    noPriceChange24h: 0,
    volume24h: market.volume24h || 0,
    volumeTotal: market.volume || 0,
    liquidity: market.liquidity || 0,
    lastUpdated: Date.now(),
    feeRate: 0.002,
    endDate: market.endDate || market.endsAt,
    polymarketConditionIds: Array.isArray(market.polymarketConditionIds)
      ? market.polymarketConditionIds.map(String)
      : [],
  };
}

/** 规范化 clobTokenIds，可能是 string/array/JSON-string */
export function normalizeClobTokenIds(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(String).filter(Boolean);
      }
    } catch {
      // fallback 到字符串 split
    }
    return raw
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((v) => v.replace(/^"+|"+$/g, '').trim())
      .filter(Boolean);
  }
  return [];
}

/** 从 slug 里猜测分类 */
export function extractCategoryFromSlug(slug?: string): string | undefined {
  if (!slug) return undefined;
  const categories = ['crypto', 'bitcoin', 'ethereum', 'politics', 'sports', 'finance', 'entertainment'];
  for (const cat of categories) {
    if (slug.includes(cat)) return cat;
  }
  return undefined;
}
