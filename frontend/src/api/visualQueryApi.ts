/**
 * Visual Query & SQL Favorites API Module
 *
 * Functions for visual query builder and SQL bookmark management.
 */

import { apiClient, handleApiError } from './client';
import type {
    VisualQueryConfig,
    SqlFavorite,
    CreateFavoriteRequest,
    QueryResponse,
    ApiResponse
} from './types';

// ==================== Visual Query Builder ====================

/**
 * Generate SQL from visual query configuration
 */
export async function generateVisualQuery(
    config: VisualQueryConfig,
    options: { datasource?: string } = {}
): Promise<{
    success: boolean;
    sql: string;
}> {
    const payload = extractVisualQueryPayload(config, options);

    try {
        const response = await apiClient.post('/api/visual-query/generate', payload);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, 'SQL生成失败');
    }
}

/**
 * Preview visual query results
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
        return response.data;
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
 */
export async function listSqlFavorites(): Promise<SqlFavorite[]> {
    try {
        const response = await apiClient.get('/api/sql-favorites');
        const payload = response.data;
        if (payload && Array.isArray(payload.data)) {
            return payload.data as SqlFavorite[];
        }
        if (Array.isArray(payload)) {
            return payload as SqlFavorite[];
        }
        return [];
    } catch (error) {
        throw handleApiError(error as never, '获取收藏列表失败');
    }
}

/**
 * Get a single SQL favorite
 */
export async function getSqlFavorite(id: string): Promise<SqlFavorite> {
    try {
        const response = await apiClient.get(`/api/sql-favorites/${id}`);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '获取收藏详情失败');
    }
}

/**
 * Create a new SQL favorite
 */
export async function createSqlFavorite(
    data: CreateFavoriteRequest
): Promise<ApiResponse<SqlFavorite>> {
    try {
        const response = await apiClient.post('/api/sql-favorites', data);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '创建收藏失败');
    }
}

/**
 * Update a SQL favorite
 */
export async function updateSqlFavorite(
    id: string,
    data: Partial<CreateFavoriteRequest>
): Promise<ApiResponse<SqlFavorite>> {
    try {
        const response = await apiClient.put(`/api/sql-favorites/${id}`, data);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '更新收藏失败');
    }
}

/**
 * Delete a SQL favorite
 */
export async function deleteSqlFavorite(id: string): Promise<ApiResponse> {
    try {
        const response = await apiClient.delete(`/api/sql-favorites/${id}`);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '删除收藏失败');
    }
}

/**
 * Increment favorite usage count
 */
export async function incrementFavoriteUsage(id: string): Promise<ApiResponse> {
    try {
        const response = await apiClient.post(`/api/sql-favorites/${id}/use`);
        return response.data;
    } catch (error) {
        // Silent failure for usage tracking
        return { success: false };
    }
}

// ==================== App Features ====================

/**
 * Get application features configuration
 */
export async function getAppFeatures(): Promise<{
    success: boolean;
    features: Record<string, boolean | string | number>;
}> {
    try {
        const response = await apiClient.get('/api/features');
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '获取应用配置失败');
    }
}
