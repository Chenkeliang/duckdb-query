import * as React from "react";
import { useTranslation } from "react-i18next";
import { Code, GitMerge, Layers, Table2, LayoutGrid, Clock, Star } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/new/components/ui/tabs";
import { Button } from "@/new/components/ui/button";
import { Badge } from "@/new/components/ui/badge";
import { QueryBuilder, SQLPreview } from "../VisualQuery";
import { SQLQueryPanel } from "../SQLQuery";
import { JoinQueryPanel } from "../JoinQuery";
import { SetOperationsPanel } from "../SetOperations";
import { PivotTablePanel } from "../PivotTable";
import { GlobalHistoryPanel } from "../History/GlobalHistoryPanel";
import { SavedQueriesPanel } from "../Bookmarks/SavedQueriesPanel";
import { useGlobalHistory } from "../hooks/useGlobalHistory";
import { useSavedQueries } from "../hooks/useSavedQueries";
import type { QueryConfig } from "../VisualQuery";
import type { SelectedTable } from "@/new/types/SelectedTable";
import { getTableName, normalizeSelectedTable } from "@/new/utils/tableUtils";
import type { TableSource } from "@/new/hooks/useQueryWorkspace";
import type { SqlDialect } from "@/new/utils/sqlUtils";
import {
  getDialectFromSource,
  getSourceFromSelectedTable,
  quoteIdent,
  quoteQualifiedTable,
  generateDatabaseAlias
} from "@/new/utils/sqlUtils";
import { useDatabaseConnections } from "@/new/hooks/useDatabaseConnections";

/**
 * 查询模式 Tab 组件
 * 
 * 职责：
 * - 显示 5 个查询模式 Tab
 * - 处理 Tab 切换
 * - 渲染对应的查询构建器
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
  // { id: 'visual', labelKey: 'query.tabs.visual', icon: LayoutGrid }, // 暂时隐藏
];

interface QueryTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  selectedTables: SelectedTable[];
  onExecute: (sql: string, source?: TableSource) => Promise<void>;
  onRemoveTable?: (table: SelectedTable) => void;
  /** 取消回调 */
  onCancel?: () => void;
  /** 是否正在取消 */
  isCancelling?: boolean;
  /** 预览 SQL（来自异步任务等） */
  previewSQL?: string;
}

// 注意：不再使用 wrapExecute，直接传递 onExecute 以保留 source 参数
// 子组件需要支持 (sql: string, source?: TableSource) 签名

export const QueryTabs: React.FC<QueryTabsProps> = ({
  activeTab,
  onTabChange,
  selectedTables,
  onExecute,
  onRemoveTable,
  onCancel,
  isCancelling,
  previewSQL: externalPreviewSQL,
}) => {
  const { t } = useTranslation('common');

  // 全局功能状态
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [bookmarksOpen, setBookmarksOpen] = React.useState(false);

  // Hooks
  const { history, addToHistory, deleteHistoryItem, clearHistory } = useGlobalHistory();
  const { favorites } = useSavedQueries();
  const { connections } = useDatabaseConnections();

  // SQL 预览状态
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewSQL, setPreviewSQL] = React.useState<string | null>(null);
  const [previewSource, setPreviewSource] = React.useState<TableSource | undefined>(undefined);
  const [isExecuting, setIsExecuting] = React.useState(false);

  // ... (createWrappedExecute and handleJoinExecute definitions skipped for brevity, they are unchanged)

  const handleLoadSQL = async (sql: string, type: string = 'sql') => {
    onTabChange('sql');
    setPreviewSQL(sql);

    // 1. 尝试解析 SQL 中的联邦查询注释 (优先级最高, 因为它明确指出了意图)
    // 格式: -- 联邦查询: db1, db2
    let attachDatabases: { alias: string; connectionId: string }[] = [];
    const federatedMatch = sql.match(/-- 联邦查询: (.+)/);

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
      // 动态导入或使用已导入的 parser
      // 需要先确保 parseSQLTableReferences 和 buildAttachDatabasesFromParsedRefs 已导入
      try {
        const { parseSQLTableReferences, buildAttachDatabasesFromParsedRefs } = await import("@/new/utils/sqlUtils");
        const parsedRefs = parseSQLTableReferences(sql);
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

    setPreviewOpen(true);
  };

  // 创建包装后的执行函数，自动记录到全局历史
  const createWrappedExecute = React.useCallback(
    (type: 'join' | 'set' | 'pivot') =>
      async (sql: string, source?: TableSource) => {
        if (!onExecute) return;
        const startTime = Date.now();
        try {
          await onExecute(sql, source);
          addToHistory({
            type,
            sql,
            executionTime: Date.now() - startTime,
          });
        } catch (err) {
          addToHistory({
            type,
            sql,
            error: (err as Error)?.message || String(err),
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



  // ... (handleVisualQueryExecute, handlePreview, handleExecuteFromPreview 保持不变) ...
  const handleVisualQueryExecute = React.useCallback(
    async (config: QueryConfig) => {
      const source = config.table ? getSourceFromSelectedTable(config.table) : undefined;
      const dialect = getDialectFromSource(source);

      const sql = buildSQLFromConfig(config, dialect);
      if (sql) {
        setIsExecuting(true);
        try {
          await onExecute(sql, source);
        } finally {
          setIsExecuting(false);
        }
      }
    },
    [onExecute]
  );

  const handlePreview = React.useCallback((config: QueryConfig) => {
    const source = config.table ? getSourceFromSelectedTable(config.table) : undefined;
    const dialect = getDialectFromSource(source);
    const sql = buildSQLFromConfig(config, dialect);
    setPreviewSQL(sql);
    setPreviewSource(source);
    setPreviewOpen(true);
  }, []);

  const handleExecuteFromPreview = React.useCallback(
    async (sql: string) => {
      setIsExecuting(true);
      try {
        await onExecute(sql, previewSource);
        setPreviewOpen(false);
      } finally {
        setIsExecuting(false);
      }
    },
    [onExecute, previewSource]
  );


  return (
    <>
      <SQLPreview
        sql={previewSQL}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onExecute={handleExecuteFromPreview}
        isExecuting={isExecuting}
      />

      <GlobalHistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        history={history}
        onDelete={deleteHistoryItem}
        onClear={clearHistory}
        onLoad={(item) => handleLoadSQL(item.sql)}
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

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => setBookmarksOpen(true)}
            >
              <Star className="w-4 h-4" />
              <span className="hidden sm:inline">{t('query.bookmark.title', '收藏夹')}</span>
              {favorites?.length > 0 && (
                <Badge variant="outline" className="h-5 px-1.5 min-w-5 justify-center">
                  {favorites.length}
                </Badge>
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => setHistoryOpen(true)}
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">{t('query.history.title', '历史记录')}</span>
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
              previewSQL={externalPreviewSQL}
            />
          </KeepAliveTabContent>

          <KeepAliveTabContent value="join" activeTab={activeTab} className="h-full m-0 p-0 overflow-auto">
            <JoinQueryPanel
              selectedTables={selectedTables}
              onExecute={handleJoinExecute}
              onRemoveTable={onRemoveTable}
              onCancel={onCancel}
              isCancelling={isCancelling}
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
            <PivotTablePanel
              selectedTables={selectedTables}
              onExecute={handlePivotExecute}
            />
          </KeepAliveTabContent>

          <KeepAliveTabContent value="visual" activeTab={activeTab} className="h-full m-0 p-0 overflow-auto">
            <QueryBuilder
              selectedTable={selectedTables.length > 0 ? selectedTables[0] : null}
              onExecute={handleVisualQueryExecute}
              onPreview={handlePreview}
              isExecuting={isExecuting}
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

/**
 * 转义 SQL 字符串值，防止 SQL 注入
 */
function escapeSQLString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * 转义 SQL 标识符（表名、列名）
 */
// 从 QueryConfig 生成 SQL（简化版本，完整版在 useQueryBuilder 中）
function buildSQLFromConfig(config: QueryConfig, dialect: SqlDialect): string | null {
  if (!config.table) return null;

  const parts: string[] = [];
  const normalizedTable = normalizeSelectedTable(config.table);
  const tableName = getTableName(config.table);
  const fromTableName = quoteQualifiedTable({ name: tableName, schema: normalizedTable.schema }, dialect);
  const baseTableRef = quoteIdent(tableName, dialect);

  // SELECT
  const selectParts: string[] = [];
  if (config.columns.length > 0) {
    // 如果有 JOIN，需要为列添加表前缀以避免歧义
    if (config.joins && config.joins.length > 0) {
      selectParts.push(...config.columns.map((col) => `${baseTableRef}.${quoteIdent(col, dialect)}`));
    } else {
      selectParts.push(...config.columns.map((col) => quoteIdent(col, dialect)));
    }
  }
  config.aggregations?.forEach((agg) => {
    const colName = quoteIdent(agg.column, dialect);
    // 如果有 JOIN，聚合列也需要表前缀
    const qualifiedCol = config.joins && config.joins.length > 0
      ? `${baseTableRef}.${colName}`
      : colName;
    let aggExpr =
      agg.function === "COUNT_DISTINCT"
        ? `COUNT(DISTINCT ${qualifiedCol})`
        : `${agg.function}(${qualifiedCol})`;
    if (agg.alias) aggExpr += ` AS ${quoteIdent(agg.alias, dialect)}`;
    selectParts.push(aggExpr);
  });
  if (selectParts.length === 0) selectParts.push("*");
  parts.push(`SELECT ${selectParts.join(", ")}`);

  // FROM
  parts.push(`FROM ${fromTableName}`);

  // JOIN
  config.joins?.forEach((join) => {
    if (join.targetTable && join.sourceColumn && join.targetColumn) {
      const targetTableQuoted = quoteIdent(join.targetTable, dialect);
      const sourceCol = quoteIdent(join.sourceColumn, dialect);
      const targetCol = quoteIdent(join.targetColumn, dialect);
      parts.push(
        `${join.joinType || "LEFT"} JOIN ${targetTableQuoted} ON ${baseTableRef}.${sourceCol} = ${targetTableQuoted}.${targetCol}`
      );
    }
  });

  // WHERE
  if (config.filters && config.filters.length > 0) {
    const whereParts: string[] = [];
    config.filters.forEach((filter, index) => {
      let condition = index > 0 ? ` ${filter.logicOperator} ` : "";
      const col = quoteIdent(filter.column, dialect);
      // 如果有 JOIN，WHERE 条件中的列也需要表前缀
      const qualifiedCol = config.joins && config.joins.length > 0
        ? `${baseTableRef}.${col}`
        : col;
      switch (filter.operator) {
        case "IS NULL":
          condition += `${qualifiedCol} IS NULL`;
          break;
        case "IS NOT NULL":
          condition += `${qualifiedCol} IS NOT NULL`;
          break;
        case "BETWEEN":
          condition += `${qualifiedCol} BETWEEN '${escapeSQLString(String(filter.value))}' AND '${escapeSQLString(String(filter.value2 ?? ''))}'`;
          break;
        case "IN": {
          const values = String(filter.value).split(',').map((v) => `'${escapeSQLString(v.trim())}'`);
          condition += `${qualifiedCol} IN (${values.join(', ')})`;
          break;
        }
        default:
          condition += `${qualifiedCol} ${filter.operator} '${escapeSQLString(String(filter.value))}'`;
      }
      whereParts.push(condition);
    });
    parts.push(`WHERE ${whereParts.join("")}`);
  }

  // GROUP BY
  if (config.groupBy && config.groupBy.length > 0) {
    // 如果有 JOIN，GROUP BY 中的列也需要表前缀
    const groupByParts = config.groupBy.map((col) => {
      const quotedCol = quoteIdent(col, dialect);
      return config.joins && config.joins.length > 0
        ? `${baseTableRef}.${quotedCol}`
        : quotedCol;
    });
    parts.push(`GROUP BY ${groupByParts.join(", ")}`);
  }

  // ORDER BY
  if (config.orderBy && config.orderBy.length > 0) {
    const orderByParts = config.orderBy.map((s) => {
      const quotedCol = quoteIdent(s.column, dialect);
      const qualifiedCol = config.joins && config.joins.length > 0
        ? `${baseTableRef}.${quotedCol}`
        : quotedCol;
      return `${qualifiedCol} ${s.direction}`;
    });
    parts.push(`ORDER BY ${orderByParts.join(", ")}`);
  }

  // LIMIT
  if (config.limit) {
    parts.push(`LIMIT ${config.limit}`);
  }

  return parts.join("\n");
}
