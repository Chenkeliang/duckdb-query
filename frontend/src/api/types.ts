/**
 * Shared API Types
 * 
 * Type definitions for API requests and responses.
 */

// ==================== Common Types ====================

export interface ApiResponse<T = unknown> {
    success: boolean;
    message?: string;
    data?: T;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    count: number;
    total: number;
    limit: number;
    offset: number;
}

// ==================== Query Types ====================

export interface QueryRequest {
    sql: string;
    datasource?: DataSource;
    is_preview?: boolean;
    save_as_table?: string;
}

export interface QueryResponse {
    success: boolean;
    data?: Record<string, unknown>[];
    columns?: ColumnInfo[];
    row_count?: number;
    execution_time_ms?: number;
    error?: QueryError;
}

export interface QueryError {
    code: string;
    message: string;
    details?: Record<string, unknown>;
}

export interface ColumnInfo {
    name: string;
    type: string;
    nullable?: boolean;
}

// ==================== Data Source Types ====================

export interface DataSource {
    id?: string;
    type: 'duckdb' | 'mysql' | 'postgresql' | 'sqlite' | 'file';
    name?: string;
}

export type DatabaseType = 'mysql' | 'postgresql' | 'sqlite';

export interface DatabaseConnection {
    id: string;
    name: string;
    type: DatabaseType;
    status: 'active' | 'ready' | 'idle' | 'error';
    created_at?: string;
    updated_at?: string;
    requiresPassword?: boolean;
    params: DatabaseConnectionParams;
}

export interface DatabaseConnectionParams {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    [key: string]: unknown;
}

export interface ConnectionTestResult {
    success: boolean;
    message?: string;
    latency_ms?: number;
    details?: Record<string, unknown>;
}

// ==================== File Types ====================

export interface UploadProgress {
    loaded: number;
    total: number;
    percent: number;
}

export interface UploadResponse {
    success: boolean;
    file_id?: string;
    table_name?: string;
    message?: string;
}

export interface FileInfo {
    name: string;
    size: number;
    type: string;
    path?: string;
}

// ==================== Async Task Types ====================

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AsyncTask {
    id: string;
    name?: string;
    status: TaskStatus;
    progress?: number;
    created_at: string;
    started_at?: string;
    completed_at?: string;
    error?: string;
    result?: TaskResult;
}

export interface TaskResult {
    row_count?: number;
    file_path?: string;
    table_name?: string;
}

export interface CreateTaskRequest {
    sql: string;
    name?: string;
    datasource?: DataSource;
    output_format?: 'csv' | 'parquet';
}

// ==================== Table Types ====================

export interface TableInfo {
    name: string;
    type: 'TABLE' | 'VIEW';
    row_count?: number;
    source_type?: string;
    schema?: string;
}

export interface TableDetail {
    table_name: string;
    columns: ColumnInfo[];
    column_count: number;
    row_count: number;
    sample_data?: Record<string, unknown>[];
}

// ==================== Visual Query Types ====================

export interface VisualQueryConfig {
    tables: VisualQueryTable[];
    joins?: VisualQueryJoin[];
    columns?: VisualQueryColumn[];
    filters?: VisualQueryFilter[];
    groupBy?: string[];
    orderBy?: VisualQueryOrderBy[];
    limit?: number;
}

export interface VisualQueryTable {
    name: string;
    alias?: string;
    schema?: string;
}

export interface VisualQueryJoin {
    type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
    table: string;
    on: string;
}

export interface VisualQueryColumn {
    name: string;
    alias?: string;
    aggregate?: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';
}

export interface VisualQueryFilter {
    column: string;
    operator: string;
    value: unknown;
}

export interface VisualQueryOrderBy {
    column: string;
    direction: 'ASC' | 'DESC';
}

// ==================== SQL Favorites Types ====================

export interface SqlFavorite {
    id: string;
    name: string;
    sql: string;
    description?: string;
    tags?: string[];
    created_at: string;
    updated_at?: string;
    usage_count?: number;
}

export interface CreateFavoriteRequest {
    name: string;
    sql: string;
    description?: string;
    tags?: string[];
}
