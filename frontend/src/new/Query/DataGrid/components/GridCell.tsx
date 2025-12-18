/**
 * GridCell - 单元格组件
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { isNullValue, isNumericValue } from '../utils/formatters';

export interface GridCellProps {
  /** 单元格值 */
  value: unknown;
  /** 行索引 */
  rowIndex: number;
  /** 列索引 */
  colIndex: number;
  /** 是否选中 */
  isSelected?: boolean;
  /** 是否为焦点单元格 */
  isFocused?: boolean;
  /** 列宽 */
  width?: number;
  /** 左偏移（用于列虚拟化/绝对定位布局） */
  left?: number;
  /** 行高 */
  height?: number;
  /** 鼠标按下回调（用于拖拽选区） */
  onMouseDown?: (rowIndex: number, colIndex: number, e: React.MouseEvent) => void;
  /** 双击回调 */
  onDoubleClick?: (rowIndex: number, colIndex: number) => void;
  /** 鼠标进入回调 */
  onMouseEnter?: (rowIndex: number, colIndex: number) => void;
  /** 自定义类名 */
  className?: string;
}

export const GridCell: React.FC<GridCellProps> = React.memo(({
  value,
  rowIndex,
  colIndex,
  isSelected = false,
  isFocused = false,
  width,
  left,
  height = 32,
  onMouseDown,
  onDoubleClick,
  onMouseEnter,
  className,
}) => {
  const isNull = isNullValue(value);
  const isNumeric = isNumericValue(value);

  const handleMouseDown = (e: React.MouseEvent) => {
    onMouseDown?.(rowIndex, colIndex, e);
  };

  const handleDoubleClick = () => {
    onDoubleClick?.(rowIndex, colIndex);
  };

  const handleMouseEnter = () => {
    onMouseEnter?.(rowIndex, colIndex);
  };

  // 格式化显示值
  const displayValue = isNull ? 'NULL' : String(value);

  return (
    <div
      role="gridcell"
      tabIndex={isFocused ? 0 : -1}
      className={cn(
        'flex items-center px-2 border-r border-b border-border',
        'select-none cursor-default overflow-hidden',
        'hover:bg-accent/50',
        isSelected && 'bg-primary/10',
        isFocused && 'ring-2 ring-primary ring-inset',
        isNull && 'text-muted-foreground italic',
        isNumeric && 'justify-end font-mono',
        className
      )}
      style={{
        position: left !== undefined ? 'absolute' : undefined,
        left: left,
        top: 0,
        width: width,
        height: height,
        minWidth: width,
        maxWidth: width,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
    >
      <span className="truncate">{displayValue}</span>
    </div>
  );
});

GridCell.displayName = 'GridCell';

export { GridCell as default };
