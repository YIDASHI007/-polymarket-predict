// Polymarket 独立测试页面
// 用于测试：获取数据 → 本地缓存 → 渲染 的完整流程

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MarketCard } from '@/components/markets/MarketCard';
import { cn } from '@/lib/utils';
import type { UnifiedMarket } from '@/types';

// ============ 独立缓存配置 ============
const POLY_CACHE_KEY = 'polymarket_test_cache_v1';
const POLY_CACHE_TIME_KEY = 'polymarket_test_cache_time_v1';
const CACHE_TTL = 10 * 60 * 1000; // 10分钟

// 加载缓存
const loadCachedPolymarket = (): UnifiedMarket[] | null => {
  try {
    const cached = localStorage.getItem(POLY_CACHE_KEY);
    const cachedAt = localStorage.getItem(POLY_CACHE_TIME_KEY);
    
    if (!cached || !cachedAt) return null;
    
    const age = Date.now() - Number(cachedAt);
    if (age > CACHE_TTL) {
      localStorage.removeItem(POLY_CACHE_KEY);
      localStorage.removeItem(POLY_CACHE_TIME_KEY);
      return null;
    }
    
    return JSON.parse(cached);
  } catch {
    return null;
  }
};

// 保存缓存
const savePolymarketToCache = (markets: UnifiedMarket[]) => {
  try {
    localStorage.setItem(POLY_CACHE_KEY, JSON.stringify(markets));
    localStorage.setItem(POLY_CACHE_TIME_KEY, String(Date.now()));
  } catch (err) {
    console.warn('Failed to save Polymarket cache:', err);
  }
};

// ============ 数据获取（优先使用后端API，后端网络可访问Polymarket） ============
const fetchPolymarketEvents = async (): Promise<UnifiedMarket[]> => {
  // 策略1: 优先使用后端API（因为后端网络可以访问Polymarket）
  try {
    console.log('[PolymarketTest] Fetching from backend API...');
    const response = await fetch('/api/polymarket/markets/all');
    
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`[PolymarketTest] Backend returned ${result.data?.length || 0} markets`);
    
    if (result.data && Array.isArray(result.data)) {
      return result.data;
    }
    return [];
  } catch (backendError: any) {
    console.warn('[PolymarketTest] Backend fetch failed:', backendError.message);
    
    // 策略2: 备用 - 浏览器直接请求（如果用户有VPN插件）
    console.log('[PolymarketTest] Trying direct fetch as fallback...');
    return fetchPolymarketDirect();
  }
};

// 备用：浏览器直接请求
const fetchPolymarketDirect = async (): Promise<UnifiedMarket[]> => {
  const limit = 100;
  
  try {
    const response = await fetch(`https://gamma-api.polymarket.com/events?limit=${limit}&offset=0&closed=false`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    return data
      .filter((e: any) => e.active && !e.closed)
      .map((event: any) => transformPolymarketEvent(event));
  } catch (error: any) {
    console.error('[PolymarketTest] Direct fetch failed:', error);
    throw error;
  }
};

// 数据转换
const transformPolymarketEvent = (event: any): UnifiedMarket => {
  let yesPrice = 0;
  let noPrice = 0;
  let volume = 0;
  let liquidity = 0;
  let conditionId = event.conditionId || '';

  if (event.markets && event.markets.length > 0) {
    const firstMarket = event.markets[0];
    
    try {
      const outcomePrices = firstMarket.outcomePrices;
      if (outcomePrices) {
        const prices = typeof outcomePrices === 'string' 
          ? JSON.parse(outcomePrices) 
          : outcomePrices;
        if (Array.isArray(prices) && prices.length >= 2) {
          yesPrice = parseFloat(prices[0]) || 0;
          noPrice = parseFloat(prices[1]) || 0;
        }
      }
    } catch (e) {
      console.warn('Failed to parse prices for event:', event.id);
    }

    volume = firstMarket.volume || 0;
    liquidity = firstMarket.liquidity || 0;
    conditionId = firstMarket.conditionId || conditionId;
  }

  return {
    id: `polymarket-${event.id}`,
    source: 'polymarket',
    sourceId: event.id,
    conditionId: conditionId,
    categorySlug: extractCategoryFromSlug(event.slug),
    title: event.title,
    description: event.description || '',
    url: `https://polymarket.com/event/${event.slug}`,
    isActive: event.active,
    isTradable: event.active && !event.closed,
    yesPrice: yesPrice,
    noPrice: noPrice,
    yesPriceChange24h: 0,
    noPriceChange24h: 0,
    volume24h: event.volume24hr || 0,
    volumeTotal: event.volume || volume,
    liquidity: event.liquidity || liquidity,
    lastUpdated: Date.now(),
    feeRate: 0.002,
    endDate: event.endDate,
  };
};

const extractCategoryFromSlug = (slug?: string): string | undefined => {
  if (!slug) return undefined;
  const categories = ['crypto', 'bitcoin', 'ethereum', 'politics', 'sports', 'finance', 'entertainment'];
  for (const cat of categories) {
    if (slug.includes(cat)) return cat;
  }
  return undefined;
};

// ============ 平台标签组件 ============
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

// ============ 主页面组件 ============
export default function PolymarketTest() {
  const [markets, setMarkets] = useState<UnifiedMarket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(600);

  // 获取数据
  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    
    try {
      // 先尝试从缓存加载
      if (!forceRefresh) {
        const cached = loadCachedPolymarket();
        if (cached && cached.length > 0) {
          setMarkets(cached);
          setLastUpdate(Number(localStorage.getItem(POLY_CACHE_TIME_KEY)));
          setLoading(false);
          console.log(`[PolymarketTest] Loaded ${cached.length} markets from cache`);
          return;
        }
      }
      
      // 从 API 获取
      console.log('[PolymarketTest] Fetching from API...');
      const data = await fetchPolymarketEvents();
      
      // 保存到缓存
      savePolymarketToCache(data);
      
      // 更新状态
      setMarkets(data);
      setLastUpdate(Date.now());
      setCountdown(600);
      
      console.log(`[PolymarketTest] Fetched ${data.length} markets from API`);
    } catch (err: any) {
      setError(err.message || '获取数据失败');
      console.error('[PolymarketTest] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 自动刷新倒计时
  useEffect(() => {
    if (!lastUpdate) return;
    
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastUpdate) / 1000);
      const remaining = Math.max(0, 600 - elapsed);
      setCountdown(remaining);
      
      // 自动刷新
      if (remaining === 0) {
        fetchData(true);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [lastUpdate, fetchData]);

  // 手动刷新
  const handleRefresh = () => {
    fetchData(true);
  };

  // 清除缓存
  const handleClearCache = () => {
    localStorage.removeItem(POLY_CACHE_KEY);
    localStorage.removeItem(POLY_CACHE_TIME_KEY);
    setMarkets([]);
    setLastUpdate(null);
    console.log('[PolymarketTest] Cache cleared');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Polymarket 测试页面</h1>
              <p className="text-sm text-muted-foreground mt-1">
                测试数据流：获取 → 缓存 → 渲染
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* 倒计时显示 */}
              {lastUpdate && (
                <div className="text-sm text-muted-foreground">
                  自动刷新: {formatTime(countdown)}
                </div>
              )}
              
              {/* 刷新按钮 */}
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleRefresh}
                disabled={loading}
              >
                {loading ? '刷新中...' : '手动刷新'}
              </Button>
              
              {/* 清除缓存 */}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleClearCache}
              >
                清除缓存
              </Button>
            </div>
          </div>
          
          {/* 状态栏 */}
          <div className="flex items-center gap-4 mt-3 text-sm">
            <div className="flex items-center gap-2">
              <PlatformBadge platform="polymarket" />
              <span className="text-muted-foreground">
                {markets.length} 个市场
              </span>
            </div>
            
            {lastUpdate && (
              <div className="text-muted-foreground">
                最后更新: {new Date(lastUpdate).toLocaleTimeString()}
              </div>
            )}
            
            {error && (
              <div className="text-red-500">
                错误: {error}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 加载状态 */}
        {loading && markets.length === 0 && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
              <p className="text-muted-foreground">正在获取 Polymarket 数据...</p>
            </div>
          </div>
        )}
        
        {/* 错误状态 */}
        {error && markets.length === 0 && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-red-500 mb-4">{error}</p>
              <Button onClick={handleRefresh}>重试</Button>
            </div>
          </div>
        )}
        
        {/* 空状态 */}
        {!loading && !error && markets.length === 0 && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center text-muted-foreground">
              <p>暂无数据</p>
              <p className="text-sm mt-2">点击"手动刷新"获取数据</p>
            </div>
          </div>
        )}
        
        {/* 市场列表 - 使用网格布局 */}
        {markets.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {markets.map((market) => (
              <MarketCard 
                key={market.id} 
                market={market}
                onSelectForPair={(m) => {
                  console.log('Selected:', m.title);
                  alert(`选中: ${m.title}`);
                }}
              />
            ))}
          </div>
        )}
      </main>
      
      {/* 调试信息 */}
      <footer className="max-w-7xl mx-auto px-4 py-4 text-xs text-muted-foreground border-t">
        <details>
          <summary>调试信息</summary>
          <div className="mt-2 space-y-1">
            <p>缓存键: {POLY_CACHE_KEY}</p>
            <p>缓存TTL: {CACHE_TTL / 1000}秒</p>
            <p>代理路径: /polymarket-api</p>
            <p>API端点: https://gamma-api.polymarket.com/events</p>
          </div>
        </details>
      </footer>
    </div>
  );
}
