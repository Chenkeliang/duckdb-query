/** 与后端 `VisualQueryMode` 对齐；前端仅使用 PIVOT（透视 Tab） */
export enum VisualQueryMode {
    PIVOT = "pivot",
}

export enum AggregationFunction {
    COUNT = "count",
    SUM = "sum",
    AVG = "avg",
    MIN = "min",
    MAX = "max",
    COUNT_DISTINCT = "count_distinct",
}

export interface PivotValueConfig {
    column: string;
    aggregation: AggregationFunction;
    alias?: string;
    typeConversion?: string;
}

export interface PivotConfig {
    rows: string[];
    columns: string[];
    values: PivotValueConfig[];
    manual_column_values?: string[];
    column_value_limit?: number;
    include_subtotals?: boolean;
    include_grand_totals?: boolean;
}

export interface FilterConfig {
    column: string;
    operator: string;
    value: any;
}

/** 透视 API 请求体中的 config（与 buildPivotQueryPayload 一致） */
export interface VisualQueryConfig {
    table_name: string;
    filters?: FilterConfig[];
    limit?: number;
}

export interface GeneratedVisualQuery {
    mode: VisualQueryMode;
    base_sql: string;
    final_sql: string;
    pivot_sql?: string;
    warnings: string[];
    metadata: Record<string, any>;
    complexity_score?: number;
    estimated_rows?: number;
}

export interface VisualQueryPreviewPayload {
    data: Record<string, unknown>[] | null;
    columns: string[] | null;
    /** 与查询匹配的总行数估计（COUNT），可能大于本次返回行数 */
    row_count: number;
    /** 本响应实际返回的行数（LIMIT 之后）；旧后端缺省时由前端用 data.length 兜底 */
    returned_rows?: number;
    sql?: string | null;
    base_sql?: string | null;
    pivot_sql?: string | null;
    mode: VisualQueryMode;
    errors: string[];
    warnings: string[];
}
