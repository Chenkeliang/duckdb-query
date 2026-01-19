import { useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * 表类型
 */
export interface SchemaTable {
  name: string;
  type?: 'TABLE' | 'VIEW' | 'MATERIALIZED_VIEW';
  row_count?: number;
}

/**
 * API 响应类型
 */
interface SchemaTablesResponse {
  success: boolean;
  connection_id: string;
  schema: string;
  tables: SchemaTable[];
  total_tables: number;
}

/**
 * 获取 schema 下的表列表
 */
const fetchSchemaTables = async (
  connectionId: string,
  schema: string
): Promise<SchemaTable[]> => {
  // 移除 db_ 前缀（如果存在）
  const actualConnectionId = connectionId.startsWith('db_') 
    ? connectionId.substring(3) 
    : connectionId;
  
  // 如果 schema 为空，使用旧的 API 获取所有表
  const url = schema
    ? `/api/databases/${actualConnectionId}/schemas/${schema}/tables`
    : `/api/database_tables/${actualConnectionId}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('获取表列表失败');
  }

  const data = await response.json();

  // 兼容不同的 API 响应格式
  // 标准格式: { success: true, data: { tables: [...] } }
  // 旧格式: { tables: [...] }
  const tables = data.data?.tables || data.tables;
  
  if (tables) {
    return tables.map((t: any) => ({
      name: t.name || t.table_name,
      type: t.type || 'TABLE',
      row_count: t.row_count || 0,
    }));
  }

  return [];
};

/**
 * Schema 表列表 Hook（懒加载）
 *
 * 特性：
 * - 懒加载（仅在 enabled 为 true 时加载）
 * - 智能缓存（5 分钟）
 * - 提供手动刷新方法
 *
 * 使用示例：
 * ```tsx
 * const { tables, isLoading } = useSchemaTables(connectionId, schema, isExpanded);
 * ```
 */
export const useSchemaTables = (
  connectionId: string,
  schema: string,
  enabled: boolean = false
) => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['schema-tables', connectionId, schema],
    queryFn: () => fetchSchemaTables(connectionId, schema),
    enabled: enabled && !!connectionId,
    staleTime: 5 * 60 * 1000, // 5 分钟
    gcTime: 10 * 60 * 1000, // 10 分钟
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const tables = Array.isArray(query.data) ? query.data : [];

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['schema-tables', connectionId, schema],
    });
    return query.refetch();
  };

  return {
    tables,
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
export const invalidateSchemaTables = (
  queryClient: ReturnType<typeof useQueryClient>,
  connectionId: string,
  schema?: string
) => {
  if (schema) {
    return queryClient.invalidateQueries({
      queryKey: ['schema-tables', connectionId, schema],
    });
  }
  // 如果没有指定 schema，清除该连接下所有表缓存
  return queryClient.invalidateQueries({
    queryKey: ['schema-tables', connectionId],
  });
};
