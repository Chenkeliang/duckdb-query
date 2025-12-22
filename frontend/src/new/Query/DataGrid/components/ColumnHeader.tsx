/**
 * ColumnHeader - 列头组件
 */

import * as React from 'react';
import { useCallback } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FilterMenu } from './FilterMenu';

export interface ColumnHeaderProps {
  /** 列字段名 */
  field: string;
  /** 显示名称 */
  headerName?: string;
  /** 列宽 */
  width?: number;
  /** 排序方向 */
  sortDirection?: 'asc' | 'desc' | null;
  /** 是否有活跃筛选 */
  hasActiveFilter?: boolean;
  /** 当前已应用的筛选值（用于初始化/重置筛选面板） */
  activeFilterValue?: unknown;
  /** 是否可排序 */
  sortable?: boolean;
  /** 是否可筛选 */
  filterable?: boolean;
  /** 是否可调整宽度 */
  resizable?: boolean;
  /** 数据（用于筛选） */
  data?: Record<string, unknown>[];
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
  /** 双击列边框自动调整列宽回调 */
  onAutoFitColumn?: (field: string) => void;
  /** 自定义类名 */
  className?: string;
}

export const ColumnHeader: React.FC<ColumnHeaderProps> = ({
  field,
  headerName,
  width,
  sortDirection,
  hasActiveFilter = false,
  activeFilterValue,
  sortable = true,
  filterable = true,
  resizable = true,
  data = [],
  onSortClick,
  onCopyColumnName: _onCopyColumnName,
  onFilterChange,
  onClearFilter,
  onResizeStart,
  onAutoFitColumn,
  className,
}) => {
  const displayName = headerName || field;

  const handleSortClick = (e: React.MouseEvent) => {
    if (sortable) {
      onSortClick?.(field, e.ctrlKey || e.metaKey);
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onResizeStart?.(field, e.clientX);
  };

  // 双击列边框自动调整列宽
  const handleResizeDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onAutoFitColumn?.(field);
  }, [field, onAutoFitColumn]);

  // 排序图标
  const SortIcon = sortDirection === 'asc' ? (
    <ArrowUp className="dq-data-grid-sort-icon active h-3 w-3 flex-shrink-0" />
  ) : sortDirection === 'desc' ? (
    <ArrowDown className="dq-data-grid-sort-icon active h-3 w-3 flex-shrink-0" />
  ) : sortable ? (
    <ArrowUpDown className="dq-data-grid-sort-icon h-3 w-3 opacity-0 group-hover:opacity-50 flex-shrink-0" />
  ) : null;

  return (
    <div
      className={cn(
        'dq-data-grid-header-cell group relative',
        sortable && 'cursor-pointer',
        className
      )}
      style={{ width, minWidth: width, maxWidth: width }}
      onClick={handleSortClick}
    >
      {/* 列名 */}
      <span className="flex-1 truncate">{displayName}</span>

      {/* 排序图标 */}
      {SortIcon}

      {/* 筛选图标 */}
      {filterable && (
        <div onClick={(e) => e.stopPropagation()}>
          <FilterMenu
            column={field}
            data={data}
            hasActiveFilter={hasActiveFilter}
            activeFilterValue={activeFilterValue}
            onFilterChange={onFilterChange}
            onClearFilter={onClearFilter}
          />
        </div>
      )}

      {/* 调整宽度手柄 */}
      {resizable && (
        <div
          className="dq-data-grid-resize-handle"
          onMouseDown={handleResizeMouseDown}
          onDoubleClick={handleResizeDoubleClick}
        />
      )}
    </div>
  );
};

export { ColumnHeader as default };
