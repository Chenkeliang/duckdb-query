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

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  invalidateAllDataCaches,
  invalidateAfterDatabaseChange
} from "@/utils/cacheInvalidation";
import { testDatabaseConnection, createDatabaseConnection } from "@/api";

export interface DatabaseConnectParams {
  type: "mysql" | "postgresql" | "sqlite";
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
  handleDatabaseConnect: (
    params: DatabaseConnectParams
  ) => Promise<DatabaseConnectResult>;

  /** 保存数据库连接配置（无测试） */
  handleDatabaseSaveConfig: (
    params: DatabaseConnectParams
  ) => Promise<DatabaseConnectResult>;

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
  const handleDatabaseConnect = useCallback(
    async (params: DatabaseConnectParams): Promise<DatabaseConnectResult> => {
      try {
        // 统一连接流程：不使用 refresh，全部先测试后创建
        // 若传入 id 且未填写新密码，后端会基于 id 合并已存储的加密密码
        const testResult = await testDatabaseConnection({
          id: params.id,
          name: params.name || `${params.type}-connection`,
          type: params.type,
          params: params.params,
          useStoredPassword: params.useStoredPassword
        });

        if (!testResult?.success) {
          // ⚠️ 关键：返回"测试失败"而非"创建失败"
          return {
            success: false,
            message: testResult?.message || "数据库连接测试失败"
          };
        }

        // 步骤 2b：测试成功，创建连接
        const createPayload = {
          id: params.id,
          name: params.name || `${params.type}-connection`,
          type: params.type,
          params: params.params
        };

        // createDatabaseConnection 使用 normalizeResponse
        // 成功时返回 StandardSuccess.data
        // 失败（包括 CONNECTION_TEST_FAILED）会抛出 ApiError，由 catch 捕获
        const createResult = await createDatabaseConnection(createPayload, {
          test: true
        });

        // 刷新缓存 - 使用专用工具函数
        await invalidateAfterDatabaseChange(queryClient);

        return {
          success: true,
          message: createResult.message || "数据库连接成功",
          connection: createResult.data?.connection
        };
      } catch (error) {
        // 处理 "保存成功但测试失败" 的特殊情况
        // 后端返回标准错误响应，code=CONNECTION_TEST_FAILED，但 details 中包含 connection
        if (
          error?.messageCode === "CONNECTION_TEST_FAILED" &&
          error?.details?.connection
        ) {
          // 即使测试失败，只要保存成功了，我们也应该刷新列表
          await invalidateAfterDatabaseChange(queryClient);

          return {
            success: false, // 标记为失败，触发红色 Toast
            message: error?.message || "配置已保存，但连接测试失败",
            connection: error.details.connection
          };
        }

        return {
          success: false,
          message: error?.message || "连接失败"
        };
      }
    },
    [queryClient]
  );

  // 保存连接配置（仅保存，不测试）
  const handleDatabaseSaveConfig = useCallback(
    async (params: DatabaseConnectParams): Promise<DatabaseConnectResult> => {
      try {
        const payload = {
          id: params.id,
          name: params.name || `${params.type}-connection`,
          type: params.type,
          params: params.params
        };

        // 明确指定 skip_test=true (test: false)以避免触发连接测试失败
        // 这样即使用户输入的配置暂时无法连接，也能成功保存
        const result = await createDatabaseConnection(payload, { test: false });

        // 刷新缓存
        await invalidateAfterDatabaseChange(queryClient);

        return {
          success: true,
          message: result.message || "配置保存成功",
          connection: result.data?.connection
        };
      } catch (error) {
        // 虽然这里使用了 test: false，但如果后端依然返回了测试失败错误（防御性编程）
        // 我们依然应该刷新列表并显示警告，而不是直接失败
        if (
          error?.messageCode === "CONNECTION_TEST_FAILED" &&
          error?.details?.connection
        ) {
          await invalidateAfterDatabaseChange(queryClient);
          return {
            success: false,
            message: error?.message || "配置已保存，但连接测试失败",
            connection: error.details.connection
          };
        }

        return {
          success: false,
          message: error instanceof Error ? error.message : "保存失败"
        };
      }
    },
    [queryClient]
  );

  return {
    refreshAllData,
    handleDatabaseConnect,
    handleDatabaseSaveConfig,
    isRefreshing
  };
}

export default useAppActions;
