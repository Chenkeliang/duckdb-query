/**
 * PivotPanel - 透视表（配置 → 后端 generate/preview → 执行）
 *
 * DuckDB / 联邦表：`POST /api/pivot-query/generate|preview` + ATTACH；
 * 多透视列等场景回退本地 DuckDB PIVOT SQL。
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Play, Eye, Trash2, Table2, Timer } from "lucide-react";
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
import type { TableSource, UseQueryWorkspaceReturn } from "@/hooks/useQueryWorkspace";
import {
    generatePivotQuery,
    previewPivotQuery,
} from "@/api";
import { showErrorToast } from "@/utils/toastHelpers";
import { getTableName, normalizeSelectedTable } from "@/utils/tableUtils";
import {
    quoteIdent,
    getDialectFromSource,
    getSourceFromSelectedTable,
} from "@/utils/sqlUtils";
import {
    buildPivotQueryPayload,
    canUseServerPivotPath,
    getPivotQueryKey,
    shouldUseLocalPivotSql,
    type PivotPanelValueConfig,
} from "./buildPivotQueryPayload";
import { PivotFilters, pivotFiltersToApi, type PivotFilterRow } from "./PivotFilters";

interface PivotPanelProps {
    selectedTables: SelectedTable[];
    onExecute: (sql: string, source?: TableSource) => Promise<void>;
    onDisplayPreview?: UseQueryWorkspaceReturn["displayQueryPreview"];
}

export const PivotPanel: React.FC<PivotPanelProps> = ({
    selectedTables,
    onExecute,
    onDisplayPreview,
}) => {
    const { t } = useTranslation(["pivot", "common"]);
    const { maxQueryRows } = useAppConfig();

    const selectedTable = selectedTables.length > 0 ? selectedTables[0] : null;
    const tableName = selectedTable ? getTableName(selectedTable) : "";

    const [rows, setRows] = React.useState<string[]>([]);
    const [columns, setColumns] = React.useState<string[]>([]);
    const [values, setValues] = React.useState<PivotPanelValueConfig[]>([]);
    const [filterRows, setFilterRows] = React.useState<PivotFilterRow[]>([]);
    const [isExecuting, setIsExecuting] = React.useState(false);
    const [isPreviewing, setIsPreviewing] = React.useState(false);
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

    React.useEffect(() => {
        resetConfig();
    }, [tableName, resetConfig]);

    const apiFilters = React.useMemo(
        () => pivotFiltersToApi(filterRows),
        [filterRows]
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
                      filters: apiFilters,
                  })
                : null,
        [selectedTable, useServerPivot, rows, columns, values, maxQueryRows, apiFilters]
    );

    const pivotQueryKey = getPivotQueryKey(
        selectedTable,
        rows,
        columns,
        values,
        apiFilters
    );

    const { data: serverGenerated, isFetching: isGeneratingSql } = useQuery({
        queryKey: pivotQueryKey,
        queryFn: async () => {
            if (!pivotPayload) return null;
            const attachDatabases = pivotPayload.attachDatabases.map((db) => ({
                alias: db.alias,
                connection_id: db.connectionId,
            }));
            return generatePivotQuery(
                pivotPayload.config,
                pivotPayload.pivotConfig,
                { attachDatabases }
            );
        },
        enabled: Boolean(pivotPayload),
        staleTime: 30_000,
    });

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
                          : `'${String(f.value).replace(/'/g, "''")}'`;
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

    const sql =
        (useServerPivot && serverGenerated?.final_sql?.trim()) ||
        generateLocalSQL() ||
        null;

    const tableSource = selectedTable
        ? getSourceFromSelectedTable(selectedTable)
        : undefined;

    const canRun = Boolean(sql);
    const hasConfig = rows.length > 0 || columns.length > 0 || values.length > 0;

    const handlePreview = async () => {
        if (!onDisplayPreview || !pivotPayload) return;
        setIsPreviewing(true);
        const startTime = Date.now();
        try {
            const attachDatabases = pivotPayload.attachDatabases.map((db) => ({
                alias: db.alias,
                connection_id: db.connectionId,
            }));
            const result = await previewPivotQuery(
                pivotPayload.config,
                pivotPayload.pivotConfig,
                maxQueryRows,
                { attachDatabases }
            );
            const previewColumns =
                result.columns ??
                (result.data?.length
                    ? Object.keys(result.data[0] as Record<string, unknown>)
                    : []);
            onDisplayPreview(
                {
                    data: result.data ?? undefined,
                    columns: previewColumns,
                    row_count: result.row_count,
                    execTime: Date.now() - startTime,
                    preview_limit_applied: maxQueryRows,
                },
                result.sql ?? sql ?? undefined,
                tableSource
            );
        } catch (err) {
            showErrorToast(t, err as Error, t("common:query.pivot.previewFailed", "透视预览失败"));
        } finally {
            setIsPreviewing(false);
        }
    };

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
                        {useServerPivot && onDisplayPreview ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handlePreview}
                                disabled={!canRun || isExecuting || isPreviewing || isGeneratingSql}
                                className="gap-1.5"
                            >
                                <Eye className="w-3.5 h-3.5" />
                                {isPreviewing
                                    ? t("common:query.pivot.previewing", "预览中…")
                                    : t("common:query.pivot.preview", "预览")}
                            </Button>
                        ) : null}
                        <Button
                            variant="default"
                            size="sm"
                            onClick={handleExecute}
                            disabled={!canRun || isExecuting || isPreviewing || isGeneratingSql}
                            className="gap-1.5"
                        >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            {t("common:query.execute", "执行")}
                        </Button>

                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setAsyncDialogOpen(true)}
                                        disabled={!canRun || isExecuting}
                                        className="gap-1.5"
                                        aria-label={t("common:query.sql.asyncExecute", "异步执行")}
                                    >
                                        <Timer className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">
                                            {t("common:query.sql.asyncExecute", "异步执行")}
                                        </span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{t("common:query.sql.asyncExecuteHint", "后台执行，结果保存到表")}</p>
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
                            {t("common:common.clear", "清空")}
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-background/50 text-xs text-muted-foreground">
                        <Table2 className="w-3.5 h-3.5" />
                        <span>{t("common:query.pivot.title", "透视表")}</span>
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
                />

                <PivotFilters
                    columnNames={tableColumns.map((c) => c.name)}
                    filters={filterRows}
                    onChange={setFilterRows}
                    disabled={columnsLoading || !selectedTable}
                />

                {sql && (
                    <div className="bg-muted/30 border border-border rounded-xl p-4">
                        <h3 className="text-sm font-semibold mb-3">
                            {t("common:query.sqlPreview", "SQL 预览")}
                            {isGeneratingSql ? (
                                <span className="text-muted-foreground font-normal ml-2">
                                    {t("common:query.generating", "生成中…")}
                                </span>
                            ) : null}
                        </h3>
                        <SQLHighlight sql={sql} minHeight="80px" maxHeight="200px" />
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
        </div>
    );
};

export default PivotPanel;
