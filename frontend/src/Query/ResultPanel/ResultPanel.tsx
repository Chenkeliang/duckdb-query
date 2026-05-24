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
import type { TableSource } from '@/types/queryWorkspace';
import { ResultTabsBar } from './ResultTabsBar';
import { ResultTabGridPane } from './ResultTabGridPane';
import type { ResultTabEntry } from './resultTabUtils';

export interface ResultPanelProps {
  data: Record<string, unknown>[] | null;
  columns?: string[] | null;
  loading?: boolean;
  error?: Error | null;
  executionTime?: number;
  execTime?: number;
  previewLimitApplied?: number | null;
  /** 重新执行最近一次查询（单结果槽） */
  onRefresh?: () => void;
  /** 仅刷新指定结果 Tab（多 Tab 模式） */
  onRefreshTab?: (tabId: string) => void;
  className?: string;
  emptyMessage?: string;
  showToolbar?: boolean;
  currentSQL?: string;
  source?: TableSource;
  autoOpenImportDialog?: boolean;
  onAutoOpenImportDialogConsumed?: () => void;
  /** 保留多结果 Tab 时 */
  retainQueryResults?: boolean;
  resultTabs?: ResultTabEntry[];
  activeResultTabId?: string | null;
  onSelectResultTab?: (id: string) => void;
  onCloseResultTab?: (id: string) => void;
  onCloseOtherResultTabs?: (id: string) => void;
  onCloseResultTabsToLeft?: (id: string) => void;
  onCloseResultTabsToRight?: (id: string) => void;
  /** 未开启保留时的单槽标题 */
  singleResultSlotLabel?: string;
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
  onRefreshTab,
  className = '',
  emptyMessage,
  showToolbar = true,
  currentSQL,
  source,
  autoOpenImportDialog = false,
  onAutoOpenImportDialogConsumed,
  retainQueryResults = false,
  resultTabs = [],
  activeResultTabId = null,
  onSelectResultTab,
  onCloseResultTab,
  onCloseOtherResultTabs,
  onCloseResultTabsToLeft,
  onCloseResultTabsToRight,
  singleResultSlotLabel,
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
  const gridApisRef = useRef<Map<string, DataGridApi>>(new Map());

  const activeTab = React.useMemo(
    () => resultTabs.find((tab) => tab.id === activeResultTabId) ?? null,
    [resultTabs, activeResultTabId]
  );

  const registerGridApi = useCallback((tabId: string, api: DataGridApi | null) => {
    if (api) {
      gridApisRef.current.set(tabId, api);
    } else {
      gridApisRef.current.delete(tabId);
    }
  }, []);

  const getActiveGridApi = useCallback((): DataGridApi | undefined => {
    if (!activeResultTabId) return undefined;
    return gridApisRef.current.get(activeResultTabId) ?? dataGridRef.current ?? undefined;
  }, [activeResultTabId]);

  const useMultiTabGrids = retainQueryResults && resultTabs.length > 0;

  const effectiveSource = useMultiTabGrids ? activeTab?.query.source : source;
  const effectiveSQL = useMultiTabGrids ? activeTab?.query.sql : currentSQL;

  const showImportButton =
    effectiveSource?.type === 'federated' &&
    !!effectiveSource.connectionId &&
    !!effectiveSQL;

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
    if (!effectiveSource || effectiveSource.type !== 'federated') return;
    if (!effectiveSQL) return;

    if (!effectiveSource.connectionId) {
      showErrorToast(t, 'INVALID_REQUEST', t('query.import.missingConnection', '缺少外部数据库连接信息'));
      return;
    }

    if (effectiveSource.databaseType !== 'mysql') {
      showErrorToast(t, 'INVALID_REQUEST', t('query.import.mysqlOnly', '目前仅支持从 MySQL 导入到 DuckDB'));
      return;
    }

    setImportDialogOpen(true);
  }, [effectiveSQL, effectiveSource, t]);

  const handleColumnVisibilityChange = useCallback((columns: DataGridColumnInfo[]) => {
    setGridColumns(columns);
  }, []);

  useEffect(() => {
    if (!autoOpenImportDialog) return;
    handleImportClick();
    onAutoOpenImportDialogConsumed?.();
  }, [autoOpenImportDialog, handleImportClick, onAutoOpenImportDialogConsumed]);

  const activeTabExecTime = activeTab?.result.execTime;
  const activeTabLoading = activeTab?.result.loading ?? false;
  const toolbarExecTime = useMultiTabGrids ? activeTabExecTime : actualExecTime;
  const toolbarLoading = useMultiTabGrids ? activeTabLoading : loading;

  const handleRefreshActiveTab = useCallback(() => {
    if (useMultiTabGrids && activeResultTabId && onRefreshTab) {
      onRefreshTab(activeResultTabId);
      return;
    }
    onRefresh?.();
  }, [useMultiTabGrids, activeResultTabId, onRefreshTab, onRefresh]);

  const toolbarProps = {
    stats: toolbarStats,
    selectedCells: dataGridStats?.selectedCells ?? 0,
    executionTime: toolbarExecTime,
    gridColumns,
    onToggleColumn: (field: string) => getActiveGridApi()?.toggleColumnVisibility(field),
    onShowAllColumns: () => getActiveGridApi()?.showAllColumns(),
    onResetColumns: () => getActiveGridApi()?.resetColumns(),
    onAutoFitColumns: () => getActiveGridApi()?.autoFitAllColumns(),
    onFitToWidth: () => getActiveGridApi()?.fitToWidth(),
    onExportCsv: () => getActiveGridApi()?.exportDataAsCsv(),
    onExportExcel: () => getActiveGridApi()?.exportDataAsExcel(),
    onExportJson: () => getActiveGridApi()?.exportDataAsJson(),
    onRefresh:
      useMultiTabGrids && activeResultTabId && activeTab?.query.sql
        ? handleRefreshActiveTab
        : onRefresh,
    onToggleFullscreen: handleToggleFullscreen,
    isFullscreen,
    loading: toolbarLoading,
    showImportButton: !!showImportButton,
    onImportToDuckDB: handleImportClick,
    previewLimitApplied,
  };

  const resultTabsBar =
    retainQueryResults && resultTabs.length > 0 && onSelectResultTab && onCloseResultTab ? (
      <ResultTabsBar
        tabs={resultTabs}
        activeTabId={activeResultTabId}
        onSelectTab={onSelectResultTab}
        onCloseTab={onCloseResultTab}
        onCloseOthers={onCloseOtherResultTabs ?? onCloseResultTab}
        onCloseToLeft={onCloseResultTabsToLeft ?? onCloseResultTab}
        onCloseToRight={onCloseResultTabsToRight ?? onCloseResultTab}
      />
    ) : null;

  const singleSlotHeader =
    !retainQueryResults && singleResultSlotLabel ? (
      <div className="shrink-0 border-b border-border bg-muted/20 px-3 py-1.5 text-xs font-medium text-foreground truncate">
        {singleResultSlotLabel}
      </div>
    ) : null;

  if (useMultiTabGrids) {
    const activeSql = activeTab?.query.sql;
    const activeSource = activeTab?.query.source;

    return (
      <div className={`flex flex-col h-full ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : ''} ${className}`}>
        {resultTabsBar}
        {showToolbar && <ResultToolbar {...toolbarProps} />}
        <div className="relative flex-1 min-h-0">
          {resultTabs.map((tab) => (
            <ResultTabGridPane
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeResultTabId}
              registerGridApi={registerGridApi}
              onStatsChange={setDataGridStats}
              onColumnVisibilityChange={handleColumnVisibilityChange}
              emptyMessage={emptyMessage}
            />
          ))}
        </div>
        {activeSql && (
          <ImportToDuckDBDialog
            open={importDialogOpen}
            onOpenChange={setImportDialogOpen}
            sql={activeSql}
            source={activeSource}
          />
        )}
      </div>
    );
  }

  const showInitialLoading = loading && !data;

  if (showInitialLoading) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        {resultTabsBar}
        {singleSlotHeader}
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
        {resultTabsBar}
        {singleSlotHeader}
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
        {resultTabsBar}
        {singleSlotHeader}
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
      {resultTabsBar}
      {singleSlotHeader}
      {showToolbar && <ResultToolbar {...toolbarProps} />}
      <div className="relative flex-1 min-h-0">
        {loading && data && data.length > 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-sm">{t('query.result.refreshing', '刷新中...')}</span>
            </div>
          </div>
        )}
        <DataGridWrapper
          ref={dataGridRef}
          rowData={data}
          columns={gridColumnDefs}
          loading={false}
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
