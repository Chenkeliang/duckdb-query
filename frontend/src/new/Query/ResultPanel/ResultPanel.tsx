/**
 * 结果面板组件
 * 使用 AG-Grid 显示查询结果
 * 支持外部数据库查询结果导入到 DuckDB
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, AlertCircle, Loader2 } from 'lucide-react';
import type { GridApi } from 'ag-grid-community';
import { toast } from 'sonner';

import { AGGridWrapper } from './AGGridWrapper';
import { DataGridWrapper } from './DataGridWrapper';
import type { DataGridApi, DataGridColumnInfo } from './DataGridWrapper';
import { ResultToolbar } from './ResultToolbar';
import { ColumnFilterCommand } from './ColumnFilterCommand';
import { ImportToDuckDBDialog } from './ImportToDuckDBDialog';
import { useAGGridConfig } from './hooks/useAGGridConfig';
import { useGridStats, useGridCopy } from './hooks';
import type { Column } from 'ag-grid-community';
import type { TableSource } from '@/new/hooks/useQueryWorkspace';

export interface ResultPanelProps {
  /** 查询结果数据 */
  data: Record<string, unknown>[] | null;
  /** 列名列表（可选，用于显示） */
  columns?: string[] | null;
  /** 是否正在加载 */
  loading?: boolean;
  /** 错误信息 */
  error?: Error | null;
  /** 执行时间（毫秒） */
  executionTime?: number;
  /** 执行时间（毫秒）- 别名 */
  execTime?: number;
  /** 行数 */
  rowCount?: number;
  /** 刷新回调 */
  onRefresh?: () => void;
  /** 导出回调 */
  onExport?: (format: 'csv' | 'json', data: Record<string, unknown>[]) => void;
  /** 自定义类名 */
  className?: string;
  /** 空状态提示 */
  emptyMessage?: string;
  /** 是否显示工具栏 */
  showToolbar?: boolean;
  /** 当前查询的 SQL（用于导入功能） */
  currentSQL?: string;
  /** 数据源信息（用于判断是否显示导入按钮） */
  source?: TableSource;
  /** 导入成功回调 */
  onImportSuccess?: (tableName: string, rowCount: number) => void;
  /** 自动打开导入对话框（一次性信号） */
  autoOpenImportDialog?: boolean;
  /** 自动打开信号已消费回调 */
  onAutoOpenImportDialogConsumed?: () => void;
}

/**
 * 结果面板组件
 */
export const ResultPanel: React.FC<ResultPanelProps> = ({
  data,
  columns: _columns,
  loading = false,
  error = null,
  executionTime,
  execTime,
  rowCount: _rowCount,
  onRefresh,
  onExport,
  className = '',
  emptyMessage,
  showToolbar = true,
  currentSQL,
  source,
  onImportSuccess,
  autoOpenImportDialog = false,
  onAutoOpenImportDialogConsumed,
}) => {
  // 合并执行时间（支持两种命名）
  const actualExecTime = executionTime ?? execTime;
  const { t } = useTranslation('common');
  const [gridApi, setGridApi] = useState<GridApi | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [columnFilterCommandOpen, setColumnFilterCommandOpen] = useState(false);
  const [_selectedColumn, setSelectedColumn] = useState<Column | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  // 开关：是否使用新的 TanStack DataGrid（默认使用 TanStack DataGrid）
  const [useNewDataGrid, setUseNewDataGrid] = useState(true);
  const [dataGridStats, setDataGridStats] = useState<{
    totalRows: number;
    filteredRows: number;
    selectedCells: number;
    columnCount: number;
    visibleColumnCount: number;
  } | null>(null);
  // DataGrid 列可见性信息
  const [dataGridColumns, setDataGridColumns] = useState<DataGridColumnInfo[]>([]);
  // DataGrid ref
  const dataGridRef = useRef<DataGridApi>(null);

  // 判断是否显示导入按钮（仅当数据来自外部数据库时）
  const showImportButton = source?.type === 'external' && !!currentSQL;

  // 生成列配置
  const { columnDefs } = useAGGridConfig({
    data,
    sampleSize: 100,
    enableFilters: true,
    enableSorting: true,
  });

  // 获取统计信息
  const {
    stats,
    columns,
    toggleColumn,
    showAllColumns,
    resetColumns,
    autoSizeColumns,
    sizeColumnsToFit,
  } = useGridStats({ gridApi });

  // 复制功能
  const { copySelectedRows } = useGridCopy(gridApi);

  // Ctrl+K 快捷键 - 打开列筛选命令面板
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setColumnFilterCommandOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Grid 准备就绪
  const handleGridReady = useCallback((params: { api: GridApi }) => {
    setGridApi(params.api);
  }, []);

  // 导出 CSV
  const handleExportCSV = useCallback(() => {
    if (gridApi) {
      gridApi.exportDataAsCsv({
        fileName: `query_result_${Date.now()}.csv`,
      });
    }
  }, [gridApi]);

  // 导出 JSON
  const handleExportJSON = useCallback(() => {
    if (gridApi && data) {
      const exportData: Record<string, unknown>[] = [];
      gridApi.forEachNodeAfterFilterAndSort((node) => {
        if (node.data) {
          exportData.push(node.data);
        }
      });

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `query_result_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [gridApi, data]);

  // 处理导出
  const handleExport = useCallback((format: 'csv' | 'json') => {
    if (format === 'csv') {
      handleExportCSV();
    } else {
      handleExportJSON();
    }

    // 如果有外部回调，也调用它
    if (onExport && data) {
      const exportData: Record<string, unknown>[] = [];
      gridApi?.forEachNodeAfterFilterAndSort((node) => {
        if (node.data) {
          exportData.push(node.data);
        }
      });
      onExport(format, exportData);
    }
  }, [handleExportCSV, handleExportJSON, onExport, data, gridApi]);

  // 全屏切换
  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  // 处理列选择（从命令面板）
  const handleSelectColumn = useCallback((column: Column) => {
    setSelectedColumn(column);
    // 这里可以触发该列的筛选菜单打开
    // 由于我们使用的是自定义表头组件，这里暂时只记录选中的列
    // 实际应用中可以通过 ref 或其他方式触发该列的筛选菜单
  }, []);

  // 处理导入按钮点击
  const handleImportClick = useCallback(() => {
    if (!source || source.type !== 'external') return;
    if (!currentSQL) return;

    if (!source.connectionId) {
      toast.error(t('query.import.missingConnection', '缺少外部数据库连接信息'));
      return;
    }

    if (source.databaseType !== 'mysql') {
      toast.error(t('query.import.mysqlOnly', '目前仅支持从 MySQL 导入到 DuckDB'));
      return;
    }

    setImportDialogOpen(true);
  }, [currentSQL, source, t]);

  // DataGrid 列可见性变化回调
  const handleDataGridColumnVisibilityChange = useCallback((columns: DataGridColumnInfo[]) => {
    setDataGridColumns(columns);
  }, []);

  // DataGrid 切换列可见性
  const handleDataGridToggleColumn = useCallback((field: string) => {
    dataGridRef.current?.toggleColumnVisibility(field);
  }, []);

  // DataGrid 显示所有列
  const handleDataGridShowAllColumns = useCallback(() => {
    dataGridRef.current?.showAllColumns();
  }, []);

  // DataGrid 导出 CSV
  const handleDataGridExportCSV = useCallback(() => {
    dataGridRef.current?.exportDataAsCsv();
  }, []);

  // DataGrid 导出 JSON
  const handleDataGridExportJSON = useCallback(() => {
    dataGridRef.current?.exportDataAsJson();
  }, []);

  // DataGrid 自动列宽
  const handleDataGridAutoFitColumns = useCallback(() => {
    dataGridRef.current?.autoFitAllColumns();
  }, []);

  // DataGrid 适应宽度
  const handleDataGridFitToWidth = useCallback(() => {
    dataGridRef.current?.fitToWidth();
  }, []);

  // DataGrid 重置列
  const handleDataGridResetColumns = useCallback(() => {
    dataGridRef.current?.resetColumns();
  }, []);

  // 自动打开导入对话框（来自左侧树/快捷入口）
  useEffect(() => {
    if (!autoOpenImportDialog) return;
    handleImportClick();
    onAutoOpenImportDialogConsumed?.();
  }, [autoOpenImportDialog, handleImportClick, onAutoOpenImportDialogConsumed]);

  // 渲染加载状态
  if (loading && !data) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        {showToolbar && (
          <ResultToolbar
            stats={{ totalRows: 0, filteredRows: 0, selectedRows: 0, columnCount: 0, visibleColumnCount: 0 }}
            columns={[]}
            onToggleColumn={() => {}}
            onShowAllColumns={() => {}}
            onResetColumns={() => {}}
            onAutoSizeColumns={() => {}}
            onSizeColumnsToFit={() => {}}
            loading={true}
            disabled={true}
          />
        )}
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span>{t('query.result.loading', '加载中...')}</span>
          </div>
        </div>
      </div>
    );
  }

  // 渲染错误状态
  if (error) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        {showToolbar && (
          <ResultToolbar
            stats={{ totalRows: 0, filteredRows: 0, selectedRows: 0, columnCount: 0, visibleColumnCount: 0 }}
            columns={[]}
            onToggleColumn={() => {}}
            onShowAllColumns={() => {}}
            onResetColumns={() => {}}
            onAutoSizeColumns={() => {}}
            onSizeColumnsToFit={() => {}}
            onRefresh={onRefresh}
            disabled={true}
          />
        )}
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 text-destructive max-w-md text-center px-4">
            <AlertCircle className="h-10 w-10" />
            <span className="font-medium">{t('query.result.error', '查询失败')}</span>
            <span className="text-sm text-muted-foreground">{error.message}</span>
          </div>
        </div>
      </div>
    );
  }

  // 渲染空状态
  if (!data || data.length === 0) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        {showToolbar && (
          <ResultToolbar
            stats={{ totalRows: 0, filteredRows: 0, selectedRows: 0, columnCount: 0, visibleColumnCount: 0 }}
            columns={[]}
            onToggleColumn={() => {}}
            onShowAllColumns={() => {}}
            onResetColumns={() => {}}
            onAutoSizeColumns={() => {}}
            onSizeColumnsToFit={() => {}}
            onRefresh={onRefresh}
          />
        )}
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Database className="h-10 w-10" />
            <span>{emptyMessage || t('query.result.noData', '暂无数据')}</span>
            <span className="text-sm">
              {t('query.result.noDataHint', '执行查询以查看结果')}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 渲染数据表格
  return (
    <div className={`flex flex-col h-full ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : ''} ${className}`}>
      {showToolbar && (
        <ResultToolbar
          stats={
            useNewDataGrid && dataGridStats
              ? {
                  totalRows: dataGridStats.totalRows,
                  filteredRows: dataGridStats.filteredRows,
                  selectedRows: 0,
                  columnCount: dataGridStats.columnCount,
                  visibleColumnCount: dataGridStats.visibleColumnCount,
                }
              : stats
          }
          selectedCells={useNewDataGrid ? dataGridStats?.selectedCells || 0 : 0}
          executionTime={actualExecTime}
          columns={useNewDataGrid ? [] : columns}
          onToggleColumn={useNewDataGrid ? () => {} : toggleColumn}
          onShowAllColumns={useNewDataGrid ? () => {} : showAllColumns}
          onResetColumns={useNewDataGrid ? () => {} : resetColumns}
          onAutoSizeColumns={useNewDataGrid ? () => {} : autoSizeColumns}
          onSizeColumnsToFit={useNewDataGrid ? () => {} : sizeColumnsToFit}
          onRefresh={onRefresh}
          onExport={useNewDataGrid ? undefined : handleExport}
          onCopySelected={useNewDataGrid ? undefined : copySelectedRows}
          onToggleFullscreen={handleToggleFullscreen}
          isFullscreen={isFullscreen}
          loading={loading}
          showImportButton={!!showImportButton}
          onImportToDuckDB={handleImportClick}
          useNewDataGrid={useNewDataGrid}
          onToggleDataGrid={() => setUseNewDataGrid(!useNewDataGrid)}
          // DataGrid 特有的 props
          dataGridColumns={useNewDataGrid ? dataGridColumns : undefined}
          onDataGridToggleColumn={useNewDataGrid ? handleDataGridToggleColumn : undefined}
          onDataGridShowAllColumns={useNewDataGrid ? handleDataGridShowAllColumns : undefined}
          onDataGridExportCSV={useNewDataGrid ? handleDataGridExportCSV : undefined}
          onDataGridExportJSON={useNewDataGrid ? handleDataGridExportJSON : undefined}
          onDataGridAutoFitColumns={useNewDataGrid ? handleDataGridAutoFitColumns : undefined}
          onDataGridFitToWidth={useNewDataGrid ? handleDataGridFitToWidth : undefined}
          onDataGridResetColumns={useNewDataGrid ? handleDataGridResetColumns : undefined}
        />
      )}
      <div className="flex-1 min-h-0">
        {useNewDataGrid ? (
          <DataGridWrapper
            ref={dataGridRef}
            rowData={data}
            columnDefs={columnDefs}
            loading={loading}
            noRowsOverlayText={t('query.result.noData', '暂无数据')}
            loadingOverlayText={t('query.result.loading', '加载中...')}
            enableSelection={true}
            enableFiltering={true}
            enableSorting={true}
            onStatsChange={setDataGridStats}
            onColumnVisibilityChange={handleDataGridColumnVisibilityChange}
          />
        ) : (
          <AGGridWrapper
            rowData={data}
            columnDefs={columnDefs}
            onGridReady={handleGridReady}
            loading={loading}
            noRowsOverlayText={t('query.result.noData', '暂无数据')}
            loadingOverlayText={t('query.result.loading', '加载中...')}
          />
        )}
      </div>

      {/* 列筛选命令面板 */}
      {!useNewDataGrid && (
        <ColumnFilterCommand
          open={columnFilterCommandOpen}
          onOpenChange={setColumnFilterCommandOpen}
          gridApi={gridApi}
          onSelectColumn={handleSelectColumn}
        />
      )}

      {/* 导入到 DuckDB 对话框 */}
      {currentSQL && (
        <ImportToDuckDBDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          sql={currentSQL}
          source={source}
          onImportSuccess={onImportSuccess}
        />
      )}
    </div>
  );
};

export default ResultPanel;
