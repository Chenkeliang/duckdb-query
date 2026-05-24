import * as React from "react";
import { useTranslation } from "react-i18next";
import { Code, GitMerge, Layers, Table2, Clock, Star } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SQLPreview } from "../components/SQLPreview";
import { SQLQueryPanel } from "../SQLQuery";
import { JoinQueryPanel } from "../JoinQuery";
import { SetOperationsPanel } from "../SetOperations";
import { PivotPanel } from "../PivotTable/PivotPanel";
import { GlobalHistoryPanel } from "../History/GlobalHistoryPanel";
import { SavedQueriesPanel } from "../Bookmarks/SavedQueriesPanel";
import { useGlobalHistory } from "../hooks/useGlobalHistory";
import { useSavedQueries } from "../hooks/useSavedQueries";
import type { SelectedTable } from "@/types/SelectedTable";
import type {
  JoinRestoreRequest,
  TableSource,
  UseQueryWorkspaceReturn,
} from "@/hooks/useQueryWorkspace";
import type { JoinWorkspacePersistence } from "@/Query/JoinQuery/joinWorkspaceSnapshot";
import { extractJoinWorkspaceFromSql } from "@/Query/JoinQuery/joinWorkspaceSnapshot";
import type { GlobalHistoryItem } from "../hooks/useGlobalHistory";
import {
  generateDatabaseAlias,
  parseSQLTableReferences,
  buildAttachDatabasesFromParsedRefs
} from "@/utils/sqlUtils";
import { useDatabaseConnections } from "@/hooks/useDatabaseConnections";

/**
 * 查询模式 Tab 组件
 * 
 * 职责：
 * - 显示 5 个查询模式 Tab
 * - 处理 Tab 切换
 * - 渲染对应的查询面板（SQL / Join / Set / Pivot）
 * - 提供全局功能入口：历史记录、收藏夹
 * 
 * 样式：
 * - 与数据源管理页面保持一致
 * - 使用 shadcn/ui Tabs
 */

interface QueryMode {
  id: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
}

const queryModes: QueryMode[] = [
  { id: 'sql', labelKey: 'query.tabs.sql', icon: Code },
  { id: 'join', labelKey: 'query.tabs.join', icon: GitMerge },
  { id: 'set', labelKey: 'query.tabs.set', icon: Layers },
  { id: 'pivot', labelKey: 'query.tabs.pivot', icon: Table2 },
];

interface QueryTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  selectedTables: SelectedTable[];
  onExecute: (sql: string, source?: TableSource) => Promise<void>;
  onDisplayPreview?: UseQueryWorkspaceReturn['displayQueryPreview'];
  onRemoveTable?: (table: SelectedTable) => void;
  /** 取消回调 */
  onCancel?: () => void;
  /** 是否正在取消 */
  isCancelling?: boolean;
  /** 预览 SQL（来自异步任务等） */
  previewSQL?: string;
  joinRestoreRequest?: JoinRestoreRequest | null;
  restoreJoinWorkspace?: (snapshot: JoinRestoreRequest['snapshot']) => void;
  onClearJoinRestoreRequest?: () => void;
}

// 注意：不再使用 wrapExecute，直接传递 onExecute 以保留 source 参数
// 子组件需要支持 (sql: string, source?: TableSource) 签名

export const QueryTabs: React.FC<QueryTabsProps> = ({
  activeTab,
  onTabChange,
  selectedTables,
  onExecute,
  onDisplayPreview,
  onRemoveTable,
  onCancel,
  isCancelling,
  previewSQL: externalPreviewSQL,
  joinRestoreRequest,
  restoreJoinWorkspace,
  onClearJoinRestoreRequest,
}) => {
  const joinPersistenceRef = React.useRef<JoinWorkspacePersistence | null>(null);
  const { t } = useTranslation('common');

  // 全局功能状态
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [bookmarksOpen, setBookmarksOpen] = React.useState(false);

  // Hooks
  const { history, addToHistory, deleteHistoryItem, clearHistory } = useGlobalHistory();
  const { favorites } = useSavedQueries();
  const { connections } = useDatabaseConnections();

  // SQL 预览状态
  const [loadedSqlPreview, setLoadedSqlPreview] = React.useState<string | undefined>(undefined);
  const [previewDialogOpen, setPreviewDialogOpen] = React.useState(false);
  const [previewDialogSql, setPreviewDialogSql] = React.useState<string | null>(null);
  const [previewSource, setPreviewSource] = React.useState<TableSource | undefined>(undefined);
  const [isPreviewExecuting, setIsPreviewExecuting] = React.useState(false);

  // ... (createWrappedExecute and handleJoinExecute definitions skipped for brevity, they are unchanged)

  const handleLoadSQL = async (
    sql: string,
    type: string = 'sql',
    options?: { joinSnapshot?: GlobalHistoryItem['joinSnapshot'] }
  ) => {
    if (type === 'join' && options?.joinSnapshot && restoreJoinWorkspace) {
      restoreJoinWorkspace(options.joinSnapshot);
      setHistoryOpen(false);
      setBookmarksOpen(false);
      return;
    }

    const { sql: sqlBody, snapshot } = extractJoinWorkspaceFromSql(sql);

    if (type === 'join' && snapshot && restoreJoinWorkspace) {
      restoreJoinWorkspace(snapshot);
      setHistoryOpen(false);
      setBookmarksOpen(false);
      return;
    }

    onTabChange('sql');
    setLoadedSqlPreview(sqlBody);
    setPreviewDialogSql(sqlBody);

    // 1. 尝试解析 SQL 中的联邦查询注释 (优先级最高, 因为它明确指出了意图)
    // 格式: -- 联邦查询: db1, db2
    let attachDatabases: { alias: string; connectionId: string }[] = [];
    const federatedMatch = sqlBody.match(/-- 联邦查询: (.+)/);

    if (federatedMatch) {
      const dbAliases = federatedMatch[1].split(',').map(s => s.trim());
      attachDatabases = dbAliases.map(alias => {
        // ... (Same matching logic as before)
        const exactMatch = connections.find(c => generateDatabaseAlias(c) === alias);
        if (exactMatch) return { alias, connectionId: exactMatch.id };
        const partialMatch = connections.find(c => alias.startsWith(generateDatabaseAlias(c)));
        if (partialMatch) return { alias, connectionId: partialMatch.id };
        return { alias, connectionId: 'unknown' };
      }).filter(db => db.connectionId !== 'unknown');
    }

    // 2. 如果没有注释或注释解析为空，尝试自动分析 SQL (更健壮的方式)
    if (attachDatabases.length === 0) {
      // 使用已导入的 parser (sqlUtils)
      try {
        const parsedRefs = parseSQLTableReferences(sqlBody);
        const autoDetected = buildAttachDatabasesFromParsedRefs(parsedRefs, connections);
        attachDatabases = autoDetected.attachDatabases;
      } catch (e) {
        console.error("Failed to auto-detect federated sources:", e);
      }
    }

    if (attachDatabases.length > 0) {
      setPreviewSource({
        type: 'federated',
        attachDatabases
      });
    } else {
      setPreviewSource(undefined);
    }

    setPreviewDialogOpen(true);
  };

  const handlePreviewDialogExecute = React.useCallback(
    async (sql: string) => {
      setIsPreviewExecuting(true);
      try {
        await onExecute(sql, previewSource);
        setPreviewDialogOpen(false);
      } finally {
        setIsPreviewExecuting(false);
      }
    },
    [onExecute, previewSource]
  );

  const sqlPanelPreview = externalPreviewSQL ?? loadedSqlPreview;

  // 创建包装后的执行函数，自动记录到全局历史
  const createWrappedExecute = React.useCallback(
    (type: 'join' | 'set' | 'pivot') =>
      async (sql: string, source?: TableSource) => {
        if (!onExecute) return;
        const startTime = Date.now();
        const joinSnapshot =
          type === 'join' ? joinPersistenceRef.current?.getSnapshot() : undefined;
        try {
          await onExecute(sql, source);
          addToHistory({
            type,
            sql,
            executionTime: Date.now() - startTime,
            ...(joinSnapshot ? { joinSnapshot } : {}),
          });
        } catch (err) {
          addToHistory({
            type,
            sql,
            error: (err as Error)?.message || String(err),
            ...(joinSnapshot ? { joinSnapshot } : {}),
          });
          throw err; // 重新抛出，让 Panel 处理错误 UI
        }
      },
    [onExecute, addToHistory]
  );

  // 为各面板创建特定的执行函数（memoized 避免不必要的重渲染）
  const handleJoinExecute = React.useMemo(
    () => createWrappedExecute('join'),
    [createWrappedExecute]
  );
  const handleSetExecute = React.useMemo(
    () => createWrappedExecute('set'),
    [createWrappedExecute]
  );
  const handlePivotExecute = React.useMemo(
    () => createWrappedExecute('pivot'),
    [createWrappedExecute]
  );

  // 加载历史/收藏到编辑器
  // 注意：这需要各 Panel 提供 ref 或对外暴露设置 SQL 的方法
  // 但目前架构中 Panel 自行管理状态。
  // 临时方案：如果当前是 SQL 模式，我们尝试通过 props 或 context 传递？
  // 实际上，更理想的方式是 GlobalHistoryPanel/SavedQueriesPanel 只负责展示
  // 点击加载时，调用一个统一的 onExecute 或者切换 Tab 并设置内容。

  // 这里我们简化处理：通过 onExecute 直接运行（如果是纯 SQL）
  // 或者跳转到 SQL Tab 并填充内容（如果能获取到 SQL Panel 的控制权）

  // 由于 React 状态隔离，最简单的集成方式是：
  // 点击加载 -> 切换到 SQL Tab -> (理想情况下) 填充编辑器。
  // 但当前没有全局状态管理 SQL 内容。
  // 必须妥协：点击加载 -> 直接作为执行请求触发 onExecute
  // (或者未来重构为 SQL 内容提升到 QueryTabs 状态管理)



  return (
    <>
      <SQLPreview
        sql={previewDialogSql}
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        onExecute={handlePreviewDialogExecute}
        isExecuting={isPreviewExecuting}
      />

      <GlobalHistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        history={history}
        onDelete={deleteHistoryItem}
        onClear={clearHistory}
        onLoad={(item: GlobalHistoryItem) =>
          handleLoadSQL(item.sql, item.type, { joinSnapshot: item.joinSnapshot })
        }
      />

      <SavedQueriesPanel
        open={bookmarksOpen}
        onOpenChange={setBookmarksOpen}
        onLoad={(sql, type) => handleLoadSQL(sql, type)}
      />

      <Tabs value={activeTab} onValueChange={onTabChange} className="h-full flex flex-col bg-card">
        {/* 标签页导航 - 与数据源管理页面样式一致 */}
        <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-muted/30 shrink-0">
          <TabsList className="flex gap-1 bg-muted p-1 rounded-lg h-9">
            {queryModes.map(mode => {
              const Icon = mode.icon;
              return (
                <TabsTrigger key={mode.id} value={mode.id} className="gap-2">
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t(mode.labelKey)}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-yellow-500"
              onClick={() => setBookmarksOpen(true)}
              title={t('query.bookmark.title', 'SQL 收藏夹')}
            >
              <Star className="w-4 h-4" />
            </Button>
            {favorites?.length > 0 && (
              <Badge variant="outline" className="h-5 px-1.5 min-w-5 justify-center text-xs">
                {favorites.length}
              </Badge>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setHistoryOpen(true)}
              title={t('query.history.title', '查询历史')}
            >
              <Clock className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <KeepAliveTabContent value="sql" activeTab={activeTab} className="h-full m-0 p-0 overflow-auto">
            <SQLQueryPanel
              selectedTables={selectedTables}
              onExecute={onExecute}
              editorMinHeight="150px"
              editorMaxHeight="300px"
              previewSQL={sqlPanelPreview}
            />
          </KeepAliveTabContent>

          <KeepAliveTabContent value="join" activeTab={activeTab} className="h-full m-0 p-0 overflow-auto">
            <JoinQueryPanel
              selectedTables={selectedTables}
              onExecute={handleJoinExecute}
              onDisplayPreview={onDisplayPreview}
              onRemoveTable={onRemoveTable}
              onCancel={onCancel}
              isCancelling={isCancelling}
              persistenceRef={joinPersistenceRef}
              joinRestoreRequest={joinRestoreRequest}
              onClearJoinRestoreRequest={onClearJoinRestoreRequest}
            />
          </KeepAliveTabContent>

          <KeepAliveTabContent value="set" activeTab={activeTab} className="h-full m-0 p-0 overflow-auto">
            <SetOperationsPanel
              selectedTables={selectedTables}
              onExecute={handleSetExecute}
              onDisplayPreview={onDisplayPreview}
              onRemoveTable={onRemoveTable}
            />
          </KeepAliveTabContent>

          <KeepAliveTabContent value="pivot" activeTab={activeTab} className="h-full m-0 p-0 overflow-auto">
            <PivotPanel
              selectedTables={selectedTables}
              onExecute={handlePivotExecute}
              onDisplayPreview={onDisplayPreview}
            />
          </KeepAliveTabContent>

        </div>
      </Tabs>
    </>
  );
};

// =============================================================================
// Helper Components
// =============================================================================

/**
 * 保持存活的 Tab 内容组件
 * 
 * 只有在第一次激活时才渲染，之后切换 Tab 时只是隐藏而不是卸载，
 * 从而保留 Tab 内部的状态（如筛选条件、滚动位置等）。
 */
interface KeepAliveTabContentProps {
  value: string;
  activeTab: string;
  children: React.ReactNode;
  className?: string;
}

const KeepAliveTabContent: React.FC<KeepAliveTabContentProps> = ({
  value,
  activeTab,
  children,
  className,
}) => {
  const [hasVisited, setHasVisited] = React.useState(false);

  React.useEffect(() => {
    if (value === activeTab) {
      setHasVisited(true);
    }
  }, [value, activeTab]);

  // 如果从未访问过且不是当前 tab，不渲染（懒加载）
  if (!hasVisited && value !== activeTab) return null;

  return (
    <div
      role="tabpanel"
      data-state={activeTab === value ? "active" : "inactive"}
      className={className}
      style={{ display: activeTab === value ? "block" : "none" }}
    >
      {children}
    </div>
  );
};
