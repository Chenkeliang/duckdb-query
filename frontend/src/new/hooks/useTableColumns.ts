import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDuckDBTableDetail, getExternalTableDetail } from '@/services/apiClient';
import type { SelectedTable } from '@/new/types/SelectedTable';
import { normalizeSelectedTable, getTableName } from '@/new/utils/tableUtils';

/**
 * 表列信息类型
 */
export interface TableColumn {
  name: string;
  type: string;
}

/**
 * useTableColumns Hook 返回类型
 */
export interface UseTableColumnsResult {
  /** 列信息数组 */
  columns: TableColumn[];
  /** 是否正在加载 */
  isLoading: boolean;
  /** 是否加载出错 */
  isError: boolean;
  /** 错误信息 */
  error: Error | null;
  /** 列数组是否为空（加载完成后） */
  isEmpty: boolean;
  /** 重新获取数据 */
  refetch: () => void;
}

/**
 * 表列信息查询 QueryKey
 */
export const TABLE_COLUMNS_QUERY_KEY = ['table-columns'] as const;

/**
 * 转换外部表列信息为统一格式
 * 
 * 处理边界情况：
 * - columns 为 null/undefined 时返回空数组
 * - columns 不是数组时返回空数组
 * - 列的 name 为空时使用 'unknown' 作为默认值，然后过滤掉
 * - 列的 type 为空时使用 'unknown' 作为默认值
 * 
 * @param columns - 外部表 API 返回的列信息
 * @returns 标准化的列信息数组
 */
export const transformExternalColumns = (columns: unknown): TableColumn[] => {
  if (!Array.isArray(columns)) return [];
  
  return columns
    .map((col: Record<string, unknown>) => ({
      name: String(col?.name || col?.column_name || 'unknown'),
      type: String(col?.type || col?.data_type || 'unknown'),
    }))
    .filter((col) => col.name !== 'unknown');
};

/**
 * 转换 DuckDB 表列信息为统一格式
 * 
 * 处理边界情况：
 * - columns 为 null/undefined 时返回空数组
 * - columns 不是数组时返回空数组
 * - 列的 name 为空时使用 'unknown' 作为默认值，然后过滤掉
 * - 列的 type 为空时使用 'unknown' 作为默认值
 * 
 * @param columns - DuckDB API 返回的列信息
 * @returns 标准化的列信息数组
 */
export const transformDuckDBColumns = (columns: unknown): TableColumn[] => {
  if (!Array.isArray(columns)) return [];
  
  return columns
    .map((col: Record<string, unknown>) => ({
      name: String(col?.column_name || col?.name || 'unknown'),
      type: String(col?.data_type || col?.type || 'unknown'),
    }))
    .filter((col) => col.name !== 'unknown');
};

/**
 * 统一表列信息获取 Hook
 * 
 * 自动根据表来源选择正确的 API：
 * - DuckDB 表：使用 getDuckDBTableDetail API
 * - 外部表：使用 getExternalTableDetail API
 * 
 * 特性：
 * - 自动请求去重（相同 queryKey 的请求会被合并）
 * - 智能缓存（5 分钟）
 * - 统一返回格式 { name: string, type: string }[]
 * - 处理 null/undefined/非数组的边界情况
 * - 提供 isEmpty 标志用于检测空列数组
 * 
 * **Feature: external-table-column-fix, Property 1: External Table Column API Selection**
 * **Validates: Requirements 1.1, 4.1**
 * 
 * @param table - 选中的表（字符串或对象格式）
 * @returns UseTableColumnsResult
 * 
 * @example
 * ```tsx
 * const { columns, isLoading, isEmpty, isError, refetch } = useTableColumns(selectedTable);
 * 
 * if (isLoading) return <Spinner />;
 * if (isError) return <ErrorMessage onRetry={refetch} />;
 * if (isEmpty) return <EmptyMessage>无法获取列信息</EmptyMessage>;
 * 
 * return (
 *   <ColumnList columns={columns} />
 * );
 * ```
 */
export const useTableColumns = (table: SelectedTable | null): UseTableColumnsResult => {
  // 标准化表信息
  const normalized = table ? normalizeSelectedTable(table) : null;
  const tableName = table ? getTableName(table) : null;
  const isExternal = normalized?.source === 'external';
  const connectionId = normalized?.connection?.id;
  const schema = normalized?.schema;
  
  // 构建 queryKey，包含表来源信息以区分缓存
  const queryKey = [
    ...TABLE_COLUMNS_QUERY_KEY,
    tableName,
    isExternal ? connectionId : 'duckdb',
    schema,
  ] as const;
  
  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<TableColumn[]> => {
      if (!normalized || !tableName) return [];
      
      if (isExternal && connectionId) {
        // 外部表：使用 getExternalTableDetail API
        const response = await getExternalTableDetail(connectionId, tableName, schema);
        return transformExternalColumns(response?.columns);
      } else {
        // DuckDB 表：使用 getDuckDBTableDetail API
        const response = await getDuckDBTableDetail(tableName);
        const tableData = response?.table || response;
        return transformDuckDBColumns(tableData?.columns);
      }
    },
    enabled: !!normalized && !!tableName,
    staleTime: 5 * 60 * 1000, // 5 分钟缓存
    gcTime: 10 * 60 * 1000, // 10 分钟后清理
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
  
  const columns = query.data || [];
  
  return {
    columns,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isEmpty: !query.isLoading && columns.length === 0,
    refetch: query.refetch,
  };
};

/**
 * 批量获取多个表的列信息
 * 
 * 用于需要同时获取多个表列信息的场景（如 JoinQueryPanel）
 * 
 * @param tables - 表数组
 * @returns 每个表的列信息查询结果
 */
export const useMultipleTableColumns = (tables: SelectedTable[]) => {
  // 为每个表创建查询配置
  const queries = tables.map((table) => {
    const normalized = normalizeSelectedTable(table);
    const tableName = getTableName(table);
    const isExternal = normalized.source === 'external';
    const connectionId = normalized.connection?.id;
    const schema = normalized.schema;
    
    return {
      queryKey: [
        ...TABLE_COLUMNS_QUERY_KEY,
        tableName,
        isExternal ? connectionId : 'duckdb',
        schema,
      ] as const,
      queryFn: async (): Promise<TableColumn[]> => {
        if (isExternal && connectionId) {
          const response = await getExternalTableDetail(connectionId, tableName, schema);
          return transformExternalColumns(response?.columns);
        } else {
          const response = await getDuckDBTableDetail(tableName);
          const tableData = response?.table || response;
          return transformDuckDBColumns(tableData?.columns);
        }
      },
      enabled: !!tableName,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 2,
    };
  });
  
  return queries;
};

/**
 * 使表列信息缓存失效的工具函数
 * 
 * @param queryClient - QueryClient 实例
 * @param tableName - 可选的表名，不传则失效所有表列缓存
 */
export const invalidateTableColumns = (
  queryClient: ReturnType<typeof useQueryClient>,
  tableName?: string
) => {
  if (tableName) {
    return queryClient.invalidateQueries({
      queryKey: [...TABLE_COLUMNS_QUERY_KEY, tableName],
    });
  }
  return queryClient.invalidateQueries({
    queryKey: TABLE_COLUMNS_QUERY_KEY,
  });
};

export default useTableColumns;
