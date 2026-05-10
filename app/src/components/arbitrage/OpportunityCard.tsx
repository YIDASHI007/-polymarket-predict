// 单个套利机会卡片 —— 把 ArbOpportunityDTO 翻译成人能看懂的交易指令。

import type { ArbLegDTO, ArbOpportunityDTO } from '@/api/arbitrageV2';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  readonly opp: ArbOpportunityDTO;
  readonly onClick?: () => void;
}

const strategyLabel: Record<ArbOpportunityDTO['strategy'], string> = {
  buy_poly_yes_and_predict_no: 'Poly YES + Predict NO',
  buy_poly_no_and_predict_yes: 'Poly NO + Predict YES',
};

const confidenceColor: Record<ArbOpportunityDTO['confidence'], string> = {
  high: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30',
  low: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 ring-1 ring-slate-500/30',
};

function LegLine({ leg, index }: { leg: ArbLegDTO; index: number }) {
  const venueName = leg.venue === 'polymarket' ? 'Polymarket' : 'Predict.fun';
  const venueColor =
    leg.venue === 'polymarket'
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-purple-600 dark:text-purple-400';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-muted font-mono text-[10px]">
        {index}
      </span>
      <span className={cn('font-medium', venueColor)}>{venueName}</span>
      <span className="text-muted-foreground">买入</span>
      <span className="uppercase font-semibold">{leg.outcome}</span>
      <span className="text-muted-foreground">@</span>
      <span className="font-mono">{leg.avgPrice.toFixed(4)}</span>
      <span className="text-muted-foreground">×</span>
      <span className="font-mono">{leg.shares.toFixed(1)} 股</span>
      {leg.slippageBps > 1 && (
        <span className="text-muted-foreground">
          (滑点 {leg.slippageBps.toFixed(1)} bps)
        </span>
      )}
    </div>
  );
}

export function OpportunityCard({ opp, onClick }: Props) {
  const roiStrong = opp.roiPct >= 2;
  const expiringSoon = opp.expiresAt - Date.now() < 10_000;

  return (
    <Card
      className={cn(
        'transition-all cursor-pointer hover:shadow-lg',
        roiStrong && 'ring-2 ring-emerald-500/40'
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium line-clamp-2" title={opp.title}>
              {opp.title}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {strategyLabel[opp.strategy]}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div
              className={cn(
                'text-2xl font-bold tabular-nums',
                roiStrong ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
              )}
            >
              +{opp.roiPct.toFixed(2)}%
            </div>
            <div className="text-[10px] text-muted-foreground">
              年化 {opp.annualizedRoiPct.toFixed(1)}%
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* 经济指标 */}
        <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
          <div>
            <div className="text-muted-foreground">可套利份数</div>
            <div className="font-mono font-medium">{opp.shares.toFixed(0)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">投入成本</div>
            <div className="font-mono font-medium">${opp.totalCost.toFixed(0)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">净利</div>
            <div className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
              +${opp.netProfit.toFixed(2)}
            </div>
          </div>
        </div>

        {/* 两条腿 */}
        <div className="space-y-1.5">
          <LegLine leg={opp.legs[0]} index={1} />
          <LegLine leg={opp.legs[1]} index={2} />
        </div>

        {/* 费用拆解 + 底部元信息 */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span title="交易费 + Gas + 资金占用">
            费用 ${opp.costs.total.toFixed(2)}
            {' '}(交易 ${opp.costs.tradingFees.toFixed(2)} / 资金 ${opp.costs.fundingCost.toFixed(2)})
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn('text-[10px] h-5', confidenceColor[opp.confidence])}>
              {opp.confidence === 'high' ? '高' : opp.confidence === 'medium' ? '中' : '低'}
            </Badge>
            {expiringSoon && (
              <span className="text-amber-600 dark:text-amber-400">即将失效</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
