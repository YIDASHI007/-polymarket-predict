// 设置面板组件

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSettingsStore } from '@/stores/settingsStore';
import { apiClient } from '@/api/client';

// API配置标签页
function ApiSettings() {
  const { settings, updateApiKey } = useSettingsStore();
  const [showPredictKey, setShowPredictKey] = useState(false);
  const [showPolyKey, setShowPolyKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
  // 测试连接
  const handleTestConnection = async () => {
    const apiKey = settings.apiKeys.predictFun;
    
    if (!apiKey) {
      setTestResult({ success: false, message: '请先输入 Predict.fun API Key' });
      return;
    }
    
    setIsTesting(true);
    setTestResult(null);
    
    try {
      // 调用后端健康检查或简单 API 测试连接
      const response = await fetch('http://localhost:3001/health');
      if (!response.ok) {
        throw new Error('后端服务未启动');
      }
      
      // 测试 Predict.fun API
      const markets = await apiClient.getPredictMarkets(apiKey);
      
      setTestResult({ 
        success: true, 
        message: `连接成功！获取到 ${markets.data.length} 个市场` 
      });
    } catch (error: any) {
      setTestResult({ 
        success: false, 
        message: error.message || '连接失败，请检查 API Key 和后端服务' 
      });
    } finally {
      setIsTesting(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">API 配置</h3>
        <p className="text-sm text-muted-foreground">
          配置您的 API Key 以获取实时市场数据
        </p>
      </div>
      
      {/* Predict.fun API Key */}
      <div className="space-y-2">
        <Label htmlFor="predict-key">Predict.fun API Key</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="predict-key"
              type={showPredictKey ? 'text' : 'password'}
              placeholder="输入您的 Predict.fun API Key"
              value={settings.apiKeys.predictFun || ''}
              onChange={(e) => updateApiKey('predictFun', e.target.value || null)}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowPredictKey(!showPredictKey)}
          >
            {showPredictKey ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          从 <a href="https://predict.fun" target="_blank" rel="noreferrer" className="text-primary underline">Predict.fun</a> 获取您的 API Key
        </p>
      </div>
      
      {/* Polymarket API Key */}
      <div className="space-y-2">
        <Label htmlFor="poly-key">Polymarket API Key (可选)</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="poly-key"
              type={showPolyKey ? 'text' : 'password'}
              placeholder="输入您的 Polymarket API Key"
              value={settings.apiKeys.polymarket || ''}
              onChange={(e) => updateApiKey('polymarket', e.target.value || null)}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowPolyKey(!showPolyKey)}
          >
            {showPolyKey ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          从 <a href="https://polymarket.com" target="_blank" rel="noreferrer" className="text-primary underline">Polymarket</a> 获取您的 API Key (可选)
        </p>
      </div>
      
      {/* 测试连接按钮 */}
      <Button 
        className="w-full"
        onClick={handleTestConnection}
        disabled={isTesting}
      >
        {isTesting ? (
          <>
            <svg className="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            测试中...
          </>
        ) : (
          <>
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            测试连接
          </>
        )}
      </Button>
      
      {/* 测试结果 */}
      {testResult && (
        <div className={`p-3 rounded-lg text-sm ${
          testResult.success 
            ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' 
            : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
        }`}>
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {testResult.message}
          </div>
        </div>
      )}
    </div>
  );
}

// 监控设置标签页
function MonitoringSettings() {
  const { settings, updateMonitoring } = useSettingsStore();
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">监控设置</h3>
        <p className="text-sm text-muted-foreground">
          配置数据刷新和监控参数
        </p>
      </div>
      
      {/* 自动刷新 */}
      <div className="flex items-center justify-between">
        <div>
          <Label>自动刷新</Label>
          <p className="text-xs text-muted-foreground">自动获取最新市场数据</p>
        </div>
        <Switch
          checked={settings.monitoring.autoRefresh}
          onCheckedChange={(checked) => updateMonitoring({ autoRefresh: checked })}
        />
      </div>
      
      {/* 刷新间隔 */}
      <div className="space-y-2">
        <Label>刷新间隔: {settings.monitoring.refreshInterval} 秒</Label>
        <Slider
          value={[settings.monitoring.refreshInterval]}
          onValueChange={([value]) => updateMonitoring({ refreshInterval: value })}
          min={10}
          max={300}
          step={10}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>10秒</span>
          <span>5分钟</span>
        </div>
      </div>
      
      {/* 监控开关 */}
      <div className="flex items-center justify-between">
        <div>
          <Label>启用监控</Label>
          <p className="text-xs text-muted-foreground">开启实时套利监控</p>
        </div>
        <Switch
          checked={settings.monitoring.enabled}
          onCheckedChange={(checked) => updateMonitoring({ enabled: checked })}
        />
      </div>
    </div>
  );
}

// 筛选设置标签页
function FilterSettings() {
  const { settings, updateFilters } = useSettingsStore();
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">套利筛选</h3>
        <p className="text-sm text-muted-foreground">
          设置套利机会的筛选条件
        </p>
      </div>
      
      {/* 最小收益率 */}
      <div className="space-y-2">
        <Label>最小收益率: {(settings.filters.minProfitPercent).toFixed(1)}%</Label>
        <Slider
          value={[settings.filters.minProfitPercent]}
          onValueChange={([value]) => updateFilters({ minProfitPercent: value })}
          min={0.5}
          max={10}
          step={0.5}
        />
      </div>
      
      {/* 最大收益率 */}
      <div className="space-y-2">
        <Label>最大收益率: {settings.filters.maxProfitPercent}%</Label>
        <Slider
          value={[settings.filters.maxProfitPercent]}
          onValueChange={([value]) => updateFilters({ maxProfitPercent: value })}
          min={10}
          max={100}
          step={5}
        />
      </div>
      
      {/* 最小置信度 */}
      <div className="space-y-2">
        <Label>最小置信度</Label>
        <Select 
          value={settings.filters.minConfidence} 
          onValueChange={(v) => updateFilters({ minConfidence: v as any })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="high">高置信度</SelectItem>
            <SelectItem value="medium">中置信度</SelectItem>
            <SelectItem value="low">低置信度</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* 最小流动性 */}
      <div className="space-y-2">
        <Label>最小流动性: ${settings.filters.minLiquidity}</Label>
        <Slider
          value={[settings.filters.minLiquidity]}
          onValueChange={([value]) => updateFilters({ minLiquidity: value })}
          min={0}
          max={10000}
          step={500}
        />
      </div>
      
      {/* 最小24h交易量 */}
      <div className="space-y-2">
        <Label>最小24h交易量: ${settings.filters.minVolume24h}</Label>
        <Slider
          value={[settings.filters.minVolume24h]}
          onValueChange={([value]) => updateFilters({ minVolume24h: value })}
          min={0}
          max={5000}
          step={100}
        />
      </div>
    </div>
  );
}

// 通知设置标签页
function NotificationSettings() {
  const { settings, updateNotifications } = useSettingsStore();
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">通知设置</h3>
        <p className="text-sm text-muted-foreground">
          配置套利机会的通知方式
        </p>
      </div>
      
      {/* 启用通知 */}
      <div className="flex items-center justify-between">
        <div>
          <Label>启用通知</Label>
          <p className="text-xs text-muted-foreground">发现套利机会时通知</p>
        </div>
        <Switch
          checked={settings.notifications.enabled}
          onCheckedChange={(checked) => updateNotifications({ enabled: checked })}
        />
      </div>
      
      {/* 最小通知利润 */}
      <div className="space-y-2">
        <Label>最小通知利润: {settings.notifications.minProfitForAlert}%</Label>
        <Slider
          value={[settings.notifications.minProfitForAlert]}
          onValueChange={([value]) => updateNotifications({ minProfitForAlert: value })}
          min={1}
          max={20}
          step={1}
        />
      </div>
      
      {/* 声音提醒 */}
      <div className="flex items-center justify-between">
        <div>
          <Label>声音提醒</Label>
          <p className="text-xs text-muted-foreground">播放声音提示</p>
        </div>
        <Switch
          checked={settings.notifications.soundEnabled}
          onCheckedChange={(checked) => updateNotifications({ soundEnabled: checked })}
        />
      </div>
      
      {/* 浏览器通知 */}
      <div className="flex items-center justify-between">
        <div>
          <Label>浏览器通知</Label>
          <p className="text-xs text-muted-foreground">显示桌面通知</p>
        </div>
        <Switch
          checked={settings.notifications.browserNotification}
          onCheckedChange={(checked) => updateNotifications({ browserNotification: checked })}
        />
      </div>
    </div>
  );
}

// 显示设置标签页
function DisplaySettings() {
  const { settings, updateDisplay } = useSettingsStore();
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">显示设置</h3>
        <p className="text-sm text-muted-foreground">
          自定义界面显示偏好
        </p>
      </div>
      
      {/* 主题 */}
      <div className="space-y-2">
        <Label>主题</Label>
        <Select 
          value={settings.display.theme} 
          onValueChange={(v) => updateDisplay({ theme: v as any })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">浅色</SelectItem>
            <SelectItem value="dark">深色</SelectItem>
            <SelectItem value="system">跟随系统</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* 紧凑模式 */}
      <div className="flex items-center justify-between">
        <div>
          <Label>紧凑模式</Label>
          <p className="text-xs text-muted-foreground">更紧凑的界面布局</p>
        </div>
        <Switch
          checked={settings.display.compactMode}
          onCheckedChange={(checked) => updateDisplay({ compactMode: checked })}
        />
      </div>
      
      {/* 默认排序 */}
      <div className="space-y-2">
        <Label>默认排序</Label>
        <Select 
          value={settings.display.defaultSortBy} 
          onValueChange={(v) => updateDisplay({ defaultSortBy: v as any })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="profit">按利润率</SelectItem>
            <SelectItem value="confidence">按置信度</SelectItem>
            <SelectItem value="time">按时间</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* 每页显示 */}
      <div className="space-y-2">
        <Label>每页显示: {settings.display.itemsPerPage} 条</Label>
        <Slider
          value={[settings.display.itemsPerPage]}
          onValueChange={([value]) => updateDisplay({ itemsPerPage: value })}
          min={10}
          max={100}
          step={10}
        />
      </div>
    </div>
  );
}

// 主组件
export function SettingsPanel() {
  const { isSettingsOpen, setSettingsOpen, activeSettingsTab, setActiveSettingsTab, resetToDefaults } = useSettingsStore();
  
  if (!isSettingsOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <div>
            <CardTitle>系统设置</CardTitle>
            <CardDescription>配置您的监控偏好</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(false)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </CardHeader>
        
        <Tabs value={activeSettingsTab} onValueChange={(v) => setActiveSettingsTab(v as any)} className="flex-1 overflow-hidden">
          <div className="flex h-full">
            {/* 左侧标签 */}
            <TabsList className="flex-col h-full w-40 justify-start bg-muted/50 rounded-none border-r p-2">
              <TabsTrigger value="api" className="w-full justify-start gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                API配置
              </TabsTrigger>
              <TabsTrigger value="monitoring" className="w-full justify-start gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                监控设置
              </TabsTrigger>
              <TabsTrigger value="filters" className="w-full justify-start gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                筛选设置
              </TabsTrigger>
              <TabsTrigger value="notifications" className="w-full justify-start gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                通知设置
              </TabsTrigger>
              <TabsTrigger value="display" className="w-full justify-start gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                显示设置
              </TabsTrigger>
            </TabsList>
            
            {/* 右侧内容 */}
            <div className="flex-1 overflow-auto p-6">
              <TabsContent value="api" className="mt-0">
                <ApiSettings />
              </TabsContent>
              <TabsContent value="monitoring" className="mt-0">
                <MonitoringSettings />
              </TabsContent>
              <TabsContent value="filters" className="mt-0">
                <FilterSettings />
              </TabsContent>
              <TabsContent value="notifications" className="mt-0">
                <NotificationSettings />
              </TabsContent>
              <TabsContent value="display" className="mt-0">
                <DisplaySettings />
              </TabsContent>
            </div>
          </div>
        </Tabs>
        
        {/* 底部按钮 */}
        <div className="flex items-center justify-between p-4 border-t">
          <Button variant="outline" onClick={resetToDefaults}>
            恢复默认
          </Button>
          <Button onClick={() => setSettingsOpen(false)}>
            保存并关闭
          </Button>
        </div>
      </Card>
      
      {/* 遮罩层点击关闭 */}
      <div className="absolute inset-0 -z-10" onClick={() => setSettingsOpen(false)} />
    </div>
  );
}
