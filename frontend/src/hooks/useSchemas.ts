import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listConnectionSchemas } from '@/api';

/**
 * Schema 类型
 */
export interface Schema {
  name: string;
  table_count?: number;
}



/**
 * 获取 schemas 列表
 */
const fetchSchemas = async (connectionId: string): Promise<Schema[]> => {
  return listConnectionSchemas(connectionId);
};

/**
 * Schemas 列表 Hook（懒加载）
 * 
 * 特性：
 * - 懒加载（仅在 enabled 为 true 时加载）
 * - 智能缓存（10 分钟）
 * - 提供手动刷新方法
 * 
 * 使用示例：
 * ```tsx
 * const { schemas, isLoading } = useSchemas(connectionId, isExpanded);
 * ```
 */
export const useSchemas = (connectionId: string, enabled: boolean = false) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['schemas', connectionId],
    queryFn: () => fetchSchemas(connectionId),
    enabled: enabled && !!connectionId,
    staleTime: 10 * 60 * 1000, // 10 分钟
    gcTime: 15 * 60 * 1000, // 15 分钟
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const schemas = Array.isArray(query.data) ? query.data : [];

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['schemas', connectionId] });
    return query.refetch();
  };

  return {
    schemas,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    refresh,
  };
};

/**
 * 导出缓存失效工具函数
 */
export const invalidateSchemas = (
  queryClient: ReturnType<typeof useQueryClient>,
  connectionId: string
) => {
  return queryClient.invalidateQueries({ queryKey: ['schemas', connectionId] });
};
