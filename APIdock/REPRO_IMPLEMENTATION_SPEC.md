# 当前代码完整实现逻辑（可交给任意 AI 复现）

本文档精确描述当前项目 `app.py + templates/index.html` 的端到端实现思路、流程、数据结构和计算规则。
目标是让任意 AI 在没有上下文的情况下，仅根据本文就能复现“当前效果”。

## 1. 项目目标

实现一个本地 Web 页面，订阅 Polymarket `market` WebSocket 通道，展示：
- 订单簿（买卖盘）
- 点差（Spread）
- YES/NO 按钮价格
- 原始消息流（用于调试）

关键要求：
- 按 `asset_id` 精确匹配，不允许模糊匹配。
- 同一时刻只有一个活跃 WebSocket 订阅流，避免多市场数据串流污染。
- 按当前版本显示规则：
  - YES/NO 按钮数字取 `卖1(best ask)`。
  - 表格列为 `Price / Size / Total / Cumulative`。
  - 卖盘累计从卖1开始累计（即从最低 ask 开始），即便页面展示顺序是高价在上。

---

## 2. 依赖与运行方式

## 2.1 Python 依赖
- `flask`
- `flask-cors`
- `websocket-client`

安装示例：
```bash
pip install flask flask-cors websocket-client
```

## 2.2 启动
```bash
python app.py
```
默认本地服务：http://127.0.0.1:5000

---

## 3. 后端（app.py）完整逻辑

## 3.1 全局常量与共享状态
- `WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market"`
- `MAX_MESSAGES = 200`：消息流最多保留 200 条。
- `DEPTH_LIMIT = 20`：API 返回时每边盘口最多返回 20 档。

共享内存结构 `market_data`：
- `messages`: 消息列表，用于右侧调试流。
- `orderbooks`: `dict[asset_id] -> {bids, asks, best_bid, best_ask, timestamp}`。
- `token_ids`: 当前订阅的 token 列表（通常 `[yes_token_id, no_token_id]`）。
- `last_trade`: 最近成交信息（按 asset_id）。

连接控制全局变量：
- `current_token_ids`: 当前订阅 token 列表。
- `current_ws`: 当前 WebSocket 对象。
- `allow_reconnect`: 是否允许断开后自动重连。

线程锁：
- `state_lock`：保护 `market_data`。
- `ws_lock`：保护 `current_ws/current_token_ids/allow_reconnect`。

## 3.2 输入 token 规范化（非常关键）
函数：`normalize_token_ids(raw)`

目的：兼容前端传入的各种脏格式（例如带反斜杠转义、外层引号、方括号残留）。

处理步骤：
1. `raw is None` -> 返回空列表。
2. 如果 `raw` 是字符串：
   - `strip()`
   - 去掉外层引号 `"'`
   - 将 `\\"` 还原成 `"`
   - 优先 `json.loads(candidate)`
   - 若 JSON 失败，退化为逗号分割。
3. 如果不是列表则包装成列表。
4. 对每个 token 执行 `clean_token`：
   - 去空白
   - 去外层引号
   - 去方括号
   - 去反斜杠
   - 正则仅保留 `[0-9a-zA-Z_-]`
5. 过滤空字符串，返回干净 token 列表。

## 3.3 WebSocket 生命周期管理

### 3.3.1 启动新订阅
`POST /` 时：
1. 解析 `clobTokenIds` -> `normalize_token_ids`
2. 若为空返回 400
3. 调用 `stop_websocket()` 停掉旧连接（防串流）
4. 清空旧内存数据：`messages/orderbooks/last_trade`
5. 更新 `market_data["token_ids"]`
6. 更新 `current_token_ids`
7. 开 daemon 线程执行 `run_websocket(token_ids)`

### 3.3.2 run_websocket
1. 创建 `websocket.WebSocketApp`，注册 `on_open/on_message/on_error/on_close`
2. 在 `ws_lock` 下设置：
   - `allow_reconnect = True`
   - `current_ws = ws`
3. 调用 `run_forever(ping_interval=20, ping_timeout=10)`
4. 退出后若 `current_ws is ws`，置空。

### 3.3.3 on_open
发送订阅包：
```json
{
  "type": "market",
  "assets_ids": current_token_ids
}
```
并打印 `Subscribed: [...]`。

### 3.3.4 on_close 自动重连策略
1. 若关闭的是当前活跃连接，先置空 `current_ws`
2. 仅当 `allow_reconnect=True` 且存在 `current_token_ids` 时才重连
3. 延迟 2 秒后重新开线程 `run_websocket(reconnect_tokens)`

### 3.3.5 stop_websocket
1. 在 `ws_lock` 下：
   - `allow_reconnect = False`
   - 取出并清空 `current_ws`
2. 若存在 ws，调用 `ws.close()`

## 3.4 WebSocket 消息处理链路

### 3.4.1 on_message
1. `json.loads(message)`
2. 若是数组，逐条 `process_event`
3. 若是对象，直接 `process_event`

### 3.4.2 process_event 总体规则
- 非 dict 直接忽略。
- 在 `state_lock` 下先 `add_message(event)` 保存到消息流。
- 根据 `event_type` 分支处理。

### 3.4.3 event_type = book（全量快照）
1. 取顶层 `asset_id`
2. 读取 `bids/asks`，标准化为字符串字段：`price/size`
3. bids 按价格降序，asks 按价格升序
4. 覆盖写入 `market_data["orderbooks"][asset_id]`
5. 调用 `compute_best_bid_ask` 更新最优买卖价

### 3.4.4 event_type = price_change（增量）
1. 读取 `price_changes` 列表
2. 每条调用 `apply_price_change(change)`

`apply_price_change` 逻辑：
- 没有 `asset_id` 直接忽略
- 如果本地还没有该 asset 的 `orderbook`，忽略（不凭空创建深度）
- 读取 `price/size/side`
- `side == BUY` -> 更新 `bids`
- `side == SELL` -> 更新 `asks`
- 更新后分别重新排序（bids 降序 / asks 升序）
- 若事件带 `best_bid/best_ask`，同步覆盖元数据
- 更新时间戳并重新计算 `best_bid/best_ask`

`upsert_level` 规则：
- 若同价位已存在：
  - 新 size > 0 -> 替换
  - 新 size <= 0 -> 删除该档
- 若同价位不存在且新 size > 0 -> 新增

### 3.4.5 event_type = best_bid_ask
仅更新对应 asset 的 `best_bid/best_ask/timestamp`。

### 3.4.6 event_type = last_trade_price
写入 `market_data["last_trade"][asset_id] = {price,size,side,timestamp}`。

## 3.5 后端 HTTP API

### GET /
返回 `templates/index.html`。

### POST /
输入：
```json
{ "clobTokenIds": ["yes_token_id", "no_token_id"] }
```
输出成功：
```json
{ "status": "success", "message": "subscribed", "token_ids": [...] }
```

### GET /api/market_data
返回当前内存快照：
- `messages`：最多 200 条
- `orderbooks`：每个 asset 的 bids/asks 各最多 20 档
- `token_ids`
- `last_trade`

### POST /api/reset
停止 ws、清空内存、清空当前 token 列表。

---

## 4. 前端（templates/index.html）完整逻辑

## 4.1 页面结构
- 输入框：填写 token 数组
- 按钮：`Subscribe`、`Reset`
- 状态文本：`Disconnected/Connecting.../Connected`
- 左侧：价格标题 + YES/NO 切换 + 盘口表格
- 右侧：消息流

表格列：
1. `Price`
2. `Size`
3. `Total`（单档：`price * size`）
4. `Cumulative`（累计）

## 4.2 前端全局状态
```js
state = { orderbooks: {}, token_ids: [], messages: [], last_trade: {} }
currentOutcome = "yes"
pollTimer = null
```

## 4.3 token 输入解析（前端）
函数：`parseInputTokens(raw)`

处理策略：
1. 先定义 `cleanToken` 去掉反斜杠、方括号、引号，只保留 `[0-9a-zA-Z_-]`
2. 构造多种候选字符串（原始、去外层引号、解 `\\"`）
3. 依次尝试 `JSON.parse`
4. 失败后回退逗号分割
5. 返回清洗后的 token 数组

## 4.4 订阅流程（subscribeTokens）
1. 从输入框读取 token
2. 调 `POST /` 提交
3. 成功后状态置为 `Connecting...`
4. 开启 1 秒轮询 `fetchMarketData`
5. 立刻拉取一次

## 4.5 重置流程（resetAll）
1. `POST /api/reset`
2. 清空前端 `state`
3. 重绘
4. 状态置 `Disconnected`

## 4.6 轮询流程（fetchMarketData）
1. `GET /api/market_data`
2. 覆盖本地 `state`
3. 若 messages 非空 -> 状态 `Connected`
4. 调 `renderEverything`

## 4.7 价格与头部显示

### sell1Price(book)
- 仅取 `best_ask`
- `best_ask > 0` 才返回，否则 `null`

### renderHeaderPrices()
- YES 按钮显示 yesBook 的 `best_ask`
- NO 按钮显示 noBook 的 `best_ask`
- 顶部大号 headline 显示当前选中 outcome 的 `best_ask`（百分比样式）

## 4.8 订单簿渲染（renderBook）

### 4.8.1 获取目标订单簿
- `currentOutcome == yes` -> `token_ids[0]`
- `currentOutcome == no` -> `token_ids[1]`
- 通过精确键查找：`state.orderbooks[tokenId]`

### 4.8.2 深度与排序
- asks：按价格升序取前 8 档后 `reverse()` 显示（高价在上，靠近点差在下）
- bids：按价格降序取前 8 档（高价在上，靠近点差在上）

### 4.8.3 Total 与 Cumulative
- `Total = price * size`（单档）

- asks 的 `Cumulative`：
  - 必须从卖1（最低 ask）开始累计
  - 实现方式：把显示用 `asks` 反转成升序 `ascAsks`，先累计写入 `cumByPrice`
  - 再按显示顺序输出对应累计值
  - 效果：最靠近点差的卖1那行累计最小

- bids 的 `Cumulative`：
  - 按当前显示顺序（已是买1到更低价）顺序累计

### 4.8.4 Spread 行
- `bestAsk = asks最小价`
- `bestBid = bids最大价`
- `spread = (bestAsk - bestBid) * 100`

## 4.9 消息流渲染（renderMessages）
- 仅显示最近 40 条
- 每条展示 `[timestamp] event_type`
- JSON 最长显示 900 字符（超过省略）
- 每次重绘自动滚到底

## 4.10 汇总栏（renderSummary）
显示：
- 当前 market 数（orderbooks 键数量）
- 消息条数
- 当前选中 outcome

---

## 5. 端到端时序（完整）

1. 用户打开 `/`。
2. 输入 token 数组并点击 `Subscribe`。
3. 前端先清洗 token，再 POST 到后端。
4. 后端：
   - 清洗 token
   - 停掉旧 ws
   - 清空旧数据
   - 更新订阅 token
   - 启动新 ws 线程
5. ws 建连后发送 `{type: "market", assets_ids:[...]}`。
6. 收到 `book` 后初始化本地订单簿。
7. 收到 `price_change` 后做逐档增量更新。
8. 前端每秒轮询 `/api/market_data`。
9. 前端按精确 token_id 查找订单簿并渲染。
10. YES/NO 显示卖1价格；表格显示 Total + Cumulative。
11. 若 ws 异常关闭且允许重连，后端 2 秒后自动重连。

---

## 6. 复现时必须保持的关键约束

1. `token_id == asset_id` 的精确键匹配，不做 `includes`。
2. 启动新订阅前必须关闭旧 ws（防串流）。
3. `price_change` 只更新已有订单簿，不凭空造深度。
4. 卖盘累计从卖1开始，不随展示倒序而改变语义。
5. 输入 token 必须做鲁棒清洗（尤其处理 `\\"`、`[]`、外层引号）。
6. 前端轮询周期 1 秒，后端返回深度限制 20 档，前端展示 8 档。

---

## 7. 验证清单（交给 AI 后用于自测）

1. 启动后访问 `/` 正常。
2. 输入合法 token 订阅后，控制台打印 `Subscribed: [...]` 且 token 无 `[` `]` `\\` 残留。
3. `/api/market_data` 返回 `orderbooks` 非空。
4. YES/NO 按钮价格等于各自 `best_ask`（不是中间价）。
5. 盘口 `Total = price * size`。
6. asks 的 `Cumulative` 在卖1行最小，向远离点差方向增大。
7. 重复订阅不同 token 后不出现旧市场数据混入。

以上即为当前代码的完整复现规范。
