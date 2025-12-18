/**
 * useGridCopy - 复制功能 Hook
 * 
 * 支持 TSV/CSV/JSON 格式复制
 * 包含大数据复制安全阈值检查
 */

import { useCallback, useMemo } from 'react';
import type { CellSelection, CopyFormat, SelectionRange } from '../types';
import { COPY_CELL_LIMIT } from '../types';

export interface UseGridCopyOptions {
  /** 数据（当前可见视图的行数据） */
  data: Record<string, unknown>[];
  /** 列字段名列表（当前可见列顺序） */
  columns: string[];
  /** 当前选区 */
  selection: CellSelection | null;
  /** 确认大数据复制的回调（返回 true 继续，false 取消） */
  onConfirmLargeCopy?: (cellCount: number) => Promise<boolean>;
  /** 复制成功回调 */
  onCopySuccess?: () => void;
  /** 复制失败回调 */
  onCopyError?: (error: Error) => void;
}

export interface UseGridCopyReturn {
  /** 复制选区数据（超过阈值时会触发 onConfirmLargeCopy） */
  copySelection: (format?: CopyFormat) => Promise<void>;
  /** 复制整列 */
  copyColumn: (colIndex: number) => Promise<void>;
  /** 复制列名 */
  copyColumnName: (col: number | string) => Promise<void>;
  /** 当前选区单元格数量 */
  selectionCellCount: number;
  /** 是否超过安全阈值 */
  isOverLimit: boolean;
}

// ============ 格式化工具函数 ============

/**
 * 转义 TSV 特殊字符
 */
function escapeForTSV(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  // TSV 中需要转义制表符和换行符
  if (str.includes('\t') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * 转义 CSV 特殊字符
 */
function escapeForCSV(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  // CSV 中需要转义逗号、引号和换行符
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * 格式化为 TSV
 */
function formatAsTSV(data: unknown[][]): string {
  return data.map(row => row.map(escapeForTSV).join('\t')).join('\n');
}

/**
 * 格式化为 CSV
 */
function formatAsCSV(data: unknown[][]): string {
  return data.map(row => row.map(escapeForCSV).join(',')).join('\n');
}

/**
 * 格式化为 JSON
 */
function formatAsJSON(
  data: unknown[][],
  columns: string[]
): string {
  const rows = data.map(row => {
    const obj: Record<string, unknown> = {};
    row.forEach((value, i) => {
      obj[columns[i]] = value;
    });
    return obj;
  });
  return JSON.stringify(rows, null, 2);
}

export function useGridCopy({
  data,
  columns,
  selection,
  onConfirmLargeCopy,
  onCopySuccess,
  onCopyError,
}: UseGridCopyOptions): UseGridCopyReturn {
  // 计算选区范围
  const getSelectionRange = useCallback((): SelectionRange | null => {
    if (!selection) return null;

    if (selection.all) {
      return {
        minRow: 0,
        maxRow: data.length - 1,
        minCol: 0,
        maxCol: columns.length - 1,
      };
    }

    return {
      minRow: Math.min(selection.anchor.rowIndex, selection.end.rowIndex),
      maxRow: Math.max(selection.anchor.rowIndex, selection.end.rowIndex),
      minCol: Math.min(selection.anchor.colIndex, selection.end.colIndex),
      maxCol: Math.max(selection.anchor.colIndex, selection.end.colIndex),
    };
  }, [selection, data.length, columns.length]);

  // 计算选区单元格数量
  const selectionCellCount = useMemo(() => {
    const range = getSelectionRange();
    if (!range) return 0;
    return (range.maxRow - range.minRow + 1) * (range.maxCol - range.minCol + 1);
  }, [getSelectionRange]);

  // 是否超过安全阈值
  const isOverLimit = selectionCellCount > COPY_CELL_LIMIT;

  // 提取选区数据
  const extractSelectionData = useCallback((): unknown[][] => {
    const range = getSelectionRange();
    if (!range) return [];

    const result: unknown[][] = [];
    for (let row = range.minRow; row <= range.maxRow; row++) {
      const rowData: unknown[] = [];
      for (let col = range.minCol; col <= range.maxCol; col++) {
        const field = columns[col];
        const value = data[row]?.[field];
        rowData.push(value);
      }
      result.push(rowData);
    }
    return result;
  }, [getSelectionRange, data, columns]);

  // 复制到剪贴板
  const copyToClipboard = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        onCopySuccess?.();
      } catch (error) {
        onCopyError?.(error instanceof Error ? error : new Error('复制失败'));
      }
    },
    [onCopySuccess, onCopyError]
  );

  // 复制选区数据
  const copySelection = useCallback(
    async (format: CopyFormat = 'tsv') => {
      if (!selection) return;

      // 大数据复制确认
      if (isOverLimit && onConfirmLargeCopy) {
        const confirmed = await onConfirmLargeCopy(selectionCellCount);
        if (!confirmed) return;
      }

      const selectionData = extractSelectionData();
      if (selectionData.length === 0) return;

      const range = getSelectionRange();
      if (!range) return;

      // 获取选区列名
      const selectedColumns = columns.slice(range.minCol, range.maxCol + 1);

      let text: string;
      switch (format) {
        case 'csv':
          text = formatAsCSV(selectionData);
          break;
        case 'json':
          text = formatAsJSON(selectionData, selectedColumns);
          break;
        case 'tsv':
        default:
          text = formatAsTSV(selectionData);
          break;
      }

      await copyToClipboard(text);
    },
    [
      selection,
      isOverLimit,
      onConfirmLargeCopy,
      selectionCellCount,
      extractSelectionData,
      getSelectionRange,
      columns,
      copyToClipboard,
    ]
  );

  // 复制整列
  const copyColumn = useCallback(
    async (colIndex: number) => {
      if (colIndex < 0 || colIndex >= columns.length) return;

      const field = columns[colIndex];
      const columnData = data.map(row => [row[field]]);
      const text = formatAsTSV(columnData);
      await copyToClipboard(text);
    },
    [columns, data, copyToClipboard]
  );

  // 复制列名
  const copyColumnName = useCallback(
    async (col: number | string) => {
      const colIndex = typeof col === 'string' ? columns.indexOf(col) : col;
      if (!Number.isFinite(colIndex) || colIndex < 0 || colIndex >= columns.length) return;

      const name = columns[colIndex];
      if (!name) return;
      await copyToClipboard(name);
    },
    [columns, copyToClipboard]
  );

  return {
    copySelection,
    copyColumn,
    copyColumnName,
    selectionCellCount,
    isOverLimit,
  };
}
