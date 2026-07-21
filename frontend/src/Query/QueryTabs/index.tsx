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
import { useDatabaseConnections } from "@/hooks/useDatabaseConnections";
import { detectFederatedPreviewSource } from "./detectFederatedPreviewSource";

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
  onExecute: (
    sql: string,
    source?: TableSource,
    options?: { baseSql?: string }
  ) => Promise<void>;
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
  onOpenAiSettings?: () => void;
}

/** 供外部(如图表下钻)把 SQL 回填进编辑器,复用与历史/收藏夹相同的加载通道。 */
export interface QueryTabsHandle {
  loadSql: (sql: string) => void;
}

// 注意：不再使用 wrapExecute，直接传递 onExecute 以保留 source 参数
// 子组件需要支持 (sql: string, source?: TableSource) 签名

export const QueryTabs = React.forwardRef<QueryTabsHandle, QueryTabsProps>(({
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
  onOpenAiSettings,
}, ref) => {
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
  // 同一串 SQL 重复加载（如重复下钻同一桶）时,字符串 prop 不变不会触发回填,用序号强制触发
  const [previewSeq, setPreviewSeq] = React.useState(0);
  const [previewDialogOpen, setPreviewDialogOpen] = React.useState(false);
  const [previewDialogSql, setPreviewDialogSql] = React.useState<string | null>(null);
  const [previewSource, setPreviewSource] = React.useState<TableSource | undefined>(undefined);
  const [isPreviewExecuting, setIsPreviewExecuting] = React.useState(false);

  // ... (createWrappedExecute and handleJoinExecute definitions skipped for brevity, they are unchanged)

  const handleLoadSQL = (
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
    setPreviewSeq((s) => s + 1);
    setPreviewDialogSql(sqlBody);
    setPreviewSource(undefined);
    setPreviewDialogOpen(true);
    setHistoryOpen(false);
    setBookmarksOpen(false);
  };

  // 外部(如图表下钻)回填 SQL 的入口:与 SavedQueriesPanel/GlobalHistoryPanel 走同一通道
  React.useImperativeHandle(ref, () => ({
    loadSql: (sql: string) => handleLoadSQL(sql),
  }));

  // 联邦数据源推断较慢，弹窗打开后再算，避免阻塞 Dialog 显示
  React.useEffect(() => {
    if (!previewDialogOpen || !previewDialogSql) return;
    const source = detectFederatedPreviewSource(previewDialogSql, connections);
    setPreviewSource(source);
  }, [previewDialogOpen, previewDialogSql, connections]);

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

  // 外部预填(数据源页"去查询")与内部加载(历史/收藏/下钻)合并为同一通道,后写者生效。
  // 不能用 externalPreviewSQL ?? loadedSqlPreview:App 层 previewQuery 初始是 ''(非 nullish),
  // 且一旦设置过就不清空,会永久遮住内部通道的回填。
  React.useEffect(() => {
    if (externalPreviewSQL) {
      setLoadedSqlPreview(externalPreviewSQL);
      setPreviewSeq((s) => s + 1);
    }
  }, [externalPreviewSQL]);

  // 创建包装后的执行函数，自动记录到全局历史
  const createWrappedExecute = React.useCallback(
    (type: 'join' | 'set' | 'pivot') =>
      async (sql: string, source?: TableSource, options?: { baseSql?: string }) => {
        if (!onExecute) return;
        const startTime = Date.now();
        const joinSnapshot =
          type === 'join' ? joinPersistenceRef.current?.getSnapshot() : undefined;
        try {
          await onExecute(sql, source, options);
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

  // 仅记录历史、不重跑：服务端/联邦 JOIN 走 onDisplayPreview 展示已取结果，
  // 绕过了 createWrappedExecute 的历史包装，需在执行成功后单独补记。
  const recordJoinHistory = React.useCallback(
    (sql: string, executionTime: number) => {
      const joinSnapshot = joinPersistenceRef.current?.getSnapshot();
      addToHistory({
        type: 'join',
        sql,
        executionTime,
        ...(joinSnapshot ? { joinSnapshot } : {}),
      });
    },
    [addToHistory]
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
              previewSQL={loadedSqlPreview}
              previewNonce={previewSeq}
              onOpenAiSettings={onOpenAiSettings}
            />
          </KeepAliveTabContent>

          <KeepAliveTabContent value="join" activeTab={activeTab} className="h-full m-0 p-0 overflow-auto">
            <JoinQueryPanel
              selectedTables={selectedTables}
              onExecute={handleJoinExecute}
              onDisplayPreview={onDisplayPreview}
              onRecordHistory={recordJoinHistory}
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
              onRemoveTable={onRemoveTable}
            />
          </KeepAliveTabContent>

          <KeepAliveTabContent value="pivot" activeTab={activeTab} className="h-full m-0 p-0 overflow-auto">
            <PivotPanel
              selectedTables={selectedTables}
              onExecute={handlePivotExecute}
            />
          </KeepAliveTabContent>

        </div>
      </Tabs>
    </>
  );
});
QueryTabs.displayName = 'QueryTabs';

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
