/** 与后端 `VisualQueryMode` 对齐；HTTP 路径 `/api/pivot-query/*` */
export enum PivotQueryMode {
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
    value: unknown;
}

/** POST /api/visual-query 请求体中的 config */
export interface PivotQueryConfig {
    table_name: string;
    filters?: FilterConfig[];
    limit?: number;
}

export interface GeneratedPivotQuery {
    mode: PivotQueryMode;
    base_sql: string;
    final_sql: string;
    pivot_sql?: string;
    warnings: string[];
    metadata: Record<string, unknown>;
    estimated_rows?: number;
}

export interface PivotQueryPreviewPayload {
    data: Record<string, unknown>[] | null;
    columns: string[] | null;
    row_count: number;
    returned_rows?: number;
    sql?: string | null;
    base_sql?: string | null;
    pivot_sql?: string | null;
    mode: PivotQueryMode;
    errors: string[];
    warnings: string[];
}
