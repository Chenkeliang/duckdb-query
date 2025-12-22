/**
 * 自定义 AG Grid 表头组件
 * 集成列筛选和排序功能
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Filter, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { IHeaderParams, SortDirection } from 'ag-grid-community';

import { Button } from '@/new/components/ui/button';
import { ColumnFilterMenu } from './ColumnFilterMenu';
import type { ColumnValueFilterContext } from './AGGridWrapper';

export interface CustomHeaderComponentProps extends IHeaderParams {
  // 可以添加自定义 props
}

/**
 * 自定义表头组件
 * 支持排序和筛选功能
 */
export function CustomHeaderComponent(props: CustomHeaderComponentProps) {
  const { column, displayName, api: gridApi, context, enableSorting, setSort } = props;
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortState, setSortState] = useState<SortDirection>(null);

  const columnValueFilters = (context as any)?.columnValueFilters as
    | ColumnValueFilterContext
    | undefined;

  // 检查列是否有活动筛选（我们使用自定义 external filter）
  const isFiltered = useMemo(() => {
    const colId = column.getColId();
    return !!columnValueFilters?.getColumnValueFilter(colId);
  }, [column, columnValueFilters]);

  // 监听排序变化
  useEffect(() => {
    const updateSortState = () => {
      setSortState(column.getSort() ?? null);
    };

    // 初始化
    updateSortState();

    // 监听排序变化事件
    gridApi?.addEventListener('sortChanged', updateSortState);

    return () => {
      gridApi?.removeEventListener('sortChanged', updateSortState);
    };
  }, [column, gridApi]);

  // 处理排序点击
  const handleSortClick = useCallback(
    (e: React.MouseEvent) => {
      if (!enableSorting) return;

      const multiSort = e.shiftKey;
      
      // 循环排序状态: null -> asc -> desc -> null
      let nextSort: SortDirection;
      if (sortState === null) {
        nextSort = 'asc';
      } else if (sortState === 'asc') {
        nextSort = 'desc';
      } else {
        nextSort = null;
      }

      setSort(nextSort, multiSort);
    },
    [enableSorting, sortState, setSort]
  );

  // 排序图标
  const SortIcon = useMemo(() => {
    if (sortState === 'asc') {
      return <ArrowUp className="h-3.5 w-3.5 text-primary" />;
    }
    if (sortState === 'desc') {
      return <ArrowDown className="h-3.5 w-3.5 text-primary" />;
    }
    return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground opacity-50" />;
  }, [sortState]);

  return (
    <div className="flex items-center justify-between w-full h-full gap-1">
      {/* 列标题 + 排序 */}
      <div
        className={`flex items-center gap-1 flex-1 min-w-0 ${enableSorting ? 'cursor-pointer hover:text-foreground' : ''}`}
        onClick={handleSortClick}
      >
        <span className="truncate font-medium text-sm">{displayName}</span>
        {enableSorting && SortIcon}
      </div>

      {/* 筛选按钮 */}
      <ColumnFilterMenu
        column={column}
        gridApi={gridApi}
        context={columnValueFilters}
        open={filterOpen}
        onOpenChange={setFilterOpen}
      >
        <Button
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-0 flex-shrink-0 ${isFiltered ? 'text-primary' : 'text-muted-foreground opacity-50 hover:opacity-100'}`}
          onClick={(e) => {
            e.stopPropagation();
            setFilterOpen(true);
          }}
        >
          <Filter className="h-3.5 w-3.5" />
        </Button>
      </ColumnFilterMenu>
    </div>
  );
}
