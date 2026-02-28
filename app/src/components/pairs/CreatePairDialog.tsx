import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { usePairStore } from '@/stores/pairStore';
import { useMarketStore } from '@/stores/marketStore';
import { formatPrice, formatVolume } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import type { UnifiedMarket } from '@/types';

interface CreatePairDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedMarket?: UnifiedMarket | null;
}

function formatEndDate(endDate?: string | number): string {
  if (!endDate) return '未知';
  const date = new Date(endDate);
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MarketSelectCard({
  market,
  isSelected,
  disabled,
  onClick,
}: {
  market: UnifiedMarket;
  isSelected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={cn(
        'p-4 rounded-lg border transition-all',
        disabled && 'opacity-45 grayscale cursor-not-allowed bg-muted/40 border-muted',
        isSelected
          ? 'border-primary bg-primary/5 ring-2 ring-primary'
          : !disabled && 'cursor-pointer border-border hover:border-primary/50 hover:bg-muted/50'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className={cn(
              'text-xs font-medium',
              market.source === 'predict'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-purple-100 text-purple-700'
            )}
          >
            {market.source === 'predict' ? 'Predict.fun' : 'Polymarket'}
          </Badge>
          {isSelected && <Badge className="text-xs">已选择</Badge>}
          {disabled && !isSelected && (
            <Badge variant="outline" className="text-xs">
              已配对
            </Badge>
          )}
        </div>
        {market.endDate && (
          <span className="text-xs text-muted-foreground">
            截止: {formatEndDate(market.endDate)}
          </span>
        )}
      </div>

      <h4 className="font-semibold text-sm mb-2 leading-snug" title={market.title}>
        {market.parentTitle ? (
          <>
            <span className="text-base">{market.parentTitle}</span>
            <span className="block text-xs text-muted-foreground mt-1 font-normal">{market.title}</span>
          </>
        ) : (
          market.title
        )}
      </h4>

      {market.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{market.description}</p>
      )}

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="text-green-600 font-medium">Yes:</span>
            <span className="font-mono">{formatPrice(market.yesPrice)}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-red-600 font-medium">No:</span>
            <span className="font-mono">{formatPrice(market.noPrice)}</span>
          </span>
        </div>
        <span className="text-muted-foreground">{formatVolume(market.liquidity)}</span>
      </div>
    </div>
  );
}

function SelectedMarket({
  market,
  onClear,
  label,
}: {
  market: UnifiedMarket;
  onClear: () => void;
  label: string;
}) {
  return (
    <div className="p-4 rounded-lg bg-primary/5 border-2 border-primary">
      <div className="flex items-center justify-between mb-2">
        <Badge
          className={cn(
            'text-xs',
            market.source === 'predict' ? 'bg-emerald-500 hover:bg-emerald-500' : 'bg-purple-500 hover:bg-purple-500'
          )}
        >
          {label}
        </Badge>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClear}>
          清除选择
        </Button>
      </div>
      <h4 className="font-semibold text-sm mb-1">{market.parentTitle || market.title}</h4>
      {market.parentTitle && <p className="text-xs text-muted-foreground mb-2">{market.title}</p>}
      <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-primary/20">
        <div className="flex items-center gap-3">
          <span className="text-green-600 font-medium">Yes: {formatPrice(market.yesPrice)}</span>
          <span className="text-red-600 font-medium">No: {formatPrice(market.noPrice)}</span>
        </div>
        <span className="text-muted-foreground">流动性 {formatVolume(market.liquidity)}</span>
      </div>
    </div>
  );
}

export function CreatePairDialog({ open, onOpenChange, preselectedMarket }: CreatePairDialogProps) {
  const { markets } = useMarketStore();
  const { createPair, hasPair, pairs } = usePairStore();

  const initialPredict = preselectedMarket?.source === 'predict' ? preselectedMarket : null;
  const initialPolymarket = preselectedMarket?.source === 'polymarket' ? preselectedMarket : null;
  const initialStep = initialPredict ? 2 : 1;

  const [step, setStep] = useState<1 | 2>(initialStep);
  const [predictMarket, setPredictMarket] = useState<UnifiedMarket | null>(initialPredict);
  const [polymarket, setPolymarket] = useState<UnifiedMarket | null>(initialPolymarket);
  const [searchQuery, setSearchQuery] = useState('');
  const [notes, setNotes] = useState('');

  const PAGE_SIZE = 20;
  const [predictDisplayCount, setPredictDisplayCount] = useState(PAGE_SIZE);
  const [polymarketDisplayCount, setPolymarketDisplayCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setPredictDisplayCount(PAGE_SIZE);
    setPolymarketDisplayCount(PAGE_SIZE);
  }, [searchQuery]);

  const filteredMarkets = useMemo(() => {
    if (!searchQuery) return markets;
    const query = searchQuery.toLowerCase();
    return markets.filter(
      (m) => m.title.toLowerCase().includes(query) || m.description.toLowerCase().includes(query)
    );
  }, [markets, searchQuery]);

  const predictMarketsAll = useMemo(
    () => filteredMarkets.filter((m) => m.source === 'predict'),
    [filteredMarkets]
  );
  const polymarketMarketsAll = useMemo(
    () => filteredMarkets.filter((m) => m.source === 'polymarket'),
    [filteredMarkets]
  );

  const predictMarkets = useMemo(
    () => predictMarketsAll.slice(0, predictDisplayCount),
    [predictMarketsAll, predictDisplayCount]
  );
  const polymarketMarkets = useMemo(
    () => polymarketMarketsAll.slice(0, polymarketDisplayCount),
    [polymarketMarketsAll, polymarketDisplayCount]
  );

  const loadMorePredict = useCallback(() => {
    setPredictDisplayCount((prev) => Math.min(prev + PAGE_SIZE, predictMarketsAll.length));
  }, [predictMarketsAll.length]);
  const loadMorePolymarket = useCallback(() => {
    setPolymarketDisplayCount((prev) => Math.min(prev + PAGE_SIZE, polymarketMarketsAll.length));
  }, [polymarketMarketsAll.length]);

  const canCreatePair = !!(predictMarket && polymarket);
  const alreadyExists = canCreatePair && hasPair(predictMarket!.id, polymarket!.id);

  const usedPredictMarketIds = useMemo(() => new Set(pairs.map((p) => p.predictMarketId)), [pairs]);
  const usedPolymarketIds = useMemo(() => new Set(pairs.map((p) => p.polymarketId)), [pairs]);

  const resetAndClose = () => {
    setStep(1);
    setPredictMarket(null);
    setPolymarket(null);
    setSearchQuery('');
    setNotes('');
    onOpenChange(false);
  };

  const handleCreate = () => {
    if (!predictMarket || !polymarket) return;
    if (alreadyExists) {
      alert('该配对已存在');
      return;
    }
    createPair(predictMarket, polymarket, notes);
    resetAndClose();
  };

  useEffect(() => {
    if (open && preselectedMarket) {
      if (preselectedMarket.source === 'predict') {
        setPredictMarket(preselectedMarket);
        setStep(2);
      } else {
        setPolymarket(preselectedMarket);
        setStep(1);
      }
    }
  }, [open, preselectedMarket]);

  const handleSelectPredict = (market: UnifiedMarket) => {
    if (usedPredictMarketIds.has(market.id)) return;
    setPredictMarket(market);
    if (!polymarket) setStep(2);
  };

  const handleSelectPolymarket = (market: UnifiedMarket) => {
    if (usedPolymarketIds.has(market.id)) return;
    setPolymarket(market);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && resetAndClose()}>
      <DialogContent className="!w-[60vw] !max-w-none max-h-[90vh] overflow-hidden flex flex-col p-6">
        <DialogHeader>
          <DialogTitle>创建手动配对</DialogTitle>
          <DialogDescription>选择 Predict.fun 和 Polymarket 上的同一事件市场，创建配对进行监控</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 mb-4">
          <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-sm', step === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-medium">1</span>
            <span>选择 Predict.fun 市场</span>
          </div>
          <div className="w-8 h-px bg-border" />
          <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-sm', step === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-medium">2</span>
            <span>选择 Polymarket 市场</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-muted/30 rounded-lg">
          {predictMarket ? (
            <SelectedMarket market={predictMarket} label="Predict.fun" onClear={() => { setPredictMarket(null); setStep(1); }} />
          ) : (
            <div className="p-4 rounded-lg border-2 border-dashed border-muted-foreground/20 text-center">
              <div className="text-sm text-muted-foreground mb-1">Predict.fun</div>
              <div className="text-xs text-muted-foreground/60">请从左侧选择市场</div>
            </div>
          )}
          {polymarket ? (
            <SelectedMarket market={polymarket} label="Polymarket" onClear={() => setPolymarket(null)} />
          ) : (
            <div className="p-4 rounded-lg border-2 border-dashed border-muted-foreground/20 text-center">
              <div className="text-sm text-muted-foreground mb-1">Polymarket</div>
              <div className="text-xs text-muted-foreground/60">请从右侧选择市场</div>
            </div>
          )}
        </div>

        <div className="relative mb-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-sm font-medium text-muted-foreground">搜索同一事件的市场</span>
          </div>
          <Input
            placeholder="输入关键词搜索，如 'BTC'、'Trump'、'Fed'..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10"
          />
        </div>

        <div className="overflow-hidden grid grid-cols-2 gap-4 flex-1 min-h-0">
          <div className="flex flex-col border rounded-lg bg-muted/20 overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b bg-background">
              <h4 className="text-sm font-semibold text-emerald-600">Predict.fun 市场</h4>
              <Badge variant="secondary" className="text-xs">{predictMarkets.length} 个</Badge>
            </div>
            <div className="overflow-y-auto p-3 flex-1" id="predict-scroll">
              <div className="space-y-3">
                {predictMarkets.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">没有找到市场</p>
                ) : (
                  predictMarkets.map((market) => (
                    <MarketSelectCard
                      key={market.id}
                      market={market}
                      isSelected={predictMarket?.id === market.id}
                      disabled={usedPredictMarketIds.has(market.id)}
                      onClick={() => handleSelectPredict(market)}
                    />
                  ))
                )}
                {predictDisplayCount < predictMarketsAll.length && (
                  <div className="text-center py-3">
                    <Button variant="ghost" size="sm" onClick={loadMorePredict} className="text-xs text-muted-foreground">
                      加载更多 ({predictDisplayCount}/{predictMarketsAll.length})
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col border rounded-lg bg-muted/20 overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b bg-background">
              <h4 className="text-sm font-semibold text-purple-600">Polymarket 市场</h4>
              <Badge variant="secondary" className="text-xs">{polymarketMarkets.length} 个</Badge>
            </div>
            <div className="overflow-y-auto p-3 flex-1" id="polymarket-scroll">
              <div className="space-y-3">
                {polymarketMarkets.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">没有找到市场</p>
                ) : (
                  polymarketMarkets.map((market) => (
                    <MarketSelectCard
                      key={market.id}
                      market={market}
                      isSelected={polymarket?.id === market.id}
                      disabled={usedPolymarketIds.has(market.id)}
                      onClick={() => handleSelectPolymarket(market)}
                    />
                  ))
                )}
                {polymarketDisplayCount < polymarketMarketsAll.length && (
                  <div className="text-center py-3">
                    <Button variant="ghost" size="sm" onClick={loadMorePolymarket} className="text-xs text-muted-foreground">
                      加载更多 ({polymarketDisplayCount}/{polymarketMarketsAll.length})
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-none pt-4 border-t mt-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1.5 block">
                配对备注 {canCreatePair && <span className="text-muted-foreground font-normal">（可选）</span>}
              </label>
              <Input
                placeholder={canCreatePair ? '例如：两个市场都关于同一事件，做跨市场监控' : '请先选择两个市场'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-10"
                disabled={!canCreatePair}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm">
                {alreadyExists ? (
                  <span className="text-orange-500">该配对已存在</span>
                ) : canCreatePair ? (
                  <span className="text-green-500">可以创建配对</span>
                ) : (
                  <span className="text-muted-foreground">请选择两个市场完成配对</span>
                )}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetAndClose}>取消</Button>
                <Button onClick={handleCreate} disabled={!canCreatePair || alreadyExists}>创建配对</Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
