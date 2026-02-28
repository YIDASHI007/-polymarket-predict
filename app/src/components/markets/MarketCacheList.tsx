// 市场缓存列表 - V2 无过期 + 错峰同步版本
// @ts-nocheck

import { useEffect, useRef, useCallback, useState } from 'react';
import { useMarketCacheStore } from '@/stores/marketCacheStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { usePairStore } from '@/stores/pairStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MarketCard } from './MarketCard';
import { SkeletonList } from '@/components/common/SkeletonCard';
import { cn } from '@/lib/utils';
import { getPlatformColor, getPlatformBgColor } from '@/utils/formatters';
import type { UnifiedMarket } from '@/types';

// 平台标签
function PlatformBadge({ platform }: { platform: 'predict' | 'polymarket' }) {
  return (
    <Badge 
      variant="secondary" 
      className={cn(
        "text-xs font-medium",
        getPlatformBgColor(platform),
        getPlatformColor(platform)
      )}
    >
      {platform === 'predict' ? 'Predict.fun' : 'Polymarket'}
    </Badge>
  );
}

// 排序选择器子组件
function SortSelector() {
  const { sortBy, sortOrder, setSortBy, setSortOrder } = useMarketCacheStore();
  
  const sortOptions = [
    { value: 'default', label: '默认排序' },
    { value: 'volume', label: '总交易量' },
    { value: 'liquidity', label: '流动性' },
  ];
  
  return (
    <div className="flex items-center gap-2">
      <select
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as any)}
        className="h-9 px-2 text-xs border rounded bg-background"
      >
        {sortOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      
      {sortBy !== 'default' && (
        <button
          onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
          className="h-9 px-2 text-xs border rounded hover:bg-accent"
          title={sortOrder === 'desc' ? '降序' : '升序'}
        >
          {sortOrder === 'desc' ? '↓' : '↑'}
        </button>
      )}
    </div>
  );
}

// 主组件
interface MarketCacheListProps {
  onSelectForPair?: (market: UnifiedMarket) => void;
  onNavigateToPairs?: () => void;  // 跳转到配对页面
}

export function MarketCacheList({ onSelectForPair: externalOnSelectForPair, onNavigateToPairs }: MarketCacheListProps = {}) {
  const {
    displayedMarkets,
    filteredMarkets,
    markets,
    isLoading,
    isRefreshing,
    refreshProgress,
    error,
    source,
    searchQuery,
    nextBackendUpdate,
    init,
    loadMore,
    refresh,
    setSource,
    setSearchQuery,
  } = useMarketCacheStore();
  
  const { settings } = useSettingsStore();
  const apiKey = settings.apiKeys.predictFun;
  
  // 配对相关状态
  const { 
    initialPairingMarket,
    setInitialPairingMarket,
    createPair,
    clearPending
  } = usePairStore();
  
  const initializedRef = useRef(false);
  
  // 倒计时状态
  const [countdown, setCountdown] = useState('');
  
  // 更新倒计时显示
  useEffect(() => {
    if (!nextBackendUpdate) return;
    
    const updateCountdown = () => {
      const now = Date.now();
      const diff = nextBackendUpdate - now;
      
      if (diff <= 0) {
        setCountdown('更新中...');
        return;
      }
      
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setCountdown(`${minutes}分${seconds.toString().padStart(2, '0')}秒后自动更新`);
    };
    
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [nextBackendUpdate]);
  
  // 首次加载
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      init(apiKey);
    }
  }, [apiKey, init]);
  
  // 搜索防抖
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const handleSearchChange = useCallback((value: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 300);
  }, [setSearchQuery]);
  
  // 切换平台
  const handleSourceChange = useCallback((newSource: 'all' | 'predict' | 'polymarket') => {
    setSource(newSource, apiKey);
  }, [apiKey, setSource]);
  
  // 刷新按钮点击
  const handleRefresh = useCallback(() => {
    if (!apiKey) return;
    refresh(apiKey);
  }, [apiKey, refresh]);
  
  // 处理配对按钮点击
  const handleSelectForPair = useCallback((market: UnifiedMarket) => {
    // 如果外部提供了处理函数，使用外部的
    if (externalOnSelectForPair) {
      externalOnSelectForPair(market);
      return;
    }
    
    // 设置预选择的市场并跳转到配对页面
    setInitialPairingMarket(market);
    onNavigateToPairs?.();
  }, [externalOnSelectForPair, setInitialPairingMarket, onNavigateToPairs]);
  
  // 是否还有更多数据
  const hasMore = displayedMarkets.length < filteredMarkets.length;
  
  // 首次加载中
  if (isLoading && markets.length === 0) {
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
  if (markets.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <svg className="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="mb-2">暂无市场数据</p>
        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
        <Button variant="outline" onClick={() => init(apiKey)}>
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
            共 {filteredMarkets.length} 个市场
            {displayedMarkets.length < filteredMarkets.length && (
              <span className="text-xs text-muted-foreground/70 ml-2">
                (显示 {displayedMarkets.length} 个)
              </span>
            )}
            {countdown && (
              <span className="text-xs text-blue-600 ml-2">
                • {countdown}
              </span>
            )}
          </p>
        </div>
        
        {/* 刷新按钮 + 进度 */}
        <div className="flex items-center gap-3">
          {isRefreshing && (
            <span className="text-sm text-amber-600 animate-pulse">
              {refreshProgress}
            </span>
          )}
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isRefreshing || !apiKey}
            title={!apiKey ? '请先配置API Key' : '刷新所有市场数据（预计2-3分钟）'}
          >
            {isRefreshing ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                刷新中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                刷新
              </>
            )}
          </Button>
        </div>
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
            defaultValue={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        
        {/* 平台筛选 */}
        <Tabs value={source} onValueChange={(v) => handleSourceChange(v as any)}>
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs">全部</TabsTrigger>
            <TabsTrigger value="predict" className="text-xs">Predict</TabsTrigger>
            <TabsTrigger value="polymarket" className="text-xs">Polymarket</TabsTrigger>
          </TabsList>
        </Tabs>
        
        {/* 排序 */}
        <SortSelector />
      </div>
      
      {/* 错误提示 */}
      {error && !isLoading && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
          错误: {error}
        </div>
      )}
      
      {/* 市场网格 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {displayedMarkets.map((market) => (
          <MarketCard 
            key={market.id} 
            market={market}
            onSelectForPair={handleSelectForPair}
          />
        ))}
      </div>
      
      {/* 加载更多 */}
      {hasMore && (
        <div className="py-4 text-center">
          <Button variant="outline" onClick={loadMore} disabled={isLoading}>
            {isLoading ? '加载中...' : '加载更多'}
          </Button>
        </div>
      )}
      
      {/* 已加载全部 */}
      {!hasMore && displayedMarkets.length > 0 && (
        <div className="py-4 text-center text-sm text-muted-foreground">
          已显示全部 {displayedMarkets.length} 个市场
        </div>
      )}
    </div>
  );
}
