// 璺ㄥ競鍦哄鍒╃洃鎺х郴缁?- 涓诲簲鐢?

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { MarketCacheList } from '@/components/markets/MarketCacheList';
import { PairsList } from '@/components/pairs/PairsList';
import { ArbitrageNotifications } from '@/components/arbitrage/ArbitrageNotifications';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { ApiKeyRequired } from '@/components/common/ApiKeyRequired';
import PredictTest from '@/pages/PredictTest';
import { useMarketStore } from '@/stores/marketStore';
import { usePairStore } from '@/stores/pairStore';
import { useSettingsStore } from '@/stores/settingsStore';
import './App.css';

// 鍗犱綅椤甸潰缁勪欢
function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
      <svg className="w-16 h-16 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
      <h2 className="text-xl font-medium mb-2">{title}</h2>
      <p className="text-sm">{description}</p>
    </div>
  );
}

// 涓诲簲鐢ㄧ粍浠?
function App() {
  const [activeTab, setActiveTab] = useState('markets');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const { refreshAll, refreshPredictPrices, markets, isLoadingMarkets, isFirstFetch, firstFetchProgress, clearError } = useMarketStore();
  const { pairs, updatePair } = usePairStore();
  const { settings } = useSettingsStore();
  
  // 妫€鏌ユ槸鍚︽湁 API Key
  const hasApiKey = Boolean(settings.apiKeys.predictFun);
  
  // 妫€娴嬪睆骞曞昂瀵?
  useEffect(() => {
    const checkMobile = () => {
      const isMobileView = window.innerWidth < 1024;
      setIsMobile(isMobileView);
      // 鑷姩鎶樺彔/灞曞紑渚ц竟鏍忥細绉诲姩绔姌鍙狅紝妗岄潰绔睍寮€
      setSidebarCollapsed(isMobileView);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // 鍔犺浇鏁版嵁 - 鍙湪鏈?API Key 鏃跺姞杞?
  const loadData = useCallback(async () => {
    if (hasApiKey) {
      await refreshAll(settings.apiKeys.predictFun!);
    }
  }, [hasApiKey, refreshAll, settings.apiKeys.predictFun]);
  
  // 鍒濆鍔犺浇
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  // 鑷姩鍒锋柊锛堜粎鍦ㄧ敤鎴峰惎鐢ㄦ椂锛?
  // 绛栫暐锛氬畬鏁村埛鏂帮紙甯傚満鍒楄〃+濂楀埄锛夋瘡5鍒嗛挓锛屼环鏍煎埛鏂版瘡1鍒嗛挓
  useEffect(() => {
    if (!hasApiKey || !settings.monitoring.autoRefresh) {
      return;
    }
    
    // 姣?鍒嗛挓瀹屾暣鍒锋柊涓€娆★紙甯傚満鍒楄〃 + 濂楀埄鏈轰細锛?
    const fullRefreshMs = 5 * 60 * 1000; // 5鍒嗛挓
    const fullRefreshInterval = setInterval(() => {
      if (hasApiKey) {
        console.log('[AutoRefresh] Full refresh (markets + arbitrage)');
        refreshAll(settings.apiKeys.predictFun!, true);
      }
    }, fullRefreshMs);
    
    // 姣?鍒嗛挓鍒锋柊涓€娆?Predict.fun 浠锋牸
    const priceRefreshMs = 60 * 1000; // 1鍒嗛挓
    const priceRefreshInterval = setInterval(() => {
      if (hasApiKey) {
        console.log('[AutoRefresh] Price refresh only');
        refreshPredictPrices(settings.apiKeys.predictFun!, true);
      }
    }, priceRefreshMs);
    
    return () => {
      clearInterval(fullRefreshInterval);
      clearInterval(priceRefreshInterval);
    };
  }, [hasApiKey, settings.monitoring.autoRefresh, settings.apiKeys.predictFun, refreshAll, refreshPredictPrices]);
  
  // 鏇存柊閰嶅鐘舵€侊紙褰?markets 鏁版嵁鏇存柊鏃讹級- 浣跨敤 ref 闃叉鏃犻檺寰幆
  const lastUpdateRef = useRef<number>(0);
  
  useEffect(() => {
    if (markets.length === 0 || pairs.length === 0) return;
    
    // 闄愬埗鏇存柊棰戠巼锛氳嚦灏戦棿闅?5 绉?
    const now = Date.now();
    if (now - lastUpdateRef.current < 5000) return;
    
    let hasUpdate = false;
    
    // 閬嶅巻鎵€鏈夐厤瀵癸紝鏇存柊缁熻淇℃伅
    pairs.forEach((pair) => {
      if (!pair.isActive) return;
      
      const predictMarket = markets.find((m) => m.id === pair.predictMarketId);
      const polymarket = markets.find((m) => m.id === pair.polymarketId);
      
      if (!predictMarket || !polymarket) return;
      
      // 璁＄畻褰撳墠 ROI
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
        if (roi > maxRoi) {
          maxRoi = roi;
        }
      }
      
      // 鍙湪鏈夋剰涔夌殑鍙樺寲鏃舵墠鏇存柊
      const minProfitPercent = pair.monitorParams?.minProfitPercent ?? pair.minProfitAlert;
      const shouldUpdate = 
        maxRoi > pair.maxProfitSeen || 
        maxRoi > minProfitPercent / 100 ||
        !pair.lastCheckAt || 
        now - pair.lastCheckAt > 60000; // 鑷冲皯1鍒嗛挓鏇存柊涓€娆℃椂闂存埑
      
      if (shouldUpdate) {
        hasUpdate = true;
        const updates: Partial<typeof pair> = {
          lastCheckAt: now,
        };
        
        if (maxRoi > pair.maxProfitSeen) {
          updates.maxProfitSeen = maxRoi;
        }
        
        if (maxRoi > minProfitPercent / 100) {
          updates.opportunityCount = pair.opportunityCount + 1;
        }
        
        updatePair(pair.id, updates);
      }
    });
    
    if (hasUpdate) {
      lastUpdateRef.current = now;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets]); // 鍙洃鍚?markets锛屼笉鐩戝惉 pairs 鍜?updatePair 閬垮厤寰幆
  
  // 褰?API Key 鍙樺寲鏃舵竻闄ら敊璇?
  useEffect(() => {
    if (hasApiKey) {
      clearError();
    }
  }, [hasApiKey, clearError]);
  
  // 娓叉煋鍐呭
  const renderContent = () => {
    // 濡傛灉娌℃湁 API Key锛屾樉绀烘彁绀?
    if (!hasApiKey) {
      return <ApiKeyRequired />;
    }
    
    // 濡傛灉鏄娆℃姄鍙栵紝鏄剧ず鐗规畩鍔犺浇鐣岄潰
    if (isFirstFetch && isLoadingMarkets) {
      return (
        <div className="flex flex-col items-center justify-center h-96">
          <div className="w-full max-w-md px-6">
            <div className="flex items-center justify-center gap-3 mb-6">
              <svg className="w-6 h-6 animate-spin text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-lg font-medium">姝ｅ湪棣栨鎶撳彇鏁版嵁</span>
            </div>
            
            <p className="text-sm text-muted-foreground text-center mb-4">
              棰勮闇€瑕?1-2 鍒嗛挓锛岃鑰愬績绛夊緟...
            </p>
            
            {/* 杩涘害鏉?*/}
            <div className="w-full bg-muted rounded-full h-2 mb-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-500"
                style={{ width: `${firstFetchProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {firstFetchProgress}%
            </p>
            
            <p className="text-xs text-muted-foreground/70 text-center mt-4">
              棣栨鎶撳彇鍚庝細淇濆瓨鍒版湰鍦扮紦瀛橈紝涓嬫鍚姩绉掑紑
            </p>
          </div>
        </div>
      );
    }
    
    // 鍚庣画鏇存柊鏄潤榛樼殑锛屼笉鏄剧ず鍔犺浇鐣岄潰锛堜絾淇濈暀 markets.length === 0 鐨勬鏌ワ級
    
    switch (activeTab) {
      case 'markets':
        // 濡傛灉 markets 涓虹┖锛屾樉绀虹┖鐘舵€?
        if (markets.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <svg className="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="mb-2">鏆傛棤娲昏穬甯傚満鏁版嵁</p>
              <p className="text-sm text-muted-foreground/70 max-w-md text-center">
                褰撳墠娌℃湁鑾峰彇鍒版椿璺冪殑甯傚満鏁版嵁锛岃妫€鏌?API Key 鏄惁姝ｇ‘鎴栫◢鍚庨噸璇?
              </p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => loadData()}
              >
                閲嶆柊鍔犺浇
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
        return (
          <PlaceholderPage 
            title="数据分析" 
            description="查看套利统计和价格趋势分析" 
          />
        );
      case 'settings':
        return (
          <PlaceholderPage 
            title="设置" 
            description="点击右上角的设置按钮打开设置面板" 
          />
        );
      case 'predict-test':
        return <PredictTest />;
      default:
        return <MarketCacheList onNavigateToPairs={() => setActiveTab('pairs')} />;
    }
  };
  
  return (
    <div className="flex h-screen bg-background">
      {/* 妗岄潰绔晶杈规爮 */}
      {!isMobile && (
        <Sidebar 
          activeTab={activeTab} 
          onTabChange={setActiveTab}
          collapsed={sidebarCollapsed}
        />
      )}
      
      {/* 绉诲姩绔晶杈规爮鎶藉眽 */}
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
      
      {/* 涓诲唴瀹瑰尯 */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header 
          onMenuClick={() => setMobileMenuOpen(true)}
          isMobile={isMobile}
        />
        
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="max-w-7xl mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>
      
      {/* 璁剧疆闈㈡澘 */}
      <SettingsPanel />
    </div>
  );
}

export default App;

