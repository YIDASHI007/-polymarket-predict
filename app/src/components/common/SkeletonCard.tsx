// 骨架屏组件 - 提升加载感知速度

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <Card className={cn('animate-pulse', className)}>
      <CardContent className="p-4">
        {/* 头部：平台和状态 */}
        <div className="flex items-center gap-2 mb-3">
          <div className="h-5 w-20 bg-muted rounded" />
          <div className="h-5 w-14 bg-muted rounded" />
        </div>

        {/* 标题 */}
        <div className="h-4 bg-muted rounded w-3/4 mb-2" />
        <div className="h-4 bg-muted rounded w-1/2 mb-4" />

        {/* 描述 */}
        <div className="space-y-2 mb-4">
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-5/6" />
        </div>

        {/* 价格区域 */}
        <div className="flex justify-end gap-4 mb-4">
          <div className="text-right">
            <div className="h-3 w-8 bg-muted rounded mb-1" />
            <div className="h-5 w-12 bg-muted rounded" />
          </div>
          <div className="text-right">
            <div className="h-3 w-8 bg-muted rounded mb-1" />
            <div className="h-5 w-12 bg-muted rounded" />
          </div>
        </div>

        {/* 底部信息 */}
        <div className="flex justify-between pt-3 border-t">
          <div className="h-3 w-24 bg-muted rounded" />
          <div className="h-3 w-16 bg-muted rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

// 骨架屏列表
export function SkeletonList({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </>
  );
}
