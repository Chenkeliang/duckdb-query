/**
 * 透视配置 → POST /api/pivot-query 请求体
 */

import type { FilterConfig, PivotConfig, PivotQueryConfig } from '@/types/pivotQuery';
import { AggregationFunction } from '@/types/pivotQuery';
import type { AttachDatabase } from '@/utils/sqlUtils';
import type { SelectedTable } from '@/types/SelectedTable';
import { normalizeSelectedTable } from '@/utils/tableUtils';
import {
    createTableReference,
    generateExternalTableReference,
} from '@/utils/sqlUtils';

export interface PivotPanelValueConfig {
    column: string;
    aggregation: AggregationFunction;
    /** 文本列按数值聚合时的转换目标(如 DECIMAL(38,2));透传给后端 TRY_CAST */
    typeConversion?: string;
    /** UI-only:'pending'=推断中,'unsafe'=需用户显式选类型。有此状态则阻断生成/执行(不透传后端)。 */
    castStatus?: 'pending' | 'unsafe';
}

/** 是否存在待推断/无法安全推断的值(应阻断透视生成与执行,避免用有损默认静默出结果) */
export function hasPendingValueCast(values: PivotPanelValueConfig[]): boolean {
    return values.some((v) => v.castStatus === 'pending' || v.castStatus === 'unsafe');
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
    // 有值的 cast 还在推断中 / 无法安全推断 → 不放行生成(避免用有损默认静默出结果)
    if (hasPendingValueCast(values)) {
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
    pivotMaxColumns: number;
    filters?: FilterConfig[];
}): { config: PivotQueryConfig; pivotConfig: PivotConfig; attachDatabases: AttachDatabase[] } | null {
    const { table, rows, columns, values, maxQueryRows, pivotMaxColumns, filters = [] } = params;
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
            // 透传类型转换(如文本列按数值求和时的 DOUBLE);后端会走 TRY_CAST + 白名单校验
            ...(v.typeConversion ? { typeConversion: v.typeConversion } : {}),
        })),
        // 列数上限用后端下发的 pivot_max_columns(经 useAppConfig/features),不复用行数上限
        // maxQueryRows,也不前端硬编码;后端超限会报 PIVOT_COLUMN_LIMIT_EXCEEDED
        column_value_limit: pivotMaxColumns,
    };

    return { config, pivotConfig, attachDatabases };
}

export function getPivotQueryKey(
    table: SelectedTable | null,
    rows: string[],
    columns: string[],
    values: PivotPanelValueConfig[],
    filters: FilterConfig[] = [],
    maxQueryRows?: number
): (string | number | undefined)[] {
    // 用限定名(含 schema/连接前缀)而非裸表名,避免不同连接下同名表(如各自的 orders)
    // 生成同一缓存键、在 staleTime 内互相返回对方的 SQL
    const ref = table ? buildPivotTableRef(table) : null;
    const name = ref?.tableName ?? '';
    const attachKey = (ref?.attachDatabases ?? [])
        .map((d) => `${d.alias}=${d.connectionId}`)
        .join(',');
    const filterKey = filters
        .map((f) => `${f.column}:${f.operator}:${String(f.value ?? "")}`)
        .join(";");
    return [
        'pivot-sql',
        name,
        attachKey,
        rows.join(','),
        columns.join(','),
        // 含 typeConversion:同列同聚合、但一个转 DECIMAL 会生成不同 SQL,不能共用键
        values.map((v) => `${v.column}:${v.aggregation}:${v.typeConversion ?? ''}`).join('|'),
        filterKey,
        maxQueryRows ?? '',
    ];
}
