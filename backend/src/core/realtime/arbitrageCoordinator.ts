// 实时套利协调器 —— 把订阅层和引擎层连起来的"大脑"
//
// 设计目标：
//   1. 外部只需调用 watchPair(pair) 就开始实时监控该对市场
//   2. 订单簿每次更新 → 自动触发 scanPair → 机会变化时发 'opportunity' 事件
//   3. 背压保护：同一 pair 在 minRescanMs 窗口内至多扫描一次（避免 price_change 风暴下 CPU 占满）
//   4. 对外暴露：当前所有活跃机会快照、连接状态、订阅统计
//
// 事件：
//   'opportunity'     : (opportunity: ArbOpportunity) => void  新/更新的机会
//   'opportunity_gone': (pairId: string) => void               机会消失（价差回归）
//   'state'           : (snapshot: CoordinatorState) => void   汇总状态变化

import { EventEmitter } from 'events';
import {
  ArbOpportunity,
  DEFAULT_FEE_CONFIG,
  DEFAULT_SCAN_CONFIG,
  FeeConfig,
  MarketPair,
  Orderbook,
  ScanConfig,
  scanPair,
} from '../arbitrage';
import { PolymarketFeed } from './polymarketFeed';
import { PredictFeed } from './predictFeed';
import type { ConnectionState, OrderbookUpdate } from './types';

export interface CoordinatorOptions {
  readonly feeConfig?: FeeConfig;
  readonly scanConfig?: ScanConfig;
  /** 同一 pair 两次扫描间最小间隔（默认 200ms）*/
  readonly minRescanMs?: number;
  /** 订单簿无更新多久后移除对应机会（默认 60s）*/
  readonly opportunityTtlMs?: number;
  readonly polymarketUrl?: string;
  readonly predictUrl?: string;
}

export interface CoordinatorState {
  readonly polymarket: ConnectionState;
  readonly predict: ConnectionState;
  readonly pairs: number;
  readonly activeOpportunities: number;
  readonly scansPerSecond: number;
}

interface WatchedPair {
  readonly pair: MarketPair;
  lastScanAt: number;
  lastOpportunityId: string | null;
  scheduled: boolean;
}

export class ArbitrageCoordinator extends EventEmitter {
  private readonly polyFeed: PolymarketFeed;
  private readonly predictFeed: PredictFeed;
  private readonly feeConfig: FeeConfig;
  private readonly scanConfig: ScanConfig;
  private readonly minRescanMs: number;
  private readonly opportunityTtlMs: number;

  private readonly pairs = new Map<string, WatchedPair>();
  private readonly opportunitiesByPair = new Map<string, ArbOpportunity>();

  // 订阅引用计数：同一 assetId / marketId 可能被多个 pair 共享
  private readonly polyRefs = new Map<string, number>();    // assetId → count
  private readonly predictRefs = new Map<string, number>(); // marketId → count

  // 性能指标（滑动 1 秒窗口）
  private scanTimestamps: number[] = [];

  constructor(options: CoordinatorOptions = {}) {
    super();
    this.feeConfig = options.feeConfig ?? DEFAULT_FEE_CONFIG;
    this.scanConfig = options.scanConfig ?? DEFAULT_SCAN_CONFIG;
    this.minRescanMs = options.minRescanMs ?? 200;
    this.opportunityTtlMs = options.opportunityTtlMs ?? 60_000;

    this.polyFeed = new PolymarketFeed({ url: options.polymarketUrl });
    this.predictFeed = new PredictFeed({ url: options.predictUrl });

    this.polyFeed.on('orderbook', (u: OrderbookUpdate) => this.onOrderbookUpdate(u));
    this.predictFeed.on('orderbook', (u: OrderbookUpdate) => this.onOrderbookUpdate(u));
    this.polyFeed.on('state', () => this.emitState());
    this.predictFeed.on('state', () => this.emitState());
  }

  // ---------- Lifecycle ----------

  async start(): Promise<void> {
    await Promise.all([this.polyFeed.start(), this.predictFeed.start()]);
  }

  async stop(): Promise<void> {
    await Promise.all([this.polyFeed.stop(), this.predictFeed.stop()]);
    this.pairs.clear();
    this.opportunitiesByPair.clear();
    this.polyRefs.clear();
    this.predictRefs.clear();
  }

  // ---------- Pair management ----------

  async watchPair(pair: MarketPair): Promise<void> {
    if (this.pairs.has(pair.pairId)) return;

    this.pairs.set(pair.pairId, {
      pair,
      lastScanAt: 0,
      lastOpportunityId: null,
      scheduled: false,
    });

    // Polymarket: YES + NO 两个 assetId
    const polySubs: { assetId: string; outcome: 'yes' | 'no' }[] = [];
    const yesId = pair.polymarket.yesAssetId;
    const noId = pair.polymarket.noAssetId;
    if (this.incPolyRef(yesId)) polySubs.push({ assetId: yesId, outcome: 'yes' });
    if (this.incPolyRef(noId)) polySubs.push({ assetId: noId, outcome: 'no' });
    if (polySubs.length > 0) {
      await this.polyFeed.subscribe(
        polySubs.map((s) => ({ venue: 'polymarket' as const, assetId: s.assetId, outcome: s.outcome }))
      );
    }

    // Predict: marketId (只订一次，合成 NO)
    if (this.incPredictRef(pair.predict.marketId)) {
      await this.predictFeed.subscribe([
        { venue: 'predict', marketId: pair.predict.marketId },
      ]);
    }

    this.emitState();
  }

  async unwatchPair(pairId: string): Promise<void> {
    const w = this.pairs.get(pairId);
    if (!w) return;
    this.pairs.delete(pairId);

    const yesId = w.pair.polymarket.yesAssetId;
    const noId = w.pair.polymarket.noAssetId;
    const marketId = w.pair.predict.marketId;

    const toRemovePoly: typeof yesId[] = [];
    if (this.decPolyRef(yesId)) toRemovePoly.push(yesId);
    if (this.decPolyRef(noId)) toRemovePoly.push(noId);
    if (toRemovePoly.length > 0) {
      await this.polyFeed.unsubscribe(
        toRemovePoly.flatMap((aid) => [
          { venue: 'polymarket' as const, assetId: aid, outcome: 'yes' as const },
          { venue: 'polymarket' as const, assetId: aid, outcome: 'no' as const },
        ])
      );
    }

    if (this.decPredictRef(marketId)) {
      await this.predictFeed.unsubscribe([{ venue: 'predict', marketId }]);
    }

    // 回收该 pair 的机会
    if (this.opportunitiesByPair.delete(pairId)) {
      this.emit('opportunity_gone', pairId);
    }

    this.emitState();
  }

  listPairs(): readonly MarketPair[] {
    return Array.from(this.pairs.values()).map((w) => w.pair);
  }

  listOpportunities(): readonly ArbOpportunity[] {
    const now = Date.now();
    const alive: ArbOpportunity[] = [];
    for (const [pairId, opp] of this.opportunitiesByPair) {
      if (opp.expiresAt < now) {
        this.opportunitiesByPair.delete(pairId);
        this.emit('opportunity_gone', pairId);
        continue;
      }
      alive.push(opp);
    }
    return alive.sort((a, b) => b.roiPct - a.roiPct);
  }

  getCoordinatorState(): CoordinatorState {
    this.trimScanWindow();
    return {
      polymarket: this.polyFeed.getConnectionState(),
      predict: this.predictFeed.getConnectionState(),
      pairs: this.pairs.size,
      activeOpportunities: this.opportunitiesByPair.size,
      scansPerSecond: this.scanTimestamps.length,
    };
  }

  // ---------- Internals ----------

  private onOrderbookUpdate(update: OrderbookUpdate): void {
    // 找出所有受该订单簿影响的 pair，扫描之
    const { orderbook } = update;
    for (const [pairId, w] of this.pairs) {
      if (!this.pairAffectedBy(w.pair, orderbook)) continue;
      this.scheduleScan(pairId, w);
    }
  }

  private pairAffectedBy(pair: MarketPair, ob: Orderbook): boolean {
    if (ob.venue === 'polymarket') {
      return ob.marketKey === pair.polymarket.yesAssetId || ob.marketKey === pair.polymarket.noAssetId;
    }
    // predict: 合成 NO 的 marketKey 会带 "::no" 后缀
    const base = ob.marketKey.replace(/::no$/, '');
    return base === pair.predict.marketId;
  }

  private scheduleScan(pairId: string, w: WatchedPair): void {
    const now = Date.now();
    const dt = now - w.lastScanAt;
    if (w.scheduled) return;
    if (dt >= this.minRescanMs) {
      this.runScan(pairId, w, now);
      return;
    }
    w.scheduled = true;
    setTimeout(() => {
      w.scheduled = false;
      this.runScan(pairId, w, Date.now());
    }, this.minRescanMs - dt);
  }

  private runScan(pairId: string, w: WatchedPair, now: number): void {
    w.lastScanAt = now;
    this.scanTimestamps.push(now);
    this.trimScanWindow(now);

    const polyYes = this.polyFeed.getOrderbook({
      venue: 'polymarket',
      assetId: w.pair.polymarket.yesAssetId,
      outcome: 'yes',
    });
    const polyNo = this.polyFeed.getOrderbook({
      venue: 'polymarket',
      assetId: w.pair.polymarket.noAssetId,
      outcome: 'no',
    });
    const predictYes = this.predictFeed.getOrderbook({
      venue: 'predict',
      marketId: w.pair.predict.marketId,
    });
    // 合成 NO 的 key 是 "<marketId>::no"
    const predictNoKey = `${w.pair.predict.marketId}::no`;
    const predictNo = (this.predictFeed as unknown as { orderbooks: Map<string, Orderbook> }).orderbooks.get(
      `predict:${predictNoKey}`
    );

    const result = scanPair({
      pair: w.pair,
      snapshot: { polyYes, polyNo, predictYes, predictNo },
      feeConfig: this.feeConfig,
      scanConfig: this.scanConfig,
    });

    if (result.opportunity) {
      const prev = this.opportunitiesByPair.get(pairId);
      this.opportunitiesByPair.set(pairId, result.opportunity);
      const changed =
        !prev ||
        Math.abs(prev.roiPct - result.opportunity.roiPct) > 0.01 ||
        Math.abs(prev.shares - result.opportunity.shares) > 1 ||
        prev.strategy !== result.opportunity.strategy;
      if (changed) {
        this.emit('opportunity', result.opportunity);
      }
    } else {
      if (this.opportunitiesByPair.delete(pairId)) {
        this.emit('opportunity_gone', pairId);
      }
    }
  }

  private trimScanWindow(now: number = Date.now()): void {
    const cutoff = now - 1000;
    while (this.scanTimestamps.length > 0 && this.scanTimestamps[0] < cutoff) {
      this.scanTimestamps.shift();
    }
  }

  private emitState(): void {
    this.emit('state', this.getCoordinatorState());
  }

  // --- ref counters ---

  private incPolyRef(assetId: string): boolean {
    const n = (this.polyRefs.get(assetId) ?? 0) + 1;
    this.polyRefs.set(assetId, n);
    return n === 1; // 第一次订阅
  }
  private decPolyRef(assetId: string): boolean {
    const n = (this.polyRefs.get(assetId) ?? 0) - 1;
    if (n <= 0) {
      this.polyRefs.delete(assetId);
      return true; // 没人用了
    }
    this.polyRefs.set(assetId, n);
    return false;
  }
  private incPredictRef(marketId: string): boolean {
    const n = (this.predictRefs.get(marketId) ?? 0) + 1;
    this.predictRefs.set(marketId, n);
    return n === 1;
  }
  private decPredictRef(marketId: string): boolean {
    const n = (this.predictRefs.get(marketId) ?? 0) - 1;
    if (n <= 0) {
      this.predictRefs.delete(marketId);
      return true;
    }
    this.predictRefs.set(marketId, n);
    return false;
  }
}
