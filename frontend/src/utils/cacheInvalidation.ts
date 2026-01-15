import { QueryClient } from '@tanstack/react-query';
import { invalidateDuckDBTables } from '../hooks/useDuckDBTables';
import { invalidateDataSources, invalidateDatabaseConnections } from '../hooks/useDataSources';

/**
 * 缓存失效工具函数集合
 * 
 * 用于在数据变更后统一刷新相关缓存
 */

/**
 * 异步任务完成后刷新所有相关缓存
 * 
 * 使用场景：
 * - 异步查询任务完成
 * - 文件上传完成
 * - 数据导入完成
 * 
 * @example
 * ```tsx
 * import { useQueryClient } from '@tanstack/react-query';
 * import { invalidateAllDataCaches } from '@/utils/cacheInvalidation';
 * 
 * const queryClient = useQueryClient();
 * 
 * onTaskCompleted={async () => {
 *   await invalidateAllDataCaches(queryClient);
 * }}
 * ```
 */
export const invalidateAllDataCaches = async (queryClient: QueryClient) => {
  await Promise.all([
    invalidateDuckDBTables(queryClient),
    invalidateDataSources(queryClient),
    invalidateDatabaseConnections(queryClient),
    // Invalidate all schema and table lists for external databases
    queryClient.invalidateQueries({ queryKey: ['schemas'] }),
    queryClient.invalidateQueries({ queryKey: ['schema-tables'] }),
  ]);
};

/**
 * 文件上传后刷新缓存
 * 
 * 使用场景：
 * - CSV/Excel/Parquet 文件上传
 * - URL 文件导入
 * - 服务器文件导入
 */
export const invalidateAfterFileUpload = async (queryClient: QueryClient) => {
  await Promise.all([
    invalidateDuckDBTables(queryClient),
    invalidateDataSources(queryClient),
  ]);
};

/**
 * 数据库连接变更后刷新缓存
 * 
 * 使用场景：
 * - 创建数据库连接
 * - 更新数据库连接
 * - 删除数据库连接
 */
export const invalidateAfterDatabaseChange = async (queryClient: QueryClient) => {
  await Promise.all([
    invalidateDatabaseConnections(queryClient),
    invalidateDataSources(queryClient),
  ]);
};

/**
 * 表删除后刷新缓存
 * 
 * 使用场景：
 * - 删除 DuckDB 表
 * - 批量删除表
 */
export const invalidateAfterTableDelete = async (queryClient: QueryClient) => {
  await Promise.all([
    invalidateDuckDBTables(queryClient),
    invalidateDataSources(queryClient),
  ]);
};

/**
 * 查询结果保存为表后刷新缓存
 * 
 * 使用场景：
 * - 保存查询结果到 DuckDB
 * - 创建视图
 */
export const invalidateAfterTableCreate = async (queryClient: QueryClient) => {
  await Promise.all([
    invalidateDuckDBTables(queryClient),
    invalidateDataSources(queryClient),
  ]);
};
