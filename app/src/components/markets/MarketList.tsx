// 市场列表组件
// @ts-nocheck

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Grid, type GridImperativeAPI, List } from 'react-window';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMarketStore } from '@/stores/marketStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { CreatePairDialog } from '@/components/pairs/CreatePairDialog';
import { SkeletonList } from '@/components/common/SkeletonCard';
import { MarketCard } from './MarketCard';
import { 
  formatPrice, 
  formatVolume, 
  formatCountdown,
  getPlatformColor,
  getPlatformBgColor,
} from '@/utils/formatters';
import { cn } from '@/lib/utils';
import type { UnifiedMarket } from '@/types';

// 获取市场外部链接 - 优先使用后端提供的正确链接
function getMarketUrl(market: UnifiedMarket): string {
  // 如果后端提供了正确的 url，直接使用
  if (market.url) {
    return market.url;
  }
  
  // 兼容旧数据，自己拼接链接
  if (market.source === 'predict') {
    // Predict.fun 使用 /market/{numericId} 格式，会自动重定向到正确的 slug
    return `https://predict.fun/market/${market.sourceId}`;
  } else {
    // Polymarket 使用 /event/{slug} 格式
    return `https://polymarket.com/event/${market.sourceId}`;
  }
}

// 无数据提示组件
function EmptyMarketState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <svg className="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="mb-2">暂无市场数据</p>
      <p className="text-sm text-muted-foreground/70 mb-4">
        数据将从真实 API 获取，请确保 API Key 配置正确
      </p>
      <Button variant="outline" onClick={onRefresh}>
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        重新加载
      </Button>
    </div>
  );
}

// 主组件
export function MarketList() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [createPairOpen, setCreatePairOpen] = useState(false);
  const [preselectedMarket, setPreselectedMarket] = useState<UnifiedMarket | null>(null);
  
  const { 
    markets, 
    isLoadingMarkets, 
    searchQuery, 
    setSearchQuery,
    selectedPlatform,
    setSelectedPlatform,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    getFilteredMarkets,
    fetchMarkets,
  } = useMarketStore();
  
  const { settings } = useSettingsStore();
  const apiKey = settings.apiKeys.predictFun;
  
  const filteredMarkets = getFilteredMarkets();
  
  // 计算类别统计（基于真实数据）
  const categories = [
    { id: 'all', label: '全部', count: markets.length },
    { id: 'crypto', label: '加密货币', count: markets.filter(m => m.categorySlug === 'crypto').length },
    { id: 'politics', label: '政治', count: markets.filter(m => m.categorySlug === 'politics').length },
    { id: 'tech', label: '科技', count: markets.filter(m => m.categorySlug === 'tech').length },
    { id: 'sports', label: '体育', count: markets.filter(m => m.categorySlug === 'sports').length },
  ];
  
  // 处理刷新
  const handleRefresh = () => {
    if (apiKey) {
      fetchMarkets(apiKey);
    }
  };
  
  if (isLoadingMarkets) {
    return (
      <div className="space-y-4">
        {/* 标题骨架 */}
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-32 bg-muted rounded animate-pulse" />
            <div className="h-4 w-48 bg-muted rounded mt-2 animate-pulse" />
          </div>
        </div>
        
        {/* 骨架屏网格 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonList count={6} />
        </div>
      </div>
    );
  }
  
  // 如果没有市场数据，显示空状态
  if (markets.length === 0) {
    return <EmptyMarketState onRefresh={handleRefresh} />;
  }
  
  return (
    <div className="space-y-4">
      {/* 标题和统计 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">市场列表</h2>
          <p className="text-sm text-muted-foreground">
            共 {filteredMarkets.length} 个市场
            {markets.length > 0 && (
              <span className="text-xs text-muted-foreground/70 ml-2">
                (来自真实 API 数据)
              </span>
            )}
          </p>
        </div>
        
        {/* 视图切换 */}
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'grid' | 'list')}>
          <TabsList className="h-8">
            <TabsTrigger value="grid" className="px-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </TabsTrigger>
            <TabsTrigger value="list" className="px-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      
      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 搜索 */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <Input
            placeholder="搜索市场..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        {/* 平台筛选 */}
        <Select value={selectedPlatform} onValueChange={(v) => setSelectedPlatform(v as any)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="平台" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部平台</SelectItem>
            <SelectItem value="predict">Predict.fun</SelectItem>
            <SelectItem value="polymarket">Polymarket</SelectItem>
          </SelectContent>
        </Select>
        
        {/* 排序 - 只保留按总交易量 */}
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="排序" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="volumeTotal">按总交易量</SelectItem>
          </SelectContent>
        </Select>
        
        {/* 排序方向 - 默认从大到小 */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          title={sortOrder === 'asc' ? '升序' : '降序'}
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
      
      {/* 类别标签 */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <Button
            key={cat.id}
            variant={cat.id === 'all' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
          >
            {cat.label}
            <span className="ml-1 text-muted-foreground">({cat.count})</span>
          </Button>
        ))}
      </div>
      
      {/* 市场列表 - 虚拟滚动 */}
      {viewMode === 'grid' ? (
        <VirtualMarketGrid 
          markets={filteredMarkets}
          onSelectForPair={(m) => {
            setPreselectedMarket(m);
            setCreatePairOpen(true);
          }}
        />
      ) : (
        <VirtualMarketList markets={filteredMarkets} />
      )}
      
      {/* 空状态 - 筛选后无结果 */}
      {filteredMarkets.length === 0 && markets.length > 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <svg className="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>没有找到符合条件的市场</p>
          <Button 
            variant="link" 
            onClick={() => {
              setSearchQuery('');
              setSelectedPlatform('all');
            }}
          >
            清除筛选条件
          </Button>
        </div>
      )}
      
      {/* 创建配对对话框 */}
      <CreatePairDialog 
        open={createPairOpen} 
        onOpenChange={setCreatePairOpen}
        preselectedMarket={preselectedMarket}
      />
    </div>
  );
}

// 虚拟滚动网格组件
interface VirtualMarketGridProps {
  markets: UnifiedMarket[];
  onSelectForPair: (market: UnifiedMarket) => void;
}

// 卡片高度配置
const CARD_HEIGHT = 330; // 卡片高度（增加空间确保按钮显示完整）

function VirtualMarketGrid({ markets, onSelectForPair }: VirtualMarketGridProps) {
  const gridRef = useRef<GridImperativeAPI>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  
  // 计算列数（响应式）
  const columnCount = containerWidth >= 1024 ? 2 : 1;
  const rowCount = Math.ceil(markets.length / columnCount);
  
  // 监听容器尺寸变化
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
        setContainerHeight(containerRef.current.clientHeight);
      }
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);
  
  // 筛选变化时滚动到顶部
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.scrollToRow({ index: 0 });
    }
  }, [markets.length]);
  
  // 单元格渲染组件
  const CellComponent = useCallback(({ 
    columnIndex, 
    rowIndex, 
    style,
    markets: cellMarkets,
    onSelectForPair: cellOnSelect
  }: any) => {
    const index = rowIndex * columnCount + columnIndex;
    const market = cellMarkets[index];
    
    if (!market) return null;
    
    return (
      <div style={style} className="p-2">
        <MarketCard 
          market={market} 
          onSelectForPair={cellOnSelect}
        />
      </div>
    );
  }, [columnCount]);
  
  // 加载中状态
  if (containerWidth === 0) {
    return (
      <div ref={containerRef} className="h-[calc(100vh-300px)] min-h-[400px]">
        <SkeletonList count={4} />
      </div>
    );
  }
  
  // 空状态处理
  if (markets.length === 0) {
    return (
      <div ref={containerRef} className="h-[calc(100vh-300px)] min-h-[400px] flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-lg mb-2">暂无市场数据</p>
          <p className="text-sm">请尝试切换筛选条件或刷新页面</p>
        </div>
      </div>
    );
  }
  
  return (
    <div ref={containerRef} className="h-[calc(100vh-300px)] min-h-[400px]">
      <Grid
        gridRef={gridRef}
        columnCount={columnCount}
        columnWidth={containerWidth / columnCount}
        defaultHeight={containerHeight}
        rowCount={rowCount}
        rowHeight={CARD_HEIGHT}
        defaultWidth={containerWidth}
        overscanCount={2}
        cellComponent={CellComponent}
        cellProps={{ markets, onSelectForPair }}
      />
    </div>
  );
}


// ============ 列表视图虚拟滚动组件 ============

interface VirtualMarketListProps {
  markets: UnifiedMarket[];
}

const ROW_HEIGHT = 60; // 列表行高度

// 列表行组件
interface ListRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    markets: UnifiedMarket[];
  };
}

function ListRow({ index, style, data }: ListRowProps) {
  const market = data.markets[index];
  if (!market) return null;

  return (
    <div style={style} className="border-b hover:bg-muted/50 transition-colors">
      <div className="flex items-center h-full px-4">
        {/* 市场信息 */}
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2 mb-1">
            <Badge 
              variant="secondary" 
              className={cn(
                "text-xs font-medium",
                getPlatformBgColor(market.source),
                getPlatformColor(market.source)
              )}
            >
              {market.source === 'predict' ? 'Predict.fun' : 'Polymarket'}
            </Badge>
            <span className="font-medium text-sm truncate">{market.title}</span>
          </div>
          {market.parentTitle && (
            <p className="text-xs text-muted-foreground truncate">{market.parentTitle}</p>
          )}
        </div>

        {/* 价格 */}
        <div className="w-24 text-right text-sm hidden sm:block">
          <div className="text-green-600">{formatPrice(market.yesPrice)}</div>
        </div>
        <div className="w-24 text-right text-sm hidden sm:block">
          <div className="text-red-600">{formatPrice(market.noPrice)}</div>
        </div>

        {/* 交易量 */}
        <div className="w-28 text-right text-sm hidden md:block">
          {formatVolume(market.volume24h)}
        </div>

        {/* 流动性 */}
        <div className="w-28 text-right text-sm hidden lg:block">
          {formatVolume(market.liquidity)}
        </div>

        {/* 剩余时间 */}
        <div className="w-24 text-right text-sm hidden md:block">
          {market.endDate ? formatCountdown(market.endDate) : '-'}
        </div>

        {/* 操作 */}
        <div className="w-20 text-right">
          <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
            <a href={getMarketUrl(market)} target="_blank" rel="noopener noreferrer">
              查看
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

function VirtualMarketList({ markets }: VirtualMarketListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  return (
    <div ref={containerRef} className="border rounded-lg h-[calc(100vh-300px)] min-h-[400px]">
      {/* 表头 */}
      <div className="flex items-center h-10 px-4 bg-muted border-b text-xs font-medium">
        <div className="flex-1">市场</div>
        <div className="w-24 text-right hidden sm:block">Yes价格</div>
        <div className="w-24 text-right hidden sm:block">No价格</div>
        <div className="w-28 text-right hidden md:block">24h交易量</div>
        <div className="w-28 text-right hidden lg:block">流动性</div>
        <div className="w-24 text-right hidden md:block">剩余时间</div>
        <div className="w-20 text-right">操作</div>
      </div>
      
      {/* 虚拟滚动列表 */}
      <List
        height={containerHeight - 40}
        itemCount={markets.length}
        itemSize={ROW_HEIGHT}
        overscanCount={5}
        itemData={{ markets }}
      >
        {ListRow}
      </List>
    </div>
  );
}
