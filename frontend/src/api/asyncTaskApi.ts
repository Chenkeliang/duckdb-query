/**
 * Async Task API Module
 *
 * Functions for managing asynchronous query tasks.
 *
 * Updated to use normalizeResponse for standard API response handling.
 */

import { apiClient, handleApiError, normalizeResponse } from './client';
import type { AsyncTask, CreateTaskRequest, NormalizedResponse } from './types';

// ==================== Types ====================

export interface ListTasksOptions {
    limit?: number;  // 20, 50, 100
    offset?: number;
    orderBy?: string;
}

export interface ListTasksResponse {
    tasks: AsyncTask[];
    count: number;
    total: number;
    limit: number;
    offset: number;
    messageCode?: string;
    message?: string;
}

export interface DownloadOptions {
    format: 'csv' | 'parquet';
}

export interface TaskSubmitResult {
    task_id: string;
    task?: AsyncTask;
    messageCode?: string;
    message?: string;
}

// ==================== Task CRUD ====================

/**
 * List async tasks with pagination
 *
 * Returns normalized response with tasks in items array
 */
export async function listAsyncTasks(options: ListTasksOptions = {}): Promise<ListTasksResponse> {
    const { limit = 20, offset = 0, orderBy = 'created_at' } = options;

    try {
        const params = new URLSearchParams();
        params.append('limit', String(limit));
        params.append('offset', String(offset));
        params.append('order_by', orderBy);

        const response = await apiClient.get(`/api/async-tasks?${params.toString()}`);
        const normalized = normalizeResponse<{ items: AsyncTask[]; total: number; limit: number; offset: number }>(response);

        // Handle list response format
        const data = normalized.data;
        const items = normalized.items ?? data?.items ?? [];
        const total = normalized.total ?? data?.total ?? 0;

        return {
            tasks: items as AsyncTask[],
            count: items.length,
            total,
            limit: data?.limit ?? limit,
            offset: data?.offset ?? offset,
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, '获取任务列表失败');
    }
}

/**
 * Get a single async task by ID
 *
 * Returns the task object from normalized response
 */
export async function getAsyncTask(taskId: string): Promise<AsyncTask> {
    try {
        const response = await apiClient.get(`/api/async-tasks/${taskId}`);
        const normalized = normalizeResponse<{ task: AsyncTask }>(response);

        // Extract task from data.task or data directly
        const data = normalized.data;
        return (data as { task?: AsyncTask })?.task ?? data as unknown as AsyncTask;
    } catch (error) {
        throw handleApiError(error as never, '获取任务详情失败');
    }
}

/**
 * Submit a new async query
 *
 * Returns task_id and optional task object
 */
export async function submitAsyncQuery(payload: CreateTaskRequest): Promise<TaskSubmitResult> {
    try {
        const response = await apiClient.post('/api/async-tasks', payload);
        const normalized = normalizeResponse<{ task_id: string; task?: AsyncTask }>(response);

        const data = normalized.data;
        return {
            task_id: data.task_id,
            task: data.task,
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, '提交异步任务失败');
    }
}

/**
 * Cancel an async task
 *
 * Returns normalized response with success status
 */
export async function cancelAsyncTask(
    taskId: string,
    payload: Record<string, unknown> = {}
): Promise<NormalizedResponse<{ task?: AsyncTask }>> {
    try {
        const response = await apiClient.post(`/api/async-tasks/${taskId}/cancel`, payload);
        return normalizeResponse<{ task?: AsyncTask }>(response);
    } catch (error) {
        throw handleApiError(error as never, '取消任务失败');
    }
}

/**
 * Retry a failed async task
 *
 * Returns normalized response with new task info
 */
export async function retryAsyncTask(
    taskId: string,
    payload: Record<string, unknown> = {}
): Promise<NormalizedResponse<{ task_id?: string; task?: AsyncTask }>> {
    try {
        const response = await apiClient.post(`/api/async-tasks/${taskId}/retry`, payload);
        return normalizeResponse<{ task_id?: string; task?: AsyncTask }>(response);
    } catch (error) {
        throw handleApiError(error as never, '重试任务失败');
    }
}

// ==================== Task Result ====================

/**
 * 构造异步任务结果的下载 URL(GET,供原生下载使用)。
 *
 * 用 openExternal 命中它(桌面走系统浏览器、Web 走 window.open)做原生流式下载,
 * 大文件也不占内存。切勿再用 axios `responseType:'blob'` 把整个文件读进 webview
 * 内存——2 亿行 CSV 可达数 GB,会把界面直接卡死。
 */
export function getAsyncDownloadUrl(
    taskId: string,
    options: DownloadOptions = { format: 'csv' }
): string {
    const base = (apiClient.defaults.baseURL ?? '').replace(/\/$/, '');
    return `${base}/api/async-tasks/${encodeURIComponent(taskId)}/download?format=${options.format}`;
}

export interface AsyncExportToPathOptions {
    format: 'csv' | 'parquet';
    /** 原生存盘对话框选定的绝对路径 */
    targetPath: string;
}

export interface AsyncExportToPathResult {
    path: string;
    size_bytes: number;
}

/**
 * 桌面模式专用:让本地 Python 后端把任务结果直接写到用户经原生存盘对话框
 * 选定的绝对路径——免浏览器依赖(Windows explorer 曾对带 query 的 URL 静默
 * 失败)、免"后端 + 浏览器"二次落盘。Web/Docker 部署后端返回 403,浏览器场景
 * 继续用 getAsyncDownloadUrl + openExternal 的流式下载。
 * 大结果 COPY/拷贝可达数十秒 → 本请求禁用超时。
 */
export async function exportAsyncResultToPath(
    taskId: string,
    options: AsyncExportToPathOptions
): Promise<AsyncExportToPathResult> {
    try {
        const response = await apiClient.post(
            `/api/async-tasks/${encodeURIComponent(taskId)}/export-to-path`,
            { format: options.format, target_path: options.targetPath },
            { timeout: 0 }
        );
        const { data } = normalizeResponse<AsyncExportToPathResult>(response);
        return data;
    } catch (error) {
        throw handleApiError(error as never, 'Failed to export result to local path');
    }
}

// ==================== Connection Pool Management ====================

/**
 * Get connection pool status
 *
 * Returns normalized response with pool information
 */
export async function getConnectionPoolStatus(): Promise<{
    pool_status: Record<string, unknown>;
    timestamp?: number;
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.get('/api/duckdb/pool/status');
        const normalized = normalizeResponse<{
            pool_status?: Record<string, unknown>;
            timestamp?: number;
        }>(response);

        return {
            pool_status: normalized.data.pool_status ?? {},
            timestamp: normalized.data.timestamp,
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, '获取连接池状态失败');
    }
}

/**
 * Reset connection pool
 *
 * Returns normalized response
 */
export async function resetConnectionPool(): Promise<NormalizedResponse<Record<string, unknown>>> {
    try {
        const response = await apiClient.post('/api/duckdb/pool/reset');
        return normalizeResponse(response);
    } catch (error) {
        throw handleApiError(error as never, '重置连接池失败');
    }
}

// ==================== Error Statistics ====================

/**
 * Get error statistics
 *
 * Returns normalized response with error stats
 */
export async function getErrorStatistics(): Promise<{
    error_statistics: Record<string, unknown>;
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.get('/api/errors/statistics');
        const normalized = normalizeResponse<{ error_statistics?: Record<string, unknown> }>(response);

        return {
            error_statistics: normalized.data.error_statistics ?? {},
            messageCode: normalized.messageCode,
            message: normalized.message,
        };
    } catch (error) {
        throw handleApiError(error as never, '获取错误统计失败');
    }
}

/**
 * Clear old errors
 *
 * Returns normalized response
 */
export async function clearOldErrors(days = 30): Promise<NormalizedResponse<{ cleared_count?: number }>> {
    try {
        const response = await apiClient.post(`/api/errors/clear?days=${days}`);
        return normalizeResponse(response);
    } catch (error) {
        throw handleApiError(error as never, '清理错误记录失败');
    }
}
