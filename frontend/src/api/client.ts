/**
 * API Client Configuration
 *
 * Shared axios instance and utilities for API calls.
 * Preserves all existing axios features (interceptors, timeouts, progress, etc.)
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { StandardSuccess, StandardList, StandardError, NormalizedResponse } from './types';

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
 * Extract messageCode from response payload
 *
 * @param payload - Response payload
 * @returns messageCode string or undefined
 */
export const extractMessageCode = (payload: unknown): string | undefined => {
    if (!payload || typeof payload !== 'object') return undefined;

    const p = payload as Record<string, unknown>;

    // 直接从响应中获取 messageCode
    if (typeof p.messageCode === 'string') {
        return p.messageCode;
    }

    // 从 error 对象中获取
    if (p.error && typeof p.error === 'object') {
        const error = p.error as Record<string, unknown>;
        if (typeof error.code === 'string') {
            return error.code;
        }
    }

    // 从 detail 对象中获取
    if (p.detail && typeof p.detail === 'object') {
        const detail = p.detail as Record<string, unknown>;
        if (typeof detail.code === 'string') {
            return detail.code;
        }
    }

    return undefined;
};

/**
 * API Error with enhanced properties
 */
export interface ApiError extends Error {
    statusCode?: number;
    code?: string;
    messageCode?: string;
    details?: Record<string, unknown>;
}

/**
 * Check if response is a standard success response
 */
export function isStandardSuccess<T>(response: unknown): response is StandardSuccess<T> {
    if (!response || typeof response !== 'object') return false;
    const r = response as Record<string, unknown>;
    return r.success === true && 'data' in r && 'messageCode' in r && 'timestamp' in r;
}

/**
 * Check if response is a standard list response
 */
export function isStandardList<T>(response: unknown): response is StandardList<T> {
    if (!isStandardSuccess(response)) return false;
    const data = (response as StandardSuccess<unknown>).data;
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    return Array.isArray(d.items) && typeof d.total === 'number';
}

/**
 * Check if response is a standard error response
 */
export function isStandardError(response: unknown): response is StandardError {
    if (!response || typeof response !== 'object') return false;
    const r = response as Record<string, unknown>;
    return r.success === false && 'error' in r && 'messageCode' in r;
}

/**
 * Normalize API response to a consistent format
 *
 * Handles both new standard format and legacy formats.
 *
 * @param response - Axios response object
 * @returns Normalized response with data, messageCode, etc.
 * @throws ApiError if response indicates failure
 *
 * @example
 * ```typescript
 * const response = await apiClient.get('/api/data');
 * const { data, messageCode, items, total } = normalizeResponse(response);
 * ```
 */
export function normalizeResponse<T = unknown>(response: AxiosResponse): NormalizedResponse<T> {
    const payload = response.data;

    // Handle standard error response
    if (isStandardError(payload)) {
        const err = new Error(payload.message || payload.error.message) as ApiError;
        err.code = payload.error.code;
        err.messageCode = payload.messageCode;
        err.details = payload.error.details;
        err.statusCode = response.status;
        throw err;
    }

    // Handle standard success response
    if (isStandardSuccess<T>(payload)) {
        const result: NormalizedResponse<T> = {
            data: payload.data,
            messageCode: payload.messageCode,
            message: payload.message,
            timestamp: payload.timestamp,
            raw: payload,
        };

        // Handle list response
        if (isStandardList<T>(payload)) {
            const listData = payload.data as { items: unknown[]; total: number; page?: number; pageSize?: number };
            result.items = listData.items as NormalizedResponse<T>['items'];
            result.total = listData.total;
            result.page = listData.page;
            result.pageSize = listData.pageSize;
        }

        return result;
    }

    // Handle legacy format (backward compatibility)
    // Legacy format: { success: true, data: ..., message?: ... }
    if (payload && typeof payload === 'object') {
        const p = payload as Record<string, unknown>;

        // Check for legacy success format
        if (p.success === true) {
            return {
                data: (p.data ?? payload) as T,
                messageCode: (p.messageCode as string) || 'OPERATION_SUCCESS',
                message: (p.message as string) || '',
                timestamp: (p.timestamp as string) || new Date().toISOString(),
                raw: payload,
            };
        }

        // Check for legacy error format
        if (p.success === false) {
            const err = new Error(extractMessage(payload) || 'OPERATION_FAILED') as ApiError;
            err.code = extractMessageCode(payload) || 'OPERATION_FAILED';
            err.messageCode = err.code;
            err.statusCode = response.status;
            throw err;
        }
    }

    // Fallback: treat entire payload as data
    return {
        data: payload as T,
        messageCode: 'OPERATION_SUCCESS',
        message: '',
        timestamp: new Date().toISOString(),
        raw: payload,
    };
}

/**
 * Parse error from blob response
 *
 * Used for download endpoints that return JSON error in blob format.
 *
 * @param blob - Blob response
 * @returns Parsed error object or null if not JSON
 *
 * @example
 * ```typescript
 * try {
 *   const blob = await downloadFile(id);
 * } catch (error) {
 *   if (error.response?.data instanceof Blob) {
 *     const parsedError = await parseBlobError(error.response.data);
 *     if (parsedError) {
 *       toast.error(parsedError.message);
 *     }
 *   }
 * }
 * ```
 */
export async function parseBlobError(blob: Blob): Promise<StandardError | null> {
    // Check if blob is JSON
    if (!blob.type.includes('application/json')) {
        return null;
    }

    try {
        const text = await blob.text();
        const parsed = JSON.parse(text);

        if (isStandardError(parsed)) {
            return parsed;
        }

        // Try to construct a standard error from legacy format
        if (parsed && typeof parsed === 'object' && parsed.success === false) {
            return {
                success: false,
                error: {
                    code: extractMessageCode(parsed) || 'OPERATION_FAILED',
                    message: extractMessage(parsed) || 'OPERATION_FAILED',
                    details: (parsed as Record<string, unknown>).details as Record<string, unknown> | undefined,
                },
                detail: extractMessage(parsed) || 'OPERATION_FAILED',
                messageCode: extractMessageCode(parsed) || 'OPERATION_FAILED',
                message: extractMessage(parsed) || 'OPERATION_FAILED',
                timestamp: new Date().toISOString(),
            };
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Unified error handler with i18n support
 *
 * Enhanced to extract messageCode for i18n translation.
 *
 * @param error - Axios error
 * @param defaultMessage - Default message if extraction fails
 * @throws ApiError with code, messageCode, and details
 */
export const handleApiError = (error: AxiosError, defaultMessage = 'OPERATION_FAILED'): never => {
    // Network error
    if (error.code === 'ECONNABORTED') {
        const err = new Error('TIMEOUT_ERROR') as ApiError;
        err.code = 'TIMEOUT_ERROR';
        err.messageCode = 'TIMEOUT_ERROR';
        throw err;
    }

    if (!error.response) {
        const err = new Error('NETWORK_ERROR') as ApiError;
        err.code = 'NETWORK_ERROR';
        err.messageCode = 'NETWORK_ERROR';
        throw err;
    }

    const { status, data } = error.response;

    // Try to parse as standard error
    if (isStandardError(data)) {
        const err = new Error(data.message || data.error.message) as ApiError;
        err.statusCode = status;
        err.code = data.error.code;
        err.messageCode = data.messageCode;
        err.details = data.error.details;
        throw err;
    }

    // Extract from various formats
    const messageFromData = extractMessage(data);
    const codeFromData = extractMessageCode(data);
    const d = data as Record<string, unknown>;
    const detail = d?.detail as Record<string, unknown> | undefined;
    const detailsFromData = detail?.details as Record<string, unknown> | undefined;

    const throwWithMessage = (fallbackCode: string): never => {
        const err = new Error(messageFromData || fallbackCode) as ApiError;
        err.statusCode = status;
        err.code = codeFromData || fallbackCode;
        err.messageCode = err.code;
        if (detailsFromData) {
            err.details = detailsFromData;
        }
        throw err;
    };

    // Check unified error format (legacy)
    if (detail && typeof detail === 'object' && detail.code) {
        const originalError = (detail.details as Record<string, unknown>)?.original_error as string | undefined;
        const errorMessage = originalError || (detail.message as string) || defaultMessage;
        const enhancedError = new Error(errorMessage) as ApiError;
        enhancedError.code = detail.code as string;
        enhancedError.messageCode = detail.code as string;
        enhancedError.details = detail.details as Record<string, unknown>;
        enhancedError.statusCode = status;
        throw enhancedError;
    }

    // Handle by status code
    switch (status) {
        case 400:
            throwWithMessage('INVALID_REQUEST');
            break;
        case 401:
            throwWithMessage('UNAUTHORIZED');
            break;
        case 403:
            throwWithMessage('FORBIDDEN');
            break;
        case 404:
            throwWithMessage('RESOURCE_NOT_FOUND');
            break;
        case 408:
            throwWithMessage('TIMEOUT_ERROR');
            break;
        case 413:
            throwWithMessage('FILE_TOO_LARGE');
            break;
        case 422:
            throwWithMessage('VALIDATION_ERROR');
            break;
        case 500:
            throwWithMessage('INTERNAL_ERROR');
            break;
        case 502:
            throwWithMessage('BAD_GATEWAY');
            break;
        case 503:
            throwWithMessage('SERVICE_UNAVAILABLE');
            break;
        default:
            throwWithMessage(defaultMessage);
    }
};

export default apiClient;
