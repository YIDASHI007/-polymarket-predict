# Predict-Monitor 新用户首次使用指南

## 1. 首次使用前准备（新电脑）

### 【重要】必须先安装 Node.js 20+
- 访问 Node.js 官网安装 `Node.js 20.x LTS` 或更高版本。
- 安装后在命令行执行：

```bash
node -v
npm -v
```

- 两条命令都能输出版本号，才可以继续。

### 【重要】保持网络可用
- 首次启动会自动安装依赖（`npm ci`/`npm install`）。
- 如果网络受限，请先配置可用的 npm 源或代理。

## 2. 首次启动（推荐）

### 双击启动
- 在项目根目录直接双击：`start-clean.bat`

### 启动脚本会自动做这些事
1. 检查 Node.js 和 npm。
2. 检查 Node 版本是否满足 20+。
3. 自动创建环境文件（若不存在）：
   - `backend/.env`（来自 `.env.example`）
   - `app/.env.local`（来自 `.env.example`）
4. 自动释放占用端口：
   - 后端 `3001`
   - 前端 `5173`
5. 自动安装依赖并启动前后端服务。

## 3. 启动成功后的访问地址

- 前端页面：`http://localhost:5173`
- 后端接口：`http://localhost:3001`

## 4. API Key 说明

### 【重要】配置 Predict.fun API Key

所有 API Key 均通过**环境变量**读取，**仓库中不应出现任何硬编码 key**。

#### 后端 (backend/.env)

复制 `backend/.env.example` 为 `backend/.env`，填入你的 key：

```env
PREDICT_FUN_API_KEY=你从-predict.fun-申请到的-key
PORT=3001
HOST=0.0.0.0
```

说明：
- **未配置**时：后端定时刷新任务会跳过 Predict.fun（仅刷新 Polymarket），前端走到需要 key 的路由会返回 401。
- 前端也可以通过设置面板在运行时传入 key（通过 `x-api-key` header 转发给后端）。

#### 前端 (app/.env.local)

```env
VITE_API_URL=http://localhost:3001
```

生产构建请使用 `app/.env.production`（已配置为 Railway 后端地址）。

> **⚠️ 安全提醒**：如果你发现旧版代码里的 `2969c30f-...` 这个 key 曾经被提交到仓库，请立刻到 predict.fun 后台将其吊销并重新生成。

## 5. 常见问题排查

### 问题 A：双击后提示找不到 Node.js
- 原因：未安装 Node.js 或未加入系统 PATH。
- 处理：重装 Node.js 20+，重新打开终端验证 `node -v`。

### 问题 B：依赖安装失败
- 处理顺序：
1. 检查网络是否正常。
2. 重试双击 `start-clean.bat`。
3. 仍失败时执行项目内修复脚本：`fix-dependencies.bat`。

### 问题 C：页面打不开
- 检查两个服务窗口是否报错退出。
- 检查端口是否被其他程序长期占用（3001/5173）。

## 6. 日常使用

- 平时只需双击 `start-clean.bat` 即可启动。
- 停止服务：关闭“Backend / Frontend”两个命令行窗口。
