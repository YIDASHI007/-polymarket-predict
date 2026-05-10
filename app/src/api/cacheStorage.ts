// localStorage 缓存工具
// 从 api/client.ts 抽出，集中管理前端市场数据缓存键与读写策略

import type { UnifiedMarket } from '@/types';

/** 市场数据缓存键（分别存储，由 marketStore 合并） */
export const MARKET_CACHE_KEYS = {
  PREDICT_MARKETS: 'markets_cache_predict_v3',
  PREDICT_TIME: 'markets_cache_predict_time_v3',
  POLYMARKET_MARKETS: 'markets_cache_polymarket_v3',
  POLYMARKET_TIME: 'markets_cache_polymarket_time_v3',
} as const;

export const CACHE_MAX_AGE_MS = 10 * 60 * 1000; // 10 分钟

/**
 * 从 localStorage 读取市场缓存。
 * - 超过 2 倍最大年龄视作过期，返回 null
 * - 解析失败返回 null
 */
export function getCachedMarkets(
  key: string,
  timeKey: string,
  maxAgeMs: number = CACHE_MAX_AGE_MS * 2
): UnifiedMarket[] | null {
  try {
    const cached = localStorage.getItem(key);
    const cachedAt = localStorage.getItem(timeKey);
    if (!cached || !cachedAt) return null;

    const age = Date.now() - Number(cachedAt);
    if (age > maxAgeMs) {
      console.log(`[Cache] Data too old (${Math.floor(age / 1000)}s), ignoring`);
      return null;
    }

    const data = JSON.parse(cached) as UnifiedMarket[];
    console.log(`[Cache] Loaded ${data.length} markets from cache (${Math.floor(age / 1000)}s old)`);
    return data;
  } catch (err) {
    console.warn('[Cache] Failed to load from cache:', err);
    return null;
  }
}

/** 将市场列表写入 localStorage 缓存 */
export function saveMarketsToCache(key: string, timeKey: string, markets: UnifiedMarket[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(markets));
    localStorage.setItem(timeKey, String(Date.now()));
    console.log(`[Cache] Saved ${markets.length} markets to cache`);
  } catch (err) {
    console.warn('[Cache] Failed to save to cache:', err);
  }
}
