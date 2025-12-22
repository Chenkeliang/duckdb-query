/**
 * GridFooter - 底部统计信息组件
 * 
 * 显示行数、选区信息、活跃筛选条件
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GridStats, ColumnFilterValue, ConditionFilter } from '../types';
import { getSelectedValuesSize } from '../types';
import type { ColumnFiltersState } from '@tanstack/react-table';

export interface GridFooterProps {
  /** 统计信息 */
  stats: GridStats;
  /** 列筛选状态 */
  columnFilters?: ColumnFiltersState;
  /** 清除单个筛选 */
  onClearFilter?: (columnId: string) => void;
  /** 清除所有筛选 */
  onClearAllFilters?: () => void;
  /** 自定义类名 */
  className?: string;
}

export const GridFooter: React.FC<GridFooterProps> = ({
  stats,
  columnFilters = [],
  onClearFilter,
  onClearAllFilters,
  className,
}) => {
  const { t } = useTranslation();

  // 格式化筛选值显示
  const formatFilterValue = (value: unknown): string => {
    if (!value) return '';

    // ConditionFilter: { type, value }
    if (typeof value === 'object' && 'type' in value && 'value' in value) {
      const cf = value as ConditionFilter;
      const typeLabels: Record<string, string> = {
        contains: '包含',
        equals: '等于',
        startsWith: '开头',
        endsWith: '结尾',
      };
      return `${typeLabels[cf.type] || cf.type}: ${cf.value}`;
    }

    // ColumnFilterValue: { selectedValues, mode }
    if (typeof value === 'object' && 'selectedValues' in value) {
      const vf = value as ColumnFilterValue;
      const count = getSelectedValuesSize(vf.selectedValues);
      const modeLabel = vf.mode === 'exclude' ? '排除' : '';

      if (count === 0) return '';
      if (count === 1) {
        // 单个值直接显示
        const values = vf.selectedValues instanceof Set
          ? Array.from(vf.selectedValues)
          : vf.selectedValues;
        return `${modeLabel}${values[0]}`;
      }
      // 多个值显示数量
      return `${modeLabel}[${count}个值]`;
    }

    return String(value);
  };

  const hasFilters = columnFilters.length > 0;

  return (
    <div
      className={cn(
        'dq-data-grid-footer',
        className
      )}
    >
      {/* 左侧：行数信息 */}
      <div className="flex items-center gap-3">
        <span>
          {stats.filteredRows !== stats.totalRows
            ? t('dataGrid.filteredRows', { count: stats.filteredRows })
            : t('dataGrid.totalRows', { count: stats.totalRows })}
        </span>
        {stats.filteredRows !== stats.totalRows && (
          <span className="text-muted-foreground/60">
            / {t('dataGrid.totalRows', { count: stats.totalRows })}
          </span>
        )}
      </div>

      {/* 中间：筛选条件标签 */}
      {hasFilters && (
        <div className="flex items-center gap-1.5 flex-1 justify-center overflow-hidden">
          <span className="text-muted-foreground text-xs shrink-0">筛选:</span>
          <div className="flex items-center gap-1 overflow-x-auto max-w-[50%]">
            {columnFilters.map((filter) => {
              const displayValue = formatFilterValue(filter.value);
              if (!displayValue) return null;

              return (
                <button
                  key={filter.id}
                  onClick={() => onClearFilter?.(filter.id)}
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
                    'bg-primary/10 text-primary hover:bg-primary/20',
                    'transition-colors cursor-pointer shrink-0'
                  )}
                  title={`清除 ${filter.id} 筛选`}
                >
                  <span className="font-medium">{filter.id}:</span>
                  <span className="truncate max-w-[100px]">{displayValue}</span>
                  <X className="h-3 w-3 opacity-60 hover:opacity-100" />
                </button>
              );
            })}
          </div>
          {columnFilters.length > 0 && (
            <button
              onClick={onClearAllFilters}
              className={cn(
                'text-xs text-muted-foreground hover:text-foreground',
                'transition-colors cursor-pointer shrink-0 ml-1'
              )}
            >
              清除全部
            </button>
          )}
        </div>
      )}

      {/* 右侧：选区信息 */}
      <div className="flex items-center gap-3">
        {stats.selectedCells > 0 && (
          <>
            <span>{t('dataGrid.selectedCells', { count: stats.selectedCells })}</span>
            {stats.sum !== undefined && (
              <span>
                {t('dataGrid.sum')}: {formatNumber(stats.sum)}
              </span>
            )}
            {stats.average !== undefined && (
              <span>
                {t('dataGrid.average')}: {formatNumber(stats.average)}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// 格式化数字显示
function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export { GridFooter as default };
