// 分页市场数据 Store - 按需加载，提升首屏体验
// 优化：使用 localStorage 缓存，实现秒开

import { create } from 'zustand';
import type { UnifiedMarket } from '@/types';
import { apiClient } from '@/api/client';

// localStorage 缓存键
const CACHE_KEY = 'paginated_markets_cache_v1';
const CACHE_TIME_KEY = 'paginated_markets_time_v1';
const CACHE_FILTERS_KEY = 'paginated_markets_filters_v1';
const CACHE_MAX_AGE = 10 * 60 * 1000; // 10分钟

// 从 localStorage 加载缓存
const loadCachedMarkets = (): { markets: UnifiedMarket[]; filters: any; cachedAt: number } | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const cachedAt = Number(localStorage.getItem(CACHE_TIME_KEY));
    const filters = JSON.parse(localStorage.getItem(CACHE_FILTERS_KEY) || '{}');
    
    if (!cached || !cachedAt) return null;
    
    const age = Date.now() - cachedAt;
    // 缓存 20 分钟内有效
    if (age > CACHE_MAX_AGE * 2) {
      console.log(`[Cache] Data too old (${Math.floor(age/1000)}s)`);
      return null;
    }
    
    return { markets: JSON.parse(cached), filters, cachedAt };
  } catch (err) {
    console.warn('[Cache] Failed to load:', err);
    return null;
  }
};

// 保存到 localStorage
const saveMarketsToCache = (markets: UnifiedMarket[], filters: any) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(markets));
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
    localStorage.setItem(CACHE_FILTERS_KEY, JSON.stringify(filters));
    console.log(`[Cache] Saved ${markets.length} markets to localStorage`);
  } catch (err) {
    console.warn('[Cache] Failed to save:', err);
  }
};

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  isFromCache: boolean; // 标记是否来自缓存
}

interface PaginatedMarketStore {
  markets: UnifiedMarket[];
  filteredCount: number;
  pagination: PaginationState;
  searchQuery: string;
  selectedCategory: string | null;
  selectedSource: 'all' | 'predict' | 'polymarket';
  sortBy: 'volume' | 'time' | 'price';
  sortOrder: 'asc' | 'desc';
  
  loadFirstPage: (apiKey?: string) => Promise<void>;
  loadNextPage: (apiKey?: string) => Promise<void>;
  refresh: (apiKey?: string) => Promise<void>;
  fetchInBackground: (apiKey?: string) => Promise<void>;
  
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string | null) => void;
  setSelectedSource: (source: 'all' | 'predict' | 'polymarket') => void;
  setSortBy: (sortBy: 'volume' | 'time' | 'price') => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
  getMarketById: (id: string) => UnifiedMarket | undefined;
}

const DEFAULT_PAGE_SIZE = 20;

export const usePaginatedMarketStore = create<PaginatedMarketStore>((set, get) => ({
  // 初始状态
  markets: [],
  filteredCount: 0,
  
  pagination: {
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    total: 0,
    totalPages: 0,
    hasMore: false,
    isLoading: false,
    isLoadingMore: false,
    error: null,
    isFromCache: false,
  },
  
  searchQuery: '',
  selectedCategory: null,
  selectedSource: 'all',
  sortBy: 'volume',
  sortOrder: 'desc',
  
  // 加载第一页（缓存优先，秒开）
  loadFirstPage: async (apiKey?: string) => {
    const { selectedSource, searchQuery, selectedCategory, sortBy, sortOrder } = get();
    const currentFilters = { selectedSource, searchQuery, selectedCategory, sortBy, sortOrder };
    
    // 1. 尝试从缓存加载
    const cached = loadCachedMarkets();
    if (cached && cached.markets.length > 0) {
      // 检查筛选条件是否匹配（简化：缓存只匹配 source）
      const filtersMatch = cached.filters?.selectedSource === selectedSource;
      
      if (filtersMatch) {
        console.log(`[PaginatedStore] Using cache: ${cached.markets.length} markets`);
        
        // 立即显示缓存数据
        set({
          markets: cached.markets,
          filteredCount: cached.markets.length,
          pagination: {
            page: 1,
            limit: DEFAULT_PAGE_SIZE,
            total: cached.markets.length,
            totalPages: Math.ceil(cached.markets.length / DEFAULT_PAGE_SIZE),
            hasMore: cached.markets.length >= DEFAULT_PAGE_SIZE,
            isLoading: false,
            isLoadingMore: false,
            error: null,
            isFromCache: true,
          },
        });
        
        // 2. 后台静默更新（不阻塞UI）
        get().fetchInBackground(apiKey);
        return;
      }
    }
    
    // 3. 无缓存，显示加载状态
    set(state => ({
      pagination: { ...state.pagination, isLoading: true, error: null, isFromCache: false },
      markets: [],
    }));
    
    // 4. 从API加载
    try {
      const result = await apiClient.getPaginatedMarkets({
        page: 1,
        limit: DEFAULT_PAGE_SIZE,
        source: selectedSource,
        search: searchQuery,
        category: selectedCategory || undefined,
        sortBy,
        sortOrder,
      }, apiKey);
      
      // 保存到缓存
      saveMarketsToCache(result.data, currentFilters);
      
      set({
        markets: result.data,
        filteredCount: result.pagination.total,
        pagination: {
          page: result.pagination.page,
          limit: result.pagination.limit,
          total: result.pagination.total,
          totalPages: result.pagination.totalPages,
          hasMore: result.pagination.hasMore,
          isLoading: false,
          isLoadingMore: false,
          error: null,
          isFromCache: false,
        },
      });
    } catch (error: any) {
      set(state => ({
        pagination: { ...state.pagination, isLoading: false, error: error.message },
      }));
    }
  },
  
  // 后台静默获取最新数据
  fetchInBackground: async (apiKey?: string) => {
    const { selectedSource, searchQuery, selectedCategory, sortBy, sortOrder, markets: currentMarkets } = get();
    const currentFilters = { selectedSource, searchQuery, selectedCategory, sortBy, sortOrder };
    
    try {
      const result = await apiClient.getPaginatedMarkets({
        page: 1,
        limit: DEFAULT_PAGE_SIZE,
        source: selectedSource,
        search: searchQuery,
        category: selectedCategory || undefined,
        sortBy,
        sortOrder,
      }, apiKey);
      
      // 保存到缓存
      saveMarketsToCache(result.data, currentFilters);
      
      // 只有数据变化才更新UI
      if (JSON.stringify(result.data) !== JSON.stringify(currentMarkets)) {
        set({
          markets: result.data,
          filteredCount: result.pagination.total,
          pagination: {
            page: result.pagination.page,
            limit: result.pagination.limit,
            total: result.pagination.total,
            totalPages: result.pagination.totalPages,
            hasMore: result.pagination.hasMore,
            isLoading: false,
            isLoadingMore: false,
            error: null,
            isFromCache: false,
          },
        });
        console.log(`[PaginatedStore] Background update: ${result.data.length} markets`);
      }
    } catch (err) {
      console.warn('[PaginatedStore] Background fetch failed:', err);
    }
  },
  
  // 加载下一页（滚动到底触发）- 不走缓存，直接请求API
  loadNextPage: async (apiKey?: string) => {
    const { pagination, selectedSource, searchQuery, selectedCategory, sortBy, sortOrder } = get();
    
    if (!pagination.hasMore || pagination.isLoadingMore) return;
    
    const nextPage = pagination.page + 1;
    
    set(state => ({
      pagination: { ...state.pagination, isLoadingMore: true },
    }));
    
    try {
      const result = await apiClient.getPaginatedMarkets({
        page: nextPage,
        limit: pagination.limit,
        source: selectedSource,
        search: searchQuery,
        category: selectedCategory || undefined,
        sortBy,
        sortOrder,
      }, apiKey);
      
      set(state => ({
        markets: [...state.markets, ...result.data],
        pagination: {
          ...state.pagination,
          page: result.pagination.page,
          hasMore: result.pagination.hasMore,
          isLoadingMore: false,
        },
      }));
    } catch (error: any) {
      set(state => ({
        pagination: { ...state.pagination, isLoadingMore: false, error: error.message },
      }));
    }
  },
  
  // 刷新（重置到第一页）
  refresh: async (apiKey?: string) => {
    await get().loadFirstPage(apiKey);
  },
  
  // 筛选条件变更时自动刷新
  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
    // 注意：需要外部调用 loadFirstPage，避免循环依赖
  },
  
  setSelectedCategory: (category: string | null) => {
    set({ selectedCategory: category });
  },
  
  setSelectedSource: (source: 'all' | 'predict' | 'polymarket') => {
    set({ selectedSource: source });
  },
  
  setSortBy: (sortBy: 'volume' | 'time' | 'price') => {
    set({ sortBy });
  },
  
  setSortOrder: (order: 'asc' | 'desc') => {
    set({ sortOrder: order });
  },
  
  getMarketById: (id: string) => {
    return get().markets.find(m => m.id === id);
  },
}));
