// 市场数据定时刷新调度器
// 从 markets-cached-v2.ts 抽离，职责单一化
//
// 职责：
//   1. 启动时根据缓存情况决定是否立刻拉一次
//   2. 每 10 分钟调用一次 Predict + Polymarket API 更新缓存
//   3. 提供 manual refresh 入口（被 /markets/refresh 路由调用）
//   4. 对外暴露全局状态（lastUpdate / nextScheduledUpdate / isUpdating / version）

import { createPredictService } from '../services/predictService';
import { polymarketService } from '../services/polymarketService';
import { cacheService } from '../utils/cache';
import { env } from '../config/env';

const TEN_MINUTES = 10 * 60 * 1000;
const UPDATE_TIMEOUT = 5 * 60 * 1000; // 5 分钟超时保护
const STARTUP_DELAY = 5000;

interface SchedulerState {
  lastBackendUpdate: number;
  nextScheduledUpdate: number;
  isUpdating: boolean;
  updateStartTime: number;
  dataVersion: number;
}

const state: SchedulerState = {
  lastBackendUpdate: 0,
  nextScheduledUpdate: 0,
  isUpdating: false,
  updateStartTime: 0,
  dataVersion: 0,
};

// ============ 状态只读访问 ============

export function getSchedulerState(): Readonly<SchedulerState> {
  return state;
}

export function markManualUpdateStart(): boolean {
  // 超时保护：如果卡在 isUpdating 超过 5 分钟，自动释放
  if (state.isUpdating && Date.now() - state.updateStartTime > UPDATE_TIMEOUT) {
    console.warn('[Scheduler] Previous update exceeded timeout, resetting');
    state.isUpdating = false;
  }
  if (state.isUpdating) return false;

  state.isUpdating = true;
  state.updateStartTime = Date.now();
  return true;
}

export function markManualUpdateEnd() {
  state.isUpdating = false;
  state.updateStartTime = 0;
  state.lastBackendUpdate = Date.now();
  state.dataVersion = Date.now();
}

// ============ 核心更新函数 ============

/**
 * 执行一次完整的缓存刷新（Predict + Polymarket）
 * 如果没有 PREDICT_FUN_API_KEY，则只刷新 Polymarket（不再使用硬编码 fallback）
 */
async function performRefresh(source: string): Promise<void> {
  const apiKey = env.PREDICT_FUN_API_KEY;

  if (state.isUpdating) {
    console.log(`[Scheduler:${source}] Update already in progress, skipping`);
    return;
  }

  state.isUpdating = true;
  state.updateStartTime = Date.now();
  console.log(`[Scheduler:${source}] Starting cache update...`);

  try {
    const tasks: Promise<unknown>[] = [polymarketService.fetchFromAPI()];

    if (apiKey) {
      const predictService = createPredictService(apiKey);
      tasks.push(predictService.fetchFromAPI());
    } else {
      console.warn(
        `[Scheduler:${source}] PREDICT_FUN_API_KEY not configured — Predict.fun data will not be refreshed`
      );
    }

    await Promise.all(tasks);
    state.lastBackendUpdate = Date.now();
    state.dataVersion = Date.now();
    console.log(`[Scheduler:${source}] Update complete, version=${state.dataVersion}`);
  } catch (err) {
    console.error(`[Scheduler:${source}] Update failed:`, err);
  } finally {
    state.isUpdating = false;
    state.updateStartTime = 0;
  }
}

// ============ 启动入口 ============

/**
 * 启动定时刷新调度器。
 * - 初始化 dataVersion（读 cache.json 文件 mtime）
 * - 5s 后若缓存空则立即补一次
 * - 此后每 10 分钟刷一次
 */
export function startMarketRefresher() {
  initVersionFromCacheFile();

  state.nextScheduledUpdate = Date.now() + TEN_MINUTES;

  // 定时任务
  setInterval(async () => {
    try {
      await performRefresh('Scheduled');
    } finally {
      state.nextScheduledUpdate = Date.now() + TEN_MINUTES;
    }
  }, TEN_MINUTES);

  // 启动后 warmup（缓存空时）
  setTimeout(async () => {
    const predictCache = cacheService.get('predict-all-markets-v4');
    const polymarketCache = cacheService.get('polymarket-active-markets-v2');

    if (!predictCache || !polymarketCache) {
      console.log('[Scheduler:Startup] Cache empty, triggering initial fetch');
      await performRefresh('Startup');
    } else {
      console.log('[Scheduler:Startup] Cache exists, skipping initial fetch');
    }
  }, STARTUP_DELAY);
}

function initVersionFromCacheFile() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require('path');
    const cacheFile = path.join(process.cwd(), 'data', 'cache.json');
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      state.dataVersion = stat.mtimeMs;
      console.log(`[Scheduler:Init] Cache file exists, version=${state.dataVersion}`);
    }
  } catch {
    console.log('[Scheduler:Init] Failed to read cache file version (non-fatal)');
  }
}
