// WebSocket 客户端通用基础类。
//
// 职责：
//   - 连接管理（connect / close）
//   - 指数退避重连
//   - 心跳检测
//   - 消息解析错误兜底
//   - 订阅去重（subscriptions Set）
//
// 子类负责：
//   - onOpen 时发出订阅消息
//   - onMessage 时解析协议、写入 orderbook、emit 'orderbook' 事件

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import type { Orderbook } from '../arbitrage/types';
import type {
  ConnectionState,
  ConnectionStatus,
  MarketFeedClient,
  OrderbookUpdate,
  SubscriptionKey,
} from './types';
import { keyToString } from './types';

export interface WsBaseOptions {
  readonly url: string;
  readonly venue: 'polymarket' | 'predict';
  readonly heartbeatIntervalMs?: number;
  readonly reconnectInitialMs?: number;
  readonly reconnectMaxMs?: number;
  readonly staleOrderbookMs?: number;
  readonly logger?: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

const DEFAULTS = {
  heartbeatIntervalMs: 20_000,
  reconnectInitialMs: 1_000,
  reconnectMaxMs: 30_000,
  staleOrderbookMs: 60_000,
};

export abstract class WsBaseClient extends EventEmitter implements MarketFeedClient {
  protected readonly url: string;
  protected readonly venue: 'polymarket' | 'predict';
  protected readonly heartbeatIntervalMs: number;
  protected readonly reconnectInitialMs: number;
  protected readonly reconnectMaxMs: number;
  protected readonly staleOrderbookMs: number;
  protected readonly logger: NonNullable<WsBaseOptions['logger']>;

  protected ws: WebSocket | null = null;
  protected readonly subscriptions = new Set<string>();      // keyToString
  protected readonly pendingSubs = new Set<string>();        // 连接还没 ready 时排队
  protected readonly orderbooks = new Map<string, Orderbook>();

  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private shouldReconnect = false;
  private reconnectDelayMs: number;
  private state: ConnectionState;

  constructor(opts: WsBaseOptions) {
    super();
    this.url = opts.url;
    this.venue = opts.venue;
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs ?? DEFAULTS.heartbeatIntervalMs;
    this.reconnectInitialMs = opts.reconnectInitialMs ?? DEFAULTS.reconnectInitialMs;
    this.reconnectMaxMs = opts.reconnectMaxMs ?? DEFAULTS.reconnectMaxMs;
    this.staleOrderbookMs = opts.staleOrderbookMs ?? DEFAULTS.staleOrderbookMs;
    this.logger =
      opts.logger ??
      {
        info: (m) => console.log(`[${this.venue}-ws]`, m),
        warn: (m) => console.warn(`[${this.venue}-ws]`, m),
        error: (m) => console.error(`[${this.venue}-ws]`, m),
      };
    this.reconnectDelayMs = this.reconnectInitialMs;
    this.state = {
      venue: this.venue,
      status: 'idle',
      since: Date.now(),
      lastMessageAt: 0,
      reconnectCount: 0,
    };
  }

  // ---------- Public API ----------

  async start(): Promise<void> {
    this.shouldReconnect = true;
    this.connect();
  }

  async stop(): Promise<void> {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* noop */
      }
      this.ws = null;
    }
    this.setState('closed', 'stopped');
  }

  async subscribe(keys: readonly SubscriptionKey[]): Promise<void> {
    const fresh: SubscriptionKey[] = [];
    for (const key of keys) {
      const id = keyToString(key);
      if (this.subscriptions.has(id)) continue;
      this.subscriptions.add(id);
      fresh.push(key);
    }
    if (fresh.length === 0) return;

    if (this.isOpen()) {
      this.sendSubscribe(fresh);
    } else {
      for (const k of fresh) this.pendingSubs.add(keyToString(k));
    }
  }

  async unsubscribe(keys: readonly SubscriptionKey[]): Promise<void> {
    const removed: SubscriptionKey[] = [];
    for (const key of keys) {
      const id = keyToString(key);
      if (!this.subscriptions.delete(id)) continue;
      this.pendingSubs.delete(id);
      this.orderbooks.delete(id);
      removed.push(key);
    }
    if (removed.length === 0) return;

    if (this.isOpen()) {
      this.sendUnsubscribe(removed);
    }
  }

  getOrderbook(key: SubscriptionKey): Orderbook | undefined {
    const book = this.orderbooks.get(keyToString(key));
    if (!book) return undefined;
    if (Date.now() - book.ts > this.staleOrderbookMs) return undefined;
    return book;
  }

  getConnectionState(): ConnectionState {
    return { ...this.state };
  }

  // ---------- Subclass hooks ----------

  /** 发送订阅消息（订阅层协议相关） */
  protected abstract sendSubscribe(keys: readonly SubscriptionKey[]): void;
  protected abstract sendUnsubscribe(keys: readonly SubscriptionKey[]): void;

  /** 处理单条消息（抛出异常将被 base 吞掉并记录） */
  protected abstract handleMessage(raw: string): void;

  /** 可选：心跳消息（基类会以 heartbeatIntervalMs 周期调用） */
  protected sendHeartbeat(): void {
    if (this.isOpen()) {
      try {
        this.ws!.send('{}');
      } catch {
        /* noop */
      }
    }
  }

  // ---------- Protected helpers（供子类用） ----------

  protected safeSend(payload: unknown): boolean {
    if (!this.isOpen()) return false;
    try {
      this.ws!.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
      return true;
    } catch (err) {
      this.logger.warn(`send failed: ${(err as Error).message}`);
      return false;
    }
  }

  protected setOrderbook(book: Orderbook): void {
    const key =
      book.venue === 'polymarket'
        ? `poly:${book.outcome}:${book.marketKey}`
        : `predict:${book.marketKey}`;
    this.orderbooks.set(key, book);
    const update: OrderbookUpdate = {
      orderbook: book,
      kind: 'snapshot',
    };
    this.emit('orderbook', update);
  }

  protected updateOrderbookDelta(book: Orderbook): void {
    const key =
      book.venue === 'polymarket'
        ? `poly:${book.outcome}:${book.marketKey}`
        : `predict:${book.marketKey}`;
    this.orderbooks.set(key, book);
    const update: OrderbookUpdate = {
      orderbook: book,
      kind: 'delta',
    };
    this.emit('orderbook', update);
  }

  protected listActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }

  // ---------- Connection management ----------

  private isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private connect(): void {
    this.setState('connecting', `connecting to ${this.url}`);
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this.logger.error(`ws construct failed: ${(err as Error).message}`);
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => this.handleOpen());
    this.ws.on('message', (data: WebSocket.RawData) => {
      this.state = { ...this.state, lastMessageAt: Date.now() };
      try {
        this.handleMessage(data.toString());
      } catch (err) {
        this.logger.warn(`message handler error: ${(err as Error).message}`);
      }
    });
    this.ws.on('close', (code, reason) => this.handleClose(code, reason.toString()));
    this.ws.on('error', (err) => {
      this.logger.warn(`ws error: ${err.message}`);
      this.setState('error', err.message);
    });
  }

  private handleOpen(): void {
    this.reconnectDelayMs = this.reconnectInitialMs;
    this.setState('open', 'connected');

    // 合并已订阅 + 排队的订阅，做一次性订阅
    const allKeys: SubscriptionKey[] = [];
    const ids = new Set<string>([...this.subscriptions, ...this.pendingSubs]);
    for (const id of ids) {
      const key = this.idToKey(id);
      if (key) allKeys.push(key);
    }
    this.pendingSubs.clear();
    if (allKeys.length > 0) {
      this.sendSubscribe(allKeys);
    }

    // 启动心跳
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.heartbeatIntervalMs);
  }

  private handleClose(code: number, reason: string): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.ws = null;
    if (!this.shouldReconnect) {
      this.setState('closed', `closed ${code} ${reason}`);
      return;
    }
    this.setState('reconnecting', `closed ${code} ${reason}`);
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.reconnectMaxMs);
    this.state = { ...this.state, reconnectCount: this.state.reconnectCount + 1 };
    this.logger.info(`reconnect in ${delay}ms (attempt ${this.state.reconnectCount})`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private setState(status: ConnectionStatus, message: string): void {
    this.state = {
      ...this.state,
      status,
      since: Date.now(),
      message,
    };
    this.emit('state', this.getConnectionState());
  }

  private idToKey(id: string): SubscriptionKey | null {
    if (id.startsWith('poly:')) {
      const rest = id.slice('poly:'.length);
      const idx = rest.indexOf(':');
      if (idx < 0) return null;
      const outcome = rest.slice(0, idx) as 'yes' | 'no';
      const assetId = rest.slice(idx + 1);
      return { venue: 'polymarket', outcome, assetId };
    }
    if (id.startsWith('predict:')) {
      return { venue: 'predict', marketId: id.slice('predict:'.length) };
    }
    return null;
  }
}
