/**
 * 透视配置 → POST /api/visual-query（mode=pivot）请求体
 */

import type { FilterConfig, PivotConfig, PivotQueryConfig } from '@/types/pivotQuery';
import { AggregationFunction } from '@/types/pivotQuery';
import type { AttachDatabase } from '@/utils/sqlUtils';
import type { SelectedTable } from '@/types/SelectedTable';
import { getTableName, normalizeSelectedTable } from '@/utils/tableUtils';
import {
    createTableReference,
    generateExternalTableReference,
} from '@/utils/sqlUtils';

export interface PivotPanelValueConfig {
    column: string;
    aggregation: AggregationFunction;
}

const AGG_TO_API: Record<AggregationFunction, string> = {
    [AggregationFunction.COUNT]: 'COUNT',
    [AggregationFunction.SUM]: 'SUM',
    [AggregationFunction.AVG]: 'AVG',
    [AggregationFunction.MIN]: 'MIN',
    [AggregationFunction.MAX]: 'MAX',
    [AggregationFunction.COUNT_DISTINCT]: 'COUNT_DISTINCT',
};

export function mapPivotAggregation(agg: AggregationFunction): string {
    return AGG_TO_API[agg] ?? 'SUM';
}

/** 可走服务端 generate/preview（DuckDB 或联邦 ATTACH） */
export function canUseServerPivotPath(
    table: SelectedTable | null,
    rows: string[],
    values: PivotPanelValueConfig[]
): boolean {
    if (!table) {
        return false;
    }
    return rows.length > 0 && values.length > 0;
}

/** 多透视列等场景仍用本地 DuckDB PIVOT 语法 */
export function shouldUseLocalPivotSql(columns: string[]): boolean {
    return columns.length > 1;
}

export function buildPivotTableRef(table: SelectedTable): {
    tableName: string;
    attachDatabases: AttachDatabase[];
} {
    const normalized = normalizeSelectedTable(table);
    if (normalized.source === 'external' && normalized.connection) {
        const { qualifiedName, attachDatabase } = generateExternalTableReference(table);
        const attachDatabases = attachDatabase ? [attachDatabase] : [];
        return { tableName: qualifiedName, attachDatabases };
    }
    const ref = createTableReference(table, []);
    return { tableName: ref.name, attachDatabases: [] };
}

export function buildPivotQueryPayload(params: {
    table: SelectedTable;
    rows: string[];
    columns: string[];
    values: PivotPanelValueConfig[];
    maxQueryRows: number;
    filters?: FilterConfig[];
}): { config: PivotQueryConfig; pivotConfig: PivotConfig; attachDatabases: AttachDatabase[] } | null {
    const { table, rows, columns, values, maxQueryRows, filters = [] } = params;
    if (!canUseServerPivotPath(table, rows, values) || shouldUseLocalPivotSql(columns)) {
        return null;
    }

    const { tableName, attachDatabases } = buildPivotTableRef(table);

    const config: PivotQueryConfig = {
        table_name: tableName,
        filters,
        limit: maxQueryRows,
    };

    const pivotConfig: PivotConfig = {
        rows,
        columns,
        values: values.map((v) => ({
            column: v.column,
            aggregation: mapPivotAggregation(v.aggregation) as AggregationFunction,
        })),
        column_value_limit: maxQueryRows,
    };

    return { config, pivotConfig, attachDatabases };
}

export function getPivotQueryKey(
    table: SelectedTable | null,
    rows: string[],
    columns: string[],
    values: PivotPanelValueConfig[],
    filters: FilterConfig[] = []
): (string | number | undefined)[] {
    const name = table ? getTableName(table) : '';
    const filterKey = filters
        .map((f) => `${f.column}:${f.operator}:${String(f.value ?? "")}`)
        .join(";");
    return [
        'pivot-sql',
        name,
        rows.join(','),
        columns.join(','),
        values.map((v) => `${v.column}:${v.aggregation}`).join('|'),
        filterKey,
    ];
}
