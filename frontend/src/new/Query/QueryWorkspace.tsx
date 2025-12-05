import * as React from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  ImperativePanelHandle,
} from "react-resizable-panels";
import { useTranslation } from "react-i18next";
import { ChevronUp, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/new/components/ui/button";
import { useQueryWorkspace } from "@/new/hooks/useQueryWorkspace";
import { DataSourcePanel } from "./DataSourcePanel";
import { QueryTabs } from "./QueryTabs";
import { ResultPanel } from "./ResultPanel";

interface QueryWorkspaceProps {
  defaultLayout?: number[];
}

export const QueryWorkspace: React.FC<QueryWorkspaceProps> = () => {
  const { t } = useTranslation("common");
  const {
    selectedTables,
    currentTab,
    queryResults,
    handleTableSelect,
    handleTabChange,
    handleQueryExecute,
  } = useQueryWorkspace();

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
    <div className="h-full w-full bg-background">
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
            <div className="h-full w-full bg-surface border-r border-border flex items-center justify-center">
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
                className={`h-4 w-4 bg-surface border border-border rounded shadow-sm transition-opacity relative z-10 ${
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
                <div className="h-full bg-surface" />
              ) : (
                <ResultPanel
                  data={queryResults?.data ?? null}
                  columns={queryResults?.columns ?? null}
                  loading={queryResults?.loading ?? false}
                  error={queryResults?.error ?? null}
                  rowCount={queryResults?.rowCount}
                  execTime={queryResults?.execTime}
                />
              )}
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  );
};
