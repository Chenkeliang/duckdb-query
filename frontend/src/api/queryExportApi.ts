/**
 * 服务端查询结果导出 API
 */

import { apiClient, handleApiError, normalizeResponse } from './client';

export interface QueryResultExportPayload {
    sql: string;
    format: 'parquet' | 'csv';
    attach_databases?: { alias: string; connection_id: string }[];
}

export interface QueryResultExportResult {
    file_id: string;
    download_url: string;
    format: string;
    row_count_estimate?: number;
}

export async function exportQueryResults(
    payload: QueryResultExportPayload,
    options?: { requestId?: string }
): Promise<QueryResultExportResult> {
    try {
        const config = options?.requestId
            ? { headers: { 'X-Request-ID': options.requestId } }
            : undefined;
        const response = await apiClient.post(
            '/api/query-results/export',
            payload,
            config
        );
        const normalized = normalizeResponse<QueryResultExportResult>(response);
        return normalized.data;
    } catch (error) {
        throw handleApiError(error as never, '查询结果导出失败');
    }
}

export function getQueryExportDownloadUrl(downloadPath: string): string {
    if (downloadPath.startsWith('http')) {
        return downloadPath;
    }
    const base = apiClient.defaults.baseURL ?? '';
    return `${base.replace(/\/$/, '')}${downloadPath}`;
}
