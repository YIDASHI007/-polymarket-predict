// 市场卡片组件

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  formatPrice, 
  formatVolume, 
  formatCountdown,
} from '@/utils/formatters';
import { cn } from '@/lib/utils';
import type { UnifiedMarket } from '@/types';

// 平台标签
function PlatformBadge({ platform }: { platform: 'predict' | 'polymarket' }) {
  return (
    <Badge 
      variant="secondary" 
      className={cn(
        "text-xs font-medium",
        platform === 'predict' 
          ? 'bg-emerald-100 text-emerald-700' 
          : 'bg-purple-100 text-purple-700'
      )}
    >
      {platform === 'predict' ? 'Predict.fun' : 'Polymarket'}
    </Badge>
  );
}

// 状态标签
function StatusBadge({ isActive, isTradable }: { isActive: boolean; isTradable: boolean }) {
  if (!isActive || !isTradable) {
    return (
      <Badge variant="outline" className="text-xs text-gray-500">
        已关闭
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs text-green-500 border-green-500">
      交易中
    </Badge>
  );
}

// 价格变化
function PriceChange({ value }: { value: number | undefined | null }) {
  if (value === undefined || value === null || isNaN(value)) {
    return <span className="text-xs text-gray-400">--</span>;
  }
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  const isPositive = numValue >= 0;
  return (
    <span className={cn("text-xs", isPositive ? "text-green-500" : "text-red-500")}>
      {isPositive ? '+' : ''}{numValue.toFixed(2)}
    </span>
  );
}

// 获取市场链接
function getMarketUrl(market: UnifiedMarket): string {
  if (market.url) return market.url;
  if (market.source === 'predict') {
    return `https://predict.fun/market/${market.sourceId}`;
  }
  return `https://polymarket.com/event/${market.sourceId}`;
}

interface MarketCardProps {
  market: UnifiedMarket;
  onSelectForPair?: (market: UnifiedMarket) => void;
}

export function MarketCard({ market, onSelectForPair }: MarketCardProps) {
  return (
    <Card className="hover:shadow-lg transition-all duration-200 h-full flex flex-col overflow-hidden">
      <CardContent className="p-4 flex flex-col h-full">
        
        {/* 1. 顶部：平台标签 + 状态 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <PlatformBadge platform={market.source} />
            <StatusBadge isActive={market.isActive} isTradable={market.isTradable} />
          </div>
          {market.endDate && (
            <span className="text-xs text-muted-foreground">
              {formatCountdown(market.endDate)}
            </span>
          )}
        </div>

        {/* 2. 标题：父标题 + 子标签 */}
        <div className="mb-3">
          {market.parentTitle ? (
            <>
              <h3 className="font-bold text-base text-gray-900 leading-snug break-words mb-1">
                {market.parentTitle}
              </h3>
              <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                {market.title}
              </span>
            </>
          ) : (
            <h3 className="font-bold text-base text-gray-900 leading-snug break-words">
              {market.title}
            </h3>
          )}
        </div>

        {/* 3. 中间：描述 + 价格 左右布局 */}
        <div className="flex gap-4 mb-3 flex-1">
          {/* 左侧：描述 */}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {market.description || 'No description available'}
            </p>
          </div>
          
          {/* 右侧：价格 */}
          <div className="flex gap-3 text-right flex-shrink-0">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Yes</div>
              <div className="text-base font-bold">{formatPrice(market.yesPrice)}</div>
              <PriceChange value={market.yesPriceChange24h} />
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">No</div>
              <div className="text-base font-bold">{formatPrice(market.noPrice)}</div>
              <PriceChange value={market.noPriceChange24h} />
            </div>
          </div>
        </div>

        {/* 4. 统计信息：总交易量、流动性 */}
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mb-3 py-2 border-t border-b border-gray-100">
          <div className="text-center border-r border-gray-100">
            <div className="text-[10px] text-muted-foreground/70 mb-0.5">总交易量</div>
            <div className="font-medium">{formatVolume(market.volumeTotal)}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground/70 mb-0.5">流动性</div>
            <div className="font-medium">{formatVolume(market.liquidity)}</div>
          </div>
        </div>

        {/* 5. 底部按钮 */}
        <div className="flex gap-3 mt-auto">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 h-9 text-xs"
            onClick={() => window.open(getMarketUrl(market), '_blank')}
          >
            查看
            <svg className="w-3 h-3 ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Button>
          {onSelectForPair && (
            <Button 
              variant="secondary" 
              size="sm" 
              className="flex-1 h-9 text-xs"
              onClick={() => onSelectForPair(market)}
            >
              配对
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
