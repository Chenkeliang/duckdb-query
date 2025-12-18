/**
 * 自定义 AG Grid 表头组件
 * 集成列筛选功能
 */

import React, { useMemo, useState } from 'react';
import { Filter } from 'lucide-react';
import type { IHeaderParams } from 'ag-grid-community';

import { Button } from '@/new/components/ui/button';
import { ColumnFilterMenu } from './ColumnFilterMenu';
import type { ColumnValueFilterContext } from './AGGridWrapper';

export interface CustomHeaderComponentProps extends IHeaderParams {
  // 可以添加自定义 props
}

/**
 * 自定义表头组件
 */
export function CustomHeaderComponent(props: CustomHeaderComponentProps) {
  const { column, displayName, api: gridApi, context } = props;
  const [filterOpen, setFilterOpen] = useState(false);

  const columnValueFilters = (context as any)?.columnValueFilters as
    | ColumnValueFilterContext
    | undefined;

  // 检查列是否有活动筛选（我们使用自定义 external filter）
  const isFiltered = useMemo(() => {
    const colId = column.getColId();
    return !!columnValueFilters?.getColumnValueFilter(colId);
  }, [column, columnValueFilters]);

  return (
    <div className="flex items-center justify-between w-full h-full px-2">
      {/* 列标题 */}
      <span className="flex-1 truncate font-medium">{displayName}</span>

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
          className={`h-6 w-6 p-0 ${isFiltered ? 'text-primary' : 'text-muted-foreground'}`}
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
