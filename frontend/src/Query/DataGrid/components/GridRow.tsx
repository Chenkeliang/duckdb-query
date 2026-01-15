/**
 * GridRow - 行组件
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface GridRowProps {
  /** 行索引 */
  rowIndex: number;
  /** 行高 */
  height?: number;
  /** 垂直偏移（虚拟滚动） */
  top?: number;
  /** 是否悬停 */
  isHovered?: boolean;
  /** 子元素 */
  children: React.ReactNode;
  /** 自定义类名 */
  className?: string;
}

export const GridRow: React.FC<GridRowProps> = React.memo(({
  rowIndex,
  height = 32,
  top,
  isHovered = false,
  children,
  className,
}) => {
  const isVirtualized = top !== undefined;

  return (
    <div
      role="row"
      aria-rowindex={rowIndex + 1}
      className={cn(
        'dq-data-grid-row relative',
        isHovered && 'hover',
        className
      )}
      style={{
        height: height,
        position: isVirtualized ? 'absolute' : undefined,
        top: top,
        left: 0,
        right: isVirtualized ? 0 : undefined,
      }}
    >
      {children}
    </div>
  );
});

GridRow.displayName = 'GridRow';

export { GridRow as default };
