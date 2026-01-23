/**
 * Data Source API Module
 *
 * Functions for managing database connections and data sources.
 *
 * Updated to use normalizeResponse for standard API response handling.
 */

import { apiClient, normalizeResponse, extractMessage, extractMessageCode } from './client';
import type {
    DatabaseConnection,
    DatabaseConnectionParams,
    ConnectionTestResult,
    NormalizedResponse
} from './types';

// ==================== Types ====================

export type DatabaseType = 'mysql' | 'postgresql' | 'sqlite';

export interface CreateConnectionRequest {
    id?: string;
    type: DatabaseType;
    name: string;
    params: DatabaseConnectionParams;
}

export interface UpdateConnectionRequest {
    name?: string;
    params?: Partial<DatabaseConnectionParams>;
}

export interface DataSourceFilter {
    type?: string;
    subtype?: string;
    status?: string;
    search?: string;
}

interface DatasourceItem {
    id: string;
    name: string;
    subtype: string;
    status: string;
    created_at?: string;
    updated_at?: string;
    connection_info?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

// ==================== Helpers ====================

function stripDbPrefix(id: string | undefined): string {
    if (typeof id !== 'string') return id as unknown as string;
    return id.replace(/^db_/, '');
}

function mapDatasourceItemToConnection(item: DatasourceItem): DatabaseConnection | null {
    if (!item) return null;

    const connectionInfo = item.connection_info || {};
    const metadata = item.metadata || {};
    const password = connectionInfo.password as string;
    const requiresPassword = password === '***ENCRYPTED***';

    const username =
        (connectionInfo.username as string) ??
        (connectionInfo.user as string) ??
        (metadata.username as string) ??
        (metadata.user as string);

    return {
        id: stripDbPrefix(item.id),
        name: item.name,
        type: item.subtype as DatabaseType,
        status: item.status as DatabaseConnection['status'],
        created_at: item.created_at,
        updated_at: item.updated_at,
        requiresPassword,
        params: {
            ...metadata,
            ...connectionInfo,
            username,
            user: username,
            ...(requiresPassword ? { password: '' } : {}),
        } as DatabaseConnectionParams,
    };
}

// ==================== Database Connection CRUD ====================

/**
 * List all database connections
 *
 * Returns normalized response with connections array
 */
export async function listDatabaseConnections(): Promise<{
    success: boolean;
    connections: DatabaseConnection[];
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.get('/api/datasources?type=database');
        const normalized = normalizeResponse<{ items?: DatasourceItem[] }>(response);

        // Handle list response format
        const items = (normalized.items ?? normalized.data?.items ?? []) as DatasourceItem[];
        const connections = Array.isArray(items)
            ? items.map(mapDatasourceItemToConnection).filter(Boolean) as DatabaseConnection[]
            : [];

        return {
            success: true,
            connections,
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw error;
    }
}

/**
 * Raw API response item from /api/datasources/databases/list
 */
export interface RawDatabaseDataSourceItem {
    id: string;
    name: string;
    type: string;
    subtype: string;
    status?: string;
    connection_info?: {
        host?: string;
        port?: number;
        database?: string;
        username?: string;
        password?: string;
        schema?: string;
    };
    metadata?: Record<string, unknown>;
    created_at?: string;
}

/**
 * List database data sources using /api/datasources/databases/list endpoint
 *
 * This is a lower-level API that returns raw data source items.
 * Used by useDatabaseConnections hook.
 *
 * Returns normalized response with items array
 */
export async function listDatabaseDataSourcesRaw(subtype?: string): Promise<{
    success: boolean;
    items: RawDatabaseDataSourceItem[];
    total: number;
    messageCode?: string;
    message?: string;
}> {
    try {
        const params = subtype ? `?subtype=${encodeURIComponent(subtype)}` : '';
        const response = await apiClient.get(`/api/datasources/databases/list${params}`);
        const normalized = normalizeResponse<{ items?: RawDatabaseDataSourceItem[]; total?: number }>(response);

        // Handle list response format
        const items = (normalized.items ?? normalized.data?.items ?? []) as RawDatabaseDataSourceItem[];
        const total = normalized.total ?? normalized.data?.total ?? items.length;

        return {
            success: true,
            items,
            total,
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw error;
    }
}

/**
 * Get a single database connection by ID
 *
 * Returns DatabaseConnection from normalized response
 */
export async function getDatabaseConnection(connectionId: string): Promise<DatabaseConnection> {
    try {
        const id = connectionId.startsWith('db_') ? connectionId : `db_${connectionId}`;
        const response = await apiClient.get(`/api/datasources/${id}`);
        const normalized = normalizeResponse<{ connection?: DatabaseConnection } | DatabaseConnection>(response);

        const data = normalized.data;
        return (data as { connection?: DatabaseConnection })?.connection ?? data as DatabaseConnection;
    } catch (error) {
        throw error;
    }
}

/**
 * Create a new database connection
 *
 * Returns normalized response with created connection
 */
export async function createDatabaseConnection(
    connectionData: CreateConnectionRequest,
    options?: { test?: boolean }
): Promise<NormalizedResponse<{ connection?: DatabaseConnection }>> {
    try {
        const url = options?.test === false
            ? '/api/datasources/databases?test_connection=false'
            : '/api/datasources/databases';
        const response = await apiClient.post(url, connectionData);
        return normalizeResponse<{ connection?: DatabaseConnection }>(response);
    } catch (error) {
        throw error;
    }
}

/**
 * Update an existing database connection
 *
 * Returns normalized response with updated connection
 */
export async function updateDatabaseConnection(
    connectionId: string,
    connectionData: UpdateConnectionRequest,
    options?: { test?: boolean }
): Promise<NormalizedResponse<{ connection?: DatabaseConnection }>> {
    try {
        const url = options?.test === false
            ? `/api/datasources/databases/${connectionId}?test_connection=false`
            : `/api/datasources/databases/${connectionId}`;
        const response = await apiClient.put(url, connectionData);
        return normalizeResponse<{ connection?: DatabaseConnection }>(response);
    } catch (error) {
        throw error;
    }
}

/**
 * Delete a database connection
 *
 * Returns normalized response
 */
export async function deleteDatabaseConnection(connectionId: string): Promise<NormalizedResponse<Record<string, unknown>>> {
    try {
        const id = connectionId.startsWith('db_') ? connectionId : `db_${connectionId}`;
        const response = await apiClient.delete(`/api/datasources/${id}`);
        return normalizeResponse(response);
    } catch (error) {
        throw error;
    }
}

// ==================== Connection Testing ====================

/**
 * Test a new database connection (before saving)
 *
 * Returns ConnectionTestResult from normalized response
 */
export async function testDatabaseConnection(
    connectionData: CreateConnectionRequest
): Promise<ConnectionTestResult> {
    try {
        const payload = {
            ...connectionData,
            id: connectionData.id ? connectionData.id.replace(/^db_/, '') : undefined
        };
        const response = await apiClient.post('/api/datasources/databases/test', payload);
        const normalized = normalizeResponse<{ connection_test?: ConnectionTestResult }>(response);

        const data = normalized.data;
        const connectionTest = data?.connection_test;
        const message = connectionTest?.message || normalized.message;
        const messageCode = connectionTest?.messageCode || normalized.messageCode;
        const latencyMs = typeof connectionTest?.latency_ms === 'number'
            ? connectionTest.latency_ms
            : typeof connectionTest?.details?.latency_ms === 'number'
                ? connectionTest.details.latency_ms
                : undefined;

        return {
            success: connectionTest?.success === true,
            message,
            messageCode,
            latency_ms: latencyMs,
            details: connectionTest,
        };
    } catch (error) {
        throw error;
    }
}

/**
 * Test connection (unified entry - handles both new and saved connections)
 *
 * Returns ConnectionTestResult
 */
export async function testConnection(
    connectionData: { id?: string } & Partial<CreateConnectionRequest>
): Promise<ConnectionTestResult> {
    try {
        let response;

        // Unified test logic: always use /test endpoint
        // If ID is provided, backend will handle password inheritance
        const payload = {
            ...connectionData,
            id: connectionData.id ? connectionData.id.replace(/^db_/, '') : undefined
        };
        response = await apiClient.post('/api/datasources/databases/test', payload);

        const normalized = normalizeResponse<{ connection_test?: ConnectionTestResult }>(response);
        const data = normalized.data;
        const connectionTest = data?.connection_test;

        if (connectionTest) {
            return {
                success: connectionTest.success === true,
                message: connectionTest.message || (connectionTest.success ? '连接成功' : '连接失败'),
                details: connectionTest,
            };
        }

        return {
            success: true,
            message: normalized.message || '连接成功',
            details: data,
        };
    } catch (error) {
        return {
            success: false,
            message: (error as Error).message || '连接测试失败',
        };
    }
}

/**
 * Refresh a saved database connection
 *
 * Returns normalized response with refresh result
 */
export async function refreshDatabaseConnection(connectionId: string): Promise<{
    success: boolean;
    message?: string;
    connection?: DatabaseConnection;
    test_result?: ConnectionTestResult;
    messageCode?: string;
}> {
    try {
        const response = await apiClient.post(`/api/datasources/databases/${connectionId}/refresh`);
        const normalized = normalizeResponse<{
            refresh_success?: boolean;
            connection?: DatabaseConnection;
            test_result?: ConnectionTestResult;
        }>(response);

        const data = normalized.data;
        const refreshSuccess = typeof data?.refresh_success === 'boolean'
            ? data.refresh_success
            : data?.test_result?.success === true;

        return {
            success: refreshSuccess === true,
            message: normalized.message || data?.test_result?.message,
            connection: data?.connection,
            test_result: data?.test_result,
            messageCode: normalized.messageCode,
        };
    } catch (error) {
        throw error;
    }
}

// ==================== Data Source Listing ====================

/**
 * List all data sources (files and databases)
 *
 * Returns normalized response
 */
export async function listAllDataSources(filters: DataSourceFilter = {}): Promise<NormalizedResponse<{ items?: unknown[]; total?: number }>> {
    try {
        const params = new URLSearchParams();
        if (filters.type) params.append('type', filters.type);
        if (filters.subtype) params.append('subtype', filters.subtype);
        if (filters.status) params.append('status', filters.status);
        if (filters.search) params.append('search', filters.search);

        const url = `/api/datasources${params.toString() ? '?' + params.toString() : ''}`;
        const response = await apiClient.get(url);
        return normalizeResponse(response);
    } catch (error) {
        throw error;
    }
}

/**
 * List database data sources only
 *
 * Returns normalized response
 */
export async function listDatabaseDataSources(filters: Omit<DataSourceFilter, 'type'> = {}): Promise<NormalizedResponse<{ items?: unknown[]; total?: number }>> {
    try {
        const params = new URLSearchParams();
        if (filters.subtype) params.append('subtype', filters.subtype);
        if (filters.status) params.append('status', filters.status);

        const url = `/api/datasources/databases/list${params.toString() ? '?' + params.toString() : ''}`;
        const response = await apiClient.get(url);
        return normalizeResponse(response);
    } catch (error) {
        throw error;
    }
}

/**
 * List file data sources only
 *
 * Returns normalized response
 */
export async function listFileDataSources(filters: Omit<DataSourceFilter, 'type'> = {}): Promise<NormalizedResponse<{ items?: unknown[]; total?: number }>> {
    try {
        const params = new URLSearchParams();
        if (filters.subtype) params.append('subtype', filters.subtype);
        if (filters.status) params.append('status', filters.status);

        const url = `/api/datasources/files/list${params.toString() ? '?' + params.toString() : ''}`;
        const response = await apiClient.get(url);
        return normalizeResponse(response);
    } catch (error) {
        throw error;
    }
}

// End of file
