/**
 * Query API Module
 *
 * Functions for executing SQL queries across different data sources.
 *
 * Updated to use normalizeResponse for standard API response handling.
 */

import { apiClient, handleApiError, getFederatedQueryTimeout, normalizeResponse } from './client';
import type {
    QueryRequest,
    QueryResponse,
    DataSource,
    NormalizedResponse
} from './types';

// ==================== Types ====================

export interface ExecuteQueryOptions {
    sql: string;
    saveAsTable?: string;
    isPreview?: boolean;
    requestId?: string;
    signal?: AbortSignal;
}

export interface FederatedQueryOptions extends ExecuteQueryOptions {
    attachDatabases?: Array<{
        alias: string;
        connectionId: string;
    }>;
    timeout?: number;
}

export interface FederatedQueryError extends Error {
    type: 'connection' | 'authentication' | 'timeout' | 'network' | 'query';
    connectionId?: string;
    connectionName?: string;
    host?: string;
    originalError?: Error;
}

// ==================== DuckDB Query ====================

/**
 * Execute SQL on local DuckDB instance
 *
 * Supports two calling patterns for backwards compatibility:
 * - executeDuckDBSQL("SELECT * FROM table")  // legacy
 * - executeDuckDBSQL({ sql: "SELECT * FROM table", isPreview: true })  // new
 *
 * Returns normalized QueryResponse with messageCode
 */
export async function executeDuckDBSQL(
    sqlOrOptions: string | ExecuteQueryOptions,
    legacyOptions?: { requestId?: string; signal?: AbortSignal }
): Promise<QueryResponse> {
    // Normalize to options object
    const options: ExecuteQueryOptions = typeof sqlOrOptions === 'string'
        ? { sql: sqlOrOptions, ...legacyOptions }
        : sqlOrOptions;

    const { sql, saveAsTable = null, isPreview = true, requestId, signal } = options;

    try {
        const config: Record<string, unknown> = {};

        if (requestId) {
            config.headers = { 'X-Request-ID': requestId };
        }

        if (signal) {
            config.signal = signal;
        }

        const response = await apiClient.post('/api/duckdb/execute', {
            sql,
            save_as_table: saveAsTable,
            is_preview: isPreview
        }, config);

        // Use normalizeResponse but preserve QueryResponse structure
        const normalized = normalizeResponse<QueryResponse>(response);
        const data = normalized.data;

        // Return QueryResponse with additional messageCode info
        return {
            ...data,
            success: true,
        };
    } catch (error) {
        if ((error as Error).name === 'CanceledError' || (error as Error).name === 'AbortError') {
            throw error;
        }
        throw handleApiError(error as never, '查询执行失败');
    }
}

/**
 * Execute federated query with external database attach
 *
 * Returns normalized QueryResponse with messageCode
 */
export async function executeFederatedQuery(options: FederatedQueryOptions): Promise<QueryResponse> {
    const {
        sql,
        attachDatabases,
        isPreview = true,
        saveAsTable = null,
        timeout = getFederatedQueryTimeout(),
        requestId,
        signal,
    } = options;

    try {
        const requestBody: Record<string, unknown> = {
            sql,
            is_preview: isPreview,
        };

        if (attachDatabases && attachDatabases.length > 0) {
            requestBody.attach_databases = attachDatabases.map(db => ({
                alias: db.alias,
                connection_id: db.connectionId,
            }));
        }

        if (saveAsTable) {
            requestBody.save_as_table = saveAsTable;
        }

        const config: Record<string, unknown> = { timeout };

        if (requestId) {
            config.headers = { 'X-Request-ID': requestId };
        }

        if (signal) {
            config.signal = signal;
        }

        const response = await apiClient.post('/api/duckdb/federated-query', requestBody, config);
        const normalized = normalizeResponse<QueryResponse>(response);

        return {
            ...normalized.data,
            success: true,
        };
    } catch (error) {
        const parsedError = parseFederatedQueryError(error as Error);
        const enhancedError = new Error(parsedError.message) as FederatedQueryError;
        enhancedError.type = parsedError.type;
        enhancedError.connectionId = parsedError.connectionId;
        enhancedError.connectionName = parsedError.connectionName;
        enhancedError.host = parsedError.host;
        enhancedError.originalError = error as Error;
        throw enhancedError;
    }
}

/**
 * Parse federated query error for better error messages
 */
export function parseFederatedQueryError(error: Error & { response?: { data?: unknown }; code?: string }): {
    type: 'connection' | 'authentication' | 'timeout' | 'network' | 'query';
    message: string;
    connectionId?: string;
    connectionName?: string;
    host?: string;
} {
    const detail = (error.response?.data as Record<string, unknown>)?.detail ||
        (error.response?.data as Record<string, unknown>)?.message ||
        error.message || '';
    const detailStr = typeof detail === 'string' ? detail : JSON.stringify(detail);

    // ATTACH error
    if (detailStr.includes('ATTACH') || detailStr.includes('attach')) {
        const match = detailStr.match(/ATTACH.*?['"]([^'"]+)['"]/i);
        return {
            type: 'connection',
            message: '数据库连接失败',
            connectionName: match?.[1],
        };
    }

    // Authentication error
    if (detailStr.includes('authentication') || detailStr.includes('password') ||
        detailStr.includes('Access denied') || detailStr.includes('认证')) {
        return {
            type: 'authentication',
            message: '数据库认证失败，请检查用户名和密码',
        };
    }

    // Timeout error
    if (detailStr.includes('timeout') || detailStr.includes('超时') ||
        error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        const hostMatch = detailStr.match(/(?:host|主机)[:\s]*['"]?([^'":\s]+)/i);
        return {
            type: 'timeout',
            message: '连接超时，请检查网络或数据库状态',
            host: hostMatch?.[1],
        };
    }

    // Network error
    if (detailStr.includes('ECONNREFUSED') || detailStr.includes('network') ||
        detailStr.includes('无法连接') || error.code === 'ERR_NETWORK') {
        return {
            type: 'network',
            message: '网络连接失败，请检查数据库服务是否可用',
        };
    }

    // Default query error
    return {
        type: 'query',
        message: detailStr || '查询执行失败',
    };
}

// ==================== External Database Query ====================

/**
 * Execute SQL on external database (MySQL/PostgreSQL)
 *
 * Returns normalized QueryResponse
 */
export async function executeExternalSQL(
    sql: string,
    datasource: DataSource,
    isPreview = true
): Promise<QueryResponse> {
    try {
        const normalizedDatasource = {
            ...datasource,
            id: datasource.id?.replace(/^db_/, '') || datasource.id,
        };

        const response = await apiClient.post('/api/execute_sql', {
            sql,
            datasource: normalizedDatasource,
            is_preview: isPreview
        });

        const normalized = normalizeResponse<QueryResponse>(response);
        return {
            ...normalized.data,
            success: true,
        };
    } catch (error) {
        throw handleApiError(error as never, '外部数据库查询执行失败');
    }
}

/**
 * Execute general SQL query
 *
 * Returns normalized QueryResponse
 */
export async function executeSQL(
    sql: string,
    datasource: DataSource,
    isPreview = true
): Promise<QueryResponse> {
    try {
        const response = await apiClient.post('/api/execute_sql', {
            sql,
            datasource,
            is_preview: isPreview
        });

        const normalized = normalizeResponse<QueryResponse>(response);
        return {
            ...normalized.data,
            success: true,
        };
    } catch (error) {
        throw error;
    }
}

/**
 * Perform query using proxy endpoint
 *
 * Returns normalized QueryResponse
 */
export async function performQuery(queryRequest: QueryRequest): Promise<QueryResponse> {
    try {
        const response = await apiClient.post('/api/query', queryRequest);
        const normalized = normalizeResponse<QueryResponse>(response);
        return {
            ...normalized.data,
            success: true,
        };
    } catch (error) {
        throw handleApiError(error as never, '查询执行失败');
    }
}

// ==================== Query Result Operations ====================

/**
 * Save query result as a new table in DuckDB
 *
 * Returns normalized response with table_name
 */
export async function saveQueryToDuckDB(
    sql: string,
    datasource: DataSource,
    tableAlias: string,
    queryData: Record<string, unknown>[] | null = null
): Promise<{ success: boolean; table_name?: string; message?: string; messageCode?: string }> {
    try {
        const requestData: Record<string, unknown> = {
            sql,
            datasource,
            table_alias: tableAlias
        };

        if (queryData && queryData.length > 0) {
            requestData.query_data = queryData;
        }

        const response = await apiClient.post('/api/save_query_to_duckdb', requestData);
        const normalized = normalizeResponse<{ success?: boolean; table_name?: string }>(response);

        const success = normalized.data?.success ?? (normalized as { success?: boolean }).success ?? true;

        return {
            success,
            table_name: normalized.data.table_name,
            message: normalized.message,
            messageCode: normalized.messageCode,
        };
    } catch (error) {
        throw error;
    }
}

/**
 * Save query result as a named datasource
 *
 * Returns normalized response
 */
export async function saveQueryResultAsDatasource(
    sql: string,
    datasourceName: string,
    originalDatasource: DataSource
): Promise<NormalizedResponse<Record<string, unknown>>> {
    try {
        const response = await apiClient.post('/api/save_query_result_as_datasource', {
            sql,
            datasource_name: datasourceName,
            datasource: originalDatasource
        });
        return normalizeResponse(response);
    } catch (error) {
        throw error;
    }
}
