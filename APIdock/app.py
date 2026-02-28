import json
import re
import threading
import time
from typing import Any, Dict, List, Optional

import websocket
from flask import Flask, render_template, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

POLY_WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market"
PRED_WS_URL = "wss://ws.predict.fun/ws"
MAX_MESSAGES = 200
DEPTH_LIMIT = 20

state_lock = threading.Lock()
poly_ws_lock = threading.Lock()
pred_ws_lock = threading.Lock()


# ------------------------------
# Shared utils
# ------------------------------


def now_ms() -> str:
    return str(int(time.time() * 1000))


def add_limited_message(messages: List[Dict[str, Any]], payload: Any) -> None:
    messages.append({"timestamp": time.strftime("%H:%M:%S"), "data": payload})
    if len(messages) > MAX_MESSAGES:
        del messages[:-MAX_MESSAGES]


def sort_levels(levels: List[Dict[str, str]], reverse: bool) -> List[Dict[str, str]]:
    return sorted(levels, key=lambda x: float(x.get("price", 0)), reverse=reverse)


def compute_best_bid_ask(orderbook: Dict[str, Any]) -> None:
    bids = orderbook.get("bids", [])
    asks = orderbook.get("asks", [])

    best_bid = max((float(x["price"]) for x in bids), default=0.0)
    best_ask = min((float(x["price"]) for x in asks), default=0.0)

    orderbook["best_bid"] = str(best_bid) if best_bid > 0 else None
    orderbook["best_ask"] = str(best_ask) if best_ask > 0 else None


def upsert_level(levels: List[Dict[str, str]], price: str, size: str) -> List[Dict[str, str]]:
    target = float(price)
    new_size = float(size)
    out: List[Dict[str, str]] = []
    found = False

    for level in levels:
        p = float(level.get("price", 0))
        if p == target:
            found = True
            if new_size > 0:
                out.append({"price": price, "size": size})
        else:
            out.append({"price": str(level.get("price", "0")), "size": str(level.get("size", "0"))})

    if not found and new_size > 0:
        out.append({"price": price, "size": size})

    return out


def normalize_id(value: Any) -> str:
    s = str(value).strip()
    s = s.strip("\"'")
    s = s.strip("[]")
    s = s.replace("\\", "")
    s = s.strip("\"'")
    return re.sub(r"[^0-9a-zA-Z_-]", "", s)


def normalize_level_list(levels: Any) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    if not isinstance(levels, list):
        return out

    for item in levels:
        price = None
        size = None

        if isinstance(item, (list, tuple)) and len(item) >= 2:
            price, size = item[0], item[1]
        elif isinstance(item, dict):
            price = item.get("price", item.get("p"))
            size = item.get("size", item.get("quantity", item.get("qty", item.get("amount"))))

        if price is None or size is None:
            continue

        try:
            p = float(price)
            s = float(size)
        except Exception:
            continue

        if p < 0 or p > 1:
            continue
        if s <= 0:
            continue

        out.append({"price": str(p), "size": str(s)})

    return out


def complement_price_str(price: str) -> str:
    p = float(price)
    c = round(1.0 - p, 6)
    if c < 0:
        c = 0.0
    if c > 1:
        c = 1.0
    return str(c)


# ------------------------------
# Polymarket state + websocket
# ------------------------------

poly_data: Dict[str, Any] = {
    "messages": [],
    "orderbooks": {},
    "token_ids": [],
    "last_trade": {},
}

poly_current_token_ids: List[str] = []
poly_current_ws: Optional[websocket.WebSocketApp] = None
poly_allow_reconnect = False


def poly_apply_price_change(change: Dict[str, Any]) -> None:
    asset_id = normalize_id(change.get("asset_id", ""))
    if not asset_id:
        return

    orderbook = poly_data["orderbooks"].get(asset_id)
    if not orderbook:
        return

    price = change.get("price")
    size = change.get("size")
    side = str(change.get("side", "")).upper()

    if price is not None and size is not None:
        price_str = str(price)
        size_str = str(size)
        if side == "BUY":
            orderbook["bids"] = sort_levels(upsert_level(orderbook.get("bids", []), price_str, size_str), True)
        elif side == "SELL":
            orderbook["asks"] = sort_levels(upsert_level(orderbook.get("asks", []), price_str, size_str), False)

    if change.get("best_bid") is not None:
        orderbook["best_bid"] = str(change.get("best_bid"))
    if change.get("best_ask") is not None:
        orderbook["best_ask"] = str(change.get("best_ask"))

    orderbook["timestamp"] = change.get("timestamp") or now_ms()
    compute_best_bid_ask(orderbook)


def poly_process_event(event: Dict[str, Any]) -> None:
    if not isinstance(event, dict):
        return

    with state_lock:
        add_limited_message(poly_data["messages"], event)
        event_type = event.get("event_type")

        if event_type == "book":
            asset_id = normalize_id(event.get("asset_id", ""))
            if not asset_id:
                return

            bids = normalize_level_list(event.get("bids", []))
            asks = normalize_level_list(event.get("asks", []))

            ob = {
                "bids": sort_levels(bids, True),
                "asks": sort_levels(asks, False),
                "timestamp": event.get("timestamp") or now_ms(),
                "best_bid": None,
                "best_ask": None,
            }
            compute_best_bid_ask(ob)
            poly_data["orderbooks"][asset_id] = ob
            return

        if event_type == "price_change":
            changes = event.get("price_changes", [])
            if isinstance(changes, list):
                for change in changes:
                    if isinstance(change, dict):
                        poly_apply_price_change(change)
            return

        if event_type == "best_bid_ask":
            asset_id = normalize_id(event.get("asset_id", ""))
            orderbook = poly_data["orderbooks"].get(asset_id)
            if orderbook:
                if event.get("best_bid") is not None:
                    orderbook["best_bid"] = str(event.get("best_bid"))
                if event.get("best_ask") is not None:
                    orderbook["best_ask"] = str(event.get("best_ask"))
                orderbook["timestamp"] = event.get("timestamp") or orderbook.get("timestamp")
            return

        if event_type == "last_trade_price":
            asset_id = normalize_id(event.get("asset_id", ""))
            if asset_id:
                poly_data["last_trade"][asset_id] = {
                    "price": str(event.get("price", "0")),
                    "size": str(event.get("size", "0")),
                    "side": str(event.get("side", "")),
                    "timestamp": event.get("timestamp"),
                }


def poly_on_message(_: websocket.WebSocketApp, message: str) -> None:
    try:
        payload = json.loads(message)
    except Exception:
        return

    if isinstance(payload, list):
        for event in payload:
            poly_process_event(event)
    else:
        poly_process_event(payload)


def poly_on_error(_: websocket.WebSocketApp, error: Any) -> None:
    print(f"[Polymarket] WebSocket error: {error}")


def poly_on_close(ws: websocket.WebSocketApp, status_code: Any, close_msg: Any) -> None:
    global poly_current_ws
    print(f"[Polymarket] WebSocket closed: {status_code} {close_msg}")

    reconnect_tokens = None
    with poly_ws_lock:
        is_current = ws is poly_current_ws
        if is_current:
            poly_current_ws = None
        if is_current and poly_allow_reconnect and poly_current_token_ids:
            reconnect_tokens = poly_current_token_ids[:]

    if reconnect_tokens:
        time.sleep(2)
        threading.Thread(target=poly_run_websocket, args=(reconnect_tokens,), daemon=True).start()


def poly_on_open(ws: websocket.WebSocketApp) -> None:
    with poly_ws_lock:
        token_ids = poly_current_token_ids[:]

    ws.send(json.dumps({"type": "market", "assets_ids": token_ids}))
    print(f"[Polymarket] Subscribed: {token_ids}")


def poly_run_websocket(token_ids: List[str]) -> None:
    global poly_current_ws, poly_allow_reconnect

    ws = websocket.WebSocketApp(
        POLY_WS_URL,
        on_open=poly_on_open,
        on_message=poly_on_message,
        on_error=poly_on_error,
        on_close=poly_on_close,
    )

    with poly_ws_lock:
        poly_allow_reconnect = True
        poly_current_ws = ws

    ws.run_forever(ping_interval=20, ping_timeout=10)

    with poly_ws_lock:
        if poly_current_ws is ws:
            poly_current_ws = None


def poly_stop_websocket() -> None:
    global poly_current_ws, poly_allow_reconnect

    with poly_ws_lock:
        poly_allow_reconnect = False
        ws = poly_current_ws
        poly_current_ws = None

    if ws:
        try:
            ws.close()
        except Exception:
            pass


# ------------------------------
# Predict state + websocket
# ------------------------------

predict_data: Dict[str, Any] = {
    "messages": [],
    "market_id": "",
    "orderbooks": {"yes": {}, "no": {}},
}

predict_current_market_id = ""
predict_current_ws: Optional[websocket.WebSocketApp] = None
predict_allow_reconnect = False
predict_request_id = 1


def predict_next_request_id() -> int:
    global predict_request_id
    with pred_ws_lock:
        rid = predict_request_id
        predict_request_id += 1
    return rid


def predict_extract_book_payload(raw: Any) -> Dict[str, Any]:
    payload = raw
    if isinstance(payload, dict) and isinstance(payload.get("data"), dict):
        payload = payload["data"]
    if not isinstance(payload, dict):
        return {}
    return payload


def predict_update_books(book_payload: Dict[str, Any]) -> None:
    yes_bids = normalize_level_list(book_payload.get("bids", []))
    yes_asks = normalize_level_list(book_payload.get("asks", []))

    yes_book = {
        "bids": sort_levels(yes_bids, True),
        "asks": sort_levels(yes_asks, False),
        "timestamp": str(book_payload.get("updateTimestampMs", book_payload.get("timestamp", now_ms()))),
        "best_bid": None,
        "best_ask": None,
    }
    compute_best_bid_ask(yes_book)

    # Predict docs: orderbook prices are YES-side. Build NO side by complementing and swapping sides.
    no_bids = [{"price": complement_price_str(x["price"]), "size": x["size"]} for x in yes_book["asks"]]
    no_asks = [{"price": complement_price_str(x["price"]), "size": x["size"]} for x in yes_book["bids"]]

    no_book = {
        "bids": sort_levels(no_bids, True),
        "asks": sort_levels(no_asks, False),
        "timestamp": yes_book["timestamp"],
        "best_bid": None,
        "best_ask": None,
    }
    compute_best_bid_ask(no_book)

    predict_data["orderbooks"] = {
        "yes": yes_book,
        "no": no_book,
    }



def predict_process_message(ws: websocket.WebSocketApp, payload: Any) -> None:
    with state_lock:
        add_limited_message(predict_data["messages"], payload)

    if not isinstance(payload, dict):
        return

    msg_type = payload.get("type")
    topic = payload.get("topic", "")

    # Heartbeat response is mandatory per docs.
    if msg_type == "M" and topic == "heartbeat":
        ts = payload.get("data")
        try:
            ws.send(json.dumps({"method": "heartbeat", "data": ts}))
        except Exception:
            pass
        return

    if msg_type == "M" and isinstance(topic, str) and topic.startswith("predictOrderbook/"):
        book_payload = predict_extract_book_payload(payload.get("data"))
        market_id = str(book_payload.get("marketId", "")).strip() or topic.split("/", 1)[1]

        with state_lock:
            if market_id:
                predict_data["market_id"] = market_id
            predict_update_books(book_payload)


def predict_on_message(ws: websocket.WebSocketApp, message: str) -> None:
    try:
        payload = json.loads(message)
    except Exception:
        return
    predict_process_message(ws, payload)


def predict_on_error(_: websocket.WebSocketApp, error: Any) -> None:
    print(f"[Predict] WebSocket error: {error}")


def predict_on_close(ws: websocket.WebSocketApp, status_code: Any, close_msg: Any) -> None:
    global predict_current_ws
    print(f"[Predict] WebSocket closed: {status_code} {close_msg}")

    reconnect_market = ""
    with pred_ws_lock:
        is_current = ws is predict_current_ws
        if is_current:
            predict_current_ws = None
        if is_current and predict_allow_reconnect and predict_current_market_id:
            reconnect_market = predict_current_market_id

    if reconnect_market:
        time.sleep(2)
        threading.Thread(target=predict_run_websocket, args=(reconnect_market,), daemon=True).start()


def predict_on_open(ws: websocket.WebSocketApp) -> None:
    with pred_ws_lock:
        market_id = predict_current_market_id

    request_id = predict_next_request_id()
    subscribe_msg = {
        "method": "subscribe",
        "requestId": request_id,
        "params": [f"predictOrderbook/{market_id}"],
    }
    ws.send(json.dumps(subscribe_msg))
    print(f"[Predict] Subscribed: predictOrderbook/{market_id}")


def predict_run_websocket(market_id: str) -> None:
    global predict_current_ws, predict_allow_reconnect

    ws = websocket.WebSocketApp(
        PRED_WS_URL,
        on_open=predict_on_open,
        on_message=predict_on_message,
        on_error=predict_on_error,
        on_close=predict_on_close,
    )

    with pred_ws_lock:
        predict_allow_reconnect = True
        predict_current_ws = ws

    ws.run_forever(ping_interval=20, ping_timeout=10)

    with pred_ws_lock:
        if predict_current_ws is ws:
            predict_current_ws = None


def predict_stop_websocket() -> None:
    global predict_current_ws, predict_allow_reconnect

    with pred_ws_lock:
        predict_allow_reconnect = False
        ws = predict_current_ws
        predict_current_ws = None

    if ws:
        try:
            ws.close()
        except Exception:
            pass


# ------------------------------
# Input normalizers
# ------------------------------


def normalize_token_ids(raw: Any) -> List[str]:
    if raw is None:
        return []

    if isinstance(raw, str):
        candidate = raw.strip().strip("\"'").replace("\\\"", "\"")
        try:
            raw = json.loads(candidate)
        except Exception:
            raw = [x for x in candidate.split(",") if x.strip()]

    if not isinstance(raw, list):
        raw = [raw]

    cleaned = [normalize_id(x) for x in raw]
    return [x for x in cleaned if x]


def normalize_market_id(raw: Any) -> str:
    return normalize_id(raw)


# ------------------------------
# Flask routes
# ------------------------------


@app.route("/", methods=["GET"])
def index() -> Any:
    return render_template("index.html")


@app.route("/simulator", methods=["GET"])
def simulator() -> Any:
    return render_template("simulator.html")


@app.route("/api/polymarket/subscribe", methods=["POST"])
def api_polymarket_subscribe() -> Any:
    global poly_current_token_ids

    try:
        payload = request.get_json(silent=True) or {}
        token_ids = normalize_token_ids(payload.get("clobTokenIds"))
        if not token_ids:
            return {"status": "error", "message": "No token ids"}, 400

        poly_stop_websocket()

        with state_lock:
            poly_data["messages"].clear()
            poly_data["orderbooks"].clear()
            poly_data["last_trade"].clear()
            poly_data["token_ids"] = token_ids[:]

        with poly_ws_lock:
            poly_current_token_ids = token_ids[:]

        threading.Thread(target=poly_run_websocket, args=(token_ids,), daemon=True).start()
        return {"status": "success", "message": "subscribed", "token_ids": token_ids}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}, 500


@app.route("/api/polymarket/data", methods=["GET"])
def api_polymarket_data() -> Any:
    with state_lock:
        return {
            "messages": poly_data["messages"][:],
            "orderbooks": {
                aid: {
                    "bids": ob.get("bids", [])[:DEPTH_LIMIT],
                    "asks": ob.get("asks", [])[:DEPTH_LIMIT],
                    "best_bid": ob.get("best_bid"),
                    "best_ask": ob.get("best_ask"),
                    "timestamp": ob.get("timestamp"),
                }
                for aid, ob in poly_data["orderbooks"].items()
            },
            "token_ids": poly_data["token_ids"][:],
            "last_trade": poly_data["last_trade"].copy(),
        }


@app.route("/api/polymarket/reset", methods=["POST"])
def api_polymarket_reset() -> Any:
    global poly_current_token_ids

    poly_stop_websocket()

    with poly_ws_lock:
        poly_current_token_ids = []

    with state_lock:
        poly_data["messages"].clear()
        poly_data["orderbooks"].clear()
        poly_data["token_ids"].clear()
        poly_data["last_trade"].clear()

    return {"status": "success", "message": "reset"}


@app.route("/api/predict/subscribe", methods=["POST"])
def api_predict_subscribe() -> Any:
    global predict_current_market_id

    try:
        payload = request.get_json(silent=True) or {}
        market_id = normalize_market_id(payload.get("marketId", payload.get("market_id", payload.get("id", ""))))
        if not market_id:
            return {"status": "error", "message": "No market id"}, 400

        predict_stop_websocket()

        with state_lock:
            predict_data["messages"].clear()
            predict_data["market_id"] = market_id
            predict_data["orderbooks"] = {"yes": {}, "no": {}}

        with pred_ws_lock:
            predict_current_market_id = market_id

        threading.Thread(target=predict_run_websocket, args=(market_id,), daemon=True).start()
        return {"status": "success", "message": "subscribed", "market_id": market_id}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}, 500


@app.route("/api/predict/data", methods=["GET"])
def api_predict_data() -> Any:
    with state_lock:
        yes_book = predict_data["orderbooks"].get("yes", {})
        no_book = predict_data["orderbooks"].get("no", {})
        return {
            "messages": predict_data["messages"][:],
            "market_id": predict_data["market_id"],
            "orderbooks": {
                "yes": {
                    "bids": yes_book.get("bids", [])[:DEPTH_LIMIT],
                    "asks": yes_book.get("asks", [])[:DEPTH_LIMIT],
                    "best_bid": yes_book.get("best_bid"),
                    "best_ask": yes_book.get("best_ask"),
                    "timestamp": yes_book.get("timestamp"),
                },
                "no": {
                    "bids": no_book.get("bids", [])[:DEPTH_LIMIT],
                    "asks": no_book.get("asks", [])[:DEPTH_LIMIT],
                    "best_bid": no_book.get("best_bid"),
                    "best_ask": no_book.get("best_ask"),
                    "timestamp": no_book.get("timestamp"),
                },
            },
        }


@app.route("/api/predict/reset", methods=["POST"])
def api_predict_reset() -> Any:
    global predict_current_market_id

    predict_stop_websocket()

    with pred_ws_lock:
        predict_current_market_id = ""

    with state_lock:
        predict_data["messages"].clear()
        predict_data["market_id"] = ""
        predict_data["orderbooks"] = {"yes": {}, "no": {}}

    return {"status": "success", "message": "reset"}


if __name__ == "__main__":
    app.run(debug=True)
