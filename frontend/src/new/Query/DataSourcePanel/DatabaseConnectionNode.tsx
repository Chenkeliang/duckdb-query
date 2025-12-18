import * as React from 'react';
import { Database, Loader2, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TreeNode } from './TreeNode';
import { SchemaNode } from '@/new/Query/DataSourcePanel/SchemaNode';
import { TableItem } from './TableItem';
import { useSchemas } from '@/new/hooks/useSchemas';
import { useSchemaTables } from '@/new/hooks/useSchemaTables';
import type { DatabaseConnection } from '@/new/hooks/useDatabaseConnections';
import type { SelectedTable } from '@/new/types/SelectedTable';
import { createExternalTable, isTableSelected } from '@/new/utils/tableUtils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/new/components/ui/context-menu';

interface DatabaseConnectionNodeProps {
  connection: DatabaseConnection;
  selectedTables: SelectedTable[];
  onTableSelect: (table: SelectedTable) => void;
  selectionMode?: 'single' | 'multiple';
  onPreview?: (table: SelectedTable) => void;
  onImport?: (table: SelectedTable) => void;
  searchQuery?: string;
  forceExpanded?: boolean;
}

/**
 * 获取数据库类型图标颜色
 * 使用语义化类名，支持深色模式
 */
const getDatabaseIconColor = (type: string): string => {
  const colorMap: Record<string, string> = {
    postgresql: 'text-primary',
    mysql: 'text-foreground',
    sqlite: 'text-muted-foreground',
    sqlserver: 'text-destructive',
  };
  return colorMap[type] || 'text-muted-foreground';
};

/**
 * 获取连接状态指示器
 */
const getStatusIndicator = (
  status: string
): 'success' | 'warning' | 'error' | 'inactive' => {
  const statusMap: Record<string, 'success' | 'warning' | 'error' | 'inactive'> = {
    active: 'success',
    inactive: 'inactive',
    error: 'error',
  };
  return statusMap[status] || 'inactive';
};

export const DatabaseConnectionNode: React.FC<DatabaseConnectionNodeProps> = ({
  connection,
  selectedTables,
  onTableSelect,
  selectionMode = 'single',
  onPreview,
  onImport,
  searchQuery = '',
  forceExpanded = false,
}) => {
  const level = 0; // 数据库连接节点始终在 level 0
  const [isExpanded, setIsExpanded] = React.useState(false);
  const queryClient = useQueryClient();

  // 搜索时自动展开
  React.useEffect(() => {
    if (forceExpanded) {
      setIsExpanded(true);
    }
  }, [forceExpanded]);

  // 懒加载 schemas（仅在展开时加载）
  const { schemas, isLoading: schemasLoading } = useSchemas(
    connection.id,
    isExpanded
  );

  // 对于 MySQL/SQLite，直接加载表列表
  const { tables, isLoading: tablesLoading } = useSchemaTables(
    connection.id,
    '', // 空 schema 表示直接获取表
    isExpanded && (connection.type === 'mysql' || connection.type === 'sqlite')
  );

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  // Task 7.2: 局部刷新功能 - 只刷新该连接下的 schemas 和 tables
  const handleRefreshConnection = async () => {
    try {
      // 使缓存失效，触发重新获取
      await Promise.all([
        queryClient.invalidateQueries({ 
          queryKey: ['schemas', connection.id] 
        }),
        queryClient.invalidateQueries({ 
          queryKey: ['schema-tables', connection.id] 
        }),
      ]);
      toast.success(`已刷新连接 "${connection.name}"`);
    } catch (error) {
      toast.error('刷新失败：' + (error as Error).message);
    }
  };

  const isLoading = schemasLoading || tablesLoading;

  // PostgreSQL: 显示 schemas
  const hasSchemas = connection.type === 'postgresql' && schemas.length > 0;

  // MySQL/SQLite: 直接显示表
  const hasTables =
    (connection.type === 'mysql' || connection.type === 'sqlite') &&
    tables.length > 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <TreeNode
            id={`db-${connection.id}`}
            label={connection.name}
            icon={<Database className={`h-4 w-4 ${getDatabaseIconColor(connection.type)}`} />}
            level={level}
            isExpandable={true}
            isExpanded={isExpanded}
            statusIndicator={getStatusIndicator(connection.status)}
            onToggle={handleToggle}
          >
      {isLoading && (
        <div className="flex items-center gap-2 pl-6 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中...
        </div>
      )}

      {/* PostgreSQL: 显示 schemas */}
      {hasSchemas &&
        schemas.map((schema) => (
          <SchemaNode
            key={schema.name}
            connectionId={connection.id}
            connectionName={connection.name}
            databaseType={connection.type}
            schema={schema}
            level={level + 1}
            selectedTables={selectedTables}
            onTableSelect={onTableSelect}
            selectionMode={selectionMode}
            onPreview={onPreview}
            onImport={onImport}
            searchQuery={searchQuery}
            forceExpanded={forceExpanded}
          />
        ))}

      {/* MySQL/SQLite: 直接显示表 */}
      {hasTables &&
        tables.map((table) => {
          const tableObj = createExternalTable(
            table.name,
            { id: connection.id, name: connection.name, type: connection.type },
          );

          return (
            <TableItem
              key={`${connection.id}:${table.name}`}
              table={tableObj}
              rowCount={table.row_count}
              isSelected={isTableSelected(tableObj, selectedTables)}
              selectionMode={selectionMode}
              onSelect={onTableSelect}
              onPreview={onPreview}
              onImport={connection.type === 'mysql' ? onImport : undefined}
              searchQuery={searchQuery}
            />
          );
        })}

      {/* 空状态 */}
      {!isLoading && !hasSchemas && !hasTables && isExpanded && (
        <div className="pl-6 py-2 text-sm text-muted-foreground">
          暂无数据
        </div>
      )}
          </TreeNode>
      </ContextMenuTrigger>
      
      {/* Task 7.2: 右键菜单 - 局部刷新 */}
      <ContextMenuContent>
        <ContextMenuItem onClick={handleRefreshConnection}>
          <RefreshCw className="mr-2 h-4 w-4" />
          刷新此连接
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
