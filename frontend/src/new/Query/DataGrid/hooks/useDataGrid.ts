/**
 * useDataGrid - TanStack Table 封装 Hook
 */

import { useMemo, useState, useCallback } from 'react';
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

    // 确保 selectedValues 是 Set（可能被序列化成数组）
    const valuesSet = selectedValues instanceof Set 
      ? selectedValues 
      : new Set(Array.isArray(selectedValues) ? selectedValues : []);

    if (!valuesSet || valuesSet.size === 0) {
      return mode === 'exclude';
    }

    const isSelected = valuesSet.has(cellStr);
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
  /** 所有列字段名列表 */
  allColumns: string[];
  /** 可见列字段名列表 */
  visibleColumns: string[];
  /** 隐藏列字段名集合 */
  hiddenColumns: Set<string>;
  /** 设置隐藏列 */
  setHiddenColumns: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** 筛选后的行数据 */
  filteredData: Record<string, unknown>[];
  /** 筛选后的行数 */
  filteredRowCount: number;
  /** 切换列可见性 */
  toggleColumnVisibility: (field: string) => void;
  /** 显示所有列 */
  showAllColumns: () => void;
  /** 重置列（列宽和可见性） */
  resetColumns: () => void;
}

/**
 * 从数据自动推断列定义
 */
function inferColumns(data: Record<string, unknown>[]): ColumnDef[] {
  if (data.length === 0) return [];

  const firstRow = data[0];
  return Object.keys(firstRow).map((field) => ({
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
function toTanStackColumns(columns: ColumnDef[]): TanStackColumnDef<Record<string, unknown>>[] {
  return columns.map((col) => ({
    id: col.field,
    accessorKey: col.field,
    header: col.headerName || col.field,
    size: col.width,
    minSize: col.minWidth,
    maxSize: col.maxWidth,
    enableSorting: col.sortable !== false,
    enableColumnFilter: col.filterable !== false,
    enableResizing: col.resizable !== false,
    filterFn: customFilterFn,
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
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());

  // 列定义
  const columns = useMemo(() => {
    const cols = propColumns || inferColumns(data);
    return toTanStackColumns(cols);
  }, [propColumns, data]);

  // 所有列字段名
  const allColumns = useMemo(() => {
    return columns.map((col) => col.id as string);
  }, [columns]);

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
    filterFns: {
      customFilter: customFilterFn,
    },
  });

  // 可见列字段名列表（排除隐藏列）
  const visibleColumns = useMemo(() => {
    return allColumns.filter((col) => !hiddenColumns.has(col));
  }, [allColumns, hiddenColumns]);

  const rowModel = table.getRowModel();

  // 筛选/排序后的行数据
  const filteredData = useMemo(() => {
    return rowModel.rows.map((row) => row.original);
  }, [rowModel.rows]);

  const filteredRowCount = rowModel.rows.length;

  // 切换列可见性
  const toggleColumnVisibility = useCallback((field: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  }, []);

  // 显示所有列
  const showAllColumns = useCallback(() => {
    setHiddenColumns(new Set());
  }, []);

  // 重置列（列宽和可见性）
  const resetColumns = useCallback(() => {
    setColumnSizing({});
    setHiddenColumns(new Set());
  }, []);

  return {
    table,
    sorting,
    setSorting,
    columnFilters,
    setColumnFilters,
    columnSizing,
    setColumnSizing,
    allColumns,
    visibleColumns,
    hiddenColumns,
    setHiddenColumns,
    filteredData,
    filteredRowCount,
    toggleColumnVisibility,
    showAllColumns,
    resetColumns,
  };
}
