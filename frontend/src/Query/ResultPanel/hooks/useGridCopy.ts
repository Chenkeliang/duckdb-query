/**
 * Grid 复制功能 Hook
 * 提供单元格区域复制和行复制功能
 *
 * 支持两种复制模式：
 * 1. 选中行复制：复制选中行的所有列数据
 * 2. 单列复制：复制选中行的指定列数据（竖向复制）
 */

import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { GridApi } from 'ag-grid-community';
import { showSuccessToast, showErrorToast } from '@/utils/toastHelpers';

export interface UseGridCopyReturn {
  /** 复制选中的单元格区域或行到剪贴板 */
  copyToClipboard: () => Promise<void>;
  /** 复制选中的行到剪贴板 */
  copySelectedRows: () => Promise<void>;
  /** 设置当前聚焦的列（用于单列复制） */
  setFocusedColumn: (colId: string | null) => void;
}

/**
 * Grid 复制功能 Hook
 */
export function useGridCopy(gridApi: GridApi | null): UseGridCopyReturn {
  const { t } = useTranslation('common');
  // 记录当前聚焦的列，用于单列复制
  const focusedColumnRef = useRef<string | null>(null);

  /**
   * 设置当前聚焦的列
   */
  const setFocusedColumn = useCallback((colId: string | null) => {
    focusedColumnRef.current = colId;
  }, []);

  /**
   * 提取区域数据（Enterprise 功能）
   */
  const extractRangeData = useCallback((ranges: any[]) => {
    if (!ranges || ranges.length === 0 || !gridApi) return [];

    const range = ranges[0]; // 只处理第一个选区
    const startRow = Math.min(range.startRow.rowIndex, range.endRow.rowIndex);
    const endRow = Math.max(range.startRow.rowIndex, range.endRow.rowIndex);
    const columns = range.columns;

    const data: string[][] = [];

    // 提取表头
    const headers = columns.map((col: any) => col.getColDef().headerName || col.getColId());
    data.push(headers);

    // 提取数据行
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
      const rowNode = gridApi.getDisplayedRowAtIndex(rowIndex);
      if (!rowNode) continue;

      const rowData = columns.map((col: any) => {
        const colId = col.getColId();
        const value = rowNode.data?.[colId];
        return value === null || value === undefined ? '' : String(value);
      });
      data.push(rowData);
    }

    return data;
  }, [gridApi]);

  /**
   * 转换为 TSV 格式（多列）
   */
  const convertToTSV = useCallback((data: string[][]) => {
    return data.map(row =>
      row.map(cell => {
        // 处理包含制表符或换行符的单元格
        if (cell.includes('\t') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join('\t')
    ).join('\n');
  }, []);

  /**
   * 转换为单列格式（每个值一行）
   */
  const convertToSingleColumn = useCallback((values: string[]) => {
    return values.map(cell => {
      // 处理包含换行符的单元格
      if (cell.includes('\n')) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join('\n');
  }, []);

  /**
   * 复制选中行的单列数据（竖向复制）
   */
  const copySingleColumn = useCallback(async (colId: string) => {
    if (!gridApi) return false;

    try {
      const selectedRows = gridApi.getSelectedRows();
      if (selectedRows.length === 0) {
        return false;
      }

      // 提取单列数据
      const values = selectedRows.map((row: any) => {
        const value = row[colId];
        return value === null || value === undefined ? '' : String(value);
      });

      // 转换为单列格式（每个值一行）
      const text = convertToSingleColumn(values);

      await navigator.clipboard.writeText(text);
      showSuccessToast(t, 'COPY_SUCCESS', t('result.columnCopySuccess', {
        defaultValue: '已复制 {{count}} 个单元格',
        count: values.length
      }));
      return true;
    } catch (error) {
      console.error('单列复制失败:', error);
      return false;
    }
  }, [gridApi, convertToSingleColumn, t]);

  /**
   * 复制选中的行（所有列）
   */
  const copySelectedRows = useCallback(async () => {
    if (!gridApi) return;

    try {
      const selectedRows = gridApi.getSelectedRows();
      if (selectedRows.length === 0) {
        toast.warning(t('result.noRowsSelected'));
        return;
      }

      // 获取所有可见列
      const columnDefs = gridApi.getColumnDefs();
      const visibleColumns = columnDefs?.filter((col: any) => col.field) || [];

      // 构建数据
      const headers = visibleColumns.map((col: any) => col.headerName || col.field);
      const rows = selectedRows.map((row: any) =>
        visibleColumns.map((col: any) => {
          const value = row[col.field!];
          return value === null || value === undefined ? '' : String(value);
        })
      );

      const data = [headers, ...rows];
      const tsv = convertToTSV(data);

      await navigator.clipboard.writeText(tsv);
      showSuccessToast(t, 'COPY_SUCCESS', t('result.copySuccess', {
        defaultValue: '已复制 {{count}} 行',
        count: selectedRows.length
      }));
    } catch (error) {
      console.error('复制失败:', error);
      showErrorToast(t, 'COPY_FAILED', t('result.copyFailed', { defaultValue: '复制失败' }));
    }
  }, [gridApi, convertToTSV, t]);

  /**
   * 复制到剪贴板
   * 优先级：
   * 1. Enterprise 范围选择（如果可用）
   * 2. 聚焦列的单列复制（如果有聚焦列且有选中行）
   * 3. 选中行的所有列复制
   */
  const copyToClipboard = useCallback(async () => {
    if (!gridApi) return;

    try {
      // 1. 尝试使用 Enterprise 范围选择（防御式调用）
      let ranges: any[] | undefined;
      try {
        ranges = (gridApi as any)?.getCellRanges?.();
      } catch {
        // Enterprise 功能不可用
      }

      if (ranges && ranges.length > 0) {
        const data = extractRangeData(ranges);
        if (data.length > 0) {
          const tsv = convertToTSV(data);
          await navigator.clipboard.writeText(tsv);

          const rowCount = data.length - 1; // 减去表头
          const colCount = data[0].length;
          showSuccessToast(t, 'COPY_SUCCESS', t('result.rangeCopySuccess', {
            defaultValue: '已复制 {{rows}} 行 × {{cols}} 列',
            rows: rowCount,
            cols: colCount
          }));
          return;
        }
      }

      // 2. 尝试获取当前聚焦的单元格列
      let focusedColId = focusedColumnRef.current;

      // 也尝试从 AG Grid 获取聚焦单元格
      if (!focusedColId) {
        try {
          const focusedCell = gridApi.getFocusedCell();
          if (focusedCell) {
            focusedColId = focusedCell.column.getColId();
          }
        } catch {
          // 忽略错误
        }
      }

      // 3. 如果有聚焦列且有选中行，尝试单列复制
      if (focusedColId) {
        const selectedRows = gridApi.getSelectedRows();
        if (selectedRows.length > 0) {
          const success = await copySingleColumn(focusedColId);
          if (success) return;
        }
      }

      // 4. 回退到复制选中行的所有列
      await copySelectedRows();
    } catch (error) {
      console.error('复制失败:', error);
      showErrorToast(t, 'COPY_FAILED', t('result.copyFailed', { defaultValue: '复制失败' }));
    }
  }, [gridApi, extractRangeData, convertToTSV, t, copySelectedRows, copySingleColumn]);

  return {
    copyToClipboard,
    copySelectedRows,
    setFocusedColumn,
  };
}
