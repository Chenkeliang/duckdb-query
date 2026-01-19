/**
 * Async Task API Module
 *
 * Functions for managing asynchronous query tasks.
 *
 * Updated to use normalizeResponse for standard API response handling.
 */

import { apiClient, handleApiError, normalizeResponse, parseBlobError } from './client';
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
 * Download async task result
 *
 * Handles blob response with JSON error parsing
 */
export async function downloadAsyncResult(
    taskId: string,
    options: DownloadOptions = { format: 'csv' }
): Promise<Blob> {
    const { format } = options;

    try {
        // Backend expects POST with format in request body
        const response = await apiClient.post(
            `/api/async-tasks/${taskId}/download`,
            { format },
            { responseType: 'blob' }
        );

        // Check if response is actually an error (JSON in blob)
        const blob = response.data as Blob;
        if (blob.type.includes('application/json')) {
            const errorData = await parseBlobError(blob);
            if (errorData) {
                const error = new Error(errorData.message || '下载失败') as Error & { code?: string; messageCode?: string };
                error.code = errorData.error.code;
                error.messageCode = errorData.messageCode;
                throw error;
            }
        }

        return blob;
    } catch (error) {
        // Re-throw if already processed
        if ((error as Error & { code?: string }).code) {
            throw error;
        }
        throw handleApiError(error as never, '下载任务结果失败');
    }
}

// ==================== Connection Pool Management ====================

/**
 * Get connection pool status
 *
 * Returns normalized response with pool information
 */
export async function getConnectionPoolStatus(): Promise<{
    pools: Array<{
        name: string;
        active: number;
        idle: number;
        total: number;
    }>;
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.get('/api/connection-pool/status');
        const normalized = normalizeResponse<{ pools: Array<{ name: string; active: number; idle: number; total: number }> }>(response);

        return {
            pools: normalized.data.pools ?? [],
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
        const response = await apiClient.post('/api/connection-pool/reset');
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
    errors: Array<{
        type: string;
        count: number;
        last_occurred: string;
    }>;
    messageCode?: string;
    message?: string;
}> {
    try {
        const response = await apiClient.get('/api/errors/statistics');
        const normalized = normalizeResponse<{ errors: Array<{ type: string; count: number; last_occurred: string }> }>(response);

        return {
            errors: normalized.data.errors ?? [],
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
        const response = await apiClient.delete(`/api/errors/clear?days=${days}`);
        return normalizeResponse(response);
    } catch (error) {
        throw handleApiError(error as never, '清理错误记录失败');
    }
}
