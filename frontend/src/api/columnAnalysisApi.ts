/**
 * 列 cast 数据感知推断（`POST /api/columns/infer-cast`）。
 *
 * 独立于 pivotQueryApi:该能力同时服务透视文本聚合与 JOIN 类型冲突,不属于任一业务。
 */

import { apiClient, handleApiError, normalizeResponse } from './client';

/** 不安全原因:null(安全)| empty | non_numeric | binary_float | scientific | overflow */
export type InferCastReason =
    | null
    | 'empty'
    | 'non_numeric'
    | 'binary_float'
    | 'scientific'
    | 'overflow';

export interface InferCastResult {
    /** 安全推荐:'BIGINT' | 'DECIMAL(38,s)' | null(不安全时为 null) */
    recommended: string | null;
    total: number;
    numeric: number;
    non_numeric: number;
    max_int_digits: number;
    max_frac_digits: number;
    /** 是否可【安全自动推荐】DECIMAL/BIGINT(recommended 非 null 时恒 true)。
     *  注意语义是"能否安全自动量化",非"数学上能否放进 DECIMAL(38)":二进制浮点源即便数值
     *  能进 DECIMAL 也为 false(量化有损)。 */
    safe_decimal_cast: boolean;
    /** 为何不安全,供 UI 精准提示;安全时为 null */
    reason: InferCastReason;
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
