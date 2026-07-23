/**
 * 应用配置 Hook
 *
 * 获取后端应用配置，如最大文件大小、最大查询行数等
 * 使用现有的 /api/app-config/features 端点
 *
 * 使用示例：
 * ```tsx
 * const { config, isLoading, maxFileSizeDisplay } = useAppConfig();
 * ```
 */

import { useQuery } from '@tanstack/react-query';
import { setFederatedQueryTimeout, getAppConfig } from '@/api';
import { DEFAULT_MAX_QUERY_ROWS } from '@/constants/queryLimits';

// 配置数据类型
export interface AppConfig {
  enablePivotTables: boolean;
  pivotTableExtension: string;
  maxQueryRows: number;
  pivotMaxColumns: number;
  maxFileSize: number;
  maxFileSizeDisplay: string;
  federatedQueryTimeout: number; // ms
  jsonImportColumnType: string;
  remoteStorageConfigured: boolean;
}

// Query Key
export const APP_CONFIG_QUERY_KEY = ['app-config'] as const;

// 默认配置（后备值）
const DEFAULT_CONFIG: AppConfig = {
  enablePivotTables: true,
  pivotTableExtension: 'pivot_table',
  maxQueryRows: DEFAULT_MAX_QUERY_ROWS,
  pivotMaxColumns: 300,
  maxFileSize: 500 * 1024 * 1024, // 500MB
  maxFileSizeDisplay: '500MB',
  federatedQueryTimeout: 300000, // 5 minutes
  jsonImportColumnType: 'auto',
  remoteStorageConfigured: false,
};

// 获取应用配置的 API 函数
async function fetchAppConfig(): Promise<AppConfig> {
  const result = await getAppConfig();

  const config = {
    enablePivotTables: result.config.enable_pivot_tables,
    pivotTableExtension: result.config.pivot_table_extension,
    maxQueryRows: result.config.max_query_rows,
    pivotMaxColumns: result.config.pivot_max_columns ?? 300,
    maxFileSize: result.config.max_file_size,
    maxFileSizeDisplay: result.config.max_file_size_display,
    federatedQueryTimeout: (result.config.federated_query_timeout || 300) * 1000,
    jsonImportColumnType: result.config.json_import_column_type || 'auto',
    remoteStorageConfigured: Boolean(result.config.remote_storage_configured),
  };

  // 更新 API Client 的超时设置
  setFederatedQueryTimeout(config.federatedQueryTimeout);

  return config;
}

/**
 * 应用配置 Hook
 */
export function useAppConfig() {
  const query = useQuery({
    queryKey: APP_CONFIG_QUERY_KEY,
    queryFn: fetchAppConfig,
    staleTime: 30 * 60 * 1000, // 30 分钟 - 配置很少变化
    gcTime: 60 * 60 * 1000, // 1 小时
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 2,
  });

  // 使用查询结果或默认值
  const config = query.data ?? DEFAULT_CONFIG;

  return {
    config,
    enablePivotTables: config.enablePivotTables,
    pivotTableExtension: config.pivotTableExtension,
    maxQueryRows: config.maxQueryRows,
    pivotMaxColumns: config.pivotMaxColumns,
    maxFileSize: config.maxFileSize,
    maxFileSizeDisplay: config.maxFileSizeDisplay,
    jsonImportColumnType: config.jsonImportColumnType,
    remoteStorageConfigured: config.remoteStorageConfigured,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
}

export default useAppConfig;
