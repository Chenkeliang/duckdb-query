/**
 * Visual Query & SQL Favorites API Module
 *
 * Functions for visual query builder and SQL bookmark management.
 *
 * Updated to use normalizeResponse for standard API response handling.
 */

import { apiClient, handleApiError, normalizeResponse } from './client';
import type {
    VisualQueryConfig,
    SqlFavorite,
    CreateFavoriteRequest,
    QueryResponse,
    NormalizedResponse
} from './types';

// ==================== Visual Query Builder ====================

/**
 * Generate SQL from visual query configuration
 *
 * Returns normalized response with generated SQL
 */
export async function generateVisualQuery(
    config: VisualQueryConfig,
    options: { datasource?: string } = {}
): Promise<{
    success: boolean;
    sql: string;
    messageCode?: string;
    message?: string;
}> {
    const payload = extractVisualQueryPayload(config, options);

    try {
        const response = await apiClient.post('/api/visual-query/generate', payload);
        const normalized = normalizeResponse<{ sql: string }>(response);

        return {
            success: true,
            sql: normalized.data.sql,
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, 'SQL生成失败');
    }
}

/**
 * Preview visual query results
 *
 * Returns normalized QueryResponse
 */
export async function previewVisualQuery(
    config: VisualQueryConfig,
    limit = 10,
    options: { datasource?: string } = {}
): Promise<QueryResponse> {
    const payload = extractVisualQueryPayload(config, options);

    try {
        const response = await apiClient.post('/api/visual-query/preview', {
            ...payload,
            limit,
        });
        const normalized = normalizeResponse<QueryResponse>(response);

        return {
            ...normalized.data,
            success: true,
        };
    } catch (error) {
        throw handleApiError(error as never, '查询预览失败');
    }
}

/**
 * Validate visual query configuration
 */
export async function validateVisualQueryConfig(
    config: VisualQueryConfig
): Promise<{
    valid: boolean;
    errors?: string[];
    warnings?: string[];
}> {
    // Client-side validation
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!config.tables || config.tables.length === 0) {
        errors.push('至少需要选择一个表');
    }

    if (!config.columns || config.columns.length === 0) {
        warnings.push('未选择任何列，将使用 SELECT *');
    }

    // Check for missing join conditions
    if (config.tables && config.tables.length > 1) {
        if (!config.joins || config.joins.length < config.tables.length - 1) {
            errors.push('多表查询需要指定 JOIN 条件');
        }
    }

    return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
    };
}

/**
 * Extract payload from visual query config
 */
function extractVisualQueryPayload(
    configOrPayload: VisualQueryConfig | Record<string, unknown>,
    options: { datasource?: string } = {}
): Record<string, unknown> {
    const config = configOrPayload as VisualQueryConfig;

    return {
        tables: config.tables,
        joins: config.joins || [],
        columns: config.columns || [],
        filters: config.filters || [],
        group_by: config.groupBy || [],
        order_by: config.orderBy || [],
        limit: config.limit,
        datasource: options.datasource,
    };
}

// ==================== SQL Favorites (Bookmarks) ====================

/**
 * List all SQL favorites
 *
 * Returns array of SqlFavorite from normalized list response
 */
export async function listSqlFavorites(): Promise<SqlFavorite[]> {
    try {
        const response = await apiClient.get('/api/sql-favorites');
        const normalized = normalizeResponse<{ items?: SqlFavorite[] } | SqlFavorite[]>(response);

        // Handle both list format (items array) and direct array
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

/**
 * Get a single SQL favorite
 *
 * Returns SqlFavorite from normalized response
 */
export async function getSqlFavorite(id: string): Promise<SqlFavorite> {
    try {
        const response = await apiClient.get(`/api/sql-favorites/${id}`);
        const normalized = normalizeResponse<{ favorite?: SqlFavorite } | SqlFavorite>(response);

        const data = normalized.data;
        return (data as { favorite?: SqlFavorite })?.favorite ?? data as SqlFavorite;
    } catch (error) {
        throw handleApiError(error as never, '获取收藏详情失败');
    }
}

/**
 * Create a new SQL favorite
 *
 * Returns normalized response with created favorite
 */
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

/**
 * Update a SQL favorite
 *
 * Returns normalized response with updated favorite
 */
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

/**
 * Delete a SQL favorite
 *
 * Returns normalized response
 */
export async function deleteSqlFavorite(id: string): Promise<NormalizedResponse<Record<string, unknown>>> {
    try {
        const response = await apiClient.delete(`/api/sql-favorites/${id}`);
        return normalizeResponse(response);
    } catch (error) {
        throw handleApiError(error as never, '删除收藏失败');
    }
}

/**
 * Increment favorite usage count
 *
 * Returns normalized response (silent failure for usage tracking)
 */
export async function incrementFavoriteUsage(id: string): Promise<NormalizedResponse<Record<string, unknown>> | { data: Record<string, unknown>; messageCode: string; message: string; timestamp: string; raw: unknown }> {
    try {
        const response = await apiClient.post(`/api/sql-favorites/${id}/use`);
        return normalizeResponse(response);
    } catch {
        // Silent failure for usage tracking
        return {
            data: {},
            messageCode: 'OPERATION_FAILED',
            message: '',
            timestamp: new Date().toISOString(),
            raw: null,
        };
    }
}

// ==================== App Features ====================

/**
 * App config response from /api/app-config/features
 */
export interface AppConfigResponse {
    enable_pivot_tables: boolean;
    pivot_table_extension: string;
    max_query_rows: number;
    max_file_size: number;
    max_file_size_display: string;
    federated_query_timeout?: number;
}

/**
 * Get application configuration from /api/app-config/features
 *
 * Returns normalized response with config data
 */
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

/**
 * Get application features configuration
 *
 * Returns normalized response with features
 */
export async function getAppFeatures(): Promise<{
    features: Record<string, boolean | string | number>;
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.get('/api/features');
        const normalized = normalizeResponse<{ features: Record<string, boolean | string | number> }>(response);

        return {
            features: normalized.data.features ?? {},
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, '获取应用配置失败');
    }
}
