import * as React from 'react';
import { Search, RefreshCw, Plus, ChevronLeft, Database } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/new/components/ui/input';
import { Button } from '@/new/components/ui/button';
import { useDuckDBTables, type Table } from '@/new/hooks/useDuckDBTables';
import { useDatabaseConnections } from '@/new/hooks/useDatabaseConnections';
import { invalidateAllDataCaches, invalidateAfterTableDelete } from '@/new/utils/cacheInvalidation';
import { TreeSection } from './TreeSection';
import { TableItem, type TableSource } from './TableItem';
import { DatabaseConnectionNode } from './DatabaseConnectionNode';

/**
 * 数据源面板
 * 
 * 显示可用的数据表列表，支持搜索、分组和选择
 * 
 * 使用 useDuckDBTables hook 确保：
 * - 请求自动去重
 * - 智能缓存（5 分钟）
 * - 多个组件共享同一份数据
 */

interface DataSourcePanelProps {
  selectedTables: string[];
  onTableSelect: (tableName: string, source?: TableSource) => void;
  onRefresh?: () => void;
  onCollapse?: () => void;
  selectionMode?: 'single' | 'multiple';
  onPreview?: (tableName: string, source?: TableSource) => void;
  onDelete?: (tableName: string) => void;
}

export const DataSourcePanel: React.FC<DataSourcePanelProps> = ({
  selectedTables,
  onTableSelect,
  onRefresh,
  onCollapse,
  selectionMode = 'single',
  onPreview,
  onDelete,
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  // 防抖搜索
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 获取 QueryClient 用于缓存管理
  const queryClient = useQueryClient();

  // 获取表列表（使用共享 hook，自动去重和缓存）
  const { tables, isLoading, isFetching } = useDuckDBTables();
  
  // 获取数据库连接列表
  const { connections, isLoading: isLoadingConnections, isFetching: isFetchingConnections } = useDatabaseConnections();

  // Task 7.3: 表删除后自动刷新（使用统一的缓存失效工具）
  const handleDelete = async (tableName: string) => {
    try {
      if (onDelete) {
        // 等待删除操作完成，捕获可能的错误
        await onDelete(tableName);
      }
      // 删除成功后才刷新缓存
      await invalidateAfterTableDelete(queryClient);
      toast.success('表已删除，数据源列表已刷新');
    } catch (error) {
      // 删除失败时显示错误，不触发缓存失效
      toast.error('删除失败：' + (error as Error).message);
    }
  };

  // 过滤表
  const filteredTables = React.useMemo(() => {
    if (!debouncedSearch) return tables;
    
    const query = debouncedSearch.toLowerCase();
    return tables.filter((table: Table) =>
      table.name.toLowerCase().includes(query)
    );
  }, [tables, debouncedSearch]);

  // 分组表
  const groupedTables = React.useMemo(() => {
    const groups: Record<string, Table[]> = {
      normal: [],
      system: [],
    };

    filteredTables.forEach((table: Table) => {
      // 只根据 system_ 前缀判断系统表
      if (table.name.startsWith('system_')) {
        groups.system.push(table);
      } else {
        groups.normal.push(table);
      }
    });

    return groups;
  }, [filteredTables]);



  // Task 7.1: 全局刷新功能（使用统一的缓存失效工具）
  const handleRefresh = async () => {
    try {
      // 使用统一的缓存失效工具刷新所有数据缓存
      await invalidateAllDataCaches(queryClient);
      onRefresh?.();
      toast.success('数据源列表已刷新');
    } catch (error) {
      toast.error('刷新失败：' + (error as Error).message);
    }
  };

  const handleAddDataSource = () => {
    // TODO: 导航到数据源管理页面
    toast.info('请前往数据源管理页面添加新数据源');
  };

  return (
    <div className="h-full flex flex-col bg-surface border-r border-border">
      {/* 搜索栏 - 与右侧标签页高度对齐 */}
      <div className="h-12 border-b border-border flex items-center px-4 shrink-0">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="搜索表..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* 表列表 */}
      <div className="flex-1 overflow-y-auto">
        {(isLoading || isLoadingConnections) ? (
          /* Task 9.4: 加载状态样式 */
          <div className="flex flex-col items-center justify-center p-8 space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-muted border-t-primary"></div>
            <p className="text-sm text-muted-foreground">加载数据源...</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {/* 数据库连接 */}
            {connections.length > 0 && (
              <TreeSection
                id="database-connections"
                title="数据库连接"
                count={connections.length}
                defaultExpanded={true}
              >
                {connections.map((connection) => (
                  <DatabaseConnectionNode
                    key={connection.id}
                    connection={connection}
                    selectedTables={selectedTables}
                    onTableSelect={onTableSelect}
                    selectionMode={selectionMode}
                    onPreview={onPreview}
                    searchQuery={debouncedSearch}
                    forceExpanded={!!debouncedSearch}
                  />
                ))}
              </TreeSection>
            )}

            {/* DuckDB 表 */}
            {filteredTables.length === 0 && !searchQuery ? (
              /* Task 9.4: 空状态样式 */
              <div className="flex flex-col items-center justify-center p-8 space-y-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Database className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-foreground">暂无数据表</p>
                  <p className="text-xs text-muted-foreground">上传文件或连接数据库以开始</p>
                </div>
              </div>
            ) : filteredTables.length === 0 && searchQuery ? (
              /* Task 9.4: 搜索无结果状态 */
              <div className="flex flex-col items-center justify-center p-8 space-y-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Search className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-foreground">未找到匹配的表</p>
                  <p className="text-xs text-muted-foreground">尝试使用不同的关键词搜索</p>
                </div>
              </div>
            ) : (
              <>
                {/* 普通表 */}
                {groupedTables.normal.length > 0 && (
                  <TreeSection
                    id="normal-tables"
                    title="DuckDB 表"
                    count={groupedTables.normal.length}
                    defaultExpanded={true}
                  >
                    {groupedTables.normal.map((table: Table) => (
                      <TableItem
                        key={table.name}
                        name={table.name}
                        rowCount={table.row_count}
                        isSelected={selectedTables.includes(table.name)}
                        selectionMode={selectionMode}
                        source={{ type: 'duckdb' }}
                        onSelect={onTableSelect}
                        onPreview={onPreview}
                        onDelete={handleDelete}
                        searchQuery={debouncedSearch}
                      />
                    ))}
                  </TreeSection>
                )}

                {/* 系统表 */}
                {groupedTables.system.length > 0 && (
                  <TreeSection
                    id="system-tables"
                    title="系统表"
                    count={groupedTables.system.length}
                    defaultExpanded={false}
                  >
                    {groupedTables.system.map((table: Table) => (
                      <TableItem
                        key={table.name}
                        name={table.name}
                        rowCount={table.row_count}
                        isSelected={selectedTables.includes(table.name)}
                        selectionMode={selectionMode}
                        source={{ type: 'duckdb' }}
                        onSelect={onTableSelect}
                        onPreview={onPreview}
                        onDelete={handleDelete}
                        searchQuery={debouncedSearch}
                      />
                    ))}
                  </TreeSection>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* 底部操作按钮 */}
      <div className="p-3 border-t border-border flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching || isFetchingConnections}
          className="flex-1"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${(isFetching || isFetchingConnections) ? 'animate-spin' : ''}`} />
          刷新
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddDataSource}
          className="flex-1"
        >
          <Plus className="h-4 w-4 mr-2" />
          添加
        </Button>
        {onCollapse && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCollapse}
            aria-label="折叠数据源面板"
            className="flex-shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};
