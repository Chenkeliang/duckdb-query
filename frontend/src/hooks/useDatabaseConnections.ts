import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCacheConfig } from '../utils/cacheConfig';
import { listDatabaseDataSourcesRaw, type RawDatabaseDataSourceItem } from '@/api';

/**
 * 数据库类型
 */
export type DatabaseType = 'postgresql' | 'mysql' | 'sqlite' | 'sqlserver';

/**
 * 数据库连接类型
 */
export interface DatabaseConnection {
  /** 原始 ID（不带 db_ 前缀） */
  id: string;
  /** 连接名称 */
  name: string;
  /** 数据库类型（从 API 的 subtype 映射） */
  type: DatabaseType;
  /** 连接状态 */
  status: 'active' | 'inactive' | 'error';
  /** 连接参数 */
  params: {
    host?: string;
    port?: number;
    database?: string;
    schema?: string;
    username?: string;
  };
  /** 是否需要密码（已加密存储） */
  requiresPassword?: boolean;
  /** 创建时间 */
  createdAt?: string;
}

/**
 * QueryKey 常量
 */
export const DATABASE_CONNECTIONS_QUERY_KEY = ['database-connections'] as const;

/**
 * 去除 ID 的 db_ 前缀
 */
const stripDbPrefix = (id: string): string => {
  return id?.replace(/^db_/, '') || id;
};

/**
 * 转换 API 响应项为 DatabaseConnection
 */
const transformApiItem = (item: RawDatabaseDataSourceItem): DatabaseConnection => {
  const connectionInfo = item.connection_info || {};
  const metadata = item.metadata || {};

  // 提取用户名（兼容多种字段）
  const username =
    connectionInfo.username ||
    (connectionInfo as Record<string, unknown>).user as string ||
    (metadata as Record<string, unknown>).username as string ||
    (metadata as Record<string, unknown>).user as string;

  // 检查是否已存储加密密码
  const password = connectionInfo.password;
  const requiresPassword = password === "***ENCRYPTED***";

  return {
    id: stripDbPrefix(item.id),
    name: item.name,
    type: item.subtype as DatabaseType,
    status: (item.status as DatabaseConnection['status']) || 'inactive',
    requiresPassword,
    params: {
      host: connectionInfo.host,
      port: connectionInfo.port,
      database: connectionInfo.database,
      username: username,
      schema: connectionInfo.schema || (metadata as Record<string, unknown>).schema as string,
      ...metadata,
    },
    createdAt: item.created_at,
  };
};

/**
 * 获取数据库连接列表
 */
const fetchDatabaseConnections = async (): Promise<DatabaseConnection[]> => {
  const result = await listDatabaseDataSourcesRaw();

  if (!result.success) {
    throw new Error('Failed to get database connections');
  }

  return result.items.map(transformApiItem);
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
  const cacheConfig = getCacheConfig();

  const query = useQuery({
    queryKey: DATABASE_CONNECTIONS_QUERY_KEY,
    queryFn: fetchDatabaseConnections,
    staleTime: cacheConfig.staleTime, // 使用可配置的缓存时间
    gcTime: cacheConfig.gcTime, // 使用可配置的缓存时间
    refetchOnWindowFocus: false, // 禁用窗口聚焦时自动刷新（避免重复请求）
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
