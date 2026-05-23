/**
 * API Client Configuration
 *
 * Shared axios instance and utilities for API calls.
 * Preserves all existing axios features (interceptors, timeouts, progress, etc.)
 */

import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
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

// 全局错误归一化
const normalizeAxiosError = (error: AxiosError): AxiosError & ApiError => {
    const respData = error.response?.data;
    const message = extractMessage(respData) || error.message || 'OPERATION_FAILED';
    const code = extractMessageCode(respData) || error.code || 'OPERATION_FAILED';
    const errorPayload = (respData as Record<string, unknown> | undefined)?.error;
    const details =
        errorPayload &&
        typeof errorPayload === 'object' &&
        'details' in errorPayload
            ? (errorPayload as { details?: Record<string, unknown> }).details
            : undefined;

    const enhanced = error as AxiosError & ApiError;
    enhanced.message = message;
    enhanced.statusCode = error.response?.status;
    enhanced.code = code;
    enhanced.messageCode = code;
    if (details) {
        enhanced.details = details as Record<string, unknown>;
    }
    return enhanced;
};

// 统一响应拦截：成功直返，失败归一化抛出 ApiError
apiClient.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
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
        return Promise.reject(normalizeAxiosError(error));
    }
);

uploadClient.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
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
        return Promise.reject(normalizeAxiosError(error));
    }
);

/**
 * Extract error message from various response formats
 */
export const extractMessage = (payload: unknown): string => {
    if (!payload) return '';
    if (typeof payload === 'string') return payload;

    const p = payload as Record<string, unknown>;

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

/** Resolve API error code from thrown values (ApiError, axios-enhanced errors, etc.). */
export function getApiErrorCode(error: unknown, fallback = 'OPERATION_FAILED'): string {
    if (error && typeof error === 'object') {
        const e = error as ApiError;
        if (typeof e.code === 'string' && e.code) return e.code;
        if (typeof e.messageCode === 'string' && e.messageCode) return e.messageCode;
    }
    return fallback;
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
 * Handles standard envelope and minimal legacy `{ success, data }` (no messageCode/timestamp).
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
            const legacyCode = (p.messageCode as string) || 'OPERATION_SUCCESS';
            const legacyData = (p.data ?? payload) as Record<string, unknown> | undefined;
            const connectionTest = legacyData?.connection_test as { success?: boolean } | undefined;
            const testResult = legacyData?.test_result as { success?: boolean } | undefined;
            const innerFailure =
                (typeof legacyCode === 'string' && legacyCode.endsWith('_FAILED')) ||
                (legacyData &&
                    (connectionTest?.success === false ||
                        legacyData.refresh_success === false ||
                        testResult?.success === false));
            if (innerFailure) {
                const err = new Error(extractMessage(payload) || 'OPERATION_FAILED') as ApiError;
                err.code = legacyCode.endsWith('_FAILED') ? legacyCode : 'OPERATION_FAILED';
                err.messageCode = err.code;
                err.statusCode = response.status;
                err.details = legacyData as Record<string, unknown> | undefined;
                throw err;
            }

            return {
                data: legacyData as T,
                messageCode: legacyCode,
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

        if (parsed && typeof parsed === 'object' && parsed.success === false) {
            const code = extractMessageCode(parsed) || 'OPERATION_FAILED';
            const message = extractMessage(parsed) || 'OPERATION_FAILED';
            const errObj = (parsed as Record<string, unknown>).error as Record<string, unknown> | undefined;
            return {
                success: false,
                error: {
                    code,
                    message,
                    details: errObj?.details as Record<string, unknown> | undefined,
                },
                messageCode: code,
                message,
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
export const handleApiError = (error: AxiosError, defaultMessage = 'OPERATION_FAILED'): void => {
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

    const messageFromData = extractMessage(data);
    const codeFromData = extractMessageCode(data);
    const detailsFromData = (data as Record<string, unknown>)?.error as Record<string, unknown> | undefined;
    const nestedDetails = detailsFromData?.details as Record<string, unknown> | undefined;

    const throwWithMessage = (fallbackCode: string): never => {
        const err = new Error(messageFromData || fallbackCode) as ApiError;
        err.statusCode = status;
        err.code = codeFromData || fallbackCode;
        err.messageCode = err.code;
        if (nestedDetails) {
            err.details = nestedDetails;
        }
        throw err;
    };

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
    throwWithMessage(defaultMessage);
};

export default apiClient;
