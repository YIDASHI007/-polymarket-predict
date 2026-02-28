# AI提示词：跨市场套利监控系统开发指南

## 🎯 任务目标

开发一个完整的 **Predict.fun × Polymarket 跨市场套利监控系统**，包含前端界面、后端API代理、实时数据获取、套利机会识别和通知功能。

---

## 📁 项目文件结构

```
arbitrage-monitor/
├── frontend/                          # React前端 (已提供)
│   ├── src/
│   │   ├── types/index.ts            # 核心类型定义 ⭐
│   │   ├── data/mockData.ts          # 模拟数据 ⭐
│   │   ├── stores/marketStore.ts     # 市场状态管理 ⭐
│   │   ├── stores/settingsStore.ts   # 设置状态管理 ⭐
│   │   ├── utils/formatters.ts       # 格式化工具 ⭐
│   │   ├── components/
│   │   │   ├── layout/Sidebar.tsx    # 侧边栏
│   │   │   ├── layout/Header.tsx     # 顶部栏
│   │   │   ├── markets/MarketList.tsx # 市场列表
│   │   │   ├── arbitrage/ArbitrageList.tsx # 套利列表
│   │   │   └── settings/SettingsPanel.tsx  # 设置面板
│   │   ├── App.tsx                   # 主应用
│   │   └── App.css                   # 全局样式
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                           # Node.js后端 (需要开发)
│   ├── src/
│   │   ├── index.ts                  # 入口文件
│   │   ├── routes/
│   │   │   ├── predict.ts            # Predict.fun API代理
│   │   │   ├── polymarket.ts         # Polymarket API代理
│   │   │   └── arbitrage.ts          # 套利计算API
│   │   ├── services/
│   │   │   ├── predictService.ts     # Predict.fun服务
│   │   │   ├── polymarketService.ts  # Polymarket服务
│   │   │   └── arbitrageService.ts   # 套利计算服务
│   │   ├── utils/
│   │   │   ├── apiClient.ts          # API客户端
│   │   │   └── cache.ts              # 缓存工具
│   │   └── types/
│   │       └── index.ts              # 后端类型
│   └── package.json
│
└── README.md
```

**⭐ 标记文件已在前端代码包中提供，可直接使用**

---

## 🔧 核心技术栈

### 前端
- React 18 + TypeScript 5.2
- Vite 5.0 (构建工具)
- Zustand (状态管理，含persist中间件)
- Tailwind CSS + shadcn/ui
- Axios (HTTP请求)

### 后端
- Node.js 20 + TypeScript
- Fastify (Web框架，比Express更快)
- Axios (API请求)
- node-cache (内存缓存)
- cors (跨域支持)

---

## 📊 数据模型详解

### 1. UnifiedMarket (统一市场模型)

```typescript
interface UnifiedMarket {
  id: string;                    // 组合ID: "predict-{sourceId}" 或 "poly-{sourceId}"
  source: 'predict' | 'polymarket';
  sourceId: string;              // 原始平台ID
  conditionId: string;           // 用于跨平台匹配同一事件
  categorySlug?: string;         // 多元市场组标识 (如 "crypto", "politics")
  title: string;                 // 市场标题
  description: string;           // 市场描述
  isActive: boolean;             // 是否活跃
  isTradable: boolean;           // 是否可交易
  yesPrice: number;              // Yes当前价格 (0-1)
  noPrice: number;               // No当前价格 (计算: 1 - yesPrice)
  yesPriceChange24h: number;     // Yes价格24h变化
  noPriceChange24h: number;      // No价格24h变化
  volume24h: number;             // 24h交易量 (USD)
  volumeTotal: number;           // 总交易量 (USD)
  liquidity: number;             // 流动性深度 (USD)
  lastUpdated: number;           // 最后更新时间戳
  feeRate: number;               // 手续费率 (如 0.002 = 0.2%)
  endDate?: string;              // 结算日期 ISO格式
}
```

### 2. ArbitrageOpportunity (套利机会)

```typescript
interface ArbitrageOpportunity {
  id: string;                    // 唯一ID
  conditionId: string;           // 关联的市场conditionId
  categorySlug?: string;         // 类别
  title: string;                 // 市场标题
  predictMarket: UnifiedMarket;  // Predict.fun市场数据
  polymarketMarket: UnifiedMarket; // Polymarket市场数据
  direction: 'predict_to_polymarket' | 'polymarket_to_predict';
  tokenType: 'Yes' | 'No';       // 套利代币类型
  buyPlatform: 'predict' | 'polymarket';
  buyPrice: number;              // 买入价格
  sellPlatform: 'predict' | 'polymarket';
  sellPrice: number;             // 卖出价格
  priceDiff: number;             // 价格差
  priceDiffPercent: number;      // 价格差百分比
  roi: number;                   // 投资回报率 (扣除手续费后)
  netProfit: number;             // 净利润
  confidence: 'high' | 'medium' | 'low'; // 置信度
  recommendedAmount: number;     // 建议投入金额
  detectedAt: number;            // 发现时间戳
  expiresAt?: number;            // 过期时间戳
}
```

### 3. UserSettings (用户设置)

```typescript
interface UserSettings {
  apiKeys: {
    predictFun: string | null;
    polymarket: string | null;
  };
  monitoring: {
    enabled: boolean;
    refreshInterval: number;       // 秒
    autoRefresh: boolean;
  };
  filters: {
    minProfitPercent: number;      // 最小收益率 %
    maxProfitPercent: number;      // 最大收益率 %
    minConfidence: 'high' | 'medium' | 'low';
    minLiquidity: number;          // 最小流动性 USD
    minVolume24h: number;          // 最小24h交易量 USD
  };
  notifications: {
    enabled: boolean;
    minProfitForAlert: number;     // 触发通知的最小利润 %
    soundEnabled: boolean;
    browserNotification: boolean;
  };
  display: {
    theme: 'light' | 'dark' | 'system';
    compactMode: boolean;
    defaultSortBy: 'profit' | 'confidence' | 'time';
    itemsPerPage: number;
  };
}
```

---

## 🔌 API集成规范

### Predict.fun API

**基础URL**: `https://api.predict.fun/v1`

#### 1. 获取市场列表
```
GET /markets
Headers:
  x-api-key: {YOUR_API_KEY}

Query Parameters:
  first: number (最大150)
  after: string (cursor分页)
  category: string (可选)

Response:
{
  "data": [
    {
      "id": "market-id",
      "conditionId": "cond-id",
      "categorySlug": "crypto",
      "title": "Bitcoin > $100K?",
      "description": "...",
      "status": "REGISTERED",      // REGISTERED | RESOLVED | CANCELLED
      "tradingStatus": "OPEN",     // OPEN | CLOSED
      "yesPrice": 0.65,
      "noPrice": 0.35,
      "volume24h": 1250000,
      "liquidity": 450000,
      "endDate": "2026-03-31T23:59:59Z"
    }
  ],
  "cursor": "next-page-cursor",
  "hasMore": true
}
```

#### 2. 获取订单簿
```
GET /markets/{marketId}/orderbook
Headers:
  x-api-key: {YOUR_API_KEY}

Response:
{
  "bids": [[0.64, 1000], [0.63, 2000]],  // [价格, 数量]
  "asks": [[0.66, 1500], [0.67, 3000]],
  "lastPrice": 0.65,
  "timestamp": 1699999999
}
```

**重要**: No价格需要通过 `1 - Yes卖价` 计算

#### 3. 搜索市场
```
GET /search?q={query}
Headers:
  x-api-key: {YOUR_API_KEY}
```

### Polymarket API

**基础URL**: `https://gamma-api.polymarket.com`

#### 1. 获取市场列表
```
GET /markets
Query Parameters:
  limit: number (最大100)
  offset: number
  active: boolean
  closed: boolean

Response:
{
  "markets": [
    {
      "id": "0x...",
      "conditionId": "cond-id",
      "slug": "bitcoin-price-100k",
      "question": "Bitcoin > $100K?",
      "description": "...",
      "active": true,
      "closed": false,
      "outcomes": [
        {
          "name": "Yes",
          "price": 0.58,
          "bestBid": 0.57,
          "bestAsk": 0.59
        },
        {
          "name": "No",
          "price": 0.42,
          "bestBid": 0.41,
          "bestAsk": 0.43
        }
      ],
      "volume": 15000000,
      "liquidity": 780000,
      "endDate": "2026-03-31T23:59:59Z"
    }
  ]
}
```

#### 2. 获取订单簿 (CLOB API)
```
GET https://clob.polymarket.com/book
Query Parameters:
  tokenId: string
  side: "BUY" | "SELL"

Response:
{
  "bids": [[0.57, 1000], [0.56, 2000]],
  "asks": [[0.59, 1500], [0.60, 3000]],
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

## 🧮 套利算法逻辑

### 1. 套利机会识别

```typescript
function findArbitrageOpportunities(
  predictMarkets: UnifiedMarket[],
  polymarketMarkets: UnifiedMarket[],
  settings: UserSettings
): ArbitrageOpportunity[] {
  const opportunities: ArbitrageOpportunity[] = [];
  
  // 按 conditionId 分组匹配市场
  const marketMap = new Map<string, { predict?: UnifiedMarket; polymarket?: UnifiedMarket }>();
  
  predictMarkets.forEach(m => {
    if (!marketMap.has(m.conditionId)) marketMap.set(m.conditionId, {});
    marketMap.get(m.conditionId)!.predict = m;
  });
  
  polymarketMarkets.forEach(m => {
    if (!marketMap.has(m.conditionId)) marketMap.set(m.conditionId, {});
    marketMap.get(m.conditionId)!.polymarket = m;
  });
  
  // 遍历匹配的市场对
  marketMap.forEach(({ predict, polymarket }, conditionId) => {
    if (!predict || !polymarket) return;
    if (!predict.isTradable || !polymarket.isTradable) return;
    
    // 检查Yes代币套利
    const yesOpportunity = calculateArbitrage(
      predict, polymarket, 'Yes', settings
    );
    if (yesOpportunity) opportunities.push(yesOpportunity);
    
    // 检查No代币套利
    const noOpportunity = calculateArbitrage(
      predict, polymarket, 'No', settings
    );
    if (noOpportunity) opportunities.push(noOpportunity);
  });
  
  return opportunities.sort((a, b) => b.roi - a.roi);
}
```

### 2. 套利计算

```typescript
function calculateArbitrage(
  predictMarket: UnifiedMarket,
  polymarketMarket: UnifiedMarket,
  tokenType: 'Yes' | 'No',
  settings: UserSettings
): ArbitrageOpportunity | null {
  
  const predictPrice = tokenType === 'Yes' ? predictMarket.yesPrice : predictMarket.noPrice;
  const polymarketPrice = tokenType === 'Yes' ? polymarketMarket.yesPrice : polymarketMarket.noPrice;
  
  // 确定买入和卖出平台
  let buyPlatform: 'predict' | 'polymarket';
  let buyPrice: number;
  let sellPlatform: 'predict' | 'polymarket';
  let sellPrice: number;
  
  if (predictPrice < polymarketPrice) {
    buyPlatform = 'predict';
    buyPrice = predictPrice;
    sellPlatform = 'polymarket';
    sellPrice = polymarketPrice;
  } else {
    buyPlatform = 'polymarket';
    buyPrice = polymarketPrice;
    sellPlatform = 'predict';
    sellPrice = predictPrice;
  }
  
  // 计算价差
  const priceDiff = sellPrice - buyPrice;
  const priceDiffPercent = priceDiff / buyPrice;
  
  // 计算手续费
  const totalFee = predictMarket.feeRate + polymarketMarket.feeRate;
  
  // 计算ROI (扣除手续费)
  const grossRoi = priceDiffPercent;
  const roi = grossRoi - totalFee;
  const netProfit = priceDiff * (1 - totalFee);
  
  // 检查是否满足最小收益率
  if (roi < settings.filters.minProfitPercent / 100) return null;
  if (roi > settings.filters.maxProfitPercent / 100) return null;
  
  // 检查流动性
  const minLiquidity = Math.min(predictMarket.liquidity, polymarketMarket.liquidity);
  if (minLiquidity < settings.filters.minLiquidity) return null;
  
  // 检查交易量
  const minVolume = Math.min(predictMarket.volume24h, polymarketMarket.volume24h);
  if (minVolume < settings.filters.minVolume24h) return null;
  
  // 计算置信度
  const confidence = calculateConfidence(roi, minLiquidity, minVolume);
  if (confidence < settings.filters.minConfidence) return null;
  
  // 计算建议投入金额
  const recommendedAmount = Math.min(
    minLiquidity * 0.1,  // 不超过流动性的10%
    10000                 // 最大$10,000
  );
  
  return {
    id: `arb-${conditionId}-${tokenType}`,
    conditionId,
    categorySlug: predictMarket.categorySlug,
    title: predictMarket.title,
    predictMarket,
    polymarketMarket,
    direction: buyPlatform === 'predict' ? 'predict_to_polymarket' : 'polymarket_to_predict',
    tokenType,
    buyPlatform,
    buyPrice,
    sellPlatform,
    sellPrice,
    priceDiff,
    priceDiffPercent,
    roi,
    netProfit,
    confidence,
    recommendedAmount,
    detectedAt: Date.now(),
  };
}
```

### 3. 置信度计算

```typescript
function calculateConfidence(
  roi: number,
  liquidity: number,
  volume24h: number
): 'high' | 'medium' | 'low' {
  let score = 0;
  
  // ROI评分
  if (roi >= 0.10) score += 3;
  else if (roi >= 0.05) score += 2;
  else score += 1;
  
  // 流动性评分
  if (liquidity >= 500000) score += 3;
  else if (liquidity >= 100000) score += 2;
  else score += 1;
  
  // 交易量评分
  if (volume24h >= 1000000) score += 3;
  else if (volume24h >= 100000) score += 2;
  else score += 1;
  
  if (score >= 7) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}
```

---

## 🖥️ 前端组件说明

### 1. 状态管理使用

```typescript
// 市场数据
const { 
  markets,                    // 所有市场
  arbitrageOpportunities,     // 套利机会
  stats,                      // 统计数据
  isLoadingMarkets,           // 加载状态
  searchQuery,                // 搜索词
  selectedPlatform,           // 平台筛选
  sortBy, sortOrder,          // 排序
  fetchMarkets,               // 获取市场
  refreshAll,                 // 刷新所有
  setSearchQuery,             // 设置搜索
  getFilteredMarkets,         // 获取筛选后的市场
} = useMarketStore();

// 用户设置
const {
  settings,                   // 所有设置
  isSettingsOpen,             // 设置面板开关
  updateApiKey,               // 更新API Key
  updateFilters,              // 更新筛选
  setSettingsOpen,            // 开关设置面板
} = useSettingsStore();
```

### 2. 组件调用示例

```tsx
// App.tsx 中使用
function App() {
  const [activeTab, setActiveTab] = useState('markets');
  
  const renderContent = () => {
    switch (activeTab) {
      case 'markets': return <MarketList />;
      case 'arbitrage': return <ArbitrageList />;
      default: return <MarketList />;
    }
  };
  
  return (
    <div className="flex h-screen">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main>{renderContent()}</main>
      <SettingsPanel />
    </div>
  );
}
```

### 3. 格式化函数使用

```typescript
import { 
  formatPrice, 
  formatPercent, 
  formatVolume,
  formatRelativeTime,
  getArbitrageLevel,
  getArbitrageLevelStyles,
} from '@/utils/formatters';

// 使用示例
formatPrice(0.65);              // "$0.65"
formatPercent(0.1207);          // "+12.07%"
formatVolume(1250000);          // "$1.2M"
formatRelativeTime(Date.now()); // "刚刚"
getArbitrageLevel(0.12);        // "high"
```

---

## 🔧 后端开发规范

### 1. 项目初始化

```bash
mkdir backend && cd backend
npm init -y
npm install fastify @fastify/cors axios node-cache dotenv
npm install -D typescript @types/node ts-node nodemon
npx tsc --init
```

### 2. 目录结构

```
backend/
├── src/
│   ├── index.ts              # 入口
│   ├── routes/
│   │   ├── predict.ts        # Predict.fun路由
│   │   ├── polymarket.ts     # Polymarket路由
│   │   └── arbitrage.ts      # 套利路由
│   ├── services/
│   │   ├── predictService.ts
│   │   ├── polymarketService.ts
│   │   └── arbitrageService.ts
│   ├── utils/
│   │   ├── apiClient.ts
│   │   └── cache.ts
│   └── types/
│       └── index.ts
├── package.json
└── tsconfig.json
```

### 3. 核心服务实现

```typescript
// src/services/predictService.ts
import axios from 'axios';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 30 }); // 30秒缓存

const PREDICT_API_BASE = 'https://api.predict.fun/v1';

export class PredictService {
  async getMarkets(apiKey: string, cursor?: string) {
    const cacheKey = `markets-${cursor || 'first'}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    
    const response = await axios.get(`${PREDICT_API_BASE}/markets`, {
      headers: { 'x-api-key': apiKey },
      params: { first: 150, after: cursor },
    });
    
    cache.set(cacheKey, response.data);
    return response.data;
  }
  
  async getAllMarkets(apiKey: string, maxPages = 20) {
    const allMarkets = [];
    let cursor: string | undefined;
    let pageCount = 0;
    
    do {
      const data = await this.getMarkets(apiKey, cursor);
      allMarkets.push(...data.data);
      cursor = data.cursor;
      pageCount++;
      
      if (cursor) await new Promise(r => setTimeout(r, 100)); // 避免速率限制
    } while (cursor && pageCount < maxPages);
    
    return allMarkets;
  }
  
  async getOrderbook(apiKey: string, marketId: string) {
    const response = await axios.get(
      `${PREDICT_API_BASE}/markets/${marketId}/orderbook`,
      { headers: { 'x-api-key': apiKey } }
    );
    return response.data;
  }
}

export const predictService = new PredictService();
```

### 4. API路由实现

```typescript
// src/routes/predict.ts
import { FastifyInstance } from 'fastify';
import { predictService } from '../services/predictService';

export async function predictRoutes(fastify: FastifyInstance) {
  // 获取市场列表 (支持分页)
  fastify.get('/markets', async (request, reply) => {
    const { apiKey } = request.headers as { apiKey: string };
    const { cursor } = request.query as { cursor?: string };
    
    if (!apiKey) {
      return reply.status(401).send({ error: 'API Key required' });
    }
    
    try {
      const data = await predictService.getMarkets(apiKey, cursor);
      return data;
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch markets' });
    }
  });
  
  // 获取所有市场 (循环分页)
  fastify.get('/markets/all', async (request, reply) => {
    const { apiKey } = request.headers as { apiKey: string };
    
    if (!apiKey) {
      return reply.status(401).send({ error: 'API Key required' });
    }
    
    try {
      const markets = await predictService.getAllMarkets(apiKey);
      return { data: markets, count: markets.length };
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch markets' });
    }
  });
  
  // 获取订单簿
  fastify.get('/markets/:id/orderbook', async (request, reply) => {
    const { apiKey } = request.headers as { apiKey: string };
    const { id } = request.params as { id: string };
    
    if (!apiKey) {
      return reply.status(401).send({ error: 'API Key required' });
    }
    
    try {
      const data = await predictService.getOrderbook(apiKey, id);
      return data;
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch orderbook' });
    }
  });
}
```

### 5. 套利计算路由

```typescript
// src/routes/arbitrage.ts
import { FastifyInstance } from 'fastify';
import { predictService } from '../services/predictService';
import { polymarketService } from '../services/polymarketService';
import { arbitrageService } from '../services/arbitrageService';

export async function arbitrageRoutes(fastify: FastifyInstance) {
  // 获取套利机会
  fastify.get('/opportunities', async (request, reply) => {
    const { 
      predictApiKey, 
      polymarketApiKey,
      minProfit,
      minConfidence 
    } = request.query as any;
    
    try {
      // 并行获取两个平台的市场
      const [predictMarkets, polymarketMarkets] = await Promise.all([
        predictService.getAllMarkets(predictApiKey),
        polymarketService.getAllMarkets(polymarketApiKey),
      ]);
      
      // 计算套利机会
      const opportunities = arbitrageService.findOpportunities(
        predictMarkets,
        polymarketMarkets,
        {
          minProfitPercent: parseFloat(minProfit) || 1.5,
          minConfidence: minConfidence || 'medium',
        }
      );
      
      return {
        data: opportunities,
        count: opportunities.length,
        timestamp: Date.now(),
      };
    } catch (error) {
      return reply.status(500).send({ 
        error: 'Failed to calculate arbitrage',
        message: error.message 
      });
    }
  });
}
```

### 6. 入口文件

```typescript
// src/index.ts
import fastify from 'fastify';
import cors from '@fastify/cors';
import { predictRoutes } from './routes/predict';
import { polymarketRoutes } from './routes/polymarket';
import { arbitrageRoutes } from './routes/arbitrage';

const app = fastify({ logger: true });

// 注册CORS
app.register(cors, {
  origin: true,
  credentials: true,
});

// 注册路由
app.register(predictRoutes, { prefix: '/api/predict' });
app.register(polymarketRoutes, { prefix: '/api/polymarket' });
app.register(arbitrageRoutes, { prefix: '/api/arbitrage' });

// 健康检查
app.get('/health', async () => ({ status: 'ok' }));

// 启动服务器
const start = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server running on http://localhost:3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
```

---

## 🔄 数据流说明

```
┌─────────────────────────────────────────────────────────────────┐
│                          前端 (React)                            │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ MarketList  │    │ArbitrageList│    │SettingsPanel│         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            │                                    │
│                    ┌───────┴───────┐                           │
│                    │  Zustand Store │                           │
│                    │  (marketStore) │                           │
│                    └───────┬───────┘                           │
└────────────────────────────┼────────────────────────────────────┘
                             │ HTTP/REST
┌────────────────────────────┼────────────────────────────────────┐
│                      后端 (Node.js)                              │
│                    ┌───────┴───────┐                            │
│                    │   Fastify     │                            │
│                    │   代理服务器   │                            │
│                    └───────┬───────┘                            │
│         ┌──────────────────┼──────────────────┐                 │
│         │                  │                  │                 │
│  ┌──────┴──────┐   ┌──────┴──────┐   ┌──────┴──────┐          │
│  │/api/predict │   │/api/polymarket│   │/api/arbitrage │          │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘          │
└─────────┼─────────────────┼─────────────────┼───────────────────┘
          │                 │                 │
          ▼                 ▼                 │
┌─────────────────┐ ┌─────────────────┐      │
│ Predict.fun API │ │ Polymarket API  │      │
│  (需要API Key)   │ │  (需要API Key)   │      │
└─────────────────┘ └─────────────────┘      │
                                              │
                                    ┌─────────┴─────────┐
                                    │  套利计算服务      │
                                    │  (arbitrageService)│
                                    └───────────────────┘
```

---

## 📋 开发任务清单

### 第一阶段：基础架构
- [x] 前端项目搭建 (已提供)
- [ ] 后端项目搭建
- [ ] API代理服务实现
- [ ] 数据缓存机制

### 第二阶段：数据获取
- [ ] Predict.fun API集成
- [ ] Polymarket API集成
- [ ] 分页获取全部市场
- [ ] 订单簿数据获取

### 第三阶段：套利计算
- [ ] 市场匹配算法
- [ ] 套利机会识别
- [ ] 置信度计算
- [ ] 实时更新机制

### 第四阶段：前端完善
- [ ] 连接真实API
- [ ] 价格走势图
- [ ] 通知系统
- [ ] 用户认证

### 第五阶段：部署
- [ ] 前端部署 (Vercel/Netlify)
- [ ] 后端部署 (Railway/Render)
- [ ] 环境变量配置
- [ ] 监控和日志

---

## 🚨 重要注意事项

### 1. API限制
- **Predict.fun**: 240 req/min, `first` 最大150
- **Polymarket**: 100 req/min, `limit` 最大100
- 必须实现请求队列和重试机制

### 2. CORS问题
- 浏览器无法直接调用API
- 必须通过后端代理服务器
- API Key通过请求头传递

### 3. No价格计算
```typescript
// 正确方式
noPrice = 1 - yesAskPrice;

// 错误方式 (不要直接使用API返回的noPrice)
// noPrice = apiResponse.noPrice; // 可能不准确
```

### 4. 市场状态判断
```typescript
// 交易中
const isTrading = market.status === 'REGISTERED' && market.tradingStatus === 'OPEN';

// 已结算
const isResolved = market.status === 'RESOLVED';
```

### 5. 多元市场识别
```typescript
// 通过 categorySlug 识别同一组市场
const relatedMarkets = allMarkets.filter(m => m.categorySlug === targetCategory);
```

---

## 📚 参考资源

- [Predict.fun API文档](https://api.predict.fun/docs)
- [Polymarket API文档](https://docs.polymarket.com/)
- [Fastify文档](https://www.fastify.io/docs/)
- [Zustand文档](https://docs.pmnd.rs/zustand)

---

## 💡 开发提示

1. **先完成后端API代理**，确保前端能获取真实数据
2. **使用缓存减少API调用**，避免触发速率限制
3. **实现错误重试机制**，提高系统稳定性
4. **添加详细的日志**，便于调试和监控
5. **使用TypeScript严格模式**，减少运行时错误

---

**请按照以上指南完成开发，如有疑问请随时询问！**
