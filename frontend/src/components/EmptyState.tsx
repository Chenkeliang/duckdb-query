import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** 图标 */
  icon?: LucideIcon;
  /** 主标题 */
  title: React.ReactNode;
  /** 副标题/说明 */
  description?: React.ReactNode;
  /** 操作区（按钮等） */
  action?: React.ReactNode;
  /** dashed: 虚线边框占位（拖拽区 / 引导 CTA 风格） */
  variant?: 'plain' | 'dashed';
  /** 紧凑模式（小面板内用更小的图标与间距） */
  compact?: boolean;
  className?: string;
}

/**
 * 统一的空状态：图标 + 标题 + 可选说明 + 可选操作。
 * 全站「暂无数据 / 请先选择 …」等占位统一用它。
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'plain',
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center text-muted-foreground',
        compact ? 'gap-1.5 py-8' : 'gap-2 py-12',
        variant === 'dashed' && 'rounded-xl border-2 border-dashed border-border',
        className
      )}
    >
      {Icon ? (
        <Icon className={cn('opacity-50', compact ? 'h-8 w-8' : 'h-10 w-10')} />
      ) : null}
      <p className={cn('font-medium text-foreground/75', compact ? 'text-sm' : 'text-base')}>
        {title}
      </p>
      {description ? (
        <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export default EmptyState;
