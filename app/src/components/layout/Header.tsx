// 头部组件

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMarketStore } from '@/stores/marketStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatRelativeTime } from '@/utils/formatters';
import { cn } from '@/lib/utils';

interface HeaderProps {
  onMenuClick?: () => void;
  isMobile?: boolean;
}

export function Header({ onMenuClick, isMobile = false }: HeaderProps) {
  const { lastUpdateTime, refreshAll, isLoadingMarkets, isLoadingArbitrage } = useMarketStore();
  const { settings, setSettingsOpen } = useSettingsStore();
  
  const isLoading = isLoadingMarkets || isLoadingArbitrage;
  const apiKey = settings.apiKeys.predictFun;
  
  return (
    <header className="flex items-center justify-between h-16 px-4 border-b bg-card">
      {/* 左侧 */}
      <div className="flex items-center gap-3">
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={onMenuClick}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </Button>
        )}
        
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">跨市场套利监控</h1>
          <Badge variant="secondary" className="text-xs">
            <span className="w-2 h-2 mr-1 rounded-full bg-green-500 animate-pulse" />
            实时监控
          </Badge>
        </div>
      </div>
      
      {/* 右侧 */}
      <div className="flex items-center gap-2">
        {/* 最后更新时间 */}
        {lastUpdateTime && (
          <span className="hidden sm:inline text-xs text-muted-foreground">
            更新于 {formatRelativeTime(lastUpdateTime)}
          </span>
        )}
        
        {/* 刷新按钮 */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => apiKey && refreshAll(apiKey)}
          disabled={isLoading || !apiKey}
          className="gap-2"
        >
          <svg 
            className={cn("w-4 h-4", isLoading && "animate-spin")} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="hidden sm:inline">刷新</span>
        </Button>
        
        {/* 设置按钮 */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSettingsOpen(true)}
          className="gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="hidden sm:inline">设置</span>
        </Button>
        
        {/* 帮助按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:flex"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </Button>
      </div>
    </header>
  );
}
