/**
 * 应用配置 Hook
 * 
 * 从后端获取应用配置，包括 max_query_rows 等
 * 使用 TanStack Query 进行缓存管理
 */

import { useQuery } from '@tanstack/react-query';
import { getAppFeatures } from '@/services/apiClient';

export interface AppFeatures {
  enable_pivot_tables: boolean;
  pivot_table_extension: string;
  max_query_rows: number;
}

export const APP_CONFIG_QUERY_KEY = ['app-config', 'features'] as const;

// 默认配置（当 API 请求失败时使用）
const DEFAULT_APP_FEATURES: AppFeatures = {
  enable_pivot_tables: true,
  pivot_table_extension: 'pivot_table',
  max_query_rows: 10000,
};

export const useAppConfig = () => {
  const query = useQuery({
    queryKey: APP_CONFIG_QUERY_KEY,
    queryFn: async (): Promise<AppFeatures> => {
      const result = await getAppFeatures();
      return {
        enable_pivot_tables: result?.enable_pivot_tables ?? DEFAULT_APP_FEATURES.enable_pivot_tables,
        pivot_table_extension: result?.pivot_table_extension ?? DEFAULT_APP_FEATURES.pivot_table_extension,
        max_query_rows: result?.max_query_rows ?? DEFAULT_APP_FEATURES.max_query_rows,
      };
    },
    staleTime: 30 * 60 * 1000, // 30 分钟缓存
    gcTime: 60 * 60 * 1000, // 1 小时后清理
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 2,
  });

  return {
    config: query.data ?? DEFAULT_APP_FEATURES,
    maxQueryRows: query.data?.max_query_rows ?? DEFAULT_APP_FEATURES.max_query_rows,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
  };
};

export default useAppConfig;
