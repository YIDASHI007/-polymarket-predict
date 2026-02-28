// WebSocket 服务 - 严格按照 API 文档实现
// Predict.fun: wss://ws.predict.fun/ws
// Polymarket: wss://ws-subscriptions-clob.polymarket.com/ws/

// WebSocket service types

// Predict.fun WebSocket 消息格式
interface PredictWsMessage {
  type: 'M' | 'R'; // M = message, R = response
  topic?: string;
  method?: string;
  timestamp?: number;
  payload?: any;
  requestId?: number;
}

// 订阅请求格式
interface SubscribeRequest {
  method: 'subscribe' | 'unsubscribe' | 'heartbeat';
  topic: string;
  requestId: number;
}

interface WebSocketConfig {
  url: string;
  apiKey?: string;
  onMessage: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeatResponse = 0;
  private requestId = 0;
  private subscriptions = new Set<string>();
  private isConnecting = false;

  constructor(config: WebSocketConfig) {
    this.config = config;
  }

  // 连接 WebSocket
  connect(): void {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected or connecting');
      return;
    }

    this.isConnecting = true;

    // 构建 URL，添加 API Key（如果有）
    let url = this.config.url;
    if (this.config.apiKey) {
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}apiKey=${this.config.apiKey}`;
    }

    console.log(`[WebSocket] Connecting to ${url}`);

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.lastHeartbeatResponse = Date.now();
        this.startHeartbeat();
        this.resubscribeAll();
        this.config.onConnect?.();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this.isConnecting = false;
        this.stopHeartbeat();
        this.config.onDisconnect?.();
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        this.isConnecting = false;
        this.config.onError?.(error);
      };
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  // 断开连接
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // 订阅主题
  subscribe(topic: string): boolean {
    if (!this.isConnected()) {
      console.warn('[WebSocket] Not connected, cannot subscribe');
      return false;
    }

    this.requestId++;
    const message: SubscribeRequest = {
      method: 'subscribe',
      topic,
      requestId: this.requestId,
    };

    this.send(message);
    this.subscriptions.add(topic);
    console.log(`[WebSocket] Subscribed to ${topic}`);
    return true;
  }

  // 取消订阅
  unsubscribe(topic: string): void {
    if (!this.isConnected()) return;

    this.requestId++;
    const message: SubscribeRequest = {
      method: 'unsubscribe',
      topic,
      requestId: this.requestId,
    };

    this.send(message);
    this.subscriptions.delete(topic);
    console.log(`[WebSocket] Unsubscribed from ${topic}`);
  }

  // 发送消息
  private send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Cannot send, not connected');
    }
  }

  // 处理收到的消息
  private handleMessage(data: string): void {
    try {
      const message: PredictWsMessage = JSON.parse(data);

      // 处理服务器心跳
      if (message.type === 'M' && message.topic === 'heartbeat') {
        this.handleHeartbeat(message);
        return;
      }

      // 其他消息转发给回调
      this.config.onMessage(message);
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
    }
  }

  // 处理心跳 - 严格按照 Predict.fun 文档实现
  // 文档要求：收到服务器心跳后，必须回复心跳
  private handleHeartbeat(message: PredictWsMessage): void {
    if (message.timestamp) {
      const response: SubscribeRequest = {
        method: 'heartbeat',
        topic: 'heartbeat',
        requestId: this.requestId++,
      };

      this.send(response);
      this.lastHeartbeatResponse = Date.now();
    }
  }

  // 启动心跳检查
  private startHeartbeat(): void {
    // 文档说明：服务器每15秒发送心跳
    // 我们每20秒检查一次，如果没有收到心跳，则认为连接断开
    this.heartbeatInterval = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeatResponse;
      
      // 如果30秒内没有收到心跳，认为连接已断开
      if (timeSinceLastHeartbeat > 30000) {
        console.warn('[WebSocket] Heartbeat timeout, reconnecting...');
        this.disconnect();
        this.connect();
      }
    }, 20000);
  }

  // 停止心跳检查
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // 重新订阅所有主题
  private resubscribeAll(): void {
    for (const topic of this.subscriptions) {
      this.subscribe(topic);
    }
  }

  // 计划重连 - 使用指数退避
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  // 检查连接状态
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // 获取当前订阅列表
  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }
}

// ==================== 预测市场 WebSocket 管理器 ====================

interface PriceUpdateCallback {
  (marketId: string, price: number, side: 'yes' | 'no', source: 'predict' | 'polymarket'): void;
}

export class MarketWebSocketManager {
  private predictWs: WebSocketService | null = null;
  private polymarketWs: WebSocketService | null = null;
  private priceCallbacks: PriceUpdateCallback[] = [];
  private onStatusChange: ((source: 'predict' | 'polymarket', connected: boolean) => void) | null = null;

  // 初始化连接
  initialize(predictApiKey?: string, onStatusChange?: (source: 'predict' | 'polymarket', connected: boolean) => void): void {
    this.onStatusChange = onStatusChange || null;

    // Predict.fun WebSocket
    this.predictWs = new WebSocketService({
      url: 'wss://ws.predict.fun/ws',
      apiKey: predictApiKey,
      onMessage: (msg) => this.handlePredictMessage(msg),
      onConnect: () => this.onStatusChange?.('predict', true),
      onDisconnect: () => this.onStatusChange?.('predict', false),
      onError: (err) => console.error('[Predict WS] Error:', err),
    });

    // Polymarket WebSocket
    this.polymarketWs = new WebSocketService({
      url: 'wss://ws-subscriptions-clob.polymarket.com/ws/',
      onMessage: (msg) => this.handlePolymarketMessage(msg),
      onConnect: () => this.onStatusChange?.('polymarket', true),
      onDisconnect: () => this.onStatusChange?.('polymarket', false),
      onError: (err) => console.error('[Polymarket WS] Error:', err),
    });

    // 连接两个服务
    this.predictWs.connect();
    this.polymarketWs.connect();
  }

  // 订阅 Predict.fun 市场订单簿
  subscribePredictMarket(marketId: string): boolean {
    if (!this.predictWs) return false;
    // 严格按照文档：predictOrderbook/{marketId}
    return this.predictWs.subscribe(`predictOrderbook/${marketId}`);
  }

  // 取消订阅 Predict.fun 市场
  unsubscribePredictMarket(marketId: string): void {
    this.predictWs?.unsubscribe(`predictOrderbook/${marketId}`);
  }

  // 订阅 Polymarket 市场
  subscribePolymarketMarket(tokenId: string): boolean {
    if (!this.polymarketWs) return false;
    // Polymarket 格式：market/{tokenId}
    return this.polymarketWs.subscribe(`market/${tokenId}`);
  }

  unsubscribePolymarketMarket(tokenId: string): void {
    this.polymarketWs?.unsubscribe(`market/${tokenId}`);
  }

  // 处理 Predict.fun 消息
  private handlePredictMessage(message: any): void {
    // Predict.fun 订单簿消息格式
    if (message.topic?.startsWith('predictOrderbook/')) {
      const marketId = message.topic.split('/')[1];
      
      // 提取最佳买卖价
      const payload = message.payload;
      if (payload) {
        // 假设 payload 包含 bids 和 asks 数组
        const bestBid = payload.bids?.[0]?.[0]; // [price, size]
        const bestAsk = payload.asks?.[0]?.[0];

        if (bestBid) {
          this.notifyPriceUpdate(marketId, bestBid, 'yes', 'predict');
        }
        if (bestAsk) {
          this.notifyPriceUpdate(marketId, bestAsk, 'no', 'predict');
        }
      }
    }
  }

  // 处理 Polymarket 消息
  private handlePolymarketMessage(message: any): void {
    // Polymarket 订单簿更新格式
    if (message.event_type === 'orderbook_update' || message.type === 'orderbook') {
      const tokenId = message.token_id || message.market;
      
      if (tokenId && message.changes) {
        // 解析价格变动
        for (const change of message.changes) {
          const side = change.side === 'BUY' ? 'yes' : 'no';
          const price = parseFloat(change.price);
          
          if (!isNaN(price)) {
            this.notifyPriceUpdate(tokenId, price, side, 'polymarket');
          }
        }
      }
    }
  }

  // 注册价格更新回调
  onPriceUpdate(callback: PriceUpdateCallback): () => void {
    this.priceCallbacks.push(callback);
    
    // 返回取消订阅函数
    return () => {
      const index = this.priceCallbacks.indexOf(callback);
      if (index > -1) {
        this.priceCallbacks.splice(index, 1);
      }
    };
  }

  // 通知所有回调
  private notifyPriceUpdate(marketId: string, price: number, side: 'yes' | 'no', source: 'predict' | 'polymarket'): void {
    for (const callback of this.priceCallbacks) {
      try {
        callback(marketId, price, side, source);
      } catch (error) {
        console.error('[WebSocketManager] Callback error:', error);
      }
    }
  }

  // 断开所有连接
  disconnect(): void {
    this.predictWs?.disconnect();
    this.polymarketWs?.disconnect();
    this.predictWs = null;
    this.polymarketWs = null;
    this.priceCallbacks = [];
  }

  // 获取连接状态
  getStatus(): { predict: boolean; polymarket: boolean } {
    return {
      predict: this.predictWs?.isConnected() || false,
      polymarket: this.polymarketWs?.isConnected() || false,
    };
  }
}

// 单例实例
export const wsManager = new MarketWebSocketManager();
