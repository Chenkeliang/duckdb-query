import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDuckDBTables } from '@/services/apiClient';

/**
 * DuckDB 表列表查询 Hook
 * 
 * 特性：
 * - 自动请求去重（相同 queryKey 的请求会被合并）
 * - 智能缓存（5 分钟内不会重复请求）
 * - 优先使用缓存（refetchOnMount: false）
 * - 提供手动刷新方法
 * - 支持异步任务完成后自动刷新
 * 
 * 使用示例：
 * ```tsx
 * const { tables, isLoading, refresh } = useDuckDBTables();
 * 
 * // 异步任务完成后刷新
 * onTaskCompleted={() => {
 *   const queryClient = useQueryClient();
 *   invalidateDuckDBTables(queryClient);
 * }}
 * ```
 */

export interface Table {
  name: string;
  type: string;
  row_count?: number;
  source_type?: string;
}

export const DUCKDB_TABLES_QUERY_KEY = ['duckdb-tables'] as const;

export const useDuckDBTables = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: DUCKDB_TABLES_QUERY_KEY,
    queryFn: getDuckDBTables,
    staleTime: 5 * 60 * 1000, // 5 分钟内认为数据是新鲜的
    gcTime: 10 * 60 * 1000, // 10 分钟后清理缓存（原 cacheTime）
    refetchOnWindowFocus: false, // 禁用窗口聚焦时自动刷新（避免重复请求）
    refetchOnMount: false, // 组件挂载时不自动刷新（优先使用缓存）
    refetchOnReconnect: false, // 网络重连时不自动刷新
    retry: 2, // 失败时重试 2 次
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // 指数退避
  });

  const tables: Table[] = Array.isArray(query.data) ? query.data : [];

  // 手动刷新并清除缓存
  const refresh = async () => {
    // invalidateQueries 会自动触发 refetch，不需要再手动调用
    return queryClient.invalidateQueries({ queryKey: DUCKDB_TABLES_QUERY_KEY });
  };

  return {
    tables,
    isLoading: query.isLoading,
    isFetching: query.isFetching, // 是否正在后台刷新
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    refresh, // 强制刷新（清除缓存）
  };
};

/**
 * 使表列表缓存失效的工具函数
 * 
 * 在以下场景使用：
 * - 上传新文件后
 * - 删除表后
 * - 创建数据库连接后
 * - 异步任务完成后
 * 
 * @example
 * ```tsx
 * import { useQueryClient } from '@tanstack/react-query';
 * import { invalidateDuckDBTables } from '@/hooks/useDuckDBTables';
 * 
 * const queryClient = useQueryClient();
 * await uploadFile(file);
 * await invalidateDuckDBTables(queryClient);
 * ```
 */
export const invalidateDuckDBTables = (queryClient: ReturnType<typeof useQueryClient>) => {
  return queryClient.invalidateQueries({ queryKey: DUCKDB_TABLES_QUERY_KEY });
};
