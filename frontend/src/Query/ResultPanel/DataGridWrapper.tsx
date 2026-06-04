/**
 * 查询结果区 TanStack DataGrid 封装
 */
import * as React from 'react';
import { useMemo, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '../DataGrid';
import type { DataGridRef } from '../DataGrid/DataGrid';
import { useDataGridSettings } from '@/hooks/useDataGridSettings';
import { useColumnVisibility, useGridExport } from '../DataGrid/hooks';
import type { ColumnVisibilityState } from '../DataGrid/hooks/useColumnVisibility';
import type { ColumnDef, CellSelection } from '../DataGrid/types';
import type { ColumnFiltersState, SortingState } from '@tanstack/react-table';
import type { DataGridColumnInfo } from './types';

export type { DataGridColumnInfo };

export interface DataGridWrapperProps {
  rowData: Record<string, unknown>[] | null;
  columns?: ColumnDef[];
  loading?: boolean;
  noRowsOverlayText?: string;
  height?: number | string;
  enableSelection?: boolean;
  enableFiltering?: boolean;
  enableSorting?: boolean;
  /** 查询耗时（毫秒），显示在底部统计栏 */
  executionTime?: number;
  /** 预览行上限（命中时底部提示结果被截断） */
  previewLimitApplied?: number | null;
  onSelectionChange?: (selection: CellSelection | null) => void;
  onFilterChange?: (filters: ColumnFiltersState) => void;
  onSortChange?: (sorting: SortingState) => void;
  onStatsChange?: (stats: {
    totalRows: number;
    filteredRows: number;
    selectedCells: number;
    columnCount: number;
    visibleColumnCount: number;
  }) => void;
  onColumnVisibilityChange?: (columns: DataGridColumnInfo[]) => void;
  className?: string;
}

export interface DataGridApi {
  exportDataAsCsv: (params?: { fileName?: string }) => void;
  exportDataAsExcel: (params?: { fileName?: string }) => void;
  exportDataAsJson: (params?: { fileName?: string }) => void;
  getColumnVisibility: () => DataGridColumnInfo[];
  toggleColumnVisibility: (field: string) => void;
  showAllColumns: () => void;
  autoFitAllColumns: () => void;
  fitToWidth: () => void;
  resetColumns: () => void;
  getScrollTop: () => number;
  setScrollTop: (top: number) => void;
}

const DataGridWrapperInner: React.ForwardRefRenderFunction<DataGridApi, DataGridWrapperProps> = (
  {
    rowData,
    columns: columnsProp,
    loading = false,
    noRowsOverlayText,
    height = '100%',
    enableSelection = true,
    enableFiltering = true,
    enableSorting = true,
    executionTime,
    previewLimitApplied,
    onSelectionChange,
    onFilterChange,
    onSortChange,
    onStatsChange,
    onColumnVisibilityChange,
    className,
  },
  ref
) => {
  const { t } = useTranslation('common');
  const { settings: gridSettings } = useDataGridSettings();
  const processedData = useMemo(() => rowData || [], [rowData]);
  const processedEmptyText = useMemo(
    () => noRowsOverlayText || t('dataGrid.noData', '暂无数据'),
    [noRowsOverlayText, t]
  );

  const allFields = useMemo(() => {
    if (columnsProp?.length) {
      return columnsProp.map((c) => c.field);
    }
    if (processedData.length > 0) {
      return Object.keys(processedData[0]);
    }
    return [];
  }, [columnsProp, processedData]);

  const {
    visibleColumns,
    columnVisibilityInfo,
    toggleColumn,
    showAllColumns,
  } = useColumnVisibility({
    columns: allFields,
    onChange: useCallback(
      (visibility: ColumnVisibilityState) => {
        const info = allFields.map((field) => ({
          field,
          visible: visibility[field] !== false,
        }));
        onColumnVisibilityChange?.(info);
      },
      [allFields, onColumnVisibilityChange]
    ),
  });

  const { exportCSV, exportJSON, exportExcel } = useGridExport({
    data: processedData,
    columns: visibleColumns,
  });

  const visibleColumnDefs = useMemo((): ColumnDef[] | undefined => {
    if (!columnsProp?.length) return undefined;
    return columnsProp.filter((col) => visibleColumns.includes(col.field));
  }, [columnsProp, visibleColumns]);

  const dataGridInnerRef = useRef<DataGridRef>(null);

  useImperativeHandle(
    ref,
    () => ({
      exportDataAsCsv: (params) => {
        exportCSV({ filename: (params?.fileName || `export_${Date.now()}.csv`).replace('.csv', '') });
      },
      exportDataAsExcel: (params) => {
        exportExcel({ filename: (params?.fileName || `export_${Date.now()}.xlsx`).replace('.xlsx', '') });
      },
      exportDataAsJson: (params) => {
        exportJSON({ filename: (params?.fileName || `export_${Date.now()}.json`).replace('.json', '') });
      },
      getColumnVisibility: () => columnVisibilityInfo,
      toggleColumnVisibility: toggleColumn,
      showAllColumns,
      autoFitAllColumns: () => dataGridInnerRef.current?.autoFitAllColumns(),
      fitToWidth: () => dataGridInnerRef.current?.fitToWidth(),
      resetColumns: () => dataGridInnerRef.current?.resetColumns(),
      getScrollTop: () => dataGridInnerRef.current?.getScrollTop() ?? 0,
      setScrollTop: (top: number) => dataGridInnerRef.current?.setScrollTop(top),
    }),
    [exportCSV, exportJSON, exportExcel, columnVisibilityInfo, toggleColumn, showAllColumns]
  );

  return (
    <DataGrid
      ref={dataGridInnerRef}
      data={processedData}
      columns={visibleColumnDefs}
      loading={loading}
      emptyText={processedEmptyText}
      height={height}
      rowHeight={gridSettings.rowHeight}
      zebraStripes={gridSettings.zebraStripes}
      autoFitOnLoad={gridSettings.autoFitOnLoad}
      executionTime={executionTime}
      previewLimitApplied={previewLimitApplied}
      enableSelection={enableSelection}
      enableFiltering={enableFiltering}
      enableSorting={enableSorting}
      onSelectionChange={onSelectionChange}
      onFilterChange={onFilterChange}
      onSortChange={onSortChange}
      onStatsChange={onStatsChange}
      hideColumnMenu
      className={className}
    />
  );
};

export const DataGridWrapper = forwardRef(DataGridWrapperInner);
export default DataGridWrapper;
