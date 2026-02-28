import { EventEmitter } from 'events';
import {
  ArbResultOutput,
  ArbStep,
  CardOutputEvent,
  CardParams,
  CardStateOutput,
  ConnectionStateIngestEvent,
  MarketSnapshotOutput,
  MonitorCardInput,
  MonitorCardState,
  NormalizedOrderbook,
  OrderbookIngestEvent,
  Outcome,
  ParamsEchoOutput,
  PriceLevel,
} from './types';

interface CardRuntime {
  input: MonitorCardInput;
  state: MonitorCardState;
  snapshot: {
    poly: { yes: NormalizedOrderbook | null; no: NormalizedOrderbook | null };
    predict: { yes: NormalizedOrderbook | null; no: NormalizedOrderbook | null };
  };
}

function nowTs(): number {
  return Date.now();
}

function sortAsks(levels: PriceLevel[]): PriceLevel[] {
  return [...levels].sort((a, b) => a.price - b.price);
}

function applyExecutionCosts(price: number, params: CardParams): number {
  const bps = (params.feeBps + params.slippageBps) / 10000;
  return price * (1 + bps);
}

function maxCombo(
  levels1: PriceLevel[],
  levels2: PriceLevel[],
  leg1: string,
  leg2: string,
  params: CardParams
): { qty: number; costTotal: number; payoutTotal: number; grossProfit: number; netProfit: number; steps: ArbStep[] } {
  const l1 = sortAsks(levels1);
  const l2 = sortAsks(levels2);

  let i = 0;
  let j = 0;
  let rem1 = l1[0]?.size ?? 0;
  let rem2 = l2[0]?.size ?? 0;

  let qty = 0;
  let rawCost = 0;
  const steps: ArbStep[] = [];

  while (i < l1.length && j < l2.length) {
    const p1 = applyExecutionCosts(l1[i].price, params);
    const p2 = applyExecutionCosts(l2[j].price, params);
    const edge = 1 - (p1 + p2);
    if (edge <= 0) break;

    const dq = Math.min(rem1, rem2);
    if (dq <= 0) break;

    qty += dq;
    rawCost += dq * (p1 + p2);

    steps.push({
      qty: dq,
      leg1,
      leg2,
      price1: p1,
      price2: p2,
      edgePerShare: edge,
    });

    rem1 -= dq;
    rem2 -= dq;

    if (rem1 <= 1e-12) {
      i += 1;
      rem1 = l1[i]?.size ?? 0;
    }
    if (rem2 <= 1e-12) {
      j += 1;
      rem2 = l2[j]?.size ?? 0;
    }
  }

  const payoutTotal = qty;
  const grossProfit = payoutTotal - rawCost;
  const netProfit = grossProfit;

  return {
    qty,
    costTotal: rawCost,
    payoutTotal,
    grossProfit,
    netProfit,
    steps,
  };
}

export class RealtimeArbitrageModule extends EventEmitter {
  private cards = new Map<string, CardRuntime>();

  startCard(input: MonitorCardInput): void {
    const state: MonitorCardState = {
      cardId: input.cardId,
      status: 'starting',
      message: 'monitor started',
      updatedAt: nowTs(),
    };

    const runtime: CardRuntime = {
      input,
      state,
      snapshot: {
        poly: { yes: null, no: null },
        predict: { yes: null, no: null },
      },
    };

    this.cards.set(input.cardId, runtime);
    this.emitCardState(runtime);
    this.emitParamsEcho(runtime);
  }

  stopCard(cardId: string): void {
    const runtime = this.cards.get(cardId);
    if (!runtime) return;

    runtime.state = {
      ...runtime.state,
      status: 'stopped',
      message: 'monitor stopped',
      updatedAt: nowTs(),
    };

    this.emitCardState(runtime);
    this.cards.delete(cardId);
  }

  updateCardParams(cardId: string, params: CardParams): void {
    const runtime = this.cards.get(cardId);
    if (!runtime) return;
    runtime.input = { ...runtime.input, params };
    this.emitParamsEcho(runtime);
    this.recompute(runtime);
  }

  ingestOrderbook(event: OrderbookIngestEvent): void {
    for (const runtime of this.cards.values()) {
      const isPoly = event.venue === 'polymarket';
      const isPredict = event.venue === 'predict';

      if (isPoly) {
        const polyYes = runtime.input.polymarket.yesId;
        const polyNo = runtime.input.polymarket.noId;
        if (event.marketId === polyYes && event.outcome === 'yes') {
          runtime.snapshot.poly.yes = event.orderbook;
          this.markRunning(runtime);
          this.emitSnapshot(runtime);
          this.recompute(runtime);
        }
        if (event.marketId === polyNo && event.outcome === 'no') {
          runtime.snapshot.poly.no = event.orderbook;
          this.markRunning(runtime);
          this.emitSnapshot(runtime);
          this.recompute(runtime);
        }
      }

      if (isPredict) {
        const predictId = runtime.input.predict.marketId;
        if (event.marketId === predictId && event.outcome === 'yes') {
          runtime.snapshot.predict.yes = event.orderbook;
          this.markRunning(runtime);
          this.emitSnapshot(runtime);
          this.recompute(runtime);
        }
        if (event.marketId === predictId && event.outcome === 'no') {
          runtime.snapshot.predict.no = event.orderbook;
          this.markRunning(runtime);
          this.emitSnapshot(runtime);
          this.recompute(runtime);
        }
      }
    }
  }

  ingestConnectionState(event: ConnectionStateIngestEvent): void {
    for (const runtime of this.cards.values()) {
      runtime.state = {
        ...runtime.state,
        status: event.status,
        message: `[${event.venue}] ${event.message}`,
        updatedAt: nowTs(),
      };
      this.emitCardState(runtime);
    }
  }

  getCard(cardId: string): CardRuntime | undefined {
    return this.cards.get(cardId);
  }

  subscribe(listener: (event: CardOutputEvent) => void): () => void {
    const handler = (event: CardOutputEvent): void => listener(event);
    this.on('output', handler);
    return () => this.off('output', handler);
  }

  private emitOutput(event: CardOutputEvent): void {
    this.emit('output', event);
  }

  private emitCardState(runtime: CardRuntime): void {
    const event: CardStateOutput = {
      type: 'card_state',
      cardId: runtime.input.cardId,
      status: runtime.state.status,
      message: runtime.state.message,
      updatedAt: runtime.state.updatedAt,
    };
    this.emitOutput(event);
  }

  private emitParamsEcho(runtime: CardRuntime): void {
    const p = runtime.input.params;
    const event: ParamsEchoOutput = {
      type: 'params_echo',
      cardId: runtime.input.cardId,
      feeBps: p.feeBps,
      slippageBps: p.slippageBps,
      minProfit: p.minProfit,
      minDepth: p.minDepth,
      ts: nowTs(),
    };
    this.emitOutput(event);
  }

  private emitSnapshot(runtime: CardRuntime): void {
    const event: MarketSnapshotOutput = {
      type: 'market_snapshot',
      cardId: runtime.input.cardId,
      poly: runtime.snapshot.poly,
      predict: runtime.snapshot.predict,
      ts: nowTs(),
    };
    this.emitOutput(event);
  }

  private markRunning(runtime: CardRuntime): void {
    if (runtime.state.status === 'running') return;
    runtime.state = {
      ...runtime.state,
      status: 'running',
      message: 'data stream active',
      updatedAt: nowTs(),
    };
    this.emitCardState(runtime);
  }

  private recompute(runtime: CardRuntime): void {
    const polyYes = runtime.snapshot.poly.yes?.asks ?? [];
    const polyNo = runtime.snapshot.poly.no?.asks ?? [];
    const predYes = runtime.snapshot.predict.yes?.asks ?? [];
    const predNo = runtime.snapshot.predict.no?.asks ?? [];

    if (!polyYes.length || !polyNo.length || !predYes.length || !predNo.length) {
      this.emitArbResult({
        type: 'arb_result',
        cardId: runtime.input.cardId,
        hasOpportunity: false,
        strategy: 'none',
        qty: 0,
        costTotal: 0,
        payoutTotal: 0,
        grossProfit: 0,
        netProfit: 0,
        profitRate: 0,
        minDepthSatisfied: false,
        reason: 'insufficient depth on one or more legs',
        steps: [],
        ts: nowTs(),
      });
      return;
    }

    const params = runtime.input.params;

    const c1 = maxCombo(polyYes, predNo, 'buy_poly_yes', 'buy_predict_no', params);
    const c2 = maxCombo(polyNo, predYes, 'buy_poly_no', 'buy_predict_yes', params);

    const selected = c1.netProfit >= c2.netProfit
      ? { strategy: 'poly_yes_predict_no' as const, value: c1 }
      : { strategy: 'poly_no_predict_yes' as const, value: c2 };

    const cost = selected.value.costTotal;
    const profitRate = cost > 0 ? selected.value.netProfit / cost : 0;
    const minDepthSatisfied = selected.value.qty >= params.minDepth;
    const hasOpportunity = profitRate >= params.minProfit && minDepthSatisfied;

    this.emitArbResult({
      type: 'arb_result',
      cardId: runtime.input.cardId,
      hasOpportunity,
      strategy: hasOpportunity ? selected.strategy : 'none',
      qty: selected.value.qty,
      costTotal: selected.value.costTotal,
      payoutTotal: selected.value.payoutTotal,
      grossProfit: selected.value.grossProfit,
      netProfit: selected.value.netProfit,
      profitRate,
      minDepthSatisfied,
      reason: hasOpportunity
        ? 'opportunity detected'
        : profitRate < params.minProfit
          ? 'profit rate below minProfit threshold'
          : 'depth below minDepth threshold',
      steps: selected.value.steps,
      ts: nowTs(),
    });
  }

  private emitArbResult(event: ArbResultOutput): void {
    this.emitOutput(event);
  }
}
