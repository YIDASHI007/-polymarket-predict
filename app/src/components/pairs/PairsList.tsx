import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePairStore } from '@/stores/pairStore';
import { useMarketStore } from '@/stores/marketStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useArbitrageNotificationStore } from '@/stores/arbitrageNotificationStore';
import { CreatePairDialog } from './CreatePairDialog';
import { PairMonitorParamsDialog } from './PairMonitorParamsDialog';
import { AutoPairDialog } from './AutoPairDialog';
import { SkeletonCard } from '@/components/common/SkeletonCard';
import { formatPercent, formatRelativeTime } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { apiClient } from '@/api/client';
import type { PairedMarketStatus } from '@/types';

interface RealtimePairCardView {
  cardId: string;
  state?: { status: string; message: string; updatedAt: number };
  snapshot?: {
    poly: {
      yes: { asks: Array<{ price: number; size: number }>; bids: Array<{ price: number; size: number }>; bestAsk: number | null; bestBid: number | null } | null;
      no: { asks: Array<{ price: number; size: number }>; bids: Array<{ price: number; size: number }>; bestAsk: number | null; bestBid: number | null } | null;
    };
    predict: {
      yes: { asks: Array<{ price: number; size: number }>; bids: Array<{ price: number; size: number }>; bestAsk: number | null; bestBid: number | null } | null;
      no: { asks: Array<{ price: number; size: number }>; bids: Array<{ price: number; size: number }>; bestAsk: number | null; bestBid: number | null } | null;
    };
    ts: number;
  };
  arbResult?: {
    hasOpportunity: boolean;
    strategy: string;
    netProfit: number;
    profitRate: number;
    reason: string;
    qty: number;
    steps?: Array<{
      qty: number;
      leg1: string;
      leg2: string;
      price1: number;
      price2: number;
      edgePerShare: number;
    }>;
    ts: number;
  };
  lastEventAt: number;
  lastError?: string;
}

type Book = NonNullable<NonNullable<RealtimePairCardView['snapshot']>['poly']['yes']>;
type OutcomeTab = 'yes' | 'no';

function fmtCent(price: number | null | undefined): string {
  if (price === null || price === undefined || Number.isNaN(price)) return '--';
  return `${(price * 100).toFixed(1)}c`;
}

function OrderbookPanel({
  title,
  yesBook,
  noBook,
  activeOutcome,
  onOutcomeChange,
}: {
  title: string;
  yesBook: Book | null | undefined;
  noBook: Book | null | undefined;
  activeOutcome: OutcomeTab;
  onOutcomeChange: (next: OutcomeTab) => void;
}) {
  if (!yesBook || !noBook) {
    return (
      <div className="p-5 rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 text-sm text-slate-500 h-full shadow-sm">
        <div className="text-lg font-semibold text-slate-900 mb-2">{title}</div>
        暂无订单簿数据
      </div>
    );
  }

  const yesAsk1 = yesBook.asks.length ? Math.min(...yesBook.asks.map((x) => x.price)) : null;
  const noAsk1 = noBook.asks.length ? Math.min(...noBook.asks.map((x) => x.price)) : null;

  const activeBook = activeOutcome === 'yes' ? yesBook : noBook;
  const asksDisplay = [...(activeBook.asks || [])].sort((a, b) => a.price - b.price).slice(0, 8).reverse();
  const bidsDisplay = [...(activeBook.bids || [])].sort((a, b) => b.price - a.price).slice(0, 8);
  const asksAsc = [...asksDisplay].reverse();
  const askCumAsc: number[] = [];
  let askAcc = 0;
  asksAsc.forEach((lv) => {
    askAcc += lv.price * lv.size;
    askCumAsc.push(askAcc);
  });
  let bidAcc = 0;
  const bestAsk = asksDisplay.length ? Math.min(...asksDisplay.map((x) => x.price)) : null;
  const bestBid = bidsDisplay.length ? Math.max(...bidsDisplay.map((x) => x.price)) : null;

  return (
    <div className="h-[560px] rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 shadow-sm flex flex-col">
      <div className="px-4 pt-4 pb-3 border-b border-slate-200/70">
        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold tracking-tight text-slate-900">{title}</div>
          <div className="text-xs text-slate-500">
            点差 {bestAsk !== null && bestBid !== null ? fmtCent(bestAsk - bestBid) : '--'}
          </div>
        </div>
      </div>

      <div className="px-4 pt-3 pb-2 grid grid-cols-2 gap-2">
        <button
          className={cn(
            'h-10 rounded-lg border text-base font-semibold transition-colors',
            activeOutcome === 'yes'
              ? 'bg-emerald-100 text-emerald-800 border-emerald-500 shadow-sm'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100/70'
          )}
          onClick={() => onOutcomeChange('yes')}
        >
          是 {fmtCent(yesAsk1)}
        </button>
        <button
          className={cn(
            'h-10 rounded-lg border text-base font-semibold transition-colors',
            activeOutcome === 'no'
              ? 'bg-rose-100 text-rose-800 border-rose-500 shadow-sm'
              : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100/70'
          )}
          onClick={() => onOutcomeChange('no')}
        >
          否 {fmtCent(noAsk1)}
        </button>
      </div>

      <div className="px-3 pb-3 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-slate-200">
              <th className="py-2 pl-2 text-slate-600 font-semibold">价格</th>
              <th className="py-2 text-right text-slate-600 font-semibold">份额</th>
              <th className="py-2 text-right text-slate-600 font-semibold">总计</th>
              <th className="py-2 pr-2 text-right text-slate-600 font-semibold">累计</th>
            </tr>
          </thead>
          <tbody>
            {asksDisplay.map((lv, idx) => {
              const total = lv.price * lv.size;
              const cum = askCumAsc[askCumAsc.length - 1 - idx] || 0;
              return (
                <tr key={`ask-${idx}`} className="text-rose-600 border-b border-slate-100/80">
                  <td className="py-1.5 pl-2">{fmtCent(lv.price)}</td>
                  <td className="py-1 text-right">{lv.size.toFixed(2)}</td>
                  <td className="py-1 text-right">${total.toFixed(2)}</td>
                  <td className="py-1 pr-2 text-right">${cum.toFixed(2)}</td>
                </tr>
              );
            })}
            <tr>
              <td colSpan={4} className="py-2 px-2 border-y border-slate-200 bg-slate-50 text-slate-600 font-medium">
                点差: {bestAsk !== null && bestBid !== null ? fmtCent(bestAsk - bestBid) : '--'} | 最佳卖价: {fmtCent(bestAsk)} | 最佳买价: {fmtCent(bestBid)}
              </td>
            </tr>
            {bidsDisplay.map((lv, idx) => {
              const total = lv.price * lv.size;
              bidAcc += total;
              return (
                <tr key={`bid-${idx}`} className="text-emerald-700 border-b border-slate-100/80">
                  <td className="py-1.5 pl-2">{fmtCent(lv.price)}</td>
                  <td className="py-1 text-right">{lv.size.toFixed(2)}</td>
                  <td className="py-1 text-right">${total.toFixed(2)}</td>
                  <td className="py-1 pr-2 text-right">${bidAcc.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PairCard({
  status,
  realtimeView,
  expanded,
  onToggleDepth,
  onRemove,
}: {
  status: PairedMarketStatus;
  realtimeView?: RealtimePairCardView;
  expanded: boolean;
  onToggleDepth: () => void;
  onRemove: () => void;
}) {
  const { pair, predictMarket, polymarketMarket: polymarket, hasOpportunity, currentRoi, meetsFilters } = status;
  const monitorParams = pair.monitorParams ?? {
    predictFeeRate: 0.002,
    polymarketFeeRate: 0.002,
    minProfitPercent: pair.minProfitAlert ?? 2,
  };

  const moduleArb = realtimeView?.arbResult;
  const moduleProfitRate = moduleArb ? moduleArb.profitRate * 100 : null;
  const showModuleOpportunity = Boolean(moduleArb?.hasOpportunity);

  return (
    <Card
      className={cn(
        'transition-all h-[560px]',
        showModuleOpportunity || (hasOpportunity && meetsFilters)
          ? 'border-green-500/50 bg-green-50/30 dark:bg-green-950/10'
          : hasOpportunity
            ? 'border-yellow-500/50 bg-yellow-50/30'
            : 'hover:shadow-md',
        !pair.isActive && 'opacity-60 grayscale'
      )}
    >
      <CardContent className="p-3 h-full flex flex-col gap-3">
        <div className={cn('rounded-xl border p-3 space-y-2', showModuleOpportunity ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-slate-50/50')}>
          <div className="flex items-start gap-2">
            <Badge variant="secondary" className="shrink-0 bg-emerald-100 text-emerald-700">Predict</Badge>
            <div className="min-w-0">
              {predictMarket?.parentTitle ? (
                <>
                  <p className="text-[15px] font-semibold line-clamp-1" title={predictMarket.parentTitle}>{predictMarket.parentTitle}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1" title={predictMarket.title}>{predictMarket.title}</p>
                </>
              ) : (
                <p className="text-sm line-clamp-2" title={predictMarket?.title || pair.predictTitle}>{predictMarket?.title || pair.predictTitle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-center text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="secondary" className="shrink-0 bg-purple-100 text-purple-700">Polymarket</Badge>
            <div className="min-w-0">
              {polymarket?.parentTitle ? (
                <>
                  <p className="text-[15px] font-semibold line-clamp-1" title={polymarket.parentTitle}>{polymarket.parentTitle}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1" title={polymarket.title}>{polymarket.title}</p>
                </>
              ) : (
                <p className="text-sm line-clamp-2" title={polymarket?.title || pair.polymarketTitle}>{polymarket?.title || pair.polymarketTitle}</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>发现 {pair.opportunityCount} 次机会</span>
            <span>提醒阈值: {pair.minProfitAlert}%</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground mt-1">
            <span>{pair.lastCheckAt ? `更新: ${formatRelativeTime(pair.lastCheckAt)}` : '更新: --'}</span>
            <span>{showModuleOpportunity ? `模块套利 ${(moduleProfitRate || 0).toFixed(2)}%` : hasOpportunity ? `本地计算 ${formatPercent(currentRoi)}` : '暂无机会'}</span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs grid grid-cols-3 gap-2">
          <span>市场1费率: {(monitorParams.predictFeeRate * 100).toFixed(2)}%</span>
          <span>市场2费率: {(monitorParams.polymarketFeeRate * 100).toFixed(2)}%</span>
          <span>最低利润率: {monitorParams.minProfitPercent.toFixed(2)}%</span>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => window.open(predictMarket?.url || `https://predict.fun/market/${pair.predictMarketId.replace('predict-', '')}`, '_blank')}>
            Predict.fun
          </Button>
          <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" onClick={() => window.open(polymarket?.url || `https://polymarket.com/event/${pair.polymarketId.replace('polymarket-', '')}`, '_blank')}>
            Polymarket
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={onToggleDepth}>
            {expanded ? '收起盘口' : '盘口详情'}
          </Button>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={onRemove}>
            删除
          </Button>
        </div>

        <div className={cn('rounded-xl border p-3 text-xs min-h-[92px]', moduleArb?.hasOpportunity ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-200 bg-slate-50/60')}>
          {!moduleArb?.hasOpportunity && (
            <div className="h-full min-h-[68px] flex items-center justify-center text-sm font-medium text-slate-600">
              当前无可执行套利
            </div>
          )}

          {moduleArb?.hasOpportunity && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-emerald-800">发现套利机会</span>
                <span className="font-semibold text-emerald-700">{(moduleArb.profitRate * 100).toFixed(2)}%</span>
              </div>
              <div className="text-[11px] text-emerald-900/80">
                净利润 ${moduleArb.netProfit.toFixed(2)} | 数量 {moduleArb.qty.toFixed(2)}
              </div>
              <div className="text-[11px] font-medium text-emerald-900">如何下单：</div>
              <div className="space-y-1 max-h-[78px] overflow-y-auto overflow-x-hidden pr-1">
                {(moduleArb.steps || []).map((step, idx) => (
                  <div
                    key={`${step.leg1}-${step.leg2}-${idx}`}
                    className="text-[11px] leading-4 text-emerald-900/90 whitespace-normal break-all"
                  >
                    {idx + 1}. {step.leg1} @{(step.price1 * 100).toFixed(1)}c + {step.leg2} @{(step.price2 * 100).toFixed(1)}c，数量 {step.qty.toFixed(2)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {pair.notes && <div className="p-2 bg-muted rounded text-xs text-muted-foreground">备注: {pair.notes}</div>}
      </CardContent>
    </Card>
  );
}

export function PairsList() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [paramsDialogOpen, setParamsDialogOpen] = useState(false);
  const [autoPairDialogOpen, setAutoPairDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [realtimeViews, setRealtimeViews] = useState<Record<string, RealtimePairCardView>>({});
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [panelOutcome, setPanelOutcome] = useState<Record<string, { poly: OutcomeTab; predict: OutcomeTab }>>({});
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const [gridViewportHeight, setGridViewportHeight] = useState(760);
  const [gridColumns, setGridColumns] = useState(3);
  const [gridScrollTop, setGridScrollTop] = useState(0);
  const lastSyncSignatureRef = useRef('');

  const { pairs, removePair, calculatePairStatus, initialPairingMarket, setInitialPairingMarket } = usePairStore();
  const { markets, isLoadingMarkets } = useMarketStore();
  const { settings } = useSettingsStore();
  const { addFrozenCard } = useArbitrageNotificationStore();

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (initialPairingMarket && !isLoading) {
      setCreateDialogOpen(true);
    }
  }, [initialPairingMarket, isLoading]);

  const pairStatuses = useMemo(() => {
    return pairs
      .map((pair) => {
        const predictMarket = markets.find((m) => m.id === pair.predictMarketId);
        const polymarket = markets.find((m) => m.id === pair.polymarketId);
        return calculatePairStatus(pair, predictMarket, polymarket, settings.filters);
      })
      .sort((a, b) => b.currentRoi - a.currentRoi);
  }, [pairs, markets, calculatePairStatus, settings.filters]);

  const desiredMonitorConfigs = useMemo(() => {
    return pairStatuses
      .filter((s) => s.pair.isActive)
      .map((s) => {
        const predictId = s.predictMarket?.sourceId ? String(s.predictMarket.sourceId) : '';
        const polyIds = s.polymarketMarket?.clobTokenIds || [];
        const monitorParams = s.pair.monitorParams ?? {
          predictFeeRate: 0.002,
          polymarketFeeRate: 0.002,
          minProfitPercent: s.pair.minProfitAlert ?? 2,
        };

        return {
          cardId: s.pair.id,
          predictMarketId: predictId,
          polyYesTokenId: String(polyIds[0] || ''),
          polyNoTokenId: String(polyIds[1] || ''),
          params: {
            feeBps: Math.round((monitorParams.predictFeeRate + monitorParams.polymarketFeeRate) * 10000),
            slippageBps: 0,
            minProfit: monitorParams.minProfitPercent / 100,
            minDepth: 0,
          },
        };
      })
      .filter((x) => x.predictMarketId && x.polyYesTokenId && x.polyNoTokenId);
  }, [pairStatuses]);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const result = await apiClient.getRealtimePairCards();
        const map: Record<string, RealtimePairCardView> = {};
        (result.data || []).forEach((item: RealtimePairCardView) => {
          map[item.cardId] = item;
        });
        setRealtimeViews(map);
      } catch {
        // ignore polling errors
      }
    }, 2500);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!settings.apiKeys.predictFun) return;

    const signature = JSON.stringify(desiredMonitorConfigs);
    if (signature === lastSyncSignatureRef.current) return;

    const sync = async () => {
      try {
        const current = await apiClient.getRealtimePairCards();
        const currentIds = new Set((current.data || []).map((x: any) => x.cardId));
        const desiredIds = new Set(desiredMonitorConfigs.map((x) => x.cardId));

        for (const cfg of desiredMonitorConfigs) {
          await apiClient.startRealtimePairMonitor({
            cardId: cfg.cardId,
            predictMarketId: cfg.predictMarketId,
            polymarketYesTokenId: cfg.polyYesTokenId,
            polymarketNoTokenId: cfg.polyNoTokenId,
            predictApiKey: settings.apiKeys.predictFun || undefined,
            params: cfg.params,
          });
        }

        for (const id of currentIds) {
          if (!desiredIds.has(id)) {
            await apiClient.stopRealtimePairMonitor(id);
          }
        }

        lastSyncSignatureRef.current = signature;
      } catch (error) {
        console.error('Failed to sync realtime monitor cards:', error);
      }
    };

    void sync();
  }, [desiredMonitorConfigs, settings.apiKeys.predictFun]);

  useEffect(() => {
    if (!pairStatuses.length) return;

    pairStatuses.forEach((status) => {
      const view = realtimeViews[status.pair.id];
      const result = view?.arbResult;
      if (!result?.hasOpportunity) return;

      addFrozenCard({
        pairId: status.pair.id,
        capturedAt: Date.now(),
        opportunityCount: status.pair.opportunityCount,
        lastCheckAt: status.pair.lastCheckAt,
        minProfitAlert: status.pair.minProfitAlert,
        predictFeeRate: (status.pair.monitorParams?.predictFeeRate ?? 0.002),
        polymarketFeeRate: (status.pair.monitorParams?.polymarketFeeRate ?? 0.002),
        predictTitle: status.predictMarket?.title || status.pair.predictTitle,
        predictParentTitle: status.predictMarket?.parentTitle,
        predictUrl: status.predictMarket?.url,
        polymarketTitle: status.polymarketMarket?.title || status.pair.polymarketTitle,
        polymarketParentTitle: status.polymarketMarket?.parentTitle,
        polymarketUrl: status.polymarketMarket?.url,
        profitRate: result.profitRate,
        netProfit: result.netProfit,
        qty: result.qty,
        strategy: result.strategy,
        reason: result.reason,
        steps: (result.steps || []).map((s) => ({
          qty: s.qty,
          leg1: s.leg1,
          leg2: s.leg2,
          price1: s.price1,
          price2: s.price2,
        })),
      });
    });
  }, [pairStatuses, realtimeViews, addFrozenCard]);

  const activeCount = pairStatuses.filter((s) => s.pair.isActive).length;
  const expandedStatus = expandedCardId ? pairStatuses.find((s) => s.pair.id === expandedCardId) : undefined;
  const gridStatuses = expandedCardId ? pairStatuses.filter((s) => s.pair.id !== expandedCardId) : pairStatuses;
  const cardHeight = 560;
  const rowGap = 16;
  const rowHeight = cardHeight + rowGap;

  useEffect(() => {
    const updateGridLayout = () => {
      const width = gridContainerRef.current?.clientWidth || window.innerWidth;
      const nextColumns = width >= 1280 ? 3 : width >= 768 ? 2 : 1;
      setGridColumns(nextColumns);
      setGridViewportHeight(Math.max(520, window.innerHeight - (expandedStatus ? 420 : 300)));
    };

    updateGridLayout();
    window.addEventListener('resize', updateGridLayout);
    return () => window.removeEventListener('resize', updateGridLayout);
  }, [expandedStatus]);

  const gridRows = useMemo(() => {
    const grouped: PairedMarketStatus[][] = [];
    for (let i = 0; i < gridStatuses.length; i += gridColumns) {
      grouped.push(gridStatuses.slice(i, i + gridColumns));
    }
    return grouped;
  }, [gridStatuses, gridColumns]);

  const visibleRowRange = useMemo(() => {
    const overscan = 2;
    const start = Math.max(0, Math.floor(gridScrollTop / rowHeight) - overscan);
    const end = Math.min(
      gridRows.length,
      Math.ceil((gridScrollTop + gridViewportHeight) / rowHeight) + overscan
    );
    return { start, end };
  }, [gridScrollTop, rowHeight, gridRows.length, gridViewportHeight]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">我的套利配对</h2>
          <p className="text-sm text-muted-foreground">{pairs.length} 个配对，{activeCount} 个监控中</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setAutoPairDialogOpen(true)}>自动配对</Button>
          <Button variant="outline" onClick={() => setParamsDialogOpen(true)}>修改参数</Button>
          <Button onClick={() => setCreateDialogOpen(true)}>创建配对</Button>
        </div>
      </div>

      {pairs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border rounded-lg border-dashed">
          <p className="mb-2">还没有配对</p>
          <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>创建第一个配对</Button>
        </div>
      )}

      {(isLoading || isLoadingMarkets) && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!isLoading && !isLoadingMarkets && pairs.length > 0 && (
        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {expandedStatus && (
              <motion.div
                key={`expanded-${expandedStatus.pair.id}`}
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="flex flex-col xl:flex-row items-stretch gap-4">
                  <div className="w-full max-w-[390px]">
                    <PairCard
                      status={expandedStatus}
                      realtimeView={realtimeViews[expandedStatus.pair.id]}
                      expanded
                      onToggleDepth={() => setExpandedCardId(null)}
                      onRemove={async () => {
                        if (!confirm('确定要删除这个配对吗？')) return;
                        try {
                          await apiClient.stopRealtimePairMonitor(expandedStatus.pair.id);
                        } catch {
                          // ignore
                        }
                        removePair(expandedStatus.pair.id);
                        setExpandedCardId((prev) => (prev === expandedStatus.pair.id ? null : prev));
                      }}
                    />
                  </div>
                  <motion.div
                    initial={{ opacity: 0, x: 56 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 56 }}
                    transition={{ duration: 1, ease: 'easeInOut' }}
                    className="xl:flex-1"
                  >
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                      <OrderbookPanel
                        title="Polymarket 订单簿"
                        yesBook={realtimeViews[expandedStatus.pair.id]?.snapshot?.poly?.yes}
                        noBook={realtimeViews[expandedStatus.pair.id]?.snapshot?.poly?.no}
                        activeOutcome={panelOutcome[expandedStatus.pair.id]?.poly ?? 'yes'}
                        onOutcomeChange={(next) =>
                          setPanelOutcome((prev) => ({
                            ...prev,
                            [expandedStatus.pair.id]: { poly: next, predict: prev[expandedStatus.pair.id]?.predict ?? 'yes' },
                          }))
                        }
                      />
                      <OrderbookPanel
                        title="Predict 订单簿"
                        yesBook={realtimeViews[expandedStatus.pair.id]?.snapshot?.predict?.yes}
                        noBook={realtimeViews[expandedStatus.pair.id]?.snapshot?.predict?.no}
                        activeOutcome={panelOutcome[expandedStatus.pair.id]?.predict ?? 'yes'}
                        onOutcomeChange={(next) =>
                          setPanelOutcome((prev) => ({
                            ...prev,
                            [expandedStatus.pair.id]: { poly: prev[expandedStatus.pair.id]?.poly ?? 'yes', predict: next },
                          }))
                        }
                      />
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={gridContainerRef} className="w-full">
            <div
              ref={gridScrollRef}
              className="overflow-auto"
              style={{ height: gridViewportHeight }}
              onScroll={(e) => setGridScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
            >
              <div style={{ height: gridRows.length * rowHeight, position: 'relative' }}>
                {gridRows.slice(visibleRowRange.start, visibleRowRange.end).map((rowItems, offset) => {
                  const index = visibleRowRange.start + offset;
                  return (
                    <div
                      key={`pair-row-${index}`}
                      style={{
                        position: 'absolute',
                        top: index * rowHeight,
                        left: 0,
                        right: 0,
                        height: rowHeight,
                      }}
                    >
                      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}>
                        {rowItems.map((s: PairedMarketStatus) => (
                          <div key={s.pair.id} className="w-full max-w-[390px]">
                            <PairCard
                              status={s}
                              realtimeView={realtimeViews[s.pair.id]}
                              expanded={false}
                              onToggleDepth={() => {
                                const cardId = s.pair.id;
                                setExpandedCardId((prev) => (prev === cardId ? null : cardId));
                                setPanelOutcome((cur) => ({
                                  ...cur,
                                  [cardId]: cur[cardId] ?? { poly: 'yes', predict: 'yes' },
                                }));
                              }}
                              onRemove={async () => {
                                if (!confirm('确定要删除这个配对吗？')) return;
                                try {
                                  await apiClient.stopRealtimePairMonitor(s.pair.id);
                                } catch {
                                  // ignore
                                }
                                removePair(s.pair.id);
                                setExpandedCardId((prev) => (prev === s.pair.id ? null : prev));
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <CreatePairDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) setInitialPairingMarket(null);
        }}
        preselectedMarket={initialPairingMarket}
      />

      <AutoPairDialog open={autoPairDialogOpen} onOpenChange={setAutoPairDialogOpen} />
      <PairMonitorParamsDialog open={paramsDialogOpen} onOpenChange={setParamsDialogOpen} />
    </div>
  );
}

