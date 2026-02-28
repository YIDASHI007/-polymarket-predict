# 实时跨市场套利监控模块使用说明（中文）

本文档说明如何使用已打包好的后端模块：
- 代码路径：`backend/src/modules/realtime-arbitrage`
- 导出入口：`backend/src/modules/realtime-arbitrage/index.ts`

该模块用于：
1. 管理多张“监控卡片”（用户手动配对后的市场对）
2. 接收两个市场（Polymarket + Predict）的实时订单簿更新
3. 进行深度级别套利计算
4. 按统一格式向前端输出实时事件

---

## 1. 模块架构

模块由两部分组成：

1. `types.ts`
- 定义输入、输出、卡片参数、订单簿结构

2. `engine.ts`
- 核心类：`RealtimeArbitrageModule`
- 负责：
  - 卡片生命周期（start/stop/update）
  - 订单簿摄入（ingest）
  - 自动重算套利
  - 事件输出（4类）

---

## 2. 输出给前端的 4 类事件（固定契约）

模块通过 `subscribe()` 回调输出统一事件流，事件类型如下：

1. `card_state`
- 卡片状态：`starting/running/reconnecting/error/stopped`
- 字段：`cardId`, `status`, `message`, `updatedAt`

2. `market_snapshot`
- 当前用于渲染的订单簿快照
- 字段：
  - `poly.yes/no`
  - `predict.yes/no`
  - 每侧含：`asks`, `bids`, `bestAsk`, `bestBid`, `ts`

3. `arb_result`
- 套利结果
- 字段：
  - `hasOpportunity`
  - `strategy`: `poly_yes_predict_no | poly_no_predict_yes | none`
  - `qty`, `costTotal`, `payoutTotal`
  - `grossProfit`, `netProfit`, `profitRate`
  - `minDepthSatisfied`
  - `reason`
  - `steps[]`（执行计划）

4. `params_echo`
- 参数回显（防止前后端参数不一致）
- 字段：`feeBps`, `slippageBps`, `minProfit`, `minDepth`

---

## 3. 输入给模块的数据

### 3.1 创建卡片（startCard）
每张卡片必须提供：
- `cardId`
- `polymarket`: `{ yesId, noId }`
- `predict`: `{ marketId }`
- `params`: `{ feeBps, slippageBps, minProfit, minDepth }`

> 说明：
> - Polymarket 用 yes/no 两个 token id
> - Predict 用一个 market id，内部用 `outcome=yes/no` 区分两边订单簿

### 3.2 订单簿更新（ingestOrderbook）
每次 websocket 收到增量或快照后，标准化为：
- `venue`: `polymarket | predict`
- `marketId`
- `outcome`: `yes | no`
- `orderbook`: `{ asks, bids, bestAsk, bestBid, ts }`

### 3.3 连接状态（ingestConnectionState）
可选：把连接层状态推给模块（会输出 `card_state`）：
- `venue`
- `status`: `running | reconnecting | error`
- `message`

---

## 4. 套利计算逻辑（当前实现）

模块每次重算会比较两种组合：
1. `poly_yes_predict_no`
2. `poly_no_predict_yes`

算法：
- 使用 asks 深度（买入成本）
- 双指针线性扫描（O(n+m)）
- 边际条件：`1 - (执行价1 + 执行价2) > 0`
- 自动吃到最大可执行份额
- 同时输出分档执行计划 `steps`

成本处理：
- 对每条腿价格应用 `feeBps + slippageBps`
- `minProfit` 和 `minDepth` 用于最终机会判定

---

## 5. 典型接入流程（后端）

1. 在服务启动时创建模块实例
2. 前端创建卡片 -> 调 `startCard`
3. websocket 消息到达 -> 标准化后调用 `ingestOrderbook`
4. 前端删除卡片 -> 调 `stopCard`
5. 前端修改参数 -> 调 `updateCardParams`
6. 订阅模块输出 -> 转发为 SSE / WebSocket 给前端

---

## 6. 最小示例（Node/Fastify 伪代码）

```ts
import { RealtimeArbitrageModule } from './modules/realtime-arbitrage';

const engine = new RealtimeArbitrageModule();

// 1) 订阅模块输出（推给前端）
const unsubscribe = engine.subscribe((event) => {
  // sendToClient(event)
});

// 2) 创建卡片
engine.startCard({
  cardId: 'card-001',
  polymarket: { yesId: 'poly_yes_token', noId: 'poly_no_token' },
  predict: { marketId: 'predict_market_id' },
  params: { feeBps: 20, slippageBps: 30, minProfit: 5, minDepth: 50 },
});

// 3) 摄入订单簿（来自 websocket 适配层）
engine.ingestOrderbook({
  venue: 'polymarket',
  marketId: 'poly_yes_token',
  outcome: 'yes',
  orderbook: {
    asks: [{ price: 0.61, size: 100 }],
    bids: [{ price: 0.60, size: 120 }],
    bestAsk: 0.61,
    bestBid: 0.60,
    ts: Date.now(),
  },
});

// 4) 修改参数
engine.updateCardParams('card-001', {
  feeBps: 25,
  slippageBps: 35,
  minProfit: 8,
  minDepth: 80,
});

// 5) 删除卡片
engine.stopCard('card-001');
```

---

## 7. 与你当前需求的对应关系

已满足：
1. 前端手动匹配市场后，可创建多卡片
2. 不需要“一卡一 websocket”，卡片与连接解耦
3. 可支持上百卡片（取决于连接池和分发层）
4. 卡片删除即停止会话
5. 支持断线重连状态输入
6. 参数由前端设置并回显

---

## 8. 下一步建议（落地）

1. 增加连接池层（Polymarket / Predict）
- 统一订阅管理、重连、分片

2. 增加标准化适配层
- 把交易所原始消息映射为 `ingestOrderbook` 格式

3. 增加推流网关
- SSE/WS 将 `CardOutputEvent` 推给前端

4. 增加会话存储
- 内存版先跑，再视并发改 Redis

---

## 9. 文件清单

- 模块类型：`backend/src/modules/realtime-arbitrage/types.ts`
- 模块引擎：`backend/src/modules/realtime-arbitrage/engine.ts`
- 模块导出：`backend/src/modules/realtime-arbitrage/index.ts`
- 本文档：`backend/REALTIME_ARBITRAGE_MODULE_使用说明.md`

