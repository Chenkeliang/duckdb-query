/**
 * 列筛选命令面板组件
 * 提供快速搜索和选择列进行筛选的功能
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter } from 'lucide-react';
import type { Column, GridApi } from 'ag-grid-community';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/new/components/ui/command';

export interface ColumnFilterCommandProps {
  /** 是否打开 */
  open: boolean;
  /** 打开状态变化回调 */
  onOpenChange: (open: boolean) => void;
  /** AG Grid API */
  gridApi: GridApi | null;
  /** 选择列回调 */
  onSelectColumn: (column: Column) => void;
}

/**
 * 列筛选命令面板
 * 
 * 使用 Ctrl+K / Cmd+K 打开，快速搜索并选择要筛选的列
 */
export function ColumnFilterCommand({
  open,
  onOpenChange,
  gridApi,
  onSelectColumn,
}: ColumnFilterCommandProps) {
  const { t } = useTranslation('common');

  // 获取所有列 - 检查 grid 是否已被销毁
  const columns = useMemo(() => {
    // 检查 gridApi 是否存在且未被销毁
    if (!gridApi || gridApi.isDestroyed?.()) return [];
    
    try {
      const columnDefs = gridApi.getColumnDefs();
      if (!columnDefs) return [];

      return columnDefs
        .filter((colDef: any) => colDef.field) // 只显示有 field 的列
        .map((colDef: any) => ({
          field: colDef.field,
          headerName: colDef.headerName || colDef.field,
          column: gridApi.getColumn(colDef.field),
        }))
        .filter((item) => item.column !== null);
    } catch (error) {
      // Grid 可能已被销毁，返回空数组
      console.warn('ColumnFilterCommand: Grid API call failed, grid may be destroyed');
      return [];
    }
  }, [gridApi]);

  // 处理列选择
  const handleSelect = (column: Column) => {
    onSelectColumn(column);
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={t('result.filter.searchColumn', '搜索列...')}
      />
      <CommandList>
        <CommandEmpty>
          {t('result.filter.noColumns', '未找到列')}
        </CommandEmpty>
        <CommandGroup heading={t('result.filter.availableColumns', '可用列')}>
          {columns.map((item) => (
            <CommandItem
              key={item.field}
              value={item.field}
              onSelect={() => item.column && handleSelect(item.column)}
            >
              <Filter className="mr-2 h-4 w-4" />
              <span>{item.headerName}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
