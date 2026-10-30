import * as React from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  ImperativePanelHandle,
} from "react-resizable-panels";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronUp, ChevronDown, Star, Clock } from "lucide-react";
import { DataSourceActions, type DataSourceMethod } from '@/DataSource/DataSourceActions';
import type { DatabaseConnection } from '@/hooks/useDatabaseConnections';
import { Button } from "@/components/ui/button";
import { useQueryRunner } from "@/hooks/useQueryRunner";
import { useAppConfig } from "@/hooks/useAppConfig";
import { DataSourcePanel } from "./DataSourcePanel";
import { QueryTabs } from "./QueryTabs";
import type { QueryTabsHandle } from "./QueryTabs";
import { ResultPanel } from "./ResultPanel";
import { deleteDuckDBTable, type QueryResponse } from "@/api";
import { invalidateAfterTableDelete } from "@/utils/cacheInvalidation";
import { showSuccessToast, showErrorToast } from "@/utils/toastHelpers";
import type { SelectedTable } from "@/types/SelectedTable";
import { normalizeSelectedTable } from "@/utils/tableUtils";
import { generateExternalTableReference } from "@/utils/sqlUtils";
import type { TableSource } from "@/hooks/useQueryWorkspace";

import { ExplorerPanel } from './components/ExplorerPanel';
import { AiDockContext } from './SQLQuery/ai/aiDockContext';
import { agentChatBus, useAgentChatBus } from './SQLQuery/ai/agentChatBus';
import { registerWorkbenchCommand } from './workbenchCommands';
import { SavedQueriesPanel } from './Bookmarks/SavedQueriesPanel';
import { GlobalHistoryPanel } from './History/GlobalHistoryPanel';
import { useGlobalHistory } from './hooks/useGlobalHistory';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

interface QueryWorkspaceProps {
  isActive?: boolean;
  onAddData?: (method: DataSourceMethod) => void;
  onEditConnection?: (connection: DatabaseConnection) => void;
  taskActions?: React.ReactNode;
  backgroundResult?: { response: QueryResponse; sql: string; source: TableSource };
  defaultLayout?: number[];
  /** 预览 SQL（来自异步任务等） */
  previewSQL?: string;
  previewNonce?: number;
  onOpenAiSettings?: () => void;
}

export const QueryWorkspace: React.FC<QueryWorkspaceProps> = ({ previewSQL, previewNonce, onOpenAiSettings, isActive = true, onAddData, onEditConnection, backgroundResult, taskActions }) => {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const [autoOpenImportDialog, setAutoOpenImportDialog] = React.useState(false);
  const [resultViewRequest, setResultViewRequest] = React.useState<{ view: 'metrics' | 'table'; key: number }>();

  const {
    activeExecution,
    moveToBackground,
    selectedTables,
    currentTab,
    queryResults,
    lastQuery,
    lastFailure,
    retryLastFailure,
    isResultLoading,
    retainQueryResults,
    resultTabs,
    activeResultTabId,
    singleResultSlotLabel,
    handleTableSelect,
    restoreSqlTables,
    handleRemoveTable,
    handleTabChange,
    execute: handleQueryExecute,
    refreshResultTab,
    selectResultTab,
    closeResultTabById,
    closeOtherResultTabsById,
    closeResultTabsToLeftOf,
    closeResultTabsToRightOf,
    toggleResultTabPinById,
    displayPreview: displayQueryPreview,
    cancel: cancelQuery,
    isCancelling,
    joinRestoreRequest,
    restoreJoinWorkspace,
    clearJoinRestoreRequest,
  } = useQueryRunner();
  const { maxQueryRows } = useAppConfig();
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [movingToBackground, setMovingToBackground] = React.useState(false);
  React.useEffect(() => {
    setElapsedSeconds(0);
    if (!activeExecution) return;
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - activeExecution.startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [activeExecution]);
  const shownBackgroundResult = React.useRef<typeof backgroundResult>();
  React.useEffect(() => {
    if (!backgroundResult || shownBackgroundResult.current === backgroundResult) return;
    shownBackgroundResult.current = backgroundResult;
    displayQueryPreview({ ...backgroundResult.response, execTime: backgroundResult.response.execution_time_ms }, backgroundResult.sql, backgroundResult.source);
    resultPanelRef.current?.expand();
  }, [backgroundResult, displayQueryPreview]);
  const handleMoveToBackground = async () => {
    setMovingToBackground(true);
    try {
      const taskId = await moveToBackground();
      if (taskId) {
        await queryClient.invalidateQueries({ queryKey: ['async-tasks'] });
        showSuccessToast(t, undefined, t('query.background.moved'));
      }
    } catch (error) {
      showErrorToast(t, error as Error, t('query.background.moveFailed'));
    } finally {
      setMovingToBackground(false);
    }
  };


  // 预览表数据
  // 统一使用 ATTACH 模式：外部表生成带别名前缀的 SQL，通过联邦查询 API 执行
  const handlePreview = React.useCallback(
    async (table: SelectedTable) => {
      const { qualifiedName, attachDatabase } = generateExternalTableReference(table);

      const baseSql = `SELECT * FROM ${qualifiedName}`;
      const sql = `${baseSql} LIMIT ${maxQueryRows}`;

      // 构建 TableSource
      let source: TableSource;
      if (attachDatabase) {
        // 外部表：使用联邦查询模式
        source = {
          type: 'federated',
          attachDatabases: [attachDatabase],
        };
      } else {
        // DuckDB 本地表
        source = { type: 'duckdb' };
      }

      try {
        await handleQueryExecute(sql, source, { baseSql });
      } catch (error) {
        showErrorToast(t, error as Error, t('query.previewFailed', { message: (error as Error).message }));
      }
    },
    [handleQueryExecute, maxQueryRows, t]
  );

  // 数据画像：SUMMARIZE 表 → 走标准执行路径，结果进结果网格（复用全部网格能力）
  const handleProfile = React.useCallback(
    async (table: SelectedTable) => {
      const { qualifiedName } = generateExternalTableReference(table);
      // 包成子查询：SUMMARIZE 是元语句不接 LIMIT，执行路径会自动追加显示 LIMIT
      const sql = `SELECT * FROM (SUMMARIZE ${qualifiedName})`;
      try {
        await handleQueryExecute(sql, { type: 'duckdb' });
      } catch (error) {
        showErrorToast(t, error as Error, t('query.profileFailed', { message: (error as Error).message }));
      }
    },
    [handleQueryExecute, t]
  );

  const handleImport = React.useCallback(
    async (table: SelectedTable) => {
      const normalized = normalizeSelectedTable(table);

      // 只有外部表才能导入
      if (normalized.source !== "external" || !normalized.connection) {
        return;
      }

      const { qualifiedName, attachDatabase } = generateExternalTableReference(table);

      if (!attachDatabase) {
        showErrorToast(t, "INVALID_REQUEST", t("query.import.missingConnection", "缺少外部数据库连接信息"));
        return;
      }

      const baseSql = `SELECT * FROM ${qualifiedName}`;
      const sql = `${baseSql} LIMIT ${maxQueryRows}`;

      // 使用联邦查询模式
      const source: TableSource = {
        type: 'federated',
        connectionId: attachDatabase.connectionId,
        attachDatabases: [attachDatabase],
      };

      try {
        await handleQueryExecute(sql, source, { baseSql });
        setAutoOpenImportDialog(true);
      } catch (error) {
        showErrorToast(t, error as Error, t("query.import.error", `导入失败: ${(error as Error).message}`));
      }
    },
    [handleQueryExecute, maxQueryRows, t]
  );

  // 删除表
  const handleDelete = React.useCallback(
    async (tableName: string) => {
      try {
        await deleteDuckDBTable(tableName);
        await invalidateAfterTableDelete(queryClient);
        showSuccessToast(t, 'TABLE_DELETED', t('query.tableDeleted', { table: tableName }));
      } catch (error) {
        showErrorToast(t, error as Error, t('query.deleteFailed', { message: (error as Error).message }));
        throw error; // 重新抛出以便调用方知道失败了
      }
    },
    [queryClient, t]
  );

  // Panel refs
  const dataSourcePanelRef = React.useRef<ImperativePanelHandle>(null);
  const resultPanelRef = React.useRef<ImperativePanelHandle>(null);
  const queryTabsRef = React.useRef<QueryTabsHandle>(null);

  // 图表下钻:把明细 SQL 回填进 SQL 编辑器(不自动执行)
  const handleDrilldown = React.useCallback((sql: string) => {
    queryTabsRef.current?.loadSql(sql);
  }, []);

  const [desktopAiDock, setDesktopAiDock] = React.useState<HTMLDivElement | null>(null);
  const [mobileAiDock, setMobileAiDock] = React.useState<HTMLDivElement | null>(null);
  const { open: aiOpen } = useAgentChatBus();
  const [savedOpen, setSavedOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const { history, deleteHistoryItem, clearHistory } = useGlobalHistory();

  // 折叠状态
  const [isDataSourceCollapsed, setIsDataSourceCollapsed] = React.useState(false);
  const [isResultCollapsed, setIsResultCollapsed] = React.useState(false);

  const [isNarrow, setIsNarrow] = React.useState(false);
  const aiDock = isNarrow ? mobileAiDock : desktopAiDock;
  const [explorerOverlayOpen, setExplorerOverlayOpen] = React.useState(false);
  const [focusedConnection, setFocusedConnection] = React.useState<{ id: string; token: number }>();
  const [focusedTable, setFocusedTable] = React.useState<{ name: string; token: number }>();
  React.useEffect(() => registerWorkbenchCommand('revealConnection', (id) => {
    setFocusedTable(undefined);
    setFocusedConnection((previous) => ({ id, token: (previous?.token ?? 0) + 1 }));
    if (isNarrow) setExplorerOverlayOpen(true);
    else dataSourcePanelRef.current?.expand();
  }), [isNarrow]);
  React.useEffect(() => registerWorkbenchCommand('revealTable', (name) => {
    setFocusedConnection(undefined);
    setFocusedTable((previous) => ({ name, token: (previous?.token ?? 0) + 1 }));
    if (isNarrow) setExplorerOverlayOpen(true);
    else dataSourcePanelRef.current?.expand();
  }), [isNarrow]);

  // 切换数据源面板
  const toggleDataSourcePanel = React.useCallback(() => {
    if (isNarrow) { setExplorerOverlayOpen((open) => !open); return; }
    const panel = dataSourcePanelRef.current;
    if (!panel) return;

    if (isDataSourceCollapsed) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [isDataSourceCollapsed, isNarrow]);

  React.useEffect(() => registerWorkbenchCommand('toggleExplorer', toggleDataSourcePanel), [toggleDataSourcePanel]);
  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    let restoreExpandedOnDesktop = false;
    const collapseOnNarrowScreen = () => {
      const panel = dataSourcePanelRef.current;
      if (media.matches) {
        restoreExpandedOnDesktop = panel?.isExpanded() ?? false;
        panel?.collapse();
      } else if (restoreExpandedOnDesktop) {
        panel?.expand();
        restoreExpandedOnDesktop = false;
      }
      setIsNarrow(media.matches);
      setExplorerOverlayOpen(false);
    };
    collapseOnNarrowScreen();
    media.addEventListener('change', collapseOnNarrowScreen);
    return () => media.removeEventListener('change', collapseOnNarrowScreen);
  }, []);

  // 切换结果面板
  const toggleResultPanel = React.useCallback(() => {
    const panel = resultPanelRef.current;
    if (!panel) return;

    if (isResultCollapsed) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [isResultCollapsed]);

  const explorerContent = (
            <div className="flex h-full min-h-0 min-w-0 flex-col bg-surface">
              <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
                <span className="mr-auto min-w-0 truncate text-sm font-medium">{t('nav.datasource')}</span>
                <Button variant="ghost" size="icon" className="shrink-0" aria-label={t('query.bookmark.title')} onClick={() => setSavedOpen(true)}><Star className="size-4" /></Button>
                <Button variant="ghost" size="icon" className="shrink-0" aria-label={t('query.history.title')} onClick={() => setHistoryOpen(true)}><Clock className="size-4" /></Button>
              </div>
              {onAddData && <div className="shrink-0 border-b border-border p-2"><DataSourceActions onAddData={onAddData} /></div>}
              <div className="min-h-0 flex-1">
            <DataSourcePanel
              selectedTables={selectedTables[currentTab] || []}
              onTableSelect={handleTableSelect}
              onEditConnection={onEditConnection}
              focusedConnection={focusedConnection}
              focusedTable={focusedTable}
              onCollapse={toggleDataSourcePanel}
              selectionMode={currentTab === "join" || currentTab === "set" ? "multiple" : "single"}
              onPreview={handlePreview}
              onProfile={handleProfile}
              onImport={handleImport}
              onDelete={handleDelete}
            />
              </div>
            </div>
  );

  return (
    <AiDockContext.Provider value={aiDock}>
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      {activeExecution && elapsedSeconds >= 3 && <div role="status" className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-3 py-2 text-sm">
        <span className="text-muted-foreground">{t('query.background.running', { seconds: elapsedSeconds })}</span>
        <Button variant="outline" size="sm" disabled={movingToBackground || isCancelling} onClick={() => void handleMoveToBackground()}>{t(movingToBackground ? 'query.background.moving' : 'query.background.move')}</Button>
      </div>}
      {savedOpen && <SavedQueriesPanel open={savedOpen} onOpenChange={setSavedOpen} onLoad={(sql, type) => queryTabsRef.current?.loadSql(sql, type)} />}
      <GlobalHistoryPanel open={historyOpen} onOpenChange={setHistoryOpen} history={history} onLoad={(item) => queryTabsRef.current?.loadSql(item.sql, item.type, { joinSnapshot: item.joinSnapshot })} onDelete={deleteHistoryItem} onClear={clearHistory} />
      <PanelGroup id="query-workspace-horizontal" direction="horizontal" autoSaveId="query-workspace-h">
        {/* 数据源面板 */}
        <ExplorerPanel
          ref={dataSourcePanelRef}
          collapsed={isDataSourceCollapsed}
          onToggle={toggleDataSourcePanel}
          onCollapse={() => setIsDataSourceCollapsed(true)}
          onExpand={() => setIsDataSourceCollapsed(false)}
        >
          {explorerContent}
        </ExplorerPanel>

        {/* 水平分隔线 */}
        <PanelResizeHandle disabled={isNarrow} className="w-1 shrink-0 bg-border hover:bg-primary cursor-col-resize" />

        {/* 主内容区 */}
        <Panel id="workbench" order={2} defaultSize={80} minSize={30}>
          <PanelGroup direction="vertical" autoSaveId="query-workspace-v">
            {/* 查询区域 */}
            <Panel defaultSize={45} minSize={20}>
              <QueryTabs
                onResultViewRequest={(view) => setResultViewRequest((previous) => ({ view, key: (previous?.key ?? 0) + 1 }))}
                taskActions={taskActions}
                isWorkspaceActive={isActive}
                ref={queryTabsRef}
                activeTab={currentTab}
                onTabChange={handleTabChange}
                selectedTablesByTab={selectedTables}
                onRestoreSqlTables={restoreSqlTables}
                joinRestoreRequest={joinRestoreRequest}
                restoreJoinWorkspace={restoreJoinWorkspace}
                onClearJoinRestoreRequest={clearJoinRestoreRequest}
                onExecute={handleQueryExecute}
                onCancel={cancelQuery}
                isCancelling={isCancelling}
                onDisplayPreview={displayQueryPreview}
                onRemoveTable={handleRemoveTable}
                previewSQL={previewSQL}
                previewNonce={previewNonce}
                onOpenAiSettings={onOpenAiSettings}
              />
            </Panel>

            {/* 垂直分隔线 */}
            <PanelResizeHandle className="h-1.5 bg-border hover:bg-primary transition-colors cursor-row-resize flex items-center justify-center group relative">
              <div className="absolute inset-0 hover:bg-primary/10" />
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); toggleResultPanel(); }}
                onMouseDown={(e) => e.stopPropagation()}
                aria-label={isResultCollapsed ? t("workspace.expandResult") : t("workspace.collapseResult")}
                className={`h-4 w-4 bg-card border border-border rounded shadow-sm transition-opacity relative z-10 ${isResultCollapsed ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
              >
                {isResultCollapsed ? (
                  <ChevronUp className="h-2.5 w-2.5" />
                ) : (
                  <ChevronDown className="h-2.5 w-2.5" />
                )}
              </Button>
            </PanelResizeHandle>

            {/* 结果面板 */}
            <Panel
              ref={resultPanelRef}
              defaultSize={55}
              minSize={10}
              collapsible
              collapsedSize={3}
              onCollapse={() => setIsResultCollapsed(true)}
              onExpand={() => setIsResultCollapsed(false)}
            >
              {isResultCollapsed ? (
                <div className="h-full bg-card" />
              ) : (
                <ResultPanel
                  pushdown={queryResults?.pushdown}
                  viewRequest={resultViewRequest}
                  data={queryResults?.data ?? null}
                  columns={queryResults?.columns ?? null}
                  duckdbColumnTypes={queryResults?.duckdbColumnTypes}
                  loading={
                    retainQueryResults
                      ? (queryResults?.loading ?? false)
                      : (queryResults?.loading ?? false) || isResultLoading
                  }
                  error={queryResults?.error ?? null}
                  selfHealErrorMessage={lastFailure?.errorMessage ?? null}
                  onSelfHealRerun={() => void retryLastFailure()}
                  execTime={queryResults?.execTime}
                  previewLimitApplied={queryResults?.previewLimitApplied}
                  source={lastQuery?.source}
                  currentSQL={lastQuery?.sql}
                  currentBaseSQL={lastQuery?.baseSql}
                  onRefreshTab={
                    activeResultTabId
                      ? (tabId) => void refreshResultTab(tabId)
                      : undefined
                  }
                  onRefresh={
                    !retainQueryResults && lastQuery?.sql
                      ? () => void refreshResultTab()
                      : undefined
                  }
                  retainQueryResults={retainQueryResults}
                  resultTabs={resultTabs}
                  activeResultTabId={activeResultTabId}
                  onSelectResultTab={selectResultTab}
                  onCloseResultTab={closeResultTabById}
                  onCloseOtherResultTabs={closeOtherResultTabsById}
                  onCloseResultTabsToLeft={closeResultTabsToLeftOf}
                  onCloseResultTabsToRight={closeResultTabsToRightOf}
                  onTogglePinResultTab={toggleResultTabPinById}
                  singleResultSlotLabel={singleResultSlotLabel}
                  autoOpenImportDialog={autoOpenImportDialog}
                  onAutoOpenImportDialogConsumed={() => setAutoOpenImportDialog(false)}
                  onDrilldown={handleDrilldown}
                />
              )}
            </Panel>
          </PanelGroup>
        </Panel>
        {aiOpen && !isNarrow && <PanelResizeHandle className="w-px bg-border hover:bg-primary" />}
        {aiOpen && !isNarrow && <Panel id="ai" order={3} defaultSize={30} minSize={20}>
          <div ref={setDesktopAiDock} className="h-full min-h-0" />
        </Panel>}
      </PanelGroup>
      <Sheet open={isNarrow && explorerOverlayOpen} onOpenChange={setExplorerOverlayOpen}>
        <SheetContent side="left" className="w-80 max-w-[88vw] p-0" aria-describedby={undefined}>
          <SheetTitle className="sr-only">{t('nav.datasource')}</SheetTitle>
          <div className="h-full pt-10">{explorerContent}</div>
        </SheetContent>
      </Sheet>
      <Sheet open={isNarrow && aiOpen} onOpenChange={agentChatBus.setOpen}>
        <SheetContent className="w-full max-w-md p-0" showCloseButton={false} aria-describedby={undefined}>
          <SheetTitle className="sr-only">{t('nav.aiAssistant')}</SheetTitle>
          <div ref={setMobileAiDock} className="h-full min-h-0" />
        </SheetContent>
      </Sheet>
    </div>
    </AiDockContext.Provider>
  );
};
