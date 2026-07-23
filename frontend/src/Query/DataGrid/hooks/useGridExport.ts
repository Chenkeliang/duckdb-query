/**
 * DataGrid 导出功能 Hook
 * 
 * 特性：
 * - 支持导出 CSV 和 JSON 格式
 * - 支持导出范围选择（全部/筛选后/选中）
 * - 正确处理特殊类型（BigInt、LIST、STRUCT、Date）
 * - CSV 支持 UTF-8 BOM（Excel 兼容）
 * - RFC 4180 标准 CSV 格式
 */

import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { showSuccessToast, showErrorToast, showSavedToToast } from '@/utils/toastHelpers';
import { isTauri } from '@/desktop/openExternal';
import { pickSavePath, writeTextToPath, writeBytesToPath } from '@/desktop/saveLocal';

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
  /** 导出为 Excel */
  exportExcel: (options?: ExportOptions) => void;
  /** 是否可以导出选中数据 */
  canExportSelected: boolean;
  /** 当前预览数据行数 */
  previewRowCount: number;
  /** 是否超过客户端导出限制 */
  exceedsClientLimit: boolean;
  /** 获取导出数据（用于预览） */
  getExportData: (scope?: ExportScope) => Record<string, unknown>[];
  /** 下载文件工具函数 */
  downloadFile: (content: string, filename: string, mimeType: string) => void;
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

  // 优先处理字符串：保持原始格式（解决日期字符串被转换为 ISO 格式的问题）
  if (typeof value === 'string') {
    return value;
  }

  // 处理 BigInt（JSON.stringify 会崩溃）
  if (typeof value === 'bigint') {
    return value.toString();
  }

  // 处理 Date（仅对真正的 Date 对象生效）
  if (value instanceof Date) {
    // 使用本地时间格式，避免 toISOString() 的时区转换
    const pad = (n: number, d = 2) => n.toString().padStart(d, '0');
    const y = value.getFullYear();
    const m = pad(value.getMonth() + 1);
    const day = pad(value.getDate());
    const h = pad(value.getHours());
    const min = pad(value.getMinutes());
    const s = pad(value.getSeconds());
    const ms = pad(value.getMilliseconds(), 3);
    return `${y}-${m}-${day} ${h}:${min}:${s}.${ms}`;
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
 * - 对于带毫秒的日期时间字符串，使用 Excel 公式格式 ="xxx" 强制作为文本处理
 *   避免 WPS/Excel 将其解析为日期数值导致显示异常
 */
function escapeCSVValue(value: unknown): string {
  const str = serializeCellValue(value);

  // 检测带毫秒的日期时间字符串：YYYY-MM-DD HH:MM:SS.mmm
  // 使用 Excel 公式格式 ="xxx" 强制作为文本，防止 WPS/Excel 自动解析
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+$/.test(str)) {
    return `="${str}"`;
  }

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
function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
  includeBom = true
): void {
  const BOM = '\uFEFF';
  const blob = new Blob([includeBom ? BOM + content : content], { type: `${mimeType};charset=utf-8` });
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
 * 交付文本导出:桌面走 saveLocal 原语(原生存盘对话框 + fs 直写,可选目录),
 * Web 走 blob 下载(浏览器默认下载目录)。
 * 返回 null 表示用户取消(调用方不弹任何 toast);否则返回 { path? }——
 * path 仅桌面有值,用于"已保存到 …"提示。
 */
async function deliverTextFile(
  content: string,
  filename: string,
  mimeType: string,
  includeBom = true
): Promise<{ path?: string } | null> {
  if (isTauri()) {
    const target = await pickSavePath(filename);
    if (!target) return null;
    await writeTextToPath(target, content, { bom: includeBom });
    return { path: target };
  }
  downloadFile(content, filename, mimeType, includeBom);
  return {};
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
    async (options: ExportOptions = {}) => {
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
        const delivered = await deliverTextFile(content, `${filename}.csv`, 'text/csv');
        if (!delivered) return; // 用户取消存盘对话框
        if (delivered.path) {
          showSavedToToast(t, delivered.path);
        } else {
          showSuccessToast(t, 'EXPORT_SUCCESS', t('query.export.success', { rowCount: exportData.length.toLocaleString() }));
        }
      } catch (error) {
        console.error('CSV 导出失败:', error);
        showErrorToast(t, 'EXPORT_FAILED', t('query.export.failed'));
      }
    },
    [columns, getExportData, maxClientExportRows, t]
  );

  // 导出 Excel (.xlsx)
  const exportExcel = useCallback(
    (options: ExportOptions = {}) => {
      // 动态导入 xlsx 库，避免增加首屏体积
      import('xlsx').then(async (XLSX) => {
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

        if (exportData.length > maxClientExportRows) {
          toast.warning(
            t('query.export.largeDataWarning', { rowCount: exportData.length.toLocaleString() })
          );
        }

        try {
          // 准备数据：手动构建数组以控制列顺序
          const sheetData: unknown[][] = [];

          // 表头
          if (includeHeader) {
            sheetData.push(columns);
          }

          // 数据行
          exportData.forEach(row => {
            const rowArray = columns.map(col => {
              const val = row[col];
              // 尝试保持原始类型，让 Excel 自己处理格式
              // 对于日期字符串，尝试解析为 Date 对象以便 Excel 正确格式化
              if (typeof val === 'string') {
                // 匹配 YYYY-MM-DD HH:MM:SS.mmm
                if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(val)) {
                  // 保持字符串，让 Excel 自动识别，或者转换为 Date
                  return val;
                }
              }
              return val;
            });
            sheetData.push(rowArray);
          });

          // 创建工作簿
          const wb = XLSX.utils.book_new();
          const ws = XLSX.utils.aoa_to_sheet(sheetData);

          // 添加工作表
          XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

          // 导出文件:桌面走原生存盘对话框 + fs 直写(可选目录),Web 走 XLSX 内置下载
          if (isTauri()) {
            const target = await pickSavePath(`${filename}.xlsx`);
            if (!target) return; // 用户取消存盘对话框
            const bytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
            await writeBytesToPath(target, new Uint8Array(bytes));
            showSavedToToast(t, target);
          } else {
            XLSX.writeFile(wb, `${filename}.xlsx`);
            showSuccessToast(t, 'EXPORT_SUCCESS', t('query.export.success', { rowCount: exportData.length.toLocaleString() }));
          }
        } catch (error) {
          console.error('Excel 导出失败:', error);
          showErrorToast(t, 'EXPORT_FAILED', t('query.export.failed'));
        }
      }).catch(err => {
        console.error('Failed to load xlsx library:', err);
        showErrorToast(t, 'EXPORT_FAILED', 'Failed to load Excel export library');
      });
    },
    [columns, getExportData, maxClientExportRows, t]
  );

  // 导出 JSON
  const exportJSON = useCallback(
    async (options: ExportOptions = {}) => {
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
        const delivered = await deliverTextFile(
          content,
          `${filename}.json`,
          'application/json',
          false
        );
        if (!delivered) return; // 用户取消存盘对话框
        if (delivered.path) {
          showSavedToToast(t, delivered.path);
        } else {
          showSuccessToast(t, 'EXPORT_SUCCESS', t('query.export.success', { rowCount: exportData.length.toLocaleString() }));
        }
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

  return {
    exportCSV,
    exportJSON,
    exportExcel,
    canExportSelected,
    previewRowCount: data.length,
    exceedsClientLimit: data.length > maxClientExportRows,
    getExportData,
    downloadFile,
  };
}
