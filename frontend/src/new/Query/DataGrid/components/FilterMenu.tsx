/**
 * FilterMenu - 列筛选菜单组件
 * 
 * 支持低基数列（值列表）和高基数列（Top 100 + 条件过滤）
 */

import * as React from 'react';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter, Check, X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/new/components/ui/popover';
import { Button } from '@/new/components/ui/button';
import { Input } from '@/new/components/ui/input';
import { Checkbox } from '@/new/components/ui/checkbox';
import { ScrollArea } from '@/new/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/new/components/ui/select';
import { useColumnFilter } from '../hooks/useColumnFilter';
import type { ConditionFilter, ConditionFilterType, ColumnFilterValue, UniqueValueItem } from '../types';
import { getSelectedValuesSize, hasSelectedValue } from '../types';

export interface FilterMenuProps {
  /** 列名 */
  column: string;
  /** 数据 */
  data: Record<string, unknown>[];
  /** 是否有活跃筛选 */
  hasActiveFilter?: boolean;
  /** 当前已应用的筛选值（用于初始化/重置） */
  activeFilterValue?: unknown;
  /** 筛选变化回调 */
  onFilterChange?: (column: string, filter: unknown) => void;
  /** 清除筛选回调 */
  onClearFilter?: (column: string) => void;
}

export const FilterMenu: React.FC<FilterMenuProps> = ({
  column,
  data,
  hasActiveFilter = false,
  activeFilterValue,
  onFilterChange,
  onClearFilter,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [conditionType, setConditionType] = useState<ConditionFilterType>('contains');
  const [conditionValue, setConditionValue] = useState('');

  const {
    uniqueValues,
    isHighCardinality,
    totalUniqueCount,
    filterValue,
    toggleMode,
    toggleValue,
    selectAll,
    clearAll,
    invertSelection,
    setConditionFilter,
    applyFilter,
    setFilter,
  } = useColumnFilter({ data, column });

  const parseAppliedFilter = React.useCallback((value: unknown): {
    valueFilter: ColumnFilterValue | null;
    condition: ConditionFilter | null;
  } => {
    if (!value || typeof value !== 'object') {
      return { valueFilter: null, condition: null };
    }

    if ('selectedValues' in value) {
      const mode = (value as any).mode === 'exclude' ? 'exclude' : 'include';
      const raw = (value as any).selectedValues as unknown;
      const normalized =
        raw instanceof Set
          ? new Set(Array.from(raw as Set<unknown>).map(String))
          : Array.isArray(raw)
            ? new Set(raw.map(String))
            : new Set<string>();
      return { valueFilter: { selectedValues: normalized, mode }, condition: null };
    }

    if ('type' in value && 'value' in value) {
      const type = (value as any).type as ConditionFilterType;
      const v = String((value as any).value ?? '');
      return { valueFilter: null, condition: { type, value: v } };
    }

    return { valueFilter: null, condition: null };
  }, []);

  const initializeDraftFromApplied = React.useCallback(() => {
    const applied = parseAppliedFilter(activeFilterValue);

    if (applied.condition) {
      setConditionType(applied.condition.type);
      setConditionValue(applied.condition.value);
      setConditionFilter(applied.condition);
      setFilter(null);
      return;
    }

    if (applied.valueFilter) {
      setConditionValue('');
      setConditionFilter(null);
      setFilter(applied.valueFilter);
      return;
    }

    // 无已应用筛选：低基数列默认全选（Excel/AG Grid 行为）；高基数列默认空（更鼓励条件过滤）
    setConditionValue('');
    setConditionFilter(null);
    if (!isHighCardinality) {
      setFilter({
        selectedValues: new Set(uniqueValues.map((u) => u.label)),
        mode: 'include',
      });
    } else {
      setFilter(null);
    }
  }, [activeFilterValue, isHighCardinality, parseAppliedFilter, setConditionFilter, setFilter, uniqueValues]);

  React.useEffect(() => {
    if (!open) return;
    initializeDraftFromApplied();
    setSearchValue('');
  }, [open, initializeDraftFromApplied]);

  // 过滤后的值列表
  const filteredValues = useMemo(() => {
    if (!searchValue) return uniqueValues;
    const lower = searchValue.toLowerCase();
    return uniqueValues.filter(v => v.label.toLowerCase().includes(lower));
  }, [uniqueValues, searchValue]);

  const handleApply = () => {
    const trimmedCondition = conditionValue.trim();

    // 高基数列优先使用条件过滤（不会受 TopN 值列表限制）
    if (isHighCardinality && trimmedCondition) {
      const condition: ConditionFilter = { type: conditionType, value: trimmedCondition };
      setConditionFilter(condition);
      onFilterChange?.(column, condition);
      setOpen(false);
      return;
    }

    const next = applyFilter();
    if (!next) {
      onClearFilter?.(column);
      setOpen(false);
      return;
    }

    // 低基数列：如果等同“不过滤”，则清除筛选（用于正确显示图标状态）
    if (!isHighCardinality && typeof next === 'object' && 'selectedValues' in next) {
      const vf = next as ColumnFilterValue;
      const selectedSize = getSelectedValuesSize(vf.selectedValues);
      const total = uniqueValues.length;

      const isNoOpInclude = vf.mode === 'include' && selectedSize === total;
      const isNoOpExclude = vf.mode === 'exclude' && selectedSize === 0;
      if (isNoOpInclude || isNoOpExclude) {
        onClearFilter?.(column);
        setOpen(false);
        return;
      }
    }

    // 确保 Set 被转换为数组以便序列化和状态管理
    if (typeof next === 'object' && next !== null && 'selectedValues' in next) {
      const vf = next as ColumnFilterValue;
      const filterToApply = {
        selectedValues: Array.from(vf.selectedValues),
        mode: vf.mode,
      };
      onFilterChange?.(column, filterToApply);
    } else {
      onFilterChange?.(column, next);
    }
    setOpen(false);
  };

  const handleReset = () => {
    initializeDraftFromApplied();
  };

  const handleClearApplied = () => {
    clearAll();
    setConditionValue('');
    setConditionFilter(null);
    onClearFilter?.(column);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger
        className={cn(
          'dq-data-grid-filter-icon inline-flex h-6 w-6 items-center justify-center rounded-md p-0 hover:bg-accent',
          hasActiveFilter && 'active'
        )}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <Filter className="h-3 w-3" />
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        onOpenAutoFocus={(e) => {
          // 阻止自动聚焦，避免触发关闭
          e.preventDefault();
        }}
      >
        <div className="p-3 space-y-3">
          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('query.result.filter.search', '搜索...')}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          {/* 高基数列：条件过滤 */}
          {isHighCardinality && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Select
                  value={conditionType}
                  onValueChange={(v) => setConditionType(v as ConditionFilterType)}
                >
                  <SelectTrigger className="w-28 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contains">{t('dataGrid.conditionContains')}</SelectItem>
                    <SelectItem value="equals">{t('dataGrid.conditionEquals')}</SelectItem>
                    <SelectItem value="startsWith">{t('dataGrid.conditionStartsWith')}</SelectItem>
                    <SelectItem value="endsWith">{t('dataGrid.conditionEndsWith')}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={conditionValue}
                  onChange={(e) => setConditionValue(e.target.value)}
                  className="flex-1 h-8"
                  placeholder="..."
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('dataGrid.partialValuesHint')} ({totalUniqueCount})
              </p>
            </div>
          )}

          {/* 快捷操作 */}
          <div className="flex gap-1 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                toggleMode();
              }}
              className="h-7 text-xs"
            >
              {filterValue?.mode === 'exclude'
                ? t('query.result.filter.exclude', '排除选中项')
                : t('query.result.filter.include', '包含选中项')}
            </Button>
            <Button variant="outline" size="sm" onClick={selectAll} className="h-7 text-xs">
              {t('dataGrid.selectAll')}
            </Button>
            <Button variant="outline" size="sm" onClick={clearAll} className="h-7 text-xs">
              {t('dataGrid.clearAll')}
            </Button>
            <Button variant="outline" size="sm" onClick={invertSelection} className="h-7 text-xs">
              {t('dataGrid.invertSelection')}
            </Button>
          </div>

          {/* 值列表 */}
          <ScrollArea className="h-48">
            <div className="space-y-1">
              {filteredValues.map((item) => (
                <ValueItem
                  key={item.label}
                  item={item}
                  checked={hasSelectedValue(filterValue?.selectedValues, item.label)}
                  onToggle={() => toggleValue(item.label)}
                />
              ))}
              {filteredValues.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('query.result.filter.noValues')}
                </p>
              )}
            </div>
          </ScrollArea>

          {/* 操作按钮 */}
          <div className="flex items-center justify-between pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={handleReset}>
              {t('common.reset', '重置')}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearApplied}>
              <X className="h-4 w-4 mr-1" />
              {t('dataGrid.clearFilter', '清除筛选')}
            </Button>
            <Button size="sm" onClick={handleApply}>
              <Check className="h-4 w-4 mr-1" />
              {t('common.apply', '应用')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// 值列表项组件
interface ValueItemProps {
  item: UniqueValueItem;
  checked: boolean;
  onToggle: () => void;
}

const ValueItem: React.FC<ValueItemProps> = ({ item, checked, onToggle }) => {
  return (
    <label className="flex items-center gap-2 px-2 py-1 hover:bg-accent rounded cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={onToggle} />
      <span className="flex-1 text-sm truncate">{item.label}</span>
      <span className="text-xs text-muted-foreground">{item.count}</span>
    </label>
  );
};

export { FilterMenu as default };
