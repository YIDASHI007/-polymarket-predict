// 实时套利板 —— v2 主页面
//
// 功能：
//   1. 顶部状态栏：两家 WS 连接状态 + 订阅 pair 数 + 每秒扫描次数
//   2. 机会列表：实时 SSE 推送，按 ROI 降序排列，空列表时显示引导
//   3. 添加 pair 按钮：打开 AddPairDialog

import { useEffect, useMemo, useState } from 'react';
import { arbitrageApi } from '@/api/arbitrageV2';
import type { ConnectionStateDTO, MarketPairDTO } from '@/api/arbitrageV2';
import { useArbitrageStream } from '@/hooks/useArbitrageStream';
import { OpportunityCard } from './OpportunityCard';
import { AddPairDialog } from './AddPairDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function ConnBadge({ state }: { state: ConnectionStateDTO | undefined }) {
  const venue = state?.venue === 'predict' ? 'Predict.fun' : 'Polymarket';
  const status = state?.status ?? 'idle';
  const okColor =
    status === 'open'
      ? 'bg-emerald-500'
      : status === 'reconnecting' || status === 'connecting'
      ? 'bg-amber-500 animate-pulse'
      : status === 'error'
      ? 'bg-red-500'
      : 'bg-slate-400';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={cn('w-2 h-2 rounded-full', okColor)} />
      <span className="font-medium">{venue}</span>
      <span className="text-muted-foreground">{status}</span>
    </div>
  );
}

function PairRow({
  pair,
  onRemove,
}: {
  pair: MarketPairDTO;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs py-1 border-b last:border-b-0">
      <div className="min-w-0 flex-1 truncate" title={pair.title}>
        {pair.title}
      </div>
      <Badge variant="outline" className="text-[10px] h-5 shrink-0">
        {pair.matchReason === 'manual' ? '手动' : `auto ${(pair.matchConfidence * 100).toFixed(0)}%`}
      </Badge>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-xs text-muted-foreground hover:text-red-500"
        onClick={() => onRemove(pair.pairId)}
      >
        移除
      </Button>
    </div>
  );
}

export function ArbitrageBoard() {
  const { opportunities, state, error, connected, lastEventAt } = useArbitrageStream();
  const [pairs, setPairs] = useState<readonly MarketPairDTO[]>([]);
  const [loadingPairs, setLoadingPairs] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshPairs = async () => {
    setLoadingPairs(true);
    try {
      const r = await arbitrageApi.listPairs();
      setPairs(r.data);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setLoadingPairs(false);
    }
  };

  useEffect(() => {
    void refreshPairs();
  }, []);

  const handleRemove = async (pairId: string) => {
    try {
      await arbitrageApi.unwatchPair(pairId);
      await refreshPairs();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  const handleAdded = async () => {
    setDialogOpen(false);
    await refreshPairs();
  };

  const stats = useMemo(() => {
    return {
      total: opportunities.length,
      highConf: opportunities.filter((o) => o.confidence === 'high').length,
      bestRoi: opportunities[0]?.roiPct ?? 0,
      totalNetProfit: opportunities.reduce((s, o) => s + o.netProfit, 0),
    };
  }, [opportunities]);

  return (
    <div className="space-y-4">
      {/* 标题行 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            实时套利板
            <span className="ml-2 text-xs font-normal text-muted-foreground align-middle">
              Polymarket × Predict.fun
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            WebSocket 实时订阅 · 双 orderbook 同步扫描 · 净利含手续费与资金占用成本
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>+ 添加监控对</Button>
      </div>

      {/* 顶部状态栏 */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <ConnBadge state={state?.polymarket} />
            <ConnBadge state={state?.predict} />
            <div className="h-4 w-px bg-border" />
            <div className="text-xs text-muted-foreground">
              监控对 <span className="font-mono font-semibold text-foreground">{state?.pairs ?? 0}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              活跃机会 <span className="font-mono font-semibold text-foreground">{state?.activeOpportunities ?? 0}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              扫描速率 <span className="font-mono font-semibold text-foreground">{state?.scansPerSecond ?? 0}</span>/s
            </div>
            <div className="ml-auto flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    connected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                  )}
                />
                <span className="text-muted-foreground">
                  {connected ? 'SSE 已连接' : 'SSE 重连中'}
                </span>
              </div>
              {lastEventAt > 0 && (
                <span className="text-muted-foreground">
                  最后事件 {Math.round((Date.now() - lastEventAt) / 1000)}s 前
                </span>
              )}
            </div>
          </div>
          {error && <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">{error}</div>}
        </CardContent>
      </Card>

      {/* 监控对列表 */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-muted-foreground">
              监控中的市场对 ({pairs.length})
            </div>
            {loadingPairs && <div className="text-[10px] text-muted-foreground">刷新中…</div>}
          </div>
          {pairs.length === 0 ? (
            <div className="text-xs text-muted-foreground italic py-2">
              还没有监控对。点击右上角"添加监控对"开始。
            </div>
          ) : (
            <div className="space-y-0">
              {pairs.map((p) => (
                <PairRow key={p.pairId} pair={p} onRemove={handleRemove} />
              ))}
            </div>
          )}
          {actionError && (
            <div className="mt-2 text-xs text-red-600 dark:text-red-400">{actionError}</div>
          )}
        </CardContent>
      </Card>

      {/* 机会列表 */}
      <div>
        <div className="flex items-baseline justify-between mb-3 px-1">
          <h2 className="text-base font-semibold">
            活跃套利机会
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              按 ROI 降序
            </span>
          </h2>
          {opportunities.length > 0 && (
            <div className="text-xs text-muted-foreground">
              共 {stats.total} 个 · 高置信度 {stats.highConf} 个 · 汇总净利 ${stats.totalNetProfit.toFixed(0)}
            </div>
          )}
        </div>

        {opportunities.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              {pairs.length === 0
                ? '还没开始监控任何市场对。添加后，有机会时会实时推送到这里。'
                : '当前没有满足 ROI 门槛的机会。订单簿仍在实时扫描中…'}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {opportunities.map((o) => (
              <OpportunityCard key={o.pairId} opp={o} />
            ))}
          </div>
        )}
      </div>

      {/* 添加对话框 */}
      <AddPairDialog open={dialogOpen} onOpenChange={setDialogOpen} onAdded={handleAdded} />
    </div>
  );
}
