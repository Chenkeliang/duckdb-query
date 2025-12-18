/**
 * GridFooter - 底部统计信息组件
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { GridStats } from '../types';

export interface GridFooterProps {
  /** 统计信息 */
  stats: GridStats;
  /** 自定义类名 */
  className?: string;
}

export const GridFooter: React.FC<GridFooterProps> = ({
  stats,
  className,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'flex items-center justify-between px-3 py-1.5',
        'border-t border-border bg-muted/30 text-xs text-muted-foreground',
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
