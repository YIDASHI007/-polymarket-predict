import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useArbitrageNotificationStore } from '@/stores/arbitrageNotificationStore';
import type { FrozenArbitrageStep } from '@/stores/arbitrageNotificationStore';
import { formatRelativeTime } from '@/utils/formatters';

function fmtPercent(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

export function ArbitrageNotifications() {
  const { cards, clearAll, removeCard } = useArbitrageNotificationStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);
  const [viewportHeight, setViewportHeight] = useState(760);
  const [scrollTop, setScrollTop] = useState(0);
  const cardHeight = 560;
  const rowGap = 16;
  const rowHeight = cardHeight + rowGap;

  useEffect(() => {
    const updateLayout = () => {
      const width = containerRef.current?.clientWidth || window.innerWidth;
      setColumns(width >= 1280 ? 3 : width >= 768 ? 2 : 1);
      setViewportHeight(Math.max(520, window.innerHeight - 260));
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  const rows = useMemo(() => {
    const grouped: typeof cards[] = [];
    for (let i = 0; i < cards.length; i += columns) {
      grouped.push(cards.slice(i, i + columns));
    }
    return grouped;
  }, [cards, columns]);

  const visibleRowRange = useMemo(() => {
    const overscan = 2;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);
    return { start, end };
  }, [scrollTop, rowHeight, rows.length, viewportHeight]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">套利通知</h2>
          <p className="text-sm text-muted-foreground">已冻结 {cards.length} 条机会（上限 100）</p>
        </div>
        <Button variant="outline" onClick={clearAll} disabled={cards.length === 0}>
          清空通知
        </Button>
      </div>

      {cards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border rounded-lg border-dashed">
          <p className="mb-2">暂无套利通知</p>
          <p className="text-sm">当“我的配对”检测到可执行套利机会后，这里会冻结保留对应卡片。</p>
        </div>
      )}

      {cards.length > 0 && (
        <div ref={containerRef} className="w-full">
          <div
            ref={scrollRef}
            className="overflow-auto"
            style={{ height: viewportHeight }}
            onScroll={(e) => setScrollTop((e.currentTarget as HTMLDivElement).scrollTop)}
          >
            <div style={{ height: rows.length * rowHeight, position: 'relative' }}>
              {rows.slice(visibleRowRange.start, visibleRowRange.end).map((rowItems, offset) => {
                const index = visibleRowRange.start + offset;
                return (
                  <div
                    key={`notice-row-${index}`}
                    style={{
                      position: 'absolute',
                      top: index * rowHeight,
                      left: 0,
                      right: 0,
                      height: rowHeight,
                    }}
                  >
                    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                      {rowItems.map((card: any) => (
            <Card key={card.pairId} className="transition-all h-[560px] border-green-500/50 bg-green-50/30">
              <CardContent className="p-3 h-full flex flex-col gap-3">
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <Badge variant="secondary" className="shrink-0 bg-emerald-100 text-emerald-700">
                      Predict
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold line-clamp-1" title={card.predictParentTitle || card.predictTitle}>
                        {card.predictParentTitle || card.predictTitle}
                      </p>
                      {card.predictParentTitle && (
                        <p className="text-xs text-muted-foreground line-clamp-1" title={card.predictTitle}>
                          {card.predictTitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-center text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  </div>

                  <div className="flex items-start gap-2">
                    <Badge variant="secondary" className="shrink-0 bg-purple-100 text-purple-700">
                      Polymarket
                    </Badge>
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold line-clamp-1" title={card.polymarketParentTitle || card.polymarketTitle}>
                        {card.polymarketParentTitle || card.polymarketTitle}
                      </p>
                      {card.polymarketParentTitle && (
                        <p className="text-xs text-muted-foreground line-clamp-1" title={card.polymarketTitle}>
                          {card.polymarketTitle}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>发现 {card.opportunityCount ?? 0} 次机会</span>
                    <span>提醒阈值: {(card.minProfitAlert ?? 2).toFixed(0)}%</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground mt-1">
                    <span>{card.lastCheckAt ? `更新: ${formatRelativeTime(card.lastCheckAt)}` : `更新: ${formatRelativeTime(card.capturedAt)}`}</span>
                    <span>模块套利 {fmtPercent(card.profitRate)}</span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs grid grid-cols-3 gap-2">
                  <span>市场1费率: {((card.predictFeeRate ?? 0.002) * 100).toFixed(2)}%</span>
                  <span>市场2费率: {((card.polymarketFeeRate ?? 0.002) * 100).toFixed(2)}%</span>
                  <span>最低利润率: {(card.minProfitAlert ?? 2).toFixed(2)}%</span>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => card.predictUrl && window.open(card.predictUrl, '_blank')}
                  >
                    Predict.fun
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => card.polymarketUrl && window.open(card.polymarketUrl, '_blank')}
                  >
                    Polymarket
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs" disabled>
                    盘口详情
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => removeCard(card.pairId)}
                  >
                    删除
                  </Button>
                </div>

                <div className="rounded-xl border border-emerald-300 bg-emerald-50/70 p-3 text-xs min-h-[92px]">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-emerald-800">发现套利机会</span>
                      <span className="font-semibold text-emerald-700">{fmtPercent(card.profitRate)}</span>
                    </div>
                    <div className="text-[11px] text-emerald-900/80">
                      净利润 ${card.netProfit.toFixed(2)} | 数量 {card.qty.toFixed(2)}
                    </div>
                    <div className="text-[11px] font-medium text-emerald-900">如何下单：</div>
                    <div className="space-y-1 max-h-[78px] overflow-y-auto overflow-x-hidden pr-1">
                      {card.steps.slice(0, 8).map((step: FrozenArbitrageStep, idx: number) => (
                        <div key={`${card.pairId}-${idx}`} className="text-[11px] leading-4 text-emerald-900/90 whitespace-normal break-all">
                          {idx + 1}. {step.leg1} @{(step.price1 * 100).toFixed(1)}c + {step.leg2} @{(step.price2 * 100).toFixed(1)}c，数量 {step.qty.toFixed(2)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
                    ))}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
