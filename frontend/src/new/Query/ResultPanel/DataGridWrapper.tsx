/**
 * DataGrid 包装器
 * 
 * 兼容 AGGridWrapper 接口，使用新的 TanStack DataGrid 替代 AG Grid
 */
import * as React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '../DataGrid';
import type { ColumnDef as DataGridColumnDef, CellSelection } from '../DataGrid/types';
import type { ColumnFiltersState, SortingState } from '@tanstack/react-table';
import type { ColDef } from 'ag-grid-community';

// AG Grid 列定义类型（简化版，用于兼容）
type AGGridColumnDef = ColDef;

export interface DataGridWrapperProps {
  /** 行数据 */
  rowData: Record<string, unknown>[] | null;
  /** 列定义（可选，自动推断，兼容 AG Grid 格式） */
  columnDefs?: AGGridColumnDef[];
  /** 是否加载中 */
  loading?: boolean;
  /** 空状态文本 */
  noRowsOverlayText?: string;
  /** 加载状态文本 */
  loadingOverlayText?: string;
  /** 容器高度 */
  height?: number | string;
  /** 是否启用选区 */
  enableSelection?: boolean;
  /** 是否启用筛选 */
  enableFiltering?: boolean;
  /** 是否启用排序 */
  enableSorting?: boolean;
  /** Grid 准备就绪回调（兼容 AG Grid API 格式） */
  onGridReady?: (params: { api: unknown }) => void;
  /** 选区变化回调 */
  onSelectionChange?: (selection: CellSelection | null) => void;
  /** 筛选变化回调 */
  onFilterChange?: (filters: ColumnFiltersState) => void;
  /** 排序变化回调 */
  onSortChange?: (sorting: SortingState) => void;
  /** DataGrid 内部统计信息变化回调 */
  onStatsChange?: (stats: {
    totalRows: number;
    filteredRows: number;
    selectedCells: number;
    columnCount: number;
    visibleColumnCount: number;
  }) => void;
  /** 自定义类名 */
  className?: string;
}

/**
 * DataGrid API 接口（兼容 AG Grid API 的子集）
 */
export interface DataGridApi {
  /** 导出为 CSV */
  exportDataAsCsv: (params?: { fileName?: string }) => void;
  /** 遍历筛选后的节点 */
  forEachNodeAfterFilterAndSort: (callback: (node: { data: Record<string, unknown> }) => void) => void;
  /** 获取所有数据 */
  getRowData: () => Record<string, unknown>[];
  /** 获取筛选后的数据 */
  getFilteredData: () => Record<string, unknown>[];
}

/**
 * DataGrid 包装器组件
 * 
 * 提供与 AGGridWrapper 兼容的接口
 */
export const DataGridWrapper: React.FC<DataGridWrapperProps> = ({
  rowData,
  columnDefs,
  loading = false,
  noRowsOverlayText,
  loadingOverlayText: _loadingOverlayText,
  height = '100%',
  enableSelection = true,
  enableFiltering = true,
  enableSorting = true,
  onGridReady,
  onSelectionChange,
  onFilterChange,
  onSortChange,
  onStatsChange,
  className,
}) => {
  const { t } = useTranslation('common');

  // 处理空数据
  const processedData = useMemo(() => {
    return rowData || [];
  }, [rowData]);

  // 处理空状态文本
  const processedEmptyText = useMemo(() => {
    return noRowsOverlayText || t('dataGrid.noData', '暂无数据');
  }, [noRowsOverlayText, t]);

  // 将 AG Grid 列定义转换为 DataGrid 列定义
  const convertedColumns = useMemo((): DataGridColumnDef[] | undefined => {
    if (!columnDefs) return undefined;
    
    return columnDefs
      .filter((col): col is AGGridColumnDef & { field: string } => !!col.field)
      .map((col) => ({
        field: col.field,
        headerName: col.headerName || col.field,
        width: typeof col.width === 'number' ? col.width : 120,
        sortable: col.sortable !== false,
        filterable: col.filter !== false,
        resizable: col.resizable !== false,
      }));
  }, [columnDefs]);

  // 创建兼容的 API 对象
  const apiRef = React.useRef<DataGridApi | null>(null);

  // 当数据变化时，更新 API
  React.useEffect(() => {
    const api: DataGridApi = {
      exportDataAsCsv: (params) => {
        const fileName = params?.fileName || `export_${Date.now()}.csv`;
        const data = processedData;
        if (!data.length) return;

        const headers = Object.keys(data[0]);
        const csvContent = [
          headers.join(','),
          ...data.map(row => 
            headers.map(h => {
              const val = row[h];
              if (val === null || val === undefined) return '';
              const str = String(val);
              // 转义包含逗号、引号或换行的值
              if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
              }
              return str;
            }).join(',')
          )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      },
      forEachNodeAfterFilterAndSort: (callback) => {
        // TODO: 实现筛选后的数据遍历
        processedData.forEach(data => callback({ data }));
      },
      getRowData: () => processedData,
      getFilteredData: () => processedData, // TODO: 返回筛选后的数据
    };

    apiRef.current = api;

    // 通知父组件 Grid 已准备就绪
    if (onGridReady) {
      onGridReady({ api });
    }
  }, [processedData, onGridReady]);

  return (
    <DataGrid
      data={processedData}
      columns={convertedColumns}
      loading={loading}
      emptyText={processedEmptyText}
      height={height}
      enableSelection={enableSelection}
      enableFiltering={enableFiltering}
      enableSorting={enableSorting}
      onSelectionChange={onSelectionChange}
      onFilterChange={onFilterChange}
      onSortChange={onSortChange}
      onStatsChange={onStatsChange}
      className={className}
    />
  );
};

export { DataGridWrapper as default };
