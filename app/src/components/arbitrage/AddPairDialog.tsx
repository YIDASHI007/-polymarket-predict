// 添加监控对的对话框 —— 需要用户贴几个 ID：
//   - Polymarket conditionId
//   - Polymarket YES clob_token_id
//   - Polymarket NO clob_token_id
//   - Predict.fun marketId
//
// 复杂但准确。自动配对（基于标题相似度）需要先有完整的市场列表，属于 Phase 2，这里先不做。

import { useState, type FormEvent } from 'react';
import { arbitrageApi } from '@/api/arbitrageV2';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAdded: () => void;
}

export function AddPairDialog({ open, onOpenChange, onAdded }: Props) {
  const [title, setTitle] = useState('');
  const [endDate, setEndDate] = useState('');
  const [polyConditionId, setPolyConditionId] = useState('');
  const [polyYesId, setPolyYesId] = useState('');
  const [polyNoId, setPolyNoId] = useState('');
  const [predictMarketId, setPredictMarketId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setEndDate('');
    setPolyConditionId('');
    setPolyYesId('');
    setPolyNoId('');
    setPredictMarketId('');
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) return setError('请填写标题');
    if (!polyConditionId.trim() || !polyYesId.trim() || !polyNoId.trim())
      return setError('Polymarket 三项都必填');
    if (!predictMarketId.trim()) return setError('Predict.fun marketId 必填');

    setSubmitting(true);
    try {
      await arbitrageApi.watchPair({
        title: title.trim(),
        endDate: endDate.trim() || undefined,
        polymarket: {
          conditionId: polyConditionId.trim(),
          yesAssetId: polyYesId.trim(),
          noAssetId: polyNoId.trim(),
        },
        predict: { marketId: predictMarketId.trim() },
        matchConfidence: 1.0,
        matchReason: 'manual',
      });
      reset();
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>添加监控对</DialogTitle>
          <DialogDescription>
            手动绑定 Polymarket 和 Predict.fun 上同一事件的市场。添加后 WebSocket 将实时订阅订单簿。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="title">标题</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：BTC reach $100k by end of 2025"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="endDate">结算时间（可选，ISO 格式）</Label>
            <Input
              id="endDate"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="2026-01-01T00:00:00Z"
            />
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="text-xs font-medium text-blue-600 dark:text-blue-400">Polymarket</div>
            <div className="space-y-1.5">
              <Label htmlFor="polyCondition" className="text-xs">
                conditionId
              </Label>
              <Input
                id="polyCondition"
                value={polyConditionId}
                onChange={(e) => setPolyConditionId(e.target.value)}
                placeholder="0x..."
                className="font-mono text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="polyYes" className="text-xs">
                  YES clob_token_id
                </Label>
                <Input
                  id="polyYes"
                  value={polyYesId}
                  onChange={(e) => setPolyYesId(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="polyNo" className="text-xs">
                  NO clob_token_id
                </Label>
                <Input
                  id="polyNo"
                  value={polyNoId}
                  onChange={(e) => setPolyNoId(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="text-xs font-medium text-purple-600 dark:text-purple-400">
              Predict.fun
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="predictId" className="text-xs">
                marketId
              </Label>
              <Input
                id="predictId"
                value={predictMarketId}
                onChange={(e) => setPredictMarketId(e.target.value)}
                placeholder="0x... 或数字"
                className="font-mono text-xs"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? '添加中...' : '开始监控'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
