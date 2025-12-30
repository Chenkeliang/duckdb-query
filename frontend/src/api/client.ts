/**
 * API Client Configuration
 * 
 * Shared axios instance and utilities for API calls.
 * Preserves all existing axios features (interceptors, timeouts, progress, etc.)
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';

// Environment-based base URL
const apiUrl = import.meta.env.VITE_API_URL || '';
export const baseURL = (apiUrl === '' || apiUrl.includes('localhost:8000') || apiUrl.includes('your-api-url-in-production'))
    ? ''
    : apiUrl;

// Federated query timeout (5 minutes default, configurable)
let federatedQueryTimeout = Number(import.meta.env.VITE_FEDERATED_QUERY_TIMEOUT) || 300000;

export const setFederatedQueryTimeout = (ms: number): void => {
    federatedQueryTimeout = ms;
};

export const getFederatedQueryTimeout = (): number => federatedQueryTimeout;

// Create axios instance
export const apiClient: AxiosInstance = axios.create({
    baseURL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Upload client with longer timeout
export const uploadClient: AxiosInstance = axios.create({
    baseURL,
    timeout: 600000, // 10 minutes for large files
});

/**
 * Extract error message from various response formats
 */
export const extractMessage = (payload: unknown): string => {
    if (!payload) return '';
    if (typeof payload === 'string') return payload;

    const p = payload as Record<string, unknown>;

    if (typeof p.detail === 'string') {
        return p.detail;
    }

    if (p.detail && typeof p.detail === 'object') {
        const detail = p.detail as Record<string, unknown>;
        if (typeof detail.message === 'string') {
            return detail.message;
        }
        if (typeof detail.detail === 'string') {
            return detail.detail;
        }
    }

    if (p.error) {
        if (typeof p.error === 'string') {
            return p.error;
        }
        const error = p.error as Record<string, unknown>;
        if (typeof error.message === 'string') {
            return error.message;
        }
    }

    if (typeof p.message === 'string') {
        return p.message;
    }

    return '';
};

/**
 * API Error with enhanced properties
 */
export interface ApiError extends Error {
    statusCode?: number;
    code?: string;
    details?: Record<string, unknown>;
}

/**
 * Unified error handler
 */
export const handleApiError = (error: AxiosError, defaultMessage = '操作失败'): never => {
    // Network error
    if (error.code === 'ECONNABORTED') {
        throw new Error('请求超时，请检查网络连接');
    }

    if (!error.response) {
        throw new Error('网络连接失败，请检查网络状态');
    }

    const { status, data } = error.response;
    const messageFromData = extractMessage(data);
    const d = data as Record<string, unknown>;
    const detail = d?.detail as Record<string, unknown> | undefined;
    const codeFromData = detail?.code as string | undefined;
    const detailsFromData = detail?.details as Record<string, unknown> | undefined;

    const throwWithMessage = (fallbackMessage: string): never => {
        const err = new Error(messageFromData || fallbackMessage) as ApiError;
        err.statusCode = status;
        if (codeFromData) {
            err.code = codeFromData;
        }
        if (detailsFromData) {
            err.details = detailsFromData;
        }
        throw err;
    };

    // Check unified error format
    if (detail && typeof detail === 'object' && detail.code) {
        const originalError = (detail.details as Record<string, unknown>)?.original_error as string | undefined;
        const errorMessage = originalError || (detail.message as string) || defaultMessage;
        const enhancedError = new Error(errorMessage) as ApiError;
        enhancedError.code = detail.code as string;
        enhancedError.details = detail.details as Record<string, unknown>;
        enhancedError.statusCode = status;
        throw enhancedError;
    }

    // Handle by status code
    switch (status) {
        case 400:
            throwWithMessage('请求参数错误');
            break;
        case 401:
            throwWithMessage('认证失败，请重新登录');
            break;
        case 403:
            throwWithMessage('权限不足，无法执行此操作');
            break;
        case 404:
            throwWithMessage('请求的资源不存在');
            break;
        case 408:
            throwWithMessage('连接超时，请检查网络或数据库状态');
            break;
        case 413:
            throwWithMessage('文件太大，请选择较小的文件');
            break;
        case 422:
            throwWithMessage('数据验证失败');
            break;
        case 500:
            throwWithMessage('服务器内部错误，请稍后重试');
            break;
        case 502:
            throwWithMessage('服务器网关错误，请稍后重试');
            break;
        case 503:
            throwWithMessage('服务暂时不可用，请稍后重试');
            break;
        default:
            throwWithMessage(defaultMessage);
    }
};

export default apiClient;
