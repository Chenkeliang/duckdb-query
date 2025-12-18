/**
 * GridHeader - 列头容器组件
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ColumnHeader } from './ColumnHeader';
import type { ColumnDef } from '../types';

export interface GridHeaderProps {
  /** 列定义 */
  columns: ColumnDef[];
  /** 列宽数组 */
  columnWidths: number[];
  /** 排序状态 */
  sortingState?: Record<string, 'asc' | 'desc'>;
  /** 筛选状态 */
  filterState?: Record<string, unknown>;
  /** 数据（用于筛选） */
  data?: Record<string, unknown>[];
  /** 滚动偏移 */
  scrollLeft?: number;
  /** 排序点击回调（multi=true 表示 Ctrl/Cmd 多列排序） */
  onSortClick?: (field: string, multi: boolean) => void;
  /** 复制列名回调 */
  onCopyColumnName?: (field: string) => void;
  /** 筛选变化回调 */
  onFilterChange?: (field: string, filter: unknown) => void;
  /** 清除筛选回调 */
  onClearFilter?: (field: string) => void;
  /** 列宽调整开始回调 */
  onResizeStart?: (field: string, startX: number) => void;
  /** 容器 ref */
  containerRef?: React.RefObject<HTMLDivElement | null>;
  /** 自定义类名 */
  className?: string;
}

export const GridHeader: React.FC<GridHeaderProps> = ({
  columns,
  columnWidths,
  sortingState = {},
  filterState = {},
  data = [],
  scrollLeft = 0,
  onSortClick,
  onCopyColumnName,
  onFilterChange,
  onClearFilter,
  onResizeStart,
  containerRef,
  className,
}) => {
  // 计算总宽度
  const totalWidth = columnWidths.reduce((sum, w) => sum + w, 0);

  return (
    <div
      ref={containerRef}
      className={cn(
        'overflow-hidden border-b border-border bg-muted/30',
        className
      )}
    >
      {/* 内部容器，用于水平滚动同步 */}
      <div
        className="flex"
        style={{
          minWidth: totalWidth,
          transform: `translateX(-${scrollLeft}px)`,
        }}
      >
        {columns.map((col, index) => (
          <ColumnHeader
            key={col.field}
            field={col.field}
            headerName={col.headerName}
            width={columnWidths[index]}
            sortDirection={sortingState[col.field] || null}
            hasActiveFilter={!!filterState[col.field]}
            activeFilterValue={filterState[col.field]}
            sortable={col.sortable !== false}
            filterable={col.filterable !== false}
            resizable={col.resizable !== false}
            data={data}
            onSortClick={onSortClick}
            onCopyColumnName={onCopyColumnName}
            onFilterChange={onFilterChange}
            onClearFilter={onClearFilter}
            onResizeStart={onResizeStart}
          />
        ))}
      </div>
    </div>
  );
};

export { GridHeader as default };
