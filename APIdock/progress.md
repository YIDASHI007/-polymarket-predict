# Progress

- Initialized planning files.
- Rebuilt `app.py` from scratch with:
  - single active websocket lifecycle,
  - documented event handling (`book`, `price_change`, `best_bid_ask`, `last_trade_price`),
  - exact asset_id-keyed orderbook state,
  - reset/start endpoints.
- Rebuilt `templates/index.html` from scratch with:
  - exact token_id -> orderbook lookup,
  - clean orderbook rendering,
  - per-level total (`price * size`),
  - message stream and polling.
- Validated backend syntax (`python -m py_compile app.py`).
