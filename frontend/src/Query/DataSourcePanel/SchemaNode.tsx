import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, Loader2 } from 'lucide-react';
import { TreeNode } from './TreeNode';
import { TableItem } from './TableItem';
import { useSchemaTables } from '@/hooks/useSchemaTables';
import type { DatabaseType, SelectedTable } from '@/types/SelectedTable';
import { createExternalTable, isTableSelected } from '@/utils/tableUtils';

/**
 * Schema 类型
 */
export interface Schema {
  name: string;
  table_count?: number;
}

interface SchemaNodeProps {
  connectionId: string;
  connectionName?: string;
  databaseType?: DatabaseType;
  schema: Schema;
  level: number;
  selectedTables: SelectedTable[];
  onTableSelect: (table: SelectedTable) => void;
  selectionMode?: 'single' | 'multiple';
  onPreview?: (table: SelectedTable) => void;
  onImport?: (table: SelectedTable) => void;
  searchQuery?: string;
  forceExpanded?: boolean;
}

export const SchemaNode: React.FC<SchemaNodeProps> = ({
  connectionId,
  connectionName,
  databaseType,
  schema,
  level,
  selectedTables,
  onTableSelect,
  selectionMode = 'single',
  onPreview,
  onImport,
  searchQuery = '',
  forceExpanded = false,
}) => {
  const { t } = useTranslation('common');
  const [isExpanded, setIsExpanded] = React.useState(false);

  // 搜索时自动展开
  React.useEffect(() => {
    if (forceExpanded) {
      setIsExpanded(true);
    }
  }, [forceExpanded]);

  // 懒加载表列表（仅在展开时加载）
  const { tables, isLoading, isError, error } = useSchemaTables(
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
          {t('common.loading', '加载中...')}
        </div>
      )}

      {!isLoading && isError && (
        <div className="pl-10 py-2 text-sm text-destructive">
          {t('dataSource.loadError', '加载出错')}: {(error as Error)?.message || 'Unknown error'}
        </div>
      )}

      {!isLoading && !isError &&
        filteredTables.map((table) => {
          const tableObj = createExternalTable(
            table.name,
            {
              id: connectionId,
              name: connectionName || connectionId,
              type: databaseType || 'postgresql',
            },
            schema.name,
          );

          return (
            <TableItem
              key={`${connectionId}:${schema.name}:${table.name}`}
              table={tableObj}
              rowCount={table.row_count}
              isSelected={isTableSelected(tableObj, selectedTables)}
              selectionMode={selectionMode}
              onSelect={onTableSelect}
              onPreview={onPreview}
              onImport={databaseType === 'mysql' ? onImport : undefined}
              searchQuery={searchQuery}
              level={level + 1}
            />
          );
        })}

      {!isLoading && !isError && filteredTables.length === 0 && isExpanded && (
        <div className="pl-10 py-2 text-sm text-muted-foreground">
          {searchQuery ? t('dataSource.noMatchingTables', '未找到匹配的表') : t('dataSource.noTables', '暂无表')}
        </div>
      )}
    </TreeNode>
  );
};
