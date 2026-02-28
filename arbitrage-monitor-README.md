# 跨市场套利监控系统 - 前端代码

## 项目概述

基于 Predict.fun 和 Polymarket 的跨市场套利监控系统前端，使用 React + TypeScript + Tailwind CSS + shadcn/ui 构建。

## 技术栈

- **框架**: React 18 + TypeScript 5.2
- **构建工具**: Vite 5.0
- **状态管理**: Zustand (含持久化)
- **UI组件库**: shadcn/ui + Tailwind CSS
- **图标**: SVG 内联图标

## 项目结构

```
src/
├── types/
│   └── index.ts              # 类型定义 (UnifiedMarket, ArbitrageOpportunity, UserSettings等)
├── data/
│   └── mockData.ts           # 模拟数据 (市场、套利机会、统计数据)
├── stores/
│   ├── marketStore.ts        # 市场数据状态管理 (Zustand)
│   └── settingsStore.ts      # 用户设置状态管理 (Zustand + persist)
├── utils/
│   └── formatters.ts         # 格式化工具函数
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx       # 侧边栏导航
│   │   └── Header.tsx        # 顶部工具栏
│   ├── markets/
│   │   └── MarketList.tsx    # 市场列表组件
│   ├── arbitrage/
│   │   └── ArbitrageList.tsx # 套利机会列表
│   └── settings/
│       └── SettingsPanel.tsx # 设置面板
├── App.tsx                   # 主应用组件
├── App.css                   # 全局样式
└── main.tsx                  # 入口文件
```

## 核心功能

### 1. 市场列表
- 双视图模式: 网格视图 + 列表视图
- 搜索、筛选、排序
- 平台标识 (Predict.fun绿色 / Polymarket紫色)
- 状态标签 (交易中 / 即将结束 / 已关闭)

### 2. 套利机会
- 分级高亮显示:
  - 🔴 高利润 (≥15%): 红色边框 + 发光效果
  - 🟠 中利润 (5-15%): 橙色边框
  - 🟡 低利润 (2-5%): 黄色标签
- 统计卡片展示
- 一键跳转到交易平台

### 3. 设置面板
- API配置 (Predict.fun / Polymarket API Key)
- 监控设置 (刷新间隔、自动刷新)
- 套利筛选 (最小收益率、置信度、流动性)
- 通知设置 (声音、浏览器通知)
- 显示设置 (主题、紧凑模式)

## 安装和运行

```bash
# 1. 解压文件
tar -xzf arbitrage-monitor-frontend.tar.gz
cd arbitrage-monitor

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 构建生产版本
npm run build
```

## 环境变量

创建 `.env` 文件:

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

## 关键类型定义

### UnifiedMarket (统一市场模型)
```typescript
interface UnifiedMarket {
  id: string;
  source: 'predict' | 'polymarket';
  conditionId: string;      // 用于跨平台匹配
  categorySlug?: string;    // 多元市场组标识
  title: string;
  yesPrice: number;         // Yes当前价格 (0-1)
  noPrice: number;          // No当前价格 (计算: 1 - yesPrice)
  volume24h: number;
  liquidity: number;
  isTradable: boolean;
}
```

### ArbitrageOpportunity (套利机会)
```typescript
interface ArbitrageOpportunity {
  id: string;
  title: string;
  predictMarket: UnifiedMarket;
  polymarketMarket: UnifiedMarket;
  buyPlatform: 'predict' | 'polymarket';
  sellPlatform: 'predict' | 'polymarket';
  roi: number;              // 收益率
  netProfit: number;        // 净利润
  confidence: 'high' | 'medium' | 'low';
}
```

## 状态管理

### MarketStore
- `markets`: 所有市场数据
- `arbitrageOpportunities`: 套利机会列表
- `searchQuery`: 搜索关键词
- `selectedPlatform`: 平台筛选
- `sortBy`, `sortOrder`: 排序
- `getFilteredMarkets()`: 获取筛选后的市场
- `refreshAll()`: 刷新所有数据

### SettingsStore (持久化)
- `settings`: 用户配置
- `isSettingsOpen`: 设置面板开关
- `updateApiKey()`: 更新API Key
- `updateFilters()`: 更新筛选条件
- `resetToDefaults()`: 恢复默认设置

## 格式化工具

```typescript
formatPrice(0.65)           // "$0.65"
formatPercent(0.1207)       // "+12.07%"
formatVolume(1250000)       // "$1.2M"
formatRelativeTime(timestamp) // "刚刚" / "5分钟前"
formatCountdown(endDate)    // "5天 3小时"
getArbitrageLevel(0.12)     // "high" | "medium" | "low" | "micro"
```

## 响应式断点

- `≥1400px`: 完整布局，侧边栏展开
- `1024px-1399px`: 侧边栏可折叠
- `768px-1023px`: 侧边栏隐藏为汉堡菜单
- `<768px`: 单列布局，卡片堆叠

## 自定义样式

```css
/* 套利等级样式 */
.arbitrage-high    /* 红色边框 + 渐变背景 */
.arbitrage-medium  /* 橙色边框 */
.arbitrage-low     /* 黄色边框 */

/* 平台标识色 */
.platform-predict     /* #10b981 绿色 */
.platform-polymarket  /* #8b5cf6 紫色 */

/* 动画 */
.animate-pulse-glow   /* 脉冲发光效果 */
.price-flash-up       /* 价格上涨动画 */
.price-flash-down     /* 价格下跌动画 */
```

## 后续开发建议

1. **连接真实API**: 替换 mockData 为真实 API 调用
2. **WebSocket支持**: 添加实时价格推送
3. **图表组件**: 集成 Recharts 显示价格走势
4. **用户认证**: 添加登录/注册功能
5. **通知系统**: 实现浏览器通知和声音提醒

## 许可证

MIT
