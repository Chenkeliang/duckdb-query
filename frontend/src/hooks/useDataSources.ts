import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listAllDataSources } from '@/api';
import { getCacheConfig } from '../utils/cacheConfig';

/**
 * 数据源查询 Hook（包括数据库连接和文件数据源）
 *
 * 特性：
 * - 自动请求去重
 * - 智能缓存（使用可配置的缓存时间，默认 30 分钟）
 * - 优先使用缓存
 * - 提供手动刷新方法
 *
 * 使用示例：
 * ```tsx
 * const { dataSources, isLoading, refresh } = useDataSources();
 * ```
 */

/**
 * 数据库类型
 */
export type DatabaseType = 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver';

export interface DataSource {
  /** 原始 ID（不带 db_ 前缀） */
  id: string;
  /** 数据源名称 */
  name: string;
  /** 数据源类型（database/file 等） */
  type: string;
  /** 数据库类型（从 API 的 subtype 映射，仅 type=database 时有效） */
  dbType?: DatabaseType;
  /** 状态 */
  status?: string;
  /** 创建时间 */
  createdAt?: string;
  /** 连接参数 */
  params?: Record<string, unknown>;
}

/**
 * 去除 ID 的 db_ 前缀
 */
const stripDbPrefix = (id: string): string => {
  return id?.replace(/^db_/, '') || id;
};

export const DATA_SOURCES_QUERY_KEY = ['data-sources'] as const;

export const useDataSources = (filters?: Record<string, unknown>) => {
  const queryClient = useQueryClient();

  // ⚠️ 重要：不要把对象本身放进 queryKey（会因为引用变化导致不停 refetch）
  // 使用稳定的序列化 key，确保相同 filters 不会触发重复请求
  const filtersKey = filters ? JSON.stringify(filters) : null;

  const cacheConfig = getCacheConfig();

  const query = useQuery({
    queryKey: filtersKey ? [...DATA_SOURCES_QUERY_KEY, filtersKey] : DATA_SOURCES_QUERY_KEY,
    queryFn: () => listAllDataSources(filters ?? {}),
    staleTime: cacheConfig.staleTime, // 使用可配置的缓存时间
    gcTime: cacheConfig.gcTime, // 使用可配置的缓存时间
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  // 修复：正确读取 data.data.items 路径
  const items = query.data?.data?.items ?? [];
  const dataSources: DataSource[] = Array.isArray(items)
    ? items.map((item: Record<string, unknown>) => ({
      id: stripDbPrefix(item.id as string),
      name: item.name as string,
      type: item.type as string,
      dbType: item.subtype as DatabaseType | undefined, // 真实数据库类型
      status: item.status as string | undefined,
      createdAt: item.created_at as string | undefined,
      params: {
        ...(item.connection_info as Record<string, unknown> | undefined),
        ...(item.metadata as Record<string, unknown> | undefined),
      },
    }))
    : [];

  const refresh = async () => {
    return queryClient.invalidateQueries({ queryKey: DATA_SOURCES_QUERY_KEY });
  };

  return {
    dataSources,
    total: query.data?.data?.total || 0,
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

// 重新导出 useDatabaseConnections 从专门的文件
// 避免重复定义，统一使用 useDatabaseConnections.ts 中的实现
export {
  useDatabaseConnections,
  invalidateDatabaseConnections,
  DATABASE_CONNECTIONS_QUERY_KEY,
  type DatabaseConnection
} from './useDatabaseConnections';
