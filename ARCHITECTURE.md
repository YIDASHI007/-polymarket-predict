# Architecture — Real-time Arbitrage Engine

> **版本**: v2 (重构后) · 从"10 分钟 REST 轮询"升级为"WebSocket 实时扫描"

## 为什么要重构

旧版 (`backend/src/services/arbitrageService.ts`，已删除) 的套利模型是错的：

```
❌ 旧版：在 Polymarket 和 Predict.fun 之间"低买高卖同一代币"
```

这在跨平台上**根本不成立** —— Polymarket 的 YES token 是 Polygon 上的一个 ERC-1155 CLOB token，
Predict.fun 的 YES token 是**另一条独立的资产**，两者**无法互转**。所以"在 A 家低买、在 B 家高卖"
在物理上不存在。

```
✅ 新版：对冲组合套利
  对同一事件：
    买 Polymarket 的 YES (价格 p1) + 买 Predict.fun 的 NO (价格 p2)
    
  如果 p1 + p2 < 1：
    - 事件发生 → Polymarket YES 值 $1，Predict NO 值 $0 → 总 payout $1
    - 事件不发生 → Polymarket YES 值 $0，Predict NO 值 $1 → 总 payout $1
    - **无论结果，总 payout 都是 $1；总成本 p1+p2 < $1；锁定利润 1-(p1+p2)**
```

## 分层架构

```
┌────────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                                        │
│    ┌────────────────────────────────────────────────────────┐  │
│    │ ArbitrageBoard.tsx                                      │  │
│    │   useArbitrageStream (SSE)                              │  │
│    │   ← 实时收到 opportunity / opportunity_gone / state     │  │
│    └────────────────────────────────────────────────────────┘  │
└────────────────────────────┬───────────────────────────────────┘
                             │ SSE: /api/v2/arbitrage/stream
                             │ REST: /api/v2/arbitrage/{pairs, opportunities, state}
┌────────────────────────────┴───────────────────────────────────┐
│  Backend (Fastify + TypeScript)                                 │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ routes/arbitrage-v2.ts                                    │  │
│  │   HTTP 路由 + SSE stream                                  │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │ getCoordinator()                    │
│  ┌────────────────────────┴─────────────────────────────────┐  │
│  │ core/realtime/arbitrageCoordinator.ts     【大脑】        │  │
│  │   - watchPair / unwatchPair（ref-count 订阅去重）         │  │
│  │   - 订单簿更新 → 节流扫描 → emit opportunity 事件         │  │
│  │   - 管理 scansPerSecond 等性能指标                        │  │
│  └────────┬─────────────────────────────────┬───────────────┘  │
│           │                                 │                   │
│  ┌────────┴───────────┐          ┌──────────┴────────────┐     │
│  │ core/realtime/     │          │ core/arbitrage/       │     │
│  │  polymarketFeed.ts │          │   engine.ts           │     │
│  │  predictFeed.ts    │          │   orderbookMatcher.ts │     │
│  │  wsBase.ts         │          │   costModel.ts        │     │
│  │                    │          │   orderbookSynth.ts   │     │
│  │  订阅层            │          │   pairMatcher.ts      │     │
│  │  - 指数退避重连    │          │                       │     │
│  │  - 订阅队列 / 去重 │          │   纯函数引擎          │     │
│  │  - 心跳            │          │   (无 I/O，可单测)    │     │
│  │  - delta 合并      │          │                       │     │
│  └─────────┬──────────┘          └───────────────────────┘     │
│            │                                                    │
└────────────┼───────────────────────────────────────────────────┘
             │ WebSocket
 ┌───────────┴───────────┐
 │                       │
┌▼───────────────────┐ ┌─▼──────────────────────┐
│ Polymarket CLOB WS │ │ Predict.fun WS         │
│ asset_id 订阅       │ │ predictOrderbook/id    │
│ book / price_change│ │ (仅 YES 侧，NO 本地合成)│
└────────────────────┘ └────────────────────────┘
```

## 核心模块

### `core/arbitrage/` — 纯函数引擎

| 文件 | 职责 | 行为 |
|------|------|------|
| `types.ts` | 数据类型 | `ArbOpportunity` / `ArbLeg` / `FeeConfig` / `ScanConfig` |
| `orderbookMatcher.ts` | 双盘口同步 walk | `walkBothAsks(asks1, asks2)` 两指针推进，保证两腿份数相等 |
| `orderbookSynth.ts` | NO 合成 | `synthesizeNoFromYes`：`NO_ask = 1 - YES_bid`，Size 等于对应 YES 档 |
| `costModel.ts` | 费用模型 | 交易费（按 venue） + Gas × 2 + **资金占用成本**（年化率 × 持仓天数） |
| `pairMatcher.ts` | 跨平台配对 | Jaccard 标题相似度 + endDate 相似度，`score = min(titleSim, dateSim)` |
| `engine.ts` | 套利扫描 | `scanPair(pair, snapshot, fees, config)` 尝试两种策略，返回 ROI 更高者 |

### `core/realtime/` — 订阅层

| 文件 | 职责 |
|------|------|
| `wsBase.ts` | WebSocket 通用基类：指数退避重连、心跳、订阅队列 |
| `polymarketFeed.ts` | `wss://ws-subscriptions-clob.polymarket.com/ws/market`，`book` 快照 + `price_change` 增量合并 |
| `predictFeed.ts` | `wss://ws.predict.fun/ws`，`predictOrderbook/<marketId>` 订阅，自动合成 NO 侧 |
| `arbitrageCoordinator.ts` | 协调器：ref-count 订阅去重、节流扫描（`minRescanMs`）、机会差异化推送 |

### `routes/arbitrage-v2.ts` — V2 API

```
GET    /api/v2/arbitrage/pairs                 列出监控对
POST   /api/v2/arbitrage/pairs                 新增监控对
DELETE /api/v2/arbitrage/pairs/:pairId         停止监控
GET    /api/v2/arbitrage/opportunities         活跃机会快照
GET    /api/v2/arbitrage/state                 协调器状态
GET    /api/v2/arbitrage/stream                SSE 实时流
```

**SSE 事件类型**：
- `opportunity` — 机会新增/变化（去重后广播）
- `opportunity_gone` — 机会消失（订单簿回归）
- `state` — 连接状态 / 扫描速率变化
- `ping` — 每 15 秒心跳

## 数据流时序

```
用户点击"添加监控对"
      ↓
POST /api/v2/arbitrage/pairs
      ↓
coordinator.watchPair(pair)
      ↓
  ┌─────────────────┬──────────────────┐
  │                 │                  │
poly.subscribe   poly.subscribe    predict.subscribe
(yesAssetId)     (noAssetId)       (marketId)
  │                 │                  │
  ▼                 ▼                  ▼
WS 接收 book 事件 → polyFeed.emit('orderbook', snapshot)
                                       │
                                       ▼
              coordinator.onOrderbookUpdate
                          ↓ pairAffectedBy ? ↓
                   scheduleScan (throttle 200ms)
                          ↓
                     scanPair() →  engine.ts
                          ↓
                     opportunity? 与上次不同？
                          ↓
                  emit('opportunity', opp)
                          ↓
               SSE stream → 前端 useArbitrageStream
                          ↓
                  OpportunityCard 出现在屏幕上
```

## 性能设计

- **订阅去重**：同一 assetId/marketId 被多个 pair 引用时只订阅一次（ref count）
- **扫描节流**：同一 pair 每 200ms 最多扫一次（Polymarket `price_change` 风暴不会打爆 CPU）
- **订单簿新鲜度**：超过 30s 未更新视为过期，自动拒绝生成机会
- **机会 TTL**：60s 无更新自动回收，前端立刻收到 `opportunity_gone`

## 费用模型

过去版本只算了 `feeBps + slippageBps`，忽略了资金占用——而预测市场**必须持仓到结算**，
所以资金成本往往是主要成本之一。

```ts
totalCost = 交易费(两腿)
          + Polygon gas × 2
          + 资金占用 = totalNotional × (年化率/365) × 持仓天数
```

默认参数（`DEFAULT_FEE_CONFIG`）：
- Polymarket taker: 0 bps（官方目前 0 费率）
- Predict.fun taker: 100 bps（1%，可调）
- Polygon gas: $0.02 × 2
- 年化资金占用率: 500 bps（5%，对标 T-bill 收益）

## 前端

- `ArbitrageBoard.tsx` — 默认 tab
  - 顶部：两家 WS 连接状态 · 监控对数 · 活跃机会数 · **每秒扫描次数** · SSE 连接状态
  - 中部：监控对列表（带移除按钮 + 匹配可信度标签）
  - 下部：机会卡片网格，按 ROI 降序

- `OpportunityCard.tsx` — 单个机会卡片
  - 左上：事件标题 + 策略说明
  - 右上：ROI% 大字 + 年化 ROI 小字
  - 中部：**两腿交易指令**（venue / outcome / avgPrice / shares / 滑点）
  - 底部：费用拆解 + 置信度徽章 + "即将失效"提示

- `AddPairDialog.tsx` — 手动添加监控对
  - 需要填：标题、Polymarket conditionId + YES/NO clob_token_id、Predict.fun marketId
  - 自动匹配功能属于 Phase 2（需要预聚合两家市场列表）

## 未来工作

- **自动配对**：全量抓取两家市场列表，用 `pairMatcher.findPairs` 批量打分，高分自动建议
- **历史回放**：记录订单簿 ticks，回放"如果当时下单能赚多少"
- **半自动下单**：一键生成两边的签名订单（Polymarket EIP-712 + Predict REST），人工复制粘贴到钱包
- **组合资金管理**：同时追多对时的仓位规模分配
