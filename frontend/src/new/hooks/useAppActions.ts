/**
 * useAppActions Hook
 * 
 * 提供全局操作，包括刷新数据、数据库连接操作。
 * 
 * ⚠️ 关键兼容性要求：
 * 1. 数据库连接必须保留"先测试后创建"流程
 * 2. 缓存失效必须使用 cacheInvalidation 工具函数
 * 3. 返回 connection 字段与旧接口一致
 */

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    invalidateAllDataCaches,
    invalidateAfterDatabaseChange,
} from '@/new/utils/cacheInvalidation';
import {
    testDatabaseConnection,
    refreshDatabaseConnection,
    createDatabaseConnection,
} from '@/api';

export interface DatabaseConnectParams {
    type: 'mysql' | 'postgresql' | 'sqlite';
    id?: string;
    name?: string;
    params: {
        host?: string;
        port?: number;
        database?: string;
        username?: string;
        password?: string;
        path?: string; // SQLite
        schema?: string; // PostgreSQL
        [key: string]: unknown;
    };
    useStoredPassword?: boolean;
}

export interface DatabaseConnectResult {
    success: boolean;
    message?: string;
    connection?: unknown; // API 返回的连接对象
}

export interface UseAppActionsReturn {
    /** 刷新所有数据（使用 invalidateAllDataCaches） */
    refreshAllData: () => Promise<void>;

    /** 
     * 数据库连接操作：
     * - 新建时：先测试后创建
     * - 已保存且用存储密码：使用 refresh
     */
    handleDatabaseConnect: (params: DatabaseConnectParams) => Promise<DatabaseConnectResult>;

    /** 保存数据库连接配置（无测试） */
    handleDatabaseSaveConfig: (params: DatabaseConnectParams) => Promise<DatabaseConnectResult>;

    /** 刷新中状态 */
    isRefreshing: boolean;
}

/**
 * 全局操作 Hook
 * 
 * @example
 * ```tsx
 * const { refreshAllData, handleDatabaseConnect, isRefreshing } = useAppActions();
 * 
 * // 全局刷新
 * <Button onClick={refreshAllData} disabled={isRefreshing}>
 *   刷新数据
 * </Button>
 * 
 * // 数据库连接
 * const result = await handleDatabaseConnect({
 *   type: 'mysql',
 *   params: { host: 'localhost', port: 3306, ... }
 * });
 * if (result.success) {
 *   toast.success(result.message);
 * } else {
 *   toast.error(result.message);
 * }
 * ```
 */
export function useAppActions(): UseAppActionsReturn {
    const queryClient = useQueryClient();
    const [isRefreshing, setIsRefreshing] = useState(false);

    // 全局刷新 - 使用 cacheInvalidation 工具
    const refreshAllData = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await invalidateAllDataCaches(queryClient);
        } finally {
            setIsRefreshing(false);
        }
    }, [queryClient]);

    // 数据库连接操作 - 保留"先测试后创建"流程
    const handleDatabaseConnect = useCallback(async (
        params: DatabaseConnectParams
    ): Promise<DatabaseConnectResult> => {
        try {
            // 情况 1：已保存连接且使用存储密码 -> 使用 refresh
            if (params.useStoredPassword && params.id) {
                const refreshResult = await refreshDatabaseConnection(params.id);

                if (!refreshResult?.success) {
                    return {
                        success: false,
                        message: refreshResult?.message || '数据库连接刷新失败',
                    };
                }

                // 刷新缓存
                await invalidateAfterDatabaseChange(queryClient);

                return {
                    success: true,
                    message: refreshResult.message || '数据库连接成功',
                    connection: refreshResult.connection,
                };
            }

            // 情况 2：新建连接 -> 先测试后创建
            // 步骤 2a：测试连接
            const testResult = await testDatabaseConnection({
                type: params.type,
                params: params.params,
            });

            if (!testResult?.success) {
                // ⚠️ 关键：返回"测试失败"而非"创建失败"
                return {
                    success: false,
                    message: testResult?.message || '数据库连接测试失败',
                };
            }

            // 步骤 2b：测试成功，创建连接
            const createPayload = {
                id: params.id,
                name: params.name || `${params.type}-connection`,
                type: params.type,
                params: params.params,
            };

            const createResult = await createDatabaseConnection(createPayload);

            if (!createResult?.success) {
                return {
                    success: false,
                    message: createResult?.message || '数据库连接创建失败',
                };
            }

            // 刷新缓存 - 使用专用工具函数
            await invalidateAfterDatabaseChange(queryClient);

            return {
                success: true,
                message: createResult.message || '数据库连接成功',
                connection: createResult.connection, // 注意：API 返回 result.connection
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : '连接失败',
            };
        }
    }, [queryClient]);

    // 保存连接配置（仅保存，不测试）
    const handleDatabaseSaveConfig = useCallback(async (
        params: DatabaseConnectParams
    ): Promise<DatabaseConnectResult> => {
        try {
            const payload = {
                id: params.id,
                name: params.name || `${params.type}-connection`,
                type: params.type,
                params: params.params,
            };

            const result = await createDatabaseConnection(payload);

            if (result?.success) {
                // 刷新缓存 - 使用专用工具函数
                await invalidateAfterDatabaseChange(queryClient);
            }

            return {
                success: result?.success ?? false,
                message: result?.message,
                connection: result?.connection, // 与 handleDatabaseConnect 保持一致
            };
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : '保存失败',
            };
        }
    }, [queryClient]);

    return {
        refreshAllData,
        handleDatabaseConnect,
        handleDatabaseSaveConfig,
        isRefreshing,
    };
}

export default useAppActions;
