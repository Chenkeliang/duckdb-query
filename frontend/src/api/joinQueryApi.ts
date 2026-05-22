/**
 * Multi-table JOIN API — POST /api/query（join_query.py）
 *
 * Join 工作台当前以本地 SQL + executeFederatedQuery 为主；本模块供结构化 JOIN 请求与测试对齐契约。
 */

import { apiClient, handleApiError, normalizeResponse } from './client';

export interface JoinQueryDataSource {
    id: string;
    type: string;
    name?: string;
    table_name?: string;
    params?: Record<string, unknown>;
    columns?: Record<string, unknown>[];
    sourceType?: string;
}

export interface JoinQueryCondition {
    left_column: string;
    right_column: string;
    operator?: string;
    left_cast?: string;
    right_cast?: string;
}

export interface JoinQueryJoin {
    left_source_id: string;
    right_source_id: string;
    join_type: 'inner' | 'left' | 'right' | 'outer' | 'full_outer' | 'cross' | string;
    conditions: JoinQueryCondition[];
    alias_left?: string;
    alias_right?: string;
}

export interface JoinQueryAttachDatabase {
    alias: string;
    connection_id: string;
}

export interface JoinQueryPerformRequest {
    sources: JoinQueryDataSource[];
    joins: JoinQueryJoin[];
    select_columns?: string[];
    where_conditions?: string;
    order_by?: string;
    limit?: number;
    is_preview?: boolean;
    attach_databases?: JoinQueryAttachDatabase[];
}

export interface JoinQueryPerformResult {
    data: Record<string, unknown>[];
    columns: string[];
    index?: number[];
    sql: string;
    row_count: number;
}

/**
 * POST /api/query — 按 sources/joins 结构执行 JOIN（DuckDB 内表或已注册源）
 */
export async function performJoinQuery(
    payload: JoinQueryPerformRequest,
    options: { requestId?: string } = {}
): Promise<JoinQueryPerformResult> {
    try {
        const headers = options.requestId
            ? { 'X-Request-ID': options.requestId }
            : undefined;
        const response = await apiClient.post(
            '/api/query',
            payload,
            headers ? { headers } : undefined
        );
        const normalized = normalizeResponse<JoinQueryPerformResult>(response);
        return normalized.data;
    } catch (error) {
        throw handleApiError(error as never, 'JOIN 查询执行失败');
    }
}
