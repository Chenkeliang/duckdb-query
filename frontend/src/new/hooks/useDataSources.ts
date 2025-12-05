import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listAllDataSources, listDatabaseConnections } from '@/services/apiClient';

/**
 * 数据源查询 Hook（包括数据库连接和文件数据源）
 * 
 * 特性：
 * - 自动请求去重
 * - 智能缓存（5 分钟）
 * - 优先使用缓存
 * - 提供手动刷新方法
 * 
 * 使用示例：
 * ```tsx
 * const { dataSources, isLoading, refresh } = useDataSources();
 * ```
 */

export interface DataSource {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  status?: string;
  createdAt?: string;
  [key: string]: any;
}

export const DATA_SOURCES_QUERY_KEY = ['data-sources'] as const;

export const useDataSources = (filters = {}) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...DATA_SOURCES_QUERY_KEY, filters],
    queryFn: () => listAllDataSources(filters),
    staleTime: 5 * 60 * 1000, // 5 分钟
    gcTime: 10 * 60 * 1000, // 10 分钟
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  const dataSources: DataSource[] = Array.isArray(query.data?.datasources) 
    ? query.data.datasources 
    : [];

  const refresh = async () => {
    return queryClient.invalidateQueries({ queryKey: DATA_SOURCES_QUERY_KEY });
  };

  return {
    dataSources,
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    refresh,
  };
};

/**
 * 使数据源缓存失效的工具函数
 */
export const invalidateDataSources = (queryClient: ReturnType<typeof useQueryClient>) => {
  return queryClient.invalidateQueries({ queryKey: DATA_SOURCES_QUERY_KEY });
};

/**
 * 数据库连接查询 Hook
 * 
 * 特性：
 * - 自动请求去重
 * - 智能缓存（5 分钟）
 * - 优先使用缓存
 * 
 * 使用示例：
 * ```tsx
 * const { connections, isLoading, refresh } = useDatabaseConnections();
 * ```
 */

export interface DatabaseConnection {
  id: string;
  name: string;
  type: string;
  params: Record<string, any>;
  createdAt?: string;
  [key: string]: any;
}

export const DATABASE_CONNECTIONS_QUERY_KEY = ['database-connections'] as const;

export const useDatabaseConnections = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: DATABASE_CONNECTIONS_QUERY_KEY,
    queryFn: listDatabaseConnections,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  const connections: DatabaseConnection[] = Array.isArray(query.data?.connections)
    ? query.data.connections
    : [];

  const refresh = async () => {
    return queryClient.invalidateQueries({ queryKey: DATABASE_CONNECTIONS_QUERY_KEY });
  };

  return {
    connections,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    refresh,
  };
};

/**
 * 使数据库连接缓存失效的工具函数
 */
export const invalidateDatabaseConnections = (queryClient: ReturnType<typeof useQueryClient>) => {
  return queryClient.invalidateQueries({ queryKey: DATABASE_CONNECTIONS_QUERY_KEY });
};
