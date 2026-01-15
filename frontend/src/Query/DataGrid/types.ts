/**
 * DataGrid 类型定义
 */

// ============ 单元格位置和选区 ============

export interface CellPosition {
  rowIndex: number;
  colIndex: number;
}

export interface CellSelection {
  /** 选区锚点位置（起始点，不随拖拽改变） */
  anchor: CellPosition;
  /** 选区结束位置（随拖拽/Shift+Click 改变） */
  end: CellPosition;
  /** 当前焦点位置 */
  focus: CellPosition;
  /** 是否全选（Ctrl+A 时为 true，避免枚举 10 万行） */
  all?: boolean;
}

export interface SelectionRange {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

// ============ 复制功能 ============

export type CopyFormat = 'tsv' | 'csv' | 'json';

/** 大数据复制安全阈值 */
export const COPY_CELL_LIMIT = 200_000;

// ============ 列筛选 ============

export type ConditionFilterType = 'contains' | 'equals' | 'startsWith' | 'endsWith';

export interface ConditionFilter {
  type: ConditionFilterType;
  value: string;
}

export interface ColumnFilterValue {
  /** 选中的值（可以是 Set 或数组） */
  selectedValues: Set<string> | string[];
  /** 筛选模式：包含/排除 */
  mode: 'include' | 'exclude';
}

/** ValueFilter 类型别名（用于 useDataGrid 的 filterFn） */
export type ValueFilter = ColumnFilterValue;

export interface UniqueValueItem {
  value: unknown;
  label: string;
  count: number;
}

// ============ 辅助函数 ============

/**
 * 获取 selectedValues 的长度（兼容 Set 和 Array）
 */
export function getSelectedValuesSize(values: Set<string> | string[] | undefined | null): number {
  if (!values) return 0;
  if (values instanceof Set) return values.size;
  if (Array.isArray(values)) return values.length;
  return 0;
}

/**
 * 检查值是否被选中（兼容 Set 和 Array）
 */
export function hasSelectedValue(values: Set<string> | string[] | undefined | null, value: string): boolean {
  if (!values) return false;
  if (values instanceof Set) return values.has(value);
  if (Array.isArray(values)) return values.includes(value);
  return false;
}

/**
 * 将 selectedValues 转换为 Set（兼容 Set 和 Array）
 */
export function toSelectedValuesSet(values: Set<string> | string[] | undefined | null): Set<string> {
  if (!values) return new Set();
  if (values instanceof Set) return values;
  if (Array.isArray(values)) return new Set(values);
  return new Set();
}

// ============ 列定义 ============

export interface CellRendererProps {
  value: unknown;
  row: Record<string, unknown>;
  column: ColumnDef;
  rowIndex: number;
  colIndex: number;
}

export interface ColumnDef {
  /** 字段名 */
  field: string;
  /** 显示名称 */
  headerName?: string;
  /** 列宽 */
  width?: number;
  /** 最小宽度 */
  minWidth?: number;
  /** 最大宽度 */
  maxWidth?: number;
  /** 是否可排序 */
  sortable?: boolean;
  /** 是否可筛选 */
  filterable?: boolean;
  /** 是否可调整宽度 */
  resizable?: boolean;
  /** 数据类型 */
  type?: 'string' | 'number' | 'date' | 'boolean';
  /** 自定义格式化 */
  valueFormatter?: (value: unknown) => string;
  /** 自定义渲染 */
  cellRenderer?: (props: CellRendererProps) => React.ReactNode;
}

// ============ 网格状态 ============

export interface GridStats {
  totalRows: number;
  filteredRows: number;
  selectedCells: number;
  sum?: number;
  average?: number;
}

// ============ DataGrid 配置常量 ============

/**
 * DataGrid 全局配置
 * 集中管理所有硬编码值，与 tailwind.css 中的 CSS 变量对应
 */
export const DATAGRID_CONFIG = {
  // === 尺寸（对应 tailwind.css 中的 --dg-* 变量） ===
  rowHeight: 32,              // --dg-row-height
  headerHeight: 36,           // --dg-header-height
  minColumnWidth: 80,         // 最小列宽
  maxColumnWidth: 600,        // 最大列宽
  defaultColumnWidth: 120,    // 默认列宽

  // === 自动列宽采样 ===
  autoSize: {
    samplingRatio: 3,         // 每种长度取几个样本（Handsontable 风格）
    maxSamples: 200,          // 最大采样数
    headerIconWidth: 56,      // 列头图标占用宽度（排序 + 筛选）
  },

  // === 虚拟化 ===
  virtualization: {
    rowOverscan: 5,           // 行预渲染数
    columnOverscan: 3,        // 列预渲染数
    columnThreshold: 50,      // 列虚拟化阈值（超过此数启用）
  },

  // === 筛选 ===
  filter: {
    highCardinalityThreshold: 1000,  // 高基数列阈值
    topN: 100,                        // Top N 显示数量
  },

  // === 默认样式（fallback，优先从 DOM 读取） ===
  defaultStyle: {
    font: '13px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    cellPaddingX: 24,         // 单元格左右 padding (12px * 2)
  },
} as const;

/**
 * 从 DOM 元素获取实际渲染样式
 * 用于精确测量列宽，避免硬编码与 CSS 不同步
 * 
 * @param element - DataGrid 容器或单元格元素
 * @returns 实际的字体和 padding 值
 */
export function getGridCellStyle(element?: Element | null): {
  font: string;
  paddingX: number;
} {
  // SSR 或无元素时使用默认值
  if (typeof window === 'undefined' || !element) {
    return {
      font: DATAGRID_CONFIG.defaultStyle.font,
      paddingX: DATAGRID_CONFIG.defaultStyle.cellPaddingX,
    };
  }

  // 尝试找到实际的单元格元素
  const cellEl = element.classList.contains('dq-data-grid-cell')
    ? element
    : element.querySelector('.dq-data-grid-cell');

  if (!cellEl) {
    return {
      font: DATAGRID_CONFIG.defaultStyle.font,
      paddingX: DATAGRID_CONFIG.defaultStyle.cellPaddingX,
    };
  }

  const style = getComputedStyle(cellEl);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;

  return {
    font: `${style.fontSize} ${style.fontFamily}`,
    paddingX: paddingLeft + paddingRight || DATAGRID_CONFIG.defaultStyle.cellPaddingX,
  };
}

/**
 * 智能采样函数（Handsontable 风格）
 * 按字符串长度分组采样，确保覆盖不同长度的值
 * 
 * @param data - 行数据数组
 * @param field - 列字段名
 * @returns 采样后的字符串数组
 */
export function smartSampleColumn(
  data: Record<string, unknown>[],
  field: string
): string[] {
  const { samplingRatio, maxSamples } = DATAGRID_CONFIG.autoSize;
  const lengthGroups = new Map<number, Set<string>>();
  let totalSamples = 0;

  for (const row of data) {
    const value = row[field];
    const strValue = value === null || value === undefined ? '' : String(value);
    const len = strValue.length;

    if (!lengthGroups.has(len)) {
      lengthGroups.set(len, new Set());
    }

    const group = lengthGroups.get(len)!;
    if (group.size < samplingRatio) {
      group.add(strValue);
      totalSamples++;
    }

    // 提前退出：已采集足够样本
    if (totalSamples >= maxSamples) break;
  }

  // 合并所有分组的样本
  return Array.from(lengthGroups.values()).flatMap(set => Array.from(set));
}
