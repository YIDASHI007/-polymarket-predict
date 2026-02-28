// 缓存联动市场 Store
// 架构：后端 cache.json ←→ 前端 localStorage ←→ UI
// 刷新：后端调用 API → 更新 cache.json → 更新前端缓存

import { create } from 'zustand';
import type { UnifiedMarket } from '@/types';
import { apiClient } from '@/api/client';

// localStorage 缓存键 - 统一使用 v3
const CACHE_KEY = 'markets_cache_v3';
const CACHE_TIME_KEY = 'markets_cache_time_v3';
const SYNC_INTERVAL = 10 * 60 * 1000; // 10分钟同步一次

interface CacheData {
  markets: UnifiedMarket[];
  cachedAt: number;
}

// 从 localStorage 加载（只加载市场数据，不加载筛选条件）
const loadFromStorage = (): CacheData | null => {
  try {
    const data = localStorage.getItem(CACHE_KEY);
    const time = Number(localStorage.getItem(CACHE_TIME_KEY));
    
    if (!data || !time) return null;
    
    return {
      markets: JSON.parse(data),
      cachedAt: time,
    };
  } catch {
    return null;
  }
};

// 保存到 localStorage（只保存市场数据，不保存筛选条件）
const saveToStorage = (markets: UnifiedMarket[]) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(markets));
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
  } catch (err) {
    console.warn('[Cache] Save failed:', err);
  }
};

interface CachedMarketStore {
  // 数据
  markets: UnifiedMarket[];
  filteredMarkets: UnifiedMarket[];
  displayedMarkets: UnifiedMarket[]; // 当前显示的数据（分页）
  
  // 状态
  isLoading: boolean;
  isRefreshing: boolean; // 正在强制刷新（从 API）
  refreshProgress: string; // 刷新进度提示
  error: string | null;
  lastSyncTime: number; // 上次同步时间
  
  // 筛选
  source: 'all' | 'predict' | 'polymarket';
  searchQuery: string;
  displayLimit: number; // 当前显示数量（加载更多用）
  PAGE_SIZE: number;
  
  // 方法
  init: (apiKey?: string) => Promise<void>; // 初始化加载
  loadMore: () => void; // 从本地缓存加载更多
  refresh: (apiKey: string) => Promise<void>; // 强制刷新（从 API）
  syncWithBackend: (apiKey?: string) => Promise<void>; // 10分钟同步
  applyFilter: () => void; // 应用筛选
  
  // 筛选
  setSource: (source: 'all' | 'predict' | 'polymarket', apiKey?: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  
  // 获取器
  getMarketById: (id: string) => UnifiedMarket | undefined;
  getCacheStatus: () => { hasCache: boolean; age: number; needSync: boolean };
}

export const useCachedMarketStore = create<CachedMarketStore>((set, get) => ({
  markets: [],
  filteredMarkets: [],
  displayedMarkets: [],
  
  isLoading: false,
  isRefreshing: false,
  refreshProgress: '',
  error: null,
  lastSyncTime: 0,
  
  source: 'all',
  searchQuery: '',
  displayLimit: 20,
  PAGE_SIZE: 20,
  
  // 初始化 - 首次打开（默认显示全部平台）
  init: async (apiKey?: string) => {
    const { syncWithBackend, applyFilter } = get();
    
    // 1. 先尝试从 localStorage 加载（秒开）
    const cached = loadFromStorage();
    if (cached && cached.markets.length > 0) {
      console.log(`[Init] Loaded from localStorage: ${cached.markets.length} markets`);
      set({ 
        markets: cached.markets,
        lastSyncTime: cached.cachedAt,
      });
      applyFilter();
      
      // 检查是否需要同步（超过10分钟）
      const age = Date.now() - cached.cachedAt;
      if (age > SYNC_INTERVAL) {
        console.log('[Init] Cache stale, syncing with backend...');
        await syncWithBackend(apiKey);
      }
      return;
    }
    
    // 2. 无缓存，从后端缓存文件加载（默认 'all'）
    console.log('[Init] No local cache, loading from backend cache...');
    await syncWithBackend(apiKey);
  },
  
  // 从后端缓存文件同步（10分钟一次，或手动触发）
  syncWithBackend: async (apiKey?: string) => {
    const { source, applyFilter, searchQuery } = get();
    
    set({ isLoading: true, error: null });
    
    try {
      const result = await apiClient.getMarketsFromCache(
        { source, search: searchQuery },
        apiKey
      );
      
      console.log(`[Sync] Loaded from backend cache: ${result.data.length} markets`);
      
      // 保存到 localStorage（只保存数据）
      saveToStorage(result.data);
      
      set({
        markets: result.data,
        lastSyncTime: Date.now(),
        isLoading: false,
      });
      
      applyFilter();
    } catch (error: any) {
      console.error('[Sync] Failed:', error);
      set({ error: error.message, isLoading: false });
    }
  },
  
  // 加载更多 - 直接从本地缓存取（不分页，只是增加显示数量）
  loadMore: () => {
    const { displayLimit, PAGE_SIZE, applyFilter } = get();
    const newLimit = displayLimit + PAGE_SIZE;
    
    console.log(`[LoadMore] Increasing display limit: ${displayLimit} → ${newLimit}`);
    
    set({ displayLimit: newLimit });
    applyFilter();
  },
  
  // 强制刷新 - 调用 API 获取新数据（1-2分钟）
  refresh: async (apiKey: string) => {
    const { applyFilter } = get();
    
    console.log('[Refresh] Starting forced refresh from APIs...');
    
    set({ 
      isRefreshing: true, 
      refreshProgress: '正在获取新数据，预计1-2分钟...',
      error: null,
    });
    
    try {
      const result = await apiClient.refreshMarkets(apiKey);
      
      console.log(`[Refresh] Completed: ${result.data.length} markets`);
      
      // 保存到 localStorage（只保存数据）
      saveToStorage(result.data);
      
      set({
        markets: result.data,
        lastSyncTime: Date.now(),
        isRefreshing: false,
        refreshProgress: '',
        displayLimit: 20, // 重置显示数量
      });
      
      applyFilter();
    } catch (error: any) {
      console.error('[Refresh] Failed:', error);
      set({ 
        error: error.message, 
        isRefreshing: false,
        refreshProgress: '',
      });
    }
  },
  
  // 切换平台筛选 - 从后端缓存加载新数据（筛选条件不保存到 localStorage）
  setSource: async (newSource: 'all' | 'predict' | 'polymarket', apiKey?: string) => {
    const { source } = get();
    if (newSource === source) return;
    
    set({ source: newSource, displayLimit: 20 });
    
    // 每次切换平台都重新从后端缓存加载
    // 不检查本地缓存，因为本地缓存可能包含其他平台的数据
    await get().syncWithBackend(apiKey);
  },
  
  // 搜索筛选（前端本地筛选）
  setSearchQuery: (query: string) => {
    set({ searchQuery: query, displayLimit: 20 });
    get().applyFilter();
  },
  
  // 应用筛选和分页
  applyFilter: () => {
    const { markets, searchQuery, displayLimit } = get();
    
    let filtered = [...markets];
    
    // 搜索筛选
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(m => 
        m.title.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q) ||
        m.parentTitle?.toLowerCase().includes(q)
      );
    }
    
    // 显示分页
    const displayed = filtered.slice(0, displayLimit);
    
    set({
      filteredMarkets: filtered,
      displayedMarkets: displayed,
    });
  },
  
  // 获取器
  getMarketById: (id: string) => {
    return get().markets.find(m => m.id === id);
  },
  
  getCacheStatus: () => {
    const cached = loadFromStorage();
    if (!cached) return { hasCache: false, age: 0, needSync: true };
    
    const age = Date.now() - cached.cachedAt;
    return {
      hasCache: true,
      age,
      needSync: age > SYNC_INTERVAL,
    };
  },
}));
