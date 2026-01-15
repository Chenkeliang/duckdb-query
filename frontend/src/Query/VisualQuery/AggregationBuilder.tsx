import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTableColumns } from '@/hooks/useTableColumns';
import type { AggregationConfig, AggregateFunction } from './QueryBuilder';

// 聚合函数选项
const AGGREGATE_FUNCTIONS: {
  value: AggregateFunction;
  label: string;
  description: string;
}[] = [
  { value: 'COUNT', label: 'COUNT', description: '计数' },
  { value: 'COUNT_DISTINCT', label: 'COUNT DISTINCT', description: '去重计数' },
  { value: 'SUM', label: 'SUM', description: '求和' },
  { value: 'AVG', label: 'AVG', description: '平均值' },
  { value: 'MIN', label: 'MIN', description: '最小值' },
  { value: 'MAX', label: 'MAX', description: '最大值' },
];

export interface AggregationBuilderProps {
  /** 表名 */
  tableName: string | null;
  /** 聚合配置列表 */
  aggregations: AggregationConfig[];
  /** GROUP BY 字段列表 */
  groupBy: string[];
  /** 聚合配置变更回调 */
  onAggregationsChange: (aggregations: AggregationConfig[]) => void;
  /** GROUP BY 变更回调 */
  onGroupByChange: (groupBy: string[]) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 聚合构建器组件
 *
 * 支持添加聚合函数和 GROUP BY 字段
 */
export const AggregationBuilder: React.FC<AggregationBuilderProps> = ({
  tableName,
  aggregations,
  groupBy,
  onAggregationsChange,
  onGroupByChange,
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
    `agg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  // 添加聚合
  const handleAddAggregation = useCallback(() => {
    const newAgg: AggregationConfig = {
      id: generateId(),
      column: columns[0]?.column_name || '',
      function: 'COUNT',
      alias: '',
    };
    onAggregationsChange([...aggregations, newAgg]);
  }, [aggregations, columns, onAggregationsChange]);

  // 删除聚合
  const handleRemoveAggregation = useCallback(
    (id: string) => {
      onAggregationsChange(aggregations.filter((a) => a.id !== id));
    },
    [aggregations, onAggregationsChange]
  );

  // 更新聚合
  const handleUpdateAggregation = useCallback(
    (id: string, updates: Partial<AggregationConfig>) => {
      onAggregationsChange(
        aggregations.map((a) => (a.id === id ? { ...a, ...updates } : a))
      );
    },
    [aggregations, onAggregationsChange]
  );

  // 切换 GROUP BY 字段
  const handleToggleGroupBy = useCallback(
    (columnName: string) => {
      if (groupBy.includes(columnName)) {
        onGroupByChange(groupBy.filter((c) => c !== columnName));
      } else {
        onGroupByChange([...groupBy, columnName]);
      }
    },
    [groupBy, onGroupByChange]
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
          {t('query.aggregate.selectTableFirst', '请先选择一个表')}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* 聚合函数列表 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            <span className="font-medium">
              {t('query.aggregate.title', '聚合函数')}
            </span>
            <span className="text-xs text-muted-foreground">
              ({aggregations.length})
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddAggregation}
            disabled={disabled || columns.length === 0}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('query.aggregate.addAggregation', '添加聚合')}
          </Button>
        </div>

        <div className="space-y-3">
          {aggregations.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-muted-foreground border border-dashed border-border rounded-md">
              <p className="text-sm">
                {t('query.aggregate.noAggregations', '暂无聚合函数')}
              </p>
            </div>
          ) : (
            aggregations.map((agg) => (
              <AggregationRow
                key={agg.id}
                aggregation={agg}
                columns={columns}
                onUpdate={(updates) => handleUpdateAggregation(agg.id, updates)}
                onRemove={() => handleRemoveAggregation(agg.id)}
                disabled={disabled}
              />
            ))
          )}
        </div>
      </div>

      {/* GROUP BY 字段选择 */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {t('query.aggregate.groupBy', 'GROUP BY 字段')}
          </span>
          <span className="text-xs text-muted-foreground">
            ({groupBy.length})
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {columns.map((col) => (
            <div
              key={col.column_name}
              className="flex items-center space-x-2 p-2 bg-surface border border-border rounded-md"
            >
              <Checkbox
                id={`groupby-${col.column_name}`}
                checked={groupBy.includes(col.column_name)}
                onCheckedChange={() => handleToggleGroupBy(col.column_name)}
                disabled={disabled}
              />
              <Label
                htmlFor={`groupby-${col.column_name}`}
                className="text-sm cursor-pointer truncate flex-1"
                title={col.column_name}
              >
                {col.column_name}
              </Label>
            </div>
          ))}
        </div>

        {groupBy.length === 0 && aggregations.length > 0 && (
          <p className="text-xs text-warning">
            {t(
              'query.aggregate.noGroupByWarning',
              '提示：使用聚合函数时，通常需要选择 GROUP BY 字段'
            )}
          </p>
        )}
      </div>
    </div>
  );
};

// 单个聚合行
interface AggregationRowProps {
  aggregation: AggregationConfig;
  columns: Array<{ column_name: string; data_type: string }>;
  onUpdate: (updates: Partial<AggregationConfig>) => void;
  onRemove: () => void;
  disabled: boolean;
}

const AggregationRow: React.FC<AggregationRowProps> = ({
  aggregation,
  columns,
  onUpdate,
  onRemove,
  disabled,
}) => {
  const { t } = useTranslation('common');

  return (
    <div className="flex items-center gap-2 p-3 bg-surface border border-border rounded-lg">
      {/* 聚合函数选择 */}
      <Select
        value={aggregation.function}
        onValueChange={(value: AggregateFunction) =>
          onUpdate({ function: value })
        }
        disabled={disabled}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder={t('query.aggregate.function', '函数')} />
        </SelectTrigger>
        <SelectContent>
          {AGGREGATE_FUNCTIONS.map((func) => (
            <SelectItem key={func.value} value={func.value}>
              <div className="flex items-center gap-2">
                <span>{func.label}</span>
                <span className="text-xs text-muted-foreground">
                  ({func.description})
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 列选择 */}
      <Select
        value={aggregation.column}
        onValueChange={(value) => onUpdate({ column: value })}
        disabled={disabled}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder={t('query.aggregate.column', '列')} />
        </SelectTrigger>
        <SelectContent>
          {columns.map((col) => (
            <SelectItem key={col.column_name} value={col.column_name}>
              {col.column_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 别名输入 */}
      <div className="flex items-center gap-2 flex-1">
        <span className="text-sm text-muted-foreground">AS</span>
        <Input
          value={aggregation.alias || ''}
          onChange={(e) => onUpdate({ alias: e.target.value })}
          placeholder={t('query.aggregate.alias', '别名（可选）')}
          disabled={disabled}
          className="flex-1"
        />
      </div>

      {/* 删除按钮 */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        className="shrink-0 text-muted-foreground hover:text-error"
        aria-label={t('query.aggregate.removeAggregation', '删除聚合')}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default AggregationBuilder;
