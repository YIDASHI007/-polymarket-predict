// Polymarket CLOB WebSocket 客户端
//
// 协议（已在 APIdock/app.py 验证）：
//   URL:  wss://ws-subscriptions-clob.polymarket.com/ws/market
//   订阅: { type: "market", assets_ids: ["<token_id>", ...] }
//   事件:
//     - event_type=book          全量 orderbook snapshot
//     - event_type=price_change  增量更新（price_changes[]）
//     - event_type=best_bid_ask  更新最优价
//     - event_type=last_trade_price
//   心跳: 定期发送 {} 维持连接

import { WsBaseClient, WsBaseOptions } from './wsBase';
import type { SubscriptionKey } from './types';
import type { Orderbook, Outcome, PriceLevel } from '../arbitrage/types';

const DEFAULT_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

interface PolyBookMsg {
  event_type: 'book';
  asset_id: string;
  bids: readonly { price: string; size: string }[];
  asks: readonly { price: string; size: string }[];
  timestamp?: string;
}

interface PolyPriceChangeMsg {
  event_type: 'price_change';
  asset_id?: string;
  price_changes?: readonly {
    asset_id?: string;
    price: string;
    size: string;
    side: 'BUY' | 'SELL';
  }[];
  changes?: readonly {
    price: string;
    size: string;
    side: 'BUY' | 'SELL';
  }[];
  timestamp?: string;
}

interface PolyBestBidAskMsg {
  event_type: 'best_bid_ask';
  asset_id: string;
  best_bid?: string;
  best_ask?: string;
  timestamp?: string;
}

export interface PolymarketFeedOptions extends Partial<WsBaseOptions> {
  /**
   * Polymarket 的 assetId 本身不自带 outcome 标识，需要外部提供
   * assetId → outcome 映射（在 subscribe 时传入，或通过此方法注册）。
   */
  readonly outcomeMap?: Record<string, Outcome>;
}

export class PolymarketFeed extends WsBaseClient {
  /** assetId → outcome 映射，决定 emit 的 orderbook.outcome 字段 */
  private readonly outcomeByAsset = new Map<string, Outcome>();

  constructor(options: PolymarketFeedOptions = {}) {
    super({
      venue: 'polymarket',
      url: options.url ?? DEFAULT_URL,
      ...options,
    });
    if (options.outcomeMap) {
      for (const [aid, outcome] of Object.entries(options.outcomeMap)) {
        this.outcomeByAsset.set(aid, outcome);
      }
    }
  }

  /** 订阅前登记 assetId 的 outcome 归属 */
  registerOutcome(assetId: string, outcome: Outcome): void {
    this.outcomeByAsset.set(assetId, outcome);
  }

  protected sendSubscribe(keys: readonly SubscriptionKey[]): void {
    const assetIds: string[] = [];
    for (const k of keys) {
      if (k.venue !== 'polymarket') continue;
      assetIds.push(k.assetId);
      this.outcomeByAsset.set(k.assetId, k.outcome);
    }
    if (assetIds.length === 0) return;
    this.safeSend({ type: 'market', assets_ids: assetIds });
  }

  protected sendUnsubscribe(keys: readonly SubscriptionKey[]): void {
    // Polymarket WS 没有显式取消订阅，只能重连剔除。
    // 我们通过在下次重连时只发剩余 assetIds 达到"变更订阅"效果。
    for (const k of keys) {
      if (k.venue === 'polymarket') this.outcomeByAsset.delete(k.assetId);
    }
  }

  protected sendHeartbeat(): void {
    this.safeSend('{}');
  }

  protected handleMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const events = Array.isArray(parsed) ? parsed : [parsed];
    for (const event of events) {
      if (!event || typeof event !== 'object') continue;
      const evt = event as { event_type?: string };
      switch (evt.event_type) {
        case 'book':
          this.onBook(event as PolyBookMsg);
          break;
        case 'price_change':
          this.onPriceChange(event as PolyPriceChangeMsg);
          break;
        case 'best_bid_ask':
          this.onBestBidAsk(event as PolyBestBidAskMsg);
          break;
        default:
          break;
      }
    }
  }

  // -------- handlers --------

  private onBook(msg: PolyBookMsg): void {
    const outcome = this.outcomeByAsset.get(msg.asset_id);
    if (!outcome) return;

    const bids = parseLevels(msg.bids).sort((a, b) => b.price - a.price);
    const asks = parseLevels(msg.asks).sort((a, b) => a.price - b.price);

    const book: Orderbook = {
      venue: 'polymarket',
      marketKey: msg.asset_id,
      outcome,
      asks,
      bids,
      ts: parseTs(msg.timestamp),
    };
    this.setOrderbook(book);
  }

  private onPriceChange(msg: PolyPriceChangeMsg): void {
    const changes = msg.price_changes ?? msg.changes ?? [];
    // 不同消息版本字段不一致，按 changes 里的 asset_id / 外层 asset_id 都支持
    const groups = new Map<string, typeof changes[number][]>();
    for (const c of changes) {
      const aid = (c as { asset_id?: string }).asset_id ?? msg.asset_id ?? '';
      if (!aid) continue;
      if (!groups.has(aid)) groups.set(aid, []);
      groups.get(aid)!.push(c);
    }

    for (const [assetId, items] of groups) {
      const outcome = this.outcomeByAsset.get(assetId);
      if (!outcome) continue;

      const key = `poly:${outcome}:${assetId}`;
      const cur = this.orderbooks.get(key);
      const bidsMap = new Map<number, number>((cur?.bids ?? []).map((l) => [l.price, l.size]));
      const asksMap = new Map<number, number>((cur?.asks ?? []).map((l) => [l.price, l.size]));
      for (const c of items) {
        const p = Number(c.price);
        const s = Number(c.size);
        if (!Number.isFinite(p) || !Number.isFinite(s)) continue;
        const target = c.side === 'BUY' ? bidsMap : asksMap;
        if (s <= 0) target.delete(p);
        else target.set(p, s);
      }

      const bids = [...bidsMap.entries()]
        .map(([price, size]) => ({ price, size }))
        .sort((a, b) => b.price - a.price);
      const asks = [...asksMap.entries()]
        .map(([price, size]) => ({ price, size }))
        .sort((a, b) => a.price - b.price);

      const book: Orderbook = {
        venue: 'polymarket',
        marketKey: assetId,
        outcome,
        asks,
        bids,
        ts: parseTs(msg.timestamp),
      };
      this.updateOrderbookDelta(book);
    }
  }

  private onBestBidAsk(msg: PolyBestBidAskMsg): void {
    const outcome = this.outcomeByAsset.get(msg.asset_id);
    if (!outcome) return;
    // best_bid_ask 只更新最优价，不影响深度。
    // 我们把它当成"刷新时间戳"用——保证 staleness 检查不会把活跃流当僵尸。
    const key = `poly:${outcome}:${msg.asset_id}`;
    const cur = this.orderbooks.get(key);
    if (!cur) return;
    const book: Orderbook = { ...cur, ts: parseTs(msg.timestamp) };
    this.orderbooks.set(key, book);
  }
}

// -------- utils --------

function parseLevels(rows: readonly { price: string; size: string }[] | undefined): PriceLevel[] {
  if (!Array.isArray(rows)) return [];
  const out: PriceLevel[] = [];
  for (const r of rows) {
    const price = Number(r.price);
    const size = Number(r.size);
    if (!Number.isFinite(price) || !Number.isFinite(size)) continue;
    if (price <= 0 || price >= 1 || size <= 0) continue;
    out.push({ price, size });
  }
  return out;
}

function parseTs(raw?: string): number {
  if (!raw) return Date.now();
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  const d = new Date(raw).getTime();
  return Number.isFinite(d) ? d : Date.now();
}
