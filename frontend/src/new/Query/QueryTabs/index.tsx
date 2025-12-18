import * as React from "react";
import { useTranslation } from "react-i18next";
import { Code, GitMerge, Layers, Table2, LayoutGrid } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/new/components/ui/tabs";
import { QueryBuilder, SQLPreview } from "../VisualQuery";
import { SQLQueryPanel } from "../SQLQuery";
import { JoinQueryPanel } from "../JoinQuery";
import { SetOperationsPanel } from "../SetOperations";
import { PivotTablePanel } from "../PivotTable";
import type { QueryConfig } from "../VisualQuery";
import type { SelectedTable } from "@/new/types/SelectedTable";
import { getTableName, normalizeSelectedTable } from "@/new/utils/tableUtils";
import type { TableSource } from "@/new/hooks/useQueryWorkspace";
import type { SqlDialect } from "@/new/utils/sqlUtils";
import { getDialectFromSource, getSourceFromSelectedTable, quoteIdent, quoteQualifiedTable } from "@/new/utils/sqlUtils";

/**
 * 查询模式 Tab 组件
 * 
 * 职责：
 * - 显示 5 个查询模式 Tab
 * - 处理 Tab 切换
 * - 渲染对应的查询构建器
 * 
 * 样式：
 * - 与数据源管理页面的标签页保持一致
 * - 使用 shadcn/ui Tabs 默认样式（圆角、阴影）
 * - 每个标签包含图标和文字
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
  { id: 'visual', labelKey: 'query.tabs.visual', icon: LayoutGrid },
];

interface QueryTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  selectedTables: SelectedTable[];
  onExecute: (sql: string, source?: TableSource) => Promise<void>;
  onRemoveTable?: (table: SelectedTable) => void;
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
  previewSQL: externalPreviewSQL,
}) => {
  const { t } = useTranslation('common');
  
  // SQL 预览状态
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewSQL, setPreviewSQL] = React.useState<string | null>(null);
  const [previewSource, setPreviewSource] = React.useState<TableSource | undefined>(undefined);
  const [isExecuting, setIsExecuting] = React.useState(false);

  // 处理可视化查询执行
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

  // 处理 SQL 预览
  const handlePreview = React.useCallback((config: QueryConfig) => {
    const source = config.table ? getSourceFromSelectedTable(config.table) : undefined;
    const dialect = getDialectFromSource(source);
    const sql = buildSQLFromConfig(config, dialect);
    setPreviewSQL(sql);
    setPreviewSource(source);
    setPreviewOpen(true);
  }, []);

  // 从预览执行 SQL
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
    <Tabs value={activeTab} onValueChange={onTabChange} className="h-full flex flex-col bg-card">
      {/* 标签页导航 - 与数据源管理页面样式一致 */}
      <div className="h-12 border-b border-border flex items-center px-4 bg-muted/30 shrink-0">
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
      </div>

      <div className="flex-1 overflow-auto">
        <TabsContent value="sql" className="h-full m-0 p-0">
          <SQLQueryPanel
            selectedTables={selectedTables}
            onExecute={onExecute}
            editorMinHeight="150px"
            editorMaxHeight="300px"
            previewSQL={externalPreviewSQL}
          />
        </TabsContent>

        <TabsContent value="join" className="h-full m-0 p-0">
          <JoinQueryPanel
            selectedTables={selectedTables}
            onExecute={onExecute}
            onRemoveTable={onRemoveTable}
          />
        </TabsContent>

        <TabsContent value="set" className="h-full m-0 p-0">
          <SetOperationsPanel
            selectedTables={selectedTables}
            onExecute={onExecute}
            onRemoveTable={onRemoveTable}
          />
        </TabsContent>

        <TabsContent value="pivot" className="h-full m-0 p-0">
          <PivotTablePanel 
            selectedTables={selectedTables}
            onExecute={onExecute} 
          />
        </TabsContent>

        <TabsContent value="visual" className="h-full m-0 p-0">
          <QueryBuilder
            selectedTable={selectedTables.length > 0 ? selectedTables[0] : null}
            onExecute={handleVisualQueryExecute}
            onPreview={handlePreview}
            isExecuting={isExecuting}
          />
        </TabsContent>
      </div>
    </Tabs>
    </>
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
