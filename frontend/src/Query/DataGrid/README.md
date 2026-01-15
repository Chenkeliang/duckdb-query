# DataGrid 组件

基于 TanStack Table + @tanstack/react-virtual 的高性能数据网格组件。

## 功能特性

- ✅ **虚拟滚动** - 支持 10 万行 × 200 列流畅滚动
- ✅ **单元格选区** - 飞书式单矩形选区模型
- ✅ **多格式复制** - TSV/CSV/JSON 格式复制
- ✅ **列筛选** - 支持低基数/高基数列自适应筛选
- ✅ **键盘导航** - 完整的键盘快捷键支持
- ✅ **列排序** - 点击列头排序
- ✅ **列宽调整** - 拖拽调整列宽
- ✅ **列可见性** - 隐藏/显示列（会话级别）
- ✅ **数据导出** - 支持 CSV/JSON 格式导出

## 安装依赖

```bash
npm install @tanstack/react-table @tanstack/react-virtual
```

## 基本用法

```tsx
import { DataGrid } from '@/Query/DataGrid';

function MyComponent() {
  const data = [
    { id: 1, name: 'Alice', age: 25 },
    { id: 2, name: 'Bob', age: 30 },
  ];

  return (
    <DataGrid
      data={data}
      height={400}
    />
  );
}
```

## Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `data` | `Record<string, unknown>[]` | 必填 | 行数据 |
| `columns` | `ColumnDef[]` | 自动推断 | 列定义 |
| `loading` | `boolean` | `false` | 加载状态 |
| `emptyText` | `string` | '暂无数据' | 空状态文本 |
| `rowHeight` | `number` | `32` | 行高 |
| `height` | `number \| string` | `400` | 容器高度 |
| `enableSelection` | `boolean` | `true` | 启用选区 |
| `enableFiltering` | `boolean` | `true` | 启用筛选 |
| `enableSorting` | `boolean` | `true` | 启用排序 |
| `onSelectionChange` | `(selection) => void` | - | 选区变化回调 |
| `onFilterChange` | `(filters) => void` | - | 筛选变化回调 |
| `onSortChange` | `(sorting) => void` | - | 排序变化回调 |

## 列可见性

DataGrid 支持会话级别的列可见性控制。使用 `useColumnVisibility` Hook：

```tsx
import { useColumnVisibility } from '@/Query/DataGrid/hooks';

function MyComponent() {
  const {
    columnVisibility,
    toggleColumn,
    showAllColumns,
    getVisibleColumns,
  } = useColumnVisibility(columns);

  return (
    <DataGrid
      data={data}
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={toggleColumn}
    />
  );
}
```

**注意**：列可见性状态仅在当前会话中保持，不会持久化到 localStorage。这是因为查询结果的列是动态的，每次查询可能返回不同的列。

## 数据导出

使用 `useGridExport` Hook 导出数据：

```tsx
import { useGridExport } from '@/Query/DataGrid/hooks';

function MyComponent() {
  const { exportCSV, exportJSON } = useGridExport({
    data,
    columns,
    filename: 'my-data',
  });

  return (
    <>
      <button onClick={exportCSV}>导出 CSV</button>
      <button onClick={exportJSON}>导出 JSON</button>
    </>
  );
}
```

导出功能特性：
- CSV 导出添加 UTF-8 BOM，确保 Excel 正确识别中文
- 正确处理特殊字符（逗号、换行、引号）
- 支持 BigInt 和复杂类型（LIST/STRUCT）的安全序列化

## 列定义

```tsx
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
  },
];
```

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+A` | 全选 |
| `Ctrl+C` | 复制选区（TSV 格式） |
| `Esc` | 清除选区 |
| `↑↓←→` | 移动焦点 |
| `Shift+↑↓←→` | 扩展选区 |
| `Home` | 移动到行首 |
| `End` | 移动到行尾 |
| `Ctrl+Home` | 移动到表格开始 |
| `Ctrl+End` | 移动到表格结束 |
| `PageUp/PageDown` | 翻页 |

## 右键菜单

- 复制为 TSV
- 复制为 CSV
- 复制为 JSON
- 复制列名
- 筛选此值
- 排除此值
- 清除筛选

## 性能优化

- 使用 `React.memo` 优化单元格和行组件
- 使用 `useMemo` 缓存计算结果
- 使用 `useCallback` 稳定回调函数
- 列数 > 50 时自动启用列虚拟化

## 国际化

组件使用 `react-i18next`，翻译键位于 `dataGrid` 命名空间：

```json
{
  "dataGrid": {
    "copy": "复制",
    "copyAsTSV": "复制为 TSV",
    "copyAsCSV": "复制为 CSV",
    "copyAsJSON": "复制为 JSON",
    "loading": "加载中...",
    "noData": "暂无数据"
  }
}
```

## 相关文件

- `DataGrid.tsx` - 主组件
- `hooks/` - 自定义 Hooks
  - `useDataGrid.ts` - TanStack Table 封装
  - `useCellSelection.ts` - 选区管理
  - `useVirtualScroll.ts` - 虚拟滚动
  - `useGridCopy.ts` - 复制功能
  - `useColumnFilter.ts` - 列筛选
  - `useKeyboardNavigation.ts` - 键盘导航
  - `useGridStats.ts` - 统计信息
  - `useColumnVisibility.ts` - 列可见性管理
  - `useGridExport.ts` - 数据导出（CSV/JSON）
- `components/` - 子组件
  - `GridHeader.tsx` - 列头容器
  - `GridBody.tsx` - 表格主体
  - `GridFooter.tsx` - 底部统计
  - `GridCell.tsx` - 单元格
  - `GridRow.tsx` - 行
  - `ColumnHeader.tsx` - 列头
  - `FilterMenu.tsx` - 筛选菜单
  - `ContextMenu.tsx` - 右键菜单
  - `SelectionOverlay.tsx` - 选区覆盖层
- `utils/` - 工具函数
  - `clipboard.ts` - 剪贴板操作
  - `selection.ts` - 选区计算
  - `columnTypes.ts` - 列类型检测
  - `formatters.ts` - 值格式化
