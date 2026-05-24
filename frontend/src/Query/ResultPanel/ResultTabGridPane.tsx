import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Database, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cleanErrorMessage } from '@/utils/toastHelpers';
import { DataGridWrapper } from './DataGridWrapper';
import type { DataGridApi } from './DataGridWrapper';
import type { DataGridColumnInfo } from './types';
import { useDataGridColumns } from './hooks/useDataGridColumns';
import type { ResultTabEntry } from './resultTabUtils';

export interface ResultTabGridPaneProps {
  tab: ResultTabEntry;
  isActive: boolean;
  registerGridApi: (tabId: string, api: DataGridApi | null) => void;
  onStatsChange?: (stats: {
    totalRows: number;
    filteredRows: number;
    selectedCells: number;
    columnCount: number;
    visibleColumnCount: number;
  }) => void;
  onColumnVisibilityChange?: (columns: DataGridColumnInfo[]) => void;
  emptyMessage?: string;
}

/**
 * 单个结果 Tab 的表格（保活：隐藏时不卸载，保留滚动与筛选状态）
 */
export const ResultTabGridPane: React.FC<ResultTabGridPaneProps> = ({
  tab,
  isActive,
  registerGridApi,
  onStatsChange,
  onColumnVisibilityChange,
  emptyMessage,
}) => {
  const { t } = useTranslation('common');
  const { result } = tab;
  const { data, columns, loading, error } = result;
  const gridRef = useRef<DataGridApi>(null);
  const scrollTopRef = useRef(0);

  const { columns: gridColumnDefs } = useDataGridColumns({
    data,
    fieldOrder: columns,
    sampleSize: 100,
    enableFilters: true,
    enableSorting: true,
  });

  const handleStatsChange = useCallback(
    (stats: Parameters<NonNullable<ResultTabGridPaneProps['onStatsChange']>>[0]) => {
      if (isActive) {
        onStatsChange?.(stats);
      }
    },
    [isActive, onStatsChange]
  );

  const handleColumnVisibilityChange = useCallback(
    (cols: DataGridColumnInfo[]) => {
      if (isActive) {
        onColumnVisibilityChange?.(cols);
      }
    },
    [isActive, onColumnVisibilityChange]
  );

  useEffect(() => {
    if (isActive && gridRef.current) {
      registerGridApi(tab.id, gridRef.current);
      return () => registerGridApi(tab.id, null);
    }
    return undefined;
  }, [isActive, registerGridApi, tab.id]);

  useEffect(() => {
    if (loading && gridRef.current) {
      scrollTopRef.current = gridRef.current.getScrollTop();
    }
  }, [loading]);

  useEffect(() => {
    if (!loading && scrollTopRef.current > 0 && gridRef.current) {
      const top = scrollTopRef.current;
      requestAnimationFrame(() => {
        gridRef.current?.setScrollTop(top);
      });
    }
  }, [loading, data]);

  if (error) {
    return (
      <div
        className={cn('absolute inset-0 flex items-center justify-center bg-background', !isActive && 'hidden')}
        aria-hidden={!isActive}
      >
        <div className="flex flex-col items-center gap-3 text-destructive max-w-md text-center px-4">
          <AlertCircle className="h-10 w-10" />
          <span className="font-medium">{t('query.result.error', '查询失败')}</span>
          <span className="text-sm text-muted-foreground">{cleanErrorMessage(error.message)}</span>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className={cn('absolute inset-0 flex items-center justify-center bg-background', !isActive && 'hidden')}
        aria-hidden={!isActive}
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Database className="h-10 w-10" />
          <span>{emptyMessage || t('query.result.noData', '暂无数据')}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('absolute inset-0', !isActive && 'hidden')}
      aria-hidden={!isActive}
      data-result-tab-pane={tab.id}
    >
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-sm">{t('query.result.refreshing', '刷新中...')}</span>
          </div>
        </div>
      )}
      <DataGridWrapper
        ref={gridRef}
        rowData={data}
        columns={gridColumnDefs}
        loading={false}
        noRowsOverlayText={t('query.result.noData', '暂无数据')}
        enableSelection
        enableFiltering
        enableSorting
        onStatsChange={handleStatsChange}
        onColumnVisibilityChange={handleColumnVisibilityChange}
      />
    </div>
  );
};
