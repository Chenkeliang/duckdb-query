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
    /** UI-only:cast 来源。'inferred'=系统数据感知推断(上下文变化会重推);'manual'=用户手填(不覆盖)。 */
    castSource?: 'inferred' | 'manual';
    /** UI-only:该推断结果所依据的推断上下文键(表身份+筛选);与当前不同 → 结果已过期需重推。 */
    castContextKey?: string;
    /** UI-only:单调派发号,只应用最新一次推断派发的结果(区分同上下文的重复在途请求)。 */
    castSeq?: number;
}

/** 归一化筛选为稳定字符串键:透视 SQL 缓存键 与 cast 推断上下文键共用同一口径,
 *  确保"筛选范围扩大 → 推断上下文键变化 → 触发重推"与缓存失效对齐。
 *  用 JSON 编码而非 `:`/`;` 手工拼接——否则值里含分隔符时会碰撞:单个筛选 a="x;b:=:y" 与
 *  两个筛选 a="x" AND b="y" 旧口径同为 "a:=:x;b:=:y",会复用错筛选的缓存 SQL / 不重推 cast。 */
export function normalizeFiltersKey(filters: FilterConfig[]): string {
    return JSON.stringify(filters.map((f) => [f.column, f.operator, f.value ?? null]));
}

/** cast 推断上下文键:限定表名(含 schema/连接前缀)+ attach 别名/连接 id + 归一筛选。
 *  任一变化(切表、换到同名异连接表、改筛选)→ 键变化 → 对系统推断的值重推,避免沿用旧上下文
 *  推出的 scale(如连接 A 的 orders.amount 推为 DECIMAL(38,2),切到连接 B 同名表含三位小数仍按两位)。 */
export function getInferenceContextKey(
    table: SelectedTable | null,
    filters: FilterConfig[]
): string {
    const ref = table ? buildPivotTableRef(table) : null;
    const name = ref?.tableName ?? '';
    const attachKey = (ref?.attachDatabases ?? []).map((d) => `${d.alias}=${d.connectionId}`);
    return JSON.stringify([name, attachKey, normalizeFiltersKey(filters)]);
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
    maxQueryRows?: number,
    pivotMaxColumns?: number
): (string | number | undefined)[] {
    // 用限定名(含 schema/连接前缀)而非裸表名,避免不同连接下同名表(如各自的 orders)
    // 生成同一缓存键、在 staleTime 内互相返回对方的 SQL
    const ref = table ? buildPivotTableRef(table) : null;
    const name = ref?.tableName ?? '';
    const attachKey = (ref?.attachDatabases ?? [])
        .map((d) => `${d.alias}=${d.connectionId}`)
        .join(',');
    const filterKey = normalizeFiltersKey(filters);
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
        // column_value_limit(=pivotMaxColumns)进入请求体、影响生成 SQL,须进键
        pivotMaxColumns ?? '',
    ];
}
