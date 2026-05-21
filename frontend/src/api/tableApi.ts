/**
 * Table API Module
 *
 * Functions for managing DuckDB tables and external database tables.
 *
 * @see docs/API_PHASE_B_CALL_MAP.md
 */

import { apiClient, handleApiError, normalizeResponse } from './client';
import type { TableInfo, TableDetail, NormalizedResponse } from './types';

type DuckDBTableListItem = {
    table_name?: string;
    name?: string;
    row_count?: number;
    column_count?: number;
    created_at?: string;
    source_type?: string;
};

function mapDuckDBTableListItems(items: DuckDBTableListItem[]): TableInfo[] {
    return items.map((table) => ({
        name: (table.table_name || table.name) as string,
        type: 'TABLE' as const,
        row_count: table.row_count,
        source_type: table.source_type || 'file',
    }));
}

async function fetchDuckDBTableListNormalized() {
    const response = await apiClient.get('/api/duckdb/tables');
    return normalizeResponse<{ items?: DuckDBTableListItem[] }>(response);
}

/**
 * Get all DuckDB tables (canonical: GET /api/duckdb/tables)
 */
export async function getDuckDBTables(): Promise<TableInfo[]> {
    try {
        const normalized = await fetchDuckDBTableListNormalized();
        const items = normalized.items ?? normalized.data?.items ?? [];
        return mapDuckDBTableListItems(Array.isArray(items) ? items : []);
    } catch (error) {
        throw error;
    }
}

/**
 * Get DuckDB table summaries with message metadata
 */
export async function fetchDuckDBTableSummaries(): Promise<{
    success: boolean;
    tables: TableInfo[];
    messageCode?: string;
    message?: string;
}> {
    try {
        const normalized = await fetchDuckDBTableListNormalized();
        const items = normalized.items ?? normalized.data?.items ?? [];
        return {
            success: true,
            tables: mapDuckDBTableListItems(Array.isArray(items) ? items : []),
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, '获取表列表失败');
    }
}

/**
 * Get DuckDB table detail (columns, sample data)
 */
export async function getDuckDBTableDetail(tableName: string): Promise<TableDetail> {
    try {
        const response = await apiClient.get(`/api/duckdb/tables/${encodeURIComponent(tableName)}`);
        const normalized = normalizeResponse<TableDetail | { table?: TableDetail }>(response);

        const data = normalized.data;
        return (data as { table?: TableDetail })?.table ?? (data as TableDetail);
    } catch (error) {
        throw handleApiError(error as never, '获取表详情失败');
    }
}

/**
 * Delete a DuckDB table
 */
export async function deleteDuckDBTable(tableName: string): Promise<NormalizedResponse<Record<string, unknown>>> {
    try {
        const response = await apiClient.delete(
            `/api/duckdb/tables/${encodeURIComponent(tableName)}`
        );
        return normalizeResponse(response);
    } catch (error) {
        throw error;
    }
}

/** @deprecated Use deleteDuckDBTable */
export const deleteDuckDBTableEnhanced = deleteDuckDBTable;

/**
 * Refresh DuckDB table metadata cache
 */
export async function refreshDuckDBTableMetadata(tableName: string): Promise<TableDetail> {
    try {
        const response = await apiClient.post(
            `/api/duckdb/table/${encodeURIComponent(tableName)}/refresh`
        );
        const normalized = normalizeResponse<TableDetail | { table?: TableDetail }>(response);

        const data = normalized.data;
        return (data as { table?: TableDetail })?.table ?? (data as TableDetail);
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
        const normalized = normalizeResponse<TableDetail | { table?: TableDetail }>(response);

        const data = normalized.data;
        return (data as { table?: TableDetail })?.table ?? (data as TableDetail);
    } catch (error) {
        throw handleApiError(error as never, '获取外部表详情失败');
    }
}
