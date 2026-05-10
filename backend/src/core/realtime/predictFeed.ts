// Predict.fun WebSocket 客户端
//
// 协议（已在 APIdock/app.py 验证）：
//   URL:     wss://ws.predict.fun/ws
//   订阅:    { method: "subscribe", requestId: <n>, params: ["predictOrderbook/<marketId>"] }
//   取消:    { method: "unsubscribe", requestId: <n>, params: [...] }
//   消息:    { type: "M", topic: "predictOrderbook/<marketId>", data: { marketId, bids, asks, updateTimestampMs } }
//   心跳:    服务端 { type: "M", topic: "heartbeat", data: <ts> }
//           客户端必须回 { method: "heartbeat", data: <ts> }
//
// 订单簿语义：Predict 的 orderbook 只给 YES 侧。
//   NO 侧 orderbook 由 arbitrage/orderbookSynth 合成（NO_ask = 1 - YES_bid）

import { WsBaseClient, WsBaseOptions } from './wsBase';
import type { SubscriptionKey } from './types';
import type { Orderbook, PriceLevel } from '../arbitrage/types';
import { synthesizeNoFromYes } from '../arbitrage/orderbookSynth';

const DEFAULT_URL = 'wss://ws.predict.fun/ws';

interface PredictBookData {
  readonly marketId?: string;
  readonly bids?: readonly unknown[];
  readonly asks?: readonly unknown[];
  readonly updateTimestampMs?: number | string;
  readonly timestamp?: number | string;
}

interface PredictMessage {
  readonly type?: 'M' | string;
  readonly topic?: string;
  readonly data?: unknown;
  readonly requestId?: number;
}

export class PredictFeed extends WsBaseClient {
  private requestIdCounter = 1;

  /**
   * 如果 emitSyntheticNo = true，当收到 YES 的 orderbook 时，
   * 会同时合成并 emit 一个 NO orderbook。默认开启。
   */
  private readonly emitSyntheticNo: boolean;

  constructor(options: Partial<WsBaseOptions> & { emitSyntheticNo?: boolean } = {}) {
    super({ venue: 'predict', url: options.url ?? DEFAULT_URL, ...options });
    this.emitSyntheticNo = options.emitSyntheticNo ?? true;
  }

  protected sendSubscribe(keys: readonly SubscriptionKey[]): void {
    const params: string[] = [];
    for (const k of keys) {
      if (k.venue !== 'predict') continue;
      params.push(`predictOrderbook/${k.marketId}`);
    }
    if (params.length === 0) return;
    this.safeSend({
      method: 'subscribe',
      requestId: this.nextRequestId(),
      params,
    });
  }

  protected sendUnsubscribe(keys: readonly SubscriptionKey[]): void {
    const params: string[] = [];
    for (const k of keys) {
      if (k.venue !== 'predict') continue;
      params.push(`predictOrderbook/${k.marketId}`);
    }
    if (params.length === 0) return;
    this.safeSend({
      method: 'unsubscribe',
      requestId: this.nextRequestId(),
      params,
    });
  }

  protected sendHeartbeat(): void {
    // Predict 的心跳是 server-push，客户端只在收到时回 ack。
    // 但为防连接僵死，我们额外主动发一个 ping-like ack（服务端会忽略未知 topic，不会断）。
    // 默认空操作，真正的 ack 在 handleMessage 里发出。
  }

  protected handleMessage(raw: string): void {
    let parsed: PredictMessage;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;

    // Heartbeat ack
    if (parsed.type === 'M' && parsed.topic === 'heartbeat') {
      this.safeSend({ method: 'heartbeat', data: parsed.data });
      return;
    }

    // Orderbook push
    if (
      parsed.type === 'M' &&
      typeof parsed.topic === 'string' &&
      parsed.topic.startsWith('predictOrderbook/')
    ) {
      const data = extractBookPayload(parsed.data);
      const marketId =
        String(data?.marketId ?? '').trim() ||
        parsed.topic.slice('predictOrderbook/'.length);
      if (!marketId) return;

      const yesBook = this.buildYesBook(marketId, data);
      if (!yesBook) return;

      this.setOrderbook(yesBook);

      if (this.emitSyntheticNo) {
        // 注：合成 NO 的 marketKey 加后缀 ':no'，和 YES 订阅区分。
        // 下游扫描器读的时候也按同样命名查找。
        const noBook = synthesizeNoFromYes(yesBook, `${marketId}::no`);
        this.setOrderbook(noBook);
      }
    }
  }

  private buildYesBook(marketId: string, data: PredictBookData): Orderbook | null {
    const bids = parseLevelsAnyShape(data.bids).sort((a, b) => b.price - a.price);
    const asks = parseLevelsAnyShape(data.asks).sort((a, b) => a.price - b.price);
    if (bids.length === 0 && asks.length === 0) return null;

    const ts = Number(data.updateTimestampMs ?? data.timestamp);
    return {
      venue: 'predict',
      marketKey: marketId,
      outcome: 'yes',
      asks,
      bids,
      ts: Number.isFinite(ts) && ts > 0 ? ts : Date.now(),
    };
  }

  private nextRequestId(): number {
    const id = this.requestIdCounter;
    this.requestIdCounter += 1;
    return id;
  }
}

// -------- utils --------

function extractBookPayload(raw: unknown): PredictBookData {
  if (raw && typeof raw === 'object' && 'data' in raw && typeof (raw as { data: unknown }).data === 'object') {
    return ((raw as { data: PredictBookData }).data) ?? {};
  }
  return (raw as PredictBookData) ?? {};
}

function parseLevelsAnyShape(rows: readonly unknown[] | undefined): PriceLevel[] {
  if (!Array.isArray(rows)) return [];
  const out: PriceLevel[] = [];
  for (const item of rows) {
    let price: number | null = null;
    let size: number | null = null;

    if (Array.isArray(item) && item.length >= 2) {
      price = Number(item[0]);
      size = Number(item[1]);
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      price = Number(obj.price ?? obj.p);
      size = Number(obj.size ?? obj.quantity ?? obj.qty ?? obj.amount);
    }

    if (price === null || size === null) continue;
    if (!Number.isFinite(price) || !Number.isFinite(size)) continue;
    if (price <= 0 || price >= 1 || size <= 0) continue;
    out.push({ price, size });
  }
  return out;
}
