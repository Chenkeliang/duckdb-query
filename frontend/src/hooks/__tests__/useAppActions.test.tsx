/**
 * useAppActions Hook 测试
 *
 * 测试全局操作：刷新数据、数据库连接（先测试后创建）
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppActions } from '../useAppActions';
import * as apiClient from '@/api';
import type { DatabaseConnection, NormalizedResponse } from '@/api';
import * as cacheInvalidation from '@/utils/cacheInvalidation';

// Mock dependencies
vi.mock('@/api');
vi.mock('@/utils/cacheInvalidation');

/** 与 `createDatabaseConnection` → `normalizeResponse` 解包形状一致 */
function mockNormalizedCreate(
    connection: Partial<DatabaseConnection> & { id: string },
    message = 'ok'
): NormalizedResponse<{ connection?: DatabaseConnection }> {
    return {
        message,
        messageCode: 'OPERATION_SUCCESS',
        data: {
            connection: {
                id: connection.id,
                name: connection.name ?? 'test-connection',
                type: connection.type ?? 'mysql',
                status: connection.status ?? 'active',
                params: connection.params ?? {},
            },
        },
        timestamp: new Date().toISOString(),
        raw: {},
    };
}

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });

    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

describe('useAppActions', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // 默认 mock 成功
        vi.mocked(cacheInvalidation.invalidateAllDataCaches).mockResolvedValue(undefined);
        vi.mocked(cacheInvalidation.invalidateAfterDatabaseChange).mockResolvedValue(undefined);
    });

    describe('refreshAllData', () => {
        it('应该调用 invalidateAllDataCaches', async () => {
            const { result } = renderHook(() => useAppActions(), {
                wrapper: createWrapper(),
            });

            await act(async () => {
                await result.current.refreshAllData();
            });

            expect(cacheInvalidation.invalidateAllDataCaches).toHaveBeenCalled();
        });

        it('isRefreshing 应该正确切换', async () => {
            const { result } = renderHook(() => useAppActions(), {
                wrapper: createWrapper(),
            });

            expect(result.current.isRefreshing).toBe(false);

            let refreshPromise: Promise<void>;

            act(() => {
                refreshPromise = result.current.refreshAllData();
            });

            expect(result.current.isRefreshing).toBe(true);

            await act(async () => {
                await refreshPromise;
            });

            expect(result.current.isRefreshing).toBe(false);
        });
    });

    describe('handleDatabaseConnect - 先测试后创建', () => {
        it('新建连接应该先测试后创建', async () => {
            vi.mocked(apiClient.testDatabaseConnection).mockResolvedValue({
                success: true,
                message: '连接测试成功',
            });

            vi.mocked(apiClient.createDatabaseConnection).mockResolvedValue(
                mockNormalizedCreate({ id: '123' }, '连接创建成功')
            );

            const { result } = renderHook(() => useAppActions(), {
                wrapper: createWrapper(),
            });

            const connectResult = await act(async () => {
                return result.current.handleDatabaseConnect({
                    type: 'mysql',
                    params: {
                        host: 'localhost',
                        port: 3306,
                        database: 'test',
                        username: 'root',
                        password: 'password',
                    },
                });
            });

            // 验证调用顺序
            expect(apiClient.testDatabaseConnection).toHaveBeenCalledBefore(
                apiClient.createDatabaseConnection as unknown as ReturnType<typeof vi.fn>
            );

            expect(connectResult.success).toBe(true);
            expect(connectResult.connection).toEqual(
                expect.objectContaining({ id: '123' })
            );
        });

        it('测试失败时不应该调用 createDatabaseConnection', async () => {
            vi.mocked(apiClient.testDatabaseConnection).mockResolvedValue({
                success: false,
                message: '连接被拒绝',
            });

            const { result } = renderHook(() => useAppActions(), {
                wrapper: createWrapper(),
            });

            const connectResult = await act(async () => {
                return result.current.handleDatabaseConnect({
                    type: 'mysql',
                    params: {
                        host: 'localhost',
                        port: 3306,
                        database: 'test',
                        username: 'root',
                        password: 'wrong',
                    },
                });
            });

            expect(connectResult.success).toBe(false);
            // 关键：测试失败时，不应该调用 createDatabaseConnection
            expect(apiClient.createDatabaseConnection).not.toHaveBeenCalled();
            // API 返回的消息应该被传递
            expect(connectResult.message).toBe('连接被拒绝');
        });

        it('测试失败无消息时应该使用默认消息', async () => {
            vi.mocked(apiClient.testDatabaseConnection).mockResolvedValue({
                success: false,
            });

            const { result } = renderHook(() => useAppActions(), {
                wrapper: createWrapper(),
            });

            const connectResult = await act(async () => {
                return result.current.handleDatabaseConnect({
                    type: 'mysql',
                    params: { host: 'localhost' },
                });
            });

            expect(connectResult.success).toBe(false);
            // 无消息时应该使用默认的"测试失败"消息
            expect(connectResult.message).toContain('测试');
        });

        it('创建失败应该返回"创建失败"消息', async () => {
            vi.mocked(apiClient.testDatabaseConnection).mockResolvedValue({
                success: true,
            });

            vi.mocked(apiClient.createDatabaseConnection).mockRejectedValue(
                Object.assign(new Error('数据库连接创建失败'), {
                    messageCode: 'CREATE_FAILED',
                })
            );

            const { result } = renderHook(() => useAppActions(), {
                wrapper: createWrapper(),
            });

            const connectResult = await act(async () => {
                return result.current.handleDatabaseConnect({
                    type: 'mysql',
                    params: {
                        host: 'localhost',
                        port: 3306,
                        database: 'test',
                        username: 'root',
                        password: 'password',
                    },
                });
            });

            expect(connectResult.success).toBe(false);
            expect(connectResult.message).toContain('创建');
        });

        it('使用存储密码的已保存连接应先测试再创建（不调用 refresh）', async () => {
            vi.mocked(apiClient.testDatabaseConnection).mockResolvedValue({
                success: true,
                message: '测试成功',
            });
            vi.mocked(apiClient.createDatabaseConnection).mockResolvedValue(
                mockNormalizedCreate({ id: 'saved-123' }, '连接成功')
            );

            const { result } = renderHook(() => useAppActions(), {
                wrapper: createWrapper(),
            });

            const connectResult = await act(async () => {
                return result.current.handleDatabaseConnect({
                    type: 'mysql',
                    id: 'saved-123',
                    useStoredPassword: true,
                    params: {},
                });
            });

            expect(apiClient.testDatabaseConnection).toHaveBeenCalled();
            expect(apiClient.createDatabaseConnection).toHaveBeenCalled();
            expect(apiClient.refreshDatabaseConnection).not.toHaveBeenCalled();
            expect(connectResult.success).toBe(true);
            expect(connectResult.connection).toEqual(
                expect.objectContaining({ id: 'saved-123' })
            );
        });
    });

    describe('缓存失效', () => {
        it('连接成功后应该调用 invalidateAfterDatabaseChange', async () => {
            vi.mocked(apiClient.testDatabaseConnection).mockResolvedValue({ success: true });
            vi.mocked(apiClient.createDatabaseConnection).mockResolvedValue(
                mockNormalizedCreate({ id: '123' })
            );

            const { result } = renderHook(() => useAppActions(), {
                wrapper: createWrapper(),
            });

            await act(async () => {
                await result.current.handleDatabaseConnect({
                    type: 'mysql',
                    params: { host: 'localhost' },
                });
            });

            expect(cacheInvalidation.invalidateAfterDatabaseChange).toHaveBeenCalled();
        });

        it('已保存连接测试+创建成功后应调用 invalidateAfterDatabaseChange', async () => {
            vi.mocked(apiClient.testDatabaseConnection).mockResolvedValue({ success: true });
            vi.mocked(apiClient.createDatabaseConnection).mockResolvedValue(
                mockNormalizedCreate({ id: 'saved-123' })
            );

            const { result } = renderHook(() => useAppActions(), {
                wrapper: createWrapper(),
            });

            await act(async () => {
                await result.current.handleDatabaseConnect({
                    type: 'mysql',
                    id: 'saved-123',
                    useStoredPassword: true,
                    params: {},
                });
            });

            expect(cacheInvalidation.invalidateAfterDatabaseChange).toHaveBeenCalled();
        });
    });

    describe('handleDatabaseSaveConfig', () => {
        it('应该保存配置并刷新缓存', async () => {
            vi.mocked(apiClient.createDatabaseConnection).mockResolvedValue(
                mockNormalizedCreate({ id: 'config-123' }, '保存成功')
            );

            const { result } = renderHook(() => useAppActions(), {
                wrapper: createWrapper(),
            });

            const saveResult = await act(async () => {
                return result.current.handleDatabaseSaveConfig({
                    type: 'postgresql',
                    name: 'my-connection',
                    params: {
                        host: 'localhost',
                        port: 5432,
                        database: 'test',
                    },
                });
            });

            expect(apiClient.createDatabaseConnection).toHaveBeenCalled();
            expect(cacheInvalidation.invalidateAfterDatabaseChange).toHaveBeenCalled();
            expect(saveResult.success).toBe(true);
            expect(saveResult.connection).toEqual(
                expect.objectContaining({ id: 'config-123' })
            );
        });
    });

    describe('错误处理', () => {
        it('异常应该返回失败结果', async () => {
            vi.mocked(apiClient.testDatabaseConnection).mockRejectedValue(
                new Error('Network error')
            );

            const { result } = renderHook(() => useAppActions(), {
                wrapper: createWrapper(),
            });

            const connectResult = await act(async () => {
                return result.current.handleDatabaseConnect({
                    type: 'mysql',
                    params: { host: 'localhost' },
                });
            });

            expect(connectResult.success).toBe(false);
            expect(connectResult.message).toContain('Network error');
        });
    });
});
