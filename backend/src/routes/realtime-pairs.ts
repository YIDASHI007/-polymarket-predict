import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createPredictService } from '../services/predictService';
import { polymarketService } from '../services/polymarketService';
import {
  CardOutputEvent,
  CardParams,
  NormalizedOrderbook,
  RealtimeArbitrageModule,
} from '../modules/realtime-arbitrage';

interface StartCardBody {
  cardId: string;
  predictMarketId: string;
  polymarketYesTokenId: string;
  polymarketNoTokenId: string;
  params: CardParams;
  predictApiKey?: string;
}

interface StopCardParams {
  cardId: string;
}

interface RuntimeCard {
  cardId: string;
  predictApiKey: string;
  predictMarketId: string;
  polymarketYesTokenId: string;
  polymarketNoTokenId: string;
  params: CardParams;
  timer?: NodeJS.Timeout;
  polling: boolean;
  lastError?: string;
}

interface CardView {
  cardId: string;
  state?: CardOutputEvent;
  paramsEcho?: CardOutputEvent;
  snapshot?: CardOutputEvent;
  arbResult?: CardOutputEvent;
  lastEventAt: number;
  polling: boolean;
  lastError?: string;
}

const POLL_MS = 2500;
const moduleEngine = new RealtimeArbitrageModule();
const runtimes = new Map<string, RuntimeCard>();
const latestEvents = new Map<string, CardView>();

function toLevels(entries: any): Array<{ price: number; size: number }> {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((it) => {
      if (Array.isArray(it)) {
        return { price: Number(it[0]), size: Number(it[1]) };
      }
      return { price: Number(it?.price), size: Number(it?.size) };
    })
    .filter((x) => Number.isFinite(x.price) && Number.isFinite(x.size) && x.price > 0 && x.size > 0);
}

function normalizeOrderbook(raw: any): NormalizedOrderbook {
  const asks = toLevels(raw?.asks);
  const bids = toLevels(raw?.bids);
  const bestAsk = asks.length ? Math.min(...asks.map((x) => x.price)) : null;
  const bestBid = bids.length ? Math.max(...bids.map((x) => x.price)) : null;
  return { asks, bids, bestAsk, bestBid, ts: Date.now() };
}

function invertOrderbook(book: NormalizedOrderbook): NormalizedOrderbook {
  // Synthetic NO book from YES book:
  // NO ask  ~= 1 - YES bid
  // NO bid  ~= 1 - YES ask
  const asks = book.bids
    .map((x) => ({ price: 1 - x.price, size: x.size }))
    .filter((x) => x.price > 0 && x.price < 1)
    .sort((a, b) => a.price - b.price);
  const bids = book.asks
    .map((x) => ({ price: 1 - x.price, size: x.size }))
    .filter((x) => x.price > 0 && x.price < 1)
    .sort((a, b) => b.price - a.price);
  return {
    asks,
    bids,
    bestAsk: asks.length ? asks[0].price : null,
    bestBid: bids.length ? bids[0].price : null,
    ts: Date.now(),
  };
}

function upsertLatest(event: CardOutputEvent): void {
  const current = latestEvents.get(event.cardId) || {
    cardId: event.cardId,
    lastEventAt: 0,
    polling: false,
  };

  if (event.type === 'card_state') current.state = event;
  if (event.type === 'params_echo') current.paramsEcho = event;
  if (event.type === 'market_snapshot') current.snapshot = event;
  if (event.type === 'arb_result') current.arbResult = event;

  current.lastEventAt = Date.now();
  latestEvents.set(event.cardId, current);
}

async function pollOne(runtime: RuntimeCard, fastify: FastifyInstance): Promise<void> {
  if (runtime.polling) return;
  runtime.polling = true;

  try {
    const predictService = createPredictService(runtime.predictApiKey);
    const [predRaw, polyYesRaw, polyNoRaw] = await Promise.all([
      predictService.getOrderbook(runtime.predictMarketId),
      polymarketService.getOrderbook(runtime.polymarketYesTokenId),
      polymarketService.getOrderbook(runtime.polymarketNoTokenId),
    ]);

    const predictYes = normalizeOrderbook(predRaw);
    const predictNo = invertOrderbook(predictYes);
    const polyYes = normalizeOrderbook(polyYesRaw);
    const polyNo = normalizeOrderbook(polyNoRaw);

    moduleEngine.ingestConnectionState({
      venue: 'predict',
      status: 'running',
      message: 'orderbook polling active',
    });
    moduleEngine.ingestConnectionState({
      venue: 'polymarket',
      status: 'running',
      message: 'orderbook polling active',
    });

    moduleEngine.ingestOrderbook({
      venue: 'predict',
      marketId: runtime.predictMarketId,
      outcome: 'yes',
      orderbook: predictYes,
    });
    moduleEngine.ingestOrderbook({
      venue: 'predict',
      marketId: runtime.predictMarketId,
      outcome: 'no',
      orderbook: predictNo,
    });
    moduleEngine.ingestOrderbook({
      venue: 'polymarket',
      marketId: runtime.polymarketYesTokenId,
      outcome: 'yes',
      orderbook: polyYes,
    });
    moduleEngine.ingestOrderbook({
      venue: 'polymarket',
      marketId: runtime.polymarketNoTokenId,
      outcome: 'no',
      orderbook: polyNo,
    });

    runtime.lastError = undefined;
    const view = latestEvents.get(runtime.cardId);
    if (view) {
      view.polling = false;
      view.lastError = undefined;
      latestEvents.set(runtime.cardId, view);
    }
  } catch (error: any) {
    const errMsg = error?.message || 'polling failed';
    runtime.lastError = errMsg;
    moduleEngine.ingestConnectionState({
      venue: 'predict',
      status: 'error',
      message: errMsg,
    });
    const view = latestEvents.get(runtime.cardId);
    if (view) {
      view.polling = false;
      view.lastError = runtime.lastError;
      latestEvents.set(runtime.cardId, view);
    }
    fastify.log.warn(`[realtime-pairs] poll failed: ${runtime.cardId} ${runtime.lastError}`);
  } finally {
    runtime.polling = false;
  }
}

function stopRuntime(cardId: string): void {
  const runtime = runtimes.get(cardId);
  if (!runtime) return;
  if (runtime.timer) clearInterval(runtime.timer);
  moduleEngine.stopCard(cardId);
  runtimes.delete(cardId);
}

moduleEngine.subscribe((event) => {
  upsertLatest(event);
});

export async function realtimePairsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/cards/start', async (
    request: FastifyRequest<{ Body: StartCardBody }>,
    reply: FastifyReply
  ) => {
    const body = request.body;
    const predictApiKey = body.predictApiKey || process.env.PREDICT_FUN_API_KEY || '';

    if (!body?.cardId || !body?.predictMarketId || !body?.polymarketYesTokenId || !body?.polymarketNoTokenId) {
      return reply.status(400).send({ error: 'missing required card ids' });
    }
    if (!predictApiKey) {
      return reply.status(400).send({ error: 'predictApiKey required' });
    }

    const existing = runtimes.get(body.cardId);
    if (existing?.timer) clearInterval(existing.timer);

    const runtime: RuntimeCard = {
      cardId: body.cardId,
      predictApiKey,
      predictMarketId: String(body.predictMarketId),
      polymarketYesTokenId: String(body.polymarketYesTokenId),
      polymarketNoTokenId: String(body.polymarketNoTokenId),
      params: body.params,
      polling: false,
    };
    runtimes.set(body.cardId, runtime);

    moduleEngine.startCard({
      cardId: runtime.cardId,
      predict: { marketId: runtime.predictMarketId },
      polymarket: {
        yesId: runtime.polymarketYesTokenId,
        noId: runtime.polymarketNoTokenId,
      },
      params: runtime.params,
    });

    runtime.timer = setInterval(() => {
      void pollOne(runtime, fastify);
    }, POLL_MS);
    void pollOne(runtime, fastify);

    return {
      ok: true,
      cardId: runtime.cardId,
      pollMs: POLL_MS,
    };
  });

  fastify.put('/cards/:cardId/params', async (
    request: FastifyRequest<{ Params: StopCardParams; Body: { params: CardParams } }>
  ) => {
    const { cardId } = request.params;
    const runtime = runtimes.get(cardId);
    if (!runtime) return { ok: false, error: 'card not found' };
    runtime.params = request.body.params;
    moduleEngine.updateCardParams(cardId, runtime.params);
    return { ok: true };
  });

  fastify.delete('/cards/:cardId', async (
    request: FastifyRequest<{ Params: StopCardParams }>
  ) => {
    stopRuntime(request.params.cardId);
    latestEvents.delete(request.params.cardId);
    return { ok: true };
  });

  fastify.get('/cards', async () => {
    const items = Array.from(latestEvents.values()).map((x) => ({
      ...x,
      polling: runtimes.get(x.cardId)?.polling || false,
      lastError: runtimes.get(x.cardId)?.lastError,
    }));
    return {
      data: items,
      count: items.length,
      ts: Date.now(),
    };
  });
}
