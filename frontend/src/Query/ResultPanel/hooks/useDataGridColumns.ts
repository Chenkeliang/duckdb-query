/**
 * 根据查询结果自动生成 TanStack DataGrid 列定义
 */

import React, { useMemo } from 'react';
import type { ColumnDef } from '../../DataGrid/types';
import { useColumnTypeDetection, type ColumnType } from './useColumnTypeDetection';

export interface UseDataGridColumnsOptions {
  data: Record<string, unknown>[] | null;
  /** 后端返回的列顺序；未提供时从首行对象键推断 */
  fieldOrder?: string[] | null;
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

  const date = new Date(value as string | number | Date);
  if (isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

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
      const type: ColumnType = typeInfo?.type || 'string';
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
          if (typeInfo?.nullable) {
            col.valueFormatter = (value) =>
              value === null || value === undefined ? 'NULL' : String(value);
          }
          break;
      }

      return col;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- schemaKey/columnTypesKey 指纹
  }, [fields, schemaKey, columnTypesKey, columnOverrides, enableFilters, enableSorting]);

  return { columns };
}

export default useDataGridColumns;
