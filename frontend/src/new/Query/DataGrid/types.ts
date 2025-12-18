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
  /** 选中的值 */
  selectedValues: Set<string>;
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
