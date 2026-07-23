/**
 * 结果面板组件（TanStack DataGrid）
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import {
  exportQueryResults,
  getQueryExportDownloadUrl,
  saveQueryExportToPath,
  toAttachDatabasesPayload,
} from '@/api';
import {
  showErrorToast,
  showSavedToToast,
  cleanErrorMessage,
  showDownloadStartedToast,
} from '@/utils/toastHelpers';
import { parseDuckDbErrorSuggestion } from '@/utils/sqlErrorHelper';
import { openExternal, isTauri } from '@/desktop/openExternal';
import { pickSavePath } from '@/desktop/saveLocal';
import { Button } from '@/components/ui/button';
import { SQLHighlight } from '@/components/SQLHighlight';
import { useAiEnabled } from '@/hooks/useAiEnabled';
import { errorFix, type ErrorFixResult } from '@/api';
import { parseSQLTableReferences } from '@/utils/sqlUtils';
import { EngineCompatSelfHealBanner } from '@/Query/components/EngineCompatSelfHealBanner';
import { IS_DEMO } from '@/demo/isDemo';

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
import type { DuckdbColumnType } from '@/types/queryWorkspace';
import { ChartView } from '@/Query/Charts/ChartView';
import { useKeyboardShortcuts } from '@/Settings/shortcuts/useKeyboardShortcuts';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';

export interface ResultPanelProps {
  data: Record<string, unknown>[] | null;
  columns?: string[] | null;
  duckdbColumnTypes?: DuckdbColumnType[];
  loading?: boolean;
  error?: Error | null;
  executionTime?: number;
  execTime?: number;
  previewLimitApplied?: number | null;
  /** 重新执行最近一次查询（单结果槽） */
  onRefresh?: () => void;
  /** 仅刷新指定结果 Tab（多 Tab 模式） */
  onRefreshTab?: (tabId: string) => void;
  /** 最近一次执行失败的报错文本(工作区级,两种结果模式都有):自愈横幅据此判断是否渲染。
   *  多 Tab 模式下失败的新查询不产生结果 Tab,面板 error 恒为空,必须走这条独立通道 */
  selfHealErrorMessage?: string | null;
  /** 自愈横幅"重跑":用失败时的 SQL/source 原样重执行 */
  onSelfHealRerun?: () => void;
  className?: string;
  emptyMessage?: string;
  showToolbar?: boolean;
  currentSQL?: string;
  /** 无系统 LIMIT 的基础 SQL(生成式面板的 sql 烤入了预览 LIMIT);服务端导出优先用它 */
  currentBaseSQL?: string;
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
  onTogglePinResultTab?: (id: string) => void;
  /** 未开启保留时的单槽标题 */
  singleResultSlotLabel?: string;
  /** 图表下钻:收到明细 SQL,由调用方负责填入编辑器(不自动执行) */
  onDrilldown?: (sql: string) => void;
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
  duckdbColumnTypes,
  loading = false,
  error = null,
  executionTime,
  execTime,
  previewLimitApplied,
  onRefresh,
  onRefreshTab,
  selfHealErrorMessage = null,
  onSelfHealRerun,
  className = '',
  emptyMessage,
  showToolbar = true,
  currentSQL,
  currentBaseSQL,
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
  onTogglePinResultTab,
  singleResultSlotLabel,
  onDrilldown,
}) => {
  const actualExecTime = executionTime ?? execTime;
  const { t, i18n } = useTranslation('common');
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

  const [resultView, setResultView] = useState<'table' | 'chart'>('table');

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
    // 单槽模式(retainQueryResults 默认 false)下没有 activeResultTabId,grid 挂在
    // dataGridRef 上——必须回退到它,否则列操作(切换/显隐/自适应列宽)因拿不到 API 被
    // ?. 静默吞掉,表现为"列面板能开、点了没反应"。多页模式仍优先按 tabId 取。
    if (activeResultTabId) {
      return gridApisRef.current.get(activeResultTabId) ?? dataGridRef.current ?? undefined;
    }
    return dataGridRef.current ?? undefined;
  }, [activeResultTabId]);

  const useMultiTabGrids = retainQueryResults && resultTabs.length > 0;

  const effectiveSource = useMultiTabGrids ? activeTab?.query.source : source;
  const effectiveSQL = useMultiTabGrids ? activeTab?.query.sql : currentSQL;

  // 图表视图：列信息（多页用激活 tab 的,单槽用外层;优先 duckdbColumnTypes 取精确类型）
  const chartColumns = React.useMemo(() => {
    const dct = useMultiTabGrids ? activeTab?.result.duckdbColumnTypes : duckdbColumnTypes;
    const cols = useMultiTabGrids ? activeTab?.result.columns : columns;
    if (dct && dct.length > 0) {
      return dct.map((c) => ({ name: c.name, type: c.duckdb_type }));
    }
    if (cols && cols.length > 0) {
      return cols.map((name) => ({ name, type: '' }));
    }
    return [];
  }, [useMultiTabGrids, activeTab?.result.duckdbColumnTypes, activeTab?.result.columns, duckdbColumnTypes, columns]);

  // 图表视图:attach 从 effectiveSource(单槽=source / 多页=activeTab.query.source)取,
  // 二者都已传入;不依赖未被父级传递的 attachDatabases prop(否则联邦图表重跑拿不到 ATTACH)。
  const effectiveAttachDatabases = React.useMemo(
    () =>
      (effectiveSource?.attachDatabases || []).map((d) => ({
        alias: d.alias,
        connectionId: d.connectionId,
      })),
    [effectiveSource],
  );

  const chartSource = React.useMemo(() => ({
    sql: effectiveSQL ?? null,
    attachDatabases: effectiveAttachDatabases,
    requiresFederated: effectiveSource?.type === 'federated',
  }), [effectiveSQL, effectiveAttachDatabases, effectiveSource?.type]);

  // AI 报错医生（LLM 解释并修复），仅在 AI 开启时露出入口
  const aiEnabled = useAiEnabled();
  const [aiFix, setAiFix] = useState<ErrorFixResult | null>(null);
  const [aiFixing, setAiFixing] = useState(false);

  // 图表数据源（多页用激活 tab,单槽用外层),供单/多页两条渲染路径共用
  const aiLocale: 'zh' | 'en' = i18n.language?.startsWith('zh') ? 'zh' : 'en';
  const chartRows = (useMultiTabGrids ? activeTab?.result.data : data) ?? [];

  // 新一次执行产生新结果时,视图切回默认的「表格」(如从图表下钻执行明细 SQL 后不该停在图表页)
  const latestResultRows = useMultiTabGrids ? activeTab?.result.data : data;
  React.useEffect(() => {
    setResultView('table');
  }, [latestResultRows]);
  const chartPreviewLimit = useMultiTabGrids
    ? activeTab?.result.previewLimitApplied
    : previewLimitApplied;
  const chartTruncated = chartPreviewLimit != null && chartRows.length >= chartPreviewLimit;

  const chartViewEl = (
    <div className="h-full overflow-auto p-3">
      <ChartView
        columns={chartColumns}
        rows={chartRows}
        truncated={chartTruncated}
        source={chartSource}
        aiEnabled={aiEnabled}
        locale={aiLocale}
        onDrilldown={onDrilldown}
      />
    </div>
  );

  const showImportButton =
    effectiveSource?.type === 'federated' &&
    !!effectiveSource.connectionId &&
    !!effectiveSQL;

  const { columns: gridColumnDefs } = useDataGridColumns({
    data,
    fieldOrder: columns,
    duckdbColumnTypes,
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


  const handleExportParquetServer = useCallback(async (applyRowLimit: boolean) => {
    // 基础 SQL 优先(无系统预览 LIMIT):全量导出才是真全量;生成式面板(JOIN/SET/Pivot)的
    // query.sql 烤入了预览 LIMIT,不能用作导出输入(复审 P1)
    const sql = useMultiTabGrids
      ? (activeTab?.query.baseSql ?? activeTab?.query.sql)?.trim()
      : (currentBaseSQL ?? currentSQL)?.trim();
    if (!sql) {
      showErrorToast(t, 'EXPORT_NO_SQL', t('query.result.exportNoSql', '无 SQL 可导出'));
      return;
    }
    try {
      // 桌面:先让用户经原生存盘对话框选路径,再服务端导出并直写过去
      // (免浏览器跳转、免二次落盘);Web 维持浏览器流式下载
      let targetPath: string | null = null;
      if (isTauri()) {
        targetPath = await pickSavePath('query_result.parquet');
        if (!targetPath) return; // 用户取消
      }
      const result = await exportQueryResults({
        sql,
        format: 'parquet',
        apply_row_limit: applyRowLimit,
        // attach 必须取自 effectiveSource(单槽=source / 多页=activeTab.query.source),
        // 与图表视图同源;原来的 attachDatabases prop 父级并不可靠传递,联邦导出会
        // 拿不到 ATTACH → "schema xxx does not exist"(与 effectiveSQL 配套)。
        attach_databases: toAttachDatabasesPayload(effectiveAttachDatabases),
      });
      if (targetPath) {
        await saveQueryExportToPath(result.file_id, { targetPath });
        showSavedToToast(t, targetPath);
        return;
      }
      const url = getQueryExportDownloadUrl(result.download_url);
      openExternal(url);
      showDownloadStartedToast(t);
    } catch (err) {
      showErrorToast(
        t,
        err instanceof Error ? err : 'EXPORT_FAILED',
        t('query.result.exportParquetFailed', 'Parquet 导出失败')
      );
    }
  }, [
    useMultiTabGrids,
    activeTab?.query.sql,
    activeTab?.query.baseSql,
    currentSQL,
    currentBaseSQL,
    effectiveAttachDatabases,
    t,
  ]);

  const handleRefreshActiveTab = useCallback(() => {
    if (useMultiTabGrids && activeResultTabId && onRefreshTab) {
      onRefreshTab(activeResultTabId);
      return;
    }
    onRefresh?.();
  }, [useMultiTabGrids, activeResultTabId, onRefreshTab, onRefresh]);

  // Cmd+R / Ctrl+R：重跑当前结果查询（capture 阶段拦截浏览器刷新；可在 设置-键盘快捷键 中改键）
  useKeyboardShortcuts({ rerunQuery: handleRefreshActiveTab });

  const toolbarProps = {
    stats: toolbarStats,
    gridColumns,
    onToggleColumn: (field: string) => getActiveGridApi()?.toggleColumnVisibility(field),
    onShowAllColumns: () => getActiveGridApi()?.showAllColumns(),
    onResetColumns: () => getActiveGridApi()?.resetColumns(),
    onAutoFitColumns: () => getActiveGridApi()?.autoFitAllColumns(),
    onFitToWidth: () => getActiveGridApi()?.fitToWidth(),
    onExportCsv: () => getActiveGridApi()?.exportDataAsCsv(),
    onExportExcel: () => getActiveGridApi()?.exportDataAsExcel(),
    onExportJson: () => getActiveGridApi()?.exportDataAsJson(),
    // Demo:Parquet 导出走服务端 → 关闭(CSV/Excel/JSON 是客户端导出,保留)
    onExportParquet: !IS_DEMO && (currentSQL || activeTab?.query.sql)
      ? handleExportParquetServer
      : undefined,
    onToggleFullscreen: handleToggleFullscreen,
    isFullscreen,
    // Demo:结果存为 DuckDB 表走服务端 → 隐藏
    showImportButton: !IS_DEMO && !!showImportButton,
    onImportToDuckDB: handleImportClick,
  };

  // 顶部合并栏左侧：多 Tab → 标签页（可横向滚动）；单结果 → 表名
  const headerLeft =
    retainQueryResults && resultTabs.length > 0 && onSelectResultTab && onCloseResultTab ? (
      <ResultTabsBar
        tabs={resultTabs}
        activeTabId={activeResultTabId}
        onSelectTab={onSelectResultTab}
        onCloseTab={onCloseResultTab}
        onCloseOthers={onCloseOtherResultTabs ?? onCloseResultTab}
        onCloseToLeft={onCloseResultTabsToLeft ?? onCloseResultTab}
        onCloseToRight={onCloseResultTabsToRight ?? onCloseResultTab}
        onTogglePin={onTogglePinResultTab}
      />
    ) : !retainQueryResults && singleResultSlotLabel ? (
      <span className="truncate px-3 text-xs font-medium text-foreground">
        {singleResultSlotLabel}
      </span>
    ) : null;

  // 顶部合并栏：左 Tab/表名（滚动）┃ 右 工具栏按钮。竖线在按钮组左侧，多 Tab 增减时位置不动
  const renderHeaderBar = (toolbar: React.ReactNode) => {
    if (!headerLeft && !toolbar) return null;
    return (
      <>
        <div className="flex items-stretch border-b border-border bg-muted/30 min-h-[40px]">
          <div className="flex min-w-0 flex-1 items-center overflow-x-auto">{headerLeft}</div>
          {toolbar && (
            <div className="flex shrink-0 items-center pr-2">
              <div className="mx-2 h-4 w-px bg-border" />
              {toolbar}
            </div>
          )}
        </div>
        {/* 自愈横幅挂在头部栏下方:与结果视图分支无关,多 Tab 模式失败(无错误视图)也可见 */}
        {selfHealErrorMessage && onSelfHealRerun && (
          <EngineCompatSelfHealBanner
            errorMessage={selfHealErrorMessage}
            onRerun={onSelfHealRerun}
            className="mx-3 mt-2"
          />
        )}
      </>
    );
  };

  if (useMultiTabGrids) {
    const activeSql = activeTab?.query.sql;
    // 保存到 DuckDB 用基础 SQL(无系统预览 LIMIT):生成式面板(JOIN/SET/Pivot)的 query.sql
    // 烤入了预览 LIMIT,"全量"落表会只存预览行数;与服务端导出同一口径(复审 P1)
    const activeSaveSql = activeTab?.query.baseSql ?? activeSql;
    const activeSource = activeTab?.query.source;

    return (
      <div className={`flex flex-col h-full ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : ''} ${className}`}>
        {renderHeaderBar(
          showToolbar ? (
            <ResultToolbar
              {...toolbarProps}
              resultView={resultView}
              onResultViewChange={setResultView}
            />
          ) : null
        )}
        <div className="relative flex-1 min-h-0">
          {resultView === 'table'
            ? resultTabs.map((tab) => (
                <ResultTabGridPane
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeResultTabId}
                  registerGridApi={registerGridApi}
                  onStatsChange={setDataGridStats}
                  onColumnVisibilityChange={handleColumnVisibilityChange}
                  emptyMessage={emptyMessage}
                />
              ))
            : chartViewEl}
        </div>
        {activeSaveSql && (
          <ImportToDuckDBDialog
            open={importDialogOpen}
            onOpenChange={setImportDialogOpen}
            sql={activeSaveSql}
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
        {renderHeaderBar(
          showToolbar ? <ResultToolbar {...toolbarProps} stats={emptyStats} disabled /> : null
        )}
        <div
          className="flex flex-1 flex-col overflow-hidden bg-background"
          role="status"
          aria-label={t('query.result.loading', '加载中...')}
        >
          {/* 表头骨架 */}
          <div className="flex gap-px border-b border-border bg-muted/40 px-3 py-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-3.5 flex-1" />
            ))}
          </div>
          {/* 行骨架 */}
          <div className="flex-1 space-y-2.5 p-3">
            {Array.from({ length: 14 }).map((_, r) => (
              <div key={r} className="flex gap-4">
                {Array.from({ length: 6 }).map((_, c) => (
                  <Skeleton key={c} className="h-4 flex-1" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    const suggestion = parseDuckDbErrorSuggestion(error.message);
    const runAiFix = async () => {
      setAiFixing(true);
      try {
        const r = await errorFix(effectiveSQL || '', error.message, {
          // 带上 SQL 里引用的表(联邦表用限定名)+ 外部库，让医生看到真实列名
          tables: parseSQLTableReferences(effectiveSQL || '').map((ref) => ref.fullName),
          attachDatabases: effectiveAttachDatabases,
          locale: i18n.language?.startsWith('zh') ? 'zh' : 'en',
        });
        setAiFix(r);
      } catch (e) {
        showErrorToast(t, e as Error, t('query.result.aiFixFailed', 'AI 修复失败'));
      } finally {
        setAiFixing(false);
      }
    };
    return (
      <div className={`flex flex-col h-full ${className}`}>
        {renderHeaderBar(
          showToolbar ? <ResultToolbar {...toolbarProps} stats={emptyStats} disabled /> : null
        )}
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 text-destructive max-w-lg text-center px-4">
            <AlertCircle className="h-10 w-10" />
            <span className="font-medium">{t('query.result.error', '查询失败')}</span>
            <span className="text-sm text-muted-foreground">{cleanErrorMessage(error.message)}</span>
            {suggestion && (
              <span className="text-sm text-warning">
                {t('query.result.didYouMean', '你是不是想找：{{names}}？', {
                  names: suggestion.candidates.map((c) => `"${c}"`).join(', '),
                })}
              </span>
            )}
            {aiEnabled && effectiveSQL && (
              <Button variant="outline" size="sm" disabled={aiFixing} onClick={runAiFix}>
                {aiFixing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span className="ml-1">{t('query.result.aiExplainFix', 'AI 解释并修复')}</span>
              </Button>
            )}
            {aiFix && (
              <div className="w-full text-left text-foreground border rounded-lg p-3 mt-1">
                <p className="text-sm text-muted-foreground mb-2 whitespace-pre-wrap">
                  {aiFix.explanation}
                </p>
                {aiFix.fixed_sql && aiFix.safe && (
                  <SQLHighlight sql={aiFix.fixed_sql} minHeight="48px" maxHeight="200px" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={`flex flex-col h-full ${className}`}>
        {renderHeaderBar(
          showToolbar ? <ResultToolbar {...toolbarProps} stats={emptyStats} /> : null
        )}
        <div className="flex-1 flex items-center justify-center bg-background">
          <EmptyState
            icon={Database}
            title={emptyMessage || t('query.result.noData', '暂无数据')}
            description={t('query.result.noDataHint', '执行查询以查看结果')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : ''} ${className}`}>
      {renderHeaderBar(
        showToolbar ? (
          <ResultToolbar
            {...toolbarProps}
            resultView={resultView}
            onResultViewChange={setResultView}
          />
        ) : null
      )}
      <div className="relative flex-1 min-h-0">
        {resultView === 'table' ? (
          <>
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
              executionTime={actualExecTime}
              previewLimitApplied={previewLimitApplied}
              enableSelection
              enableFiltering
              enableSorting
              onStatsChange={setDataGridStats}
              onColumnVisibilityChange={handleColumnVisibilityChange}
            />
          </>
        ) : chartViewEl}
      </div>

      {/* 保存到 DuckDB 用基础 SQL(无系统预览 LIMIT),与服务端导出同一口径(复审 P1) */}
      {(currentBaseSQL ?? currentSQL) && (
        <ImportToDuckDBDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          sql={(currentBaseSQL ?? currentSQL)!}
          source={source}
        />
      )}
    </div>
  );
};

export default ResultPanel;
