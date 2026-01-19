/**
 * PivotPanel - 透视表配置面板（嵌入 QueryTabs）
 * 
 * 功能：
 * - 使用统一的表格设计器进行拖拽配置
 * - 生成 DuckDB PIVOT SQL 并显示预览
 * - 通过 onExecute 执行（结果在 ResultPanel 显示）
 */

import * as React from "react";
import { useTranslation } from "react-i18next";
import { Play, Trash2, Table2, Timer } from "lucide-react";
import { AsyncTaskDialog } from "../AsyncTasks/AsyncTaskDialog";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { SQLHighlight } from "@/components/SQLHighlight";

import { PivotTableDesigner } from "./PivotTableDesigner";
import { useTableColumns } from "@/hooks/useTableColumns";
import { useAppConfig } from "@/hooks/useAppConfig";
import type { SelectedTable } from "@/types/SelectedTable";
import type { TableSource } from "@/hooks/useQueryWorkspace";
import { getTableName, normalizeSelectedTable, isExternalTable } from "@/utils/tableUtils";
import { quoteIdent, getDialectFromSource, getSourceFromSelectedTable } from "@/utils/sqlUtils";
import { AggregationFunction } from "@/types/visualQuery";

interface PivotValueConfig {
    column: string;
    aggregation: AggregationFunction;
}

interface PivotPanelProps {
    selectedTables: SelectedTable[];
    onExecute: (sql: string, source?: TableSource) => Promise<void>;
}

export const PivotPanel: React.FC<PivotPanelProps> = ({
    selectedTables,
    onExecute,
}) => {
    const { t } = useTranslation(["pivot", "common"]);
    const { maxQueryRows } = useAppConfig();

    // 使用第一个选中的表
    const selectedTable = selectedTables.length > 0 ? selectedTables[0] : null;
    const tableName = selectedTable ? getTableName(selectedTable) : "";

    // 检测是否为外部表 - 使用更可靠的 isExternalTable 函数
    const isExternal = selectedTable ? isExternalTable(selectedTable) : false;

    // State
    const [rows, setRows] = React.useState<string[]>([]);
    const [columns, setColumns] = React.useState<string[]>([]);
    const [values, setValues] = React.useState<PivotValueConfig[]>([]);
    const [isExecuting, setIsExecuting] = React.useState(false);
    const [asyncDialogOpen, setAsyncDialogOpen] = React.useState(false);

    // Fetch columns for selected table
    const { columns: tableColumns, isLoading: columnsLoading } = useTableColumns(
        selectedTable ? normalizeSelectedTable(selectedTable) : null
    );

    // Reset config when table changes
    const resetConfig = React.useCallback(() => {
        setRows([]);
        setColumns([]);
        setValues([]);
    }, []);

    React.useEffect(() => {
        resetConfig();
    }, [tableName, resetConfig]);

    // Generate SQL - 使用 DuckDB 原生 PIVOT 语法
    // DuckDB PIVOT 语法: PIVOT table ON column USING agg(value) GROUP BY rows
    const generateSQL = React.useCallback((): string | null => {
        if (!selectedTable || rows.length === 0 || values.length === 0) return null;

        const source = getSourceFromSelectedTable(selectedTable);
        const dialect = getDialectFromSource(source);
        const normalized = normalizeSelectedTable(selectedTable);

        const fullTableName = normalized.schema
            ? `${quoteIdent(normalized.schema, dialect)}.${quoteIdent(normalized.name, dialect)}`
            : quoteIdent(normalized.name, dialect);

        // 确定行字段
        const rowColumns = rows.map(r => quoteIdent(r, dialect));

        // 构建聚合表达式（用于 USING 子句）
        const aggExpressions = values.map(v =>
            `${v.aggregation}(${quoteIdent(v.column, dialect)})`
        ).join(", ");

        // 如果有列字段（透视列），使用 PIVOT 语法
        if (columns.length === 1) {
            const pivotColumn = quoteIdent(columns[0], dialect);

            // DuckDB 简化 PIVOT 语法：
            // PIVOT table ON column USING agg(value) GROUP BY row_columns
            // 使用子查询包装以便添加 LIMIT
            const parts: string[] = [];
            parts.push(`SELECT * FROM (`);
            parts.push(`  PIVOT ${fullTableName}`);
            parts.push(`  ON ${pivotColumn}`);
            parts.push(`  USING ${aggExpressions}`);
            parts.push(`  GROUP BY ${rowColumns.join(", ")}`);
            parts.push(`)`);
            parts.push(`LIMIT ${maxQueryRows}`);

            return parts.join("\n");
        }

        // 如果没有透视列，使用普通 GROUP BY 聚合
        const selectParts: string[] = [];
        rows.forEach(r => selectParts.push(quoteIdent(r, dialect)));
        values.forEach(v => {
            selectParts.push(`${v.aggregation}(${quoteIdent(v.column, dialect)}) AS ${quoteIdent(`${v.aggregation}_${v.column}`, dialect)}`);
        });

        const parts: string[] = [];
        parts.push(`SELECT ${selectParts.join(", ")}`);
        parts.push(`FROM ${fullTableName}`);
        parts.push(`GROUP BY ${rowColumns.join(", ")}`);
        parts.push(`ORDER BY ${rowColumns.join(", ")}`);
        parts.push(`LIMIT ${maxQueryRows}`);

        return parts.join("\n");
    }, [selectedTable, rows, columns, values, maxQueryRows]);

    const sql = generateSQL();
    const canRun = !!sql && !isExternal; // 外部表不支持透视表
    const hasConfig = rows.length > 0 || columns.length > 0 || values.length > 0;

    // Execute
    const handleExecute = async () => {
        if (!sql) return;

        setIsExecuting(true);
        try {
            const source = selectedTable ? getSourceFromSelectedTable(selectedTable) : undefined;
            await onExecute(sql, source);
        } finally {
            setIsExecuting(false);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-surface">
            {/* 头部工具栏 - 与其他 Tab 一致 */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 bg-muted/30">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        {/* 执行按钮 - 外部表不支持透视表 */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="default"
                                        size="sm"
                                        onClick={handleExecute}
                                        disabled={!canRun || isExecuting}
                                        className="gap-1.5"
                                    >
                                        <Play className="w-3.5 h-3.5 fill-current" />
                                        {t('common:query.execute', '执行')}
                                    </Button>
                                </TooltipTrigger>
                                {isExternal && (
                                    <TooltipContent>
                                        <p>{t('common:query.pivot.externalNotSupported', '外部数据库表暂不支持透视表')}</p>
                                    </TooltipContent>
                                )}
                            </Tooltip>
                        </TooltipProvider>

                        {/* 异步执行按钮 - 外部表不支持异步执行 */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setAsyncDialogOpen(true)}
                                        disabled={!canRun || isExecuting || isExternal}
                                        className="gap-1.5"
                                        aria-label={t('common:query.sql.asyncExecute', '异步执行')}
                                    >
                                        <Timer className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">
                                            {t('common:query.sql.asyncExecute', '异步执行')}
                                        </span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>
                                        {isExternal
                                            ? t('common:query.pivot.asyncNotSupportedForExternal', '外部数据库表暂不支持异步执行')
                                            : t('common:query.sql.asyncExecuteHint', '后台执行，结果保存到表')}
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        <div className="w-[1px] h-4 bg-border mx-1" />

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={resetConfig}
                            disabled={!hasConfig}
                            className="text-muted-foreground hover:text-foreground gap-1.5"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t('common:common.clear', '清空')}
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* 标题徽章 */}
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-background/50 text-xs text-muted-foreground">
                        <Table2 className="w-3.5 h-3.5" />
                        <span>{t('common:query.pivot.title', '透视表')}</span>
                        {selectedTable && <span className="ml-1">· {tableName}</span>}
                    </div>
                </div>
            </div>

            {/* 主内容区 */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
                {/* 外部表警告 */}
                {isExternal && (
                    <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/30 rounded-lg text-sm text-warning">
                        <Table2 className="w-4 h-4 shrink-0" />
                        <span>{t('common:query.pivot.externalNotSupported', '外部数据库表暂不支持透视表。请先将外部表导入到 DuckDB 后再使用透视表功能。')}</span>
                    </div>
                )}

                {/* 统一的表格设计器 */}
                <PivotTableDesigner
                    availableFields={tableColumns}
                    rows={rows}
                    columns={columns}
                    values={values}
                    onRowsChange={setRows}
                    onColumnsChange={setColumns}
                    onValuesChange={setValues}
                    isLoading={columnsLoading}
                />

                {/* SQL 预览 */}
                {sql && (
                    <div className="bg-muted/30 border border-border rounded-xl p-4">
                        <h3 className="text-sm font-semibold mb-3">{t('common:query.sqlPreview', 'SQL 预览')}</h3>
                        <SQLHighlight sql={sql} minHeight="80px" maxHeight="200px" />
                    </div>
                )}
            </div>

            {/* 异步任务对话框 */}
            <AsyncTaskDialog
                open={asyncDialogOpen}
                onOpenChange={setAsyncDialogOpen}
                sql={sql?.trim() ?? ''}
                datasource={
                    selectedTable && getSourceFromSelectedTable(selectedTable)?.type === 'external' ? {
                        id: (getSourceFromSelectedTable(selectedTable) as any).connectionId!,
                        type: (getSourceFromSelectedTable(selectedTable) as any).databaseType!,
                        name: (getSourceFromSelectedTable(selectedTable) as any).connectionName,
                    } : undefined
                }
                onSuccess={() => {
                    setAsyncDialogOpen(false);
                }}
            />
        </div>
    );
};

export default PivotPanel;
