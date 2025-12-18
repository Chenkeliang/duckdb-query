/**
 * useKeyboardNavigation - 键盘导航 Hook
 */

import { useCallback } from 'react';
import type { CellSelection, CellPosition } from '../types';

export interface UseKeyboardNavigationOptions {
  /** 是否启用 */
  enabled: boolean;
  /** 总行数 */
  rowCount: number;
  /** 总列数 */
  colCount: number;
  /** 当前选区 */
  selection: CellSelection | null;
  /** 开始选择 */
  startSelection: (pos: CellPosition) => void;
  /** 扩展选区 */
  extendSelection: (pos: CellPosition) => void;
  /** 清除选区 */
  clearSelection: () => void;
  /** 全选 */
  selectAll: () => void;
  /** 复制 */
  onCopy?: () => void;
  /** 滚动到行 */
  scrollToRow?: (index: number) => void;
  /** 滚动到列 */
  scrollToColumn?: (index: number) => void;
}

export interface UseKeyboardNavigationReturn {
  /** 处理键盘事件 */
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

export function useKeyboardNavigation({
  enabled,
  rowCount,
  colCount,
  selection,
  startSelection,
  extendSelection,
  clearSelection,
  selectAll,
  onCopy,
  scrollToRow,
  scrollToColumn,
}: UseKeyboardNavigationOptions): UseKeyboardNavigationReturn {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enabled || rowCount === 0 || colCount === 0) return;

      const { key, shiftKey, ctrlKey, metaKey } = e;
      const isCtrlOrCmd = ctrlKey || metaKey;

      // 获取当前焦点位置
      const focus = selection?.focus || { rowIndex: 0, colIndex: 0 };

      // Escape - 清除选区
      if (key === 'Escape') {
        e.preventDefault();
        clearSelection();
        return;
      }

      // Ctrl+A - 全选
      if (isCtrlOrCmd && key === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }

      // Ctrl+C - 复制
      if (isCtrlOrCmd && key === 'c') {
        e.preventDefault();
        onCopy?.();
        return;
      }

      // 方向键导航
      let newRow = focus.rowIndex;
      let newCol = focus.colIndex;

      switch (key) {
        case 'ArrowUp':
          e.preventDefault();
          newRow = Math.max(0, focus.rowIndex - 1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          newRow = Math.min(rowCount - 1, focus.rowIndex + 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          newCol = Math.max(0, focus.colIndex - 1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          newCol = Math.min(colCount - 1, focus.colIndex + 1);
          break;
        case 'Home':
          e.preventDefault();
          if (isCtrlOrCmd) {
            newRow = 0;
            newCol = 0;
          } else {
            newCol = 0;
          }
          break;
        case 'End':
          e.preventDefault();
          if (isCtrlOrCmd) {
            newRow = rowCount - 1;
            newCol = colCount - 1;
          } else {
            newCol = colCount - 1;
          }
          break;
        case 'PageUp':
          e.preventDefault();
          newRow = Math.max(0, focus.rowIndex - 20);
          break;
        case 'PageDown':
          e.preventDefault();
          newRow = Math.min(rowCount - 1, focus.rowIndex + 20);
          break;
        default:
          return;
      }

      if (shiftKey && selection) {
        // Shift + 方向键：扩展选区
        extendSelection({ rowIndex: newRow, colIndex: newCol });
      } else {
        // 单独方向键：移动焦点并重置选区
        startSelection({ rowIndex: newRow, colIndex: newCol });
      }

      // 滚动到新位置
      scrollToRow?.(newRow);
      scrollToColumn?.(newCol);
    },
    [
      enabled,
      rowCount,
      colCount,
      selection,
      startSelection,
      extendSelection,
      clearSelection,
      selectAll,
      onCopy,
      scrollToRow,
      scrollToColumn,
    ]
  );

  return { handleKeyDown };
}
