/**
 * 数据源管理示例组件
 * 
 * 展示如何使用 TanStack Query hooks 进行数据获取和缓存管理
 */

import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Upload, Database, Trash2 } from 'lucide-react';
import { useDuckDBTables } from '../hooks/useDuckDBTables';
import { useDatabaseConnections } from '../hooks/useDataSources';
import { 
  invalidateAfterFileUpload, 
  invalidateAfterTableDelete
} from '../utils/cacheInvalidation';
import { uploadFile, deleteDuckDBTable } from '@/services/apiClient';

/**
 * DuckDB 表列表组件
 */
export const DuckDBTableList: React.FC = () => {
  const queryClient = useQueryClient();
  const { tables, isLoading, isFetching, refresh } = useDuckDBTables();

  const handleDelete = async (tableName: string) => {
    try {
      await deleteDuckDBTable(tableName);
      // 删除后刷新缓存
      await invalidateAfterTableDelete(queryClient);
    } catch (error) {
      console.error('删除表失败:', error);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">DuckDB 表列表</h3>
        <button
          onClick={refresh}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-surface border border-border text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-60 transition-colors duration-fast"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? '刷新中...' : '刷新'}
        </button>
      </div>

      {tables.length === 0 ? (
        <div className="text-sm text-muted-foreground">暂无表</div>
      ) : (
        <div className="space-y-2">
          {tables.map((table) => (
            <div
              key={table.name}
              className="flex items-center justify-between rounded-lg border border-border bg-muted/30 hover:border-primary/50 cursor-pointer transition-colors px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <Database className="w-4 h-4 text-primary" />
                <div>
                  <div className="text-sm font-medium text-foreground">{table.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {table.row_count?.toLocaleString() || 0} 行
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(table.name)}
                className="p-2 rounded-md hover:bg-error-bg text-error transition-colors duration-fast"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * 文件上传组件
 */
export const FileUploadExample: React.FC = () => {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = React.useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      await uploadFile(file);
      // 上传成功后刷新缓存
      await invalidateAfterFileUpload(queryClient);
    } catch (error) {
      console.error('上传失败:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">文件上传</h3>
      <label className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 cursor-pointer disabled:opacity-60 transition-all duration-normal">
        <Upload className="w-4 h-4" />
        {uploading ? '上传中...' : '选择文件'}
        <input
          type="file"
          onChange={handleFileUpload}
          disabled={uploading}
          className="hidden"
          accept=".csv,.xlsx,.parquet"
        />
      </label>
    </div>
  );
};

/**
 * 数据库连接列表组件
 */
export const DatabaseConnectionList: React.FC = () => {
  const { connections, isLoading, isFetching, refresh } = useDatabaseConnections();

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">加载中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">数据库连接</h3>
        <button
          onClick={refresh}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-surface border border-border text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-60 transition-colors duration-fast"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? '刷新中...' : '刷新'}
        </button>
      </div>

      {connections.length === 0 ? (
        <div className="text-sm text-muted-foreground">暂无连接</div>
      ) : (
        <div className="space-y-2">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2"
            >
              <Database className="w-4 h-4 text-primary" />
              <div>
                <div className="text-sm font-medium text-foreground">{conn.name}</div>
                <div className="text-xs text-muted-foreground">{conn.type}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * 完整示例：数据源管理页面
 */
export const DataSourceManagementExample: React.FC = () => {
  return (
    <div className="dq-new-theme p-6 space-y-6">
      <h2 className="text-2xl font-semibold text-foreground">数据源管理</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4 shadow-sm">
          <DuckDBTableList />
        </div>

        <div className="bg-surface border border-border rounded-xl p-6 space-y-4 shadow-sm">
          <FileUploadExample />
        </div>

        <div className="bg-surface border border-border rounded-xl p-6 space-y-4 shadow-sm">
          <DatabaseConnectionList />
        </div>
      </div>
    </div>
  );
};
