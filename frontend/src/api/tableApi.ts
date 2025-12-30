/**
 * Table API Module
 * 
 * Functions for managing DuckDB tables and external database tables.
 */

import { apiClient, handleApiError } from './client';
import type { TableInfo, TableDetail, ColumnInfo, ApiResponse } from './types';

// ==================== DuckDB Tables ====================

/**
 * Get all DuckDB tables
 */
export async function getDuckDBTables(): Promise<TableInfo[]> {
    try {
        const response = await apiClient.get('/api/duckdb_tables');
        const data = response.data;

        if (data && data.tables) {
            return data.tables.map((table: Record<string, unknown>) => ({
                name: table.table_name,
                type: 'TABLE' as const,
                row_count: table.row_count,
                source_type: table.source_type || 'file',
            }));
        }
        return [];
    } catch (error) {
        throw error;
    }
}

/**
 * Get DuckDB table summaries
 */
export async function fetchDuckDBTableSummaries(): Promise<{
    success: boolean;
    tables: TableInfo[];
}> {
    try {
        const response = await apiClient.get('/api/duckdb/tables');
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '获取表列表失败');
    }
}

/**
 * Get DuckDB table detail (columns, sample data)
 */
export async function getDuckDBTableDetail(tableName: string): Promise<TableDetail> {
    try {
        const response = await apiClient.get(`/api/duckdb/tables/${tableName}`);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '获取表详情失败');
    }
}

/**
 * Delete a DuckDB table
 */
export async function deleteDuckDBTable(tableName: string): Promise<ApiResponse> {
    try {
        const response = await apiClient.delete(`/api/duckdb_tables/${tableName}`);
        return response.data;
    } catch (error) {
        throw error;
    }
}

/**
 * Delete a DuckDB table (enhanced)
 */
export async function deleteDuckDBTableEnhanced(tableName: string): Promise<ApiResponse> {
    try {
        const response = await apiClient.delete(`/api/duckdb/tables/${tableName}`);
        return response.data;
    } catch (error) {
        throw error;
    }
}

/**
 * Refresh DuckDB table metadata
 */
export async function refreshDuckDBTableMetadata(tableName: string): Promise<TableDetail> {
    try {
        const response = await apiClient.post(`/api/duckdb/tables/${tableName}/refresh`);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '刷新表元数据失败');
    }
}

// ==================== External Database Tables ====================

/**
 * Get external database table detail
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
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '获取外部表详情失败');
    }
}

// ==================== General Table Operations ====================

/**
 * Get all available tables (DuckDB + external)
 */
export async function getAvailableTables(): Promise<TableInfo[]> {
    try {
        const response = await apiClient.get('/api/available_tables');
        return response.data;
    } catch (error) {
        throw error;
    }
}

/**
 * Get all tables (unified interface)
 */
export async function getAllTables(): Promise<{
    success: boolean;
    tables: TableInfo[];
}> {
    try {
        const response = await apiClient.get('/api/tables/all');
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '获取表列表失败');
    }
}

/**
 * Get column statistics for a table column
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
}> {
    try {
        const response = await apiClient.get(
            `/api/tables/${tableName}/columns/${columnName}/statistics`
        );
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '获取列统计信息失败');
    }
}

/**
 * Get distinct values for a column (for pivot tables)
 */
export async function getDistinctValues(payload: {
    table_name: string;
    column_name: string;
    limit?: number;
    order_by?: 'count' | 'value';
}): Promise<{
    success: boolean;
    values: Array<{ value: unknown; count: number }>;
}> {
    try {
        const response = await apiClient.post('/api/tables/distinct-values', payload);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '获取去重值失败');
    }
}
