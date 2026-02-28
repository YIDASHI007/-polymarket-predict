import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMarketStore } from '@/stores/marketStore';
import { usePairStore } from '@/stores/pairStore';
import type { UnifiedMarket } from '@/types';

interface AutoPairDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AutoMatchItem {
  predict: UnifiedMarket;
  polymarket: UnifiedMarket;
  endDeltaHours: number | null;
}

function parseTs(dateLike?: string): number | null {
  if (!dateLike) return null;
  const ts = new Date(dateLike).getTime();
  return Number.isFinite(ts) ? ts : null;
}

export function AutoPairDialog({ open, onOpenChange }: AutoPairDialogProps) {
  const { markets } = useMarketStore();
  const { pairs, hasPair, createPair } = usePairStore();

  const [enableIdMatch, setEnableIdMatch] = useState(true);
  const [enableTimeMatch, setEnableTimeMatch] = useState(false);
  const [timeWindowHours, setTimeWindowHours] = useState(24);
  const [matches, setMatches] = useState<AutoMatchItem[]>([]);

  const usedPredict = useMemo(() => new Set(pairs.map((p) => p.predictMarketId)), [pairs]);
  const usedPoly = useMemo(() => new Set(pairs.map((p) => p.polymarketId)), [pairs]);

  const predictMarkets = useMemo(
    () => markets.filter((m) => m.source === 'predict' && !usedPredict.has(m.id)),
    [markets, usedPredict]
  );
  const polymarketMarkets = useMemo(
    () => markets.filter((m) => m.source === 'polymarket' && !usedPoly.has(m.id)),
    [markets, usedPoly]
  );
  const predictWithPolyConditionIds = useMemo(
    () => predictMarkets.filter((m) => (m.polymarketConditionIds || []).length > 0).length,
    [predictMarkets]
  );

  const runAutoMatch = () => {
    if (!enableIdMatch && !enableTimeMatch) {
      alert('请至少选择一种匹配方式');
      return;
    }

    const result: AutoMatchItem[] = [];
    const usedPolyLocal = new Set<string>();

    for (const pm of predictMarkets) {
      const linkedConditionIds = new Set((pm.polymarketConditionIds || []).map((x) => String(x).toLowerCase()));
      let candidates = polymarketMarkets.filter((poly) => !usedPolyLocal.has(poly.id));

      if (enableIdMatch) {
        // If this predict market has no mapped polymarket condition IDs,
        // and time matching is enabled, fallback to time-only matching.
        // If time matching is disabled, this market cannot pass ID matching.
        if (linkedConditionIds.size > 0) {
          candidates = candidates.filter((poly) => linkedConditionIds.has(String(poly.conditionId || '').toLowerCase()));
        } else if (!enableTimeMatch) {
          continue;
        }
      }

      if (enableTimeMatch) {
        const pTs = parseTs(pm.endDate);
        candidates = candidates.filter((poly) => {
          const polyTs = parseTs(poly.endDate);
          if (pTs == null || polyTs == null) return false;
          const deltaHours = Math.abs(pTs - polyTs) / (1000 * 60 * 60);
          return deltaHours <= timeWindowHours;
        });
      }

      if (!candidates.length) continue;

      candidates.sort((a, b) => {
        const pTs = parseTs(pm.endDate);
        const aTs = parseTs(a.endDate);
        const bTs = parseTs(b.endDate);
        const da = pTs != null && aTs != null ? Math.abs(pTs - aTs) : Number.MAX_SAFE_INTEGER;
        const db = pTs != null && bTs != null ? Math.abs(pTs - bTs) : Number.MAX_SAFE_INTEGER;
        if (da !== db) return da - db;
        return (b.liquidity || 0) - (a.liquidity || 0);
      });

      const best = candidates[0];
      const pTs = parseTs(pm.endDate);
      const bTs = parseTs(best.endDate);
      const endDeltaHours = pTs != null && bTs != null ? Math.abs(pTs - bTs) / (1000 * 60 * 60) : null;
      result.push({ predict: pm, polymarket: best, endDeltaHours });
      usedPolyLocal.add(best.id);
    }

    setMatches(result);
  };

  const handleCreateAll = () => {
    let created = 0;
    for (const item of matches) {
      if (hasPair(item.predict.id, item.polymarket.id)) continue;
      createPair(item.predict, item.polymarket, '自动配对');
      created += 1;
    }
    alert(`自动创建完成：${created} 个配对`);
    onOpenChange(false);
    setMatches([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>自动配对</DialogTitle>
          <DialogDescription>
            基于市场缓存元数据自动匹配 Predict 与 Polymarket 同事件市场
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={enableIdMatch} onChange={(e) => setEnableIdMatch(e.target.checked)} />
                ID匹配（polymarketConditionIds → conditionId）
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={enableTimeMatch} onChange={(e) => setEnableTimeMatch(e.target.checked)} />
                结束时间匹配
              </label>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span>时间窗口（小时）</span>
              <input
                className="h-8 w-24 rounded border px-2"
                type="number"
                min={1}
                max={168}
                value={timeWindowHours}
                onChange={(e) => setTimeWindowHours(Math.max(1, Number(e.target.value) || 24))}
                disabled={!enableTimeMatch}
              />
              <span className="text-muted-foreground">例如 24 表示结束时间差 &lt;= 24h</span>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={runAutoMatch}>开始匹配</Button>
              <span className="text-sm text-muted-foreground">
                可匹配池：Predict {predictMarkets.length} / Polymarket {polymarketMarkets.length}
              </span>
              <span className="text-sm text-muted-foreground">
                可做ID匹配的Predict: {predictWithPolyConditionIds}
              </span>
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">匹配结果（{matches.length}）</div>
              <Button onClick={handleCreateAll} disabled={!matches.length}>一键创建配对</Button>
            </div>
            <div className="max-h-80 overflow-auto space-y-2">
              {!matches.length && <div className="text-sm text-muted-foreground">暂无匹配结果</div>}
              {matches.map((m) => (
                <div key={`${m.predict.id}-${m.polymarket.id}`} className="rounded border p-2 text-sm">
                  <div className="font-medium">{m.predict.parentTitle || m.predict.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">Predict: {m.predict.title}</div>
                  <div className="text-xs text-muted-foreground">Polymarket: {m.polymarket.title}</div>
                  <div className="text-xs mt-1">
                    条件ID匹配: {String((m.predict.polymarketConditionIds || []).includes(m.polymarket.conditionId))}
                    {' | '}
                    结束时间差: {m.endDeltaHours == null ? '--' : `${m.endDeltaHours.toFixed(2)}h`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
