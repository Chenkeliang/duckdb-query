/**
 * DataGrid 主组件
 * 
 * 基于 TanStack Table + @tanstack/react-virtual 的数据网格
 * 
 * 功能：
 * - 飞书式单元格选区（单矩形模型）
 * - TSV/CSV/JSON 复制
 * - Excel 风格列筛选
 * - 行列双向虚拟滚动
 */

import * as React from 'react';
import { useRef, useCallback, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnFiltersState, SortingState, ColumnFilter } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';

import {
  useDataGrid,
  useCellSelection,
  useVirtualScroll,
  useGridCopy,
  useGridStats,
  useKeyboardNavigation,
  useAutoScroll,
} from './hooks';
import {
  GridHeader,
  GridBody,
  GridFooter,
  DataGridContextMenu,
  ColumnMenu,
} from './components';
import type { CellSelection, CellPosition, ColumnDef, CopyFormat, SelectionRange } from './types';
import { DATAGRID_CONFIG, getGridCellStyle, smartSampleColumn } from './types';

export interface DataGridProps {
  /** 行数据 */
  data: Record<string, unknown>[];
  /** 列定义（可选，自动推断） */
  columns?: ColumnDef[];
  /** 是否加载中 */
  loading?: boolean;
  /** 空状态文本 */
  emptyText?: string;
  /** 行高 */
  rowHeight?: number;
  /** 容器高度 */
  height?: number | string;
  /** 是否启用选区 */
  enableSelection?: boolean;
  /** 是否启用筛选 */
  enableFiltering?: boolean;
  /** 是否启用排序 */
  enableSorting?: boolean;
  /** 选区变化回调 */
  onSelectionChange?: (selection: CellSelection | null) => void;
  /** 筛选变化回调 */
  onFilterChange?: (filters: ColumnFiltersState) => void;
  /** 排序变化回调 */
  onSortChange?: (sorting: SortingState) => void;
  /** 统计信息变化回调（用于外部工具栏） */
  onStatsChange?: (stats: {
    totalRows: number;
    filteredRows: number;
    selectedCells: number;
    columnCount: number;
    visibleColumnCount: number;
  }) => void;
  /** 是否隐藏底部列管理菜单（当工具栏已有列管理时） */
  hideColumnMenu?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * DataGrid ref 接口
 */
export interface DataGridRef {
  /** 自动调整所有列宽 */
  autoFitAllColumns: () => void;
  /** 适应容器宽度 */
  fitToWidth: () => void;
  /** 重置列 */
  resetColumns: () => void;
  /** 显示所有列 */
  showAllColumns: () => void;
  /** 切换列可见性 */
  toggleColumnVisibility: (field: string) => void;
}

/**
 * DataGrid 组件
 */
const DataGridInner: React.ForwardRefRenderFunction<DataGridRef, DataGridProps> = ({
  data,
  columns: propColumns,
  loading = false,
  emptyText,
  rowHeight = 32,
  height = 400,
  enableSelection = true,
  enableFiltering = true,
  enableSorting = true,
  onSelectionChange,
  onFilterChange,
  onSortChange,
  onStatsChange,
  hideColumnMenu = false,
  className,
}, ref) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = React.useState(0);

  // 数据管理
  const {
    sorting,
    setSorting,
    columnFilters,
    setColumnFilters,
    columnSizing,
    setColumnSizing,
    allColumns,
    visibleColumns,
    hiddenColumns,
    filteredData,
    filteredRowCount,
    toggleColumnVisibility,
    showAllColumns,
    resetColumns,
  } = useDataGrid({
    data,
    columns: propColumns,
  });

  // 列宽数组
  const columnWidths = useMemo((): number[] => {
    return visibleColumns.map((field: string) => {
      const size = columnSizing[field];
      return size || 120; // 默认宽度
    });
  }, [visibleColumns, columnSizing]);

  // 总宽度
  const totalWidth = useMemo((): number => {
    return columnWidths.reduce((sum: number, w: number) => sum + w, 0);
  }, [columnWidths]);

  // 虚拟滚动
  const {
    rowVirtualizer,
    columnVirtualizer,
    virtualRows,
    virtualColumns,
    totalHeight,
  } = useVirtualScroll({
    rowCount: filteredRowCount,
    columnCount: visibleColumns.length,
    rowHeight,
    columnWidths,
    scrollContainerRef,
  });

  // 选区管理
  const {
    selection,
    isSelecting,
    startSelection,
    extendSelection,
    endSelection,
    clearSelection,
    selectAll,
    isCellSelected,
    getSelectionRange,
  } = useCellSelection({
    rowCount: filteredRowCount,
    colCount: visibleColumns.length,
    onSelectionChange,
  });

  // 复制功能
  const { copySelection, copyColumnName } = useGridCopy({
    data: filteredData,
    columns: visibleColumns,
    selection,
  });

  // 统计信息
  const { stats } = useGridStats({
    totalRows: data.length,
    filteredRows: filteredRowCount,
    selection,
    data: filteredData,
    columns: visibleColumns,
  });

  // 适配 useCellSelection 的函数签名到 useKeyboardNavigation 需要的签名
  const startSelectionPos = useCallback((pos: CellPosition) => {
    startSelection(pos.rowIndex, pos.colIndex);
  }, [startSelection]);

  const extendSelectionPos = useCallback((pos: CellPosition) => {
    extendSelection(pos.rowIndex, pos.colIndex);
  }, [extendSelection]);

  // 键盘导航
  const { handleKeyDown } = useKeyboardNavigation({
    enabled: enableSelection,
    selection,
    rowCount: filteredRowCount,
    colCount: visibleColumns.length,
    startSelection: startSelectionPos,
    extendSelection: extendSelectionPos,
    clearSelection,
    selectAll,
    onCopy: () => copySelection('tsv'),
    scrollToRow: (rowIndex: number) => {
      rowVirtualizer.scrollToIndex(rowIndex);
    },
    scrollToColumn: (colIndex: number) => {
      if (columnVirtualizer) {
        columnVirtualizer.scrollToIndex(colIndex);
      }
    },
  });

  // 自动滚动（拖拽到边缘时）
  const { handleMouseMove: handleAutoScrollMouseMove, stopAutoScroll } = useAutoScroll({
    containerRef: scrollContainerRef,
    enabled: isSelecting,
  });

  // 滚动同步
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollLeft(target.scrollLeft);
  }, []);

  // 排序状态转换
  const sortingState = useMemo((): Record<string, 'asc' | 'desc'> => {
    const state: Record<string, 'asc' | 'desc'> = {};
    sorting.forEach((s: { id: string; desc: boolean }) => {
      state[s.id] = s.desc ? 'desc' : 'asc';
    });
    return state;
  }, [sorting]);

  // 筛选状态转换
  const filterState = useMemo((): Record<string, unknown> => {
    const state: Record<string, unknown> = {};
    columnFilters.forEach((f: ColumnFilter) => {
      state[f.id] = f.value;
    });
    return state;
  }, [columnFilters]);

  // 列定义（用于 GridHeader）
  const columnDefs = useMemo<ColumnDef[]>(() => {
    return visibleColumns.map((field: string) => ({
      field,
      headerName: field,
      sortable: enableSorting,
      filterable: enableFiltering,
      resizable: true,
    }));
  }, [visibleColumns, enableSorting, enableFiltering]);

  // 排序点击
  const handleSortClick = useCallback((field: string, multi: boolean) => {
    if (!enableSorting) return;

    setSorting((prev: SortingState) => {
      const idx = prev.findIndex((s: { id: string; desc: boolean }) => s.id === field);
      const next = multi ? [...prev] : [];

      if (idx === -1) {
        next.push({ id: field, desc: false });
        return next;
      }

      const existing = prev[idx];
      if (!existing.desc) {
        next[idx] = { id: field, desc: true };
        return next;
      }

      next.splice(idx, 1);
      return next;
    });
  }, [enableSorting, setSorting]);

  // 筛选变化
  const handleFilterChange = useCallback((field: string, filter: unknown) => {
    if (!enableFiltering) return;

    setColumnFilters((prev: ColumnFiltersState) => {
      if (filter === null || filter === undefined) {
        return prev.filter((f: ColumnFilter) => f.id !== field);
      }
      const existing = prev.findIndex((f: ColumnFilter) => f.id === field);
      if (existing >= 0) {
        const newFilters = [...prev];
        newFilters[existing] = { id: field, value: filter };
        return newFilters;
      }
      return [...prev, { id: field, value: filter }];
    });
  }, [enableFiltering, setColumnFilters]);

  // 清除筛选
  const handleClearFilter = useCallback((field: string) => {
    setColumnFilters((prev: ColumnFiltersState) => prev.filter((f: ColumnFilter) => f.id !== field));
  }, [setColumnFilters]);

  // 清除所有筛选
  const handleClearAllFilters = useCallback(() => {
    setColumnFilters([]);
  }, [setColumnFilters]);

  // 列宽调整
  const handleResizeStart = useCallback((field: string, startX: number) => {
    const startWidth = columnSizing[field] || 120;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      const newWidth = Math.max(50, startWidth + delta);
      setColumnSizing((prev: Record<string, number>) => ({ ...prev, [field]: newWidth }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [columnSizing, setColumnSizing]);

  // 自动调整列宽（双击列边框）- 使用 DOM 样式测量 + 智能采样
  const handleAutoFitColumn = useCallback((field: string) => {
    // 从 DOM 获取实际样式（字体、padding）
    const { font, paddingX } = getGridCellStyle(containerRef.current);
    const { headerIconWidth } = DATAGRID_CONFIG.autoSize;
    const { minColumnWidth, maxColumnWidth } = DATAGRID_CONFIG;

    // 创建 Canvas 用于文本测量
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // 降级到简单估算
      const estimatedWidth = field.length * 10 + paddingX + headerIconWidth;
      setColumnSizing((prev: Record<string, number>) => ({
        ...prev,
        [field]: Math.min(maxColumnWidth, Math.max(minColumnWidth, estimatedWidth))
      }));
      return;
    }

    // 使用从 DOM 读取的真实字体
    ctx.font = font;

    // 计算列头宽度（文本 + padding + 图标）
    const headerWidth = ctx.measureText(field).width + paddingX + headerIconWidth;

    // 使用智能采样获取数据样本
    const samples = smartSampleColumn(filteredData, field);

    // 测量所有样本，找到最大宽度
    let maxContentWidth = headerWidth;
    for (const strValue of samples) {
      const contentWidth = ctx.measureText(strValue).width + paddingX;
      maxContentWidth = Math.max(maxContentWidth, contentWidth);
    }

    // 限制宽度范围
    const newWidth = Math.min(maxColumnWidth, Math.max(minColumnWidth, Math.ceil(maxContentWidth)));
    setColumnSizing((prev: Record<string, number>) => ({ ...prev, [field]: newWidth }));
  }, [filteredData, setColumnSizing]);

  // 自动调整所有列宽
  const handleAutoFitAllColumns = useCallback(() => {
    // 从 DOM 获取实际样式
    const { font, paddingX } = getGridCellStyle(containerRef.current);
    const { headerIconWidth } = DATAGRID_CONFIG.autoSize;
    const { minColumnWidth, maxColumnWidth } = DATAGRID_CONFIG;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.font = font;
    const newSizing: Record<string, number> = {};

    for (const field of visibleColumns) {
      // 列头宽度
      const headerWidth = ctx.measureText(field).width + paddingX + headerIconWidth;

      // 智能采样
      const samples = smartSampleColumn(filteredData, field);

      // 测量样本
      let maxContentWidth = headerWidth;
      for (const strValue of samples) {
        const contentWidth = ctx.measureText(strValue).width + paddingX;
        maxContentWidth = Math.max(maxContentWidth, contentWidth);
      }

      newSizing[field] = Math.min(maxColumnWidth, Math.max(minColumnWidth, Math.ceil(maxContentWidth)));
    }

    setColumnSizing(newSizing);
  }, [filteredData, visibleColumns, setColumnSizing]);

  // 适应宽度（平均分配容器宽度）
  const handleFitToWidth = useCallback(() => {
    if (!containerRef.current || visibleColumns.length === 0) return;

    const containerWidth = containerRef.current.clientWidth - 2; // 减去边框
    const columnWidth = Math.max(80, Math.floor(containerWidth / visibleColumns.length));

    const newSizing: Record<string, number> = {};
    for (const field of visibleColumns) {
      newSizing[field] = columnWidth;
    }

    setColumnSizing(newSizing);
  }, [visibleColumns, setColumnSizing]);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    autoFitAllColumns: handleAutoFitAllColumns,
    fitToWidth: handleFitToWidth,
    resetColumns,
    showAllColumns,
    toggleColumnVisibility,
  }), [handleAutoFitAllColumns, handleFitToWidth, resetColumns, showAllColumns, toggleColumnVisibility]);

  // 复制列名
  const handleCopyColumnName = useCallback((field: string) => {
    copyColumnName(field);
  }, [copyColumnName]);

  // 单元格鼠标按下（用于拖拽选区）
  const handleCellMouseDown = useCallback((rowIndex: number, colIndex: number, e: React.MouseEvent) => {
    if (!enableSelection) return;

    if (e.button !== 0) return;
    e.preventDefault();

    // 确保容器获得焦点，以便键盘事件（如 Ctrl+C）能被捕获
    containerRef.current?.focus();

    if (e.shiftKey && selection) {
      extendSelection(rowIndex, colIndex);
      return;
    }

    startSelection(rowIndex, colIndex);
  }, [enableSelection, selection, startSelection, extendSelection]);

  // 单元格鼠标进入（拖拽选区）
  const handleCellMouseEnter = useCallback((rowIndex: number, colIndex: number) => {
    // 使用 isSelecting 状态判断是否在拖拽
    if (isSelecting) {
      extendSelection(rowIndex, colIndex);
    }
  }, [isSelecting, extendSelection]);

  // 鼠标移动（用于自动滚动）
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isSelecting) {
      handleAutoScrollMouseMove(e.clientX, e.clientY);
    }
  }, [isSelecting, handleAutoScrollMouseMove]);

  // 鼠标按下 - 不再修改全局 cursor
  const handleMouseDown = useCallback((_e: React.MouseEvent) => {
    // 选区开始由 handleCellClick 处理
  }, []);

  // 鼠标释放
  const handleMouseUp = useCallback(() => {
    stopAutoScroll();
    endSelection();
  }, [endSelection, stopAutoScroll]);

  // 右键菜单复制
  const handleContextCopy = useCallback((format: CopyFormat) => {
    copySelection(format);
  }, [copySelection]);

  // 右键菜单筛选此值
  const handleFilterThisValue = useCallback(() => {
    if (!selection) return;
    const range = getSelectionRange();
    if (!range || range.minCol !== range.maxCol) return;

    const field = visibleColumns[range.minCol];
    const value = filteredData[range.minRow]?.[field];
    const normalized = value === null || value === undefined ? '(空)' : String(value);
    handleFilterChange(field, { selectedValues: new Set([normalized]), mode: 'include' });
  }, [selection, getSelectionRange, visibleColumns, filteredData, handleFilterChange]);

  // 右键菜单排除此值
  const handleExcludeThisValue = useCallback(() => {
    if (!selection) return;
    const range = getSelectionRange();
    if (!range || range.minCol !== range.maxCol) return;

    const field = visibleColumns[range.minCol];
    const value = filteredData[range.minRow]?.[field];
    const normalized = value === null || value === undefined ? '(空)' : String(value);
    handleFilterChange(field, { selectedValues: new Set([normalized]), mode: 'exclude' });
  }, [selection, getSelectionRange, visibleColumns, filteredData, handleFilterChange]);

  // 选区范围
  const selectionRange = useMemo<SelectionRange | null>(() => {
    return getSelectionRange();
  }, [getSelectionRange]);

  // 焦点位置
  const focusPosition = useMemo(() => {
    return selection?.focus || null;
  }, [selection]);

  // 使用 refs 存储回调函数，避免依赖数组变化导致无限循环
  const onFilterChangeRef = useRef(onFilterChange);
  const onSortChangeRef = useRef(onSortChange);
  const onStatsChangeRef = useRef(onStatsChange);

  // 更新 refs
  useEffect(() => {
    onFilterChangeRef.current = onFilterChange;
  }, [onFilterChange]);

  useEffect(() => {
    onSortChangeRef.current = onSortChange;
  }, [onSortChange]);

  useEffect(() => {
    onStatsChangeRef.current = onStatsChange;
  }, [onStatsChange]);

  // 存储上一次的值，用于比较
  const prevFilterRef = useRef<ColumnFiltersState>([]);
  const prevSortRef = useRef<SortingState>([]);
  const prevStatsRef = useRef<{
    totalRows: number;
    filteredRows: number;
    selectedCells: number;
    columnCount: number;
    visibleColumnCount: number;
  } | null>(null);

  // 回调通知 - 使用 refs 避免无限循环
  useEffect(() => {
    // 比较筛选状态是否变化
    const filtersChanged = JSON.stringify(columnFilters) !== JSON.stringify(prevFilterRef.current);
    if (filtersChanged) {
      prevFilterRef.current = columnFilters;
      onFilterChangeRef.current?.(columnFilters);
    }
  }, [columnFilters]);

  useEffect(() => {
    // 比较排序状态是否变化
    const sortingChanged = JSON.stringify(sorting) !== JSON.stringify(prevSortRef.current);
    if (sortingChanged) {
      prevSortRef.current = sorting;
      onSortChangeRef.current?.(sorting);
    }
  }, [sorting]);

  useEffect(() => {
    // 构建新的统计对象
    const newStats = {
      totalRows: stats.totalRows,
      filteredRows: stats.filteredRows,
      selectedCells: stats.selectedCells,
      columnCount: visibleColumns.length,
      visibleColumnCount: visibleColumns.length,
    };

    // 比较统计信息是否变化
    const prev = prevStatsRef.current;
    const statsChanged = !prev ||
      prev.totalRows !== newStats.totalRows ||
      prev.filteredRows !== newStats.filteredRows ||
      prev.selectedCells !== newStats.selectedCells ||
      prev.columnCount !== newStats.columnCount ||
      prev.visibleColumnCount !== newStats.visibleColumnCount;

    if (statsChanged) {
      prevStatsRef.current = newStats;
      onStatsChangeRef.current?.(newStats);
    }
  }, [stats.totalRows, stats.filteredRows, stats.selectedCells, visibleColumns.length]);

  // 加载状态
  if (loading) {
    return (
      <div
        className={cn(
          'flex items-center justify-center border border-border rounded-md bg-background',
          className
        )}
        style={{ height }}
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">{t('dataGrid.loading')}</span>
      </div>
    );
  }

  // 空状态
  if (data.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center border border-border rounded-md bg-background',
          className
        )}
        style={{ height }}
      >
        <span className="text-muted-foreground">{emptyText || t('dataGrid.noData')}</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <DataGridContextMenu
        cellValue={selection ? filteredData[selection.focus.rowIndex]?.[visibleColumns[selection.focus.colIndex]] : undefined}
        columnName={selection ? visibleColumns[selection.focus.colIndex] : undefined}
        onCopy={handleContextCopy}
        onCopyColumnName={() => selection && handleCopyColumnName(visibleColumns[selection.focus.colIndex])}
        onFilterThisValue={handleFilterThisValue}
        onExcludeThisValue={handleExcludeThisValue}
        onClearFilter={() => selection && handleClearFilter(visibleColumns[selection.focus.colIndex])}
        hasActiveFilter={selection ? !!filterState[visibleColumns[selection.focus.colIndex]] : false}
      >
        <div
          ref={containerRef}
          className={cn(
            'dq-data-grid flex flex-col overflow-hidden',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            className
          )}
          style={{ height }}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* 列头 */}
          <GridHeader
            columns={columnDefs}
            columnWidths={columnWidths}
            sortingState={sortingState}
            filterState={filterState}
            data={filteredData}
            scrollLeft={scrollLeft}
            onSortClick={handleSortClick}
            onCopyColumnName={handleCopyColumnName}
            onFilterChange={handleFilterChange}
            onClearFilter={handleClearFilter}
            onResizeStart={handleResizeStart}
            onAutoFitColumn={handleAutoFitColumn}
            containerRef={headerRef}
            className="dq-data-grid-header"
          />

          {/* 表格主体 */}
          <GridBody
            data={filteredData}
            columns={visibleColumns}
            columnWidths={columnWidths}
            rowHeight={rowHeight}
            virtualRows={virtualRows}
            virtualColumns={virtualColumns}
            totalHeight={totalHeight}
            totalWidth={totalWidth}
            selectionRange={selectionRange}
            focusPosition={focusPosition}
            isCellSelected={isCellSelected}
            onCellMouseDown={handleCellMouseDown}
            onCellMouseEnter={handleCellMouseEnter}
            scrollContainerRef={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1"
          />

          {/* 底部统计和列管理 */}
          <div className="flex items-center justify-between bg-[var(--dg-header-background)] border-t border-[var(--dg-border-color)] min-h-[28px] px-3">
            <GridFooter
              stats={stats}
              columnFilters={columnFilters}
              onClearFilter={handleClearFilter}
              onClearAllFilters={handleClearAllFilters}
              className="flex-1 border-t-0 min-h-0 px-0"
            />
            {!hideColumnMenu && (
              <ColumnMenu
                allColumns={allColumns}
                visibleColumns={visibleColumns}
                hiddenCount={hiddenColumns.size}
                onToggleColumn={toggleColumnVisibility}
                onShowAllColumns={showAllColumns}
                onResetColumns={resetColumns}
                onAutoFitAllColumns={handleAutoFitAllColumns}
                onFitToWidth={handleFitToWidth}
              />
            )}
          </div>
        </div>
      </DataGridContextMenu>
    </TooltipProvider>
  );
};

export const DataGrid = forwardRef(DataGridInner);

export { DataGrid as default };
