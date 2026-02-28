import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMarketStore } from '@/stores/marketStore';
import { usePairStore } from '@/stores/pairStore';
import { useArbitrageNotificationStore } from '@/stores/arbitrageNotificationStore';

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  collapsed?: boolean;
}

const navItems = [
  { id: 'markets', label: '市场列表', icon: 'LayoutGrid' },
  { id: 'pairs', label: '我的配对', icon: 'Link' },
  { id: 'watchlist', label: '套利通知', icon: 'Star' },
  { id: 'analytics', label: '数据分析', icon: 'BarChart3' },
  { id: 'settings', label: '设置', icon: 'Settings' },
];

function Icon({ name, className }: { name: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    LayoutGrid: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
    Star: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
    BarChart3: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    Link: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
    Settings: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  };

  return icons[name] || null;
}

export function Sidebar({ activeTab, onTabChange, collapsed = false }: SidebarProps) {
  const { arbitrageOpportunities } = useMarketStore();
  void arbitrageOpportunities;
  const { pairs } = usePairStore();
  const { cards } = useArbitrageNotificationStore();

  const pairsCount = pairs.length;
  const notificationsCount = cards.length;

  return (
    <div className={cn('flex flex-col h-full bg-card border-r transition-all duration-300', collapsed ? 'w-16' : 'w-60')}>
      <div className="flex items-center h-16 px-4 border-b">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        {!collapsed && <span className="ml-3 font-semibold text-sm">套利监控</span>}
      </div>

      <ScrollArea className="flex-1 py-2">
        <nav className="space-y-1 px-2">
          {navItems.map((item) => (
            <Button
              key={item.id}
              variant={activeTab === item.id ? 'secondary' : 'ghost'}
              className={cn('w-full justify-start gap-3 h-10', collapsed && 'justify-center px-2', activeTab === item.id && 'bg-secondary')}
              onClick={() => onTabChange(item.id)}
            >
              <Icon name={item.icon} className="w-5 h-5 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left text-sm">{item.label}</span>
                  {item.id === 'pairs' && pairsCount > 0 && (
                    <span className="inline-flex min-w-[22px] h-5 px-1.5 items-center justify-center text-[11px] font-semibold text-white rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 shadow-sm ring-1 ring-blue-300/40">
                      {pairsCount}
                    </span>
                  )}
                  {item.id === 'watchlist' && notificationsCount > 0 && (
                    <span className="inline-flex min-w-[22px] h-5 px-1.5 items-center justify-center text-[11px] font-semibold text-white rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 shadow-sm ring-1 ring-emerald-300/40">
                      {notificationsCount}
                    </span>
                  )}
                </>
              )}
            </Button>
          ))}
        </nav>
      </ScrollArea>

      {!collapsed && (
        <div className="p-4 border-t">
          <div className="text-xs text-muted-foreground">
            <p>v1.0.0</p>
            <p className="mt-1">实时监控系统</p>
          </div>
        </div>
      )}
    </div>
  );
}
