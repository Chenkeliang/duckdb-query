# Requirements V1 vs V2 对比和完善

## 📋 功能对比

### ✅ V2 新增/完善的功能

| 功能模块 | V1 状态 | V2 改进 |
|---------|--------|---------|
| 数据源面板 | 简单描述 | ✅ 详细定义三个section、搜索、单选/多选、右键菜单 |
| Excel 风格过滤 | 基础描述 | ✅ 详细定义 distinct values 计算、Web Worker、虚拟滚动 |
| 单元格选择 | ❌ 缺失 | ✅ 新增：单选、范围选择、多选 |
| 复制功能 | ❌ 缺失 | ✅ 新增：Ctrl+C、右键菜单、多格式复制 |
| 键盘导航 | ❌ 缺失 | ✅ 新增：方向键、Ctrl+Home/End、Page Up/Down |
| 浮动工具栏 | ❌ 缺失 | ✅ 新增：选中数据统计、快捷操作 |
| 列操作 | 简单描述 | ✅ 详细定义：调整宽度、重排序、冻结、隐藏 |
| 全局搜索 | ❌ 缺失 | ✅ 新增：Ctrl+F、搜索导航 |
| SQL 模板 | ❌ 缺失 | ✅ 新增：常用 SQL 模板 |
| SQL 历史 | 简单描述 | ✅ 详细定义：20条历史、状态、操作 |
| 保存为数据源 | ❌ 缺失 | ✅ 新增：保存查询结果为新表 |
| JOIN 类型冲突检测 | ❌ 缺失 | ✅ 新增：类型检查、类型转换 |
| 列映射配置 | ❌ 缺失 | ✅ 新增：集合操作列映射 |

### ❌ V1 有但 V2 需要补充的功能

| 功能 | V1 描述 | V2 状态 | 需要补充 |
|-----|--------|--------|---------|
| 表管理 | 集成到数据源面板右键菜单 | ✅ 已包含 | - |
| 异步任务预览 | onPreviewResult 回调 | ✅ 已包含 | - |
| 数据源刷新机制 | triggerRefresh() | ✅ 已包含 | - |

## 📁 目录结构和文件定义

### 完整目录结构

```
frontend/src/new/
├── Query/                          # 🆕 查询工作台（本次迁移）
│   ├── QueryWorkspace.tsx          # 主容器（三栏布局）
│   │
│   ├── DataSourcePanel/            # 数据源面板（左侧）
│   │   ├── index.tsx               # 主组件
│   │   ├── TreeSection.tsx         # 树形section组件
│   │   ├── TableItem.tsx           # 表项组件
│   │   ├── SearchInput.tsx         # 搜索输入框
│   │   └── ContextMenu.tsx         # 右键菜单
│   │
│   ├── QueryTabs/                  # 查询模式 Tab
│   │   └── index.tsx               # Tab 切换组件
│   │
│   ├── SQLQuery/                   # SQL 查询
│   │   ├── index.tsx               # 主组件
│   │   ├── SQLEditor.tsx           # Monaco Editor
│   │   ├── SQLToolbar.tsx          # 工具栏（格式化、模板、执行）
│   │   ├── SQLTemplates.tsx        # SQL 模板
│   │   └── SQLHistory.tsx          # 查询历史
│   │
│   ├── JoinQuery/                  # JOIN 查询
│   │   ├── index.tsx               # 主组件
│   │   ├── TableCard.tsx           # 表卡片
│   │   ├── JoinConnector.tsx       # JOIN 连接器
│   │   ├── JoinCondition.tsx       # JOIN 条件
│   │   └── TypeConflictDialog.tsx  # 类型冲突对话框
│   │
│   ├── SetOperations/              # 集合操作
│   │   ├── index.tsx               # 主组件
│   │   ├── TableCard.tsx           # 表卡片
│   │   ├── SetConnector.tsx        # 集合操作连接器
│   │   └── ColumnMappingDialog.tsx # 列映射对话框
│   │
│   ├── PivotTable/                 # 透视表
│   │   ├── index.tsx               # 主组件
│   │   ├── DimensionZone.tsx       # 维度拖放区
│   │   └── ValueConfig.tsx         # 值聚合配置
│   │
│   ├── VisualQuery/                # 可视化查询（最后实现）
│   │   ├── index.tsx               # 主组件
│   │   ├── ModeCards.tsx           # 模式卡片
│   │   ├── FieldSelector.tsx       # 字段选择器
│   │   ├── FilterBuilder.tsx       # 过滤器构建器
│   │   ├── GroupByBuilder.tsx      # 分组构建器
│   │   ├── SortBuilder.tsx         # 排序构建器
│   │   └── LimitConfig.tsx         # 限制配置
│   │
│   ├── ResultPanel/                # 结果面板
│   │   ├── index.tsx               # 主组件（AG-Grid）
│   │   ├── ResultToolbar.tsx       # 工具栏
│   │   ├── ColumnFilterMenu.tsx    # Excel 风格列筛选
│   │   ├── FloatingToolbar.tsx     # 浮动工具栏
│   │   ├── SearchDialog.tsx        # 全局搜索对话框
│   │   ├── ExportDialog.tsx        # 导出对话框
│   │   ├── ContextMenu.tsx         # 右键菜单
│   │   └── workers/
│   │       └── distinctValues.worker.ts  # Web Worker
│   │
│   └── AsyncTasks/                 # 异步任务
│       ├── index.tsx               # 主组件
│       ├── TaskTable.tsx           # 任务表格
│       ├── TaskActions.tsx         # 任务操作
│       ├── FormatDialog.tsx        # 格式选择对话框
│       ├── CancelDialog.tsx        # 取消对话框
│       └── RetryDialog.tsx         # 重试对话框
│
├── hooks/                          # 自定义 Hooks
│   ├── useQueryWorkspace.ts        # 查询工作台状态
│   ├── useDataSourcePanel.ts       # 数据源面板逻辑
│   ├── useResultPanel.ts           # 结果面板逻辑
│   ├── useSQLEditor.ts             # SQL 编辑器逻辑
│   ├── useColumnFilter.ts          # 列筛选逻辑
│   ├── useCellSelection.ts         # 单元格选择逻辑
│   └── useKeyboardNav.ts           # 键盘导航逻辑
│
└── utils/                          # 工具函数
    ├── agGridTheme.ts              # AG-Grid 主题定制
    ├── columnTypeDetection.ts      # 列类型检测
    ├── dataExport.ts               # 数据导出
    └── sqlFormatter.ts             # SQL 格式化
```

### 文件职责定义

#### QueryWorkspace.tsx
```typescript
/**
 * 查询工作台主容器
 * 
 * 职责：
 * - 管理三栏布局（react-resizable-panels）
 * - 管理全局状态（useQueryWorkspace）
 * - 协调子组件通信
 * 
 * Props：
 * - defaultLayout?: number[] - 默认布局比例 [20, 50, 30]
 * 
 * State：
 * - selectedTables: Record<string, string[]> - 每个模式的选中表
 * - currentTab: string - 当前查询模式
 * - queryResults: QueryResult | null - 查询结果
 */
```

#### DataSourcePanel/index.tsx
```typescript
/**
 * 数据源面板（左侧）
 * 
 * 职责：
 * - 显示 DuckDB 表、数据库连接、系统表
 * - 处理表选择（单选/多选）
 * - 搜索和过滤
 * - 右键菜单
 * 
 * Props：
 * - tables: Table[] - 表列表
 * - selectedTables: string[] - 选中的表
 * - onTableSelect: (table: string) => void - 表选择回调
 * - selectionMode: 'single' | 'multiple' - 选择模式
 * - collapsed: boolean - 是否折叠
 * - onToggleCollapse: () => void - 折叠切换回调
 * 
 * API：
 * - getDuckDBTablesEnhanced() - 获取表列表
 * - deleteDuckDBTableEnhanced(tableName) - 删除表
 * - triggerRefresh() - 刷新数据源
 */
```

#### ResultPanel/index.tsx
```typescript
/**
 * 结果面板（AG-Grid）
 * 
 * 职责：
 * - 显示查询结果（AG-Grid）
 * - Excel 风格列筛选
 * - 单元格选择和复制
 * - 键盘导航
 * - 浮动工具栏
 * - 全局搜索
 * - 导出功能
 * 
 * Props：
 * - data: any[][] - 数据
 * - columns: ColumnDef[] - 列定义
 * - loading: boolean - 加载状态
 * - error: Error | null - 错误信息
 * - rowCount: number - 行数
 * - execTime: number - 执行时间
 * - collapsed: boolean - 是否折叠
 * - onToggleCollapse: () => void - 折叠切换回调
 * 
 * API：
 * - exportData(data, format) - 导出数据
 */
```

#### SQLQuery/index.tsx
```typescript
/**
 * SQL 查询组件
 * 
 * 职责：
 * - SQL 编辑器（Monaco Editor）
 * - SQL 格式化
 * - SQL 模板
 * - 查询历史
 * - 执行查询
 * 
 * Props：
 * - selectedTable: string | null - 选中的表
 * - onExecute: (sql: string) => void - 执行回调
 * 
 * API：
 * - executeDuckDBSQL(sql) - 执行 SQL
 * - saveQueryResult(tableName, sql) - 保存为数据源
 */
```

## 🔌 API 使用规范

### 数据源相关 API

```typescript
// ✅ 使用统一的 API（已在 api-unification-rules.md 中定义）

// 获取表列表
import { getDuckDBTablesEnhanced } from '@/services/apiClient';
const { data: tables } = useQuery({
  queryKey: ['tables'],
  queryFn: getDuckDBTablesEnhanced,
});

// 删除表
import { deleteDuckDBTableEnhanced } from '@/services/apiClient';
const deleteMutation = useMutation({
  mutationFn: (tableName: string) => deleteDuckDBTableEnhanced(tableName),
  onSuccess: () => {
    queryClient.invalidateQueries(['tables']);
    triggerRefresh();
  },
});

// 刷新数据源
import { triggerRefresh } from '@/hooks/useDuckQuery';
triggerRefresh(); // 触发全局刷新
```

### 查询执行 API

```typescript
// SQL 查询
import { executeDuckDBSQL } from '@/services/apiClient';
const queryMutation = useMutation({
  mutationFn: (sql: string) => executeDuckDBSQL(sql),
  onSuccess: (data) => {
    // 显示结果
  },
  onError: (error) => {
    // 显示错误
  },
});

// 异步查询
import { submitAsyncQuery } from '@/services/apiClient';
const asyncMutation = useMutation({
  mutationFn: (config: AsyncQueryRequest) => submitAsyncQuery(config),
  onSuccess: (data) => {
    toast.success('异步任务已提交');
  },
});
```

### 导出 API

```typescript
// 导出数据
import { exportData } from '@/services/apiClient';
const exportMutation = useMutation({
  mutationFn: ({ data, format }: { data: any[], format: string }) => 
    exportData(data, format),
  onSuccess: () => {
    toast.success('导出成功');
  },
});
```

## ⚠️ 错误处理规范

### 错误信息结构（遵循 api-response-format-standard.md）

```typescript
// 后端统一响应格式
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  messageCode: string;
  message: string;
  timestamp: string;
}

// 前端错误处理
const handleApiError = (error: ApiResponse<any>) => {
  if (!error.success) {
    // 使用 messageCode 进行国际化
    const localizedMessage = t(error.messageCode) || error.message;
    toast.error(localizedMessage);
    
    // 记录详细错误
    console.error('[API Error]', {
      code: error.error?.code,
      message: error.error?.message,
      details: error.error?.details,
    });
  }
};
```

### Toast 使用规范

```typescript
// ✅ 使用项目的 Toast 系统（useToast hook）
import { useToast } from '@/contexts/ToastContext';

const { toast } = useToast();

// 成功提示
toast.success('操作成功');
toast.success('已复制 10 行数据到剪贴板');

// 错误提示
toast.error('操作失败');
toast.error('查询执行失败: 语法错误');

// 警告提示
toast.warning('数据类型不匹配');

// 信息提示
toast.info('正在加载数据...');

// ❌ 不要使用其他 Toast 库
// import { toast } from 'react-hot-toast'; // 错误
// import { message } from 'antd'; // 错误
```

## 🎨 UI 组件使用规范

### shadcn/ui 组件

```typescript
// ✅ 使用 shadcn-integration 中创建的组件
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from '@/components/ui/context-menu';

// ❌ 不要使用 MUI 组件（旧 UI 使用）
// import { Button } from '@mui/material'; // 错误
```

### AG-Grid 主题

```typescript
// ✅ 使用自定义主题
import 'ag-grid-community/styles/ag-grid.css';
import '@/styles/ag-theme-duckquery.css'; // 自定义主题

<div className="ag-theme-duckquery h-full">
  <AgGridReact {...props} />
</div>
```

### 语义化类名

```typescript
// ✅ 使用语义化 Tailwind 类名（遵循 AGENTS.md）
<div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
  <h2 className="text-lg font-semibold text-foreground">标题</h2>
  <p className="text-sm text-muted-foreground">描述</p>
</div>

// ❌ 不要使用硬编码颜色
// <div className="bg-white border-gray-200"> // 错误
```

## 🔧 实现细节完善

### Excel 风格列筛选实现

```typescript
// 1. Web Worker 异步计算 distinct values
// frontend/src/workers/distinctValues.worker.ts
self.onmessage = function(e) {
  const { data, columns, sampleLimit, previewLimit } = e.data;
  
  const sample = data.slice(0, sampleLimit);
  const result = {};
  
  columns.forEach((column) => {
    const counts = new Map();
    
    sample.forEach((row) => {
      const value = row[column.field];
      const key = makeValueKey(value);
      if (!counts.has(key)) {
        counts.set(key, { key, value, count: 0 });
      }
      counts.get(key).count += 1;
    });
    
    const options = Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, previewLimit);
    
    result[column.field] = { options };
  });
  
  self.postMessage(result);
};

// 2. 在组件中使用 Web Worker
const workerRef = useRef<Worker | null>(null);

useEffect(() => {
  workerRef.current = new Worker(
    new URL('../workers/distinctValues.worker.ts', import.meta.url)
  );
  
  workerRef.current.onmessage = (e) => {
    setDistinctValueMap(e.data);
  };
  
  return () => {
    workerRef.current?.terminate();
  };
}, []);

// 3. 触发计算
useEffect(() => {
  if (data && columns.length > 0) {
    workerRef.current?.postMessage({
      data,
      columns,
      sampleLimit: 10000,
      previewLimit: 1000,
    });
  }
}, [data, columns]);
```

### 单元格选择实现

```typescript
// 使用 AG-Grid 的 Range Selection
<AgGridReact
  enableRangeSelection={true}
  enableCellTextSelection={true}
  onRangeSelectionChanged={(event) => {
    const ranges = event.api.getCellRanges();
    setSelection(ranges);
  }}
/>
```

### 键盘导航实现

```typescript
// 使用 AG-Grid 的键盘导航
<AgGridReact
  onCellKeyDown={(event) => {
    if (event.event.ctrlKey && event.event.key === 'c') {
      // 复制选中的单元格
      copySelection();
    }
  }}
  navigateToNextCell={(params) => {
    // 自定义导航逻辑
    return params.nextCellPosition;
  }}
/>
```

## ✅ 完善检查清单

### 功能完整性
- [x] 所有 V1 功能都已包含
- [x] 新增了交互优化功能
- [x] 新增了 Excel 风格过滤优化
- [x] 补充了遗漏的功能（SQL 模板、保存为数据源等）

### 技术规范
- [x] API 使用符合 api-unification-rules.md
- [x] 错误处理符合 api-response-format-standard.md
- [x] Toast 使用符合项目规范
- [x] UI 组件使用 shadcn/ui
- [x] 样式使用语义化类名

### 目录结构
- [x] 文件组织清晰
- [x] 职责定义明确
- [x] 命名规范统一

### 实现细节
- [x] Web Worker 异步计算
- [x] AG-Grid 集成
- [x] 键盘导航
- [x] 单元格选择
- [x] 复制功能

---

**文档版本**: v2.0  
**创建时间**: 2024-12-04  
**状态**: 📝 完善中
