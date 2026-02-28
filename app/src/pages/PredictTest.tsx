// Predict 数据获取测试页面
// 用于测试：后端 API 获取 → 前端显示 volume/liquidity 数据

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatVolume, formatPrice } from '@/utils/formatters';
import { useSettingsStore } from '@/stores/settingsStore';
import type { UnifiedMarket } from '@/types';

// ============ 缓存配置 ============
const PREDICT_CACHE_KEY = 'predict_test_cache_v1';
const PREDICT_CACHE_TIME_KEY = 'predict_test_cache_time_v1';

// 加载缓存
const loadCachedPredict = (): UnifiedMarket[] | null => {
  try {
    const cached = localStorage.getItem(PREDICT_CACHE_KEY);
    const cachedAt = localStorage.getItem(PREDICT_CACHE_TIME_KEY);
    
    if (!cached || !cachedAt) return null;
    
    return JSON.parse(cached);
  } catch {
    return null;
  }
};

// 保存缓存
const savePredictToCache = (markets: UnifiedMarket[]) => {
  try {
    localStorage.setItem(PREDICT_CACHE_KEY, JSON.stringify(markets));
    localStorage.setItem(PREDICT_CACHE_TIME_KEY, String(Date.now()));
  } catch (err) {
    console.warn('Failed to save Predict cache:', err);
  }
};

// ============ 数据获取（通过后端 API） ============
const fetchPredictMarkets = async (apiKey?: string): Promise<UnifiedMarket[]> => {
  console.log('[PredictTest] Fetching from backend API...');
  
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  
  // 调用后端只读缓存接口（获取已包含 stats 的数据）
  const response = await fetch('/api/markets/cached?source=predict', { headers });
  
  if (!response.ok) {
    throw new Error(`Backend API error: ${response.status}`);
  }
  
  const result = await response.json();
  console.log(`[PredictTest] Backend returned ${result.data?.length || 0} markets`);
  
  // 如果没有数据或数据缺少 volume，触发刷新
  const hasVolumeData = result.data?.some((m: UnifiedMarket) => m.volumeTotal > 0);
  
  if (!hasVolumeData && apiKey) {
    console.log('[PredictTest] No volume data, triggering refresh...');
    // 触发后端刷新（获取 stats）
    const refreshResponse = await fetch('/api/markets/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({}),
    });
    
    if (refreshResponse.ok) {
      console.log('[PredictTest] Refresh triggered, waiting...');
      // 等待几秒后重新获取
      await new Promise(r => setTimeout(r, 5000));
      const retryResponse = await fetch('/api/markets/cached?source=predict', { headers });
      const retryResult = await retryResponse.json();
      return retryResult.data || [];
    }
  }
  
  return result.data || [];
};

// ============ 平台标签组件 ============
function PlatformBadge() {
  return (
    <Badge 
      variant="secondary" 
      className="text-xs font-medium bg-emerald-100 text-emerald-700"
    >
      Predict.fun
    </Badge>
  );
}

// ============ 自定义市场卡片（显示 volume/liquidity） ============
function PredictMarketCard({ market }: { market: UnifiedMarket }) {
  return (
    <Card className="hover:shadow-lg transition-all duration-200">
      <CardContent className="p-4">
        {/* 顶部：平台标签 + 状态 */}
        <div className="flex items-center justify-between mb-2">
          <PlatformBadge />
          <span className={`text-xs ${market.isActive ? 'text-green-500' : 'text-gray-400'}`}>
            {market.isActive ? '交易中' : '已关闭'}
          </span>
        </div>

        {/* 标题 */}
        <h3 className="font-bold text-base text-gray-900 mb-2 line-clamp-2">
          {market.title}
        </h3>

        {/* 父标题（如果有） */}
        {market.parentTitle && (
          <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
            {market.parentTitle}
          </p>
        )}

        {/* 价格显示 */}
        <div className="flex gap-4 mb-3">
          <div className="flex-1 bg-blue-50 rounded p-2 text-center">
            <div className="text-xs text-blue-600 mb-1">Yes</div>
            <div className="font-bold text-blue-700">{formatPrice(market.yesPrice)}</div>
          </div>
          <div className="flex-1 bg-red-50 rounded p-2 text-center">
            <div className="text-xs text-red-600 mb-1">No</div>
            <div className="font-bold text-red-700">{formatPrice(market.noPrice)}</div>
          </div>
        </div>

        {/* 关键数据：总交易量和流动性 */}
        <div className="grid grid-cols-2 gap-2 text-xs border-t pt-3">
          <div className="text-center border-r border-gray-100">
            <div className="text-muted-foreground mb-0.5">总交易量</div>
            <div className={cn(
              "font-medium",
              market.volumeTotal > 0 ? "text-gray-900" : "text-gray-400"
            )}>
              {market.volumeTotal > 0 ? formatVolume(market.volumeTotal) : '暂无数据'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-muted-foreground mb-0.5">流动性</div>
            <div className={cn(
              "font-medium",
              market.liquidity > 0 ? "text-gray-900" : "text-gray-400"
            )}>
              {market.liquidity > 0 ? formatVolume(market.liquidity) : '暂无数据'}
            </div>
          </div>
        </div>

        {/* 市场 ID（调试用） */}
        <div className="text-[10px] text-muted-foreground mt-2 pt-2 border-t">
          ID: {market.sourceId} | Condition: {market.conditionId.slice(0, 20)}...
        </div>
      </CardContent>
    </Card>
  );
}

// ============ 主页面组件 ============
export default function PredictTest() {
  const [markets, setMarkets] = useState<UnifiedMarket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  
  // 使用 settings store 获取 API Key
  const { settings } = useSettingsStore();
  const apiKey = settings.apiKeys.predictFun || '';

  // 获取数据
  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    
    try {
      // 先尝试从缓存加载（如果不是强制刷新）
      if (!forceRefresh) {
        const cached = loadCachedPredict();
        if (cached && cached.length > 0) {
          setMarkets(cached);
          setLastUpdate(Number(localStorage.getItem(PREDICT_CACHE_TIME_KEY)));
          setLoading(false);
          console.log(`[PredictTest] Loaded ${cached.length} markets from cache`);
          return;
        }
      }
      
      // 从后端 API 获取
      console.log('[PredictTest] Fetching from API...');
      const data = await fetchPredictMarkets(apiKey);
      
      // 保存到缓存
      savePredictToCache(data);
      
      // 更新状态
      setMarkets(data);
      setLastUpdate(Date.now());
      
      console.log(`[PredictTest] Fetched ${data.length} markets`);
      
      // 统计有 volume 数据的市场
      const withVolume = data.filter(m => m.volumeTotal > 0).length;
      console.log(`[PredictTest] Markets with volume data: ${withVolume}/${data.length}`);
      
    } catch (err: any) {
      setError(err.message || '获取数据失败');
      console.error('[PredictTest] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  // 初始加载
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 手动刷新
  const handleRefresh = () => {
    fetchData(true);
  };

  // 清除缓存
  const handleClearCache = () => {
    localStorage.removeItem(PREDICT_CACHE_KEY);
    localStorage.removeItem(PREDICT_CACHE_TIME_KEY);
    setMarkets([]);
    setLastUpdate(null);
    console.log('[PredictTest] Cache cleared');
  };

  // 统计
  const stats = {
    total: markets.length,
    withVolume: markets.filter(m => m.volumeTotal > 0).length,
    withLiquidity: markets.filter(m => m.liquidity > 0).length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Predict 数据测试</h1>
              <p className="text-sm text-muted-foreground mt-1">
                测试后端 API 获取 volume/liquidity 数据 → 前端显示
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* 刷新按钮（手动） */}
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleRefresh}
                disabled={loading || !apiKey}
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
          <div className="flex flex-wrap items-center gap-4 mt-3 text-sm">
            <div className="flex items-center gap-2">
              <PlatformBadge />
              <span className="text-muted-foreground">
                {stats.total} 个市场
              </span>
            </div>
            
            {/* 数据质量统计 */}
            <div className="flex items-center gap-4 text-xs">
              <span className={cn(
                "px-2 py-1 rounded",
                stats.withVolume > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
              )}>
                有交易量: {stats.withVolume}/{stats.total}
              </span>
              <span className={cn(
                "px-2 py-1 rounded",
                stats.withLiquidity > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
              )}>
                有流动性: {stats.withLiquidity}/{stats.total}
              </span>
            </div>
            
            {lastUpdate && (
              <div className="text-muted-foreground text-xs">
                最后更新: {new Date(lastUpdate).toLocaleTimeString()}
              </div>
            )}
            
            {!apiKey && (
              <div className="text-amber-600 text-xs">
                ⚠️ 请先在设置中配置 API Key
              </div>
            )}
            
            {error && (
              <div className="text-red-500 text-xs">
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600 mx-auto mb-4"></div>
              <p className="text-muted-foreground">正在获取 Predict 数据...</p>
              <p className="text-xs text-muted-foreground mt-2">
                如果首次获取，可能需要 1-2 分钟获取 stats 数据
              </p>
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
        
        {/* 市场列表 */}
        {markets.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {markets.map((market) => (
              <PredictMarketCard 
                key={market.id} 
                market={market}
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
            <p>缓存键: {PREDICT_CACHE_KEY}</p>
            <p>后端 API: GET /api/markets/cached?source=predict</p>
            <p>刷新 API: POST /api/markets/refresh</p>
            <p>当前 API Key: {apiKey ? `${apiKey.slice(0, 8)}...` : '未设置'}</p>
          </div>
        </details>
      </footer>
    </div>
  );
}
