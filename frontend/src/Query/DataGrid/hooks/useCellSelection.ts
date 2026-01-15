/**
 * useCellSelection - 单元格选区管理 Hook
 * 
 * 实现飞书式单矩形选区模型
 * 
 * 索引语义：
 * - rowIndex/colIndex 基于当前可见视图（filtered + sorted 后的索引）
 * - colIndex 基于 table.getVisibleLeafColumns() 返回的当前可见列顺序
 */

import { useState, useCallback } from 'react';
import type { CellPosition, CellSelection, SelectionRange } from '../types';

export interface UseCellSelectionReturn {
  /** 当前选区 */
  selection: CellSelection | null;
  /** 是否正在选择 */
  isSelecting: boolean;
  /** 开始选择 */
  startSelection: (rowIndex: number, colIndex: number) => void;
  /** 扩展选区 */
  extendSelection: (rowIndex: number, colIndex: number) => void;
  /** 结束选择 */
  endSelection: () => void;
  /** 清除选区 */
  clearSelection: () => void;
  /** 判断单元格是否选中 */
  isCellSelected: (rowIndex: number, colIndex: number) => boolean;
  /** 获取选区范围 */
  getSelectionRange: () => SelectionRange | null;
  /** 移动焦点 */
  moveFocus: (direction: 'up' | 'down' | 'left' | 'right') => void;
  /** 设置全选 */
  selectAll: () => void;
  /** 验证并调整选区（数据更新后调用） */
  validateSelection: (rowCount: number, colCount: number) => void;
}

interface UseCellSelectionOptions {
  /** 总行数 */
  rowCount: number;
  /** 总列数 */
  colCount: number;
  /** 选区变化回调 */
  onSelectionChange?: (selection: CellSelection | null) => void;
}

export function useCellSelection({
  rowCount,
  colCount,
  onSelectionChange,
}: UseCellSelectionOptions): UseCellSelectionReturn {
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // 更新选区并触发回调
  const updateSelection = useCallback(
    (newSelection: CellSelection | null) => {
      setSelection(newSelection);
      onSelectionChange?.(newSelection);
    },
    [onSelectionChange]
  );

  // 开始选择
  const startSelection = useCallback(
    (rowIndex: number, colIndex: number) => {
      const clampedPos = {
        rowIndex: Math.max(0, Math.min(rowIndex, rowCount - 1)),
        colIndex: Math.max(0, Math.min(colIndex, colCount - 1)),
      };
      
      const newSelection: CellSelection = {
        anchor: clampedPos,
        end: clampedPos,
        focus: clampedPos,
      };
      
      setIsSelecting(true);
      updateSelection(newSelection);
    },
    [rowCount, colCount, updateSelection]
  );

  // 扩展选区
  const extendSelection = useCallback(
    (rowIndex: number, colIndex: number) => {
      if (!selection) return;

      const clampedPos = {
        rowIndex: Math.max(0, Math.min(rowIndex, rowCount - 1)),
        colIndex: Math.max(0, Math.min(colIndex, colCount - 1)),
      };

      updateSelection({
        ...selection,
        end: clampedPos,
        focus: clampedPos,
        all: false, // 扩展时取消全选标志
      });
    },
    [selection, rowCount, colCount, updateSelection]
  );

  // 结束选择
  const endSelection = useCallback(() => {
    setIsSelecting(false);
  }, []);

  // 清除选区
  const clearSelection = useCallback(() => {
    setIsSelecting(false);
    updateSelection(null);
  }, [updateSelection]);

  // 获取选区范围
  const getSelectionRange = useCallback((): SelectionRange | null => {
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
  }, [selection, rowCount, colCount]);

  // 判断单元格是否选中
  const isCellSelected = useCallback(
    (rowIndex: number, colIndex: number): boolean => {
      const range = getSelectionRange();
      if (!range) return false;

      return (
        rowIndex >= range.minRow &&
        rowIndex <= range.maxRow &&
        colIndex >= range.minCol &&
        colIndex <= range.maxCol
      );
    },
    [getSelectionRange]
  );

  // 移动焦点
  const moveFocus = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      if (!selection) {
        // 没有选区时，从 (0, 0) 开始
        startSelection(0, 0);
        return;
      }

      const { focus } = selection;
      let newRow = focus.rowIndex;
      let newCol = focus.colIndex;

      switch (direction) {
        case 'up':
          newRow = Math.max(0, focus.rowIndex - 1);
          break;
        case 'down':
          newRow = Math.min(rowCount - 1, focus.rowIndex + 1);
          break;
        case 'left':
          newCol = Math.max(0, focus.colIndex - 1);
          break;
        case 'right':
          newCol = Math.min(colCount - 1, focus.colIndex + 1);
          break;
      }

      const newPos = { rowIndex: newRow, colIndex: newCol };
      updateSelection({
        anchor: newPos,
        end: newPos,
        focus: newPos,
      });
    },
    [selection, rowCount, colCount, startSelection, updateSelection]
  );

  // 全选
  const selectAll = useCallback(() => {
    if (rowCount === 0 || colCount === 0) return;

    updateSelection({
      anchor: { rowIndex: 0, colIndex: 0 },
      end: { rowIndex: rowCount - 1, colIndex: colCount - 1 },
      focus: { rowIndex: 0, colIndex: 0 },
      all: true,
    });
  }, [rowCount, colCount, updateSelection]);

  // 验证并调整选区（数据更新后调用）
  const validateSelection = useCallback(
    (newRowCount: number, newColCount: number) => {
      if (!selection) return;

      // 如果数据为空，清除选区
      if (newRowCount === 0 || newColCount === 0) {
        clearSelection();
        return;
      }

      // 调整选区到有效范围
      const clamp = (pos: CellPosition): CellPosition => ({
        rowIndex: Math.max(0, Math.min(pos.rowIndex, newRowCount - 1)),
        colIndex: Math.max(0, Math.min(pos.colIndex, newColCount - 1)),
      });

      const newAnchor = clamp(selection.anchor);
      const newEnd = clamp(selection.end);
      const newFocus = clamp(selection.focus);

      // 检查是否有变化
      const hasChanged =
        newAnchor.rowIndex !== selection.anchor.rowIndex ||
        newAnchor.colIndex !== selection.anchor.colIndex ||
        newEnd.rowIndex !== selection.end.rowIndex ||
        newEnd.colIndex !== selection.end.colIndex ||
        newFocus.rowIndex !== selection.focus.rowIndex ||
        newFocus.colIndex !== selection.focus.colIndex;

      if (hasChanged) {
        updateSelection({
          anchor: newAnchor,
          end: newEnd,
          focus: newFocus,
          all: selection.all,
        });
      }
    },
    [selection, clearSelection, updateSelection]
  );

  return {
    selection,
    isSelecting,
    startSelection,
    extendSelection,
    endSelection,
    clearSelection,
    isCellSelected,
    getSelectionRange,
    moveFocus,
    selectAll,
    validateSelection,
  };
}
