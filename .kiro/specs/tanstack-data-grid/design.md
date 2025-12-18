# Design Document

## Overview

本设计文档描述基于 TanStack Table + @tanstack/react-virtual 的新数据网格组件架构。该组件将完全在 `frontend/src/new/` 目录下实现，使用 shadcn/ui + Tailwind CSS，不依赖 AG Grid 或旧 UI 组件。

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      DataGrid (主组件)                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ GridHeader  │  │ GridBody    │  │ GridFooter          │  │
│  │ (列头)      │  │ (虚拟滚动)  │  │ (统计信息)          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                        Hooks Layer                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │useDataGrid   │ │useCellSelect │ │useColumnFilter       │ │
│  │(TanStack)    │ │(选区管理)    │ │(筛选逻辑)            │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │useGridCopy   │ │useGridStats  │ │useVirtualScroll      │ │
│  │(复制功能)    │ │(统计信息)    │ │(虚拟滚动)            │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. DataGrid 主组件

```typescript
// frontend/src/new/Query/DataGrid/DataGrid.tsx

interface DataGridProps {
  /** 行数据 */
  data: Record<string, unknown>[];
  /** 列定义（可选，自动推断） */
  columns?: ColumnDef[];
  /** 是否加载中 */
  loading?: boolean;
  /** 空状态文本 */
  emptyText?: string;
  /** 行高 */
  rowHeight?: number;
  /** 是否启用选区 */
  enableSelection?: boolean;
  /** 是否启用筛选 */
  enableFiltering?: boolean;
  /** 是否启用排序 */
  enableSorting?: boolean;
  /** 选区变化回调 */
  onSelectionChange?: (selection: CellSelection | null) => void;
  /** 筛选变化回调 */
  onFilterChange?: (filters: ColumnFiltersState) => void;
  /** 自定义类名 */
  className?: string;
}
```

### 2. 单元格选区 Hook（单矩形模型）

```typescript
// frontend/src/new/Query/DataGrid/hooks/useCellSelection.ts

interface CellPosition {
  rowIndex: number;
  colIndex: number;
}

interface CellSelection {
  /** 选区锚点位置（起始点，不随拖拽改变） */
  anchor: CellPosition;
  /** 选区结束位置（随拖拽/Shift+Click 改变） */
  end: CellPosition;
  /** 当前焦点位置 */
  focus: CellPosition;
  /** 是否全选（Ctrl+A 时为 true，避免枚举 10 万行） */
  all?: boolean;
}

/**
 * 索引语义说明（重要！）：
 * 
 * 1. rowIndex/colIndex 基于**当前可见视图**（filtered + sorted 后的索引），而非原始数据索引
 *    - 例如：原始数据 100 行，筛选后剩 30 行，选区 rowIndex 范围是 [0, 29]
 * 
 * 2. 获取原始数据的方式：
 *    - 通过 table.getRowModel().rows[rowIndex].original 获取原始行数据
 *    - 通过 table.getVisibleLeafColumns()[colIndex].id 获取列字段名
 * 
 * 3. colIndex 语义（列隐藏/重排/虚拟化场景）：
 *    - colIndex 基于 table.getVisibleLeafColumns() 返回的**当前可见列顺序**
 *    - 列隐藏后：隐藏列不参与 colIndex 计数，选区自动跳过隐藏列
 *    - 列重排后：colIndex 跟随新顺序，选区保持视觉一致性
 *    - 列虚拟化时：colIndex 仍基于完整可见列数组，虚拟化只影响渲染范围
 * 
 * 4. 数据更新时的选区处理：
 *    - 筛选/排序变化后，需重新验证选区有效性
 *    - 若 anchor/end 超出新数据范围，自动收缩到有效范围
 *    - 若选区完全无效（如筛选后 0 行），则清除选区
 * 
 * 5. 滚动位置保持：
 *    - 数据更新后尽量保持当前滚动位置
 *    - 若当前滚动位置超出新数据范围，滚动到末尾
 */

interface UseCellSelectionReturn {
  /** 当前选区 */
  selection: CellSelection | null;
  /** 是否正在选择 */
  isSelecting: boolean;
  /** 开始选择 */
  startSelection: (pos: CellPosition) => void;
  /** 扩展选区 */
  extendSelection: (pos: CellPosition) => void;
  /** 结束选择 */
  endSelection: () => void;
  /** 清除选区 */
  clearSelection: () => void;
  /** 判断单元格是否选中 */
  isCellSelected: (rowIndex: number, colIndex: number) => boolean;
  /** 获取选区范围 */
  getSelectionRange: () => { minRow: number; maxRow: number; minCol: number; maxCol: number } | null;
  /** 移动焦点 */
  moveFocus: (direction: 'up' | 'down' | 'left' | 'right') => void;
}
```

### 3. 复制功能 Hook

```typescript
// frontend/src/new/Query/DataGrid/hooks/useGridCopy.ts

type CopyFormat = 'tsv' | 'csv' | 'json';

/** 大数据复制安全阈值 */
const COPY_CELL_LIMIT = 200_000;

interface UseGridCopyOptions {
  /** 数据 */
  data: Record<string, unknown>[];
  /** 列定义 */
  columns: string[];
  /** 当前选区 */
  selection: CellSelection | null;
  /** 确认大数据复制的回调（返回 true 继续，false 取消） */
  onConfirmLargeCopy?: (cellCount: number) => Promise<boolean>;
}

interface UseGridCopyReturn {
  /** 复制选区数据（超过阈值时会触发 onConfirmLargeCopy） */
  copySelection: (format?: CopyFormat) => Promise<void>;
  /** 复制整列 */
  copyColumn: (colIndex: number) => Promise<void>;
  /** 复制列名 */
  copyColumnName: (colIndex: number) => Promise<void>;
  /** 当前选区单元格数量 */
  selectionCellCount: number;
  /** 是否超过安全阈值 */
  isOverLimit: boolean;
}
```

### 4. 列筛选 Hook

```typescript
// frontend/src/new/Query/DataGrid/hooks/useColumnFilter.ts

interface ColumnFilterValue {
  /** 选中的值 */
  selectedValues: Set<string>;
  /** 筛选模式：包含/排除 */
  mode: 'include' | 'exclude';
}

interface UseColumnFilterOptions {
  /** 数据 */
  data: Record<string, unknown>[];
  /** 列名 */
  column: string;
}

/**
 * 高基数列筛选策略说明：
 * 
 * 1. Top 100 排序规则：
 *    - 主排序：按出现次数 desc（高频值优先）
 *    - 次排序：次数相同时按字典序 asc（便于用户查找）
 * 
 * 2. 条件过滤作用范围：
 *    - 条件过滤（contains/equals/startsWith/endsWith）作用于**全量数据**
 *    - 不是仅过滤 Top 100 列表，而是对整个数据集进行筛选
 *    - 这确保用户即使选择了不在 Top 100 中的值，筛选结果也是准确的
 * 
 * 3. 高基数列筛选流程：
 *    - 用户打开筛选菜单 → 显示 Top 100 + 条件过滤输入框
 *    - 用户可以勾选 Top 100 中的值，或输入条件过滤
 *    - 点击"应用"按钮后，对全量数据执行筛选
 */

interface UseColumnFilterReturn {
  /** 唯一值列表（低基数：全部；高基数：Top 100） */
  uniqueValues: Array<{ value: unknown; label: string; count: number }>;
  /** 是否为高基数列 */
  isHighCardinality: boolean;
  /** 当前筛选值 */
  filterValue: ColumnFilterValue | null;
  /** 条件过滤类型 */
  type ConditionFilterType = 'contains' | 'equals' | 'startsWith' | 'endsWith';
  /** 条件过滤（高基数列） */
  conditionFilter: { type: ConditionFilterType; value: string } | null;
  /** 设置筛选 */
  setFilter: (value: ColumnFilterValue | null) => void;
  /** 设置条件过滤（类型必须为 ConditionFilterType） */
  setConditionFilter: (condition: { type: ConditionFilterType; value: string } | null) => void;
  /** 切换值选中状态 */
  toggleValue: (value: string) => void;
  /** 全选 */
  selectAll: () => void;
  /** 清空 */
  clearAll: () => void;
  /** 反选 */
  invertSelection: () => void;
  /** 是否有活跃筛选 */
  hasActiveFilter: boolean;
}
```

### 5. 虚拟滚动 Hook（行列双向）

```typescript
// frontend/src/new/Query/DataGrid/hooks/useVirtualScroll.ts

interface UseVirtualScrollOptions {
  /** 总行数 */
  rowCount: number;
  /** 总列数 */
  columnCount: number;
  /** 行高 */
  rowHeight: number;
  /** 列宽（可以是固定值或函数） */
  columnWidth: number | ((index: number) => number);
  /** 容器高度 */
  containerHeight: number;
  /** 容器宽度 */
  containerWidth: number;
  /** 行预渲染数 */
  rowOverscan?: number;
  /** 列预渲染数（列数 > 50 时启用） */
  columnOverscan?: number;
  /** 是否启用列虚拟化 */
  enableColumnVirtualization?: boolean;
}

interface UseVirtualScrollReturn {
  /** 行虚拟化实例 */
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  /** 列虚拟化实例（可选） */
  columnVirtualizer: Virtualizer<HTMLDivElement, Element> | null;
  /** 可见行 */
  virtualRows: VirtualItem[];
  /** 可见列 */
  virtualColumns: VirtualItem[];
  /** 总高度 */
  totalHeight: number;
  /** 总宽度 */
  totalWidth: number;
  /** 滚动到指定行 */
  scrollToRow: (index: number) => void;
  /** 滚动到指定列 */
  scrollToColumn: (index: number) => void;
  /** 同步列头滚动 */
  syncHeaderScroll: (scrollLeft: number) => void;
}
```

## Data Models

### 列定义

```typescript
interface ColumnDef {
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
```

### 网格状态

```typescript
interface GridState {
  /** 排序状态 */
  sorting: SortingState;
  /** 筛选状态 */
  columnFilters: ColumnFiltersState;
  /** 列宽状态 */
  columnSizing: ColumnSizingState;
  /** 选区状态 */
  selection: CellSelection | null;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: 选区矩形一致性
*For any* 选区操作（拖拽或 Shift+Click），选区范围应始终是一个矩形区域，由 anchor 和 end 两点确定的边界框。Ctrl+Click 会重置 anchor 而非添加离散单元格。
**Validates: Requirements 2.2, 2.3, 2.4**

### Property 2: 复制数据完整性
*For any* 选区复制操作，复制的数据行数应等于 `|endRow - startRow| + 1`，列数应等于 `|endCol - startCol| + 1`
**Validates: Requirements 3.1, 3.2**

### Property 3: 筛选结果一致性
*For any* 列筛选操作，筛选后的数据应只包含选中值（include 模式）或排除选中值（exclude 模式）
**Validates: Requirements 4.4**

### Property 4: 虚拟滚动渲染正确性
*For any* 滚动位置，渲染的行应覆盖可视区域，且行索引连续无重复
**Validates: Requirements 6.2**

### Property 5: 键盘导航边界
*For any* 键盘导航操作，焦点位置应始终在有效范围内（0 ≤ row < rowCount, 0 ≤ col < colCount）
**Validates: Requirements 8.2, 8.3**

### Property 6: TSV/CSV 转义正确性
*For any* 包含特殊字符的数据，复制后再解析应得到原始数据（往返一致性）
**Validates: Requirements 3.4**

## Error Handling

### 数据错误
- 空数据：显示空状态提示
- 数据格式错误：尝试自动修复，无法修复时显示错误提示
- 列定义缺失：自动从数据推断列定义

### 交互错误
- 复制失败：显示 Toast 错误提示，提供手动复制选项
- 筛选计算超时：显示加载指示器，支持取消操作

### 性能问题
- 大数据量：自动启用虚拟滚动
- 筛选计算慢：使用 Web Worker 或 requestIdleCallback

## Testing Strategy

### 单元测试
- 使用 Vitest 测试所有 hooks
- 测试选区计算逻辑
- 测试复制格式化逻辑
- 测试筛选逻辑

### 属性测试
- 使用 fast-check 进行属性测试
- 测试选区矩形一致性
- 测试复制数据完整性
- 测试 TSV/CSV 转义正确性

### 集成测试
- 测试组件渲染
- 测试键盘交互
- 测试鼠标交互

## File Structure

```
frontend/src/new/Query/DataGrid/
├── DataGrid.tsx                 # 主组件
├── index.ts                     # 导出
├── components/
│   ├── GridHeader.tsx           # 列头组件
│   ├── GridBody.tsx             # 表格主体（虚拟滚动）
│   ├── GridFooter.tsx           # 底部统计
│   ├── GridCell.tsx             # 单元格组件
│   ├── GridRow.tsx              # 行组件
│   ├── ColumnHeader.tsx         # 列头单元格
│   ├── FilterMenu.tsx           # 筛选菜单
│   ├── ContextMenu.tsx          # 右键菜单
│   └── SelectionOverlay.tsx     # 选区覆盖层
├── hooks/
│   ├── index.ts                 # 导出
│   ├── useDataGrid.ts           # TanStack Table 封装
│   ├── useCellSelection.ts      # 选区管理
│   ├── useGridCopy.ts           # 复制功能
│   ├── useColumnFilter.ts       # 列筛选
│   ├── useVirtualScroll.ts      # 虚拟滚动
│   ├── useGridStats.ts          # 统计信息
│   ├── useColumnResize.ts       # 列宽调整
│   └── useKeyboardNavigation.ts # 键盘导航
├── utils/
│   ├── formatters.ts            # 数据格式化
│   ├── clipboard.ts             # 剪贴板操作
│   ├── columnTypes.ts           # 列类型检测
│   └── selection.ts             # 选区计算
└── __tests__/
    ├── useCellSelection.test.ts
    ├── useGridCopy.test.ts
    ├── useColumnFilter.test.ts
    ├── clipboard.test.ts
    └── selection.test.ts
```

## Dependencies

### 新增依赖
```json
{
  "@tanstack/react-table": "^8.x",
  "@tanstack/react-virtual": "^3.x"
}
```

注意：当前项目已安装这些依赖，无需重复安装。

### 现有依赖（复用）
- React 19.x（当前项目版本）
- TypeScript
- Tailwind CSS
- shadcn/ui 组件
- lucide-react 图标
- sonner (Toast)
- react-i18next（国际化）

## i18n Key 策略

新增的 i18n key 统一放在 `dataGrid` 命名空间下：

```json
{
  "dataGrid": {
    "copy": "复制",
    "copyAsTSV": "复制为 TSV",
    "copyAsCSV": "复制为 CSV",
    "copyAsJSON": "复制为 JSON",
    "copyColumnName": "复制列名",
    "filter": "筛选",
    "filterThisValue": "筛选此值",
    "excludeThisValue": "排除此值",
    "clearFilter": "清除筛选",
    "selectAll": "全选",
    "clearAll": "清空",
    "invertSelection": "反选",
    "apply": "应用",
    "cancel": "取消",
    "partialValuesHint": "仅展示部分值",
    "noData": "暂无数据",
    "loading": "加载中...",
    "totalRows": "共 {{count}} 行",
    "filteredRows": "筛选后 {{count}} 行",
    "selectedCells": "已选 {{count}} 个单元格",
    "copied": "已复制到剪贴板",
    "largeCopyWarningTitle": "选区过大",
    "largeCopyWarningMessage": "选区约 {{count}} 万单元格，可能导致浏览器卡顿。建议缩小范围或使用导出功能。",
    "largeCopyConfirm": "继续复制",
    "largeCopyCopying": "正在复制...",
    "conditionContains": "包含",
    "conditionEquals": "等于",
    "conditionStartsWith": "开头是",
    "conditionEndsWith": "结尾是"
  }
}
```

## Migration Plan

1. **Phase 1**: 实现核心组件和 hooks（不替换现有组件）
2. **Phase 2**: 在新页面中使用新组件进行测试
3. **Phase 3**: 逐步替换现有 AG Grid 使用
4. **Phase 4**: 移除 AG Grid 依赖
