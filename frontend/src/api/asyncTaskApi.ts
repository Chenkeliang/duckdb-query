/**
 * Async Task API Module
 * 
 * Functions for managing asynchronous query tasks.
 */

import { apiClient, handleApiError } from './client';
import type { AsyncTask, TaskStatus, CreateTaskRequest, ApiResponse } from './types';

// ==================== Types ====================

export interface ListTasksOptions {
    limit?: number;  // 20, 50, 100
    offset?: number;
    orderBy?: string;
}

export interface ListTasksResponse extends ApiResponse {
    tasks: AsyncTask[];
    count: number;
    total: number;
    limit: number;
    offset: number;
}

export interface DownloadOptions {
    format: 'csv' | 'parquet';
}

// ==================== Task CRUD ====================

/**
 * List async tasks with pagination
 */
export async function listAsyncTasks(options: ListTasksOptions = {}): Promise<ListTasksResponse> {
    const { limit = 20, offset = 0, orderBy = 'created_at' } = options;

    try {
        const params = new URLSearchParams();
        params.append('limit', String(limit));
        params.append('offset', String(offset));
        params.append('order_by', orderBy);

        const response = await apiClient.get(`/api/async-tasks?${params.toString()}`);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '获取任务列表失败');
    }
}

/**
 * Get a single async task by ID
 */
export async function getAsyncTask(taskId: string): Promise<AsyncTask> {
    try {
        const response = await apiClient.get(`/api/async-tasks/${taskId}`);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '获取任务详情失败');
    }
}

/**
 * Submit a new async query
 */
export async function submitAsyncQuery(payload: CreateTaskRequest): Promise<{
    success: boolean;
    task_id: string;
    message?: string;
}> {
    try {
        const response = await apiClient.post('/api/async-tasks', payload);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '提交异步任务失败');
    }
}

/**
 * Cancel an async task
 */
export async function cancelAsyncTask(
    taskId: string,
    payload: Record<string, unknown> = {}
): Promise<ApiResponse> {
    try {
        const response = await apiClient.post(`/api/async-tasks/${taskId}/cancel`, payload);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '取消任务失败');
    }
}

/**
 * Retry a failed async task
 */
export async function retryAsyncTask(
    taskId: string,
    payload: Record<string, unknown> = {}
): Promise<ApiResponse> {
    try {
        const response = await apiClient.post(`/api/async-tasks/${taskId}/retry`, payload);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '重试任务失败');
    }
}

// ==================== Task Result ====================

/**
 * Download async task result
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
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '下载任务结果失败');
    }
}

// ==================== Connection Pool Management ====================

/**
 * Get connection pool status
 */
export async function getConnectionPoolStatus(): Promise<{
    success: boolean;
    pools: Array<{
        name: string;
        active: number;
        idle: number;
        total: number;
    }>;
}> {
    try {
        const response = await apiClient.get('/api/connection-pool/status');
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '获取连接池状态失败');
    }
}

/**
 * Reset connection pool
 */
export async function resetConnectionPool(): Promise<ApiResponse> {
    try {
        const response = await apiClient.post('/api/connection-pool/reset');
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '重置连接池失败');
    }
}

// ==================== Error Statistics ====================

/**
 * Get error statistics
 */
export async function getErrorStatistics(): Promise<{
    success: boolean;
    errors: Array<{
        type: string;
        count: number;
        last_occurred: string;
    }>;
}> {
    try {
        const response = await apiClient.get('/api/errors/statistics');
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '获取错误统计失败');
    }
}

/**
 * Clear old errors
 */
export async function clearOldErrors(days = 30): Promise<ApiResponse> {
    try {
        const response = await apiClient.delete(`/api/errors/clear?days=${days}`);
        return response.data;
    } catch (error) {
        throw handleApiError(error as never, '清理错误记录失败');
    }
}
