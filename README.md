# Predict.fun × Polymarket 跨市场套利监控系统

一个实时监控 Predict.fun 和 Polymarket 两个预测市场平台价格差异，自动发现套利机会的工具。

## 🚀 快速开始

### 方式一: 一键启动 (推荐)

#### Windows 用户

双击运行 `start.bat` 或在命令行执行:

```bash
# 方式 1: 批处理脚本
start.bat

# 方式 2: PowerShell 脚本
start.ps1

# 方式 3: Node.js 脚本
npm start
```

#### macOS / Linux 用户

```bash
# 方式 1: Shell 脚本
./start.sh

# 方式 2: Node.js 脚本
npm start
```

启动后访问:
- 前端界面: http://localhost:5173
- 后端 API: http://localhost:3001

### 方式二: 手动启动

#### 1. 安装依赖

```bash
# 一键安装所有依赖
npm run install:all
```

或者分别安装:

```bash
# 后端依赖
cd backend && npm install

# 前端依赖
cd app && npm install
```

#### 2. 配置环境变量

```bash
# 后端配置 (可选)
cd backend
cp .env.example .env

# 前端配置 (可选)
cd app
cp .env.example .env.local
```

#### 3. 启动服务

```bash
# 同时启动后端和前端
npm run dev

# 或分别启动
npm run dev:backend  # 后端 http://localhost:3001
npm run dev:frontend # 前端 http://localhost:5173
```

### 🖥️ 创建桌面快捷方式 (Windows)

双击运行 `创建快捷方式.bat`，会在桌面生成快捷方式，以后双击即可启动。

---

## ⚠️ 常见问题

### 1. 依赖安装失败 (网络错误)

如果遇到 `ECONNRESET` 或 `EPERM` 错误：

```bash
# 方法 1: 使用修复脚本 (推荐)
fix-dependencies.bat      # Windows
./fix-dependencies.ps1    # PowerShell

# 方法 2: 手动清理并重新安装
cd app
rmdir /s /q node_modules  # Windows
rm -rf node_modules       # Mac/Linux
del package-lock.json     # Windows
rm package-lock.json      # Mac/Linux
npm cache clean --force
npm install --legacy-peer-deps
```

### 2. 端口被占用

如果 3001 或 5173 端口被占用：

```bash
# Windows: 查找并结束占用端口的进程
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:3001 | xargs kill -9
```

### 3. 后端启动失败

检查是否已正确安装后端依赖：

```bash
cd backend
npm install
npm run build
npm run dev
```

## 📁 项目结构

```
arbitrage-monitor/
├── backend/                  # Node.js 后端 API 代理
│   ├── src/
│   │   ├── routes/          # API 路由
│   │   ├── services/        # 业务逻辑服务
│   │   ├── utils/           # 工具函数
│   │   ├── types/           # TypeScript 类型
│   │   └── index.ts         # 入口文件
│   ├── package.json
│   └── tsconfig.json
│
├── app/                      # React + Vite 前端
│   ├── src/
│   │   ├── components/      # UI 组件
│   │   ├── stores/          # Zustand 状态管理
│   │   ├── api/             # API 客户端
│   │   ├── types/           # TypeScript 类型
│   │   └── data/            # 模拟数据
│   ├── package.json
│   └── vite.config.ts
│
└── package.json             # 根目录脚本
```

## 🔌 API 端点

### 后端 API (端口 3001)

| 端点 | 描述 | 参数 |
|------|------|------|
| `GET /health` | 健康检查 | - |
| `GET /api/predict/markets` | 获取 Predict.fun 市场 | `?cursor=` |
| `GET /api/predict/markets/all` | 获取所有 Predict.fun 市场 | `?maxPages=` |
| `GET /api/predict/search` | 搜索 Predict.fun 市场 | `?q=` |
| `GET /api/polymarket/markets/all` | 获取所有 Polymarket 市场 | - |
| `GET /api/arbitrage/opportunities` | 获取套利机会 | 见下方 |
| `GET /api/arbitrage/stats` | 获取套利统计 | - |

### 套利机会查询参数

```
GET /api/arbitrage/opportunities
Headers:
  x-predict-api-key: {YOUR_PREDICT_FUN_API_KEY}

Query:
  minProfit=1.5        # 最小收益率 %
  maxProfit=50         # 最大收益率 %
  minConfidence=medium # 最低置信度 (high/medium/low)
  minLiquidity=1000    # 最小流动性 USD
  minVolume24h=500     # 最小24h交易量 USD
```

## 🔑 API Key 配置

在前端设置面板中配置 API Key:

1. 点击右上角设置图标
2. 选择 "API Keys" 标签
3. 输入 Predict.fun API Key
4. 切换 "Use Real Data" 模式

**获取 Predict.fun API Key:**
- 访问 [Predict.fun](https://predict.fun) 并登录
- 进入开发者设置获取 API Key

## 🧮 套利算法

系统通过以下步骤识别套利机会:

1. **市场匹配**: 通过 `conditionId` 匹配两个平台的同一事件
2. **价格比较**: 比较 Yes/No 代币的价格差异
3. **手续费计算**: 扣除双边交易手续费 (默认各 0.2%)
4. **ROI 计算**: `(卖出价 - 买入价) / 买入价 - 总手续费`
5. **置信度评分**: 基于 ROI、流动性、交易量计算

### 套利公式

```
价差 = 卖出价 - 买入价
价差% = 价差 / 买入价
总手续费 = Predict手续费 + Polymarket手续费
ROI = 价差% - 总手续费
净利润 = 价差 × (1 - 总手续费)
```

## 🛠️ 技术栈

### 后端
- **Node.js 20** + **TypeScript**
- **Fastify** - Web 框架
- **Axios** - HTTP 客户端
- **node-cache** - 内存缓存

### 前端
- **React 18** + **TypeScript**
- **Vite 5** - 构建工具
- **Zustand** - 状态管理
- **Tailwind CSS** - 样式
- **shadcn/ui** - UI 组件

## 📝 开发指南

### 添加新的数据源

1. 在 `backend/src/services/` 创建服务
2. 在 `backend/src/routes/` 创建路由
3. 在 `backend/src/index.ts` 注册路由

### 修改套利算法

编辑 `backend/src/services/arbitrageService.ts`:

```typescript
// 自定义套利计算逻辑
function calculateArbitrage(marketA, marketB, tokenType, settings) {
  // 实现自定义逻辑
}
```

## ⚠️ 注意事项

1. **API 限制**:
   - Predict.fun: 240 请求/分钟, 每页最多 150 条
   - Polymarket: 100 请求/分钟, 每页最多 100 条

2. **No 价格计算**:
   - 正确方式: `noPrice = 1 - yesAskPrice`
   - 不要直接使用 API 返回的 noPrice

3. **CORS 问题**:
   - 浏览器无法直接调用 API
   - 必须通过后端代理服务器

4. **缓存策略**:
   - 市场数据缓存 30 秒
   - 订单簿数据缓存 10 秒

## 📄 许可证

MIT License
