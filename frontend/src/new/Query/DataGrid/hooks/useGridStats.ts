/**
 * useGridStats - 统计信息 Hook
 */

import { useMemo } from 'react';
import type { CellSelection, GridStats, SelectionRange } from '../types';

export interface UseGridStatsOptions {
  /** 总行数 */
  totalRows: number;
  /** 筛选后行数 */
  filteredRows: number;
  /** 当前选区 */
  selection: CellSelection | null;
  /** 数据（用于计算数值统计） */
  data?: Record<string, unknown>[];
  /** 列名列表 */
  columns?: string[];
}

export interface UseGridStatsReturn {
  /** 统计信息 */
  stats: GridStats;
}

export function useGridStats({
  totalRows,
  filteredRows,
  selection,
  data,
  columns,
}: UseGridStatsOptions): UseGridStatsReturn {
  const stats = useMemo<GridStats>(() => {
    // 计算选中单元格数量
    let selectedCells = 0;
    let sum: number | undefined;
    let average: number | undefined;

    if (selection) {
      if (selection.all) {
        selectedCells = filteredRows * (columns?.length || 0);
      } else {
        const minRow = Math.min(selection.anchor.rowIndex, selection.end.rowIndex);
        const maxRow = Math.max(selection.anchor.rowIndex, selection.end.rowIndex);
        const minCol = Math.min(selection.anchor.colIndex, selection.end.colIndex);
        const maxCol = Math.max(selection.anchor.colIndex, selection.end.colIndex);
        selectedCells = (maxRow - minRow + 1) * (maxCol - minCol + 1);

        // 如果选中单列且有数据，计算数值统计
        if (data && columns && minCol === maxCol) {
          const colName = columns[minCol];
          const values: number[] = [];

          for (let row = minRow; row <= maxRow; row++) {
            const value = data[row]?.[colName];
            if (typeof value === 'number' && !isNaN(value)) {
              values.push(value);
            }
          }

          if (values.length > 0) {
            sum = values.reduce((a, b) => a + b, 0);
            average = sum / values.length;
          }
        }
      }
    }

    return {
      totalRows,
      filteredRows,
      selectedCells,
      sum,
      average,
    };
  }, [totalRows, filteredRows, selection, data, columns]);

  return { stats };
}
