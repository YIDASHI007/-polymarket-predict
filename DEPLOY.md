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
3. 添加以下环境变量：

```
PREDICT_FUN_API_KEY=你的_predict_fun_api_key
PORT=3001
HOST=0.0.0.0
```

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
