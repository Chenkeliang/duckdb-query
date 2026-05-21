/**
 * 外部数据库 Schema / 表列表 / 表详情（非 DuckDB execute）
 */

import { apiClient, handleApiError, normalizeResponse } from './client';

function normalizeConnectionId(connectionId: string): string {
  return connectionId.startsWith('db_') ? connectionId.slice(3) : connectionId;
}

export interface ConnectionSchemaItem {
  name: string;
  table_count?: number;
}

export interface ConnectionTableItem {
  name: string;
  type?: 'TABLE' | 'VIEW' | 'MATERIALIZED_VIEW';
  row_count?: number;
}

/**
 * GET /api/databases/{connection_id}/schemas — 列表响应
 */
export async function listConnectionSchemas(connectionId: string): Promise<ConnectionSchemaItem[]> {
  const id = normalizeConnectionId(connectionId);
  try {
    const response = await apiClient.get(`/api/databases/${id}/schemas`);
    const normalized = normalizeResponse<{ items?: ConnectionSchemaItem[] }>(response);
    return (normalized.items ?? []) as ConnectionSchemaItem[];
  } catch (error) {
    throw handleApiError(error as never, '获取 schemas 列表失败');
  }
}

/**
 * GET /api/databases/{id}/schemas/{schema}/tables — 列表响应
 */
export async function listSchemaTablesForConnection(
  connectionId: string,
  schema: string
): Promise<ConnectionTableItem[]> {
  const id = normalizeConnectionId(connectionId);
  try {
    const response = await apiClient.get(
      `/api/databases/${id}/schemas/${encodeURIComponent(schema)}/tables`
    );
    const normalized = normalizeResponse<{
      items?: Array<{ name: string; type?: string; row_count?: number }>;
    }>(response);
    const items = (normalized.items ?? []) as Array<{ name: string; type?: string; row_count?: number }>;
    return items.map((t) => ({
      name: t.name,
      type: (t.type as ConnectionTableItem['type']) || 'TABLE',
      row_count: t.row_count ?? 0,
    }));
  } catch (error) {
    throw handleApiError(error as never, '获取 schema 下表列表失败');
  }
}

/**
 * GET /api/database_tables/{id} — 对象载荷，`data.tables`（非 items）
 */
export async function listConnectionTablesFlat(connectionId: string): Promise<ConnectionTableItem[]> {
  const id = normalizeConnectionId(connectionId);
  try {
    const response = await apiClient.get(`/api/database_tables/${id}`);
    const normalized = normalizeResponse<{
      tables?: Array<{ table_name?: string; name?: string; row_count?: number }>;
    }>(response);
    const raw = (normalized.data as { tables?: unknown[] })?.tables ?? [];
    return (raw as Array<{ table_name?: string; name?: string; row_count?: number }>).map((t) => ({
      name: t.table_name || t.name || '',
      type: 'TABLE' as const,
      row_count: t.row_count ?? 0,
    }));
  } catch (error) {
    throw handleApiError(error as never, '获取表列表失败');
  }
}

export interface ExternalTableDetailsPayload {
  columns: unknown[];
  indexes?: unknown[];
  table_comment?: string | null;
}

/**
 * GET /api/database_table_details/{connection_id}/{table_name}?schema=
 */
export async function getExternalDatabaseTableDetails(
  connectionId: string,
  tableName: string,
  schema?: string | null
): Promise<ExternalTableDetailsPayload> {
  const id = normalizeConnectionId(connectionId);
  const params = new URLSearchParams();
  if (schema) params.set('schema', schema);
  const qs = params.toString();
  const path = `/api/database_table_details/${id}/${encodeURIComponent(tableName)}${qs ? `?${qs}` : ''}`;
  try {
    const response = await apiClient.get(path);
    const normalized = normalizeResponse<ExternalTableDetailsPayload>(response);
    return normalized.data as ExternalTableDetailsPayload;
  } catch (error) {
    throw handleApiError(error as never, '获取表结构失败');
  }
}
