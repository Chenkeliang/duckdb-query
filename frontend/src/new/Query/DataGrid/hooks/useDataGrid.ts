/**
 * useDataGrid - TanStack Table 封装 Hook
 */

import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type ColumnDef as TanStackColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type ColumnSizingState,
  type Table,
  type FilterFn,
} from '@tanstack/react-table';
import type { ColumnDef, ValueFilter, ConditionFilter } from '../types';

/**
 * 自定义筛选函数 - 支持 ValueFilter 和 ConditionFilter
 */
const customFilterFn: FilterFn<Record<string, unknown>> = (row, columnId, filterValue) => {
  if (!filterValue) return true;
  
  const cellValue = row.getValue(columnId);
  const cellStr = cellValue === null || cellValue === undefined ? '(空)' : String(cellValue);
  
  // 处理 ValueFilter（selectedValues + mode）
  if (filterValue && typeof filterValue === 'object' && 'selectedValues' in filterValue) {
    const vf = filterValue as ValueFilter;
    const { selectedValues, mode } = vf;
    
    if (!selectedValues || selectedValues.size === 0) {
      // include 空集合 => 结果为空；exclude 空集合 => 等同不过滤
      return mode === 'exclude';
    }
    
    const isSelected = selectedValues.has(cellStr);
    return mode === 'include' ? isSelected : !isSelected;
  }
  
  // 处理 ConditionFilter（type + value）
  if (filterValue && typeof filterValue === 'object' && 'type' in filterValue && 'value' in filterValue) {
    const cf = filterValue as ConditionFilter;
    const { type, value } = cf;
    
    if (!value) return true;
    
    const lowerCell = cellStr.toLowerCase();
    const lowerValue = value.toLowerCase();
    
    switch (type) {
      case 'contains':
        return lowerCell.includes(lowerValue);
      case 'equals':
        return lowerCell === lowerValue;
      case 'startsWith':
        return lowerCell.startsWith(lowerValue);
      case 'endsWith':
        return lowerCell.endsWith(lowerValue);
      default:
        return true;
    }
  }
  
  // 默认：字符串包含匹配
  if (typeof filterValue === 'string') {
    return cellStr.toLowerCase().includes(filterValue.toLowerCase());
  }
  
  return true;
};

export interface UseDataGridOptions {
  /** 行数据 */
  data: Record<string, unknown>[];
  /** 列定义（可选，自动推断） */
  columns?: ColumnDef[];
  /** 初始排序状态 */
  initialSorting?: SortingState;
  /** 初始筛选状态 */
  initialFilters?: ColumnFiltersState;
  /** 初始列宽状态 */
  initialColumnSizing?: ColumnSizingState;
}

export interface UseDataGridReturn {
  /** TanStack Table 实例 */
  table: Table<Record<string, unknown>>;
  /** 排序状态 */
  sorting: SortingState;
  /** 设置排序状态 */
  setSorting: React.Dispatch<React.SetStateAction<SortingState>>;
  /** 筛选状态 */
  columnFilters: ColumnFiltersState;
  /** 设置筛选状态 */
  setColumnFilters: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
  /** 列宽状态 */
  columnSizing: ColumnSizingState;
  /** 设置列宽状态 */
  setColumnSizing: React.Dispatch<React.SetStateAction<ColumnSizingState>>;
  /** 可见列字段名列表 */
  visibleColumns: string[];
  /** 筛选后的行数据 */
  filteredData: Record<string, unknown>[];
  /** 筛选后的行数 */
  filteredRowCount: number;
}

/**
 * 从数据自动推断列定义
 */
function inferColumns(data: Record<string, unknown>[]): ColumnDef[] {
  if (data.length === 0) return [];

  const firstRow = data[0];
  return Object.keys(firstRow).map(field => ({
    field,
    headerName: field,
    sortable: true,
    filterable: true,
    resizable: true,
  }));
}

/**
 * 转换列定义为 TanStack Table 格式
 */
function toTanStackColumns(
  columns: ColumnDef[]
): TanStackColumnDef<Record<string, unknown>>[] {
  return columns.map(col => ({
    id: col.field,
    accessorKey: col.field,
    header: col.headerName || col.field,
    size: col.width,
    minSize: col.minWidth,
    maxSize: col.maxWidth,
    enableSorting: col.sortable !== false,
    enableColumnFilter: col.filterable !== false,
    enableResizing: col.resizable !== false,
    filterFn: customFilterFn, // 使用自定义筛选函数
  }));
}

export function useDataGrid({
  data,
  columns: propColumns,
  initialSorting = [],
  initialFilters = [],
  initialColumnSizing = {},
}: UseDataGridOptions): UseDataGridReturn {
  // 状态
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(initialFilters);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(initialColumnSizing);

  // 列定义
  const columns = useMemo(() => {
    const cols = propColumns || inferColumns(data);
    return toTanStackColumns(cols);
  }, [propColumns, data]);

  // TanStack Table 实例
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnSizing,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    columnResizeMode: 'onChange',
    // 注册自定义筛选函数
    filterFns: {
      customFilter: customFilterFn,
    },
  });

  // 可见列字段名列表
  const visibleColumns = useMemo(() => {
    return table.getVisibleLeafColumns().map((col) => col.id);
  }, [table, columns]);

  const rowModel = table.getRowModel();

  // 筛选/排序后的行数据
  // 注意：useReactTable 返回的 table 实例引用稳定，如果仅依赖 [table] 会导致 filteredData 不更新，
  // 从而出现“筛选行数变了但渲染还是旧数据”的错位问题。
  const filteredData = useMemo(() => {
    return rowModel.rows.map((row) => row.original);
  }, [rowModel.rows]);

  const filteredRowCount = rowModel.rows.length;

  return {
    table,
    sorting,
    setSorting,
    columnFilters,
    setColumnFilters,
    columnSizing,
    setColumnSizing,
    visibleColumns,
    filteredData,
    filteredRowCount,
  };
}
