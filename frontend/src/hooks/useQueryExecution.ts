/**
 * 通用查询执行 Hook
 *
 * 提供统一的查询执行和取消能力，支持所有同步查询类型
 *
 * @example
 * ```tsx
 * const { execute, cancel, reset, state, data, error } = useQueryExecution();
 *
 * // 执行查询
 * await execute('/api/duckdb/execute', { sql: 'SELECT * FROM users' });
 *
 * // 取消查询
 * cancel();
 *
 * // 重置状态
 * reset();
 * ```
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';

/**
 * 查询执行状态
 */
export type QueryExecutionStatus = 'idle' | 'running' | 'success' | 'error' | 'cancelled';

/**
 * 查询执行状态对象
 */
export interface QueryExecutionState<T = unknown> {
    /** 当前状态 */
    status: QueryExecutionStatus;
    /** 查询结果数据 */
    data: T | null;
    /** 错误信息 */
    error: string | null;
    /** 错误消息代码（用于 i18n） */
    errorCode: string | null;
    /** 上次成功的数据（取消/错误时保留） */
    lastSuccessData: T | null;
    /** 是否正在执行 */
    isLoading: boolean;
    /** 当前请求 ID */
    requestId: string | null;
}

/**
 * 执行选项
 */
export interface ExecuteOptions {
    /** 自定义请求 ID（可选，默认自动生成） */
    requestId?: string;
    /** 额外的请求头 */
    headers?: Record<string, string>;
    /** 请求超时（毫秒） */
    timeout?: number;
}

/**
 * Hook 返回值
 */
export interface UseQueryExecutionReturn<T = unknown> {
    /** 当前状态 */
    state: QueryExecutionState<T>;
    /** 查询结果数据 */
    data: T | null;
    /** 错误信息 */
    error: string | null;
    /** 是否正在加载 */
    isLoading: boolean;
    /** 是否已取消 */
    isCancelled: boolean;
    /** 上次成功的数据 */
    lastSuccessData: T | null;

    /** 执行查询 */
    execute: (endpoint: string, payload: unknown, options?: ExecuteOptions) => Promise<T | null>;
    /** 取消当前查询 */
    cancel: () => Promise<void>;
    /** 重置状态 */
    reset: () => void;
}

/**
 * 取消请求的节流时间（毫秒）
 */
const CANCEL_DEBOUNCE_MS = 200;

/**
 * 自动取消前一请求的时间阈值（毫秒）
 */
const AUTO_CANCEL_THRESHOLD_MS = 300;

/**
 * 通用查询执行 Hook
 *
 * 提供统一的查询执行和取消能力
 */
export function useQueryExecution<T = unknown>(): UseQueryExecutionReturn<T> {
    // 状态
    const [status, setStatus] = useState<QueryExecutionStatus>('idle');
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [errorCode, setErrorCode] = useState<string | null>(null);
    const [lastSuccessData, setLastSuccessData] = useState<T | null>(null);
    const [requestId, setRequestId] = useState<string | null>(null);

    // Refs
    const abortControllerRef = useRef<AbortController | null>(null);
    const lastCancelTimeRef = useRef<number>(0);
    const lastExecuteTimeRef = useRef<number>(0);

    // 计算状态
    const state = useMemo(
        (): QueryExecutionState<T> => ({
            status,
            data,
            error,
            errorCode,
            lastSuccessData,
            isLoading: status === 'running',
            requestId,
        }),
        [status, data, error, errorCode, lastSuccessData, requestId]
    );

    // 取消当前查询
    const cancel = useCallback(async () => {
        const now = Date.now();

        // 防抖：避免快速重复点击
        if (now - lastCancelTimeRef.current < CANCEL_DEBOUNCE_MS) {
            return;
        }
        lastCancelTimeRef.current = now;

        // 中止本地请求
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }

        // 如果有 requestId，调用后端取消 API
        if (requestId) {
            try {
                await fetch(`/api/query/cancel/${requestId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
            } catch (e) {
                // 取消 API 失败不阻塞，本地已中止
                console.warn('Cancel request failed:', e);
            }
        }

        setStatus('cancelled');
        setError('查询已取消');
        setErrorCode('QUERY_CANCELLED');
    }, [requestId]);

    // 执行查询
    const execute = useCallback(
        async (endpoint: string, payload: unknown, options?: ExecuteOptions): Promise<T | null> => {
            const now = Date.now();

            // 节流：如果距离上次执行时间太短，先取消前一个请求
            if (now - lastExecuteTimeRef.current < AUTO_CANCEL_THRESHOLD_MS && abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
            lastExecuteTimeRef.current = now;

            // 生成新的 request ID
            const newRequestId = options?.requestId || uuidv4();
            setRequestId(newRequestId);

            // 创建新的 AbortController
            abortControllerRef.current = new AbortController();
            const { signal } = abortControllerRef.current;

            // 设置状态为 running
            setStatus('running');
            setError(null);
            setErrorCode(null);

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Request-ID': newRequestId,
                        ...options?.headers,
                    },
                    body: JSON.stringify(payload),
                    signal,
                });

                // 处理 499 状态码（查询被取消）
                if (response.status === 499) {
                    setStatus('cancelled');
                    setError('查询已取消');
                    setErrorCode('QUERY_CANCELLED');
                    return null;
                }

                const result = await response.json();

                // 检查响应中的取消标记（499 fallback 方案）
                if (result.messageCode === 'QUERY_CANCELLED' || result.cancelled === true) {
                    setStatus('cancelled');
                    setError(result.message || '查询已取消');
                    setErrorCode('QUERY_CANCELLED');
                    return null;
                }

                // 处理其他错误
                if (!response.ok || result.success === false) {
                    const errorMessage = result.message || result.detail || result.error?.message || '查询执行失败';
                    const code = result.messageCode || result.error?.code || 'QUERY_ERROR';
                    setStatus('error');
                    setError(errorMessage);
                    setErrorCode(code);
                    return null;
                }

                // 成功
                const resultData = result.data !== undefined ? result.data : result;
                setData(resultData as T);
                setLastSuccessData(resultData as T);
                setStatus('success');
                return resultData as T;
            } catch (e) {
                // 处理中止错误
                if (e instanceof Error && e.name === 'AbortError') {
                    setStatus('cancelled');
                    setError('查询已取消');
                    setErrorCode('QUERY_CANCELLED');
                    return null;
                }

                // 处理网络错误
                const errorMessage = e instanceof Error ? e.message : '网络请求失败';
                setStatus('error');
                setError(errorMessage);
                setErrorCode('NETWORK_ERROR');
                return null;
            } finally {
                abortControllerRef.current = null;
            }
        },
        []
    );

    // 重置状态
    const reset = useCallback(() => {
        // 中止任何进行中的请求
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }

        setStatus('idle');
        setData(null);
        setError(null);
        setErrorCode(null);
        setRequestId(null);
        // 保留 lastSuccessData
    }, []);

    return {
        state,
        data,
        error,
        isLoading: status === 'running',
        isCancelled: status === 'cancelled',
        lastSuccessData,
        execute,
        cancel,
        reset,
    };
}

export default useQueryExecution;
