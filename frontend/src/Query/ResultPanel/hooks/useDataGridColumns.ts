/**
 * 根据查询结果自动生成 TanStack DataGrid 列定义
 */

import React, { useMemo } from 'react';
import type { ColumnDef } from '../../DataGrid/types';
import {
  columnMostlyHttpUrls,
  createUrlCellRenderer,
} from '../../DataGrid/utils/urlCell';
import {
  columnMostlyJson,
  createJsonCellRenderer,
} from '../../DataGrid/utils/jsonCell';
import { useColumnTypeDetection, type ColumnType } from './useColumnTypeDetection';
import type { DuckdbColumnType } from '@/types/queryWorkspace';
import { isNumericType, isVariantType } from '@/utils/duckdbTypes';

export interface UseDataGridColumnsOptions {
  data: Record<string, unknown>[] | null;
  /** 后端返回的列顺序；未提供时从首行对象键推断 */
  fieldOrder?: string[] | null;
  /** DuckDB DESCRIBE 列类型（含 VARIANT） */
  duckdbColumnTypes?: DuckdbColumnType[];
  sampleSize?: number;
  columnOverrides?: Record<string, Partial<ColumnDef>>;
  enableFilters?: boolean;
  enableSorting?: boolean;
}

export interface UseDataGridColumnsReturn {
  columns: ColumnDef[];
}

function formatNumberValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  const raw = String(value);
  const normalized = raw.replace(/,/g, '').trim();

  if (/^-?\d+$/.test(normalized)) {
    return normalized;
  }

  // DECIMAL 列以精确十进制字符串返回（如 '-0.30'、19 位小数）：原样展示，
  // 不走 parseFloat（float64 只有 ~16 位有效数字，且会吞掉标度尾零）
  if (typeof value === 'string' && /^-?\d+\.\d+$/.test(normalized)) {
    return normalized;
  }

  const num = typeof value === 'number' ? value : parseFloat(normalized);
  if (isNaN(num)) {
    return raw;
  }

  return new Intl.NumberFormat('zh-CN', {
    useGrouping: false,
    maximumFractionDigits: 6,
  }).format(num);
}

function formatDateValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  return String(value);
}

// DuckDB 数值/VARIANT 判定统一走 utils/duckdbTypes(别名先归一)。
// 以服务端类型为准强制按数值列处理(右对齐格式化 + 精确数值排序):
// DECIMAL / 超安全整数的 BIGINT 在 JSON 里是字符串,仅靠值采样会误判为字符串列。


function booleanCellRenderer(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return React.createElement('span', { className: 'text-muted-foreground' }, 'NULL');
  }

  const boolValue =
    typeof value === 'boolean'
      ? value
      : ['true', 'yes', '1', 't', 'y', '是'].includes(String(value).toLowerCase());

  return React.createElement('span', null, boolValue ? '✓' : '✗');
}

export function useDataGridColumns({
  data,
  fieldOrder,
  duckdbColumnTypes,
  sampleSize = 100,
  columnOverrides = {},
  enableFilters = true,
  enableSorting = true,
}: UseDataGridColumnsOptions): UseDataGridColumnsReturn {
  const { detectColumnTypes } = useColumnTypeDetection();

  const schemaKey = useMemo(() => {
    if (!data?.length) return '';
    return Object.keys(data[0]).slice().sort().join('|');
  }, [data]);

  const columnTypesRaw = useMemo(() => {
    if (!data?.length) return {};
    return detectColumnTypes(data, sampleSize);
  }, [data, sampleSize, detectColumnTypes]);

  const duckdbTypeByField = useMemo(() => {
    const map: Record<string, string> = {};
    for (const entry of duckdbColumnTypes ?? []) {
      if (entry.name) {
        map[entry.name] = entry.duckdb_type;
      }
    }
    return map;
  }, [duckdbColumnTypes]);

  const duckdbTypesKey = useMemo(
    () =>
      Object.keys(duckdbTypeByField)
        .sort()
        .map((k) => `${k}:${duckdbTypeByField[k]}`)
        .join('\u0002'),
    [duckdbTypeByField]
  );

  const columnTypesKey = useMemo(
    () =>
      Object.keys(columnTypesRaw)
        .sort()
        .map((k) => {
          const t = columnTypesRaw[k];
          if (!t) return `${k}:string:0`;
          return `${k}:${t.type}:${t.nullable ? 1 : 0}`;
        })
        .join('\u0001'),
    [columnTypesRaw]
  );

  const fields = useMemo((): string[] => {
    if (!data?.length) return [];
    const rowKeys = Object.keys(data[0]);
    if (fieldOrder?.length) {
      const ordered = fieldOrder.filter((f) => rowKeys.includes(f));
      const rest = rowKeys.filter((k) => !ordered.includes(k));
      return [...ordered, ...rest];
    }
    return rowKeys;
  }, [data, fieldOrder]);

  const columns = useMemo((): ColumnDef[] => {
    if (!data?.length) return [];

    return fields.map((field) => {
      const typeInfo = columnTypesRaw[field];
      const duckdbType = duckdbTypeByField[field];
      const isVariantCol = duckdbType ? isVariantType(duckdbType) : false;
      const duckdbNumeric = duckdbType ? isNumericType(duckdbType) : false;
      const type: ColumnType = duckdbNumeric ? 'number' : typeInfo?.type || 'string';
      const override = columnOverrides[field] || {};

      const col: ColumnDef = {
        field,
        headerName: field,
        width: 120,
        sortable: enableSorting,
        filterable: enableFilters,
        resizable: true,
        type,
        ...override,
      };

      if (isVariantCol) {
        // VARIANT 列：用 JSON cellRenderer（支持点击查看器）
        col.width = 200;
        col.cellRenderer = createJsonCellRenderer();
      } else {
        switch (type) {
          case 'number':
            col.valueFormatter = formatNumberValue;
            break;
          case 'date':
            col.valueFormatter = formatDateValue;
            break;
          case 'boolean':
            col.cellRenderer = ({ value }) => booleanCellRenderer(value);
            break;
          default:
            if (columnMostlyHttpUrls(data, field, sampleSize)) {
              col.cellRenderer = createUrlCellRenderer();
            } else if (columnMostlyJson(data, field, sampleSize)) {
              // 字符串列中含 JSON：用 JSON cellRenderer
              col.cellRenderer = createJsonCellRenderer();
            } else if (typeInfo?.nullable) {
              col.valueFormatter = (value) =>
                value === null || value === undefined ? 'NULL' : String(value);
            }
            break;
        }
      }

      return col;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- schemaKey/columnTypesKey 指纹
  }, [fields, schemaKey, columnTypesKey, duckdbTypesKey, columnOverrides, enableFilters, enableSorting]);

  return { columns };
}

export default useDataGridColumns;
