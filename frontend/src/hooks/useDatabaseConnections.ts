import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCacheConfig } from '../utils/cacheConfig';

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
 * API 响应中的原始数据源项
 */
interface ApiDataSourceItem {
  id: string;
  name: string;
  type: string;           // 固定为 "database"
  subtype: DatabaseType;  // 真实数据库类型
  status?: string;
  connection_info?: {
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
  };
  metadata?: Record<string, unknown>;
  created_at?: string;
}

/**
 * API 响应类型
 */
interface DatabaseConnectionsResponse {
  success: boolean;
  data?: {
    items: ApiDataSourceItem[];
    total: number;
  };
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
const transformApiItem = (item: ApiDataSourceItem): DatabaseConnection => {
  const connectionInfo = item.connection_info || {};
  const metadata = item.metadata || {};

  // 提取用户名（兼容多种字段）
  const username =
    connectionInfo.username ||
    (connectionInfo as any).user ||
    (metadata as any).username ||
    (metadata as any).user;

  // 检查是否已存储加密密码
  const password = connectionInfo.password;
  const requiresPassword = password === "***ENCRYPTED***";

  return {
    id: stripDbPrefix(item.id),
    name: item.name,
    type: item.subtype,
    status: (item.status as DatabaseConnection['status']) || 'inactive',
    requiresPassword,
    params: {
      host: connectionInfo.host,
      port: connectionInfo.port,
      database: connectionInfo.database,
      username: username,
      schema: (connectionInfo as any).schema || (metadata as any).schema, // PostgreSQL schema
      ...metadata,
    },
    createdAt: item.created_at,
  };
};

/**
 * 获取数据库连接列表
 */
const fetchDatabaseConnections = async (): Promise<DatabaseConnection[]> => {
  const response = await fetch('/api/datasources/databases/list');

  if (!response.ok) {
    throw new Error('获取数据库连接列表失败');
  }

  const data: DatabaseConnectionsResponse = await response.json();

  // 正确读取 data.data.items 并转换
  const items = data.data?.items ?? [];
  return items.map(transformApiItem);
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
