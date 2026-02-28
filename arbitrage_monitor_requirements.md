# 跨市场套利监控系统 - 功能需求分析文档

## 📋 文档信息
- **项目名称**: Predict.fun × Polymarket 跨市场套利监控系统
- **文档版本**: v1.0
- **分析日期**: 2025年

---

## 一、核心业务目标

### 1.1 用户目标
用户希望通过该系统实现以下核心目标：

| 目标编号 | 目标描述 | 重要性 |
|---------|---------|--------|
| G1 | **实时监控**两个预测市场（Predict.fun 和 Polymarket）的价格差异 | P0 |
| G2 | **自动识别**同一事件在不同市场的定价差异（套利机会） | P0 |
| G3 | **量化套利空间**，计算潜在收益率和风险 | P0 |
| G4 | **快速响应**，在套利机会出现时及时通知用户 | P1 |
| G5 | **历史分析**，追踪套利机会的分布和成功率 | P2 |

### 1.2 套利监控核心逻辑

```
┌─────────────────────────────────────────────────────────────────┐
│                      套利监控核心流程                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐   │
│  │ Predict.fun  │      │   市场匹配   │      │  Polymarket  │   │
│  │   数据获取   │─────▶│   与关联     │◀─────│   数据获取   │   │
│  └──────────────┘      └──────┬───────┘      └──────────────┘   │
│                               │                                  │
│                               ▼                                  │
│                        ┌──────────────┐                         │
│                        │  价格对比与  │                         │
│                        │  套利计算    │                         │
│                        └──────┬───────┘                         │
│                               │                                  │
│                               ▼                                  │
│                        ┌──────────────┐                         │
│                        │  套利机会    │                         │
│                        │  筛选与排序  │                         │
│                        └──────┬───────┘                         │
│                               │                                  │
│                               ▼                                  │
│                        ┌──────────────┐                         │
│                        │  通知/展示   │                         │
│                        │  套利机会    │                         │
│                        └──────────────┘                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**套利类型定义：**

| 套利类型 | 定义 | 示例 |
|---------|------|------|
| **直接套利** | 同一事件，市场A的Yes价格 + 市场B的No价格 < 1 | Predict.fun Yes=0.45, Polymarket No=0.50, 总和=0.95 |
| **反向套利** | 市场A的No价格 + 市场B的Yes价格 < 1 | Predict.fun No=0.52, Polymarket Yes=0.45, 总和=0.97 |
| **多元套利** | 同一组多元市场中，所有选项价格总和 ≠ 1 的偏差 | 选项A+选项B+选项C 总和 = 1.05（过度定价） |

---

## 二、功能模块清单

### 2.1 模块总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        系统架构图                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    前端展示层                             │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │  │
│  │  │ 市场列表 │ │ 套利面板 │ │ 价格图表 │ │ 设置页面 │   │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    API代理层 (Node.js)                    │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │  │
│  │  │Predict.fun代理│ │Polymarket代理│ │  数据聚合    │     │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    外部API层                              │  │
│  │  ┌──────────────┐              ┌──────────────┐         │  │
│  │  │ Predict.fun  │              │  Polymarket  │         │  │
│  │  │    API       │              │    API       │         │  │
│  │  └──────────────┘              └──────────────┘         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 2.2 详细功能模块

#### 模块1: 后端代理服务器 (P0)

| 属性 | 内容 |
|-----|------|
| **模块名称** | Backend Proxy Server |
| **功能描述** | 解决浏览器CORS限制，提供统一的API代理服务 |
| **输入数据** | 前端HTTP请求（市场查询、订单簿请求等） |
| **输出结果** | JSON格式的API响应数据 |
| **优先级** | P0 |

**详细功能点：**

| 功能点 | 描述 | 端点示例 |
|-------|------|---------|
| 1.1 Predict.fun市场列表代理 | 转发并缓存市场列表请求 | GET /api/predict/markets |
| 1.2 Predict.fun订单簿代理 | 转发特定市场的订单簿请求 | GET /api/predict/orderbook/:marketId |
| 1.3 Polymarket市场数据代理 | 转发Polymarket市场数据 | GET /api/poly/markets |
| 1.4 Polymarket价格数据代理 | 转发Polymarket价格数据 | GET /api/poly/prices/:conditionId |
| 1.5 请求缓存 | 缓存频繁请求的数据，减少API调用 | 内部实现 |
| 1.6 错误处理 | 统一处理API错误并返回友好格式 | 全局中间件 |

---

#### 模块2: 市场数据获取 (P0)

| 属性 | 内容 |
|-----|------|
| **模块名称** | Market Data Fetcher |
| **功能描述** | 从两个平台获取完整的市场列表和详情 |
| **输入数据** | 分页参数、筛选条件、搜索关键词 |
| **输出结果** | 标准化的市场列表数据 |
| **优先级** | P0 |

**详细功能点：**

| 功能点 | 描述 | 输入 | 输出 |
|-------|------|------|------|
| 2.1 分页数据获取 | 使用cursor分页获取全部市场 | first=150, cursor | 市场列表+下一页cursor |
| 2.2 市场搜索 | 按关键词搜索特定市场 | searchQuery | 匹配的市场列表 |
| 2.3 市场筛选 | 按状态、类别、交易量筛选 | filter条件 | 筛选后的市场列表 |
| 2.4 市场详情获取 | 获取单个市场的完整信息 | marketId | 市场详情对象 |
| 2.5 数据标准化 | 将两个平台数据转为统一格式 | 原始API数据 | 标准格式数据 |

**数据标准化字段：**

```javascript
// 标准化市场对象
{
  id: string,              // 市场唯一ID
  platform: 'predict' | 'poly',  // 来源平台
  title: string,           // 市场标题
  description: string,     // 市场描述
  category: string,        // 类别
  status: string,          // 市场状态
  isOpen: boolean,         // 是否开放交易
  endDate: Date,           // 结束时间
  volume: number,          // 交易量
  liquidity: number,       // 流动性
  outcomes: [              // 结果选项
    {
      id: string,
      name: string,
      price: number,       // 当前价格(0-1)
      bestBid: number,     // 最佳买价
      bestAsk: number,     // 最佳卖价
      depth: number        // 深度
    }
  ],
  rawData: object          // 原始API数据
}
```

---

#### 模块3: 订单簿数据获取 (P0)

| 属性 | 内容 |
|-----|------|
| **模块名称** | Orderbook Data Fetcher |
| **功能描述** | 获取特定市场的订单簿数据（价格、深度） |
| **输入数据** | marketId, outcomeId |
| **输出结果** | 订单簿数据（买卖价格、深度） |
| **优先级** | P0 |

**详细功能点：**

| 功能点 | 描述 | 输入 | 输出 |
|-------|------|------|------|
| 3.1 Predict.fun订单簿 | 获取Predict.fun市场订单簿 | marketId, outcomeId | {bestBid, bestAsk, lastPrice, depth} |
| 3.2 Polymarket订单簿 | 获取Polymarket市场订单簿 | conditionId, outcomeId | {bestBid, bestAsk, lastPrice, depth} |
| 3.3 互补价格计算 | 计算No价格 = 1 - Yes卖价 | Yes卖价 | No价格 |
| 3.4 订单簿缓存 | 短期缓存订单簿数据 | - | - |
| 3.5 批量获取 | 同时获取多个市场订单簿 | marketId数组 | 订单簿数组 |

**订单簿数据结构：**

```javascript
{
  marketId: string,
  outcomeId: string,
  timestamp: Date,
  bestBid: number,      // 最高买价
  bestAsk: number,      // 最低卖价
  lastPrice: number,    // 最后成交价
  bidDepth: number,     // 买盘深度
  askDepth: number,     // 卖盘深度
  spread: number,       // 价差 (ask - bid)
  impliedNoPrice: number // 通过1-YesAsk计算的No价格
}
```

---

#### 模块4: 市场匹配引擎 (P0)

| 属性 | 内容 |
|-----|------|
| **模块名称** | Market Matching Engine |
| **功能描述** | 识别Predict.fun和Polymarket上的同一事件市场 |
| **输入数据** | 两个平台的市场列表 |
| **输出结果** | 匹配的市场对列表 |
| **优先级** | P0 |

**详细功能点：**

| 功能点 | 描述 | 输入 | 输出 |
|-------|------|------|------|
| 4.1 标题相似度匹配 | 基于标题文本相似度匹配 | 市场标题 | 相似度分数 |
| 4.2 关键词匹配 | 提取关键词进行匹配 | 市场描述 | 关键词匹配结果 |
| 4.3 时间窗口匹配 | 匹配结束时间相近的市场 | 结束时间 | 时间差 |
| 4.4 类别匹配 | 按类别筛选潜在匹配 | categorySlug | 同类市场 |
| 4.5 手动关联 | 允许用户手动关联市场 | 市场ID对 | 关联记录 |
| 4.6 关联存储 | 存储已确认的市场关联 | 关联数据 | 持久化存储 |

**匹配算法：**

```javascript
// 匹配评分算法
matchScore = (
  titleSimilarity * 0.4 +      // 标题相似度 (40%)
  keywordOverlap * 0.3 +       // 关键词重叠 (30%)
  timeProximity * 0.2 +        // 时间接近度 (20%)
  categoryMatch * 0.1          // 类别匹配 (10%)
)

// 匹配阈值
const MATCH_THRESHOLD = 0.75;  // 分数>=0.75视为匹配
```

---

#### 模块5: 套利机会识别 (P0)

| 属性 | 内容 |
|-----|------|
| **模块名称** | Arbitrage Opportunity Detector |
| **功能描述** | 计算并识别有利可图的套利机会 |
| **输入数据** | 匹配的市场对、订单簿数据 |
| **输出结果** | 套利机会列表（按收益率排序） |
| **优先级** | P0 |

**详细功能点：**

| 功能点 | 描述 | 输入 | 输出 |
|-------|------|------|------|
| 5.1 二元套利计算 | 计算Yes+No<1的套利空间 | 两个市场的订单簿 | 套利收益率 |
| 5.2 多元套利计算 | 计算多元市场的定价偏差 | 多元市场所有选项 | 偏差值 |
| 5.3 收益率计算 | 计算扣除费用后的净收益率 | 原始收益率 | 净收益率 |
| 5.4 风险评估 | 评估执行风险和时间风险 | 市场数据 | 风险等级 |
| 5.5 机会排序 | 按收益率排序套利机会 | 套利列表 | 排序后列表 |
| 5.6 阈值过滤 | 过滤低于最小收益率的机会 | 收益率阈值 | 过滤后列表 |

**套利计算逻辑：**

```javascript
// 二元市场套利计算
function calculateArbitrage(marketA, marketB) {
  // 方案1: A市场买Yes + B市场买No
  const scenario1 = {
    buyA_Yes: marketA.yes.bestAsk,      // A市场买Yes的价格
    buyB_No: 1 - marketB.yes.bestBid,   // B市场买No的价格(通过1-YesBid)
    totalCost: marketA.yes.bestAsk + (1 - marketB.yes.bestBid),
    profit: 1 - (marketA.yes.bestAsk + (1 - marketB.yes.bestBid)),
    roi: (1 - (marketA.yes.bestAsk + (1 - marketB.yes.bestBid))) / 
         (marketA.yes.bestAsk + (1 - marketB.yes.bestBid))
  };
  
  // 方案2: A市场买No + B市场买Yes
  const scenario2 = {
    buyA_No: 1 - marketA.yes.bestBid,
    buyB_Yes: marketB.yes.bestAsk,
    totalCost: (1 - marketA.yes.bestBid) + marketB.yes.bestAsk,
    profit: 1 - ((1 - marketA.yes.bestBid) + marketB.yes.bestAsk),
    roi: (1 - ((1 - marketA.yes.bestBid) + marketB.yes.bestAsk)) / 
         ((1 - marketA.yes.bestBid) + marketB.yes.bestAsk)
  };
  
  return scenario1.roi > scenario2.roi ? scenario1 : scenario2;
}

// 多元市场套利计算
function calculateMultiOutcomeArbitrage(market) {
  const totalPrice = market.outcomes.reduce((sum, o) => sum + o.bestAsk, 0);
  return {
    totalPrice,
    deviation: totalPrice - 1,  // >0表示过度定价，<0表示定价不足
    maxProfit: Math.abs(totalPrice - 1),
    roi: Math.abs(totalPrice - 1) / Math.min(...market.outcomes.map(o => o.bestAsk))
  };
}
```

---

#### 模块6: 实时监控引擎 (P1)

| 属性 | 内容 |
|-----|------|
| **模块名称** | Real-time Monitor Engine |
| **功能描述** | 持续监控市场数据变化，实时更新套利机会 |
| **输入数据** | 监控配置（刷新间隔、关注市场） |
| **输出结果** | 实时更新的套利机会数据 |
| **优先级** | P1 |

**详细功能点：**

| 功能点 | 描述 | 输入 | 输出 |
|-------|------|------|------|
| 6.1 定时刷新 | 按设定间隔刷新市场数据 | interval (秒) | 更新后的数据 |
| 6.2 WebSocket连接 | 使用WebSocket获取实时更新 | ws端点 | 实时数据流 |
| 6.3 变化检测 | 检测价格变化超过阈值 | 价格变化% | 变化事件 |
| 6.4 机会追踪 | 追踪套利机会的生命周期 | 机会ID | 状态变化 |
| 6.5 性能优化 | 只刷新活跃市场数据 | 活跃度指标 | 优化后的请求 |

**刷新策略：**

```javascript
const REFRESH_STRATEGY = {
  activeMarkets: 5,      // 活跃市场：5秒
  watchedMarkets: 15,    // 关注市场：15秒
  allMarkets: 60,        // 全部市场：60秒
  orderbook: 3           // 订单簿：3秒
};
```

---

#### 模块7: 通知系统 (P1)

| 属性 | 内容 |
|-----|------|
| **模块名称** | Notification System |
| **功能描述** | 当套利机会出现时通知用户 |
| **输入数据** | 套利机会事件、用户偏好 |
| **输出结果** | 通知消息 |
| **优先级** | P1 |

**详细功能点：**

| 功能点 | 描述 | 输入 | 输出 |
|-------|------|------|------|
| 7.1 浏览器通知 | 桌面浏览器推送通知 | 机会数据 | 通知弹窗 |
| 7.2 声音提醒 | 套利机会声音提示 | 触发事件 | 音频播放 |
| 7.3 邮件通知 | 高价值机会邮件通知 | 机会+阈值 | 邮件 |
| 7.4 通知设置 | 配置通知条件和方式 | 用户设置 | 配置保存 |
| 7.5 免打扰模式 | 设置静默时段 | 时间段 | 暂停通知 |

**通知条件：**

```javascript
const NOTIFICATION_RULES = {
  minROI: 0.02,           // 最小收益率 2%
  minProfit: 10,          // 最小利润 $10
  cooldown: 300,          // 同一市场通知冷却 5分钟
  maxPerHour: 10          // 每小时最多通知数
};
```

---

#### 模块8: 前端展示界面 (P0)

| 属性 | 内容 |
|-----|------|
| **模块名称** | Frontend Dashboard |
| **功能描述** | 展示市场数据、套利机会的交互界面 |
| **输入数据** | API返回的数据 |
| **输出结果** | 可视化界面 |
| **优先级** | P0 |

**详细功能点：**

| 功能点 | 描述 | 优先级 |
|-------|------|--------|
| 8.1 市场列表页 | 展示所有市场，支持搜索筛选 | P0 |
| 8.2 套利面板 | 展示当前套利机会，按收益率排序 | P0 |
| 8.3 价格对比图表 | 同一市场两平台价格对比 | P1 |
| 8.4 市场详情页 | 单个市场的完整信息和订单簿 | P0 |
| 8.5 设置页面 | 配置刷新间隔、通知偏好、阈值 | P1 |
| 8.6 历史记录 | 展示过去的套利机会 | P2 |

---

#### 模块9: 数据持久化 (P1)

| 属性 | 内容 |
|-----|------|
| **模块名称** | Data Persistence |
| **功能描述** | 存储历史数据、用户配置、市场关联 |
| **输入数据** | 各类数据对象 |
| **输出结果** | 持久化存储 |
| **优先级** | P1 |

**详细功能点：**

| 功能点 | 描述 | 存储内容 |
|-------|------|---------|
| 9.1 价格历史 | 存储历史价格数据 | 时间序列价格 |
| 9.2 套利历史 | 存储发现的套利机会 | 机会详情 |
| 9.3 市场关联 | 存储确认的市场匹配 | 市场ID映射 |
| 9.4 用户配置 | 存储用户偏好设置 | 配置对象 |
| 9.5 缓存数据 | 临时缓存API响应 | 缓存数据 |

---

#### 模块10: 数据分析 (P2)

| 属性 | 内容 |
|-----|------|
| **模块名称** | Analytics Module |
| **功能描述** | 分析套利机会的分布、成功率等 |
| **输入数据** | 历史数据 |
| **输出结果** | 分析报告和图表 |
| **优先级** | P2 |

**详细功能点：**

| 功能点 | 描述 | 输出 |
|-------|------|------|
| 10.1 套利分布分析 | 按类别、时间分析套利分布 | 统计图表 |
| 10.2 收益率统计 | 平均收益率、最大收益率等 | 统计指标 |
| 10.3 市场对比 | 两平台定价差异分析 | 对比报告 |
| 10.4 机会持续时间 | 分析套利机会的窗口期 | 时间统计 |

---

## 三、数据需求

### 3.1 Predict.fun 数据需求

#### API端点清单

| 端点 | 用途 | 必需字段 | 频率 |
|-----|------|---------|------|
| `/markets` | 获取市场列表 | id, title, description, status, tradingStatus, categorySlug, endDate, volume | 高 |
| `/markets/:id/orderbook` | 获取订单簿 | bestBid, bestAsk, lastPrice, depth | 高 |
| `/markets/:id` | 获取市场详情 | 全部详情字段 | 中 |

#### 数据字段映射

```javascript
// Predict.fun 原始字段 → 标准化字段
{
  // 市场基本信息
  "id": "market_id",
  "title": "market_title", 
  "description": "market_description",
  "status": "REGISTERED",           // 状态: REGISTERED, RESOLVED等
  "tradingStatus": "OPEN",          // 交易状态: OPEN, CLOSED
  "categorySlug": "politics",       // 类别标识
  "endDate": "2025-12-31T00:00:00Z", // 结束时间
  "volume": "1000000",              // 交易量
  
  // 订单簿数据
  "orderbook": {
    "bids": [{"price": 0.45, "size": 100}],
    "asks": [{"price": 0.47, "size": 150}],
    "lastPrice": 0.46
  }
}
```

### 3.2 Polymarket 数据需求

#### API端点清单

| 端点 | 用途 | 必需字段 | 频率 |
|-----|------|---------|------|
| `/markets` | 获取市场列表 | conditionId, question, description, active, closed, category, endDate, volume | 高 |
| `/prices` | 获取价格数据 | price, outcomeId | 高 |
| `/orderbook` | 获取订单簿 | bids, asks | 高 |

#### 数据字段映射

```javascript
// Polymarket 原始字段 → 标准化字段
{
  // 市场基本信息
  "conditionId": "0xabc...",
  "question": "Will Trump win 2024?",
  "description": "Market description...",
  "active": true,
  "closed": false,
  "category": "Politics",
  "endDate": "2024-11-05",
  "volume": "5000000",
  
  // 价格数据
  "prices": {
    "0": 0.52,  // outcome 0 (No)
    "1": 0.48   // outcome 1 (Yes)
  },
  
  // 订单簿
  "orderbook": {
    "bids": [[0.47, 100]],  // [价格, 数量]
    "asks": [[0.49, 150]]
  }
}
```

### 3.3 本地数据存储需求

#### 数据库表结构

```sql
-- 市场表
CREATE TABLE markets (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,  -- 'predict' 或 'poly'
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  status TEXT,
  is_open BOOLEAN,
  end_date TIMESTAMP,
  volume DECIMAL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 价格历史表
CREATE TABLE price_history (
  id SERIAL PRIMARY KEY,
  market_id TEXT REFERENCES markets(id),
  outcome_id TEXT,
  best_bid DECIMAL,
  best_ask DECIMAL,
  last_price DECIMAL,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- 市场关联表
CREATE TABLE market_pairs (
  id SERIAL PRIMARY KEY,
  predict_market_id TEXT REFERENCES markets(id),
  poly_market_id TEXT REFERENCES markets(id),
  match_score DECIMAL,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 套利机会表
CREATE TABLE arbitrage_opportunities (
  id SERIAL PRIMARY KEY,
  pair_id INTEGER REFERENCES market_pairs(id),
  type TEXT,  -- 'direct', 'reverse', 'multi'
  roi DECIMAL,
  profit DECIMAL,
  scenario JSONB,
  detected_at TIMESTAMP DEFAULT NOW(),
  expired_at TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE
);

-- 用户配置表
CREATE TABLE user_settings (
  id SERIAL PRIMARY KEY,
  min_roi DECIMAL DEFAULT 0.01,
  min_profit DECIMAL DEFAULT 5,
  refresh_interval INTEGER DEFAULT 10,
  notification_enabled BOOLEAN DEFAULT TRUE,
  sound_enabled BOOLEAN DEFAULT TRUE
);
```

---

## 四、套利识别逻辑详解

### 4.1 套利机会定义

#### 有效套利条件

| 条件 | 说明 | 公式 |
|-----|------|------|
| **价格条件** | Yes价格 + No价格 < 1 | `price_A_yes + price_B_no < 1` |
| **收益率条件** | 扣除费用后收益率 > 阈值 | `net_roi > MIN_ROI` |
| **流动性条件** | 有足够深度执行交易 | `depth > MIN_DEPTH` |
| **时间条件** | 市场仍在开放交易 | `isOpen === true` |

#### 费用计算

```javascript
// 平台费用（示例，需确认实际费率）
const FEES = {
  predict: {
    maker: 0.001,    // 挂单费 0.1%
    taker: 0.002     // 吃单费 0.2%
  },
  poly: {
    maker: 0.000,    // 挂单费 0%
    taker: 0.002     // 吃单费 0.2%
  }
};

// 净收益率计算
function calculateNetROI(grossROI, fees) {
  const totalFee = fees.predict.taker + fees.poly.taker;
  return grossROI - totalFee;
}
```

### 4.2 套利计算流程

```
┌─────────────────────────────────────────────────────────────────┐
│                      套利计算流程图                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐                                                │
│  │ 获取市场A   │                                                │
│  │ 订单簿      │                                                │
│  └──────┬──────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────┐     ┌─────────────┐                           │
│  │ 计算A的Yes  │────▶│ 计算A的No   │                           │
│  │ 价格        │     │ 价格=1-Yes  │                           │
│  └─────────────┘     └──────┬──────┘                           │
│                             │                                    │
│  ┌─────────────┐            │     ┌─────────────┐              │
│  │ 获取市场B   │            │     │ 计算B的No   │              │
│  │ 订单簿      │            └────▶│ 价格=1-Yes  │              │
│  └──────┬──────┘                  └─────────────┘              │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────┐                                                │
│  │ 计算B的Yes  │                                                │
│  │ 价格        │                                                │
│  └──────┬──────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────┐                       │
│  │         计算两种套利方案            │                       │
│  │  方案1: A买Yes + B买No              │                       │
│  │  方案2: A买No + B买Yes              │                       │
│  └─────────────────────────────────────┘                       │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────┐                       │
│  │         计算收益率和利润            │                       │
│  │  ROI = 利润 / 成本                  │                       │
│  └─────────────────────────────────────┘                       │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────┐                       │
│  │      扣除费用计算净收益率           │                       │
│  └─────────────────────────────────────┘                       │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────┐                       │
│  │  净收益率 > 阈值 ? 是 → 套利机会    │                       │
│  │                   否 → 放弃         │                       │
│  └─────────────────────────────────────┘                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 阈值设置

#### 默认阈值配置

| 参数 | 默认值 | 说明 | 可调范围 |
|-----|--------|------|---------|
| `MIN_ROI` | 1.5% | 最小收益率 | 0.5% - 5% |
| `MIN_PROFIT` | $5 | 最小利润额 | $1 - $50 |
| `MIN_DEPTH` | $100 | 最小深度 | $50 - $500 |
| `MAX_SPREAD` | 5% | 最大允许价差 | 2% - 10% |
| `COOLDOWN` | 300秒 | 同一市场通知冷却 | 60-600秒 |

---

## 五、边缘情况与异常处理

### 5.1 异常情况清单

| 编号 | 异常场景 | 影响 | 处理策略 |
|-----|---------|------|---------|
| E1 | **API限流** | 数据获取失败 | 实现指数退避重试 |
| E2 | **API超时** | 数据不完整 | 设置超时时间，返回缓存数据 |
| E3 | **CORS错误** | 前端请求失败 | 确保代理服务器正常工作 |
| E4 | **市场突然关闭** | 套利无法执行 | 实时监控市场状态变化 |
| E5 | **价格剧烈波动** | 套利窗口消失 | 增加价格变化检测 |
| E6 | **订单簿深度不足** | 无法完成交易 | 检查深度后再推荐套利 |
| E7 | **网络中断** | 数据更新停止 | 检测连接状态，自动重连 |
| E8 | **数据不一致** | 错误套利信号 | 多源数据校验 |
| E9 | **分页数据丢失** | 市场列表不完整 | 实现完整的分页遍历 |
| E10 | **市场匹配错误** | 错误的市场关联 | 人工审核+相似度阈值 |

### 5.2 错误处理策略

```javascript
// 错误处理配置
const ERROR_HANDLING = {
  // API错误
  api: {
    maxRetries: 3,           // 最大重试次数
    retryDelay: 1000,        // 初始重试延迟(ms)
    backoffMultiplier: 2,    // 退避倍数
    fallbackToCache: true    // 失败后使用缓存
  },
  
  // 数据错误
  data: {
    validateSchema: true,    // 验证数据格式
    logInvalidData: true,    // 记录无效数据
    useLastKnown: true       // 使用最后已知有效值
  },
  
  // 套利计算错误
  arbitrage: {
    sanityCheck: true,       // 合理性检查
    maxROI: 0.5,             // 最大合理收益率50%
    rejectOutliers: true     // 拒绝异常值
  }
};

// 重试策略
async function fetchWithRetry(url, options, retryCount = 0) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (retryCount < ERROR_HANDLING.api.maxRetries) {
      const delay = ERROR_HANDLING.api.retryDelay * 
                    Math.pow(ERROR_HANDLING.api.backoffMultiplier, retryCount);
      await sleep(delay);
      return fetchWithRetry(url, options, retryCount + 1);
    }
    throw error;
  }
}
```

### 5.3 数据验证规则

```javascript
// 市场数据验证
const VALIDATION_RULES = {
  market: {
    id: { required: true, type: 'string' },
    title: { required: true, type: 'string', minLength: 5 },
    status: { required: true, enum: ['REGISTERED', 'RESOLVED', 'CANCELLED'] },
    endDate: { required: true, type: 'date' }
  },
  
  orderbook: {
    bestBid: { required: true, type: 'number', min: 0, max: 1 },
    bestAsk: { required: true, type: 'number', min: 0, max: 1 },
    lastPrice: { required: false, type: 'number', min: 0, max: 1 },
    depth: { required: false, type: 'number', min: 0 }
  },
  
  arbitrage: {
    roi: { required: true, type: 'number', min: -1, max: 1 },
    profit: { required: true, type: 'number' },
    totalCost: { required: true, type: 'number', min: 0 }
  }
};
```

### 5.4 监控与告警

| 监控项 | 阈值 | 告警方式 |
|-------|------|---------|
| API错误率 | > 10% | 日志+通知 |
| 数据延迟 | > 30秒 | 日志+通知 |
| 套利计算异常 | > 5次/小时 | 日志+邮件 |
| 系统内存 | > 80% | 日志 |
| 响应时间 | > 5秒 | 日志 |

---

## 六、功能优先级汇总

### P0 (必须有) - MVP核心功能

| 模块 | 功能点 | 说明 |
|-----|--------|------|
| 后端代理 | 1.1-1.4 | API代理解决CORS |
| 市场获取 | 2.1-2.5 | 获取并标准化市场数据 |
| 订单簿获取 | 3.1-3.3 | 获取订单簿并计算互补价格 |
| 市场匹配 | 4.1-4.4 | 自动匹配同一事件市场 |
| 套利识别 | 5.1-5.3 | 计算套利收益率 |
| 前端展示 | 8.1,8.2,8.4 | 基本界面展示 |

### P1 (应该有) - 增强功能

| 模块 | 功能点 | 说明 |
|-----|--------|------|
| 订单簿获取 | 3.4-3.5 | 缓存和批量获取 |
| 市场匹配 | 4.5-4.6 | 手动关联和存储 |
| 套利识别 | 5.4-5.6 | 风险评估和阈值过滤 |
| 实时监控 | 6.1-6.5 | 定时刷新和变化检测 |
| 通知系统 | 7.1-7.5 | 多种通知方式 |
| 前端展示 | 8.3,8.5 | 图表和设置 |
| 数据持久化 | 9.1-9.5 | 历史数据存储 |

### P2 (可以有) - 高级功能

| 模块 | 功能点 | 说明 |
|-----|--------|------|
| 前端展示 | 8.6 | 历史记录 |
| 数据分析 | 10.1-10.4 | 统计分析和报告 |

---

## 七、技术实现建议

### 推荐技术栈

| 层级 | 技术 | 说明 |
|-----|------|------|
| 前端 | React + TypeScript | 类型安全，组件化 |
| 后端 | Node.js + Express | 轻量，适合API代理 |
| 数据库 | PostgreSQL / SQLite | 关系型数据存储 |
| 缓存 | Redis / 内存缓存 | 高频数据缓存 |
| 部署 | Docker | 容器化部署 |

### 性能目标

| 指标 | 目标值 |
|-----|--------|
| 页面加载时间 | < 3秒 |
| API响应时间 | < 500ms |
| 数据刷新延迟 | < 10秒 |
| 并发市场数 | > 1000 |

---

## 八、总结

本需求分析文档涵盖了跨市场套利监控系统的完整功能需求：

1. **核心目标**：实时监控两个预测市场价格差异，自动识别套利机会
2. **10个功能模块**：从数据获取到套利识别，再到通知展示
3. **详细数据需求**：两个平台的API字段和本地存储结构
4. **套利计算逻辑**：完整的计算流程和阈值设置
5. **边缘情况处理**：10种异常场景的处理策略

### 下一步建议：
1. 确认API认证方式和费率信息
2. 设计数据库详细schema
3. 开发MVP版本（P0功能）
4. 迭代优化（P1/P2功能）
