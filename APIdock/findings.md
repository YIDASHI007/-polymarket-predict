# Findings

## 2026-02-27
- Official docs checked at: https://docs.polymarket.com/api-reference/wss/market
- Subscription payload:
  - `{ "type": "market", "assets_ids": ["..."] }`
- Snapshot payload:
  - `event_type: "book"`
  - Top-level `asset_id`, and level rows with `price` + `size`.
- Incremental payload:
  - `event_type: "price_change"`
  - `price_changes[]` with `asset_id`, `price`, `size`, `side`, optional `best_bid/best_ask`.
- Best-quote payload:
  - `event_type: "best_bid_ask"`.
- Root causes from previous implementation:
  - mixed websocket streams from multiple active sessions,
  - fuzzy asset matching,
  - incorrect orderbook total interpretation.
