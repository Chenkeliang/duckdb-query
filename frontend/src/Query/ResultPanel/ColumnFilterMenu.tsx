/**
 * Excel 风格列筛选菜单组件
 * 提供唯一值选择、搜索、快捷操作等功能
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import type { Column, GridApi } from 'ag-grid-community';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ColumnValueFilterContext } from './AGGridWrapper';

export interface ColumnFilterMenuProps {
  /** AG Grid 列对象 */
  column: Column;
  /** AG Grid API */
  gridApi: GridApi;
  /** 自定义列值筛选上下文（基于 external filter） */
  context?: ColumnValueFilterContext;
  /** 是否打开 */
  open: boolean;
  /** 打开状态变化回调 */
  onOpenChange: (open: boolean) => void;
  /** 触发器元素 */
  children: React.ReactNode;
}

interface DistinctValue {
  value: string;
  count: number;
}

/**
 * Excel 风格列筛选菜单
 */
export function ColumnFilterMenu({
  column,
  gridApi,
  context,
  open,
  onOpenChange,
  children,
}: ColumnFilterMenuProps) {
  const { t } = useTranslation('common');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'include' | 'exclude'>('include');
  const [distinctValues, setDistinctValues] = useState<DistinctValue[]>([]);
  const [loading, setLoading] = useState(false);

  // 搜索防抖（300ms）
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchText(searchText);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchText]);

  // 计算唯一值
  useEffect(() => {
    if (!open || !gridApi) return;

    setLoading(true);
    
    // 性能监控
    const startTime = performance.now();
    
    const values = new Map<string, number>();
    const maxRows = 10000; // 采样最多 10000 行优化性能
    const colId = column.getColId();

    let rowCount = 0;
    gridApi.forEachNodeAfterFilterAndSort((node) => {
      if (rowCount >= maxRows) return;
      rowCount++;

      const value = node.data?.[colId];
      const strValue = value === null || value === undefined ? '(空)' : String(value);

      values.set(strValue, (values.get(strValue) || 0) + 1);
    });

    const sorted = Array.from(values.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 1000); // 最多显示 1000 个唯一值

    setDistinctValues(sorted);

    // 如果已有筛选，回填筛选状态；否则默认全选
    const existing = context?.getColumnValueFilter?.(colId);
    if (existing) {
      setMode(existing.mode);
      setSelectedValues(new Set(existing.values));
    } else {
      setMode('include');
      setSelectedValues(new Set(sorted.map((v) => v.value)));
    }

    setLoading(false);
    
    // 性能监控日志
    const endTime = performance.now();
    const duration = endTime - startTime;
    if (duration > 500) {
      console.warn(`ColumnFilterMenu: 唯一值计算耗时 ${duration.toFixed(2)}ms (列: ${colId}, 行数: ${rowCount}, 唯一值: ${values.size})`);
    }
  }, [open, gridApi, column, context]);

  // 过滤显示的值（使用防抖后的搜索文本）
  const filteredValues = useMemo(() => {
    if (!debouncedSearchText) return distinctValues;
    const lower = debouncedSearchText.toLowerCase();
    return distinctValues.filter((v) => v.value.toLowerCase().includes(lower));
  }, [distinctValues, debouncedSearchText]);

  // 切换单个值的选中状态
  const toggleValue = useCallback((value: string) => {
    setSelectedValues((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(value)) {
        newSet.delete(value);
      } else {
        newSet.add(value);
      }
      return newSet;
    });
  }, []);

  // 快捷操作：全选
  const handleSelectAll = useCallback(() => {
    setSelectedValues(new Set(filteredValues.map((v) => v.value)));
  }, [filteredValues]);

  // 快捷操作：反选
  const handleInvert = useCallback(() => {
    const newSet = new Set<string>();
    filteredValues.forEach((v) => {
      if (!selectedValues.has(v.value)) {
        newSet.add(v.value);
      }
    });
    setSelectedValues(newSet);
  }, [filteredValues, selectedValues]);

  // 快捷操作：重复项（出现次数 > 1）
  const handleSelectDuplicates = useCallback(() => {
    const newSet = new Set<string>();
    filteredValues.forEach((v) => {
      if (v.count > 1) {
        newSet.add(v.value);
      }
    });
    setSelectedValues(newSet);
  }, [filteredValues]);

  // 快捷操作：唯一项（出现次数 = 1）
  const handleSelectUnique = useCallback(() => {
    const newSet = new Set<string>();
    filteredValues.forEach((v) => {
      if (v.count === 1) {
        newSet.add(v.value);
      }
    });
    setSelectedValues(newSet);
  }, [filteredValues]);

  // 切换包含/排除模式
  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === 'include' ? 'exclude' : 'include'));
  }, []);

  // 应用筛选
  const handleApply = useCallback(() => {
    const colId = column.getColId();

    if (!context?.setColumnValueFilter || !context?.clearColumnValueFilter) {
      console.warn('ColumnFilterMenu: missing columnValueFilters context');
      onOpenChange(false);
      return;
    }

    const valuesToFilter = Array.from(selectedValues);
    const isAllSelected = valuesToFilter.length === distinctValues.length;
    const isEmpty = valuesToFilter.length === 0;

    if (mode === 'include') {
      if (isEmpty || isAllSelected) {
        context.clearColumnValueFilter(colId);
      } else {
        context.setColumnValueFilter(colId, { values: valuesToFilter, mode });
      }
    } else {
      // exclude: 选中的值会被排除；若为空则等同于不筛选
      if (isEmpty) {
        context.clearColumnValueFilter(colId);
      } else {
        context.setColumnValueFilter(colId, { values: valuesToFilter, mode });
      }
    }

    onOpenChange(false);
  }, [column, selectedValues, distinctValues.length, mode, onOpenChange, context]);

  // 重置筛选
  const handleReset = useCallback(() => {
    const colId = column.getColId();

    context?.clearColumnValueFilter?.(colId);
    
    onOpenChange(false);
  }, [column, onOpenChange, context]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="flex flex-col h-96">
          {/* 搜索框 */}
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('result.filter.search', '搜索...')}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {/* 快捷操作 */}
          <div className="p-2 border-b border-border">
            <div className="flex flex-wrap gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="h-7 text-xs"
              >
                {t('result.filter.selectAll', '全选')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleInvert}
                className="h-7 text-xs"
              >
                {t('result.filter.invert', '反选')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectDuplicates}
                className="h-7 text-xs"
              >
                {t('result.filter.duplicates', '重复项')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectUnique}
                className="h-7 text-xs"
              >
                {t('result.filter.unique', '唯一项')}
              </Button>
            </div>
          </div>

          {/* 模式切换 */}
          <div className="p-2 border-b border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleMode}
              className="w-full h-7 text-xs"
            >
              {mode === 'include'
                ? t('result.filter.include', '包含选中项')
                : t('result.filter.exclude', '排除选中项')}
            </Button>
          </div>

          {/* 值列表 */}
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loading ? (
                <div className="text-center text-sm text-muted-foreground py-4">
                  {t('common.loading', '加载中...')}
                </div>
              ) : filteredValues.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-4">
                  {t('result.filter.noValues', '无匹配值')}
                </div>
              ) : (
                filteredValues.map((item) => (
                  <div
                    key={item.value}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                    onClick={() => toggleValue(item.value)}
                  >
                    <Checkbox
                      checked={selectedValues.has(item.value)}
                      onCheckedChange={() => toggleValue(item.value)}
                    />
                    <span className="flex-1 text-sm truncate">{item.value}</span>
                    <span className="text-xs text-muted-foreground">
                      ({item.count})
                    </span>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          {/* 底部操作按钮 */}
          <Separator />
          <div className="p-3 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="flex-1"
            >
              {t('common.reset', '重置')}
            </Button>
            <Button size="sm" onClick={handleApply} className="flex-1">
              {t('common.apply', '应用')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
