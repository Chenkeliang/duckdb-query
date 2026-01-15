/**
 * SelectionOverlay - 选区覆盖层组件
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { SelectionRange } from '../types';

export interface SelectionOverlayProps {
  /** 选区范围 */
  range: SelectionRange | null;
  /** 行高 */
  rowHeight: number;
  /** 列宽数组 */
  columnWidths: number[];
  /** 自定义类名 */
  className?: string;
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  range,
  rowHeight,
  columnWidths,
  className,
}) => {
  const offsets = React.useMemo(() => {
    const out: number[] = new Array(columnWidths.length + 1);
    let acc = 0;
    out[0] = 0;
    for (let i = 0; i < columnWidths.length; i++) {
      acc += columnWidths[i] || 0;
      out[i + 1] = acc;
    }
    return out;
  }, [columnWidths]);

  if (!range) return null;

  // 计算选区位置和大小
  const top = range.minRow * rowHeight;
  const height = (range.maxRow - range.minRow + 1) * rowHeight;

  const safeMinCol = Math.max(0, Math.min(range.minCol, columnWidths.length));
  const safeMaxCol = Math.max(0, Math.min(range.maxCol + 1, columnWidths.length));

  const left = offsets[safeMinCol] || 0;
  const width = Math.max(0, (offsets[safeMaxCol] || 0) - left);

  return (
    <div
      className={cn(
        'absolute pointer-events-none',
        'border-2 border-primary bg-primary/5',
        className
      )}
      style={{
        top,
        left,
        width,
        height,
      }}
    />
  );
};

export { SelectionOverlay as default };
