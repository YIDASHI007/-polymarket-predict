// API Key 必填提示组件

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useSettingsStore } from '@/stores/settingsStore';

export function ApiKeyRequired() {
  const { setSettingsOpen } = useSettingsStore();

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-amber-100 dark:bg-amber-900/20 rounded-full flex items-center justify-center">
            <svg 
              className="w-8 h-8 text-amber-600 dark:text-amber-400" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" 
              />
            </svg>
          </div>
          
          <h2 className="text-xl font-semibold mb-2">需要 API Key</h2>
          <p className="text-muted-foreground mb-6">
            请先配置 Predict.fun API Key 才能查看市场数据。
            <br />
            <span className="text-sm text-muted-foreground/70">
              数据将从真实 API 获取，不使用模拟数据。
            </span>
          </p>
          
          <div className="space-y-3">
            <Button 
              onClick={() => setSettingsOpen(true)}
              className="w-full"
            >
              <svg 
                className="w-4 h-4 mr-2" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" 
                />
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" 
                />
              </svg>
              打开设置
            </Button>
            
            <div className="text-xs text-muted-foreground">
              <p className="mb-1">获取 API Key:</p>
              <a 
                href="https://predict.fun" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                1. 访问 Predict.fun →
              </a>
              <p className="mt-1">2. 登录后进入开发者设置</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
