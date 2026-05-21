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
    include_metadata?: boolean;
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
