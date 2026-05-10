// NO 订单簿合成器
//
// 背景：
//   Predict.fun 的 WebSocket 只推 YES 这一侧的 orderbook。
//   Polymarket 的 YES / NO 是两个独立的 CLOB token，都有各自的 WS 订阅。
//
// 二元市场数学关系：
//   一张 NO 代币等价于"1 USDC - 一张 YES 代币"
//   ⇒ NO_ask_price = 1 - YES_bid_price（卖 1 张 YES bid 后收回的 USDC 差额就是 NO 的成本）
//   ⇒ NO_bid_price = 1 - YES_ask_price
//   ⇒ NO 档位的 size 等于对应 YES 档位的 size

import type { Orderbook, PriceLevel } from './types';

/**
 * 从 YES 订单簿合成 NO 订单簿。
 *
 * NOTE: 这只是"理论等价"——真实交易时因 gas / 复合订单的不可原子性，
 * NO 合成订单可能比"直接买 NO"更慢或更贵，所以优先使用平台真实 NO book。
 */
export function synthesizeNoFromYes(yesBook: Orderbook, noMarketKey: string): Orderbook {
  if (yesBook.outcome !== 'yes') {
    throw new Error(`synthesizeNoFromYes expects yes book, got ${yesBook.outcome}`);
  }

  // NO ask = 1 - YES bid, 按 price 升序
  const noAsks: PriceLevel[] = yesBook.bids
    .map((lv) => ({ price: 1 - lv.price, size: lv.size }))
    .filter((lv) => lv.price > 0 && lv.price < 1)
    .sort((a, b) => a.price - b.price);

  // NO bid = 1 - YES ask, 按 price 降序
  const noBids: PriceLevel[] = yesBook.asks
    .map((lv) => ({ price: 1 - lv.price, size: lv.size }))
    .filter((lv) => lv.price > 0 && lv.price < 1)
    .sort((a, b) => b.price - a.price);

  return {
    venue: yesBook.venue,
    marketKey: noMarketKey,
    outcome: 'no',
    asks: noAsks,
    bids: noBids,
    ts: yesBook.ts,
  };
}
