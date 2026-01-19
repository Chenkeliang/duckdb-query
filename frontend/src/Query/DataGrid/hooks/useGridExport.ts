/**
 * DataGrid 导出功能 Hook
 * 
 * 特性：
 * - 支持导出 CSV 和 JSON 格式
 * - 支持导出范围选择（全部/筛选后/选中）
 * - 正确处理特殊类型（BigInt、LIST、STRUCT、Date）
 * - UTF-8 BOM 支持（Excel 兼容）
 * - RFC 4180 标准 CSV 格式
 */

import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { showSuccessToast, showErrorToast } from '@/utils/toastHelpers';

/** 导出范围 */
export type ExportScope = 'all' | 'filtered' | 'selected';

/** 导出格式 */
export type ExportFormat = 'csv' | 'json';

export interface UseGridExportOptions {
  /** 原始数据 */
  data: Record<string, unknown>[];
  /** 列（按顺序） */
  columns: string[];
  /** 筛选后的数据 */
  filteredData?: Record<string, unknown>[];
  /** 选中的行索引 */
  selectedRows?: number[];
  /** 最大客户端导出行数（超过此值建议使用异步任务） */
  maxClientExportRows?: number;
}

export interface ExportOptions {
  /** 文件名（不含扩展名） */
  filename?: string;
  /** 导出范围 */
  scope?: ExportScope;
  /** 是否包含表头（仅 CSV） */
  includeHeader?: boolean;
}

export interface UseGridExportReturn {
  /** 导出为 CSV */
  exportCSV: (options?: ExportOptions) => void;
  /** 导出为 JSON */
  exportJSON: (options?: ExportOptions) => void;
  /** 是否可以导出选中数据 */
  canExportSelected: boolean;
  /** 当前预览数据行数 */
  previewRowCount: number;
  /** 是否超过客户端导出限制 */
  exceedsClientLimit: boolean;
  /** 获取导出数据（用于预览） */
  getExportData: (scope?: ExportScope) => Record<string, unknown>[];
}

/** 默认最大客户端导出行数 */
const DEFAULT_MAX_CLIENT_EXPORT_ROWS = 50000;

/**
 * 序列化单元格值（处理特殊类型）
 * 
 * 解决 DuckDB 特殊类型的序列化问题：
 * - BigInt: JSON.stringify 会崩溃
 * - LIST/STRUCT: 可能变成 [object Object]
 * - Date: 格式不一致
 */
export function serializeCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  // 处理 BigInt（JSON.stringify 会崩溃）
  if (typeof value === 'bigint') {
    return value.toString();
  }
  
  // 处理 Date
  if (value instanceof Date) {
    return value.toISOString();
  }
  
  // 处理数组和对象（LIST、STRUCT 类型）
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  
  return String(value);
}

/**
 * 转义 CSV 值（RFC 4180 标准）
 * 
 * 规则：
 * - 如果值包含逗号、换行或双引号，需要用双引号包裹
 * - 值中的双引号需要转义为两个双引号
 */
function escapeCSVValue(value: unknown): string {
  const str = serializeCellValue(value);
  // 如果包含逗号、换行或引号，需要用引号包裹
  if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * JSON.stringify 的 replacer，处理 BigInt
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

/**
 * 下载文件
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  // 添加 UTF-8 BOM（Excel 兼容）
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 生成默认文件名
 */
function generateFilename(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `query_result_${year}${month}${day}_${hours}${minutes}${seconds}`;
}

/**
 * DataGrid 导出功能 Hook
 * 
 * @example
 * ```tsx
 * const { exportCSV, exportJSON, canExportSelected } = useGridExport({
 *   data: queryResult,
 *   columns: ['id', 'name', 'email'],
 *   filteredData: filteredResult,
 *   selectedRows: [0, 1, 2],
 * });
 * 
 * // 导出全部数据
 * exportCSV({ scope: 'all' });
 * 
 * // 导出筛选后的数据
 * exportCSV({ scope: 'filtered' });
 * 
 * // 导出选中的数据
 * if (canExportSelected) {
 *   exportCSV({ scope: 'selected' });
 * }
 * ```
 */
export function useGridExport({
  data,
  columns,
  filteredData,
  selectedRows,
  maxClientExportRows = DEFAULT_MAX_CLIENT_EXPORT_ROWS,
}: UseGridExportOptions): UseGridExportReturn {
  const { t } = useTranslation('common');
  
  // 获取要导出的数据
  const getExportData = useCallback(
    (scope: ExportScope = 'all'): Record<string, unknown>[] => {
      switch (scope) {
        case 'filtered':
          return filteredData || data;
        case 'selected':
          if (selectedRows && selectedRows.length > 0) {
            const sourceData = filteredData || data;
            return selectedRows
              .map((idx) => sourceData[idx])
              .filter((row): row is Record<string, unknown> => row !== undefined);
          }
          return [];
        default:
          return data;
      }
    },
    [data, filteredData, selectedRows]
  );

  // 导出 CSV
  const exportCSV = useCallback(
    (options: ExportOptions = {}) => {
      const {
        filename = generateFilename(),
        scope = 'all',
        includeHeader = true,
      } = options;

      const exportData = getExportData(scope);
      if (exportData.length === 0) {
        showErrorToast(t, 'EXPORT_NO_DATA', t('query.export.noData'));
        return;
      }

      // 检查是否超过限制
      if (exportData.length > maxClientExportRows) {
        toast.warning(
          t('query.export.largeDataWarning', { rowCount: exportData.length.toLocaleString() })
        );
      }

      try {
        const lines: string[] = [];

        // 表头
        if (includeHeader) {
          lines.push(columns.map(escapeCSVValue).join(','));
        }

        // 数据行
        exportData.forEach((row) => {
          const values = columns.map((col) => escapeCSVValue(row[col]));
          lines.push(values.join(','));
        });

        const content = lines.join('\n');
        downloadFile(content, `${filename}.csv`, 'text/csv');
        showSuccessToast(t, 'EXPORT_SUCCESS', t('query.export.success', { rowCount: exportData.length.toLocaleString() }));
      } catch (error) {
        console.error('CSV 导出失败:', error);
        showErrorToast(t, 'EXPORT_FAILED', t('query.export.failed'));
      }
    },
    [columns, getExportData, maxClientExportRows, t]
  );

  // 导出 JSON
  const exportJSON = useCallback(
    (options: ExportOptions = {}) => {
      const { filename = generateFilename(), scope = 'all' } = options;

      const exportData = getExportData(scope);
      if (exportData.length === 0) {
        showErrorToast(t, 'EXPORT_NO_DATA', t('query.export.noData'));
        return;
      }

      // 检查是否超过限制
      if (exportData.length > maxClientExportRows) {
        toast.warning(
          t('query.export.largeDataWarning', { rowCount: exportData.length.toLocaleString() })
        );
      }

      try {
        // 只导出指定列
        const filteredExportData = exportData.map((row) => {
          const newRow: Record<string, unknown> = {};
          columns.forEach((col) => {
            newRow[col] = row[col];
          });
          return newRow;
        });

        // 使用 jsonReplacer 处理 BigInt
        const content = JSON.stringify(filteredExportData, jsonReplacer, 2);
        downloadFile(content, `${filename}.json`, 'application/json');
        showSuccessToast(t, 'EXPORT_SUCCESS', t('query.export.success', { rowCount: exportData.length.toLocaleString() }));
      } catch (error) {
        console.error('JSON 导出失败:', error);
        showErrorToast(t, 'EXPORT_FAILED', t('query.export.failed'));
      }
    },
    [columns, getExportData, maxClientExportRows, t]
  );

  // 是否可以导出选中数据
  const canExportSelected = useMemo(
    () => (selectedRows?.length || 0) > 0,
    [selectedRows]
  );

  // 是否超过客户端导出限制
  const exceedsClientLimit = useMemo(
    () => data.length > maxClientExportRows,
    [data.length, maxClientExportRows]
  );

  return {
    exportCSV,
    exportJSON,
    canExportSelected,
    previewRowCount: data.length,
    exceedsClientLimit,
    getExportData,
  };
}
