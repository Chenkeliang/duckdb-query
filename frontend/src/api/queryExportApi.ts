/**
 * 服务端查询结果导出 API
 */

import { apiClient, handleApiError, normalizeResponse } from './client';

export interface QueryResultExportPayload {
    sql: string;
    format: 'parquet' | 'csv';
    attach_databases?: { alias: string; connection_id: string }[];
    /** false(默认)=逐字执行;true=无外层 LIMIT 时追加 max_query_rows;用户 LIMIT 始终原样保留 */
    apply_row_limit?: boolean;
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

export interface QueryExportSaveToPathResult {
    path: string;
    size_bytes: number;
}

/**
 * 桌面模式专用:把已导出的查询结果文件(file_id)直接拷到用户经原生存盘对话框
 * 选定的绝对路径。Web/Docker 后端 403,浏览器场景继续用 getQueryExportDownloadUrl
 * + openExternal。大文件拷贝可达数秒 → 禁用超时。
 */
export async function saveQueryExportToPath(
    fileId: string,
    options: { targetPath: string }
): Promise<QueryExportSaveToPathResult> {
    try {
        const response = await apiClient.post(
            `/api/query-results/export/${encodeURIComponent(fileId)}/save-to-path`,
            { target_path: options.targetPath },
            { timeout: 0 }
        );
        const normalized = normalizeResponse<QueryExportSaveToPathResult>(response);
        return normalized.data;
    } catch (error) {
        throw handleApiError(error as never, 'Failed to save export to local path');
    }
}
