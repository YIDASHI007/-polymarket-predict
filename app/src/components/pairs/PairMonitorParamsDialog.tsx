import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePairStore } from '@/stores/pairStore';
import type { PairMonitorParams } from '@/types';

interface PairMonitorParamsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PairMonitorParamsDialog({ open, onOpenChange }: PairMonitorParamsDialogProps) {
  const { defaultMonitorParams, updateDefaultMonitorParams, pairs, updatePairMonitorParams } = usePairStore();
  const [form, setForm] = useState<PairMonitorParams>(defaultMonitorParams);

  useEffect(() => {
    if (open) {
      setForm(defaultMonitorParams);
    }
  }, [open, defaultMonitorParams]);

  const handleSave = () => {
    updateDefaultMonitorParams(form);
    onOpenChange(false);
  };

  const handleApplyToAll = () => {
    pairs.forEach((pair) => {
      updatePairMonitorParams(pair.id, form);
    });
    updateDefaultMonitorParams(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>修改套利参数</DialogTitle>
          <DialogDescription>
            仅配置三个参数：市场1手续费、市场2手续费、播报最低理论利润率。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">市场1手续费(%)</label>
            <Input
              value={(form.predictFeeRate * 100).toFixed(2)}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, predictFeeRate: Math.max(0, Number(e.target.value || 0)) / 100 }))
              }
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">市场2手续费(%)</label>
            <Input
              value={(form.polymarketFeeRate * 100).toFixed(2)}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, polymarketFeeRate: Math.max(0, Number(e.target.value || 0)) / 100 }))
              }
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">播报最低理论利润率(%)</label>
            <Input
              value={form.minProfitPercent}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, minProfitPercent: Math.max(0, Number(e.target.value || 0)) }))
              }
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="outline" onClick={handleSave}>
            仅保存为默认
          </Button>
          <Button onClick={handleApplyToAll}>保存并同步到现有配对</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
