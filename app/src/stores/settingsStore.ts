// 用户设置状态管理

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserSettings } from '@/types';
import { defaultSettings } from '@/data/mockData';

interface SettingsStore {
  settings: UserSettings;
  isSettingsOpen: boolean;
  activeSettingsTab: 'api' | 'monitoring' | 'filters' | 'notifications' | 'display';
  
  // Actions
  updateApiKey: (platform: 'predictFun' | 'polymarket', key: string | null) => void;
  updateMonitoring: (config: Partial<UserSettings['monitoring']>) => void;
  updateFilters: (filters: Partial<UserSettings['filters']>) => void;
  updateNotifications: (config: Partial<UserSettings['notifications']>) => void;
  updateDisplay: (config: Partial<UserSettings['display']>) => void;
  resetToDefaults: () => void;
  setSettingsOpen: (open: boolean) => void;
  setActiveSettingsTab: (tab: 'api' | 'monitoring' | 'filters' | 'notifications' | 'display') => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      isSettingsOpen: false,
      activeSettingsTab: 'api',
      
      updateApiKey: (platform, key) => {
        set((state) => ({
          settings: {
            ...state.settings,
            apiKeys: {
              ...state.settings.apiKeys,
              [platform]: key,
            },
          },
        }));
      },
      
      updateMonitoring: (config) => {
        set((state) => ({
          settings: {
            ...state.settings,
            monitoring: {
              ...state.settings.monitoring,
              ...config,
            },
          },
        }));
      },
      
      updateFilters: (filters) => {
        set((state) => ({
          settings: {
            ...state.settings,
            filters: {
              ...state.settings.filters,
              ...filters,
            },
          },
        }));
      },
      
      updateNotifications: (config) => {
        set((state) => ({
          settings: {
            ...state.settings,
            notifications: {
              ...state.settings.notifications,
              ...config,
            },
          },
        }));
      },
      
      updateDisplay: (config) => {
        set((state) => ({
          settings: {
            ...state.settings,
            display: {
              ...state.settings.display,
              ...config,
            },
          },
        }));
      },
      
      resetToDefaults: () => {
        set({ settings: defaultSettings });
      },
      
      setSettingsOpen: (open) => set({ isSettingsOpen: open }),
      setActiveSettingsTab: (tab) => set({ activeSettingsTab: tab }),
    }),
    {
      name: 'arbitrage-monitor-settings',
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
