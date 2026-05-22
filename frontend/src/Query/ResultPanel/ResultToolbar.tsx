/**
 * 结果面板工具栏（TanStack DataGrid）
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download,
  RefreshCw,
  Columns,
  Maximize2,
  Minimize2,
  ChevronDown,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check } from 'lucide-react';
import type { DataGridColumnInfo, ResultPanelGridStats as GridStats } from './types';

export interface ResultToolbarProps {
  stats: GridStats;
  executionTime?: number;
  selectedCells?: number;
  gridColumns?: DataGridColumnInfo[];
  onToggleColumn?: (field: string) => void;
  onShowAllColumns?: () => void;
  onResetColumns?: () => void;
  onAutoFitColumns?: () => void;
  onFitToWidth?: () => void;
  onExportCsv?: () => void;
  onExportExcel?: () => void;
  onExportJson?: () => void;
  onRefresh?: () => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onImportToDuckDB?: () => void;
  showImportButton?: boolean;
  previewLimitApplied?: number | null;
}

function formatExecutionTime(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('zh-CN').format(num);
}

export const ResultToolbar: React.FC<ResultToolbarProps> = ({
  stats,
  executionTime,
  selectedCells = 0,
  gridColumns,
  onToggleColumn,
  onShowAllColumns,
  onResetColumns,
  onAutoFitColumns,
  onFitToWidth,
  onExportCsv,
  onExportExcel,
  onExportJson,
  onRefresh,
  onToggleFullscreen,
  isFullscreen = false,
  loading = false,
  disabled = false,
  onImportToDuckDB,
  showImportButton = false,
  previewLimitApplied,
}) => {
  const { t } = useTranslation('common');
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const hiddenCount = gridColumns?.filter((c) => !c.visible).length || 0;
  const hasExport = !!(onExportCsv || onExportExcel || onExportJson);

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>
          {stats.filteredRows !== stats.totalRows ? (
            <>
              <span className="font-medium text-foreground">{formatNumber(stats.filteredRows)}</span>
              <span className="mx-1">/</span>
              <span>{formatNumber(stats.totalRows)}</span>
              <span className="ml-1">{t('query.result.rows', '行')}</span>
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">{formatNumber(stats.totalRows)}</span>
              <span className="ml-1">{t('query.result.rows', '行')}</span>
            </>
          )}
        </span>

        {previewLimitApplied != null && stats.totalRows > 0 && stats.totalRows === previewLimitApplied && (
          <span className="hidden sm:inline border-l border-border pl-3 text-xs text-muted-foreground max-w-md truncate">
            {t('query.result.previewCapHint', { max: formatNumber(previewLimitApplied) })}
          </span>
        )}

        <span>
          <span className="font-medium text-foreground">{stats.visibleColumnCount}</span>
          <span className="mx-1">/</span>
          <span>{stats.columnCount}</span>
          <span className="ml-1">{t('query.result.columns', '列')}</span>
        </span>

        {selectedCells > 0 && (
          <span>
            <span className="mr-1">{t('query.result.selected', '已选')}</span>
            <span className="font-medium text-primary">{formatNumber(selectedCells)}</span>
            <span className="ml-1">{t('dataGrid.cellUnit', '个单元格')}</span>
          </span>
        )}

        {executionTime !== undefined && (
          <span className="text-muted-foreground">{formatExecutionTime(executionTime)}</span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {gridColumns && gridColumns.length > 0 && (
          <Popover open={columnMenuOpen} onOpenChange={setColumnMenuOpen} modal>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2" disabled={disabled}>
                <Columns className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">{t('query.result.columns', '列')}</span>
                {hiddenCount > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({hiddenCount} {t('query.result.hidden', '隐藏')})
                  </span>
                )}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
              <div className="p-2 space-y-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-8 text-xs"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onShowAllColumns?.();
                  }}
                  disabled={hiddenCount === 0}
                >
                  <Eye className="h-3.5 w-3.5 mr-2" />
                  {t('query.result.showAllColumns', '显示所有列')}
                </Button>
                {onResetColumns && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start h-8 text-xs"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onResetColumns();
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-2" />
                    {t('query.result.resetColumns', '重置列')}
                  </Button>
                )}
              </div>
              <Separator />
              <div className="p-2 space-y-1">
                {onAutoFitColumns && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start h-8 text-xs"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onAutoFitColumns();
                    }}
                  >
                    <Maximize2 className="h-3.5 w-3.5 mr-2" />
                    {t('query.result.autoSizeColumns', '自动列宽')}
                  </Button>
                )}
                {onFitToWidth && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start h-8 text-xs"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onFitToWidth();
                    }}
                  >
                    {t('query.result.fitColumns', '适应宽度')}
                  </Button>
                )}
              </div>
              <Separator />
              <ScrollArea className="h-64">
                <div className="p-2 space-y-0.5">
                  {gridColumns.map((col) => (
                    <Button
                      key={col.field}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-full justify-start gap-2 px-2 text-xs font-normal"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggleColumn?.(col.field);
                      }}
                    >
                      {col.visible ? (
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate flex-1 text-left">{col.field}</span>
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
        )}

        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={onRefresh}
            disabled={disabled || loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        )}

        {showImportButton && onImportToDuckDB && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <Button
              variant="default"
              size="sm"
              className="h-8 px-3"
              onClick={onImportToDuckDB}
              disabled={disabled || stats.totalRows === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              <span>{t('query.result.importToDuckDB', '导入到 DuckDB')}</span>
            </Button>
          </>
        )}

        {hasExport && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center justify-center h-8 px-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              disabled={disabled || stats.totalRows === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">{t('query.result.export', '导出')}</span>
              <ChevronDown className="h-3 w-3 ml-1" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onExportCsv && (
                <DropdownMenuItem onClick={onExportCsv}>
                  {t('query.result.exportCSV', '导出 CSV')}
                </DropdownMenuItem>
              )}
              {onExportExcel && (
                <DropdownMenuItem onClick={onExportExcel}>
                  {t('query.result.exportExcel', '导出 Excel')}
                </DropdownMenuItem>
              )}
              {onExportJson && (
                <DropdownMenuItem onClick={onExportJson}>
                  {t('query.result.exportJSON', '导出 JSON')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {onToggleFullscreen && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={onToggleFullscreen}
            disabled={disabled}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
};

export default ResultToolbar;
