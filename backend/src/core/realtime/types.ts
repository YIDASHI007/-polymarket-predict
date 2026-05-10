// 实时订阅层的对外类型。
// 订阅层对引擎层只做两件事：提供 Orderbook、广播 Orderbook 更新事件。

import type { EventEmitter } from 'events';
import type { Orderbook, Outcome, Venue } from '../arbitrage/types';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';

export interface ConnectionState {
  readonly venue: Venue;
  readonly status: ConnectionStatus;
  readonly since: number;
  readonly lastMessageAt: number;
  readonly reconnectCount: number;
  readonly message?: string;
}

/** Orderbook 更新事件（订阅层向上广播的唯一事件类型） */
export interface OrderbookUpdate {
  readonly orderbook: Orderbook;
  readonly kind: 'snapshot' | 'delta';
}

/**
 * 订阅层公共接口：所有平台客户端都实现它。
 * 使用 EventEmitter 保持简单（单进程内）。
 */
export interface MarketFeedClient extends EventEmitter {
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribe(keys: readonly SubscriptionKey[]): Promise<void>;
  unsubscribe(keys: readonly SubscriptionKey[]): Promise<void>;
  getOrderbook(key: SubscriptionKey): Orderbook | undefined;
  getConnectionState(): ConnectionState;

  // Events:
  // 'orderbook': (update: OrderbookUpdate) => void
  // 'state': (state: ConnectionState) => void
}

/** 订阅键（venue + 订阅标识） */
export type SubscriptionKey =
  | { venue: 'polymarket'; assetId: string; outcome: Outcome }
  | { venue: 'predict'; marketId: string };

export function keyToString(k: SubscriptionKey): string {
  return k.venue === 'polymarket'
    ? `poly:${k.outcome}:${k.assetId}`
    : `predict:${k.marketId}`;
}
