/**
 * useColumnFilter - 列筛选 Hook
 * 
 * 支持低基数列（值列表）和高基数列（Top 100 + 条件过滤）
 */

import { useState, useMemo, useCallback } from 'react';
import type {
  ColumnFilterValue,
  ConditionFilter,
  UniqueValueItem
} from '../types';
import { getSelectedValuesSize, toSelectedValuesSet, DATAGRID_CONFIG } from '../types';

/** 使用配置中的筛选阈值 */
const { highCardinalityThreshold: HIGH_CARDINALITY_THRESHOLD, topN: TOP_N } = DATAGRID_CONFIG.filter;

export interface UseColumnFilterOptions {
  /** 数据 */
  data: Record<string, unknown>[];
  /** 列名 */
  column: string;
}

export interface UseColumnFilterReturn {
  /** 唯一值列表（低基数：全部；高基数：Top 100） */
  uniqueValues: UniqueValueItem[];
  /** 是否为高基数列 */
  isHighCardinality: boolean;
  /** 总唯一值数量 */
  totalUniqueCount: number;
  /** 当前筛选值 */
  filterValue: ColumnFilterValue | null;
  /** 条件过滤（高基数列） */
  conditionFilter: ConditionFilter | null;
  /** 设置筛选 */
  setFilter: (value: ColumnFilterValue | null) => void;
  /** 切换包含/排除模式 */
  toggleMode: () => void;
  /** 设置条件过滤 */
  setConditionFilter: (condition: ConditionFilter | null) => void;
  /** 切换值选中状态 */
  toggleValue: (value: string) => void;
  /** 全选 */
  selectAll: () => void;
  /** 清空 */
  clearAll: () => void;
  /** 反选 */
  invertSelection: () => void;
  /** 是否有活跃筛选 */
  hasActiveFilter: boolean;
  /** 应用筛选（高基数列需要手动应用） */
  applyFilter: () => ColumnFilterValue | ConditionFilter | null;
}

export function useColumnFilter({
  data,
  column,
}: UseColumnFilterOptions): UseColumnFilterReturn {
  const [filterValue, setFilterValue] = useState<ColumnFilterValue | null>(null);
  const [conditionFilter, setConditionFilter] = useState<ConditionFilter | null>(null);

  // 计算唯一值和计数
  const { uniqueValues, isHighCardinality, totalUniqueCount } = useMemo(() => {
    const countMap = new Map<string, { value: unknown; count: number }>();

    for (const row of data) {
      const value = row[column];
      const key = value === null || value === undefined ? '__NULL__' : String(value);

      const existing = countMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        countMap.set(key, { value, count: 1 });
      }
    }

    const totalCount = countMap.size;
    const isHigh = totalCount >= HIGH_CARDINALITY_THRESHOLD;

    // 转换为数组并排序
    let items: UniqueValueItem[] = Array.from(countMap.entries()).map(([key, { value, count }]) => ({
      value,
      label: key === '__NULL__' ? '(空)' : key,
      count,
    }));

    // 排序：按出现次数 desc，次数相同按字典序 asc
    items.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    });

    // 高基数列只取 Top N
    if (isHigh) {
      items = items.slice(0, TOP_N);
    }

    return {
      uniqueValues: items,
      isHighCardinality: isHigh,
      totalUniqueCount: totalCount,
    };
  }, [data, column]);

  // 切换值选中状态
  const toggleValue = useCallback((value: string) => {
    setFilterValue(prev => {
      const selectedValues = toSelectedValuesSet(prev?.selectedValues);
      if (selectedValues.has(value)) {
        selectedValues.delete(value);
      } else {
        selectedValues.add(value);
      }
      return {
        selectedValues,
        mode: prev?.mode || 'include',
      };
    });
  }, []);

  const toggleMode = useCallback(() => {
    setFilterValue(prev => {
      const selectedValues = toSelectedValuesSet(prev?.selectedValues);
      const mode = prev?.mode === 'exclude' ? 'include' : 'exclude';
      return { selectedValues, mode };
    });
  }, []);

  // 全选
  const selectAll = useCallback(() => {
    const allValues = new Set(uniqueValues.map(v => v.label));
    setFilterValue({
      selectedValues: allValues,
      mode: filterValue?.mode || 'include',
    });
  }, [uniqueValues, filterValue?.mode]);

  // 清空
  const clearAll = useCallback(() => {
    setFilterValue({
      selectedValues: new Set(),
      mode: filterValue?.mode || 'include',
    });
  }, [filterValue?.mode]);

  // 反选
  const invertSelection = useCallback(() => {
    setFilterValue(prev => {
      const allValues = new Set(uniqueValues.map(v => v.label));
      const currentSelected = toSelectedValuesSet(prev?.selectedValues);
      const selectedValues = new Set<string>();

      for (const value of allValues) {
        if (!currentSelected.has(value)) {
          selectedValues.add(value);
        }
      }

      return {
        selectedValues,
        mode: prev?.mode || 'include',
      };
    });
  }, [uniqueValues]);

  // 是否有活跃筛选
  const hasActiveFilter = useMemo(() => {
    if (conditionFilter && conditionFilter.value) return true;
    if (filterValue && getSelectedValuesSize(filterValue.selectedValues) > 0) return true;
    return false;
  }, [filterValue, conditionFilter]);

  // 应用筛选
  const applyFilter = useCallback(() => {
    if (conditionFilter && conditionFilter.value) {
      return conditionFilter;
    }
    return filterValue;
  }, [filterValue, conditionFilter]);

  // 设置条件过滤（类型安全）
  const setConditionFilterSafe = useCallback((condition: ConditionFilter | null) => {
    setConditionFilter(condition);
  }, []);

  return {
    uniqueValues,
    isHighCardinality,
    totalUniqueCount,
    filterValue,
    conditionFilter,
    setFilter: setFilterValue,
    toggleMode,
    setConditionFilter: setConditionFilterSafe,
    toggleValue,
    selectAll,
    clearAll,
    invertSelection,
    hasActiveFilter,
    applyFilter,
  };
}
