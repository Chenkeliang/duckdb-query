import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ArrowUpDown, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTableColumns } from '@/hooks/useTableColumns';
import type { SortConfig } from './QueryBuilder';

export interface SortBuilderProps {
  /** 表名 */
  tableName: string | null;
  /** 排序配置列表 */
  orderBy: SortConfig[];
  /** 排序配置变更回调 */
  onOrderByChange: (orderBy: SortConfig[]) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 排序构建器组件
 *
 * 支持多列排序，支持 ASC/DESC
 */
export const SortBuilder: React.FC<SortBuilderProps> = ({
  tableName,
  orderBy,
  onOrderByChange,
  disabled = false,
  className,
}) => {
  const { t } = useTranslation('common');

  // 获取表的列信息 - 使用统一的 useTableColumns Hook
  const { columns: rawColumns } = useTableColumns(tableName || null);

  // 转换为组件期望的格式
  const columns = useMemo(() => 
    (rawColumns || []).map(col => ({ column_name: col.name, data_type: col.type })),
    [rawColumns]
  );

  // 生成唯一 ID
  const generateId = () =>
    `sort_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  // 添加排序
  const handleAddSort = useCallback(() => {
    // 找到第一个未被使用的列
    const usedColumns = orderBy.map((s) => s.column);
    const availableColumn = columns.find(
      (c: { column_name: string }) => !usedColumns.includes(c.column_name)
    );

    const newSort: SortConfig = {
      id: generateId(),
      column: availableColumn?.column_name || columns[0]?.column_name || '',
      direction: 'ASC',
    };
    onOrderByChange([...orderBy, newSort]);
  }, [orderBy, columns, onOrderByChange]);

  // 删除排序
  const handleRemoveSort = useCallback(
    (id: string) => {
      onOrderByChange(orderBy.filter((s) => s.id !== id));
    },
    [orderBy, onOrderByChange]
  );

  // 更新排序
  const handleUpdateSort = useCallback(
    (id: string, updates: Partial<SortConfig>) => {
      onOrderByChange(
        orderBy.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );
    },
    [orderBy, onOrderByChange]
  );

  // 移动排序（调整优先级）
  const handleMoveSort = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const index = orderBy.findIndex((s) => s.id === id);
      if (index === -1) return;

      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= orderBy.length) return;

      const newOrderBy = [...orderBy];
      [newOrderBy[index], newOrderBy[newIndex]] = [
        newOrderBy[newIndex],
        newOrderBy[index],
      ];
      onOrderByChange(newOrderBy);
    },
    [orderBy, onOrderByChange]
  );

  // 无表选择时的提示
  if (!tableName) {
    return (
      <div
        className={cn(
          'flex items-center justify-center h-40 text-muted-foreground',
          className
        )}
      >
        <p className="text-sm">
          {t('query.sort.selectTableFirst', '请先选择一个表')}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* 标题和添加按钮 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4" />
          <span className="font-medium">{t('query.sort.title', '排序')}</span>
          <span className="text-xs text-muted-foreground">
            ({orderBy.length})
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddSort}
          disabled={disabled || columns.length === 0}
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('query.sort.addSort', '添加排序')}
        </Button>
      </div>

      {/* 排序列表 */}
      <div className="space-y-3">
        {orderBy.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-muted-foreground border border-dashed border-border rounded-md">
            <p className="text-sm">
              {t('query.sort.noSorts', '暂无排序条件')}
            </p>
          </div>
        ) : (
          orderBy.map((sort, index) => (
            <SortRow
              key={sort.id}
              sort={sort}
              index={index}
              totalCount={orderBy.length}
              columns={columns}
              onUpdate={(updates) => handleUpdateSort(sort.id, updates)}
              onRemove={() => handleRemoveSort(sort.id)}
              onMoveUp={() => handleMoveSort(sort.id, 'up')}
              onMoveDown={() => handleMoveSort(sort.id, 'down')}
              disabled={disabled}
            />
          ))
        )}
      </div>

      {/* 排序说明 */}
      {orderBy.length > 1 && (
        <p className="text-xs text-muted-foreground">
          {t(
            'query.sort.priorityHint',
            '提示：排序按从上到下的顺序优先级递减'
          )}
        </p>
      )}
    </div>
  );
};

// 单个排序行
interface SortRowProps {
  sort: SortConfig;
  index: number;
  totalCount: number;
  columns: Array<{ column_name: string; data_type: string }>;
  onUpdate: (updates: Partial<SortConfig>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  disabled: boolean;
}

const SortRow: React.FC<SortRowProps> = ({
  sort,
  index,
  totalCount,
  columns,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  disabled,
}) => {
  const { t } = useTranslation('common');

  return (
    <div className="flex items-center gap-2 p-3 bg-surface border border-border rounded-lg">
      {/* 优先级指示 */}
      <div className="flex items-center gap-1">
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
        <span className="text-xs text-muted-foreground w-4">{index + 1}</span>
      </div>

      {/* 上下移动按钮 */}
      <div className="flex flex-col gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={onMoveUp}
          disabled={disabled || index === 0}
          aria-label={t('query.sort.moveUp', '上移')}
        >
          <ArrowUp className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={onMoveDown}
          disabled={disabled || index === totalCount - 1}
          aria-label={t('query.sort.moveDown', '下移')}
        >
          <ArrowDown className="h-3 w-3" />
        </Button>
      </div>

      {/* 列选择 */}
      <Select
        value={sort.column}
        onValueChange={(value) => onUpdate({ column: value })}
        disabled={disabled}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder={t('query.sort.column', '列')} />
        </SelectTrigger>
        <SelectContent>
          {columns.map((col) => (
            <SelectItem key={col.column_name} value={col.column_name}>
              {col.column_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 排序方向 */}
      <Select
        value={sort.direction}
        onValueChange={(value: 'ASC' | 'DESC') =>
          onUpdate({ direction: value })
        }
        disabled={disabled}
      >
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ASC">
            <div className="flex items-center gap-2">
              <ArrowUp className="h-3 w-3" />
              <span>{t('query.sort.ascending', '升序')}</span>
            </div>
          </SelectItem>
          <SelectItem value="DESC">
            <div className="flex items-center gap-2">
              <ArrowDown className="h-3 w-3" />
              <span>{t('query.sort.descending', '降序')}</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      {/* 删除按钮 */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        className="shrink-0 text-muted-foreground hover:text-error ml-auto"
        aria-label={t('query.sort.removeSort', '删除排序')}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default SortBuilder;
