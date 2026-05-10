// 主应用
//
// 新增：实时套利板（ArbitrageBoard）作为首页 tab —— 工具的核心价值入口。
// 旧的"市场列表 / 我的配对 / 套利通知"作为 Phase 1 功能保留。

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { MarketCacheList } from '@/components/markets/MarketCacheList';
import { PairsList } from '@/components/pairs/PairsList';
import { ArbitrageNotifications } from '@/components/arbitrage/ArbitrageNotifications';
import { ArbitrageBoard } from '@/components/arbitrage/ArbitrageBoard';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { ApiKeyRequired } from '@/components/common/ApiKeyRequired';
import PredictTest from '@/pages/PredictTest';
import { useMarketStore } from '@/stores/marketStore';
import { usePairStore } from '@/stores/pairStore';
import { useSettingsStore } from '@/stores/settingsStore';
import './App.css';

// 占位页面
function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
      <svg
        className="w-16 h-16 mb-4 opacity-30"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
        />
      </svg>
      <h2 className="text-xl font-medium mb-2">{title}</h2>
      <p className="text-sm">{description}</p>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('arbitrage');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const {
    refreshAll,
    refreshPredictPrices,
    markets,
    isLoadingMarkets,
    isFirstFetch,
    firstFetchProgress,
    clearError,
  } = useMarketStore();
  const { pairs, updatePair } = usePairStore();
  const { settings } = useSettingsStore();

  // Arbitrage Board 不依赖 Predict API Key（后端直接用 WebSocket 拿订单簿），
  // 但市场列表 / 配对等老功能还是依赖。
  const hasApiKey = Boolean(settings.apiKeys.predictFun);

  // 屏幕尺寸检测
  useEffect(() => {
    const checkMobile = () => {
      const isMobileView = window.innerWidth < 1024;
      setIsMobile(isMobileView);
      setSidebarCollapsed(isMobileView);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 数据加载（仅在有 API Key 时加载旧版市场列表）
  const loadData = useCallback(async () => {
    if (hasApiKey) {
      await refreshAll(settings.apiKeys.predictFun!);
    }
  }, [hasApiKey, refreshAll, settings.apiKeys.predictFun]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 自动刷新（旧版市场数据）
  useEffect(() => {
    if (!hasApiKey || !settings.monitoring.autoRefresh) return;

    const fullRefreshMs = 5 * 60 * 1000;
    const fullRefreshInterval = setInterval(() => {
      if (hasApiKey) {
        refreshAll(settings.apiKeys.predictFun!, true);
      }
    }, fullRefreshMs);

    const priceRefreshMs = 60 * 1000;
    const priceRefreshInterval = setInterval(() => {
      if (hasApiKey) {
        refreshPredictPrices(settings.apiKeys.predictFun!, true);
      }
    }, priceRefreshMs);

    return () => {
      clearInterval(fullRefreshInterval);
      clearInterval(priceRefreshInterval);
    };
  }, [
    hasApiKey,
    settings.monitoring.autoRefresh,
    settings.apiKeys.predictFun,
    refreshAll,
    refreshPredictPrices,
  ]);

  // 旧的统计更新逻辑
  const lastUpdateRef = useRef<number>(0);
  useEffect(() => {
    if (markets.length === 0 || pairs.length === 0) return;
    const now = Date.now();
    if (now - lastUpdateRef.current < 5000) return;

    let hasUpdate = false;
    pairs.forEach((pair) => {
      if (!pair.isActive) return;
      const predictMarket = markets.find((m) => m.id === pair.predictMarketId);
      const polymarket = markets.find((m) => m.id === pair.polymarketId);
      if (!predictMarket || !polymarket) return;

      let maxRoi = 0;
      const scenarios = [
        { buy: predictMarket.yesPrice, sell: polymarket.yesPrice },
        { buy: polymarket.yesPrice, sell: predictMarket.yesPrice },
        { buy: predictMarket.noPrice, sell: polymarket.noPrice },
        { buy: polymarket.noPrice, sell: predictMarket.noPrice },
      ];
      const totalFee = predictMarket.feeRate + polymarket.feeRate;

      for (const s of scenarios) {
        if (s.buy <= 0 || s.sell <= 0) continue;
        const diff = s.sell - s.buy;
        const roi = diff / s.buy - totalFee;
        if (roi > maxRoi) maxRoi = roi;
      }

      const minProfitPercent = pair.monitorParams?.minProfitPercent ?? pair.minProfitAlert;
      const shouldUpdate =
        maxRoi > pair.maxProfitSeen ||
        maxRoi > minProfitPercent / 100 ||
        !pair.lastCheckAt ||
        now - pair.lastCheckAt > 60000;

      if (shouldUpdate) {
        hasUpdate = true;
        const updates: Partial<typeof pair> = { lastCheckAt: now };
        if (maxRoi > pair.maxProfitSeen) updates.maxProfitSeen = maxRoi;
        if (maxRoi > minProfitPercent / 100) updates.opportunityCount = pair.opportunityCount + 1;
        updatePair(pair.id, updates);
      }
    });

    if (hasUpdate) lastUpdateRef.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets]);

  // API Key 变化时清除错误
  useEffect(() => {
    if (hasApiKey) clearError();
  }, [hasApiKey, clearError]);

  const renderContent = () => {
    // Arbitrage Board 不需要 API Key（完全走 WebSocket 公开订单簿）
    if (activeTab === 'arbitrage') {
      return <ArbitrageBoard />;
    }

    // 其它 tab 需要 API Key（旧版市场数据依赖）
    if (!hasApiKey) {
      return <ApiKeyRequired />;
    }

    if (isFirstFetch && isLoadingMarkets) {
      return (
        <div className="flex flex-col items-center justify-center h-96">
          <div className="w-full max-w-md px-6">
            <div className="flex items-center justify-center gap-3 mb-6">
              <svg
                className="w-6 h-6 animate-spin text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span className="text-lg font-medium">正在首次抓取数据</span>
            </div>

            <p className="text-sm text-muted-foreground text-center mb-4">
              预计 1-2 分钟，请耐心等待…
            </p>

            <div className="w-full bg-muted rounded-full h-2 mb-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-500"
                style={{ width: `${firstFetchProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">{firstFetchProgress}%</p>

            <p className="text-xs text-muted-foreground/70 text-center mt-4">
              首次抓取后会缓存到本地，下次启动秒开
            </p>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case 'markets':
        if (markets.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <svg
                className="w-12 h-12 mb-4 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="mb-2">暂无活跃市场数据</p>
              <p className="text-sm text-muted-foreground/70 max-w-md text-center">
                当前没有获取到活跃的市场数据，请检查 API Key 是否正确或稍后重试
              </p>
              <Button variant="outline" className="mt-4" onClick={() => loadData()}>
                重新加载
              </Button>
            </div>
          );
        }
        return <MarketCacheList onNavigateToPairs={() => setActiveTab('pairs')} />;
      case 'pairs':
        return <PairsList />;
      case 'watchlist':
        return <ArbitrageNotifications />;
      case 'analytics':
        return <PlaceholderPage title="数据分析" description="查看套利统计和价格趋势分析" />;
      case 'settings':
        return <PlaceholderPage title="设置" description="点击右上角的设置按钮打开设置面板" />;
      case 'predict-test':
        return <PredictTest />;
      default:
        return <ArbitrageBoard />;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {!isMobile && (
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} collapsed={sidebarCollapsed} />
      )}

      {isMobile && mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed left-0 top-0 h-full z-50">
            <Sidebar
              activeTab={activeTab}
              onTabChange={(tab) => {
                setActiveTab(tab);
                setMobileMenuOpen(false);
              }}
              collapsed={false}
            />
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuClick={() => setMobileMenuOpen(true)} isMobile={isMobile} />

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">{renderContent()}</div>
        </main>
      </div>

      <SettingsPanel />
    </div>
  );
}

export default App;
