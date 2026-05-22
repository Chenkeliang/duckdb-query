/**
 * 结果面板组件（TanStack DataGrid）
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, AlertCircle, Loader2 } from 'lucide-react';
import { showErrorToast, cleanErrorMessage } from '@/utils/toastHelpers';

import { DataGridWrapper } from './DataGridWrapper';
import type { DataGridApi } from './DataGridWrapper';
import type { DataGridColumnInfo } from './types';
import { ResultToolbar } from './ResultToolbar';
import { ImportToDuckDBDialog } from './ImportToDuckDBDialog';
import { useDataGridColumns } from './hooks/useDataGridColumns';
import type { TableSource } from '@/hooks/useQueryWorkspace';

export interface ResultPanelProps {
  data: Record<string, unknown>[] | null;
  columns?: string[] | null;
  loading?: boolean;
  error?: Error | null;
  executionTime?: number;
  execTime?: number;
  previewLimitApplied?: number | null;
  /** 重新执行最近一次查询 */
  onRefresh?: () => void;
  className?: string;
  emptyMessage?: string;
  showToolbar?: boolean;
  currentSQL?: string;
  source?: TableSource;
  autoOpenImportDialog?: boolean;
  onAutoOpenImportDialogConsumed?: () => void;
}

const emptyStats = {
  totalRows: 0,
  filteredRows: 0,
  columnCount: 0,
  visibleColumnCount: 0,
};

export const ResultPanel: React.FC<ResultPanelProps> = ({
  data,
  columns,
  loading = false,
  error = null,
  executionTime,
  execTime,
  previewLimitApplied,
  onRefresh,
  className = '',
  emptyMessage,
  showToolbar = true,
  currentSQL,
  source,
  autoOpenImportDialog = false,
  onAutoOpenImportDialogConsumed,
}) => {
  const actualExecTime = executionTime ?? execTime;
  const { t } = useTranslation('common');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [dataGridStats, setDataGridStats] = useState<{
    totalRows: number;
    filteredRows: number;
    selectedCells: number;
    columnCount: number;
    visibleColumnCount: number;
  } | null>(null);
  const [gridColumns, setGridColumns] = useState<DataGridColumnInfo[]>([]);
  const dataGridRef = useRef<DataGridApi>(null);

  const showImportButton = source?.type === 'external' && !!currentSQL;

  const { columns: gridColumnDefs } = useDataGridColumns({
    data,
    fieldOrder: columns,
    sampleSize: 100,
    enableFilters: true,
    enableSorting: true,
  });

  const toolbarStats = dataGridStats
    ? {
        totalRows: dataGridStats.totalRows,
        filteredRows: dataGridStats.filteredRows,
        columnCount: dataGridStats.columnCount,
        visibleColumnCount: dataGridStats.visibleColumnCount,
      }
    : emptyStats;

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const handleImportClick = useCallback(() => {
    if (!source || source.type !== 'external') return;
    if (!currentSQL) return;

    if (!source.connectionId) {
      showErrorToast(t, 'INVALID_REQUEST', t('query.import.missingConnection', '缺少外部数据库连接信息'));
      return;
    }

    if (source.databaseType !== 'mysql') {
      showErrorToast(t, 'INVALID_REQUEST', t('query.import.mysqlOnly', '目前仅支持从 MySQL 导入到 DuckDB'));
      return;
    }

    setImportDialogOpen(true);
  }, [currentSQL, source, t]);

  const handleColumnVisibilityChange = useCallback((columns: DataGridColumnInfo[]) => {
    setGridColumns(columns);
  }, []);

  useEffect(() => {
    if (!autoOpenImportDialog) return;
    handleImportClick();
    onAutoOpenImportDialogConsumed?.();
  }, [autoOpenImportDialog, handleImportClick, onAutoOpenImportDialogConsumed]);

  const toolbarProps = {
    stats: toolbarStats,
    selectedCells: dataGridStats?.selectedCells ?? 0,
    executionTime: actualExecTime,
    gridColumns,
    onToggleColumn: (field: string) => dataGridRef.current?.toggleColumnVisibility(field),
    onShowAllColumns: () => dataGridRef.current?.showAllColumns(),
    onResetColumns: () => dataGridRef.current?.resetColumns(),
    onAutoFitColumns: () => dataGridRef.current?.autoFitAllColumns(),
    onFitToWidth: () => dataGridRef.current?.fitToWidth(),
    onExportCsv: () => dataGridRef.current?.exportDataAsCsv(),
    onExportExcel: () => dataGridRef.current?.exportDataAsExcel(),
    onExportJson: () => dataGridRef.current?.exportDataAsJson(),
    onRefresh,
    onToggleFullscreen: handleToggleFullscreen,
    isFullscreen,
    loading,
    showImportButton: !!showImportButton,
    onImportToDuckDB: handleImportClick,
    previewLimitApplied,
  };

  if (loading && !data) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        {showToolbar && <ResultToolbar {...toolbarProps} stats={emptyStats} disabled />}
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span>{t('query.result.loading', '加载中...')}</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        {showToolbar && <ResultToolbar {...toolbarProps} stats={emptyStats} disabled />}
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 text-destructive max-w-md text-center px-4">
            <AlertCircle className="h-10 w-10" />
            <span className="font-medium">{t('query.result.error', '查询失败')}</span>
            <span className="text-sm text-muted-foreground">{cleanErrorMessage(error.message)}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        {showToolbar && <ResultToolbar {...toolbarProps} stats={emptyStats} />}
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Database className="h-10 w-10" />
            <span>{emptyMessage || t('query.result.noData', '暂无数据')}</span>
            <span className="text-sm">{t('query.result.noDataHint', '执行查询以查看结果')}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : ''} ${className}`}>
      {showToolbar && <ResultToolbar {...toolbarProps} />}
      <div className="flex-1 min-h-0">
        <DataGridWrapper
          ref={dataGridRef}
          rowData={data}
          columns={gridColumnDefs}
          loading={loading}
          noRowsOverlayText={t('query.result.noData', '暂无数据')}
          enableSelection
          enableFiltering
          enableSorting
          onStatsChange={setDataGridStats}
          onColumnVisibilityChange={handleColumnVisibilityChange}
        />
      </div>

      {currentSQL && (
        <ImportToDuckDBDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          sql={currentSQL}
          source={source}
        />
      )}
    </div>
  );
};

export default ResultPanel;
