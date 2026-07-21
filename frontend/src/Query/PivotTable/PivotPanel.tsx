/**
 * PivotPanel - 透视表（配置 → 后端 generate/preview → 执行）
 *
 * DuckDB / 联邦表：`POST /api/pivot-query/generate|preview` + ATTACH；
 * 多透视列等场景回退本地 DuckDB PIVOT SQL。
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
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
import { generatePivotQuery, toAttachDatabasesPayload, inferColumnCast, getApiErrorCode, type InferCastResult, type ApiError } from "@/api";
import { getTableName, normalizeSelectedTable } from "@/utils/tableUtils";
import {
    quoteIdent,
    getDialectFromSource,
    getSourceFromSelectedTable,
} from "@/utils/sqlUtils";
import { sqlStringLiteral } from "@/utils/sqlLiteral";
import {
    buildPivotQueryPayload,
    buildPivotTableRef,
    canUseServerPivotPath,
    hasPendingValueCast,
    getPivotQueryKey,
    getInferenceContextKey,
    shouldUseLocalPivotSql,
    type PivotPanelValueConfig,
} from "./buildPivotQueryPayload";
import { PivotFilters, pivotFiltersToApi, type PivotFilterRow } from "./PivotFilters";
import { useAiStatus } from "@/hooks/useAiStatus";
import { AiChatDrawer, ChatToggleButton } from "@/Query/SQLQuery/ai/AiChatDrawer";

interface PivotPanelProps {
    selectedTables: SelectedTable[];
    onExecute: (sql: string, source?: TableSource) => Promise<void>;
}

export const PivotPanel: React.FC<PivotPanelProps> = ({
    selectedTables,
    onExecute,
}) => {
    const { t, i18n } = useTranslation("common");
    const { maxQueryRows, pivotMaxColumns } = useAppConfig();

    const chatStatus = useAiStatus("chat");
    const [chatOpen, setChatOpen] = React.useState(false);
    const aiLocale: "zh" | "en" = i18n.language?.startsWith("zh") ? "zh" : "en";
    const chatTableNames = React.useMemo(
        () => selectedTables.map((tbl) => getTableName(tbl)),
        [selectedTables]
    );

    const selectedTable = selectedTables.length > 0 ? selectedTables[0] : null;
    const tableName = selectedTable ? getTableName(selectedTable) : "";

    const [rows, setRows] = React.useState<string[]>([]);
    const [columns, setColumns] = React.useState<string[]>([]);
    const [values, setValues] = React.useState<PivotPanelValueConfig[]>([]);
    const [filterRows, setFilterRows] = React.useState<PivotFilterRow[]>([]);
    const [isExecuting, setIsExecuting] = React.useState(false);
    const [asyncDialogOpen, setAsyncDialogOpen] = React.useState(false);

    const { columns: tableColumns, isLoading: columnsLoading } = useTableColumns(
        selectedTable ? normalizeSelectedTable(selectedTable) : null
    );

    const resetConfig = React.useCallback(() => {
        setRows([]);
        setColumns([]);
        setValues([]);
        setFilterRows([]);
    }, []);

    // 表身份(限定名 + attach/连接,不含筛选):切换到不同连接的【同名表】时裸表名相同、不会重置,
    // 用完整身份才能触发 resetConfig 清掉旧表配置(含带旧 cast 的 values)。
    const tableIdentity = React.useMemo(
        () => getInferenceContextKey(selectedTable, []),
        [selectedTable]
    );

    React.useEffect(() => {
        resetConfig();
    }, [tableIdentity, resetConfig]);

    const apiFilters = React.useMemo(
        () => pivotFiltersToApi(filterRows),
        [filterRows]
    );

    // cast 推断上下文键:表身份 + 归一筛选。任一变化 → 设计器对"系统推断"的值重推(手填不覆盖)。
    // 含表身份可防"切到同名异连接表沿用旧 cast";含筛选可防"小范围推 DECIMAL(38,2),扩大筛选后
    // 仍用旧标度静默舍入"。与 getPivotQueryKey/getInferenceContextKey 同口径。
    const inferenceContextKey = React.useMemo(
        () => getInferenceContextKey(selectedTable, apiFilters),
        [selectedTable, apiFilters]
    );

    // 文本列选 SUM/AVG 时,在当前筛选后的数据上做数据感知 cast 推断(供设计器预填安全推荐)
    const handleInferCast = React.useCallback(
        async (column: string): Promise<InferCastResult | null> => {
            if (!selectedTable) return null;
            try {
                const ref = buildPivotTableRef(selectedTable);
                return await inferColumnCast({
                    table_name: ref.tableName,
                    column,
                    filters: apiFilters,
                    attach_databases: toAttachDatabasesPayload(ref.attachDatabases),
                });
            } catch {
                return null;
            }
        },
        [selectedTable, apiFilters]
    );

    const useServerPivot = canUseServerPivotPath(selectedTable, rows, values)
        && !shouldUseLocalPivotSql(columns);

    const pivotPayload = React.useMemo(
        () =>
            selectedTable && useServerPivot
                ? buildPivotQueryPayload({
                      table: selectedTable,
                      rows,
                      columns,
                      values,
                      maxQueryRows,
                      pivotMaxColumns,
                      filters: apiFilters,
                  })
                : null,
        [selectedTable, useServerPivot, rows, columns, values, maxQueryRows, pivotMaxColumns, apiFilters]
    );

    const pivotQueryKey = getPivotQueryKey(
        selectedTable,
        rows,
        columns,
        values,
        apiFilters,
        maxQueryRows,
        pivotMaxColumns
    );

    const {
        data: serverGenerated,
        isFetching: isGeneratingSql,
        isError: isGenerateError,
        error: generateError,
    } = useQuery({
        queryKey: pivotQueryKey,
        queryFn: async () => {
            if (!pivotPayload) return null;
            const attachDatabases = toAttachDatabasesPayload(pivotPayload.attachDatabases) ?? [];
            return generatePivotQuery(
                pivotPayload.config,
                pivotPayload.pivotConfig,
                { attachDatabases }
            );
        },
        enabled: Boolean(pivotPayload),
        staleTime: 30_000,
    });

    // 服务端生成失败:据结构化 code/details 提示(不解析消息文本)。列超限时给出可操作建议。
    const generateErrorInfo = React.useMemo(() => {
        if (!isGenerateError || !generateError) return null;
        const code = getApiErrorCode(generateError, "OPERATION_FAILED");
        const details = (generateError as ApiError).details ?? {};
        if (code === "PIVOT_COLUMN_LIMIT_EXCEEDED") {
            return {
                code,
                column: String(details.column ?? ""),
                cap: Number(details.cap ?? 0),
                observed: Number(details.observed_at_least ?? 0),
            };
        }
        return { code, column: "", cap: 0, observed: 0 };
    }, [isGenerateError, generateError]);

    const buildLocalWhereClause = React.useCallback(
        (dialect: ReturnType<typeof getDialectFromSource>): string | null => {
            if (apiFilters.length === 0) return null;
            const clauses = apiFilters.map((f) => {
                const col = quoteIdent(f.column, dialect);
                if (f.operator === "IS NULL") return `${col} IS NULL`;
                if (f.operator === "IS NOT NULL") return `${col} IS NOT NULL`;
                const val =
                    f.value === null || f.value === undefined
                        ? "NULL"
                        : typeof f.value === "number"
                          ? String(f.value)
                          : sqlStringLiteral(String(f.value));
                return `${col} ${f.operator} ${val}`;
            });
            return clauses.length ? `WHERE ${clauses.join(" AND ")}` : null;
        },
        [apiFilters]
    );

    const generateLocalSQL = React.useCallback((): string | null => {
        if (!selectedTable || rows.length === 0 || values.length === 0) return null;

        const source = getSourceFromSelectedTable(selectedTable);
        const dialect = getDialectFromSource(source);
        const normalized = normalizeSelectedTable(selectedTable);
        const whereClause = buildLocalWhereClause(dialect);

        const fullTableName = normalized.schema
            ? `${quoteIdent(normalized.schema, dialect)}.${quoteIdent(normalized.name, dialect)}`
            : quoteIdent(normalized.name, dialect);

        const rowColumns = rows.map((r) => quoteIdent(r, dialect));
        const aggExpressions = values
            .map((v) => `${v.aggregation}(${quoteIdent(v.column, dialect)})`)
            .join(", ");

        if (columns.length === 1) {
            const pivotColumn = quoteIdent(columns[0], dialect);
            const parts: string[] = [];
            parts.push("SELECT * FROM (");
            parts.push(`  PIVOT ${fullTableName}`);
            parts.push(`  ON ${pivotColumn}`);
            parts.push(`  USING ${aggExpressions}`);
            parts.push(`  GROUP BY ${rowColumns.join(", ")}`);
            parts.push(")");
            if (whereClause) parts.push(whereClause);
            parts.push(`LIMIT ${maxQueryRows}`);
            return parts.join("\n");
        }

        const selectParts: string[] = [];
        rows.forEach((r) => selectParts.push(quoteIdent(r, dialect)));
        values.forEach((v) => {
            selectParts.push(
                `${v.aggregation}(${quoteIdent(v.column, dialect)}) AS ${quoteIdent(`${v.aggregation}_${v.column}`, dialect)}`
            );
        });

        const parts: string[] = [];
        parts.push(`SELECT ${selectParts.join(", ")}`);
        parts.push(`FROM ${fullTableName}`);
        if (whereClause) parts.push(whereClause);
        parts.push(`GROUP BY ${rowColumns.join(", ")}`);
        parts.push(`ORDER BY ${rowColumns.join(", ")}`);
        parts.push(`LIMIT ${maxQueryRows}`);
        return parts.join("\n");
    }, [selectedTable, rows, columns, values, maxQueryRows, buildLocalWhereClause]);

    // 有值的 cast 仍在推断中 / 无法安全推断 → 阻断服务端与本地两条路径(不静默用有损默认出结果)
    const castPending = hasPendingValueCast(values);

    // 服务端路径激活时 SQL 只来自服务端生成:加载中/出错都为 null,绝不回退到无列上限保护的
    // 本地 PIVOT(否则后端刚拒绝的超限查询会被本地 SQL 原样执行——复审 P1)。本地路径仅用于
    // useServerPivot 为 false(如多列/含特殊字符列走 shouldUseLocalPivotSql)的情形。
    const sql = castPending
        ? null
        : useServerPivot
          ? serverGenerated?.final_sql?.trim() || null
          : generateLocalSQL() || null;

    const tableSource = selectedTable
        ? getSourceFromSelectedTable(selectedTable)
        : undefined;

    const canRun = Boolean(sql);
    const hasConfig = rows.length > 0 || columns.length > 0 || values.length > 0;

    const handleExecute = async () => {
        if (!sql) return;
        setIsExecuting(true);
        try {
            await onExecute(sql, tableSource);
        } finally {
            setIsExecuting(false);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-surface">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 bg-muted/30">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="default"
                            size="sm"
                            onClick={handleExecute}
                            disabled={!canRun || isExecuting || isGeneratingSql}
                            className="gap-1.5"
                        >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            {t("query.execute", "执行")}
                        </Button>

                        {castPending && (
                            <span className="text-xs text-destructive whitespace-nowrap">
                                {t("query.pivot.castBlockedHint", "有聚合值的类型还在推断或需手动选择,已暂停执行")}
                            </span>
                        )}

                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setAsyncDialogOpen(true)}
                                        disabled={!canRun || isExecuting}
                                        className="gap-1.5"
                                        aria-label={t("query.sql.asyncExecute", "异步执行")}
                                    >
                                        <Timer className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">
                                            {t("query.sql.asyncExecute", "异步执行")}
                                        </span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{t("query.sql.asyncExecuteHint", "后台执行，结果保存到表")}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        <div className="w-px h-4 bg-border mx-1" />

                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={resetConfig}
                            disabled={!hasConfig}
                            className="text-muted-foreground hover:text-foreground gap-1.5"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t("common.clear", "清空")}
                        </Button>

                        {chatStatus.configured && (
                            <ChatToggleButton active={chatOpen} onClick={() => setChatOpen((v) => !v)} />
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-background/50 text-xs text-muted-foreground">
                        <Table2 className="w-3.5 h-3.5" />
                        <span>{t("query.pivot.title", "透视表")}</span>
                        {selectedTable && <span className="ml-1">· {tableName}</span>}
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4">
                <PivotTableDesigner
                    availableFields={tableColumns}
                    rows={rows}
                    columns={columns}
                    values={values}
                    onRowsChange={setRows}
                    onColumnsChange={setColumns}
                    onValuesChange={setValues}
                    isLoading={columnsLoading}
                    onInferCast={handleInferCast}
                    inferenceContextKey={inferenceContextKey}
                />

                <PivotFilters
                    columnNames={tableColumns.map((c) => c.name)}
                    filters={filterRows}
                    onChange={setFilterRows}
                    disabled={columnsLoading || !selectedTable}
                />

                {generateErrorInfo && (
                    <div className="bg-destructive/10 border border-destructive/40 rounded-xl p-3 text-sm text-destructive">
                        {generateErrorInfo.code === "PIVOT_COLUMN_LIMIT_EXCEEDED"
                            ? t("query.pivot.columnLimitHint", {
                                  column: generateErrorInfo.column,
                                  cap: generateErrorInfo.cap,
                                  observed: generateErrorInfo.observed,
                              })
                            : t("query.pivot.generateFailed", "透视查询生成失败,请检查配置或稍后重试")}
                    </div>
                )}

                {sql && (
                    <div className="bg-muted/30 border border-border rounded-xl p-4">
                        <h3 className="text-sm font-semibold mb-3">
                            {t("query.sqlPreview", "SQL 预览")}
                            {isGeneratingSql ? (
                                <span className="text-muted-foreground font-normal ml-2">
                                    {t("query.generating", "生成中…")}
                                </span>
                            ) : null}
                        </h3>
                        <SQLHighlight sql={sql} minHeight="80px" maxHeight="200px" scrollable />
                    </div>
                )}
            </div>

            <AsyncTaskDialog
                open={asyncDialogOpen}
                onOpenChange={setAsyncDialogOpen}
                sql={sql?.trim() ?? ""}
                datasource={
                    tableSource?.type === "federated" && tableSource.connectionId
                        ? {
                              id: tableSource.connectionId,
                              type: tableSource.databaseType ?? "mysql",
                              name: tableSource.connectionName,
                          }
                        : undefined
                }
                onSuccess={() => setAsyncDialogOpen(false)}
            />

            {chatStatus.configured && (
                <AiChatDrawer
                    open={chatOpen}
                    onClose={() => setChatOpen(false)}
                    selectedTables={chatTableNames}
                    attachDatabases={pivotPayload?.attachDatabases ?? []}
                    currentSql={sql ?? undefined}
                    locale={aiLocale}
                />
            )}
        </div>
    );
};

export default PivotPanel;
