/**
 * DataGrid 包装器
 * 
 * 兼容 AGGridWrapper 接口，使用新的 TanStack DataGrid 替代 AG Grid
 */
import * as React from 'react';
import { useMemo, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '../DataGrid';
import type { DataGridRef } from '../DataGrid/DataGrid';
import { useColumnVisibility, useGridExport } from '../DataGrid/hooks';
import type { ColumnVisibilityState } from '../DataGrid/hooks/useColumnVisibility';
import type { ColumnDef as DataGridColumnDef, CellSelection } from '../DataGrid/types';
import type { ColumnFiltersState, SortingState } from '@tanstack/react-table';
import type { ColDef } from 'ag-grid-community';

// AG Grid 列定义类型（简化版，用于兼容）
type AGGridColumnDef = ColDef;

/** DataGrid 列可见性信息 */
export interface DataGridColumnInfo {
  field: string;
  visible: boolean;
}

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
  /** 列可见性变化回调 */
  onColumnVisibilityChange?: (columns: DataGridColumnInfo[]) => void;
  /** 导出 CSV 回调（外部触发） */
  onExportCSV?: () => void;
  /** 导出 JSON 回调（外部触发） */
  onExportJSON?: () => void;
  /** 自定义类名 */
  className?: string;
}

/**
 * DataGrid API 接口（兼容 AG Grid API 的子集）
 */
export interface DataGridApi {
  /** 导出为 CSV */
  exportDataAsCsv: (params?: { fileName?: string }) => void;
  /** 导出为 JSON */
  exportDataAsJson: (params?: { fileName?: string }) => void;
  /** 遍历筛选后的节点 */
  forEachNodeAfterFilterAndSort: (callback: (node: { data: Record<string, unknown> }) => void) => void;
  /** 获取所有数据 */
  getRowData: () => Record<string, unknown>[];
  /** 获取筛选后的数据 */
  getFilteredData: () => Record<string, unknown>[];
  /** 获取列可见性信息 */
  getColumnVisibility: () => DataGridColumnInfo[];
  /** 切换列可见性 */
  toggleColumnVisibility: (field: string) => void;
  /** 显示所有列 */
  showAllColumns: () => void;
  /** 自动调整所有列宽 */
  autoFitAllColumns: () => void;
  /** 适应容器宽度 */
  fitToWidth: () => void;
  /** 重置列 */
  resetColumns: () => void;
}

/**
 * DataGrid 包装器组件
 * 
 * 提供与 AGGridWrapper 兼容的接口
 */
const DataGridWrapperInner: React.ForwardRefRenderFunction<DataGridApi, DataGridWrapperProps> = ({
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
  onColumnVisibilityChange,
  onExportCSV: _onExportCSV,
  onExportJSON: _onExportJSON,
  className,
}, ref) => {
  const { t } = useTranslation('common');

  // 处理空数据
  const processedData = useMemo(() => {
    return rowData || [];
  }, [rowData]);

  // 处理空状态文本
  const processedEmptyText = useMemo(() => {
    return noRowsOverlayText || t('dataGrid.noData', '暂无数据');
  }, [noRowsOverlayText, t]);

  // 获取所有列名
  const allColumns = useMemo(() => {
    if (columnDefs) {
      return columnDefs
        .filter((col): col is AGGridColumnDef & { field: string } => !!col.field)
        .map(col => col.field);
    }
    if (processedData.length > 0) {
      return Object.keys(processedData[0]);
    }
    return [];
  }, [columnDefs, processedData]);

  // 列可见性管理
  const {
    visibleColumns,
    columnVisibilityInfo,
    toggleColumn,
    showAllColumns,
  } = useColumnVisibility({
    columns: allColumns,
    onChange: useCallback((visibility: ColumnVisibilityState) => {
      const info = allColumns.map(field => ({
        field,
        visible: visibility[field] !== false,
      }));
      onColumnVisibilityChange?.(info);
    }, [allColumns, onColumnVisibilityChange]),
  });

  // 导出功能
  const { exportCSV, exportJSON } = useGridExport({
    data: processedData,
    columns: visibleColumns,
  });

  // 将 AG Grid 列定义转换为 DataGrid 列定义（只包含可见列）
  const convertedColumns = useMemo((): DataGridColumnDef[] | undefined => {
    if (!columnDefs) return undefined;
    
    return columnDefs
      .filter((col): col is AGGridColumnDef & { field: string } => 
        !!col.field && visibleColumns.includes(col.field)
      )
      .map((col) => ({
        field: col.field,
        headerName: col.headerName || col.field,
        width: typeof col.width === 'number' ? col.width : 120,
        sortable: col.sortable !== false,
        filterable: col.filter !== false,
        resizable: col.resizable !== false,
      }));
  }, [columnDefs, visibleColumns]);

  // 使用 ref 跟踪是否已调用 onGridReady
  const hasCalledGridReady = useRef(false);
  const onGridReadyRef = useRef(onGridReady);
  onGridReadyRef.current = onGridReady;

  // DataGrid 内部 ref
  const dataGridInnerRef = useRef<DataGridRef>(null);

  // 暴露 API 给父组件（使用 useImperativeHandle 确保 API 始终最新）
  useImperativeHandle(ref, () => ({
    exportDataAsCsv: (params) => {
      const fileName = params?.fileName || `export_${Date.now()}.csv`;
      exportCSV({ filename: fileName.replace('.csv', '') });
    },
    exportDataAsJson: (params) => {
      const fileName = params?.fileName || `export_${Date.now()}.json`;
      exportJSON({ filename: fileName.replace('.json', '') });
    },
    forEachNodeAfterFilterAndSort: (callback) => {
      processedData.forEach(data => callback({ data }));
    },
    getRowData: () => processedData,
    getFilteredData: () => processedData,
    getColumnVisibility: () => columnVisibilityInfo,
    toggleColumnVisibility: toggleColumn,
    showAllColumns,
    autoFitAllColumns: () => dataGridInnerRef.current?.autoFitAllColumns(),
    fitToWidth: () => dataGridInnerRef.current?.fitToWidth(),
    resetColumns: () => dataGridInnerRef.current?.resetColumns(),
  }), [processedData, exportCSV, exportJSON, columnVisibilityInfo, toggleColumn, showAllColumns]);

  // 创建稳定的 API 对象用于 onGridReady 回调
  const stableApi = useMemo((): DataGridApi => ({
    exportDataAsCsv: (params) => {
      const fileName = params?.fileName || `export_${Date.now()}.csv`;
      exportCSV({ filename: fileName.replace('.csv', '') });
    },
    exportDataAsJson: (params) => {
      const fileName = params?.fileName || `export_${Date.now()}.json`;
      exportJSON({ filename: fileName.replace('.json', '') });
    },
    forEachNodeAfterFilterAndSort: (callback) => {
      processedData.forEach(data => callback({ data }));
    },
    getRowData: () => processedData,
    getFilteredData: () => processedData,
    getColumnVisibility: () => columnVisibilityInfo,
    toggleColumnVisibility: toggleColumn,
    showAllColumns,
    autoFitAllColumns: () => dataGridInnerRef.current?.autoFitAllColumns(),
    fitToWidth: () => dataGridInnerRef.current?.fitToWidth(),
    resetColumns: () => dataGridInnerRef.current?.resetColumns(),
  }), [processedData, exportCSV, exportJSON, columnVisibilityInfo, toggleColumn, showAllColumns]);

  // 仅在首次渲染时调用 onGridReady（避免每次数据变化都重新调用）
  if (!hasCalledGridReady.current && onGridReadyRef.current) {
    hasCalledGridReady.current = true;
    // 使用 setTimeout 确保在渲染完成后调用
    setTimeout(() => {
      onGridReadyRef.current?.({ api: stableApi });
    }, 0);
  }

  return (
    <DataGrid
      ref={dataGridInnerRef}
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
      hideColumnMenu={true}
      className={className}
    />
  );
};

export const DataGridWrapper = forwardRef(DataGridWrapperInner);

export { DataGridWrapper as default };
