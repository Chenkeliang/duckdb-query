import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Code, GitMerge, Layers, Table2, Plus, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { SQLPreview } from "../components/SQLPreview";
import { SQLQueryPanel } from "../SQLQuery";
import { JoinQueryPanel } from "../JoinQuery";
import { SetOperationsPanel } from "../SetOperations";
import { PivotPanel } from "../PivotTable/PivotPanel";
import { useGlobalHistory } from "../hooks/useGlobalHistory";
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
import { SQLChangePreviewDialog } from "../SQLQuery/ai/SQLChangePreviewDialog";
import { AiChatDrawer } from "../SQLQuery/ai/AiChatDrawer";
import { agentChatBus, useAgentChatBus, type WorkbenchTabId } from "../SQLQuery/ai/agentChatBus";
import { useAiStatus } from "@/hooks/useAiStatus";
import { useFederatedQueryDetection } from "@/hooks/useFederatedQueryDetection";
import { getTableName } from "@/utils/tableUtils";
import { registerWorkbenchCommand, queueWorkbenchCommand } from "../workbenchCommands";

/**
 * 查询标签组件（graphite redesign）
 *
 * - 标签即编辑器：可同时开多个 SQL 标签；JOIN / 集合 / 透视是「构建器」标签，
 *   各一个实例，可关闭、可从「+」重新打开（默认全部打开，功能入口不减少）。
 * - 标签内容 KeepAlive：首次激活才挂载，切走只隐藏，保留编辑器与构建器状态。
 * - 历史 / 收藏 / 运行记录移到左侧资源面板，经 QueryTabsHandle.loadSql 回填。
 */

export type QueryTabKind = WorkbenchTabId;

interface WorkbenchTab {
  id: string;
  kind: QueryTabKind;
  /** SQL 标签序号（标题 SQL 1、SQL 2…） */
  seq?: number;
}

const KIND_META: Record<QueryTabKind, { labelKey: string; icon: React.ComponentType<{ className?: string }> }> = {
  sql: { labelKey: "query.tabs.sql", icon: Code },
  join: { labelKey: "query.tabs.join", icon: GitMerge },
  set: { labelKey: "query.tabs.set", icon: Layers },
  pivot: { labelKey: "query.tabs.pivot", icon: Table2 },
};

const DEFAULT_TABS: WorkbenchTab[] = [
  { id: "sql-1", kind: "sql", seq: 1 },
  { id: "join", kind: "join" },
  { id: "set", kind: "set" },
  { id: "pivot", kind: "pivot" },
];

interface QueryTabsProps {
  taskActions?: React.ReactNode;
  isWorkspaceActive?: boolean;
  onRestoreSqlTables?: (tables: SelectedTable[]) => void;
  /** 当前激活标签的类型（驱动左侧选表模式），与 useQueryWorkspace.currentTab 同步 */
  activeTab: string;
  onTabChange: (tab: string) => void;
  selectedTablesByTab: Record<string, SelectedTable[]>;
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
  previewNonce?: number;
  joinRestoreRequest?: JoinRestoreRequest | null;
  restoreJoinWorkspace?: (snapshot: JoinRestoreRequest['snapshot']) => void;
  onClearJoinRestoreRequest?: () => void;
  onOpenAiSettings?: () => void;
}

/** 供外部(资源面板的历史/收藏、图表下钻、命令面板)把 SQL 回填进编辑器。 */
export interface QueryTabsHandle {
  loadSql: (
    sql: string,
    type?: string,
    options?: { joinSnapshot?: GlobalHistoryItem['joinSnapshot'] }
  ) => void;
}

export const QueryTabs = React.forwardRef<QueryTabsHandle, QueryTabsProps>(({
  taskActions,
  isWorkspaceActive = true,
  onRestoreSqlTables,
  activeTab,
  onTabChange,
  selectedTablesByTab,
  onExecute,
  onDisplayPreview,
  onRemoveTable,
  onCancel,
  isCancelling,
  previewSQL: externalPreviewSQL,
  previewNonce: externalPreviewNonce,
  joinRestoreRequest,
  restoreJoinWorkspace,
  onClearJoinRestoreRequest,
  onOpenAiSettings,
}, ref) => {
  const joinPersistenceRef = React.useRef<JoinWorkspacePersistence | null>(null);
  const { t, i18n } = useTranslation('common');

  // ===== 标签模型 =====
  const [tabs, setTabs] = React.useState<WorkbenchTab[]>(DEFAULT_TABS);
  const [activeTabId, setActiveTabId] = React.useState<string>(() =>
    DEFAULT_TABS.find((tab) => tab.kind === activeTab)?.id ?? DEFAULT_TABS[0].id
  );
  const [visited, setVisited] = React.useState<Set<string>>(() => new Set([activeTabId]));
  /** 最近一次激活的 SQL 标签：历史/下钻回填的目标 */
  const lastSqlTabIdRef = React.useRef<string>("sql-1");
  const sqlSeqRef = React.useRef(1);
  const sqlDraftsRef = React.useRef<Record<string, string>>({});
  const activeTabObj = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const [sqlTablesById, setSqlTablesById] = React.useState<Record<string, SelectedTable[]>>(() => ({ 'sql-1': selectedTablesByTab.sql || [] }));
  const incomingSqlTables = selectedTablesByTab.sql;
  React.useEffect(() => {
    if (activeTabObj?.kind === 'sql') {
      setSqlTablesById((previous) => ({ ...previous, [activeTabId]: incomingSqlTables || [] }));
    }
  }, [incomingSqlTables]);
  const selectedTables = activeTabObj?.kind === 'sql'
    ? sqlTablesById[activeTabId] || [] : selectedTablesByTab[activeTab] || [];


  const activate = React.useCallback(
    (id: string, list: WorkbenchTab[] = tabs) => {
      const target = list.find((tab) => tab.id === id);
      if (!target) return;
      setActiveTabId(id);
      setVisited((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
      if (target.kind === 'sql') {
        lastSqlTabIdRef.current = id;
        onRestoreSqlTables?.(sqlTablesById[id] || []);
      }
      if (target.kind !== activeTab) onTabChange(target.kind);
    },
    [tabs, activeTab, onTabChange, onRestoreSqlTables, sqlTablesById]
  );

  /** 打开（或聚焦）某类标签；SQL 每次新建。返回目标标签 id。 */
  const openTab = React.useCallback(
    (kind: QueryTabKind): string => {
      if (kind !== 'sql') {
        const existing = tabs.find((tab) => tab.kind === kind);
        if (existing) {
          activate(existing.id);
          return existing.id;
        }
        const next = [...tabs, { id: kind, kind }];
        setTabs(next);
        activate(kind, next);
        return kind;
      }
      sqlSeqRef.current += 1;
      const id = `sql-${sqlSeqRef.current}`;
      const next = [...tabs, { id, kind: 'sql' as const, seq: sqlSeqRef.current }];
      setTabs(next);
      activate(id, next);
      return id;
    },
    [tabs, activate]
  );

  const closeTab = React.useCallback(
    (id: string) => {
      const index = tabs.findIndex((tab) => tab.id === id);
      if (index < 0) return;
      let next = tabs.filter((tab) => tab.id !== id);
      if (next.length === 0) {
        sqlSeqRef.current += 1;
        next = [{ id: `sql-${sqlSeqRef.current}`, kind: 'sql', seq: sqlSeqRef.current }];
      }
      setTabs(next);
      delete sqlDraftsRef.current[id];
      setVisited((prev) => {
        const copy = new Set(prev);
        copy.delete(id);
        return copy;
      });
      if (lastSqlTabIdRef.current === id) {
        lastSqlTabIdRef.current = next.find((tab) => tab.kind === 'sql')?.id ?? '';
      }
      if (id === activeTabId) activate(next[Math.max(0, index - 1)].id, next);
    },
    [tabs, activeTabId, activate]
  );

  // 外部改变模式（JOIN 恢复、AI 插入要求回到 SQL、单测受控）→ 激活该类标签
  React.useEffect(() => {
    if (activeTabObj?.kind === activeTab) return;
    const kind = activeTab as QueryTabKind;
    if (!KIND_META[kind]) return;
    const preferred =
      kind === 'sql'
        ? tabs.find((tab) => tab.id === lastSqlTabIdRef.current) ?? tabs.find((tab) => tab.kind === 'sql')
        : tabs.find((tab) => tab.kind === kind);
    if (preferred) {
      activate(preferred.id);
    } else {
      openTab(kind);
    }
    // eslint 规则未开启 exhaustive-deps；仅响应外部模式变化
  }, [activeTab]);

  // ===== 全局数据智能体对话:单例挂载,四个查询 Tab 共用同一份对话上下文 =====
  const chatStatus = useAiStatus('data_qa');
  const chatBus = useAgentChatBus();
  const aiLocale: 'zh' | 'en' = i18n.language?.startsWith('zh') ? 'zh' : 'en';
  const activeSql = chatBus.sqlByTab[activeTab as WorkbenchTabId];
  const { attachDatabases: chatAttachDatabases } = useFederatedQueryDetection({
    sql: activeSql ?? '',
    selectedTables,
    debounceMs: 300,
    enabled: chatStatus.configured,
  });
  const [agentPreview, setAgentPreview] = React.useState<{ targetId: string | null; beforeSql: string; afterSql: string; stale: boolean } | null>(null);
  const [pendingAgentSql, setPendingAgentSql] = React.useState<{ targetId: string; sql: string } | null>(null);
  const handleAgentInsertSql = React.useCallback((sql: string) => {
    const target = activeTabObj?.kind === 'sql' ? activeTabObj
      : tabs.find((tab) => tab.id === lastSqlTabIdRef.current && tab.kind === 'sql') ?? tabs.find((tab) => tab.kind === 'sql');
    setAgentPreview({ targetId: target?.id ?? null, beforeSql: target ? sqlDraftsRef.current[target.id] ?? '' : '', afterSql: sql, stale: false });
  }, [activeTabObj, tabs]);
  const applyAgentPreview = () => {
    if (!agentPreview) return;
    if (agentPreview.targetId && !tabs.some((tab) => tab.id === agentPreview.targetId)) return;
    const currentSql = agentPreview.targetId ? sqlDraftsRef.current[agentPreview.targetId] ?? '' : '';
    if (currentSql !== agentPreview.beforeSql) {
      setAgentPreview({ ...agentPreview, beforeSql: currentSql, stale: true });
      return;
    }
    const targetId = agentPreview.targetId ?? openTab('sql');
    if (agentPreview.targetId) activate(targetId);
    setPendingAgentSql({ targetId, sql: agentPreview.afterSql });
    setAgentPreview(null);
  };
  React.useEffect(() => {
    if (!pendingAgentSql || activeTabObj?.id !== pendingAgentSql.targetId || !isWorkspaceActive) return;
    // Keep the existing inserter, including system LIMIT provenance, after the target registers.
    const timer = window.setTimeout(() => {
      agentChatBus.insertSql(pendingAgentSql.sql);
      setPendingAgentSql(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pendingAgentSql, activeTabObj?.id, isWorkspaceActive]);

  // Hooks
  const { addToHistory } = useGlobalHistory();
  const { connections } = useDatabaseConnections();

  // SQL 预览状态：只回填给目标 SQL 标签
  const [loadedSqlPreview, setLoadedSqlPreview] = React.useState<string | undefined>(undefined);
  const [previewTargetId, setPreviewTargetId] = React.useState<string>("sql-1");
  // 同一串 SQL 重复加载（如重复下钻同一桶）时,字符串 prop 不变不会触发回填,用序号强制触发
  const [previewSeq, setPreviewSeq] = React.useState(0);
  const [previewDialogOpen, setPreviewDialogOpen] = React.useState(false);
  const [previewDialogSql, setPreviewDialogSql] = React.useState<string | null>(null);
  const [previewSource, setPreviewSource] = React.useState<TableSource | undefined>(undefined);
  const [isPreviewExecuting, setIsPreviewExecuting] = React.useState(false);

  /** 回填目标：当前 SQL 标签 > 最近的 SQL 标签 > 新建 */
  const resolveSqlTarget = React.useCallback((): string => {
    if (activeTabObj?.kind === 'sql') return activeTabObj.id;
    const last = tabs.find((tab) => tab.id === lastSqlTabIdRef.current && tab.kind === 'sql');
    if (last) {
      activate(last.id);
      return last.id;
    }
    return openTab('sql');
  }, [activeTabObj, tabs, activate, openTab]);

  const handleLoadSQL = (
    sql: string,
    type: string = 'sql',
    options?: { joinSnapshot?: GlobalHistoryItem['joinSnapshot'] }
  ) => {
    if (type === 'join' && options?.joinSnapshot && restoreJoinWorkspace) {
      restoreJoinWorkspace(options.joinSnapshot);
      return;
    }

    const { sql: sqlBody, snapshot } = extractJoinWorkspaceFromSql(sql);

    if (type === 'join' && snapshot && restoreJoinWorkspace) {
      restoreJoinWorkspace(snapshot);
      return;
    }

    setPreviewTargetId(resolveSqlTarget());
    setLoadedSqlPreview(sqlBody);
    setPreviewSeq((s) => s + 1);
    setPreviewDialogSql(sqlBody);
    setPreviewSource(undefined);
    setPreviewDialogOpen(true);
  };

  // 外部(资源面板、图表下钻)回填 SQL 的入口
  React.useImperativeHandle(ref, () => ({
    loadSql: (sql, type, options) => handleLoadSQL(sql, type, options),
  }));

  // 命令面板：新建标签 / 载入 SQL；非 SQL 标签激活时，SQL 专属命令给出提示而不是排队到别的标签
  const handleLoadRef = React.useRef(handleLoadSQL);
  handleLoadRef.current = handleLoadSQL;
  React.useEffect(() => {
    const offs = [
      registerWorkbenchCommand('newTab', (kind = 'sql') => void openTab(kind)),
      registerWorkbenchCommand('loadSql', (sql: string) => handleLoadRef.current(sql)),
    ];
    if (activeTabObj?.kind !== 'sql') {
      const sqlOnly = () => toast.info(t('command.sqlOnly', '该操作用于 SQL 标签'));
      offs.push(
        registerWorkbenchCommand('run', sqlOnly),
        registerWorkbenchCommand('runAsync', sqlOnly),
        registerWorkbenchCommand('format', sqlOnly),
        registerWorkbenchCommand('insertText', (text: string) => {
          resolveSqlTarget();
          // 目标 SQL 标签激活后会注册 insertText，排队补发
          window.setTimeout(() => queueWorkbenchCommand('insertText', text), 0);
        }),
      );
    }
    return () => offs.forEach((off) => off());
  }, [openTab, activeTabObj?.kind, resolveSqlTarget, t]);

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

  // 外部预填(数据源页"去查询"、异步任务预览)与内部加载合并为同一通道,后写者生效。
  // 不能用 externalPreviewSQL ?? loadedSqlPreview:App 层 previewQuery 初始是 ''(非 nullish),
  // 且一旦设置过就不清空,会永久遮住内部通道的回填。
  React.useEffect(() => {
    if (externalPreviewSQL) {
      setPreviewTargetId(resolveSqlTarget());
      setLoadedSqlPreview(externalPreviewSQL);
      setPreviewSeq((s) => s + 1);
    }
  }, [externalPreviewSQL, externalPreviewNonce]);

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

  const tabLabel = (tab: WorkbenchTab) =>
    tab.kind === 'sql' ? `SQL ${tab.seq ?? ''}`.trim() : t(KIND_META[tab.kind].labelKey);

  const renderPanel = (tab: WorkbenchTab) => {
    const isActive = tab.id === activeTabObj?.id;
    switch (tab.kind) {
      case 'sql':
        return (
          <SQLQueryPanel
            isActive={isActive && isWorkspaceActive}
            editorFill
            onSqlChange={(sql) => { sqlDraftsRef.current[tab.id] = sql; }}
            selectedTables={sqlTablesById[tab.id] || []}
            onExecute={onExecute}
            onCancel={onCancel}
            isCancelling={isCancelling}
            previewSQL={tab.id === previewTargetId ? loadedSqlPreview : undefined}
            previewNonce={tab.id === previewTargetId ? previewSeq : undefined}
            onOpenAiSettings={onOpenAiSettings}
          />
        );
      case 'join':
        return (
          <JoinQueryPanel
            selectedTables={selectedTablesByTab.join || []}
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
        );
      case 'set':
        return (
          <SetOperationsPanel
            selectedTables={selectedTablesByTab.set || []}
            onExecute={handleSetExecute}
            onRemoveTable={onRemoveTable}
          />
        );
      case 'pivot':
        return (
          <PivotPanel
            selectedTables={selectedTablesByTab.pivot || []}
            onExecute={handlePivotExecute}
          />
        );
    }
  };

  return (
    <>
      {agentPreview && <SQLChangePreviewDialog
        beforeSql={agentPreview.beforeSql}
        afterSql={agentPreview.afterSql}
        targetLabel={agentPreview.targetId ? `SQL ${tabs.find((tab) => tab.id === agentPreview.targetId)?.seq ?? ''}` : t('command.newSqlTab', '新建 SQL 标签')}
        stale={agentPreview.stale}
        targetClosed={!!agentPreview.targetId && !tabs.some((tab) => tab.id === agentPreview.targetId)}
        onCancel={() => setAgentPreview(null)}
        onApply={applyAgentPreview}
      />}
      <SQLPreview
        sql={previewDialogSql}
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        onExecute={handlePreviewDialogExecute}
        isExecuting={isPreviewExecuting}
      />

      <div className="flex h-full flex-col bg-background">
        <div className="flex h-10 shrink-0 items-stretch border-b border-border bg-surface">
        <div
          role="tablist"
          aria-label={t('query.tabs.label', '查询标签')}
          className="flex h-full min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden pl-1"
        >
          {tabs.map((tab) => {
            const Icon = KIND_META[tab.kind].icon;
            const active = tab.id === activeTabObj?.id;
            return (
              <div
                key={tab.id}
                className={cn(
                  'group relative flex max-w-56 shrink-0 items-center border-r border-border text-sm',
                  active ? 'bg-background text-foreground' : 'text-muted-foreground hover:bg-surface-hover hover:text-foreground'
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  tabIndex={active ? 0 : -1}
                  onKeyDown={(event) => {
                    const index = tabs.findIndex((item) => item.id === tab.id);
                    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length
                      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
                      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
                    if (nextIndex < 0) return;
                    event.preventDefault();
                    activate(tabs[nextIndex].id);
                    document.getElementById(`query-tab-${tabs[nextIndex].id}`)?.focus();
                  }}
                  aria-controls={`query-tabpanel-${tab.id}`}
                  id={`query-tab-${tab.id}`}
                  onClick={() => activate(tab.id)}
                  onAuxClick={(e) => {
                    if (e.button === 1) closeTab(tab.id);
                  }}
                  className="flex h-full min-w-0 items-center gap-2 pl-3 pr-1 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{tabLabel(tab)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => closeTab(tab.id)}
                  aria-label={`${t('query.result.closeTab', '关闭')} ${tabLabel(tab)}`}
                  className={cn(
                    'mr-1.5 grid h-5 w-5 place-items-center rounded text-muted-foreground hover:bg-surface-active hover:text-foreground focus-visible:opacity-100',
                    active ? 'opacity-100' : 'opacity-100 sm:opacity-0 group-hover:opacity-100'
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
                {active && (
                  <>
                    <span aria-hidden className="absolute inset-x-0 -bottom-px h-px bg-background" />
                    <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
                  </>
                )}
              </div>
            );
          })}
        </div>
          <div className="flex shrink-0 items-center gap-1 px-2" data-aligned-row>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('query.tabs.new', '新建标签')}
                title={t('query.tabs.new', '新建标签')}
                className="grid h-7 w-7 shrink-0 place-items-center text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <Plus className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {(Object.keys(KIND_META) as QueryTabKind[]).map((kind) => {
                const Icon = KIND_META[kind].icon;
                return (
                  <DropdownMenuItem key={kind} onSelect={() => openTab(kind)} className="gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {kind === 'sql' ? t('command.newSqlTab', '新建 SQL 标签') : t(KIND_META[kind].labelKey)}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          {taskActions && <><span className="mx-1 h-4 w-px bg-border" />{taskActions}</>}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {tabs.map((tab) =>
            visited.has(tab.id) || tab.id === activeTabObj?.id ? (
              <div
                key={tab.id}
                id={`query-tabpanel-${tab.id}`}
                role="tabpanel"
                aria-labelledby={`query-tab-${tab.id}`}
                data-state={tab.id === activeTabObj?.id ? 'active' : 'inactive'}
                className={cn('h-full overflow-auto', tab.id !== activeTabObj?.id && 'hidden')}
              >
                {renderPanel(tab)}
              </div>
            ) : null
          )}
        </div>
      </div>

      {/* 全局数据智能体:单例挂载,对话与滚动位置跨标签保留;经停靠位渲染到工作台右侧 */}
      {chatStatus.configured && (
        <AiChatDrawer
          open={chatBus.open}
          onClose={() => agentChatBus.setOpen(false)}
          selectedTables={(selectedTables || []).map((tbl) => getTableName(tbl))}
          attachDatabases={chatAttachDatabases}
          onInsertSQL={handleAgentInsertSql}
          currentSql={activeSql}
          locale={aiLocale}
        />
      )}
    </>
  );
});
QueryTabs.displayName = 'QueryTabs';
