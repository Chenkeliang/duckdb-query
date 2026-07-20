/**
 * 透视查询 + SQL 收藏 + 应用配置（`POST /api/pivot-query/*` 等）
 */

import { apiClient, handleApiError, normalizeResponse } from './client';
import type {
    SqlFavorite,
    CreateFavoriteRequest,
    NormalizedResponse,
} from './types';
import type {
    PivotQueryConfig,
    PivotConfig,
    PivotQueryPreviewPayload,
    GeneratedPivotQuery,
} from '../types/pivotQuery';
import { PivotQueryMode } from '../types/pivotQuery';

export interface PivotQueryApiOptions {
    attachDatabases?: { alias: string; connection_id: string }[];
}

export async function generatePivotQuery(
    config: PivotQueryConfig,
    pivotConfig: PivotConfig,
    options: PivotQueryApiOptions = {}
): Promise<GeneratedPivotQuery> {
    try {
        const response = await apiClient.post('/api/pivot-query/generate', {
            config,
            pivot_config: pivotConfig,
            attach_databases: options.attachDatabases,
        });
        const normalized = normalizeResponse<{
            sql: string;
            base_sql: string;
            pivot_sql?: string | null;
            warnings?: string[];
            metadata?: Record<string, unknown>;
        }>(response);
        const d = normalized.data;
        return {
            mode: PivotQueryMode.PIVOT,
            base_sql: d.base_sql,
            final_sql: d.sql,
            pivot_sql: d.pivot_sql ?? undefined,
            warnings: d.warnings ?? [],
            metadata: (d.metadata as Record<string, unknown>) || {},
        };
    } catch (error) {
        throw handleApiError(error as never, '透视 SQL 生成失败');
    }
}

export async function previewPivotQuery(
    config: PivotQueryConfig,
    pivotConfig: PivotConfig,
    limit: number,
    options: PivotQueryApiOptions = {}
): Promise<PivotQueryPreviewPayload> {
    try {
        const response = await apiClient.post('/api/pivot-query/preview', {
            config,
            pivot_config: pivotConfig,
            limit,
            attach_databases: options.attachDatabases,
        });
        const normalized = normalizeResponse<PivotQueryPreviewPayload>(response);
        const body = normalized.data;
        if (body.returned_rows == null && Array.isArray(body.data)) {
            return { ...body, returned_rows: body.data.length };
        }
        return body;
    } catch (error) {
        throw handleApiError(error as never, '透视预览失败');
    }
}

// ==================== SQL Favorites ====================

export async function listSqlFavorites(): Promise<SqlFavorite[]> {
    try {
        const response = await apiClient.get('/api/sql-favorites');
        const normalized = normalizeResponse<{ items?: SqlFavorite[] } | SqlFavorite[]>(response);
        const data = normalized.data;
        if (normalized.items) {
            return normalized.items as SqlFavorite[];
        }
        if (Array.isArray(data)) {
            return data;
        }
        if (data && typeof data === 'object' && 'items' in data) {
            return (data as { items: SqlFavorite[] }).items;
        }
        return [];
    } catch (error) {
        throw handleApiError(error as never, '获取收藏列表失败');
    }
}

export async function getSqlFavorite(id: string): Promise<SqlFavorite> {
    try {
        const response = await apiClient.get(`/api/sql-favorites/${id}`);
        const normalized = normalizeResponse<{ favorite?: SqlFavorite } | SqlFavorite>(response);
        const data = normalized.data;
        return (data as { favorite?: SqlFavorite })?.favorite ?? (data as SqlFavorite);
    } catch (error) {
        throw handleApiError(error as never, '获取收藏详情失败');
    }
}

export async function createSqlFavorite(
    data: CreateFavoriteRequest
): Promise<NormalizedResponse<{ favorite?: SqlFavorite }>> {
    try {
        const response = await apiClient.post('/api/sql-favorites', data);
        return normalizeResponse<{ favorite?: SqlFavorite }>(response);
    } catch (error) {
        throw handleApiError(error as never, '创建收藏失败');
    }
}

export async function updateSqlFavorite(
    id: string,
    data: Partial<CreateFavoriteRequest>
): Promise<NormalizedResponse<{ favorite?: SqlFavorite }>> {
    try {
        const response = await apiClient.put(`/api/sql-favorites/${id}`, data);
        return normalizeResponse<{ favorite?: SqlFavorite }>(response);
    } catch (error) {
        throw handleApiError(error as never, '更新收藏失败');
    }
}

export async function deleteSqlFavorite(id: string): Promise<NormalizedResponse<Record<string, unknown>>> {
    try {
        const response = await apiClient.delete(`/api/sql-favorites/${id}`);
        return normalizeResponse(response);
    } catch (error) {
        throw handleApiError(error as never, '删除收藏失败');
    }
}

export async function incrementFavoriteUsage(id: string): Promise<NormalizedResponse<Record<string, unknown>>> {
    try {
        const response = await apiClient.post(`/api/sql-favorites/${id}/use`);
        return normalizeResponse(response);
    } catch {
        return {
            data: {},
            messageCode: 'OPERATION_FAILED',
            message: '',
            timestamp: new Date().toISOString(),
            raw: null,
        };
    }
}

export interface AppConfigResponse {
    enable_pivot_tables: boolean;
    pivot_table_extension: string;
    max_query_rows: number;
    pivot_max_columns?: number;
    max_file_size: number;
    max_file_size_display: string;
    federated_query_timeout?: number;
    json_import_column_type?: string;
    remote_storage_configured?: boolean;
}

export async function getAppConfig(): Promise<{
    config: AppConfigResponse;
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.get('/api/app-config/features');
        const normalized = normalizeResponse<AppConfigResponse>(response);
        return {
            config: normalized.data,
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, 'Failed to get app config');
    }
}

// ==================== 列 cast 数据感知推断 ====================

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
    const response = await apiClient.post('/api/columns/infer-cast', payload);
    return normalizeResponse<InferCastResult>(response).data;
}
