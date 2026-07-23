/**
 * Query API Module
 *
 * Functions for executing SQL queries across different data sources.
 *
 * Updated to use normalizeResponse for standard API response handling.
 */

import { normalizeMysqlDoubleQuotedStringsForDuckdb } from '@/utils/mysqlStringQuotesForDuckdb';
import { IS_DEMO } from '@/demo/isDemo';
import { apiClient, handleApiError, getFederatedQueryTimeout, normalizeResponse, extractMessage, extractMessageCode } from './client';
import type {
    QueryResponse,
    DataSource,
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

export interface AttachDatabasePayload {
    alias: string;
    connection_id: string;
}

/**
 * camelCase 内部状态 -> snake_case 请求体。接受最小结构类型，对仓库里
 * 现存的几份 AttachDatabase 接口（sqlUtils.ts / queryWorkspace.ts /
 * AsyncTaskDialog.tsx 本地版本）都是结构兼容的合法实参。
 */
export function toAttachDatabasesPayload(
    attachDatabases?: Array<{ alias: string; connectionId: string }> | null
): AttachDatabasePayload[] | undefined {
    if (!attachDatabases || attachDatabases.length === 0) return undefined;
    return attachDatabases.map((db) => ({ alias: db.alias, connection_id: db.connectionId }));
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

    // Demo:浏览器内 DuckDB-Wasm 执行(IS_DEMO=false 时本分支连同 import 被编译期剥离)
    if (IS_DEMO) {
        const { runWasm } = await import('@/demo/wasmEngine');
        return runWasm(sql);
    }

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

    // Demo:联邦查询(连 MySQL/PG)在浏览器内不可用;入口已被 DemoLock 锁住,这里兜底
    if (IS_DEMO) {
        const { demoFederatedUnsupported } = await import('@/demo/wasmEngine');
        throw demoFederatedUnsupported();
    }

    try {
        const normalizedSql = normalizeMysqlDoubleQuotedStringsForDuckdb(sql);

        const requestBody: Record<string, unknown> = {
            sql: normalizedSql,
            is_preview: isPreview,
        };

        const attachPayload = toAttachDatabasesPayload(attachDatabases);
        if (attachPayload) {
            requestBody.attach_databases = attachPayload;
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
    const respData = error.response?.data;
    const code = extractMessageCode(respData) || error.code;
    const rawMessage = (respData as Record<string, unknown> | undefined)?.message;
    const detailStr =
        extractMessage(respData) ||
        (typeof rawMessage === 'string' ? rawMessage : '') ||
        error.message ||
        '';

    if (code === 'DATABASE_CONNECTION_ERROR' || code === 'RESOURCE_NOT_FOUND') {
        return {
            type: 'connection',
            message: detailStr || '数据库连接失败',
        };
    }

    if (code === 'VALIDATION_ERROR') {
        return {
            type: 'query',
            message: detailStr || '请求参数无效',
        };
    }

    // ATTACH error (legacy message fallback)
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
    queryData: Record<string, unknown>[] | null = null,
    attachDatabases?: { alias: string; connection_id: string }[],
    applyRowLimit: boolean = false
): Promise<{ success: boolean; table_name?: string; message?: string; messageCode?: string }> {
    try {
        const requestData: Record<string, unknown> = {
            sql,
            datasource,
            table_alias: tableAlias,
            // 行数范围:false(默认)=全量落表,逐字执行尊重用户 LIMIT;true=缺则补 max_query_rows
            apply_row_limit: applyRowLimit,
        };

        if (queryData && queryData.length > 0) {
            requestData.query_data = queryData;
        }

        if (attachDatabases && attachDatabases.length > 0) {
            requestData.attach_databases = attachDatabases;
        }

        const response = await apiClient.post('/api/save_query_to_duckdb', requestData);
        // normalizeResponse 成功返回说明 API 成功，失败会抛出异常
        const normalized = normalizeResponse<{ table_name?: string }>(response);

        return {
            success: true,
            table_name: normalized.data?.table_name,
            message: normalized.message,
            messageCode: normalized.messageCode,
        };
    } catch (error) {
        // 失败情况由调用方处理异常
        throw error;
    }
}

/**
 * 取消同步查询（与 X-Request-ID 对应，后端使用 sync:{requestId}）
 */
export async function cancelSyncQuery(requestId: string): Promise<void> {
    try {
        await apiClient.post(`/api/query/cancel/${requestId}`);
    } catch (error) {
        throw handleApiError(error as never, '取消查询失败');
    }
}

