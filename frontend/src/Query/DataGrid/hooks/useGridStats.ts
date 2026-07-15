/**
 * useGridStats - 统计信息 Hook
 */

import { useMemo } from 'react';
import type { CellSelection, GridStats } from '../types';
import {
  averagePlainDecimals,
  sumPlainDecimals,
  toPlainDecimalText,
} from '../utils/decimalMath';

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
    let sum: number | string | undefined;
    let average: number | string | undefined;

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
          // 纯十进制文本走 BigInt 精确算术（DECIMAL 字符串、>2^53 的 BIGINT 字符串）；
          // 出现指数形态浮点则整组回退 float 口径
          const texts: string[] = [];
          const floats: number[] = [];
          let exact = true;

          for (let row = minRow; row <= maxRow; row++) {
            const value = data[row]?.[colName];
            if (value === null || value === undefined || value === '') continue;
            const t = toPlainDecimalText(value);
            if (t !== null) {
              texts.push(t);
              floats.push(Number(t));
            } else if (typeof value === 'number' && Number.isFinite(value)) {
              exact = false;
              floats.push(value);
            }
          }

          if (exact && texts.length > 0) {
            sum = sumPlainDecimals(texts);
            average = averagePlainDecimals(texts);
          } else if (floats.length > 0) {
            const floatSum = floats.reduce((a, b) => a + b, 0);
            sum = floatSum;
            average = floatSum / floats.length;
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
