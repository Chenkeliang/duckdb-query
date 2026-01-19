import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Search, RefreshCw, ChevronLeft, Database } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDuckDBTables, type Table } from '@/hooks/useDuckDBTables';
import { useDatabaseConnections } from '@/hooks/useDatabaseConnections';
import { invalidateAllDataCaches, invalidateAfterTableDelete } from '@/utils/cacheInvalidation';
import { createDuckDBTable, isTableSelected } from '@/utils/tableUtils';
import { showSuccessToast, showErrorToast } from '@/utils/toastHelpers';
import type { SelectedTable } from '@/types/SelectedTable';
import { TreeSection } from './TreeSection';
import { TableItem } from './TableItem';
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
  selectedTables: SelectedTable[];
  onTableSelect: (table: SelectedTable) => void;
  onRefresh?: () => void;
  onCollapse?: () => void;
  selectionMode?: 'single' | 'multiple';
  onPreview?: (table: SelectedTable) => void;
  onDelete?: (tableName: string) => Promise<void> | void;
  onImport?: (table: SelectedTable) => void;
}

export const DataSourcePanel: React.FC<DataSourcePanelProps> = ({
  selectedTables,
  onTableSelect,
  onRefresh,
  onCollapse,
  selectionMode = 'single',
  onPreview,
  onDelete,
  onImport,
}) => {
  const { t } = useTranslation('common');
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
      showSuccessToast(t, 'TABLE_DELETED', t('dataSource.tableDeletedRefreshed'));
    } catch (error) {
      // 删除失败时显示错误，不触发缓存失效
      showErrorToast(t, undefined, t('dataSource.deleteFailed', { error: (error as Error).message }));
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
  const handleRefresh = React.useCallback(async () => {
    try {
      // 使用统一的缓存失效工具刷新所有数据缓存
      await invalidateAllDataCaches(queryClient);
      onRefresh?.();
      showSuccessToast(t, 'DATASOURCES_REFRESHED', t('dataSource.refreshed'));
    } catch (error) {
      showErrorToast(t, undefined, t('dataSource.refreshFailed', { error: (error as Error).message }));
    }
  }, [queryClient, onRefresh, t]);

  return (
    <div className="h-full flex flex-col bg-card border-r border-border">
      {/* 搜索栏 - 与右侧标签页高度对齐 */}
      <div className="h-12 border-b border-border flex items-center px-4 shrink-0">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t('dataSource.searchTables')}
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
            <p className="text-sm text-muted-foreground">{t('dataSource.loadingDataSources')}</p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {/* 数据库连接 */}
            {connections.length > 0 && (
              <TreeSection
                id="database-connections"
                title={t('dataSource.databaseConnections')}
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
                    onImport={onImport}
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
                  <p className="text-sm font-medium text-foreground">{t('dataSource.noTables')}</p>
                  <p className="text-xs text-muted-foreground">{t('dataSource.uploadOrConnect')}</p>
                </div>
              </div>
            ) : filteredTables.length === 0 && searchQuery ? (
              /* Task 9.4: 搜索无结果状态 */
              <div className="flex flex-col items-center justify-center p-8 space-y-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Search className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-foreground">{t('dataSource.noMatchingTables')}</p>
                  <p className="text-xs text-muted-foreground">{t('dataSource.tryDifferentKeyword')}</p>
                </div>
              </div>
            ) : (
              <>
                {/* 普通表 */}
                {groupedTables.normal.length > 0 && (
                  <TreeSection
                    id="normal-tables"
                    title={t('dataSource.duckdbTables', 'DuckDB 表')}
                    count={groupedTables.normal.length}
                    defaultExpanded={true}
	                  >
	                    {groupedTables.normal.map((table: Table) => {
	                      const tableObj = createDuckDBTable(table.name);
	                      return (
	                        <TableItem
	                          key={table.name}
	                          table={tableObj}
	                          rowCount={table.row_count}
	                          isSelected={isTableSelected(tableObj, selectedTables)}
	                          selectionMode={selectionMode}
	                          onSelect={onTableSelect}
	                          onPreview={onPreview}
	                          onDelete={handleDelete}
	                          searchQuery={debouncedSearch}
	                        />
	                      );
	                    })}
	                  </TreeSection>
	                )}

                {/* 系统表 */}
                {groupedTables.system.length > 0 && (
                  <TreeSection
                    id="system-tables"
                    title={t('dataSource.systemTables')}
                    count={groupedTables.system.length}
                    defaultExpanded={false}
	                  >
	                    {groupedTables.system.map((table: Table) => {
	                      const tableObj = createDuckDBTable(table.name);
	                      return (
	                        <TableItem
	                          key={table.name}
	                          table={tableObj}
	                          rowCount={table.row_count}
	                          isSelected={isTableSelected(tableObj, selectedTables)}
	                          selectionMode={selectionMode}
	                          onSelect={onTableSelect}
	                          onPreview={onPreview}
	                          onDelete={handleDelete}
	                          searchQuery={debouncedSearch}
	                        />
	                      );
	                    })}
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
          {t('common.refresh')}
        </Button>
        {onCollapse && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCollapse}
            aria-label={t('dataSource.collapsePanel')}
            className="flex-shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};
