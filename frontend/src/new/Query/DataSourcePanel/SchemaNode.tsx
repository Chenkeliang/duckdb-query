import * as React from 'react';
import { Folder, Loader2 } from 'lucide-react';
import { TreeNode } from './TreeNode';
import { TableItem, type TableSource } from './TableItem';
import { useSchemaTables } from '@/new/hooks/useSchemaTables';

/**
 * Schema 类型
 */
export interface Schema {
  name: string;
  table_count?: number;
}

interface SchemaNodeProps {
  connectionId: string;
  schema: Schema;
  level: number;
  selectedTables: string[];
  onTableSelect: (tableName: string, source: TableSource) => void;
  selectionMode?: 'single' | 'multiple';
  onPreview?: (tableName: string, source: TableSource) => void;
  searchQuery?: string;
  forceExpanded?: boolean;
}

export const SchemaNode: React.FC<SchemaNodeProps> = ({
  connectionId,
  schema,
  level,
  selectedTables,
  onTableSelect,
  selectionMode = 'single',
  onPreview,
  searchQuery = '',
  forceExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  // 搜索时自动展开
  React.useEffect(() => {
    if (forceExpanded) {
      setIsExpanded(true);
    }
  }, [forceExpanded]);

  // 懒加载表列表（仅在展开时加载）
  const { tables, isLoading } = useSchemaTables(
    connectionId,
    schema.name,
    isExpanded
  );

  // 过滤表（搜索）
  const filteredTables = React.useMemo(() => {
    if (!searchQuery) return tables;
    const query = searchQuery.toLowerCase();
    return tables.filter(table => table.name.toLowerCase().includes(query));
  }, [tables, searchQuery]);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const handleTableSelect = (tableName: string) => {
    onTableSelect(tableName, {
      type: 'external',
      connectionId,
      schema: schema.name,
    });
  };

  const handleTablePreview = (tableName: string) => {
    if (onPreview) {
      onPreview(tableName, {
        type: 'external',
        connectionId,
        schema: schema.name,
      });
    }
  };

  return (
    <TreeNode
      id={`schema-${connectionId}-${schema.name}`}
      label={schema.name}
      icon={<Folder className="h-4 w-4 text-muted-foreground" />}
      level={level}
      isExpandable={true}
      isExpanded={isExpanded}
      badge={schema.table_count}
      onToggle={handleToggle}
    >
      {isLoading && (
        <div className="flex items-center gap-2 pl-10 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载中...
        </div>
      )}

      {!isLoading &&
        filteredTables.map((table) => (
          <TableItem
            key={table.name}
            name={table.name}
            rowCount={table.row_count}
            isSelected={selectedTables.includes(table.name)}
            selectionMode={selectionMode}
            source={{
              type: 'external',
              connectionId,
              schema: schema.name,
            }}
            onSelect={handleTableSelect}
            onPreview={handleTablePreview}
            searchQuery={searchQuery}
          />
        ))}

      {!isLoading && filteredTables.length === 0 && isExpanded && (
        <div className="pl-10 py-2 text-sm text-muted-foreground">
          {searchQuery ? '未找到匹配的表' : '暂无表'}
        </div>
      )}
    </TreeNode>
  );
};
