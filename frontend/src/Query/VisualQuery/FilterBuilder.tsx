import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTableColumns } from '@/hooks/useTableColumns';
import type { FilterConfig, FilterOperator } from './QueryBuilder';

// 操作符选项
const OPERATORS: { value: FilterOperator; label: string; requiresValue: boolean }[] = [
  { value: '=', label: '等于 (=)', requiresValue: true },
  { value: '!=', label: '不等于 (!=)', requiresValue: true },
  { value: '>', label: '大于 (>)', requiresValue: true },
  { value: '<', label: '小于 (<)', requiresValue: true },
  { value: '>=', label: '大于等于 (>=)', requiresValue: true },
  { value: '<=', label: '小于等于 (<=)', requiresValue: true },
  { value: 'LIKE', label: '包含 (LIKE)', requiresValue: true },
  { value: 'ILIKE', label: '包含-忽略大小写 (ILIKE)', requiresValue: true },
  { value: 'IS NULL', label: '为空 (IS NULL)', requiresValue: false },
  { value: 'IS NOT NULL', label: '不为空 (IS NOT NULL)', requiresValue: false },
  { value: 'BETWEEN', label: '介于 (BETWEEN)', requiresValue: true },
  { value: 'IN', label: '在列表中 (IN)', requiresValue: true },
];

export interface FilterBuilderProps {
  /** 表名 */
  tableName: string | null;
  /** 过滤条件列表 */
  filters: FilterConfig[];
  /** 过滤条件变更回调 */
  onFiltersChange: (filters: FilterConfig[]) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 过滤器构建器组件
 * 
 * 支持添加/删除过滤条件，支持多种操作符
 */
export const FilterBuilder: React.FC<FilterBuilderProps> = ({
  tableName,
  filters,
  onFiltersChange,
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
  const generateId = () => `filter_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  // 验证所有过滤条件
  const allFiltersValid = filters.every((filter) => {
    if (!filter.column) return false;
    const operatorInfo = OPERATORS.find((op) => op.value === filter.operator);
    if (operatorInfo?.requiresValue) {
      if (filter.value === null || filter.value === undefined || filter.value === '') {
        return false;
      }
      if (filter.operator === 'BETWEEN') {
        if (filter.value2 === null || filter.value2 === undefined || filter.value2 === '') {
          return false;
        }
      }
    }
    return true;
  });

  // 获取过滤条件的验证状态
  const getFilterValidation = useCallback((filter: FilterConfig): { isValid: boolean; message?: string } => {
    if (!filter.column) {
      return { isValid: false, message: t('query.filter.validation.selectColumn', '请选择列') };
    }
    
    const operatorInfo = OPERATORS.find((op) => op.value === filter.operator);
    if (operatorInfo?.requiresValue) {
      if (filter.value === null || filter.value === undefined || filter.value === '') {
        return { isValid: false, message: t('query.filter.validation.enterValue', '请输入值') };
      }
      if (filter.operator === 'BETWEEN') {
        if (filter.value2 === null || filter.value2 === undefined || filter.value2 === '') {
          return { isValid: false, message: t('query.filter.validation.enterValue2', '请输入第二个值') };
        }
      }
    }
    return { isValid: true };
  }, [t]);

  // 添加过滤条件
  const handleAddFilter = useCallback(() => {
    const newFilter: FilterConfig = {
      id: generateId(),
      column: columns[0]?.column_name || '',
      operator: '=',
      value: '',
      logicOperator: filters.length > 0 ? 'AND' : 'AND',
    };
    onFiltersChange([...filters, newFilter]);
  }, [filters, columns, onFiltersChange]);

  // 删除过滤条件
  const handleRemoveFilter = useCallback(
    (id: string) => {
      onFiltersChange(filters.filter((f) => f.id !== id));
    },
    [filters, onFiltersChange]
  );

  // 更新过滤条件
  const handleUpdateFilter = useCallback(
    (id: string, updates: Partial<FilterConfig>) => {
      onFiltersChange(
        filters.map((f) => (f.id === id ? { ...f, ...updates } : f))
      );
    },
    [filters, onFiltersChange]
  );

  // 无表选择时的提示
  if (!tableName) {
    return (
      <div className={cn('flex items-center justify-center h-40 text-muted-foreground', className)}>
        <p className="text-sm">{t('query.filter.selectTableFirst', '请先选择一个表')}</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* 过滤条件列表 */}
      <div className="space-y-3">
        {filters.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-muted-foreground border border-dashed border-border rounded-md">
            <p className="text-sm">{t('query.filter.noFilters', '暂无过滤条件')}</p>
          </div>
        ) : (
          filters.map((filter, index) => {
            const validation = getFilterValidation(filter);
            return (
              <FilterRow
                key={filter.id}
                filter={filter}
                columns={columns}
                isFirst={index === 0}
                onUpdate={(updates) => handleUpdateFilter(filter.id, updates)}
                onRemove={() => handleRemoveFilter(filter.id)}
                disabled={disabled}
                validation={validation}
              />
            );
          })
        )}
      </div>

      {/* 添加按钮 */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleAddFilter}
        disabled={disabled || columns.length === 0}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        {t('query.filter.addCondition', '添加条件')}
      </Button>

      {/* 验证状态提示 */}
      {filters.length > 0 && !allFiltersValid && (
        <p className="text-xs text-warning">
          {t('query.filter.validation.incomplete', '部分过滤条件不完整')}
        </p>
      )}
    </div>
  );
};

// 单个过滤条件行
interface FilterRowProps {
  filter: FilterConfig;
  columns: Array<{ column_name: string; data_type: string }>;
  isFirst: boolean;
  onUpdate: (updates: Partial<FilterConfig>) => void;
  onRemove: () => void;
  disabled: boolean;
  validation: { isValid: boolean; message?: string };
}

const FilterRow: React.FC<FilterRowProps> = ({
  filter,
  columns,
  isFirst,
  onUpdate,
  onRemove,
  disabled,
  validation,
}) => {
  const { t } = useTranslation('common');
  const operatorInfo = OPERATORS.find((op) => op.value === filter.operator);
  const requiresValue = operatorInfo?.requiresValue ?? true;
  const isBetween = filter.operator === 'BETWEEN';

  return (
    <div className={cn(
      "flex items-center gap-2 p-3 bg-surface border rounded-lg",
      validation.isValid ? "border-border" : "border-warning"
    )}>
      {/* 拖拽手柄 */}
      <div className="cursor-grab text-muted-foreground">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* 逻辑操作符 */}
      {!isFirst && (
        <Select
          value={filter.logicOperator}
          onValueChange={(value: 'AND' | 'OR') => onUpdate({ logicOperator: value })}
          disabled={disabled}
        >
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">AND</SelectItem>
            <SelectItem value="OR">OR</SelectItem>
          </SelectContent>
        </Select>
      )}

      {/* 列选择 */}
      <Select
        value={filter.column}
        onValueChange={(value) => onUpdate({ column: value })}
        disabled={disabled}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder={t('query.filter.column', '列')} />
        </SelectTrigger>
        <SelectContent>
          {columns.map((col) => (
            <SelectItem key={col.column_name} value={col.column_name}>
              {col.column_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 操作符选择 */}
      <Select
        value={filter.operator}
        onValueChange={(value: FilterOperator) => onUpdate({ operator: value })}
        disabled={disabled}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder={t('query.filter.operator', '操作符')} />
        </SelectTrigger>
        <SelectContent>
          {OPERATORS.map((op) => (
            <SelectItem key={op.value} value={op.value}>
              {op.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 值输入 */}
      {requiresValue && (
        <>
          <Input
            value={filter.value?.toString() || ''}
            onChange={(e) => onUpdate({ value: e.target.value })}
            placeholder={t('query.filter.value', '值')}
            disabled={disabled}
            className="flex-1 min-w-24"
          />
          {isBetween && (
            <>
              <span className="text-muted-foreground text-sm">~</span>
              <Input
                value={filter.value2?.toString() || ''}
                onChange={(e) => onUpdate({ value2: e.target.value })}
                placeholder={t('query.filter.value2', '值2')}
                disabled={disabled}
                className="flex-1 min-w-24"
              />
            </>
          )}
        </>
      )}

      {/* 删除按钮 */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        className="shrink-0 text-muted-foreground hover:text-error"
        aria-label={t('query.filter.removeCondition', '删除条件')}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default FilterBuilder;
