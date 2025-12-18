import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronsUpDown, Database, Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/new/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/new/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/new/components/ui/popover';
import { Skeleton } from '@/new/components/ui/skeleton';
import { Badge } from '@/new/components/ui/badge';
import { useDuckDBTables, type Table } from '@/new/hooks/useDuckDBTables';
import type { SelectedTable, SelectedTableObject } from '@/new/types/SelectedTable';
import { 
  normalizeSelectedTable, 
  getTableName, 
  isExternalTable,
  DATABASE_TYPE_ICONS,
} from '@/new/utils/tableUtils';

export interface TableSelectorProps {
  /** 当前选中的表（支持新旧格式） */
  selectedTable: SelectedTable | null;
  /** 表选择变更回调 */
  onTableSelect: (table: SelectedTable) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义占位符 */
  placeholder?: string;
  /** 自定义类名 */
  className?: string;
  /** 是否显示外部数据库表 */
  showExternalTables?: boolean;
}

/**
 * 表选择器组件
 * 
 * 使用 useDuckDBTables hook 获取表列表，支持搜索和选择
 * 支持 DuckDB 表和外部数据库表
 * 
 * @example
 * ```tsx
 * <TableSelector
 *   selectedTable={selectedTable}
 *   onTableSelect={(table) => setSelectedTable(table)}
 *   showExternalTables={true}
 * />
 * ```
 */
export const TableSelector: React.FC<TableSelectorProps> = ({
  selectedTable,
  onTableSelect,
  disabled = false,
  placeholder,
  className,
  showExternalTables = true,
}) => {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const { tables, isLoading, isError } = useDuckDBTables();

  // 按来源类型分组表
  const groupedTables = useMemo(() => {
    const groups: Record<string, Table[]> = {
      uploaded: [],
      database: [],
      async: [],
      other: [],
    };

    tables.forEach((table) => {
      const sourceType = table.source_type?.toLowerCase() || '';
      if (sourceType.includes('async') || table.name.startsWith('async_')) {
        groups.async.push(table);
      } else if (sourceType.includes('database') || sourceType.includes('mysql') || sourceType.includes('postgres')) {
        groups.database.push(table);
      } else if (sourceType.includes('upload') || sourceType.includes('csv') || sourceType.includes('excel') || sourceType.includes('parquet')) {
        groups.uploaded.push(table);
      } else {
        groups.other.push(table);
      }
    });

    return groups;
  }, [tables]);

  // 获取选中表的显示信息
  const selectedTableInfo = useMemo(() => {
    if (!selectedTable) return null;
    
    const tableName = getTableName(selectedTable);
    const normalized = normalizeSelectedTable(selectedTable);
    
    // 如果是外部表
    if (normalized.source === 'external' && normalized.connection) {
      const displayName = normalized.schema ? `${normalized.schema}.${tableName}` : tableName;
      return {
        name: displayName,
        isExternal: true,
        connectionName: normalized.connection.name,
        databaseType: normalized.connection.type,
        icon: DATABASE_TYPE_ICONS[normalized.connection.type] || '📊',
      };
    }
    
    // DuckDB 表
    const duckdbTable = tables.find((t) => t.name === tableName);
    if (duckdbTable) {
      return {
        name: duckdbTable.name,
        isExternal: false,
        row_count: duckdbTable.row_count,
        icon: '📊',
      };
    }
    
    // 兜底：仍然展示表名，避免 UI 空白
    return {
      name: tableName,
      isExternal: false,
      icon: '📊',
    };
  }, [tables, selectedTable]);

  // 格式化行数显示
  const formatRowCount = (count?: number) => {
    if (count === undefined || count === null) return '';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const hasNoTables = tables.length === 0 && !selectedTable;

  if (isLoading) {
    return <Skeleton className={cn('h-10 w-full', className)} />;
  }

  if (isError) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-destructive', className)}>
        <Database className="h-4 w-4" />
        <span>{t('query.tableSelector.loadError', '加载表列表失败')}</span>
      </div>
    );
  }

  // 获取显示名称
  const getDisplayName = () => {
    if (!selectedTableInfo) return null;
    
    if (selectedTableInfo.isExternal) {
      return (
        <span className="truncate flex items-center gap-1">
          <span>{selectedTableInfo.icon}</span>
          <span>{selectedTableInfo.name}</span>
          <Badge variant="outline" className="ml-1 text-xs px-1 py-0">
            {selectedTableInfo.connectionName}
          </Badge>
        </span>
      );
    }
    
    return (
      <span className="truncate">
        {selectedTableInfo.name}
        {selectedTableInfo.row_count !== undefined && (
          <span className="ml-2 text-xs text-muted-foreground">
            ({formatRowCount(selectedTableInfo.row_count)} {t('query.tableSelector.rows', '行')})
          </span>
        )}
      </span>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={t('query.tableSelector.selectTable', '选择表')}
          disabled={disabled || hasNoTables}
          className={cn(
            'w-full justify-between font-normal',
            !selectedTable && 'text-muted-foreground',
            className
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <Table2 className="h-4 w-4 shrink-0" />
            {selectedTable ? (
              getDisplayName()
            ) : (
              <span>{placeholder || t('query.tableSelector.placeholder', '选择一个表...')}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput 
            placeholder={t('query.tableSelector.searchPlaceholder', '搜索表名...')} 
          />
          <CommandList>
            <CommandEmpty>
              {t('query.tableSelector.noResults', '未找到匹配的表')}
            </CommandEmpty>
            
            {/* 上传的表 */}
            {groupedTables.uploaded.length > 0 && (
              <CommandGroup heading={t('query.tableSelector.groupUploaded', '上传的文件')}>
                {groupedTables.uploaded.map((table) => (
                  <TableCommandItem
                    key={table.name}
                    table={table}
                    isSelected={getTableName(selectedTable || '') === table.name && !isExternalTable(selectedTable || '')}
                    onSelect={() => {
                      onTableSelect(table.name);
                      setOpen(false);
                    }}
                    formatRowCount={formatRowCount}
                  />
                ))}
              </CommandGroup>
            )}

            {/* 数据库表 */}
            {groupedTables.database.length > 0 && (
              <CommandGroup heading={t('query.tableSelector.groupDatabase', '数据库表')}>
                {groupedTables.database.map((table) => (
                  <TableCommandItem
                    key={table.name}
                    table={table}
                    isSelected={getTableName(selectedTable || '') === table.name && !isExternalTable(selectedTable || '')}
                    onSelect={() => {
                      onTableSelect(table.name);
                      setOpen(false);
                    }}
                    formatRowCount={formatRowCount}
                  />
                ))}
              </CommandGroup>
            )}

            {/* 异步任务结果 */}
            {groupedTables.async.length > 0 && (
              <CommandGroup heading={t('query.tableSelector.groupAsync', '异步任务结果')}>
                {groupedTables.async.map((table) => (
                  <TableCommandItem
                    key={table.name}
                    table={table}
                    isSelected={getTableName(selectedTable || '') === table.name && !isExternalTable(selectedTable || '')}
                    onSelect={() => {
                      onTableSelect(table.name);
                      setOpen(false);
                    }}
                    formatRowCount={formatRowCount}
                  />
                ))}
              </CommandGroup>
            )}

            {/* 其他表 */}
            {groupedTables.other.length > 0 && (
              <CommandGroup heading={t('query.tableSelector.groupOther', '其他')}>
                {groupedTables.other.map((table) => (
                  <TableCommandItem
                    key={table.name}
                    table={table}
                    isSelected={getTableName(selectedTable || '') === table.name && !isExternalTable(selectedTable || '')}
                    onSelect={() => {
                      onTableSelect(table.name);
                      setOpen(false);
                    }}
                    formatRowCount={formatRowCount}
                  />
                ))}
              </CommandGroup>
            )}

            {/* 外部数据库表 */}
            {showExternalTables && (
              <CommandGroup heading={t('query.tableSelector.groupExternal', '外部数据库')}>
                {selectedTable && isExternalTable(selectedTable) && (
                  <ExternalTableCommandItem
                    table={normalizeSelectedTable(selectedTable) as SelectedTableObject}
                    isSelected
                    onSelect={() => {
                      onTableSelect(selectedTable);
                      setOpen(false);
                    }}
                  />
                )}
                <CommandItem
                  value="__external_hint__"
                  disabled
                  className="text-xs text-muted-foreground"
                >
                  {t('query.tableSelector.externalHint', '外部表请从左侧数据源面板选择')}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

// 表列表项组件
interface TableCommandItemProps {
  table: Table;
  isSelected: boolean;
  onSelect: () => void;
  formatRowCount: (count?: number) => string;
}

const TableCommandItem: React.FC<TableCommandItemProps> = ({
  table,
  isSelected,
  onSelect,
  formatRowCount,
}) => {
  return (
    <CommandItem
      value={table.name}
      onSelect={onSelect}
      className="flex items-center justify-between"
    >
      <div className="flex items-center gap-2">
        <Check
          className={cn(
            'h-4 w-4',
            isSelected ? 'opacity-100' : 'opacity-0'
          )}
        />
        <Table2 className="h-4 w-4 text-muted-foreground" />
        <span className="truncate">{table.name}</span>
      </div>
      {table.row_count !== undefined && (
        <span className="text-xs text-muted-foreground">
          {formatRowCount(table.row_count)} 行
        </span>
      )}
    </CommandItem>
  );
};

// 外部表列表项组件
interface ExternalTableCommandItemProps {
  table: SelectedTableObject;
  isSelected: boolean;
  onSelect: () => void;
}

const ExternalTableCommandItem: React.FC<ExternalTableCommandItemProps> = ({
  table,
  isSelected,
  onSelect,
}) => {
  const icon = table.connection ? (DATABASE_TYPE_ICONS[table.connection.type] || '📊') : '📊';
  const displayName = table.schema ? `${table.schema}.${table.name}` : table.name;
  const databaseType = table.connection?.type;
  
  return (
    <CommandItem
      value={`external:${table.connection?.id ?? ''}:${table.schema ?? ''}:${table.name}`}
      onSelect={onSelect}
      className="flex items-center justify-between"
    >
      <div className="flex items-center gap-2">
        <Check
          className={cn(
            'h-4 w-4',
            isSelected ? 'opacity-100' : 'opacity-0'
          )}
        />
        <span className="text-sm">{icon}</span>
        <span className="truncate">{displayName}</span>
      </div>
      {databaseType && (
        <Badge variant="outline" className="text-xs px-1 py-0 text-muted-foreground">
          {databaseType.toUpperCase()}
        </Badge>
      )}
    </CommandItem>
  );
};

export default TableSelector;
