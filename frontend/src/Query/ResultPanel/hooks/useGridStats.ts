/**
 * AG-Grid 统计信息 Hook
 * 监听 Grid 事件，提供实时统计信息
 */

import { useState, useEffect, useCallback } from 'react';
import type { GridApi, Column } from 'ag-grid-community';

export interface GridStats {
  /** 总行数 */
  totalRows: number;
  /** 过滤后行数 */
  filteredRows: number;
  /** 选中行数 */
  selectedRows: number;
  /** 列数 */
  columnCount: number;
  /** 可见列数 */
  visibleColumnCount: number;
}

export interface ColumnVisibility {
  field: string;
  headerName: string;
  visible: boolean;
}

export interface UseGridStatsOptions {
  gridApi: GridApi | null;
}

export interface UseGridStatsReturn {
  /** 统计信息 */
  stats: GridStats;
  /** 列可见性列表 */
  columns: ColumnVisibility[];
  /** 切换列可见性 */
  toggleColumn: (field: string, visible: boolean) => void;
  /** 显示所有列 */
  showAllColumns: () => void;
  /** 隐藏所有列 */
  hideAllColumns: () => void;
  /** 重置列可见性 */
  resetColumns: () => void;
  /** 自动调整列宽 */
  autoSizeColumns: () => void;
  /** 适应容器宽度 */
  sizeColumnsToFit: () => void;
}

/**
 * AG-Grid 统计信息 Hook
 * 注意：AG-Grid v31+ 已将 ColumnApi 功能合并到 GridApi 中
 */
export const useGridStats = ({
  gridApi,
}: UseGridStatsOptions): UseGridStatsReturn => {
  const [stats, setStats] = useState<GridStats>({
    totalRows: 0,
    filteredRows: 0,
    selectedRows: 0,
    columnCount: 0,
    visibleColumnCount: 0,
  });

  const [columns, setColumns] = useState<ColumnVisibility[]>([]);

  // 更新统计信息 - 使用函数式更新 + 浅比较，避免无意义的 setState 导致无限循环
  const updateStats = useCallback(() => {
    if (!gridApi) return;

    const allColumns = gridApi.getColumns() || [];
    const visibleColumns = allColumns.filter((col: Column) => col.isVisible());

    // 计算总行数（通过遍历所有节点）
    let totalRows = 0;
    gridApi.forEachNode(() => {
      totalRows++;
    });

    const newStats: GridStats = {
      totalRows,
      filteredRows: gridApi.getDisplayedRowCount(),
      selectedRows: gridApi.getSelectedRows().length,
      columnCount: allColumns.length,
      visibleColumnCount: visibleColumns.length,
    };

    // 浅比较：只有值真正变化时才更新，避免无限循环
    setStats((prev) => {
      if (
        prev.totalRows === newStats.totalRows &&
        prev.filteredRows === newStats.filteredRows &&
        prev.selectedRows === newStats.selectedRows &&
        prev.columnCount === newStats.columnCount &&
        prev.visibleColumnCount === newStats.visibleColumnCount
      ) {
        return prev; // 值没变，返回原引用，不触发重渲染
      }
      return newStats;
    });
  }, [gridApi]);

  // 更新列可见性列表 - 使用浅比较避免无意义更新
  const updateColumns = useCallback(() => {
    if (!gridApi) return;

    const allColumns = gridApi.getColumns() || [];
    const newColumnList: ColumnVisibility[] = allColumns.map((col: Column) => ({
      field: col.getColId(),
      headerName: col.getColDef().headerName || col.getColId(),
      visible: col.isVisible(),
    }));

    // 浅比较：只有列信息真正变化时才更新
    setColumns((prev) => {
      if (prev.length !== newColumnList.length) {
        return newColumnList;
      }
      // 检查每列是否有变化
      const hasChanged = newColumnList.some((col, index) => 
        col.field !== prev[index]?.field ||
        col.headerName !== prev[index]?.headerName ||
        col.visible !== prev[index]?.visible
      );
      return hasChanged ? newColumnList : prev;
    });
  }, [gridApi]);

  // 监听 Grid 事件
  useEffect(() => {
    if (!gridApi) return;

    // 初始更新
    updateStats();
    updateColumns();

    // 事件处理函数
    const handleFilterChanged = () => updateStats();
    const handleSelectionChanged = () => updateStats();
    const handleModelUpdated = () => updateStats();
    const handleColumnVisible = () => {
      updateStats();
      updateColumns();
    };

    // 添加事件监听
    gridApi.addEventListener('filterChanged', handleFilterChanged);
    gridApi.addEventListener('selectionChanged', handleSelectionChanged);
    gridApi.addEventListener('modelUpdated', handleModelUpdated);
    gridApi.addEventListener('columnVisible', handleColumnVisible);

    // 清理 - 检查 grid 是否已销毁，避免警告 #26
    return () => {
      // AG Grid v31+ 使用 isDestroyed() 检查 grid 状态
      if (gridApi.isDestroyed?.()) return;
      
      gridApi.removeEventListener('filterChanged', handleFilterChanged);
      gridApi.removeEventListener('selectionChanged', handleSelectionChanged);
      gridApi.removeEventListener('modelUpdated', handleModelUpdated);
      gridApi.removeEventListener('columnVisible', handleColumnVisible);
    };
  }, [gridApi, updateStats, updateColumns]);

  // 切换列可见性
  const toggleColumn = useCallback((field: string, visible: boolean) => {
    if (!gridApi) return;
    gridApi.setColumnsVisible([field], visible);
  }, [gridApi]);

  // 显示所有列
  const showAllColumns = useCallback(() => {
    if (!gridApi) return;
    const allColumns = gridApi.getColumns() || [];
    const columnIds = allColumns.map((col: Column) => col.getColId());
    gridApi.setColumnsVisible(columnIds, true);
  }, [gridApi]);

  // 隐藏所有列
  const hideAllColumns = useCallback(() => {
    if (!gridApi) return;
    const allColumns = gridApi.getColumns() || [];
    // 保留至少一列可见
    const columnIds = allColumns.slice(1).map((col: Column) => col.getColId());
    gridApi.setColumnsVisible(columnIds, false);
  }, [gridApi]);

  // 重置列可见性
  const resetColumns = useCallback(() => {
    if (!gridApi) return;
    gridApi.resetColumnState();
    updateColumns();
  }, [gridApi, updateColumns]);

  // 自动调整列宽
  const autoSizeColumns = useCallback(() => {
    if (!gridApi) return;
    const allColumns = gridApi.getColumns() || [];
    const columnIds = allColumns.map((col: Column) => col.getColId());
    gridApi.autoSizeColumns(columnIds);
  }, [gridApi]);

  // 适应容器宽度
  const sizeColumnsToFit = useCallback(() => {
    if (!gridApi) return;
    gridApi.sizeColumnsToFit();
  }, [gridApi]);

  return {
    stats,
    columns,
    toggleColumn,
    showAllColumns,
    hideAllColumns,
    resetColumns,
    autoSizeColumns,
    sizeColumnsToFit,
  };
};

export default useGridStats;
