# 🚀 部署指南

## 推荐方案：Railway（免费额度够用）

### 1. 准备工作

确保代码已推送到 GitHub：
```bash
git add -A
git commit -m "Add deployment configs"
git push origin main
```

### 2. 注册 Railway

1. 访问 https://railway.app
2. 点击 "Get Started" 用 GitHub 账号登录
3. 选择 "Try free for 7 days"（之后有免费额度）

### 3. 部署后端

1. 点击 "New Project"
2. 选择 "Deploy from GitHub repo"
3. 选择你的仓库 `YIDASHI007/-polymarket-predict`
4. 等待自动部署完成（约 2-3 分钟）
5. 部署成功后，会获得一个域名如：
   ```
   https://polymarket-predict-production.up.railway.app
   ```

### 4. 配置环境变量（重要！）

在 Railway 控制台：
1. 点击你的项目
2. 点击 "Variables" 标签
3. 添加以下环境变量（**绝不要把 key 写进代码仓库**）：

```
PREDICT_FUN_API_KEY=你的_predict_fun_api_key
PORT=3001
HOST=0.0.0.0
NODE_ENV=production
```

可选：
```
HTTPS_PROXY=http://your-proxy:port   # 仅在需要代理访问外部 API 时设置
```

> 未设置 `PREDICT_FUN_API_KEY` 时，后端仍可启动，但定时刷新任务会跳过 Predict.fun 数据，仅刷新 Polymarket。

### 5. 部署前端

Railway 也可以部署前端，或者使用 GitHub Pages：

#### 方式 A：Railway 部署（推荐，同一平台）

1. 在 Railway 项目里点击 "New"
2. 选择 "Empty Service"
3. 部署后进入设置，添加 Build Command：
   ```
   cd app && npm install && npm run build
   ```
4. 添加 Start Command：
   ```
   cd app && npx serve -s dist -p 3000
   ```
5. 添加环境变量：
   ```
   VITE_API_URL=https://你的后端域名.up.railway.app
   ```

#### 方式 B：GitHub Pages（纯前端）

1. 修改 `app/.env.production`：
   ```
   VITE_API_URL=https://你的后端域名.up.railway.app
   ```
2. 提交并推送
3. 在 GitHub 仓库 Settings → Pages 中启用 GitHub Actions
4. 等待部署完成

### 6. 访问你的网站

部署完成后，你将获得两个网址：
- **后端 API**：`https://xxx.up.railway.app`（提供数据）
- **前端网站**：`https://xxx.up.railway.app` 或 `https://用户名.github.io/仓库名`

## 备选方案：Render

如果 Railway 免费额度用完，可以使用 Render：

1. 访问 https://render.com
2. 用 GitHub 登录
3. New Web Service → 选择你的仓库
4. 配置：
   - Name: `polymarket-predict`
   - Build Command: `cd backend && npm install && npm run build`
   - Start Command: `cd backend && npm start`
5. 添加环境变量（同 Railway）
6. 免费版会有休眠，访问时可能需要等待 30 秒唤醒

## 📝 常见问题

### Q: 部署后前端无法连接后端？
A: 检查 CORS 配置，确保 `app/src/api/client.ts` 中的 `API_BASE_URL` 正确指向后端域名。

### Q: API Key 如何获取？
A: Predict.fun API Key 需要联系 Predict.fun 官方申请。

### Q: 如何更新部署？
A: 只需推送代码到 GitHub，Railway/Render 会自动重新部署。

```bash
git add -A
git commit -m "Update features"
git push origin main
```


## 🔐 GitHub Pages 部署时的 Secrets 配置

前端在 GitHub Actions 构建时需要 `VITE_API_URL` 指向你的后端。推荐通过 **Repository Secrets** 注入，而不是硬编码在 workflow 中：

1. 进入 GitHub 仓库 → Settings → Secrets and variables → Actions → "New repository secret"
2. 添加：
   - `VITE_API_URL` = `https://你的后端域名.up.railway.app`
3. 推送代码后，workflow 会自动读取该 secret 注入构建。

> 当前仓库的 `.github/workflows/deploy.yml` 已配置为优先使用 `secrets.VITE_API_URL`，未设置时回落到默认值。

## 🛡️ API Key 安全守则

- **绝不要** 在任何源码文件（.ts / .js / .tsx / .md / 配置文件）里硬编码 API key。
- **绝不要** 把 `backend/.env` 或 `app/.env.local` 提交到仓库（已在 `.gitignore`）。
- 部署平台（Railway / Render / Vercel）都通过各自的 "Variables" / "Environment Variables" 面板注入。
- 如果 key 不慎泄漏：立刻登录对应平台后台**吊销并重新生成**，然后更新部署环境变量。
