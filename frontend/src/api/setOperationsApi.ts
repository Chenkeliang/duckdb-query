/**
 * Set operations API — 与后端 /api/set-operations/* 对齐
 */

import { apiClient, handleApiError, normalizeResponse } from './client';

export type SetOperationTypeApi =
    | 'UNION'
    | 'UNION ALL'
    | 'INTERSECT'
    | 'EXCEPT';

export interface SetOperationTableConfig {
    table_name: string;
    selected_columns: string[];
    alias?: string;
}

export interface SetOperationConfigPayload {
    operation_type: SetOperationTypeApi;
    tables: SetOperationTableConfig[];
    use_by_name: boolean;
}

export interface SetOperationRequestPayload {
    config: SetOperationConfigPayload;
    preview?: boolean;
    save_as_table?: string;
    include_metadata?: boolean;
}

export interface SetOperationValidateResult {
    is_valid: boolean;
    errors: string[];
    warnings: string[];
    table_count: number;
    operation_type: SetOperationTypeApi;
    use_by_name: boolean;
}

export interface SetOperationExecuteResult {
    data?: Record<string, unknown>[];
    row_count: number;
    column_count?: number;
    columns?: { name: string; type: string }[];
    sql: string;
    sqlQuery?: string;
    saved_table?: string;
    table_alias?: string;
    originalDatasource?: Record<string, unknown>;
    isSetOperation?: boolean;
    setOperationConfig?: SetOperationConfigPayload;
    errors?: string[];
    warnings?: string[];
}

export interface SimpleUnionSetOperationPayload {
    tables: string[];
    operation_type?: SetOperationTypeApi;
    use_by_name?: boolean;
    column_mappings?: Record<string, { source_column: string; target_column: string }[]>;
}

export interface SimpleUnionSetOperationResult {
    sql: string;
    estimated_rows?: number;
    table_count: number;
    operation_type: SetOperationTypeApi;
    use_by_name: boolean;
    errors?: string[];
    warnings?: string[];
}

export type SetOperationExportFormat = 'excel' | 'csv' | 'parquet';

export interface SetOperationExportPayload {
    config: SetOperationConfigPayload;
    format: SetOperationExportFormat;
    filename?: string;
}

export interface SetOperationExportResult {
    task_id: string;
    filename: string;
    format: SetOperationExportFormat;
}

export interface SetOperationGenerateResult {
    sql: string;
    estimated_rows?: number;
    warnings?: string[];
    errors?: string[];
}

export interface SetOperationPreviewResult {
    data: Record<string, unknown>[];
    row_count: number;
    estimated_total_rows?: number;
    sql: string;
    warnings?: string[];
    errors?: string[];
}

/**
 * POST /api/set-operations/generate — 生成集合运算 SQL（不含 LIMIT）
 */
export async function generateSetOperation(
    payload: SetOperationRequestPayload
): Promise<SetOperationGenerateResult> {
    try {
        const response = await apiClient.post('/api/set-operations/generate', {
            ...payload,
            preview: false,
            include_metadata: payload.include_metadata ?? true,
        });
        const normalized = normalizeResponse<SetOperationGenerateResult>(response);
        return normalized.data;
    } catch (error) {
        throw handleApiError(error as never, '集合运算 SQL 生成失败');
    }
}

/**
 * POST /api/set-operations/preview — 预览（LIMIT 与后端 max_query_rows 一致）
 */
export async function previewSetOperation(
    payload: SetOperationRequestPayload
): Promise<SetOperationPreviewResult> {
    try {
        const response = await apiClient.post('/api/set-operations/preview', {
            ...payload,
            preview: true,
            include_metadata: false,
        });
        const normalized = normalizeResponse<SetOperationPreviewResult>(response);
        return normalized.data;
    } catch (error) {
        throw handleApiError(error as never, '集合运算预览失败');
    }
}

/**
 * POST /api/set-operations/validate — 服务端校验表与列兼容性
 */
export async function validateSetOperation(
    payload: SetOperationRequestPayload
): Promise<SetOperationValidateResult> {
    try {
        const response = await apiClient.post('/api/set-operations/validate', {
            ...payload,
            preview: false,
            include_metadata: false,
        });
        const normalized = normalizeResponse<SetOperationValidateResult>(response);
        return normalized.data;
    } catch (error) {
        throw handleApiError(error as never, '集合运算配置校验失败');
    }
}

/**
 * POST /api/set-operations/execute — 完整执行或保存为 DuckDB 表
 */
export async function executeSetOperation(
    payload: SetOperationRequestPayload
): Promise<SetOperationExecuteResult> {
    try {
        const response = await apiClient.post('/api/set-operations/execute', payload);
        const normalized = normalizeResponse<SetOperationExecuteResult>(response);
        return normalized.data;
    } catch (error) {
        throw handleApiError(error as never, '集合运算执行失败');
    }
}

/**
 * POST /api/set-operations/simple-union — 按表名列表生成 UNION SQL
 */
export async function simpleUnionSetOperation(
    payload: SimpleUnionSetOperationPayload
): Promise<SimpleUnionSetOperationResult> {
    try {
        const response = await apiClient.post('/api/set-operations/simple-union', {
            operation_type: 'UNION',
            use_by_name: false,
            ...payload,
        });
        const normalized = normalizeResponse<SimpleUnionSetOperationResult>(response);
        return normalized.data;
    } catch (error) {
        throw handleApiError(error as never, '简化 UNION 生成失败');
    }
}

/**
 * POST /api/set-operations/export — 创建异步导出任务
 */
export async function exportSetOperation(
    payload: SetOperationExportPayload
): Promise<SetOperationExportResult> {
    try {
        const response = await apiClient.post('/api/set-operations/export', payload);
        const normalized = normalizeResponse<SetOperationExportResult>(response);
        return normalized.data;
    } catch (error) {
        throw handleApiError(error as never, '集合运算导出任务创建失败');
    }
}
