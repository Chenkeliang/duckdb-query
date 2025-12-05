import { useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * 数据库连接类型
 */
export interface DatabaseConnection {
  id: string;
  name: string;
  type: 'postgresql' | 'mysql' | 'sqlite' | 'sqlserver';
  subtype?: string;
  status: 'active' | 'inactive' | 'error';
  params?: {
    host?: string;
    port?: number;
    database?: string;
    schema?: string;
  };
}

/**
 * API 响应类型
 */
interface DatabaseConnectionsResponse {
  success: boolean;
  data?: {
    items: DatabaseConnection[];
    total: number;
  };
  // 兼容旧格式
  datasources?: DatabaseConnection[];
}

/**
 * QueryKey 常量
 */
export const DATABASE_CONNECTIONS_QUERY_KEY = ['database-connections'] as const;

/**
 * 获取数据库连接列表
 */
const fetchDatabaseConnections = async (): Promise<DatabaseConnection[]> => {
  const response = await fetch('/api/datasources/databases/list');
  
  if (!response.ok) {
    throw new Error('获取数据库连接列表失败');
  }
  
  const data: DatabaseConnectionsResponse = await response.json();
  
  // 兼容新旧 API 格式
  if (data.data?.items) {
    return data.data.items;
  }
  
  if (data.datasources) {
    return data.datasources;
  }
  
  return [];
};

/**
 * 数据库连接列表 Hook
 * 
 * 特性：
 * - 自动请求去重
 * - 智能缓存（10 分钟）
 * - 提供手动刷新方法
 * 
 * 使用示例：
 * ```tsx
 * const { connections, isLoading, refresh } = useDatabaseConnections();
 * ```
 */
export const useDatabaseConnections = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: DATABASE_CONNECTIONS_QUERY_KEY,
    queryFn: fetchDatabaseConnections,
    staleTime: 10 * 60 * 1000, // 10 分钟
    gcTime: 15 * 60 * 1000, // 15 分钟
    refetchOnWindowFocus: true,
    refetchOnMount: false, // 优先使用缓存
  });

  const connections = Array.isArray(query.data) ? query.data : [];

  // 提供强制刷新方法
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: DATABASE_CONNECTIONS_QUERY_KEY });
    return query.refetch();
  };

  return {
    connections,
    isLoading: query.isLoading,
    isFetching: query.isFetching, // 后台刷新状态
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    refresh,
  };
};

/**
 * 导出缓存失效工具函数
 */
export const invalidateDatabaseConnections = (
  queryClient: ReturnType<typeof useQueryClient>
) => {
  return queryClient.invalidateQueries({ queryKey: DATABASE_CONNECTIONS_QUERY_KEY });
};
