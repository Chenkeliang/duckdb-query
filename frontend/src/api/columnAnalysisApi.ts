/**
 * 列 cast 数据感知推断（`POST /api/columns/infer-cast`）。
 *
 * 独立于 pivotQueryApi:该能力同时服务透视文本聚合与 JOIN 类型冲突,不属于任一业务。
 */

import { apiClient, handleApiError, normalizeResponse } from './client';

export interface InferCastResult {
    /** 安全推荐:'BIGINT' | 'DECIMAL(38,s)' | null(有不可转行/超容量时为 null) */
    recommended: string | null;
    total: number;
    numeric: number;
    non_numeric: number;
    max_int_digits: number;
    max_frac_digits: number;
    fits_decimal38: boolean;
}

export interface InferColumnCastPayload {
    table_name: string;
    column: string;
    filters?: unknown[];
    attach_databases?: { alias: string; connection_id: string }[];
}

/** 在(筛选后的)真实数据上推断一列作为数值 cast 目标的安全推荐 + 统计。 */
export async function inferColumnCast(
    payload: InferColumnCastPayload
): Promise<InferCastResult> {
    try {
        const response = await apiClient.post('/api/columns/infer-cast', payload);
        return normalizeResponse<InferCastResult>(response).data;
    } catch (error) {
        throw handleApiError(error as never, 'Failed to infer column cast');
    }
}
