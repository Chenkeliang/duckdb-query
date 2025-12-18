/**
 * AG-Grid 配置 Hook
 * 基于数据自动生成列定义
 */

import { useMemo } from 'react';
import type { ColDef, ValueFormatterParams, ICellRendererParams } from 'ag-grid-community';
import { useColumnTypeDetection, type ColumnTypeMap, type ColumnType } from './useColumnTypeDetection';
import { CustomHeaderComponent } from '../CustomHeaderComponent';

export interface UseAGGridConfigOptions {
  /** 数据数组 */
  data: Record<string, unknown>[] | null;
  /** 采样大小（用于类型检测） */
  sampleSize?: number;
  /** 自定义列配置 */
  columnOverrides?: Record<string, Partial<ColDef>>;
  /** 是否启用过滤器 */
  enableFilters?: boolean;
  /** 是否启用排序 */
  enableSorting?: boolean;
}

export interface UseAGGridConfigReturn {
  /** 列定义 */
  columnDefs: ColDef[];
  /** 列类型信息 */
  columnTypes: ColumnTypeMap;
  /** 是否正在加载 */
  loading: boolean;
}

/**
 * 根据列类型获取过滤器类型
 * 注意：agSetColumnFilter 需要 Enterprise 模块，Community 版本使用 agTextColumnFilter
 */
function getFilterType(type: ColumnType): string {
  switch (type) {
    case 'number':
      return 'agNumberColumnFilter';
    case 'date':
      return 'agDateColumnFilter';
    case 'boolean':
      // Community 版本不支持 agSetColumnFilter，使用 agTextColumnFilter
      return 'agTextColumnFilter';
    default:
      return 'agTextColumnFilter';
  }
}

/**
 * 数值格式化器
 */
function numberFormatter(params: ValueFormatterParams): string {
  if (params.value === null || params.value === undefined) {
    return 'NULL';
  }

  const raw = String(params.value);
  const normalized = raw.replace(/,/g, '').trim();

  // 整数/编号类字段：不要做千分位格式化，直接显示原始数字文本
  // 这样可以避免把单号/ID 展示成 "1,234,567" 这种不期望的格式
  if (/^-?\d+$/.test(normalized)) {
    return normalized;
  }

  const num =
    typeof params.value === 'number' ? params.value : parseFloat(normalized);

  if (isNaN(num)) {
    return raw;
  }

  // 小数：使用本地化格式，但禁用千分位分组（useGrouping=false）
  return new Intl.NumberFormat('zh-CN', {
    useGrouping: false,
    maximumFractionDigits: 6,
  }).format(num);
}

/**
 * 日期格式化器
 */
function dateFormatter(params: ValueFormatterParams): string {
  if (params.value === null || params.value === undefined) {
    return 'NULL';
  }
  
  const date = new Date(params.value);
  
  if (isNaN(date.getTime())) {
    return String(params.value);
  }
  
  // 使用本地化日期格式
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

/**
 * 布尔值渲染器 - 使用 AG Grid 内置类名避免硬编码颜色
 */
function booleanRenderer(params: ICellRendererParams): string {
  if (params.value === null || params.value === undefined) {
    return '<span class="ag-cell-null">NULL</span>';
  }
  
  const boolValue = typeof params.value === 'boolean'
    ? params.value
    : ['true', 'yes', '1', 't', 'y', '是'].includes(String(params.value).toLowerCase());
  
  // 使用 AG Grid 内置类名，避免 inline style 和硬编码颜色
  return boolValue 
    ? '<span class="ag-icon ag-icon-tick"></span>'
    : '<span class="ag-icon ag-icon-cross"></span>';
}

/**
 * 数值比较器（用于排序）
 */
function numberComparator(valueA: unknown, valueB: unknown): number {
  const numA = typeof valueA === 'number' 
    ? valueA 
    : parseFloat(String(valueA || '').replace(/,/g, ''));
  const numB = typeof valueB === 'number' 
    ? valueB 
    : parseFloat(String(valueB || '').replace(/,/g, ''));
  
  if (isNaN(numA) && isNaN(numB)) return 0;
  if (isNaN(numA)) return 1;
  if (isNaN(numB)) return -1;
  
  return numA - numB;
}

/**
 * 日期比较器（用于排序）
 */
function dateComparator(valueA: unknown, valueB: unknown): number {
  const dateA = new Date(valueA as string);
  const dateB = new Date(valueB as string);
  
  const timeA = dateA.getTime();
  const timeB = dateB.getTime();
  
  if (isNaN(timeA) && isNaN(timeB)) return 0;
  if (isNaN(timeA)) return 1;
  if (isNaN(timeB)) return -1;
  
  return timeA - timeB;
}

/**
 * AG-Grid 配置 Hook
 */
export const useAGGridConfig = ({
  data,
  sampleSize = 100,
  columnOverrides = {},
  enableFilters = true,
  enableSorting = true,
}: UseAGGridConfigOptions): UseAGGridConfigReturn => {
  const { detectColumnTypes } = useColumnTypeDetection();

  // 检测列类型
  const columnTypes = useMemo(() => {
    if (!data || data.length === 0) {
      return {};
    }
    return detectColumnTypes(data, sampleSize);
  }, [data, sampleSize, detectColumnTypes]);

  // 生成列定义
  const columnDefs = useMemo((): ColDef[] => {
    if (!data || data.length === 0) {
      return [];
    }

    const columns = Object.keys(data[0]);

    return columns.map((field): ColDef => {
      const typeInfo = columnTypes[field];
      const type = typeInfo?.type || 'string';
      const override = columnOverrides[field] || {};

      // 基础列定义
      const colDef: ColDef = {
        field,
        headerName: field,
        sortable: enableSorting,
        filter: enableFilters ? getFilterType(type) : false,
        resizable: true,
        // 使用自定义表头组件（集成筛选功能）
        headerComponent: CustomHeaderComponent,
        // 应用自定义覆盖
        ...override,
      };

      // 根据类型配置格式化器和样式
      switch (type) {
        case 'number':
          colDef.valueFormatter = numberFormatter;
          colDef.comparator = numberComparator;
          colDef.cellClass = 'ag-cell-number';
          colDef.type = 'numericColumn';
          break;

        case 'date':
          colDef.valueFormatter = dateFormatter;
          colDef.comparator = dateComparator;
          break;

        case 'boolean':
          colDef.cellRenderer = booleanRenderer;
          colDef.cellClass = 'ag-cell-boolean';
          // 注意：filterParams.values 是 SetFilter 的配置，Community 版本不支持
          // 使用 agTextColumnFilter，用户可以输入 true/false 进行过滤
          break;

        default:
          // 字符串类型，检查是否有 NULL 值
          if (typeInfo?.nullable) {
            colDef.valueFormatter = (params: ValueFormatterParams) => {
              if (params.value === null || params.value === undefined) {
                return 'NULL';
              }
              return String(params.value);
            };
          }
          break;
      }

      // NULL 值样式规则
      colDef.cellClassRules = {
        'ag-cell-null': (params) => params.value === null || params.value === undefined,
        ...override.cellClassRules,
      };

      return colDef;
    });
  }, [data, columnTypes, columnOverrides, enableFilters, enableSorting]);

  return {
    columnDefs,
    columnTypes,
    loading: false,
  };
};

export default useAGGridConfig;
