/**
 * 结果面板工具栏组件
 * 显示统计信息和操作按钮
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
  Copy,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/new/components/ui/button';
import { Separator } from '@/new/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/new/components/ui/dropdown-menu';
import type { GridStats, ColumnVisibility } from './hooks/useGridStats';

/** DataGrid 列可见性信息 */
export interface DataGridColumnInfo {
  field: string;
  visible: boolean;
}

export interface ResultToolbarProps {
  /** 统计信息 */
  stats: GridStats;
  /** 执行时间（毫秒） */
  executionTime?: number;
  /** 列可见性列表（AG Grid） */
  columns: ColumnVisibility[];
  /** 切换列可见性（AG Grid） */
  onToggleColumn: (field: string, visible: boolean) => void;
  /** 显示所有列（AG Grid） */
  onShowAllColumns: () => void;
  /** 重置列（AG Grid） */
  onResetColumns: () => void;
  /** 自动调整列宽（AG Grid） */
  onAutoSizeColumns: () => void;
  /** 适应容器宽度（AG Grid） */
  onSizeColumnsToFit: () => void;
  /** 刷新数据 */
  onRefresh?: () => void;
  /** 导出数据（AG Grid） */
  onExport?: (format: 'csv' | 'json') => void;
  /** 复制选中的行（AG Grid） */
  onCopySelected?: () => void;
  /** 全屏切换 */
  onToggleFullscreen?: () => void;
  /** 是否全屏 */
  isFullscreen?: boolean;
  /** 是否正在加载 */
  loading?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 导入到 DuckDB */
  onImportToDuckDB?: () => void;
  /** 是否显示导入按钮 */
  showImportButton?: boolean;
  /** 是否使用新的 DataGrid */
  useNewDataGrid?: boolean;
  /** DataGrid 模式：选中单元格数 */
  selectedCells?: number;
  /** 切换 DataGrid 模式 */
  onToggleDataGrid?: () => void;
  /** DataGrid 列可见性信息 */
  dataGridColumns?: DataGridColumnInfo[];
  /** DataGrid 切换列可见性 */
  onDataGridToggleColumn?: (field: string) => void;
  /** DataGrid 显示所有列 */
  onDataGridShowAllColumns?: () => void;
  /** DataGrid 导出 CSV */
  onDataGridExportCSV?: () => void;
  /** DataGrid 导出 JSON */
  onDataGridExportJSON?: () => void;
}

/**
 * 格式化执行时间
 */
function formatExecutionTime(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * 格式化数字（添加千分位）
 */
function formatNumber(num: number): string {
  return new Intl.NumberFormat('zh-CN').format(num);
}

/**
 * 结果面板工具栏
 */
export const ResultToolbar: React.FC<ResultToolbarProps> = ({
  stats,
  executionTime,
  columns,
  onToggleColumn,
  onShowAllColumns,
  onResetColumns,
  onAutoSizeColumns,
  onSizeColumnsToFit,
  onRefresh,
  onExport,
  onCopySelected,
  onToggleFullscreen,
  isFullscreen = false,
  loading = false,
  disabled = false,
  onImportToDuckDB,
  showImportButton = false,
  useNewDataGrid = false,
  selectedCells = 0,
  onToggleDataGrid,
  dataGridColumns,
  onDataGridToggleColumn,
  onDataGridShowAllColumns,
  onDataGridExportCSV,
  onDataGridExportJSON,
}) => {
  const { t } = useTranslation('common');
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);

  // 计算 DataGrid 隐藏列数量
  const dataGridHiddenCount = dataGridColumns?.filter(c => !c.visible).length || 0;

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
      {/* 左侧：统计信息 */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {/* 行数统计 */}
        <span>
          {stats.filteredRows !== stats.totalRows ? (
            <>
              <span className="font-medium text-foreground">
                {formatNumber(stats.filteredRows)}
              </span>
              <span className="mx-1">/</span>
              <span>{formatNumber(stats.totalRows)}</span>
              <span className="ml-1">{t('query.result.rows', '行')}</span>
            </>
          ) : (
            <>
              <span className="font-medium text-foreground">
                {formatNumber(stats.totalRows)}
              </span>
              <span className="ml-1">{t('query.result.rows', '行')}</span>
            </>
          )}
        </span>

        {/* 列数统计 */}
        <span>
          <span className="font-medium text-foreground">
            {stats.visibleColumnCount}
          </span>
          <span className="mx-1">/</span>
          <span>{stats.columnCount}</span>
          <span className="ml-1">{t('query.result.columns', '列')}</span>
        </span>

        {/* 选中行数（AG Grid） */}
        {!useNewDataGrid && stats.selectedRows > 0 && (
          <span>
            <span className="font-medium text-primary">
              {formatNumber(stats.selectedRows)}
            </span>
            <span className="ml-1">{t('query.result.selected', '已选')}</span>
          </span>
        )}

        {/* 选中单元格数（DataGrid） */}
        {useNewDataGrid && selectedCells > 0 && (
          <span>
            <span className="mr-1">{t('query.result.selected', '已选')}</span>
            <span className="font-medium text-primary">{formatNumber(selectedCells)}</span>
            <span className="ml-1">{t('dataGrid.cellUnit', '个单元格')}</span>
          </span>
        )}

        {/* 执行时间 */}
        {executionTime !== undefined && (
          <span className="text-muted-foreground">
            {formatExecutionTime(executionTime)}
          </span>
        )}
      </div>

      {/* 右侧：操作按钮 */}
      <div className="flex items-center gap-1">
        {/* 复制选中按钮 - 只在 AG Grid 有选中行时显示 */}
        {!useNewDataGrid && onCopySelected && stats.selectedRows > 0 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={onCopySelected}
              disabled={disabled}
            >
              <Copy className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">
                {t('result.copySelected', '复制选中')}
              </span>
            </Button>
            <Separator orientation="vertical" className="h-4" />
          </>
        )}

        {/* 列可见性控制（AG Grid 模式） */}
        {!useNewDataGrid && (
          <DropdownMenu open={columnMenuOpen} onOpenChange={setColumnMenuOpen}>
            <DropdownMenuTrigger
              className="inline-flex items-center justify-center h-8 px-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              disabled={disabled}
            >
              <Columns className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">
                {t('query.result.columns', '列')}
              </span>
              <ChevronDown className="h-3 w-3 ml-1" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 max-h-80 overflow-y-auto">
              {/* 列操作 */}
              <DropdownMenuItem onClick={onShowAllColumns}>
                <Eye className="h-4 w-4 mr-2" />
                {t('query.result.showAllColumns', '显示所有列')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onResetColumns}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('query.result.resetColumns', '重置列')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onAutoSizeColumns}>
                {t('query.result.autoSizeColumns', '自动列宽')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSizeColumnsToFit}>
                {t('query.result.fitColumns', '适应宽度')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />

              {/* 列列表 */}
              {columns.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.field}
                  checked={col.visible}
                  onCheckedChange={(checked) => onToggleColumn(col.field, checked)}
                >
                  {col.headerName}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* 列可见性控制（DataGrid 模式） */}
        {useNewDataGrid && dataGridColumns && dataGridColumns.length > 0 && (
          <DropdownMenu open={columnMenuOpen} onOpenChange={setColumnMenuOpen}>
            <DropdownMenuTrigger
              className="inline-flex items-center justify-center h-8 px-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              disabled={disabled}
            >
              <Columns className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">
                {t('query.result.columns', '列')}
              </span>
              {dataGridHiddenCount > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({dataGridHiddenCount} {t('query.result.hidden', '隐藏')})
                </span>
              )}
              <ChevronDown className="h-3 w-3 ml-1" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 max-h-80 overflow-y-auto">
              {/* 列操作 */}
              <DropdownMenuItem onClick={onDataGridShowAllColumns}>
                <Eye className="h-4 w-4 mr-2" />
                {t('query.result.showAllColumns', '显示所有列')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />

              {/* 列列表 */}
              {dataGridColumns.map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.field}
                  checked={col.visible}
                  onCheckedChange={() => onDataGridToggleColumn?.(col.field)}
                >
                  <span className="flex items-center gap-2">
                    {!col.visible && <EyeOff className="h-3 w-3 text-muted-foreground" />}
                    {col.field}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* 刷新按钮 */}
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

        {/* 导入到 DuckDB 按钮 - 仅当数据来自外部数据库时显示 */}
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

        {/* 导出按钮（AG Grid 模式） */}
        {!useNewDataGrid && onExport && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center justify-center h-8 px-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              disabled={disabled || stats.totalRows === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">
                {t('query.result.export', '导出')}
              </span>
              <ChevronDown className="h-3 w-3 ml-1" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExport('csv')}>
                {t('query.result.exportCSV', '导出 CSV')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('json')}>
                {t('query.result.exportJSON', '导出 JSON')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* 导出按钮（DataGrid 模式） */}
        {useNewDataGrid && (onDataGridExportCSV || onDataGridExportJSON) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center justify-center h-8 px-2 rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              disabled={disabled || stats.totalRows === 0}
            >
              <Download className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">
                {t('query.result.export', '导出')}
              </span>
              <ChevronDown className="h-3 w-3 ml-1" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onDataGridExportCSV && (
                <DropdownMenuItem onClick={onDataGridExportCSV}>
                  {t('query.result.exportCSV', '导出 CSV')}
                </DropdownMenuItem>
              )}
              {onDataGridExportJSON && (
                <DropdownMenuItem onClick={onDataGridExportJSON}>
                  {t('query.result.exportJSON', '导出 JSON')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* 全屏按钮 */}
        {onToggleFullscreen && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={onToggleFullscreen}
            disabled={disabled}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* DataGrid 切换按钮（实验性功能） */}
        {onToggleDataGrid && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <Button
              variant={useNewDataGrid ? 'default' : 'outline'}
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={onToggleDataGrid}
              title={useNewDataGrid ? 'Switch to AG Grid' : 'Switch to TanStack DataGrid (Beta)'}
            >
              {useNewDataGrid ? 'DataGrid' : 'AG Grid'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default ResultToolbar;
