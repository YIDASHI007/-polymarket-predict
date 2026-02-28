# Polymarket Market WebSocket API --- Complete Summary

This document summarizes the Polymarket Market WebSocket API so it can
be used offline by local systems or AI agents.

------------------------------------------------------------------------

# 1. Overview

The Polymarket Market WebSocket provides real-time market data
including:

-   Orderbook snapshots
-   Orderbook incremental updates
-   Trade executions
-   Best bid and ask prices
-   Market lifecycle events (new market, resolution)
-   Tick size updates

WebSocket endpoint:

    wss://ws-subscriptions-clob.polymarket.com/ws/market

This is a public endpoint and does NOT require:

-   API key
-   Authentication
-   Wallet
-   Signature

------------------------------------------------------------------------

# 2. Subscription

After connecting, send a JSON message:

    {
      "type": "market",
      "assets_ids": ["asset_id_1", "asset_id_2"]
    }

Important:

-   You must subscribe using asset_ids
-   NOT market_id
-   Each market has 2 asset_ids (Yes and No outcomes)

------------------------------------------------------------------------

# 3. Asset ID vs Market ID

Structure:

Market ├─ YES outcome → asset_id └─ NO outcome → asset_id

Example:

Market: "Will BTC reach 100k?"

Assets: YES asset_id: 123 NO asset_id: 456

Subscription:

    {
      "type": "market",
      "assets_ids": ["123", "456"]
    }

------------------------------------------------------------------------

# 4. Event Types

The WebSocket sends events with the following structure:

    {
      "event_type": "...",
      ...
    }

------------------------------------------------------------------------

# 5. Orderbook Snapshot Event

event_type: book

Full orderbook snapshot.

Example:

    {
      "event_type": "book",
      "asset_id": "123",
      "bids": [
        {"price": "0.45", "size": "100"}
      ],
      "asks": [
        {"price": "0.55", "size": "200"}
      ],
      "timestamp": "..."
    }

Purpose:

-   Initialize local orderbook

------------------------------------------------------------------------

# 6. Orderbook Incremental Update

event_type: price_change

Example:

    {
      "event_type": "price_change",
      "asset_id": "123",
      "changes": [
        {
          "price": "0.50",
          "size": "300",
          "side": "BUY"
        }
      ]
    }

Purpose:

-   Update existing orderbook

------------------------------------------------------------------------

# 7. Trade Event

event_type: last_trade_price

Example:

    {
      "event_type": "last_trade_price",
      "asset_id": "123",
      "price": "0.47",
      "size": "50",
      "side": "BUY",
      "timestamp": "..."
    }

Purpose:

-   Real-time trade execution data

------------------------------------------------------------------------

# 8. Best Bid and Ask

event_type: best_bid_ask

Example:

    {
      "event_type": "best_bid_ask",
      "asset_id": "123",
      "best_bid": "0.46",
      "best_ask": "0.48",
      "timestamp": "..."
    }

Purpose:

-   Track best prices

------------------------------------------------------------------------

# 9. Market Resolution Event

event_type: market_resolved

Example:

    {
      "event_type": "market_resolved",
      "market_id": "...",
      "winning_outcome": "Yes"
    }

Purpose:

-   Market outcome determined

------------------------------------------------------------------------

# 10. New Market Event

event_type: new_market

Example:

    {
      "event_type": "new_market",
      "market_id": "...",
      "question": "...",
      "outcomes": ["Yes", "No"]
    }

Purpose:

-   Detect newly created markets

------------------------------------------------------------------------

# 11. Tick Size Change Event

event_type: tick_size_change

Example:

    {
      "event_type": "tick_size_change",
      "asset_id": "...",
      "old_tick_size": "0.01",
      "new_tick_size": "0.001"
    }

Purpose:

-   Update minimum price increment

------------------------------------------------------------------------

# 12. Heartbeat

Client should periodically send:

    {}

Purpose:

-   Maintain connection

------------------------------------------------------------------------

# 13. Typical Data Flow

Connection flow:

1.  Connect WebSocket
2.  Send subscription
3.  Receive orderbook snapshot
4.  Receive incremental updates
5.  Receive trade events
6.  Receive best bid/ask updates

------------------------------------------------------------------------

# 14. Use Cases

This WebSocket can be used to build:

-   Trading bots
-   Market making systems
-   Arbitrage systems
-   Real-time dashboards
-   Orderbook visualizations
-   Price charts

------------------------------------------------------------------------

# 15. Subscription Limits

Official limit:

-   No hard limit

Practical recommended limit:

-   \~500 asset_ids per WebSocket connection

For larger scale:

Use multiple WebSocket connections.

------------------------------------------------------------------------

# 16. Required REST API (for asset_ids)

Asset IDs must be retrieved via REST:

    https://clob.polymarket.com/markets

Extract:

    tokens[].token_id

------------------------------------------------------------------------

# 17. Example Python Client

    import websocket
    import json

    ws = websocket.WebSocket()
    ws.connect("wss://ws-subscriptions-clob.polymarket.com/ws/market")

    subscribe = {
        "type": "market",
        "assets_ids": ["123", "456"]
    }

    ws.send(json.dumps(subscribe))

    while True:
        print(ws.recv())

------------------------------------------------------------------------

# END
