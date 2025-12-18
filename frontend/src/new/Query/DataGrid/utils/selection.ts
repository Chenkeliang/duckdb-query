/**
 * 选区计算工具函数
 */

import type { CellPosition, CellSelection, SelectionRange } from '../types';

/**
 * 获取选区范围
 */
export function getSelectionRange(
  selection: CellSelection | null,
  rowCount: number,
  colCount: number
): SelectionRange | null {
  if (!selection) return null;

  if (selection.all) {
    return {
      minRow: 0,
      maxRow: rowCount - 1,
      minCol: 0,
      maxCol: colCount - 1,
    };
  }

  return {
    minRow: Math.min(selection.anchor.rowIndex, selection.end.rowIndex),
    maxRow: Math.max(selection.anchor.rowIndex, selection.end.rowIndex),
    minCol: Math.min(selection.anchor.colIndex, selection.end.colIndex),
    maxCol: Math.max(selection.anchor.colIndex, selection.end.colIndex),
  };
}

/**
 * 判断单元格是否在选区内
 */
export function isCellInRange(
  rowIndex: number,
  colIndex: number,
  range: SelectionRange | null
): boolean {
  if (!range) return false;

  return (
    rowIndex >= range.minRow &&
    rowIndex <= range.maxRow &&
    colIndex >= range.minCol &&
    colIndex <= range.maxCol
  );
}

/**
 * 计算选区单元格数量
 */
export function getSelectionCellCount(range: SelectionRange | null): number {
  if (!range) return 0;
  return (range.maxRow - range.minRow + 1) * (range.maxCol - range.minCol + 1);
}

/**
 * 限制位置在有效范围内
 */
export function clampPosition(
  pos: CellPosition,
  rowCount: number,
  colCount: number
): CellPosition {
  return {
    rowIndex: Math.max(0, Math.min(pos.rowIndex, rowCount - 1)),
    colIndex: Math.max(0, Math.min(pos.colIndex, colCount - 1)),
  };
}

/**
 * 验证选区是否有效
 */
export function isSelectionValid(
  selection: CellSelection | null,
  rowCount: number,
  colCount: number
): boolean {
  if (!selection) return true;
  if (rowCount === 0 || colCount === 0) return false;

  const isPositionValid = (pos: CellPosition) =>
    pos.rowIndex >= 0 &&
    pos.rowIndex < rowCount &&
    pos.colIndex >= 0 &&
    pos.colIndex < colCount;

  return (
    isPositionValid(selection.anchor) &&
    isPositionValid(selection.end) &&
    isPositionValid(selection.focus)
  );
}

/**
 * 调整选区到有效范围
 */
export function adjustSelection(
  selection: CellSelection,
  rowCount: number,
  colCount: number
): CellSelection {
  return {
    anchor: clampPosition(selection.anchor, rowCount, colCount),
    end: clampPosition(selection.end, rowCount, colCount),
    focus: clampPosition(selection.focus, rowCount, colCount),
    all: selection.all,
  };
}
