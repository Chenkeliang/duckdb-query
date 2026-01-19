/**
 * Table API Module
 *
 * Functions for managing DuckDB tables and external database tables.
 *
 * Updated to use normalizeResponse for standard API response handling.
 */

import { apiClient, handleApiError, normalizeResponse } from './client';
import type { TableInfo, TableDetail, NormalizedResponse } from './types';

// ==================== DuckDB Tables ====================

/**
 * Get all DuckDB tables
 *
 * Returns array of TableInfo (legacy endpoint)
 *
 * Backend returns: { success: true, data: { items: [...], total: ... }, messageCode: ... }
 */
export async function getDuckDBTables(): Promise<TableInfo[]> {
    try {
        const response = await apiClient.get('/api/duckdb_tables');
        const normalized = normalizeResponse<{ items?: Array<Record<string, unknown>>; tables?: Array<Record<string, unknown>> }>(response);

        // Handle list response format: { items: [...], total: ... }
        const items = normalized.items || normalized.data?.items || normalized.data?.tables || [];

        if (Array.isArray(items)) {
            return items.map((table: Record<string, unknown>) => ({
                name: (table.table_name || table.name) as string,
                type: 'TABLE' as const,
                row_count: table.row_count as number | undefined,
                source_type: (table.source_type as string) || 'file',
            }));
        }
        return [];
    } catch (error) {
        throw error;
    }
}

/**
 * Get DuckDB table summaries
 *
 * Returns normalized response with tables array (new endpoint)
 */
export async function fetchDuckDBTableSummaries(): Promise<{
    success: boolean;
    tables: TableInfo[];
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.get('/api/duckdb/tables');
        const normalized = normalizeResponse<{ tables?: TableInfo[] } | { items?: TableInfo[] }>(response);

        // Handle both formats: { tables: [...] } or list format { items: [...] }
        const data = normalized.data;
        const tables = (data as { tables?: TableInfo[] })?.tables ??
                       normalized.items as TableInfo[] ??
                       [];

        return {
            success: true,
            tables,
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, '获取表列表失败');
    }
}

/**
 * Get DuckDB table detail (columns, sample data)
 *
 * Returns TableDetail from normalized response
 */
export async function getDuckDBTableDetail(tableName: string): Promise<TableDetail> {
    try {
        const response = await apiClient.get(`/api/duckdb/tables/${tableName}`);
        const normalized = normalizeResponse<TableDetail | { table?: TableDetail }>(response);

        const data = normalized.data;
        return (data as { table?: TableDetail })?.table ?? data as TableDetail;
    } catch (error) {
        throw handleApiError(error as never, '获取表详情失败');
    }
}

/**
 * Delete a DuckDB table (legacy endpoint)
 *
 * Returns normalized response
 */
export async function deleteDuckDBTable(tableName: string): Promise<NormalizedResponse<Record<string, unknown>>> {
    try {
        const response = await apiClient.delete(`/api/duckdb_tables/${tableName}`);
        return normalizeResponse(response);
    } catch (error) {
        throw error;
    }
}

/**
 * Delete a DuckDB table (enhanced - new endpoint)
 *
 * Returns normalized response
 */
export async function deleteDuckDBTableEnhanced(tableName: string): Promise<NormalizedResponse<Record<string, unknown>>> {
    try {
        const response = await apiClient.delete(`/api/duckdb/tables/${tableName}`);
        return normalizeResponse(response);
    } catch (error) {
        throw error;
    }
}

/**
 * Refresh DuckDB table metadata
 *
 * Returns TableDetail from normalized response
 */
export async function refreshDuckDBTableMetadata(tableName: string): Promise<TableDetail> {
    try {
        const response = await apiClient.post(`/api/duckdb/tables/${tableName}/refresh`);
        const normalized = normalizeResponse<TableDetail | { table?: TableDetail }>(response);

        const data = normalized.data;
        return (data as { table?: TableDetail })?.table ?? data as TableDetail;
    } catch (error) {
        throw handleApiError(error as never, '刷新表元数据失败');
    }
}

// ==================== External Database Tables ====================

/**
 * Get external database table detail
 *
 * Returns TableDetail from normalized response
 */
export async function getExternalTableDetail(
    connectionId: string,
    tableName: string,
    schema?: string
): Promise<TableDetail> {
    try {
        const params = new URLSearchParams();
        params.append('table_name', tableName);
        if (schema) {
            params.append('schema', schema);
        }

        const response = await apiClient.get(
            `/api/datasources/databases/${connectionId}/tables/detail?${params.toString()}`
        );
        const normalized = normalizeResponse<TableDetail | { table?: TableDetail }>(response);

        const data = normalized.data;
        return (data as { table?: TableDetail })?.table ?? data as TableDetail;
    } catch (error) {
        throw handleApiError(error as never, '获取外部表详情失败');
    }
}

// ==================== General Table Operations ====================

/**
 * Get all available tables (DuckDB + external)
 *
 * Returns array of TableInfo
 */
export async function getAvailableTables(): Promise<TableInfo[]> {
    try {
        const response = await apiClient.get('/api/available_tables');
        const normalized = normalizeResponse<TableInfo[] | { tables?: TableInfo[] }>(response);

        const data = normalized.data;
        if (Array.isArray(data)) {
            return data;
        }
        return (data as { tables?: TableInfo[] })?.tables ?? [];
    } catch (error) {
        throw error;
    }
}

/**
 * Get all tables (unified interface)
 *
 * Returns normalized response with tables array
 */
export async function getAllTables(): Promise<{
    success: boolean;
    tables: TableInfo[];
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.get('/api/tables/all');
        const normalized = normalizeResponse<{ tables?: TableInfo[] }>(response);

        return {
            success: true,
            tables: normalized.data.tables ?? [],
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, '获取表列表失败');
    }
}

/**
 * Get column statistics for a table column
 *
 * Returns normalized response with statistics
 */
export async function getColumnStatistics(
    tableName: string,
    columnName: string
): Promise<{
    success: boolean;
    statistics: {
        min?: number | string;
        max?: number | string;
        count: number;
        distinct_count: number;
        null_count: number;
    };
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.get(
            `/api/tables/${tableName}/columns/${columnName}/statistics`
        );
        const normalized = normalizeResponse<{ statistics: { min?: number | string; max?: number | string; count: number; distinct_count: number; null_count: number } }>(response);

        return {
            success: true,
            statistics: normalized.data.statistics,
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, '获取列统计信息失败');
    }
}

/**
 * Get distinct values for a column (for pivot tables)
 *
 * Returns normalized response with values
 */
export async function getDistinctValues(payload: {
    table_name: string;
    column_name: string;
    limit?: number;
    order_by?: 'count' | 'value';
}): Promise<{
    success: boolean;
    values: Array<{ value: unknown; count: number }>;
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.post('/api/tables/distinct-values', payload);
        const normalized = normalizeResponse<{ values: Array<{ value: unknown; count: number }> }>(response);

        return {
            success: true,
            values: normalized.data.values ?? [],
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, '获取去重值失败');
    }
}
