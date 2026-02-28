# 跨市场套利监控系统 - 技术规格文档

## 1. 系统架构

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              前端应用 (React)                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ 市场列表页   │  │ 套利监控页   │  │ 设置页面     │  │ 详情弹窗     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     状态管理 (Zustand)                               │   │
│  │  - 市场数据缓存  - 套利机会列表  - 用户配置  - API Key管理           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     数据服务层                                       │   │
│  │  - API客户端封装  - 数据转换  - 缓存策略  - 错误处理                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTP/REST
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Node.js 代理服务器                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Express/Fastify 服务器                           │   │
│  │  - CORS处理  - 请求转发  - 认证头注入  - 响应缓存                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │   Predict.fun API 路由      │  │   Polymarket API 路由               │  │
│  │   /api/predict/*            │  │   /api/polymarket/*                 │  │
│  └─────────────────────────────┘  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
┌─────────────────────────────────┐  ┌─────────────────────────────────────┐
│      Predict.fun API            │  │         Polymarket API              │
│  https://api.predict.fun/v1/    │  │  https://gamma-api.polymarket.com/  │
│                                 │  │  https://clob.polymarket.com/       │
│  - REST API (GraphQL可用)       │  │  - REST API                         │
│  - 需要 x-api-key 认证          │  │  - 部分端点需要认证                 │
│  - 240 req/min 限制             │  │  - WebSocket支持                    │
└─────────────────────────────────┘  └─────────────────────────────────────┘
```

### 1.2 前端架构

```
src/
├── components/           # UI组件
│   ├── common/          # 通用组件
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   └── Loading.tsx
│   ├── markets/         # 市场相关组件
│   │   ├── MarketList.tsx
│   │   ├── MarketCard.tsx
│   │   ├── MarketFilter.tsx
│   │   └── MarketDetailModal.tsx
│   ├── arbitrage/       # 套利相关组件
│   │   ├── ArbitrageTable.tsx
│   │   ├── ArbitrageCard.tsx
│   │   └── PriceComparison.tsx
│   └── charts/          # 图表组件
│       ├── PriceChart.tsx
│       └── DepthChart.tsx
├── hooks/               # 自定义Hooks
│   ├── useMarkets.ts    # 市场数据获取
│   ├── useOrderbook.ts  # 订单簿数据
│   ├── useArbitrage.ts  # 套利计算
│   └── usePolling.ts    # 轮询管理
├── stores/              # 状态管理 (Zustand)
│   ├── marketStore.ts   # 市场数据状态
│   ├── arbitrageStore.ts # 套利机会状态
│   └── settingsStore.ts # 用户配置状态
├── services/            # API服务
│   ├── apiClient.ts     # HTTP客户端封装
│   ├── predictApi.ts    # Predict.fun API
│   └── polymarketApi.ts # Polymarket API
├── utils/               # 工具函数
│   ├── calculations.ts  # 套利计算
│   ├── formatters.ts    # 数据格式化
│   └── validators.ts    # 数据验证
├── types/               # TypeScript类型
│   └── index.ts
└── config/              # 配置文件
    └── constants.ts
```

### 1.3 后端代理服务器架构

```
server/
├── src/
│   ├── routes/          # API路由
│   │   ├── predict.ts   # Predict.fun 代理路由
│   │   └── polymarket.ts # Polymarket 代理路由
│   ├── middleware/      # 中间件
│   │   ├── cors.ts      # CORS处理
│   │   ├── auth.ts      # 认证处理
│   │   ├── rateLimit.ts # 速率限制
│   │   └── errorHandler.ts # 错误处理
│   ├── services/        # 服务层
│   │   ├── cacheService.ts  # 响应缓存
│   │   └── proxyService.ts  # 请求转发
│   ├── utils/           # 工具函数
│   │   └── helpers.ts
│   └── config/          # 配置
│       └── index.ts
├── package.json
└── tsconfig.json
```

### 1.4 数据流图

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   用户操作   │────▶│  前端状态   │────▶│  API请求    │────▶│  代理服务器  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                                                    │
                              ┌─────────────────────────────────────┘
                              │
                              ▼
                       ┌─────────────┐
                       │  外部API    │
                       │ Predict.fun │
                       │ Polymarket  │
                       └─────────────┘
                              │
                              │ 响应数据
                              ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   UI渲染    │◀────│  状态更新   │◀────│  数据处理   │◀────│  代理响应   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘

数据流说明：
1. 用户在前端进行操作（如刷新市场列表）
2. 前端状态管理触发API请求
3. 请求发送到Node.js代理服务器（解决CORS问题）
4. 代理服务器转发请求到外部API并添加认证头
5. 外部API返回数据
6. 代理服务器处理响应并返回给前端
7. 前端进行数据转换和套利计算
8. 更新状态并重新渲染UI
```

---

## 2. API集成清单

### 2.1 Predict.fun API

#### 基础信息
| 属性 | 值 |
|------|-----|
| 基础URL | `https://api.predict.fun/v1` |
| 测试网URL | `https://api-testnet.predict.fun/v1` |
| 协议 | REST (GraphQL也可用) |
| 认证方式 | Header: `x-api-key` |
| 速率限制 | 240 请求/分钟 |

#### 需要的端点

##### 1. 获取分类列表
```
GET /v1/categories
```
**用途**: 获取所有可交易的分类（多元市场组）

**查询参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| first | string | 否 | 返回数量（最大150） |
| after | string | 否 | 分页cursor |
| status | enum | 否 | OPEN/RESOLVED |
| sort | enum | 否 | 排序方式 |

**响应字段**:
```typescript
interface Category {
  id: number;
  slug: string;           // 分类slug，用于识别同一组市场
  title: string;
  description: string;
  imageUrl: string;
  isNegRisk: boolean;
  isYieldBearing: boolean;
  marketVariant: string;
  createdAt: string;
  publishedAt: string;
  markets: Market[];      // 分类下的市场列表
}
```

**注意事项**:
- 使用 `categorySlug` 字段识别同一组多元市场
- 分类状态为 `OPEN` 时才可交易

---

##### 2. 获取市场列表
```
GET /v1/markets
```
**用途**: 获取所有市场或按条件筛选

**查询参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| first | string | 否 | 返回数量（最大150） |
| after | string | 否 | 分页cursor |
| status | enum | 否 | OPEN/RESOLVED |
| tradingStatus | enum | 否 | OPEN/CLOSED |
| tagIds | string/array | 否 | 标签ID筛选 |
| sort | enum | 否 | 排序方式 |

**响应字段**:
```typescript
interface Market {
  id: number;
  imageUrl: string;
  title: string;
  question: string;
  description: string;
  tradingStatus: 'OPEN' | 'CLOSED';    // 交易状态
  status: 'REGISTERED' | 'RESOLVED';    // 注册状态
  isVisible: boolean;
  isNegRisk: boolean;
  isYieldBearing: boolean;
  feeRateBps: number;
  outcomes: Outcome[];                  // 结果选项
  conditionId: string;                  // 条件ID（用于关联Polymarket）
  categorySlug: string;                 // 分类slug
  polymarketConditionIds: string[];     // 关联的Polymarket条件ID
  kalshiMarketTicker: string;           // Kalshi市场代码
  createdAt: string;
  decimalPrecision: number;
}

interface Outcome {
  name: string;           // "Yes" 或 "No"
  indexSet: number;
  onChainId: string;
  status: 'PENDING' | 'WON' | 'LOST';
}
```

**注意事项**:
- 交易中状态判断: `status === 'REGISTERED' && tradingStatus === 'OPEN'`
- `first` 参数最大为150，需要使用cursor分页循环获取
- 通过 `polymarketConditionIds` 关联Polymarket市场

---

##### 3. 获取市场订单簿
```
GET /v1/markets/{id}/orderbook
```
**用途**: 获取指定市场的订单簿数据

**路径参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| id | string | 是 | 市场ID |

**响应字段**:
```typescript
interface Orderbook {
  marketId: number;
  updateTimestampMs: number;    // 更新时间戳
  lastOrderSettled: {           // 最后成交信息
    id: string;
    price: string;              // 成交价格
    kind: string;
    marketId: number;
    side: 'Ask' | 'Bid';
    outcome: 'Yes' | 'No';
  } | null;
  asks: number[][];             // 卖单 [[价格, 深度], ...]
  bids: number[][];             // 买单 [[价格, 深度], ...]
}
```

**注意事项**:
- 订单簿只提供价格、深度、最后成交价格/方向/结果
- **不提供单次成交量**
- No价格需要通过 `1 - Yes卖价` 计算
- 订单簿基于Yes结果存储价格

---

##### 4. 获取市场统计
```
GET /v1/markets/{id}/statistics
```
**用途**: 获取市场统计数据（交易量等）

---

##### 5. 搜索市场
```
GET /v1/search
```
**用途**: 搜索分类和市场

**查询参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| q | string | 是 | 搜索关键词 |

---

### 2.2 Polymarket API

#### 基础信息
| 属性 | 值 |
|------|-----|
| Gamma API URL | `https://gamma-api.polymarket.com` |
| CLOB API URL | `https://clob.polymarket.com` |
| 协议 | REST |
| 认证方式 | 部分端点需要API Key |

#### 需要的端点

##### 1. 获取市场列表 (Gamma API)
```
GET /markets
```
**用途**: 获取所有活跃市场

**查询参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回数量 |
| offset | number | 否 | 偏移量 |
| active | boolean | 否 | 是否活跃 |
| closed | boolean | 否 | 是否已关闭 |
| liquidity_num_min | number | 否 | 最小流动性 |
| volume_num_min | number | 否 | 最小交易量 |

**响应字段**:
```typescript
interface PolymarketMarket {
  id: string;
  slug: string;
  title: string;
  description: string;
  outcomes: string[];
  outcomePrices: string[];      // 价格数组 ["0.65", "0.35"]
  volume: string;
  liquidity: string;
  active: boolean;
  closed: boolean;
  conditionId: string;          // 条件ID（用于关联Predict.fun）
  clobTokenIds: string[];       // CLOB代币ID
  createdAt: string;
  updatedAt: string;
}
```

---

##### 2. 获取市场详情 (Gamma API)
```
GET /markets/{slug}
```
**用途**: 获取指定市场的详细信息

---

##### 3. 获取订单簿 (CLOB API)
```
GET /book
```
**用途**: 获取指定市场的订单簿

**查询参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| token_id | string | 是 | CLOB代币ID |
| side | string | 否 | BID/ASK |

**响应字段**:
```typescript
interface PolymarketOrderbook {
  market: string;           // 市场地址
  asset_id: string;         // 资产ID
  bids: {
    price: string;
    size: string;
  }[];
  asks: {
    price: string;
    size: string;
  }[];
  timestamp: string;
}
```

---

##### 4. 获取价格历史 (CLOB API)
```
GET /prices-history
```
**用途**: 获取历史价格数据

**查询参数**:
| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| market | string | 是 | CLOB代币ID |
| interval | string | 否 | 时间间隔 (1m, 1h, 1d) |
| fidelity | number | 否 | 分辨率（分钟） |

---

### 2.3 API限制对比

| 限制项 | Predict.fun | Polymarket |
|--------|-------------|------------|
| 速率限制 | 240 req/min | 100 req/min (免费) |
| 分页限制 | first ≤ 150 | limit ≤ 100 |
| 认证要求 | 必需 (x-api-key) | 部分端点需要 |
| CORS支持 | 否（需要代理） | 否（需要代理） |
| WebSocket | 否 | 是 |

---

## 3. 技术栈建议

### 3.1 前端技术栈

| 类别 | 推荐方案 | 备选方案 | 选择理由 |
|------|----------|----------|----------|
| **框架** | React 18+ | Vue 3 | 生态系统成熟，组件化开发 |
| **语言** | TypeScript | JavaScript | 类型安全，更好的IDE支持 |
| **构建工具** | Vite | Webpack | 快速冷启动，HMR支持 |
| **状态管理** | Zustand | Redux, Jotai | 轻量级，TypeScript友好 |
| **数据获取** | TanStack Query | SWR | 强大的缓存和重试机制 |
| **UI组件库** | shadcn/ui + Tailwind | Ant Design, Material-UI | 可定制，现代设计 |
| **图表库** | Recharts | Chart.js, D3.js | React友好，易于使用 |
| **表格组件** | TanStack Table | AG Grid | 功能强大，性能好 |
| **HTTP客户端** | Axios | fetch | 拦截器支持，错误处理 |
| **表单处理** | React Hook Form | Formik | 性能优秀，验证集成 |

### 3.2 后端技术栈

| 类别 | 推荐方案 | 备选方案 | 选择理由 |
|------|----------|----------|----------|
| **运行时** | Node.js 20+ | Deno, Bun | 生态成熟，性能稳定 |
| **框架** | Fastify | Express, Koa | 高性能，TypeScript支持 |
| **语言** | TypeScript | JavaScript | 类型安全 |
| **代理** | http-proxy-middleware | node-http-proxy | Express/Fastify集成 |
| **缓存** | node-cache | Redis (生产) | 简单，足够用于代理缓存 |
| **日志** | pino | winston | 高性能，结构化日志 |
| **监控** | prom-client | - | Prometheus指标导出 |

### 3.3 开发工具

| 类别 | 推荐方案 |
|------|----------|
| **包管理** | pnpm |
| **代码检查** | ESLint + Prettier |
| **Git钩子** | husky + lint-staged |
| **测试** | Vitest + React Testing Library |
| **类型检查** | TypeScript strict模式 |

---

## 4. 数据模型

### 4.1 市场数据结构

```typescript
// ==================== Predict.fun 市场 ====================

interface PredictMarket {
  // 基础信息
  id: number;
  title: string;
  question: string;
  description: string;
  imageUrl: string;
  
  // 状态
  tradingStatus: 'OPEN' | 'CLOSED';
  status: 'REGISTERED' | 'RESOLVED';
  isVisible: boolean;
  
  // 交易相关
  feeRateBps: number;           // 手续费率（基点）
  spreadThreshold: number;
  shareThreshold: number;
  
  // 结果选项
  outcomes: PredictOutcome[];
  
  // 关联ID
  conditionId: string;
  categorySlug: string;
  polymarketConditionIds: string[];
  kalshiMarketTicker: string | null;
  
  // 元数据
  createdAt: string;
  decimalPrecision: number;
  isNegRisk: boolean;
  isYieldBearing: boolean;
  
  // 运行时数据（非API返回）
  orderbook?: PredictOrderbook;
  statistics?: PredictStatistics;
}

interface PredictOutcome {
  name: 'Yes' | 'No';
  indexSet: number;
  onChainId: string;
  status: 'PENDING' | 'WON' | 'LOST';
}

interface PredictOrderbook {
  marketId: number;
  updateTimestampMs: number;
  lastOrderSettled: LastTrade | null;
  asks: [number, number][];     // [价格, 深度]
  bids: [number, number][];     // [价格, 深度]
}

interface LastTrade {
  id: string;
  price: string;
  side: 'Ask' | 'Bid';
  outcome: 'Yes' | 'No';
}

interface PredictStatistics {
  volume24h: number;
  volumeTotal: number;
  liquidity: number;
}

// ==================== Polymarket 市场 ====================

interface PolymarketMarket {
  // 基础信息
  id: string;
  slug: string;
  title: string;
  description: string;
  
  // 状态
  active: boolean;
  closed: boolean;
  archived: boolean;
  
  // 交易数据
  volume: string;
  liquidity: string;
  outcomePrices: string[];      // ["0.65", "0.35"]
  
  // 结果选项
  outcomes: string[];           // ["Yes", "No"]
  
  // 关联ID
  conditionId: string;
  clobTokenIds: string[];       // [YesTokenId, NoTokenId]
  
  // 元数据
  createdAt: string;
  updatedAt: string;
  
  // 运行时数据（非API返回）
  orderbook?: PolymarketOrderbook;
}

interface PolymarketOrderbook {
  tokenId: string;
  bids: OrderLevel[];
  asks: OrderLevel[];
  timestamp: number;
}

interface OrderLevel {
  price: string;
  size: string;
}

// ==================== 统一市场模型 ====================

interface UnifiedMarket {
  // 唯一标识
  id: string;                   // 组合ID: "predict:{id}" 或 "polymarket:{id}"
  source: 'predict' | 'polymarket';
  sourceId: string;
  
  // 关联信息
  conditionId: string;          // 用于跨平台匹配
  categorySlug?: string;        // 多元市场组标识
  
  // 基础信息
  title: string;
  description: string;
  
  // 状态
  isActive: boolean;
  isTradable: boolean;
  
  // 价格数据
  yesPrice: number;             // Yes当前价格 (0-1)
  noPrice: number;              // No当前价格 (0-1)，计算: 1 - yesPrice
  
  // 订单簿
  orderbook: UnifiedOrderbook;
  
  // 交易量
  volume24h?: number;
  volumeTotal?: number;
  liquidity?: number;
  
  // 元数据
  lastUpdated: number;
  feeRate: number;              // 手续费率
}

interface UnifiedOrderbook {
  yesToken: {
    bids: [number, number][];   // [价格, 数量]
    asks: [number, number][];
    lastPrice?: number;
  };
  noToken: {
    bids: [number, number][];
    asks: [number, number][];
    lastPrice?: number;
  };
  timestamp: number;
}
```

### 4.2 套利机会数据结构

```typescript
// ==================== 套利机会 ====================

interface ArbitrageOpportunity {
  // 唯一标识
  id: string;                   // 生成规则: `${conditionId}_${timestamp}`
  
  // 关联市场
  conditionId: string;          // 条件ID
  categorySlug?: string;        // 分类slug（多元市场）
  
  // 市场信息
  predictMarket: UnifiedMarket;
  polymarketMarket: UnifiedMarket;
  
  // 套利计算
  direction: 'predict_to_polymarket' | 'polymarket_to_predict';
  
  // Yes代币套利
  yesOpportunity?: TokenArbitrage;
  
  // No代币套利
  noOpportunity?: TokenArbitrage;
  
  // 综合评分
  score: number;                // 套利评分 (0-100)
  confidence: 'high' | 'medium' | 'low';
  
  // 时间戳
  detectedAt: number;
  expiresAt: number;            // 预计过期时间
}

interface TokenArbitrage {
  tokenType: 'Yes' | 'No';
  
  // 买入信息
  buyPlatform: 'predict' | 'polymarket';
  buyPrice: number;
  buySize: number;              // 可买入数量
  
  // 卖出信息
  sellPlatform: 'predict' | 'polymarket';
  sellPrice: number;
  sellSize: number;             // 可卖出数量
  
  // 利润计算
  priceDiff: number;            // 价差 (绝对值)
  priceDiffPercent: number;     // 价差百分比
  maxProfit: number;            // 最大利润（考虑数量限制）
  profitPercent: number;        // 利润率
  
  // 费用计算
  buyFee: number;
  sellFee: number;
  netProfit: number;            // 净利润
  
  // 执行建议
  recommendedAmount: number;    // 建议交易数量
  expectedReturn: number;       // 预期回报
}

// ==================== 套利统计 ====================

interface ArbitrageStats {
  // 当前机会
  totalOpportunities: number;
  highConfidenceCount: number;
  mediumConfidenceCount: number;
  lowConfidenceCount: number;
  
  // 按方向统计
  predictToPolymarketCount: number;
  polymarketToPredictCount: number;
  
  // 历史统计
  totalDetected24h: number;
  avgProfitPercent24h: number;
  maxProfitPercent24h: number;
  
  // 最后更新时间
  lastUpdated: number;
}
```

### 4.3 用户配置数据结构

```typescript
// ==================== 用户配置 ====================

interface UserSettings {
  // API配置
  apiKeys: {
    predictFun: string | null;
    polymarket: string | null;
  };
  
  // 监控配置
  monitoring: {
    enabled: boolean;
    refreshInterval: number;      // 刷新间隔（秒）
    autoRefresh: boolean;
  };
  
  // 套利筛选配置
  filters: {
    minProfitPercent: number;     // 最小利润率 (%)
    maxProfitPercent: number;     // 最大利润率 (%)
    minConfidence: 'high' | 'medium' | 'low';
    minLiquidity: number;         // 最小流动性 (USD)
    minVolume24h: number;         // 最小24h交易量 (USD)
  };
  
  // 通知配置
  notifications: {
    enabled: boolean;
    minProfitForAlert: number;    // 触发通知的最小利润
    soundEnabled: boolean;
    browserNotification: boolean;
  };
  
  // 显示配置
  display: {
    theme: 'light' | 'dark' | 'system';
    compactMode: boolean;
    defaultSortBy: 'profit' | 'confidence' | 'time';
    itemsPerPage: number;
  };
}

// 默认配置
const DEFAULT_SETTINGS: UserSettings = {
  apiKeys: {
    predictFun: null,
    polymarket: null,
  },
  monitoring: {
    enabled: true,
    refreshInterval: 30,
    autoRefresh: true,
  },
  filters: {
    minProfitPercent: 1,
    maxProfitPercent: 50,
    minConfidence: 'medium',
    minLiquidity: 1000,
    minVolume24h: 500,
  },
  notifications: {
    enabled: true,
    minProfitForAlert: 5,
    soundEnabled: false,
    browserNotification: false,
  },
  display: {
    theme: 'system',
    compactMode: false,
    defaultSortBy: 'profit',
    itemsPerPage: 20,
  },
};
```

---

## 5. 状态管理

### 5.1 全局状态 (Zustand Stores)

```typescript
// ==================== 市场数据 Store ====================

interface MarketStore {
  // 数据
  predictMarkets: Map<number, PredictMarket>;
  polymarketMarkets: Map<string, PolymarketMarket>;
  unifiedMarkets: Map<string, UnifiedMarket>;
  
  // 加载状态
  isLoadingPredict: boolean;
  isLoadingPolymarket: boolean;
  lastUpdateTime: number | null;
  
  // 错误状态
  error: Error | null;
  
  // Actions
  fetchPredictMarkets: () => Promise<void>;
  fetchPolymarketMarkets: () => Promise<void>;
  fetchOrderbook: (marketId: string, source: 'predict' | 'polymarket') => Promise<void>;
  refreshAll: () => Promise<void>;
  
  // 选择器
  getMarketByConditionId: (conditionId: string) => UnifiedMarket[];
  getActiveMarkets: () => UnifiedMarket[];
}

// ==================== 套利机会 Store ====================

interface ArbitrageStore {
  // 数据
  opportunities: Map<string, ArbitrageOpportunity>;
  stats: ArbitrageStats;
  
  // 加载状态
  isCalculating: boolean;
  lastCalculationTime: number | null;
  
  // Actions
  calculateOpportunities: () => void;
  clearExpired: () => void;
  
  // 选择器
  getFilteredOpportunities: (filters: FilterOptions) => ArbitrageOpportunity[];
  getHighConfidenceOpportunities: () => ArbitrageOpportunity[];
}

// ==================== 用户配置 Store ====================

interface SettingsStore {
  // 数据
  settings: UserSettings;
  
  // Actions
  updateApiKey: (platform: 'predictFun' | 'polymarket', key: string | null) => void;
  updateMonitoring: (config: Partial<UserSettings['monitoring']>) => void;
  updateFilters: (filters: Partial<UserSettings['filters']>) => void;
  updateNotifications: (config: Partial<UserSettings['notifications']>) => void;
  updateDisplay: (config: Partial<UserSettings['display']>) => void;
  resetToDefaults: () => void;
  
  // 持久化
  loadFromStorage: () => void;
  saveToStorage: () => void;
}
```

### 5.2 本地状态 (React useState)

```typescript
// 组件级本地状态

// MarketList 组件
const [searchQuery, setSearchQuery] = useState('');
const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

// ArbitrageTable 组件
const [selectedOpportunity, setSelectedOpportunity] = useState<ArbitrageOpportunity | null>(null);
const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

// Settings 组件
const [activeTab, setActiveTab] = useState<'api' | 'filters' | 'notifications' | 'display'>('api');
const [isTestingConnection, setIsTestingConnection] = useState(false);
```

### 5.3 数据缓存策略

```typescript
// ==================== 缓存配置 ====================

interface CacheConfig {
  // 市场列表缓存
  marketsList: {
    ttl: 30000;           // 30秒
    staleWhileRevalidate: true;
  };
  
  // 订单簿缓存
  orderbook: {
    ttl: 10000;           // 10秒
    staleWhileRevalidate: true;
  };
  
  // 统计数据缓存
  statistics: {
    ttl: 60000;           // 60秒
    staleWhileRevalidate: true;
  };
  
  // 套利计算结果
  arbitrage: {
    ttl: 5000;            // 5秒（实时性要求高）
    staleWhileRevalidate: false;
  };
}

// ==================== TanStack Query 配置 ====================

const queryConfig = {
  markets: {
    queryKey: ['markets'],
    queryFn: fetchMarkets,
    staleTime: 30000,           // 30秒后过期
    cacheTime: 600000,          // 缓存10分钟
    refetchInterval: 30000,     // 每30秒自动刷新
    refetchOnWindowFocus: true,
  },
  orderbook: {
    queryKey: ['orderbook'],
    queryFn: fetchOrderbook,
    staleTime: 10000,           // 10秒后过期
    cacheTime: 60000,           // 缓存1分钟
    refetchInterval: 10000,     // 每10秒自动刷新
  },
};
```

---

## 6. 实时更新策略

### 6.1 轮询 vs WebSocket

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **轮询** | 实现简单，兼容性好 | 实时性较低，带宽消耗大 | Predict.fun (无WebSocket) |
| **WebSocket** | 实时性高，带宽效率高 | 实现复杂，需要维护连接 | Polymarket (支持WebSocket) |

### 6.2 推荐策略：混合方案

```
┌─────────────────────────────────────────────────────────────────┐
│                      实时更新架构                                │
│                                                                  │
│  ┌─────────────────┐        ┌─────────────────┐                 │
│  │  Predict.fun    │        │  Polymarket     │                 │
│  │  (轮询)         │        │  (WebSocket)    │                 │
│  │                 │        │                 │                 │
│  │  市场列表: 30s  │        │  市场列表: 30s  │                 │
│  │  订单簿: 10s    │        │  订单簿: WS推送 │                 │
│  └────────┬────────┘        └────────┬────────┘                 │
│           │                          │                          │
│           │                          │                          │
│           ▼                          ▼                          │
│  ┌─────────────────────────────────────────┐                   │
│  │         数据聚合与套利计算引擎           │                   │
│  │  - 统一数据格式  - 价格对齐  - 套利检测   │                   │
│  └─────────────────────────────────────────┘                   │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────────┐                   │
│  │         前端状态更新 (Zustand)           │                   │
│  │  - 增量更新  - 选择性渲染  - 动画过渡     │                   │
│  └─────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 刷新频率建议

| 数据类型 | Predict.fun | Polymarket | 说明 |
|----------|-------------|------------|------|
| 市场列表 | 30秒 | 30秒 | 市场信息变化不频繁 |
| 订单簿 | 10秒 | WebSocket | 订单簿变化频繁 |
| 统计数据 | 60秒 | 60秒 | 统计数据变化较慢 |
| 套利计算 | 5秒 | 5秒 | 基于最新数据实时计算 |

### 6.4 性能优化策略

```typescript
// ==================== 防抖与节流 ====================

// 防抖：搜索输入
const debouncedSearch = useDebounce(searchQuery, 300);

// 节流：滚动加载
const throttledScroll = useThrottle(handleScroll, 100);

// ==================== 虚拟列表 ====================

// 大量市场列表使用虚拟列表
import { VirtualList } from 'react-virtualized';

<VirtualList
  width={width}
  height={height}
  rowCount={markets.length}
  rowHeight={80}
  rowRenderer={rowRenderer}
/>

// ==================== 选择性渲染 ====================

// 只更新变化的数据
const MarketRow = React.memo(({ market }: { market: UnifiedMarket }) => {
  // 组件实现
}, (prev, next) => {
  // 自定义比较函数
  return prev.market.lastUpdated === next.market.lastUpdated;
});

// ==================== 数据预取 ====================

// 鼠标悬停时预取订单簿数据
const handleMouseEnter = (marketId: string) => {
  queryClient.prefetchQuery({
    queryKey: ['orderbook', marketId],
    queryFn: () => fetchOrderbook(marketId),
    staleTime: 10000,
  });
};
```

---

## 7. 安全考虑

### 7.1 API Key 安全传输

```typescript
// ==================== 安全传输方案 ====================

// 1. 前端不直接存储API Key到代码
// 2. 使用localStorage存储（用户输入）
// 3. 通过请求头传递给后端代理

// API Key 管理
class ApiKeyManager {
  private static STORAGE_KEY = 'arbitrage_monitor_api_keys';
  
  static getKeys(): { predictFun: string | null; polymarket: string | null } {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : { predictFun: null, polymarket: null };
    } catch {
      return { predictFun: null, polymarket: null };
    }
  }
  
  static setKey(platform: 'predictFun' | 'polymarket', key: string | null): void {
    const keys = this.getKeys();
    keys[platform] = key;
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(keys));
  }
  
  static clearKeys(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}

// HTTP客户端配置
const apiClient = axios.create({
  baseURL: '/api',  // 代理服务器
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：添加API Key
apiClient.interceptors.request.use((config) => {
  const keys = ApiKeyManager.getKeys();
  
  if (config.url?.includes('/predict/') && keys.predictFun) {
    config.headers['x-api-key'] = keys.predictFun;
  }
  
  if (config.url?.includes('/polymarket/') && keys.polymarket) {
    config.headers['x-polymarket-key'] = keys.polymarket;
  }
  
  return config;
});
```

### 7.2 后端代理安全

```typescript
// ==================== 代理服务器安全配置 ====================

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

const app = Fastify();

// 1. Helmet 安全头
app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
});

// 2. CORS 配置
app.register(cors, {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'x-polymarket-key'],
});

// 3. 速率限制
app.register(rateLimit, {
  max: 240,           // 匹配Predict.fun限制
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
  errorResponseBuilder: (req, context) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Try again in ${context.after}`,
  }),
});

// 4. API Key 验证中间件
const validateApiKey = async (req, reply) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    reply.status(401).send({ error: 'API key required' });
    return;
  }
  
  // 可选：验证API Key格式
  if (typeof apiKey !== 'string' || apiKey.length < 10) {
    reply.status(401).send({ error: 'Invalid API key format' });
    return;
  }
};

// 5. 请求日志（脱敏）
app.addHook('onRequest', async (req, reply) => {
  const sanitizedHeaders = { ...req.headers };
  delete sanitizedHeaders['x-api-key'];
  delete sanitizedHeaders['x-polymarket-key'];
  
  req.log.info({
    method: req.method,
    url: req.url,
    headers: sanitizedHeaders,
  }, 'Incoming request');
});
```

### 7.3 数据验证

```typescript
// ==================== 数据验证 (Zod) ====================

import { z } from 'zod';

// Predict.fun 市场验证
const PredictMarketSchema = z.object({
  id: z.number(),
  title: z.string(),
  question: z.string(),
  description: z.string(),
  tradingStatus: z.enum(['OPEN', 'CLOSED']),
  status: z.enum(['REGISTERED', 'RESOLVED']),
  conditionId: z.string(),
  categorySlug: z.string().optional(),
  polymarketConditionIds: z.array(z.string()).optional(),
  outcomes: z.array(z.object({
    name: z.enum(['Yes', 'No']),
    indexSet: z.number(),
    onChainId: z.string(),
    status: z.enum(['PENDING', 'WON', 'LOST']),
  })),
});

// 订单簿验证
const OrderbookSchema = z.object({
  marketId: z.number(),
  updateTimestampMs: z.number(),
  asks: z.array(z.tuple([z.number(), z.number()])),
  bids: z.array(z.tuple([z.number(), z.number()])),
  lastOrderSettled: z.object({
    id: z.string(),
    price: z.string(),
    side: z.enum(['Ask', 'Bid']),
    outcome: z.enum(['Yes', 'No']),
  }).nullable(),
});

// 套利机会验证
const ArbitrageOpportunitySchema = z.object({
  id: z.string(),
  conditionId: z.string(),
  direction: z.enum(['predict_to_polymarket', 'polymarket_to_predict']),
  score: z.number().min(0).max(100),
  confidence: z.enum(['high', 'medium', 'low']),
  detectedAt: z.number(),
  expiresAt: z.number(),
});

// 验证函数
export function validateMarket(data: unknown) {
  return PredictMarketSchema.safeParse(data);
}

export function validateOrderbook(data: unknown) {
  return OrderbookSchema.safeParse(data);
}
```

### 7.4 错误处理

```typescript
// ==================== 错误处理 ====================

// 自定义错误类
class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// 错误类型
const ErrorCodes = {
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_API_KEY: 'INVALID_API_KEY',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  NOT_FOUND: 'NOT_FOUND',
} as const;

// 前端错误处理
const handleApiError = (error: unknown) => {
  if (error instanceof ApiError) {
    switch (error.code) {
      case ErrorCodes.RATE_LIMITED:
        // 显示速率限制提示，建议稍后重试
        showToast('请求过于频繁，请稍后再试', 'warning');
        break;
      case ErrorCodes.INVALID_API_KEY:
        // 清除API Key，跳转到设置页面
        ApiKeyManager.setKey('predictFun', null);
        showToast('API Key 无效，请重新配置', 'error');
        navigate('/settings');
        break;
      case ErrorCodes.NETWORK_ERROR:
        showToast('网络连接失败，请检查网络', 'error');
        break;
      default:
        showToast(error.message, 'error');
    }
  } else {
    showToast('发生未知错误', 'error');
    console.error(error);
  }
};

// 后端错误处理
app.setErrorHandler((error, request, reply) => {
  req.log.error(error);
  
  if (error instanceof ApiError) {
    reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
      retryable: error.retryable,
    });
  } else {
    reply.status(500).send({
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
      retryable: true,
    });
  }
});
```

---

## 8. 部署考虑

### 8.1 前端部署

| 平台 | 推荐度 | 说明 |
|------|--------|------|
| **Vercel** | ★★★★★ | 与Git集成，自动部署，全球CDN |
| **Netlify** | ★★★★★ | 类似Vercel，免费额度充足 |
| **Cloudflare Pages** | ★★★★☆ | 边缘网络，性能优秀 |
| **GitHub Pages** | ★★★☆☆ | 免费但功能有限 |

**部署配置**:
```yaml
# vercel.json
{
  "version": 2,
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    }
  ]
}
```

### 8.2 后端部署

| 平台 | 推荐度 | 说明 |
|------|--------|------|
| **Railway** | ★★★★★ | 简单易用，自动扩缩容 |
| **Render** | ★★★★★ | 免费额度充足，支持WebSocket |
| **Fly.io** | ★★★★☆ | 边缘部署，性能优秀 |
| **Heroku** | ★★★☆☆ | 老牌平台，但价格较高 |

**Docker配置**:
```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### 8.3 环境变量

```bash
# ==================== 前端环境变量 (.env) ====================

# API基础URL
VITE_API_BASE_URL=http://localhost:3000/api

# 应用配置
VITE_APP_NAME=Arbitrage Monitor
VITE_APP_VERSION=1.0.0

# 功能开关
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_SENTRY=false

# ==================== 后端环境变量 (.env) ====================

# 服务器配置
PORT=3000
NODE_ENV=production

# CORS配置
FRONTEND_URL=https://your-app.vercel.app

# 日志配置
LOG_LEVEL=info
LOG_FORMAT=json

# 缓存配置
CACHE_TTL=30000
CACHE_MAX_SIZE=100

# 速率限制
RATE_LIMIT_MAX=240
RATE_LIMIT_WINDOW=60000

# 可选：监控
SENTRY_DSN=
```

### 8.4 CI/CD 配置

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm build
      - uses: vercel/action-deploy@v1
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}

  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: your-registry/arbitrage-monitor:latest
      - uses: railway/action-deploy@v1
        with:
          railway-token: ${{ secrets.RAILWAY_TOKEN }}
```

---

## 9. 已知问题与解决方案

### 9.1 已知问题清单

| # | 问题 | 影响 | 解决方案 |
|---|------|------|----------|
| 1 | Predict.fun API CORS限制 | 浏览器无法直接调用 | 搭建Node.js代理服务器 |
| 2 | API Key存储安全 | 前端存储有风险 | localStorage + 代理转发 |
| 3 | 分页限制 (first ≤ 150) | 需要多次请求获取全部数据 | 使用cursor循环获取 |
| 4 | 无单次成交量数据 | 无法精确计算套利规模 | 使用订单簿深度估算 |
| 5 | No价格需计算 | 增加计算复杂度 | 封装计算函数 `1 - yesPrice` |
| 6 | 市场状态判断复杂 | 需要检查多个字段 | 封装 `isTradable()` 函数 |
| 7 | 多元市场识别 | 需要关联多个市场 | 使用 `categorySlug` 字段 |
| 8 | 速率限制 (240 req/min) | 频繁请求会被限制 | 实现请求队列和重试机制 |

### 9.2 解决方案实现

```typescript
// ==================== 问题解决方案 ====================

// 问题3: 分页获取全部数据
async function fetchAllMarkets(): Promise<Market[]> {
  const allMarkets: Market[] = [];
  let cursor: string | undefined;
  const limit = 150;  // 最大限制
  
  do {
    const response = await apiClient.get('/markets', {
      params: {
        first: limit,
        after: cursor,
        status: 'OPEN',
      },
    });
    
    allMarkets.push(...response.data.data);
    cursor = response.data.cursor;
    
    // 避免速率限制
    if (cursor) {
      await sleep(100);
    }
  } while (cursor);
  
  return allMarkets;
}

// 问题5: No价格计算
function calculateNoPrice(yesPrice: number): number {
  return Math.max(0, Math.min(1, 1 - yesPrice));
}

// 问题6: 市场状态判断
function isTradable(market: PredictMarket): boolean {
  return market.status === 'REGISTERED' && market.tradingStatus === 'OPEN';
}

// 问题8: 请求队列和重试
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private minInterval = 250;  // 最小间隔250ms
  
  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await this.executeWithRetry(request);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      if (!this.processing) {
        this.process();
      }
    });
  }
  
  private async process() {
    this.processing = true;
    
    while (this.queue.length > 0) {
      const request = this.queue.shift()!;
      
      // 速率限制
      const now = Date.now();
      const waitTime = Math.max(0, this.minInterval - (now - this.lastRequestTime));
      if (waitTime > 0) {
        await sleep(waitTime);
      }
      
      this.lastRequestTime = Date.now();
      await request();
    }
    
    this.processing = false;
  }
  
  private async executeWithRetry<T>(
    request: () => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await request();
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        
        // 速率限制时等待更久
        const delay = error?.code === 'RATE_LIMITED' ? 5000 : 1000 * (i + 1);
        await sleep(delay);
      }
    }
    throw new Error('Max retries exceeded');
  }
}
```

---

## 10. 附录

### 10.1 项目目录结构

```
arbitrage-monitor/
├── apps/
│   ├── web/                    # 前端应用
│   │   ├── src/
│   │   ├── public/
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── tailwind.config.js
│   └── server/                 # 后端代理
│       ├── src/
│       ├── package.json
│       ├── tsconfig.json
│       └── Dockerfile
├── packages/
│   ├── shared/                 # 共享类型和工具
│   │   ├── src/
│   │   └── package.json
│   └── ui/                     # 共享UI组件
│       ├── src/
│       └── package.json
├── turbo.json                  # Turborepo配置
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

### 10.2 依赖版本建议

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.0",
    "@tanstack/react-query": "^5.0.0",
    "axios": "^1.6.0",
    "zod": "^3.22.0",
    "recharts": "^2.10.0",
    "@tanstack/react-table": "^8.10.0",
    "date-fns": "^2.30.0",
    "lodash-es": "^4.17.21"
  },
  "devDependencies": {
    "typescript": "^5.2.0",
    "vite": "^5.0.0",
    "vitest": "^1.0.0",
    "@testing-library/react": "^14.0.0",
    "tailwindcss": "^3.3.0",
    "eslint": "^8.50.0",
    "prettier": "^3.0.0"
  }
}
```

### 10.3 开发时间估算

| 模块 | 预估时间 | 优先级 |
|------|----------|--------|
| 项目搭建 & 配置 | 4h | P0 |
| 后端代理服务器 | 6h | P0 |
| API客户端封装 | 4h | P0 |
| 市场列表页面 | 8h | P0 |
| 套利监控页面 | 10h | P0 |
| 设置页面 | 4h | P1 |
| 数据可视化 | 6h | P1 |
| 测试 & 优化 | 8h | P1 |
| **总计** | **~50h** | - |

---

*文档版本: 1.0.0*
*最后更新: 2025年*
