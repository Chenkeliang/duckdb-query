---
inclusion: fileMatch
fileMatchPattern: ['frontend/src/Query/DataGrid/**/*.ts', 'frontend/src/Query/DataGrid/**/*.tsx', 'frontend/src/Query/ResultPanel/DataGridWrapper.tsx']
---

# TanStack DataGrid 使用标准

> **最后更新**: 2026-05-23  
> **版本**: 1.1  
> **状态**: ✅ 已验证与代码一致（AG Grid 已移除）

## 🎯 组件概述

TanStack DataGrid 是基于 TanStack Table + `@tanstack/react-virtual` 的查询结果表格，为项目**唯一**结果区网格实现。

### 核心特性

- ✅ **虚拟滚动**: 支持 10 万行 × 200 列流畅滚动
- ✅ **单元格选区**: 飞书式单矩形选区模型
- ✅ **多格式复制**: TSV/CSV/JSON 格式复制
- ✅ **列筛选**: 支持低基数/高基数列自适应筛选
- ✅ **键盘导航**: 完整的键盘快捷键支持
- ✅ **列排序**: 点击列头排序
- ✅ **列宽调整**: 拖拽调整列宽
- ✅ **列可见性**: 隐藏/显示列（会话级别）
- ✅ **数据导出**: 支持 CSV/JSON 格式导出
- ✅ **轻量级**: 无 AG Grid 依赖
- ✅ **类型安全**: 完整的 TypeScript 支持

### 历史说明

AG Grid 已于 **2026-05** 移除；查询结果仅使用本目录下的 TanStack DataGrid（`ResultPanel` → `DataGridWrapper`）。

## 📁 组件结构

```
frontend/src/Query/DataGrid/
├── DataGrid.tsx                    # 主组件
├── README.md                       # 组件文档
├── types.ts                        # 类型定义
├── hooks/                          # 自定义 Hooks
│   ├── useDataGrid.ts              # TanStack Table 封装
│   ├── useCellSelection.ts         # 选区管理
│   ├── useVirtualScroll.ts         # 虚拟滚动
│   ├── useGridCopy.ts              # 复制功能
│   ├── useColumnFilter.ts          # 列筛选
│   ├── useKeyboardNavigation.ts    # 键盘导航
│   ├── useGridStats.ts             # 统计信息
│   ├── useColumnVisibility.ts      # 列可见性管理
│   ├── useGridExport.ts            # 数据导出
│   └── useAutoScroll.ts            # 自动滚动
├── components/                     # 子组件
│   ├── GridHeader.tsx              # 列头容器
│   ├── GridBody.tsx                # 表格主体
│   ├── GridFooter.tsx              # 底部统计
│   ├── GridCell.tsx                # 单元格
│   ├── GridRow.tsx                 # 行
│   ├── ColumnHeader.tsx            # 列头
│   ├── FilterMenu.tsx              # 筛选菜单
│   ├── ContextMenu.tsx             # 右键菜单
│   ├── ColumnMenu.tsx              # 列管理菜单
│   └── SelectionOverlay.tsx        # 选区覆盖层
├── utils/                          # 工具函数
│   ├── clipboard.ts                # 剪贴板操作
│   ├── selection.ts                # 选区计算
│   ├── columnTypes.ts              # 列类型检测
│   ├── formatters.ts               # 值格式化
│   └── index.ts                    # 统一导出
└── examples/                       # 示例
    └── DataGridExample.tsx         # 使用示例
```

## 🔧 基本使用

### 最简示例

```tsx
import { DataGrid } from '@/Query/DataGrid';

function MyComponent() {
  const data = [
    { id: 1, name: 'Alice', age: 25, city: 'Beijing' },
    { id: 2, name: 'Bob', age: 30, city: 'Shanghai' },
    { id: 3, name: 'Charlie', age: 35, city: 'Guangzhou' },
  ];

  return (
    <DataGrid
      data={data}
      height={400}
    />
  );
}
```

### 完整示例

```tsx
import { DataGrid } from '@/Query/DataGrid';
import type { ColumnDef, CellSelection } from '@/Query/DataGrid/types';
import type { ColumnFiltersState, SortingState } from '@tanstack/react-table';

function MyComponent() {
  const data = [
    { id: 1, name: 'Alice', age: 25, city: 'Beijing' },
    { id: 2, name: 'Bob', age: 30, city: 'Shanghai' },
  ];

  // 自定义列定义（可选）
  const columns: ColumnDef[] = [
    {
      field: 'id',
      headerName: 'ID',
      width: 80,
      sortable: true,
      filterable: true,
    },
    {
      field: 'name',
      headerName: '姓名',
      width: 120,
      sortable: true,
      filterable: true,
    },
    {
      field: 'age',
      headerName: '年龄',
      width: 100,
      sortable: true,
      filterable: true,
    },
    {
      field: 'city',
      headerName: '城市',
      width: 120,
      sortable: true,
      filterable: true,
    },
  ];

  const handleSelectionChange = (selection: CellSelection | null) => {
    console.log('选区变化:', selection);
  };

  const handleFilterChange = (filters: ColumnFiltersState) => {
    console.log('筛选变化:', filters);
  };

  const handleSortChange = (sorting: SortingState) => {
    console.log('排序变化:', sorting);
  };

  const handleStatsChange = (stats: {
    totalRows: number;
    filteredRows: number;
    selectedCells: number;
    columnCount: number;
    visibleColumnCount: number;
  }) => {
    console.log('统计信息:', stats);
  };

  return (
    <DataGrid
      data={data}
      columns={columns}
      height={600}
      enableSelection={true}
      enableFiltering={true}
      enableSorting={true}
      onSelectionChange={handleSelectionChange}
      onFilterChange={handleFilterChange}
      onSortChange={handleSortChange}
      onStatsChange={handleStatsChange}
    />
  );
}
```

## 📋 Props 详解

### DataGridProps

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `data` | `Record<string, unknown>[]` | 必填 | 行数据 |
| `columns` | `ColumnDef[]` | 自动推断 | 列定义 |
| `loading` | `boolean` | `false` | 加载状态 |
| `emptyText` | `string` | '暂无数据' | 空状态文本 |
| `rowHeight` | `number` | `32` | 行高（像素） |
| `height` | `number \| string` | `400` | 容器高度 |
| `enableSelection` | `boolean` | `true` | 启用选区 |
| `enableFiltering` | `boolean` | `true` | 启用筛选 |
| `enableSorting` | `boolean` | `true` | 启用排序 |
| `onSelectionChange` | `(selection) => void` | - | 选区变化回调 |
| `onFilterChange` | `(filters) => void` | - | 筛选变化回调 |
| `onSortChange` | `(sorting) => void` | - | 排序变化回调 |
| `onStatsChange` | `(stats) => void` | - | 统计信息变化回调 |
| `hideColumnMenu` | `boolean` | `false` | 隐藏底部列管理菜单 |
| `className` | `string` | - | 自定义类名 |

### ColumnDef

```typescript
interface ColumnDef {
  /** 字段名（必填） */
  field: string;
  /** 列头显示名称 */
  headerName?: string;
  /** 列宽（像素） */
  width?: number;
  /** 最小宽度 */
  minWidth?: number;
  /** 最大宽度 */
  maxWidth?: number;
  /** 是否可排序 */
  sortable?: boolean;
  /** 是否可筛选 */
  filterable?: boolean;
  /** 是否可调整大小 */
  resizable?: boolean;
  /** 列类型（自动检测） */
  type?: 'string' | 'number' | 'boolean' | 'date' | 'time' | 'datetime';
  /** 自定义格式化函数 */
  formatter?: (value: unknown) => string;
}
```

## 🎨 列类型自动检测

DataGrid 会自动检测列类型并应用相应的格式化和筛选：

| 类型 | 检测规则 | 格式化 | 筛选方式 |
|------|----------|--------|----------|
| `number` | 所有值都是数字 | 千分位分隔 | 范围筛选 |
| `boolean` | 所有值都是 true/false | 是/否 | 复选框 |
| `date` | 符合日期格式 | YYYY-MM-DD | 日期选择器 |
| `time` | 符合时间格式 | HH:mm:ss | 时间选择器 |
| `datetime` | 符合日期时间格式 | YYYY-MM-DD HH:mm:ss | 日期时间选择器 |
| `string` | 其他 | 原样显示 | 文本搜索 |

### 自定义列类型

```tsx
const columns: ColumnDef[] = [
  {
    field: 'price',
    headerName: '价格',
    type: 'number',
    formatter: (value) => `¥${Number(value).toFixed(2)}`,
  },
  {
    field: 'status',
    headerName: '状态',
    type: 'string',
    formatter: (value) => {
      const statusMap = {
        active: '活跃',
        inactive: '不活跃',
        pending: '待处理',
      };
      return statusMap[value as string] || value;
    },
  },
];
```

## ⌨️ 键盘快捷键

### 选区操作

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+A` | 全选 |
| `Ctrl+C` | 复制选区（TSV 格式） |
| `Esc` | 清除选区 |
| `↑↓←→` | 移动焦点 |
| `Shift+↑↓←→` | 扩展选区 |

### 导航操作

| 快捷键 | 功能 |
|--------|------|
| `Home` | 移动到行首 |
| `End` | 移动到行尾 |
| `Ctrl+Home` | 移动到表格开始 |
| `Ctrl+End` | 移动到表格结束 |
| `PageUp` | 向上翻页 |
| `PageDown` | 向下翻页 |

### 列操作

| 快捷键 | 功能 |
|--------|------|
| `点击列头` | 排序 |
| `右键列头` | 列菜单 |
| `拖拽列边界` | 调整列宽 |

## 🖱️ 右键菜单

### 单元格右键菜单

- 复制为 TSV
- 复制为 CSV
- 复制为 JSON
- 复制列名
- 筛选此值
- 排除此值
- 清除筛选

### 列头右键菜单

- 排序升序
- 排序降序
- 清除排序
- 筛选
- 隐藏列
- 自动调整列宽
- 重置列宽

## 📊 列筛选

### 低基数列筛选（< 100 个唯一值）

显示复选框列表，支持：
- 全选/取消全选
- 搜索过滤
- 显示值计数

### 高基数列筛选（≥ 100 个唯一值）

显示搜索框，支持：
- 文本搜索
- 包含/不包含
- 等于/不等于
- 开始于/结束于

### 数字列筛选

显示范围输入，支持：
- 最小值/最大值
- 等于/不等于
- 大于/小于
- 介于

## 📤 数据导出

### 使用 useGridExport Hook

```tsx
import { useGridExport } from '@/Query/DataGrid/hooks';

function MyComponent() {
  const { exportCSV, exportJSON } = useGridExport({
    data,
    columns,
    filename: 'my-data',
  });

  return (
    <div>
      <button onClick={exportCSV}>导出 CSV</button>
      <button onClick={exportJSON}>导出 JSON</button>
    </div>
  );
}
```

### 导出特性

- **CSV 导出**:
  - 添加 UTF-8 BOM，确保 Excel 正确识别中文
  - 正确处理特殊字符（逗号、换行、引号）
  - 支持 BigInt 和复杂类型的安全序列化
  
- **JSON 导出**:
  - 格式化输出（缩进 2 空格）
  - 支持所有 JavaScript 类型
  - 保留原始数据结构

## 🔄 列可见性管理

### 会话级别存储

列可见性状态仅在当前会话中保持，不会持久化到 localStorage。这是因为查询结果的列是动态的，每次查询可能返回不同的列。

### 使用 useColumnVisibility Hook

```tsx
import { useColumnVisibility } from '@/Query/DataGrid/hooks';

function MyComponent() {
  const {
    visibleColumns,
    columnVisibilityInfo,
    toggleColumn,
    showAllColumns,
  } = useColumnVisibility({
    columns: ['id', 'name', 'age', 'city'],
    onChange: (visibility) => {
      console.log('列可见性变化:', visibility);
    },
  });

  return (
    <div>
      <button onClick={showAllColumns}>显示所有列</button>
      {columnVisibilityInfo.map(col => (
        <label key={col.field}>
          <input
            type="checkbox"
            checked={col.visible}
            onChange={() => toggleColumn(col.field)}
          />
          {col.field}
        </label>
      ))}
    </div>
  );
}
```

## 🎯 DataGrid Ref API

### 使用 forwardRef

```tsx
import { useRef } from 'react';
import { DataGrid } from '@/Query/DataGrid';
import type { DataGridRef } from '@/Query/DataGrid/DataGrid';

function MyComponent() {
  const gridRef = useRef<DataGridRef>(null);

  const handleAutoFit = () => {
    gridRef.current?.autoFitAllColumns();
  };

  const handleFitToWidth = () => {
    gridRef.current?.fitToWidth();
  };

  const handleReset = () => {
    gridRef.current?.resetColumns();
  };

  const handleShowAll = () => {
    gridRef.current?.showAllColumns();
  };

  return (
    <div>
      <div>
        <button onClick={handleAutoFit}>自动调整列宽</button>
        <button onClick={handleFitToWidth}>适应容器宽度</button>
        <button onClick={handleReset}>重置列</button>
        <button onClick={handleShowAll}>显示所有列</button>
      </div>
      <DataGrid ref={gridRef} data={data} />
    </div>
  );
}
```

### DataGridRef 接口

```typescript
interface DataGridRef {
  /** 自动调整所有列宽 */
  autoFitAllColumns: () => void;
  /** 适应容器宽度 */
  fitToWidth: () => void;
  /** 重置列 */
  resetColumns: () => void;
  /** 显示所有列 */
  showAllColumns: () => void;
  /** 切换列可见性 */
  toggleColumnVisibility: (field: string) => void;
}
```

## 🔌 DataGridWrapper

### 用途

`DataGridWrapper` 封装 TanStack `DataGrid`，供查询结果区统一使用（AG Grid 已移除）。

### 使用示例

```tsx
import { DataGridWrapper } from '@/Query/ResultPanel/DataGridWrapper';
import type { DataGridApi } from '@/Query/ResultPanel/DataGridWrapper';

function MyComponent() {
  const gridApiRef = useRef<DataGridApi>(null);

  const handleGridReady = ({ api }: { api: DataGridApi }) => {
    gridApiRef.current = api;
  };

  const handleExportCSV = () => {
    gridApiRef.current?.exportDataAsCsv({ fileName: 'export.csv' });
  };

  const handleExportJSON = () => {
    gridApiRef.current?.exportDataAsJson({ fileName: 'export.json' });
  };

  return (
    <div>
      <button onClick={handleExportCSV}>导出 CSV</button>
      <button onClick={handleExportJSON}>导出 JSON</button>
      <DataGridWrapper
        ref={gridApiRef}
        rowData={data}
        columnDefs={columns}
        onGridReady={handleGridReady}
      />
    </div>
  );
}
```

### DataGridApi 接口

```typescript
interface DataGridApi {
  /** 导出为 CSV */
  exportDataAsCsv: (params?: { fileName?: string }) => void;
  /** 导出为 JSON */
  exportDataAsJson: (params?: { fileName?: string }) => void;
  /** 遍历筛选后的节点 */
  forEachNodeAfterFilterAndSort: (callback: (node: { data: Record<string, unknown> }) => void) => void;
  /** 获取所有数据 */
  getRowData: () => Record<string, unknown>[];
  /** 获取筛选后的数据 */
  getFilteredData: () => Record<string, unknown>[];
  /** 获取列可见性信息 */
  getColumnVisibility: () => DataGridColumnInfo[];
  /** 切换列可见性 */
  toggleColumnVisibility: (field: string) => void;
  /** 显示所有列 */
  showAllColumns: () => void;
  /** 自动调整所有列宽 */
  autoFitAllColumns: () => void;
  /** 适应容器宽度 */
  fitToWidth: () => void;
  /** 重置列 */
  resetColumns: () => void;
}
```

## ⚡ 性能优化

### 虚拟滚动

DataGrid 使用 @tanstack/react-virtual 实现行列双向虚拟滚动：

- **行虚拟化**: 始终启用，支持 10 万+ 行
- **列虚拟化**: 列数 > 50 时自动启用

### React 优化

```tsx
// ✅ 正确：使用 React.memo 优化单元格
const GridCell = memo(function GridCell({ value, rowIndex, colIndex }: GridCellProps) {
  return <div>{value}</div>;
});

// ✅ 正确：使用 useMemo 缓存计算结果
const sortedData = useMemo(() => {
  return [...data].sort((a, b) => a.id - b.id);
}, [data]);

// ✅ 正确：使用 useCallback 稳定回调
const handleCellClick = useCallback((rowIndex: number, colIndex: number) => {
  console.log('点击单元格:', rowIndex, colIndex);
}, []);
```

### 大数据量优化

```tsx
// ✅ 正确：分页加载大数据
function MyComponent() {
  const [page, setPage] = useState(0);
  const pageSize = 1000;

  const visibleData = useMemo(() => {
    const start = page * pageSize;
    const end = start + pageSize;
    return allData.slice(start, end);
  }, [allData, page, pageSize]);

  return (
    <div>
      <DataGrid data={visibleData} />
      <Pagination
        page={page}
        pageSize={pageSize}
        total={allData.length}
        onChange={setPage}
      />
    </div>
  );
}
```

## 🌐 国际化

DataGrid 使用 react-i18next，翻译键位于 `dataGrid` 命名空间：

```json
{
  "dataGrid": {
    "copy": "复制",
    "copyAsTSV": "复制为 TSV",
    "copyAsCSV": "复制为 CSV",
    "copyAsJSON": "复制为 JSON",
    "copyColumnName": "复制列名",
    "filterThisValue": "筛选此值",
    "excludeThisValue": "排除此值",
    "clearFilter": "清除筛选",
    "sortAscending": "升序排序",
    "sortDescending": "降序排序",
    "clearSort": "清除排序",
    "hideColumn": "隐藏列",
    "showAllColumns": "显示所有列",
    "autoFitColumn": "自动调整列宽",
    "resetColumn": "重置列宽",
    "loading": "加载中...",
    "noData": "暂无数据",
    "rowsSelected": "已选择 {{count}} 行",
    "cellsSelected": "已选择 {{count}} 个单元格"
  }
}
```

## 🚫 禁止的做法

### ❌ 禁止：在 render 中创建新对象

```tsx
// ❌ 错误：每次 render 创建新对象
<DataGrid
  data={data}
  columns={[{ field: 'id', headerName: 'ID' }]} // 每次都是新数组
/>

// ✅ 正确：使用 useMemo
const columns = useMemo(() => [
  { field: 'id', headerName: 'ID' }
], []);

<DataGrid data={data} columns={columns} />
```

### ❌ 禁止：直接修改 data

```tsx
// ❌ 错误：直接修改原数组
data.push(newRow);

// ✅ 正确：创建新数组
setData([...data, newRow]);
```

### ❌ 禁止：使用 index 作为 key

```tsx
// ❌ 错误
{data.map((row, index) => (
  <div key={index}>{row.name}</div>
))}

// ✅ 正确
{data.map((row) => (
  <div key={row.id}>{row.name}</div>
))}
```

## 📚 相关文档

- [DataGrid README](../../frontend/src/Query/DataGrid/README.md)
- [查询执行与结果展示](../../docs/frontend/QUERY_EXECUTION_FLOW.md)
- [DataGrid 示例](../../frontend/src/Query/DataGrid/examples/DataGridExample.tsx)
- [AGENTS.md](../../AGENTS.md)
- [前端开发约束](./frontend-constraints.md)

---

**维护者**: 项目团队  
**审核周期**: 每月更新  
**反馈渠道**: 项目 Issue 或 PR
