export enum VisualQueryMode {
    VISUAL = "visual",
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

export enum SortDirection {
    ASC = "asc",
    DESC = "desc",
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

export interface SortConfig {
    column: string;
    direction: SortDirection;
}

export interface VisualQueryConfig {
    table_name: string;
    filters?: FilterConfig[];
    order_by?: SortConfig[];
    limit?: number;
    // For standard visual query mode (non-pivot)
    selected_columns?: string[];
    aggregations?: any[];
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

export interface PreviewResponse {
    success: boolean;
    data: any[] | null;
    columns: string[] | null;
    row_count: number;
    estimated_time?: number | null;
    sql?: string | null;
    base_sql?: string | null;
    pivot_sql?: string | null;
    mode: VisualQueryMode;
    errors: string[];
    warnings: string[];
}
