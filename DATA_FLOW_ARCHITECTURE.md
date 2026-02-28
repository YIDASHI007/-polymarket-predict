# 跨市场套利监控系统 - 数据获取与缓存架构文档

> 本文档记录系统中所有数据获取方式、缓存策略和更新频率
> 最后更新：2026-02-25

---

## 一、整体架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              外部数据源                                       │
│  ┌──────────────┐  ┌──────────────┐                                         │
│  │  Polymarket  │  │ Predict.fun  │                                         │
│  │   API        │  │   API        │                                         │
│  └──────┬───────┘  └──────┬───────┘                                         │
└─────────┼────────────────┼───────────────────────────────────────────────────┘
          │                │
          ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              后端服务 (Node.js)                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     数据获取层 (Service)                             │   │
│  │  ┌─────────────────────┐  ┌─────────────────────┐                  │   │
│  │  │ PolymarketService   │  │  PredictService     │                  │   │
│  │  │ - fetchFromAPI()    │  │  - fetchFromAPI()   │                  │   │
│  │  │ - 每10分钟更新       │  │  - 每10分钟更新      │                  │   │
│  │  └──────────┬──────────┘  └──────────┬──────────┘                  │   │
│  └─────────────┼──────────────────────┼────────────────────────────────┘   │
│                │                      │                                     │
│                ▼                      ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     缓存层 (Cache)                                   │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  内存缓存 (NodeCache)                                        │   │   │
│  │  │  - polymarket-active-markets-v2                             │   │   │
│  │  │  - predict-all-markets-v4                                   │   │   │
│  │  │  - predict-categories                                       │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                              │                                      │   │
│  │                              ▼                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  文件缓存 (cache.json) - 永久存储                             │   │   │
│  │  │  - 自动每60秒保存一次                                         │   │   │
│  │  │  - 启动时自动加载                                             │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                │                                                            │
│                ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     API层 (Routes)                                   │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │   │
│  │  │ GET /markets/    │  │ POST /markets/   │  │ 定时任务         │  │   │
│  │  │    cached        │  │    refresh       │  │ (每10分钟)       │  │   │
│  │  │ - 只读缓存       │  │ - 强制刷新       │  │ - 自动更新       │  │   │
│  │  │ - 秒级响应       │  │ - 1-2分钟        │  │ - 需API Key      │  │   │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
          │
          │ HTTP Request
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              前端应用 (React)                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     状态管理 (Zustand Store)                         │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  marketCacheStore.ts (主缓存)                                │   │   │
│  │  │  - 使用 localStorage: markets_cache_v3                       │   │   │
│  │  │  - 每10分钟05秒同步后端                                      │   │   │
│  │  │  - 压缩数据存储                                              │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  cachedMarketStore.ts (备用缓存)                             │   │   │
│  │  │  - 使用 localStorage: markets_cache_v2                       │   │   │
│  │  │  - 兼容旧版本                                               │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  marketStore.ts (实时数据)                                   │   │   │
│  │  │  - 使用 localStorage: arbitrage_monitor_markets_v5         │   │   │
│  │  │  - 直接API获取                                              │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、详细数据获取方式

### 2.1 后端数据源

#### 2.1.1 Polymarket 数据获取

| 配置项 | 值 |
|--------|-----|
| **API端点** | `https://gamma-api.polymarket.com/markets` |
| **获取方式** | 分页获取，每页100条 |
| **请求参数** | `active=true`, `closed=false`, `archived=false`, `liquidity_min=1000` |
| **更新频率** | 每10分钟（定时任务） |
| **触发方式** | 1. 定时自动更新<br>2. 手动刷新按钮<br>3. 首次启动（缓存为空时） |
| **数据过滤** | 1. 结束日期必须在未来7天以上<br>2. 流动性 ≥ $1,000<br>3. 按交易量排序，取前2000个 |
| **缓存Key** | `polymarket-active-markets-v2` |

**代码位置**: `backend/src/services/polymarketService.ts`

```typescript
// 核心方法
getAllMarketsFromCache()    // 只读缓存，永不调用API
fetchFromAPI()              // 从API获取并更新缓存（1-2分钟）
```

#### 2.1.2 Predict.fun 数据获取

| 配置项 | 值 |
|--------|-----|
| **API端点** | `https://api.predict.fun/v1/markets`<br>`https://api.predict.fun/v1/categories`<br>`https://api.predict.fun/v1/markets/{id}/stats` |
| **获取方式** | 1. 分页获取市场列表（每页150条）<br>2. 批采获取所有市场 stats（volume/liquidity） |
| **请求参数** | `status=OPEN`, `tradingStatus=OPEN` |
| **更新频率** | 每10分钟（定时任务） |
| **触发方式** | 1. 定时自动更新<br>2. 手动刷新按钮<br>3. 首次启动（缓存为空时） |
| **附加数据** | 同时获取 `/categories` 构建父事件映射 |
| **缓存Key** | `predict-all-markets-v4`<br>`predict-categories`<br>`predict-stats-{id}` |
| **并发控制** | 3并发 + 250ms延迟（避免触发240 req/min限制） |
| **Stats获取** | 所有市场（~479个），耗时约2-3分钟 |

**代码位置**: `backend/src/services/predictService.ts`

```typescript
// 核心方法
getAllMarketsFromCache()    // 只读缓存，永不调用API
fetchFromAPI()              // 从API获取并更新缓存（含所有市场stats）
batchGetMarketStats()       // 批量获取市场统计数据
getCategories()             // 获取分类和父事件映射
```

**Stats 获取流程**:
```
1. 获取所有市场列表 (~479个)
   │
2. 对每个市场调用 /markets/{id}/stats
   ├── 并发控制: 3个并行
   ├── 批次间延迟: 250ms
   └── 预计耗时: ~2-3分钟
   │
3. 将 stats 合并到市场对象 (volume, volume24h, liquidity)
   │
4. 保存到缓存
```

### 2.2 后端缓存策略

#### 2.2.1 多层缓存架构

| 缓存层级 | 存储位置 | 持久化 | TTL | 用途 |
|----------|----------|--------|-----|------|
| **内存缓存** | NodeCache | 否 | 10分钟 | 快速读取，进程内共享 |
| **文件缓存** | cache.json | 是 | 永久 | 进程重启后恢复 |
| **API响应缓存** | 内存 | 否 | 无 | 统一格式转换后缓存 |

#### 2.2.2 缓存文件详情

```
backend/data/cache.json
├── polymarket-active-markets-v2  (Polymarket市场数据)
├── predict-all-markets-v4        (Predict市场数据)
├── predict-categories            (Predict分类数据)
└── ...其他缓存数据
```

**保存频率**: 每60秒自动保存（如果数据有变化）

**加载时机**: 服务启动时自动从文件加载到内存

#### 2.2.3 缓存更新流程

```
1. 定时任务触发 (每10分钟)
   │
   ├── 调用 predictService.fetchFromAPI()
   │   ├── 请求 Predict API (/markets, /categories)
   │   ├── 数据处理 + 版本号+1
   │   └── 更新内存缓存 + 标记脏数据
   │
   └── 调用 polymarketService.fetchFromAPI()
       ├── 请求 Polymarket API (/markets)
       ├── 数据过滤 (流动性>1000, 时间>7天, 前2000个)
       └── 更新内存缓存 + 标记脏数据
   │
2. 自动保存 (每60秒)
   └── 如果数据标记为脏 → 写入 cache.json
```

### 2.3 后端API接口

#### 2.3.1 只读缓存接口

| 接口 | 说明 |
|------|------|
| `GET /api/markets/cached?source={all\|predict\|polymarket}&search={keyword}` | 只读缓存，秒级响应 |

**逻辑**:
1. 根据 `source` 参数决定返回哪些平台的数据
2. 只从缓存读取（内存 → 文件），永不调用外部API
3. 可选搜索过滤（title, description, parentTitle）
4. 返回统一格式的 `UnifiedMarket[]`

**代码位置**: `backend/src/routes/markets-cached-v2.ts`

#### 2.3.2 手动刷新接口

| 接口 | 说明 |
|------|------|
| `POST /api/markets/refresh` | 强制从API获取最新数据（需API Key） |

**逻辑**:
1. 需要 `x-api-key` Header
2. 并发调用 Predict 和 Polymarket 的 `fetchFromAPI()`
3. 返回获取的市场数量统计
4. 更新后数据自动写入缓存

#### 2.3.3 定时任务

| 配置 | 值 |
|------|-----|
| **触发频率** | 每10分钟（10 * 60 * 1000 ms） |
| **触发时间** | 00:00, 00:10, 00:20... |
| **条件** | 需要配置 `PREDICT_FUN_API_KEY` 环境变量 |
| **行为** | 自动调用两个平台的 `fetchFromAPI()` |

**代码位置**: `backend/src/routes/markets-cached-v2.ts` (setInterval)

---

## 三、前端数据获取方式

### 3.1 数据来源

| 来源 | 优先级 | 说明 |
|------|--------|------|
| **localStorage** | 1（最高） | 页面加载时优先读取，实现"秒开" |
| **后端缓存接口** | 2 | 每10分钟同步一次 |
| **后端实时API** | 3 | 手动刷新时调用 |

### 3.2 前端缓存策略

| Store文件 | localStorage Key | 用途 | 状态 |
|-----------|------------------|------|------|
| `marketCacheStore.ts` | `markets_cache_v3` | 主缓存（推荐） | ✅ 活跃 |

#### 3.2.2 主缓存 (marketCacheStore)

| 配置项 | 值 |
|--------|-----|
| **localStorage Key** | `markets_cache_v3` |
| **时间戳 Key** | `markets_cache_time_v3` |
| **同步频率** | 每10分钟 |
| **错峰偏移** | 5分钟（后端00分更新，前端05分同步） |
| **数据压缩** | 是（截取description前200字符） |
| **大小限制** | >4MB时只保存前5000条 |

**更新流程**:
```
1. 页面初始化
   ├── 从 localStorage 加载缓存（秒开）
   └── 检查同步时间
       ├── 超过10分钟 → 立即同步
       └── 未超过 → 按计划时间同步
   
2. 定时同步 (每10分钟05秒)
   └── 调用 GET /api/markets/cached
       ├── 保存到 localStorage
       └── 更新UI
```

**代码位置**: `app/src/stores/marketCacheStore.ts`

#### 3.2.3 数据压缩逻辑

```typescript
// 保存到 localStorage 前压缩
const compressMarket = (m: UnifiedMarket): any => ({
  id: m.id,
  source: m.source,
  sourceId: m.sourceId,
  conditionId: m.conditionId,
  categorySlug: m.categorySlug,
  parentTitle: m.parentTitle,
  title: m.title,
  description: m.description?.slice(0, 200),  // ← 截断长描述
  url: m.url,
  isActive: m.isActive,
  isTradable: m.isTradable,
  yesPrice: m.yesPrice,
  noPrice: m.noPrice,
  volume24h: m.volume24h,
  volumeTotal: m.volumeTotal,
  liquidity: m.liquidity,
  endDate: m.endDate,
});
```

### 3.3 前端搜索逻辑

**搜索字段**（已修复，包含parentTitle）:
```typescript
filtered = filtered.filter(m => 
  m.title.toLowerCase().includes(q) ||
  m.description?.toLowerCase().includes(q) ||
  m.parentTitle?.toLowerCase().includes(q)  // ← 支持父事件搜索
);
```

**应用位置**:
- `marketCacheStore.ts` - 主缓存搜索
- `cachedMarketStore.ts` - 备用缓存搜索  
- `marketStore.ts` - 实时数据搜索

---

## 四、数据流时序图

### 4.1 首次访问流程

```
用户访问页面
    │
    ▼
┌─────────────────┐
│  读取localStorage │ ← 加载 markets_cache_v3
│  (秒开体验)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 检查上次同步时间 │
└────────┬────────┘
         │
         ├── 超过10分钟 ──► 立即向后端同步
         │
         └── 未超过 ─────► 按计划时间同步
         │
         ▼
┌─────────────────┐
│ 设置定时器      │ ← 每10分钟05秒同步
│ (10分钟周期)   │
└─────────────────┘
```

### 4.2 后端定时更新流程

```
定时触发 (每10分钟00秒)
    │
    ├── 检查环境变量 PREDICT_FUN_API_KEY
    │       └── 不存在 → 跳过本次更新
    │
    └── 存在 → 开始更新
            │
            ├── 调用 PredictService.fetchFromAPI()
            │   ├── 请求 /categories (父事件映射)
            │   ├── 分页请求 /markets (每页150条)
            │   └── 保存到内存缓存
            │
            ├── 调用 PolymarketService.fetchFromAPI()
            │   ├── 分页请求 /markets (每页100条)
            │   ├── 数据过滤 (流动性>1000, 时间>7天)
            │   ├── 取交易量前2000个
            │   └── 保存到内存缓存
            │
            └── 标记数据为脏
                    │
                    ▼ (60秒后)
            ┌───────────────┐
            │ 自动保存到    │
            │ cache.json    │
            └───────────────┘
```

### 4.3 前端同步流程

```
定时触发 (每10分钟05秒)
    │
    ▼
┌─────────────────┐
│ 显示加载状态    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ GET /api/markets│ ← 请求后端缓存接口
│ /cached?source= │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 压缩数据        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 保存到          │
│ localStorage    │ ← markets_cache_v3
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 更新UI状态      │
│ ( markets数组 ) │
└─────────────────┘
```

---

## 五、关键配置汇总

### 5.1 时间配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 后端定时更新 | 10分钟 | `TEN_MINUTES = 10 * 60 * 1000` |
| 前端同步频率 | 每10分钟 | `SYNC_INTERVAL = 10 * 60 * 1000` |
| 前端同步偏移 | 5分钟 | `SYNC_OFFSET = 5 * 60 * 1000` |
| 后端缓存TTL | 10分钟 | `CACHE_TTL_MARKETS = 600` |
| 后端价格缓存 | 1分钟 | `CACHE_TTL_PRICES = 60` |
| 文件保存间隔 | 60秒 | `SAVE_INTERVAL = 60000` |
| 文件最大年龄 | 7天 | `MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000` |
| 刷新超时保护 | 5分钟 | `UPDATE_TIMEOUT = 5 * 60 * 1000` |
| 请求间隔延迟 | 250ms | `REQUEST_DELAY = 250` |

### 5.2 数据限制

| 限制项 | 值 | 说明 |
|--------|-----|------|
| 每页请求数量 (Polymarket) | 100 | `limit = 100` |
| 每页请求数量 (Predict) | 150 | `first = 150` |
| 最大安全限制 | 10000 | `MAX_SAFETY_LIMIT = 10000` |
| Stats并发数量 | 3 | `CONCURRENCY = 3` |
| API速率限制 | 240 req/min | Predict API 限制 |
| Polymarket流动性过滤 | ≥ $1,000 | `liquidity_min = 1000` |
| Polymarket时间过滤 | ≥ 7天 | 结束日期必须在未来7天以上 |
| Polymarket数量限制 | 2000 | 按交易量排序取前2000 |
| localStorage大小限制 | 4MB | 超过则截取前5000条 |
| 前端默认显示数量 | 20 | `displayLimit = 20` |
| 前端分页步长 | 20 | `PAGE_SIZE = 20` |

### 5.3 API端点汇总

#### 后端接口

| 方法 | 端点 | 用途 | 缓存 |
|------|------|------|------|
| GET | `/health` | 健康检查 | 否 |
| GET | `/api/markets/cached` | 只读缓存数据 | 是（只读） |
| POST | `/api/markets/refresh` | 强制刷新数据 | 否 |
| GET | `/api/predict/markets` | Predict原始数据 | 是 |
| GET | `/api/polymarket/markets` | Polymarket原始数据 | 是 |
| GET | `/api/arbitrage/opportunities` | 套利机会 | 否 |

#### 外部API

| 平台 | 端点 | 用途 |
|------|------|------|
| Polymarket | `https://gamma-api.polymarket.com/markets` | 获取市场列表 |
| Predict.fun | `https://api.predict.fun/v1/markets` | 获取市场列表 |
| Predict.fun | `https://api.predict.fun/v1/categories` | 获取分类（父事件） |

---

## 六、潜在问题与注意事项

### 6.1 已知问题

| 问题 | 影响 | 状态 |
|------|------|------|
| 多个localStorage Key | 数据不一致 | ⚠️ 需要统一 |
| Predict定时任务需要API Key | 自动更新可能失败 | ⚠️ 需要配置环境变量 |
| Polymarket数据可能过大 | localStorage超过4MB被截取 | ✅ 已添加压缩和截取逻辑 |
| 前端多个Store重复逻辑 | 维护困难 | ⚠️ 建议重构统一 |

### 6.2 环境变量要求

| 变量名 | 用途 | 必需 |
|--------|------|------|
| `PREDICT_FUN_API_KEY` | Predict API认证 | 是（用于定时更新） |
| `VITE_API_URL` | 前端连接后端地址 | 否（默认localhost:3001） |

### 6.3 调试命令

```bash
# 检查后端缓存
curl -s "http://localhost:3001/api/markets/cached?source=all" | jq '.count'

# 手动触发刷新
curl -X POST -H "x-api-key: YOUR_API_KEY" "http://localhost:3001/api/markets/refresh"

# 检查Polymarket数据
curl -s "http://localhost:3001/api/markets/cached?source=polymarket" | jq '.count'

# 检查Predict数据
curl -s "http://localhost:3001/api/markets/cached?source=predict" | jq '.count'
```

---

## 七、文件位置索引

### 后端关键文件

| 文件 | 用途 |
|------|------|
| `backend/src/services/polymarketService.ts` | Polymarket数据获取 |
| `backend/src/services/predictService.ts` | Predict数据获取 |
| `backend/src/routes/markets-cached-v2.ts` | 缓存API接口和定时任务 |
| `backend/src/utils/persistentCache.ts` | 持久化缓存实现 |
| `backend/data/cache.json` | 缓存文件（运行时生成） |

### 前端关键文件

| 文件 | 用途 |
|------|------|
| `app/src/stores/marketCacheStore.ts` | 主缓存Store（推荐） |
| `app/src/stores/cachedMarketStore.ts` | 备用缓存Store |
| `app/src/stores/marketStore.ts` | 实时数据Store |
| `app/src/api/client.ts` | API客户端 |

---

*文档结束*


---

## 八、Stats 获取专题说明

### 8.1 为什么需要获取 Stats

Predict.fun 的 `/markets` 接口返回的市场列表不包含 volume 和 liquidity 数据。这些数据需要通过 `/markets/{id}/stats` 接口单独获取。

### 8.2 实现方案

**问题**: 479 个市场 × 单个请求 = 大量 API调用  
**解决**: 批量获取 + 严格并发控制

```typescript
// 并发控制参数
const CONCURRENCY = 3;      // 一次只处理 3 个市场
const REQUEST_DELAY = 250;  // 批次间延迟 250ms
// 总耗时: ~2-3 分钟 (479 ÷ 3 × 250ms)
```

### 8.3 数据流程

```
fetchFromAPI()
    │
    ├─ 获取所有市场列表 (479个)
    │
    └─ batchGetMarketStats(marketIds)
        │
        ├─ 循环批次处理 (每批3个)
        │   ├─ Promise.all 并行请求
        │   │   ├─ GET /markets/{id}/stats
        │   │   └─ 保存到临时 Map
        │   └─ 延迟 250ms
        │
        └─ 返回 results Map
            │
            ▼
    合并数据到市场对象
    (market.volume = stats.volumeTotal)
```

### 8.4 超时保护机制

防止刷新过程中断导致 `isUpdating` 状态卡住：

```typescript
const UPDATE_TIMEOUT = 5 * 60 * 1000; // 5分钟超时

// 检查超时
if (isUpdating && Date.now() - updateStartTime > UPDATE_TIMEOUT) {
  console.log('[Refresh] Update timeout, resetting state');
  isUpdating = false;
}
```

### 8.5 缓存结构

Stats 数据被保存为独立的缓存项，方便复用：

```
cache.json
├─ predict-all-markets-v4     # 市场基础数据 (已合并 stats)
├─ predict-categories         # 分类映射
├─ predict-stats-10650        # 单个市场 stats
├─ predict-stats-10351
└─ ...
```

---

*文档结束*
