// 分页市场列表 - 按需加载，滚动到底自动加载更多
// @ts-nocheck

import { useEffect, useRef, useCallback } from 'react';
import { usePaginatedMarketStore } from '@/stores/paginatedMarketStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MarketCard } from './MarketCard';
import { SkeletonList } from '@/components/common/SkeletonCard';

// 加载更多触发器组件
function LoadMoreTrigger({ onLoadMore, isLoading }: { onLoadMore: () => void; isLoading: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading) {
          onLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );
    
    if (ref.current) {
      observer.observe(ref.current);
    }
    
    return () => observer.disconnect();
  }, [onLoadMore, isLoading]);
  
  return (
    <div ref={ref} className="py-4 text-center">
      {isLoading ? (
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          加载中...
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">滚动加载更多</span>
      )}
    </div>
  );
}

// 主组件
export function PaginatedMarketList() {
  const {
    markets,
    filteredCount,
    pagination,
    searchQuery,
    selectedSource,
    loadFirstPage,
    loadNextPage,
    refresh,
    setSearchQuery,
    setSelectedSource,
  } = usePaginatedMarketStore();
  
  const { settings } = useSettingsStore();
  const apiKey = settings.apiKeys.predictFun;
  
  const initialLoadRef = useRef(false);
  
  // 首次加载
  useEffect(() => {
    if (!initialLoadRef.current) {
      initialLoadRef.current = true;
      loadFirstPage(apiKey);
    }
  }, [apiKey, loadFirstPage]);
  
  // 搜索防抖
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      loadFirstPage(apiKey);
    }, 500);
  }, [apiKey, loadFirstPage, setSearchQuery]);
  
  // 切换数据源
  const handleSourceChange = useCallback((source: 'all' | 'predict' | 'polymarket') => {
    setSelectedSource(source);
    loadFirstPage(apiKey);
  }, [apiKey, loadFirstPage, setSelectedSource]);
  
  // 加载更多
  const handleLoadMore = useCallback(() => {
    if (pagination.hasMore && !pagination.isLoadingMore) {
      loadNextPage(apiKey);
    }
  }, [apiKey, loadNextPage, pagination.hasMore, pagination.isLoadingMore]);
  
  // 首次加载中
  if (pagination.isLoading && markets.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-32 bg-muted rounded animate-pulse" />
            <div className="h-4 w-48 bg-muted rounded mt-2 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonList count={6} />
        </div>
      </div>
    );
  }
  
  // 空状态
  if (markets.length === 0 && !pagination.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <svg className="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="mb-2">暂无市场数据</p>
        <Button variant="outline" onClick={() => refresh(apiKey)}>
          重新加载
        </Button>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* 标题和统计 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">市场列表</h2>
          <p className="text-sm text-muted-foreground">
            共 {filteredCount} 个市场
            <span className="text-xs text-muted-foreground/70 ml-2">
              (已加载 {markets.length} 个)
            </span>
          </p>
        </div>
        
        {/* 刷新按钮 */}
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refresh(apiKey)}
          disabled={pagination.isLoading}
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          刷新
        </Button>
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
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        
        {/* 平台筛选 */}
        <Tabs value={selectedSource} onValueChange={(v) => handleSourceChange(v as any)}>
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs">
              全部
            </TabsTrigger>
            <TabsTrigger value="predict" className="text-xs">
              Predict
            </TabsTrigger>
            <TabsTrigger value="polymarket" className="text-xs">
              Polymarket
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      
      {/* 市场网格 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {markets.map((market) => (
          <MarketCard 
            key={market.id} 
            market={market}
            onSelectForPair={(m) => console.log('Select for pair:', m)}
          />
        ))}
      </div>
      
      {/* 加载更多 */}
      {pagination.hasMore && (
        <LoadMoreTrigger onLoadMore={handleLoadMore} isLoading={pagination.isLoadingMore} />
      )}
      
      {/* 已加载全部 */}
      {!pagination.hasMore && markets.length > 0 && (
        <div className="py-4 text-center text-sm text-muted-foreground">
          已加载全部 {markets.length} 个市场
        </div>
      )}
    </div>
  );
}
