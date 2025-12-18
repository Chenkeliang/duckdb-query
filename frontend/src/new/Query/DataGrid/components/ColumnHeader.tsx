/**
 * ColumnHeader - 列头组件
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowDown, Copy, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/new/components/ui/tooltip';
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
  onCopyColumnName,
  onFilterChange,
  onClearFilter,
  onResizeStart,
  className,
}) => {
  const { t } = useTranslation();
  const displayName = headerName || field;

  const handleSortClick = (e: React.MouseEvent) => {
    if (sortable) {
      onSortClick?.(field, e.ctrlKey || e.metaKey);
    }
  };

  const handleCopyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopyColumnName?.(field);
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onResizeStart?.(field, e.clientX);
  };

  return (
    <div
      className={cn(
        'relative flex items-center gap-1 px-2 h-8 border-r border-b border-border',
        'bg-muted/50 font-medium text-sm select-none',
        sortable && 'cursor-pointer hover:bg-muted',
        className
      )}
      style={{ width, minWidth: width, maxWidth: width }}
      onClick={handleSortClick}
    >
      {/* 列名 */}
      <span className="flex-1 truncate">{displayName}</span>

      {/* 排序图标 */}
      {sortDirection && (
        <span className="text-primary">
          {sortDirection === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )}
        </span>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        {/* 复制列名 */}
        <Tooltip>
          <TooltipTrigger
            className="inline-flex h-6 w-6 items-center justify-center rounded-md p-0 text-muted-foreground hover:text-foreground hover:bg-accent"
            onClick={handleCopyClick}
          >
            <Copy className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipContent>{t('dataGrid.copyColumnName')}</TooltipContent>
        </Tooltip>

        {/* 筛选菜单 */}
        {filterable && (
          <FilterMenu
            column={field}
            data={data}
            hasActiveFilter={hasActiveFilter}
            activeFilterValue={activeFilterValue}
            onFilterChange={onFilterChange}
            onClearFilter={onClearFilter}
          />
        )}
      </div>

      {/* 调整宽度手柄 */}
      {resizable && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50"
          onMouseDown={handleResizeMouseDown}
        >
          <GripVertical className="h-full w-1 text-transparent" />
        </div>
      )}
    </div>
  );
};

export { ColumnHeader as default };
