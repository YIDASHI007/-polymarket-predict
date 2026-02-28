// React Hook: 使用 WebSocket 监控已配对的市场

import { useEffect, useRef, useState, useCallback } from 'react';
import { wsManager } from '@/services/websocketService';
import { usePairStore } from '@/stores/pairStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { ManualMarketPair, PairedMarketStatus } from '@/types';

interface WebSocketStatus {
  predict: boolean;
  polymarket: boolean;
}

export function useWebSocketPairs() {
  const { settings } = useSettingsStore();
  const { pairs, calculatePairStatus } = usePairStore();
  
  const [status, setStatus] = useState<WebSocketStatus>({ predict: false, polymarket: false });
  const [realTimePrices, setRealTimePrices] = useState<Map<string, { yes?: number; no?: number }>>(new Map());
  
  // 使用 ref 避免闭包问题
  const pairsRef = useRef(pairs);
  pairsRef.current = pairs;

  // 初始化 WebSocket 连接
  useEffect(() => {
    const apiKey = settings.apiKeys.predictFun || undefined;
    
    wsManager.initialize(apiKey, (source, connected) => {
      setStatus((prev) => ({ ...prev, [source]: connected }));
    });

    // 监听价格更新
    const unsubscribe = wsManager.onPriceUpdate((marketId, price, side) => {
      setRealTimePrices((prev) => {
        const newMap = new Map(prev);
        const current = newMap.get(marketId) || {};
        
        if (side === 'yes') {
          newMap.set(marketId, { ...current, yes: price });
        } else {
          newMap.set(marketId, { ...current, no: price });
        }
        
        return newMap;
      });
    });

    return () => {
      unsubscribe();
      wsManager.disconnect();
    };
  }, [settings.apiKeys.predictFun]);

  // 当配对变化时，更新 WebSocket 订阅
  useEffect(() => {
    const activePairs = pairs.filter((p) => p.isActive);
    
    // 订阅所有配对市场
    for (const pair of activePairs) {
      // 提取 sourceId 用于订阅
      const predictSourceId = pair.predictMarketId.replace('predict-', '');
      const polySourceId = pair.polymarketId.replace('polymarket-', '');
      
      // 订阅 Predict.fun
      wsManager.subscribePredictMarket(predictSourceId);
      
      // 订阅 Polymarket
      wsManager.subscribePolymarketMarket(polySourceId);
    }

    // 清理函数：取消不再配对的订阅
    return () => {
      // 清理订阅逻辑简化处理
      // 实际应该追踪每个订阅，如果要精确取消，需要维护订阅计数器
      void activePairs; // 避免未使用警告
      
      // 注意：这里简化处理，实际应该追踪每个订阅
      // 如果要精确取消，需要维护订阅计数器
    };
  }, [pairs]);

  // 计算带实时价格的配对状态
  const getPairStatusWithRealtime = useCallback((pair: ManualMarketPair): PairedMarketStatus => {
    // 从 HTTP 轮询获取的基础市场数据
    const { markets } = usePairStore.getState() as any;
    
    const predictMarket = markets.find((m: any) => m.id === pair.predictMarketId);
    const polymarket = markets.find((m: any) => m.id === pair.polymarketId);
    
    // 如果有实时价格，覆盖 HTTP 数据
    const predictPrices = realTimePrices.get(pair.predictMarketId);
    const polyPrices = realTimePrices.get(pair.polymarketId);
    
    let enhancedPredict = predictMarket;
    let enhancedPolymarket = polymarket;
    
    if (predictMarket && predictPrices) {
      enhancedPredict = {
        ...predictMarket,
        yesPrice: predictPrices.yes ?? predictMarket.yesPrice,
        noPrice: predictPrices.no ?? predictMarket.noPrice,
      };
    }
    
    if (polymarket && polyPrices) {
      enhancedPolymarket = {
        ...polymarket,
        yesPrice: polyPrices.yes ?? polymarket.yesPrice,
        noPrice: polyPrices.no ?? polymarket.noPrice,
      };
    }
    
    // 传入全局筛选设置
    return calculatePairStatus(pair, enhancedPredict, enhancedPolymarket, settings.filters);
  }, [realTimePrices, calculatePairStatus, settings.filters]);

  return {
    status,
    realTimePrices,
    getPairStatusWithRealtime,
    isConnected: status.predict || status.polymarket,
  };
}
