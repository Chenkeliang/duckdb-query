import * as React from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  ImperativePanelHandle,
} from "react-resizable-panels";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/new/components/ui/button";
import { useQueryWorkspace } from "@/new/hooks/useQueryWorkspace";
import { DataSourcePanel } from "./DataSourcePanel";
import { QueryTabs } from "./QueryTabs";
import { ResultPanel } from "./ResultPanel";
import { deleteDuckDBTableEnhanced } from "@/services/apiClient";
import { invalidateAfterTableDelete } from "@/new/utils/cacheInvalidation";
import type { SelectedTable } from "@/new/types/SelectedTable";
import { normalizeSelectedTable } from "@/new/utils/tableUtils";
import { getDialectFromSource, getSourceFromSelectedTable, quoteQualifiedTable } from "@/new/utils/sqlUtils";

interface QueryWorkspaceProps {
  defaultLayout?: number[];
  /** 预览 SQL（来自异步任务等） */
  previewSQL?: string;
}

export const QueryWorkspace: React.FC<QueryWorkspaceProps> = ({ previewSQL }) => {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const [autoOpenImportDialog, setAutoOpenImportDialog] = React.useState(false);
  const {
    selectedTables,
    currentTab,
    queryResults,
    lastQuery,
    handleTableSelect,
    handleRemoveTable,
    handleTabChange,
    handleQueryExecute,
  } = useQueryWorkspace();

  // 预览表数据
  const handlePreview = React.useCallback(
    async (table: SelectedTable) => {
      const source = getSourceFromSelectedTable(table);
      const dialect = getDialectFromSource(source);
      const normalized = normalizeSelectedTable(table);

      const sql = `SELECT * FROM ${quoteQualifiedTable(
        { name: normalized.name, schema: normalized.schema },
        dialect
      )}`;
      try {
        await handleQueryExecute(sql, source);
      } catch (error) {
        toast.error(t('query.previewFailed', { message: (error as Error).message }));
      }
    },
    [handleQueryExecute, t]
  );

  const handleImport = React.useCallback(
    async (table: SelectedTable) => {
      const source = getSourceFromSelectedTable(table);
      if (source.type !== "external") return;

      if (!source.connectionId) {
        toast.error(t("query.import.missingConnection", "缺少外部数据库连接信息"));
        return;
      }

      if (source.databaseType !== "mysql") {
        toast.error(t("query.import.mysqlOnly", "目前仅支持从 MySQL 导入到 DuckDB"));
        return;
      }

      const dialect = getDialectFromSource(source);
      const normalized = normalizeSelectedTable(table);
      const sql = `SELECT * FROM ${quoteQualifiedTable(
        { name: normalized.name, schema: normalized.schema },
        dialect
      )}`;

      try {
        await handleQueryExecute(sql, source);
        setAutoOpenImportDialog(true);
      } catch (error) {
        toast.error(
          t("query.import.error", `导入失败: ${(error as Error).message}`)
        );
      }
    },
    [handleQueryExecute, t]
  );

  // 删除表
  const handleDelete = React.useCallback(
    async (tableName: string) => {
      try {
        await deleteDuckDBTableEnhanced(tableName);
        await invalidateAfterTableDelete(queryClient);
        toast.success(t('query.tableDeleted', { table: tableName }));
      } catch (error) {
        toast.error(t('query.deleteFailed', { message: (error as Error).message }));
        throw error; // 重新抛出以便调用方知道失败了
      }
    },
    [queryClient, t]
  );

  // Panel refs
  const dataSourcePanelRef = React.useRef<ImperativePanelHandle>(null);
  const resultPanelRef = React.useRef<ImperativePanelHandle>(null);

  // 折叠状态
  const [isDataSourceCollapsed, setIsDataSourceCollapsed] = React.useState(false);
  const [isResultCollapsed, setIsResultCollapsed] = React.useState(false);

  // 切换数据源面板
  const toggleDataSourcePanel = React.useCallback(() => {
    const panel = dataSourcePanelRef.current;
    if (!panel) return;
    
    if (isDataSourceCollapsed) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [isDataSourceCollapsed]);

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

  return (
    <div className="h-full w-full bg-background overflow-hidden">
      <PanelGroup direction="horizontal" autoSaveId="query-workspace-h">
        {/* 数据源面板 */}
        <Panel
          ref={dataSourcePanelRef}
          defaultSize={20}
          minSize={15}
          maxSize={40}
          collapsible
          collapsedSize={3}
          onCollapse={() => setIsDataSourceCollapsed(true)}
          onExpand={() => setIsDataSourceCollapsed(false)}
        >
          {isDataSourceCollapsed ? (
            <div className="h-full w-full bg-card border-r border-border flex items-center justify-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleDataSourcePanel}
                className="h-7 w-7"
                aria-label={t("workspace.expandDataSource")}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <DataSourcePanel
              selectedTables={selectedTables[currentTab] || []}
              onTableSelect={handleTableSelect}
              onCollapse={toggleDataSourcePanel}
              selectionMode={currentTab === "join" || currentTab === "set" ? "multiple" : "single"}
              onPreview={handlePreview}
              onImport={handleImport}
              onDelete={handleDelete}
            />
          )}
        </Panel>

        {/* 水平分隔线 */}
        <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors cursor-col-resize" />

        {/* 主内容区 */}
        <Panel defaultSize={80} minSize={50}>
          <PanelGroup direction="vertical" autoSaveId="query-workspace-v">
            {/* 查询区域 */}
            <Panel defaultSize={60} minSize={20}>
              <QueryTabs
                activeTab={currentTab}
                onTabChange={handleTabChange}
                selectedTables={selectedTables[currentTab] || []}
                onExecute={handleQueryExecute}
                onRemoveTable={handleRemoveTable}
                previewSQL={previewSQL}
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
                className={`h-4 w-4 bg-card border border-border rounded shadow-sm transition-opacity relative z-10 ${
                  isResultCollapsed ? "opacity-100" : "opacity-0 group-hover:opacity-100"
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
              defaultSize={40}
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
                  data={queryResults?.data ?? null}
                  columns={queryResults?.columns ?? null}
                  loading={queryResults?.loading ?? false}
                  error={queryResults?.error ?? null}
                  rowCount={queryResults?.rowCount}
                  execTime={queryResults?.execTime}
                  source={lastQuery?.source}
                  currentSQL={lastQuery?.sql}
                  autoOpenImportDialog={autoOpenImportDialog}
                  onAutoOpenImportDialogConsumed={() => setAutoOpenImportDialog(false)}
                />
              )}
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  );
};
