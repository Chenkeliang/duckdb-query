import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Check, Columns3, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/new/components/ui/button';
import { Checkbox } from '@/new/components/ui/checkbox';
import { Input } from '@/new/components/ui/input';
import { Skeleton } from '@/new/components/ui/skeleton';
import { getDuckDBTableDetail } from '@/services/apiClient';

// 列信息类型
export interface ColumnInfo {
  column_name: string;
  data_type: string;
  null_count?: number;
  distinct_count?: number;
  min_value?: string | number | null;
  max_value?: string | number | null;
  avg_value?: number | null;
  sample_values?: string[];
}

// 表详情响应类型
interface TableDetailResponse {
  success: boolean;
  table: {
    table_name: string;
    row_count: number;
    column_count: number;
    columns: ColumnInfo[];
  };
}

export interface ColumnSelectorProps {
  /** 表名 */
  tableName: string | null;
  /** 已选择的列 */
  selectedColumns: string[];
  /** 列选择变更回调 */
  onColumnsChange: (columns: string[]) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 列选择器组件
 * 
 * 使用 useQuery + getDuckDBTableDetail 获取列信息，支持多选和搜索
 * 
 * @example
 * ```tsx
 * <ColumnSelector
 *   tableName="my_table"
 *   selectedColumns={selectedColumns}
 *   onColumnsChange={(cols) => setSelectedColumns(cols)}
 * />
 * ```
 */
export const ColumnSelector: React.FC<ColumnSelectorProps> = ({
  tableName,
  selectedColumns,
  onColumnsChange,
  disabled = false,
  className,
}) => {
  const { t } = useTranslation('common');
  const [searchTerm, setSearchTerm] = useState('');

  // 获取表详情
  const { data, isLoading, isError } = useQuery<TableDetailResponse>({
    queryKey: ['duckdb-table-detail', tableName],
    queryFn: () => getDuckDBTableDetail(tableName!),
    enabled: !!tableName,
    staleTime: 5 * 60 * 1000, // 5 分钟缓存
  });

  const columns = data?.table?.columns || [];

  // 过滤列
  const filteredColumns = useMemo(() => {
    if (!searchTerm) return columns;
    const term = searchTerm.toLowerCase();
    return columns.filter(
      (col) =>
        col.column_name.toLowerCase().includes(term) ||
        col.data_type.toLowerCase().includes(term)
    );
  }, [columns, searchTerm]);

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedColumns.length === columns.length) {
      onColumnsChange([]);
    } else {
      onColumnsChange(columns.map((col) => col.column_name));
    }
  };

  // 切换单个列选择
  const handleToggleColumn = (columnName: string) => {
    if (selectedColumns.includes(columnName)) {
      onColumnsChange(selectedColumns.filter((c) => c !== columnName));
    } else {
      onColumnsChange([...selectedColumns, columnName]);
    }
  };

  // 获取数据类型的显示颜色 - 使用语义化颜色
  const getTypeColor = (dataType: string): string => {
    const type = dataType.toLowerCase();
    if (type.includes('int') || type.includes('decimal') || type.includes('float') || type.includes('double') || type.includes('numeric')) {
      return 'bg-primary/10 text-primary';
    }
    if (type.includes('varchar') || type.includes('text') || type.includes('char') || type.includes('string')) {
      return 'bg-success/10 text-success';
    }
    if (type.includes('date') || type.includes('time') || type.includes('timestamp')) {
      return 'bg-accent text-accent-foreground';
    }
    if (type.includes('bool')) {
      return 'bg-warning/10 text-warning';
    }
    return 'bg-muted text-muted-foreground';
  };

  // 无表选择时的提示
  if (!tableName) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground p-4', className)}>
        <Columns3 className="h-4 w-4" />
        <span>{t('query.columnSelector.placeholder', '请先选择一个表')}</span>
      </div>
    );
  }

  // 加载状态
  if (isLoading) {
    return (
      <div className={cn('space-y-3 p-4', className)}>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  // 错误状态
  if (isError) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-error p-4', className)}>
        <Columns3 className="h-4 w-4" />
        <span>{t('query.columnSelector.loadError', '加载列信息失败')}</span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* 搜索和全选 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('query.columnSelector.searchPlaceholder', '搜索列名...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            disabled={disabled}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
          disabled={disabled || columns.length === 0}
        >
          {selectedColumns.length === columns.length
            ? t('query.columnSelector.deselectAll', '取消全选')
            : t('query.columnSelector.selectAll', '全选')}
        </Button>
      </div>

      {/* 已选择数量 */}
      <div className="text-sm text-muted-foreground">
        {t('query.columnSelector.selectedCount', '已选择 {{count}} 列', {
          count: selectedColumns.length,
        })}
        {columns.length > 0 && ` / ${columns.length}`}
      </div>

      {/* 列列表 */}
      <div className="max-h-72 overflow-y-auto space-y-1 border border-border rounded-md p-2">
        {filteredColumns.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            {t('query.columnSelector.noResults', '未找到匹配的列')}
          </div>
        ) : (
          filteredColumns.map((column) => (
            <ColumnItem
              key={column.column_name}
              column={column}
              isSelected={selectedColumns.includes(column.column_name)}
              onToggle={() => handleToggleColumn(column.column_name)}
              disabled={disabled}
              getTypeColor={getTypeColor}
            />
          ))
        )}
      </div>
    </div>
  );
};

// 列项组件
interface ColumnItemProps {
  column: ColumnInfo;
  isSelected: boolean;
  onToggle: () => void;
  disabled: boolean;
  getTypeColor: (type: string) => string;
}

const ColumnItem: React.FC<ColumnItemProps> = ({
  column,
  isSelected,
  onToggle,
  disabled,
  getTypeColor,
}) => {
  return (
    <div
      className={cn(
        'flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors',
        'hover:bg-surface-hover',
        isSelected && 'bg-primary/10'
      )}
      onClick={onToggle}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={onToggle}
        disabled={disabled}
        aria-label={`Select column ${column.column_name}`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{column.column_name}</span>
          <span className={cn('text-xs px-1.5 py-0.5 rounded-md font-medium', getTypeColor(column.data_type))}>
            {column.data_type}
          </span>
        </div>
        {column.distinct_count !== undefined && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {column.distinct_count} distinct
            {column.null_count !== undefined && column.null_count > 0 && (
              <span className="ml-2">{column.null_count} nulls</span>
            )}
          </div>
        )}
      </div>
      {isSelected && (
        <Check className="h-4 w-4 text-primary shrink-0" />
      )}
    </div>
  );
};

export default ColumnSelector;
