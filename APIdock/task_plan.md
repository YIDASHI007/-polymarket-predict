# Task Plan

## Goal
Rebuild backend and frontend from scratch to render Polymarket market-channel orderbook data correctly using documented websocket payloads.

## Phases
- [x] Create clean project skeleton (app.py + templates/index.html).
- [x] Implement backend websocket lifecycle and documented event handling.
- [x] Implement frontend polling/render logic with exact token->asset mapping.
- [x] Validate syntax and basic runtime assumptions.
- [x] Provide run instructions and known limits.

## Constraints
- Use documented market channel payloads (`book`, `price_change`, `best_bid_ask`, `last_trade_price`).
- Do not use fuzzy token matching.
- Keep a single active websocket stream to prevent data mixing.

## Errors Encountered
- Earlier shell-initialization failures in non-escalated mode; resolved by running commands with approved elevated prefix.
