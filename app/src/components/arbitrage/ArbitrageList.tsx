// 套利机会列表组件

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMarketStore } from '@/stores/marketStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { 
  formatPrice, 
  formatPercent, 
  formatVolume,
  formatRelativeTime,
  getArbitrageLevel,
  getArbitrageLevelStyles,
  getPlatformName,
  getConfidenceLabel,
  getConfidenceColor,
} from '@/utils/formatters';
import { cn } from '@/lib/utils';
import type { ArbitrageOpportunity } from '@/types';

// 套利卡片组件
function ArbitrageCard({ opportunity }: { opportunity: ArbitrageOpportunity }) {
  const level = getArbitrageLevel(opportunity.roi);
  const styles = getArbitrageLevelStyles(level);
  
  return (
    <Card className={cn(
      "border-2 transition-all hover:shadow-lg",
      styles.borderColor,
      styles.bgColor
    )}>
      <CardContent className="p-4">
        {/* 头部：标题和利润率 */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge className={cn("text-xs", styles.textColor, "bg-white/50 dark:bg-black/20")}>
                {styles.label}
              </Badge>
              <span className={cn("text-xs", getConfidenceColor(opportunity.confidence))}>
                {getConfidenceLabel(opportunity.confidence)}
              </span>
            </div>
            <h3 className="font-medium text-sm" title={opportunity.title}>
              {opportunity.title}
            </h3>
          </div>
          <div className="text-right">
            <div className={cn("text-2xl font-bold", styles.textColor)}>
              {formatPercent(opportunity.roi)}
            </div>
            <div className="text-xs text-muted-foreground">
              净利润 {formatPercent(opportunity.netProfit)}
            </div>
          </div>
        </div>
        
        {/* 套利方案 */}
        <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <span className="text-xs text-muted-foreground">买入</span>
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "mt-1",
                    opportunity.buyPlatform === 'predict' 
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                  )}
                >
                  {getPlatformName(opportunity.buyPlatform)}
                </Badge>
              </div>
              <div className="text-lg font-semibold">
                {formatPrice(opportunity.buyPrice)}
              </div>
            </div>
            
            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-center">
                <span className="text-xs text-muted-foreground">卖出</span>
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "mt-1",
                    opportunity.sellPlatform === 'predict' 
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                  )}
                >
                  {getPlatformName(opportunity.sellPlatform)}
                </Badge>
              </div>
              <div className="text-lg font-semibold">
                {formatPrice(opportunity.sellPrice)}
              </div>
            </div>
          </div>
          
          {/* 价差 */}
          <div className="mt-2 pt-2 border-t text-center">
            <span className="text-sm">
              价差: <span className="font-semibold">{formatPrice(opportunity.priceDiff)}</span>
              <span className="text-muted-foreground ml-1">({formatPercent(opportunity.priceDiffPercent)})</span>
            </span>
          </div>
        </div>
        
        {/* 底部信息 */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
          <div className="flex items-center gap-4">
            <span>建议金额: {formatVolume(opportunity.recommendedAmount)}</span>
            <span>类型: {opportunity.tokenType}</span>
          </div>
          <span>发现于 {formatRelativeTime(opportunity.detectedAt)}</span>
        </div>
        
        {/* 操作按钮 */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={() => {
              // Predict.fun 使用 /market/{numericId} 格式，会自动重定向到正确的 slug
              const url = opportunity.predictMarket.url 
                || `https://predict.fun/market/${opportunity.predictMarket.sourceId}`;
              console.log('[ArbitrageList] Opening Predict.fun URL:', url);
              window.open(url, '_blank');
            }}
          >
            Predict.fun
            <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={() => {
              // Polymarket 使用 /event/{slug} 格式
              const url = opportunity.polymarketMarket.url 
                || `https://polymarket.com/event/${opportunity.polymarketMarket.sourceId}`;
              console.log('[ArbitrageList] Opening Polymarket URL:', url);
              window.open(url, '_blank');
            }}
          >
            Polymarket
            <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// 统计卡片组件
function StatCard({ 
  label, 
  value, 
  subValue, 
  color = 'blue' 
}: { 
  label: string; 
  value: string | number; 
  subValue?: string;
  color?: 'blue' | 'green' | 'orange' | 'red';
}) {
  const colorStyles = {
    blue: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
    green: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
    orange: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800',
    red: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800',
  };
  
  return (
    <Card className={cn("border", colorStyles[color])}>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {subValue && (
          <div className="text-xs text-muted-foreground mt-1">{subValue}</div>
        )}
      </CardContent>
    </Card>
  );
}

// 无数据提示组件
function EmptyArbitrageState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <svg className="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="mb-2">暂无套利机会</p>
      <p className="text-sm text-muted-foreground/70 mb-4 max-w-md text-center">
        系统正在实时监控两个平台的价格差异。当发现套利机会时将自动显示。
      </p>
      <Button variant="outline" onClick={onRefresh}>
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        立即扫描
      </Button>
    </div>
  );
}

// 主组件
export function ArbitrageList() {
  const { 
    arbitrageOpportunities, 
    isLoadingArbitrage,
    stats,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    getFilteredArbitrage,
    fetchArbitrageOpportunities,
  } = useMarketStore();
  
  const { settings } = useSettingsStore();
  const apiKey = settings.apiKeys.predictFun;
  
  const filteredArbitrage = getFilteredArbitrage();
  
  // 按利润率分级统计
  const highCount = arbitrageOpportunities.filter(a => getArbitrageLevel(a?.roi) === 'high').length;
  const mediumCount = arbitrageOpportunities.filter(a => getArbitrageLevel(a?.roi) === 'medium').length;
  const lowCount = arbitrageOpportunities.filter(a => getArbitrageLevel(a?.roi) === 'low').length;
  
  // 处理刷新
  const handleRefresh = () => {
    if (apiKey) {
      fetchArbitrageOpportunities(apiKey);
    }
  };
  
  if (isLoadingArbitrage) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          加载中...
        </div>
      </div>
    );
  }
  
  // 如果没有套利机会，显示空状态
  if (arbitrageOpportunities.length === 0) {
    return <EmptyArbitrageState onRefresh={handleRefresh} />;
  }
  
  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">套利机会</h2>
          <p className="text-sm text-muted-foreground">
            发现 {filteredArbitrage.length} 个套利机会
            <span className="text-xs text-muted-foreground/70 ml-2">
              (来自真实 API 数据)
            </span>
          </p>
        </div>
        
        {/* 排序 */}
        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="排序" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="profit">按利润率</SelectItem>
              <SelectItem value="price">按价差</SelectItem>
              <SelectItem value="time">按发现时间</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            <svg 
              className={cn("w-4 h-4 transition-transform", sortOrder === 'asc' && "rotate-180")} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </Button>
        </div>
      </div>
      
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          label="总机会" 
          value={stats?.totalOpportunities ?? 0} 
          subValue={`平均 ${formatPercent((stats?.avgProfitPercent24h ?? 0) / 100)}`}
          color="blue"
        />
        <StatCard 
          label="高利润" 
          value={highCount} 
          subValue="≥15% 收益率"
          color="red"
        />
        <StatCard 
          label="中利润" 
          value={mediumCount} 
          subValue="5%-15% 收益率"
          color="orange"
        />
        <StatCard 
          label="低利润" 
          value={lowCount} 
          subValue="2%-5% 收益率"
          color="green"
        />
      </div>
      
      {/* 实时更新提示 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
        </span>
        <span>实时监控中</span>
        <span className="text-xs">•</span>
        <span className="text-xs">上次更新: {stats?.lastUpdated ? formatRelativeTime(stats.lastUpdated) : '刚刚'}</span>
      </div>
      
      {/* 套利列表 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredArbitrage.map((opportunity) => (
          <ArbitrageCard key={opportunity.id} opportunity={opportunity} />
        ))}
      </div>
      
      {/* 空状态 - 筛选后无结果 */}
      {filteredArbitrage.length === 0 && arbitrageOpportunities.length > 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <svg className="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>暂套利机会</p>
          <p className="text-sm mt-1">系统正在持续监控中...</p>
        </div>
      )}
    </div>
  );
}
