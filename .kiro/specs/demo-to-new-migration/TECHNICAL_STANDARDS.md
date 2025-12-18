# 技术规范文档

本文档明确 demo-to-new-migration 项目的技术规范，包括 UI 组件、API 调用、响应格式等。

## 一、UI 组件规范

### 1.1 组件库使用

| 类型 | 使用方式 | 位置 |
|------|---------|------|
| **shadcn/ui 组件** | 直接导入使用 | `@/new/components/ui/*` |
| **图标** | lucide-react | `import { Icon } from 'lucide-react'` |
| **布局面板** | react-resizable-panels | 已安装 |
| **表格** | @tanstack/react-table | 已安装 |
| **虚拟滚动** | @tanstack/react-virtual | 已安装 |

### 1.2 可用的 shadcn/ui 组件

```typescript
// 已创建的组件（位于 frontend/src/new/components/ui/）
import { Button } from '@/new/components/ui/button';
import { Card, CardHeader, CardContent } from '@/new/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/new/components/ui/tabs';
import { Input } from '@/new/components/ui/input';
import { Label } from '@/new/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/new/components/ui/select';
import { Checkbox } from '@/new/components/ui/checkbox';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/new/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/new/components/ui/popover';
import { Command, CommandInput, CommandList, CommandItem } from '@/new/components/ui/command';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/new/components/ui/dropdown-menu';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from '@/new/components/ui/context-menu';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/new/components/ui/tooltip';
import { Skeleton } from '@/new/components/ui/skeleton';
import { Progress } from '@/new/components/ui/progress';
import { Badge } from '@/new/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/new/components/ui/alert';
import { Separator } from '@/new/components/ui/separator';
import { Switch } from '@/new/components/ui/switch';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/new/components/ui/accordion';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/new/components/ui/collapsible';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/new/components/ui/table';
```

### 1.3 样式规范

**必须遵循 AGENTS.md 中的设计系统**：

```typescript
// ✅ 正确：使用语义化 Tailwind 类名
<div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
  <h2 className="text-lg font-semibold text-foreground">标题</h2>
  <p className="text-sm text-muted-foreground">描述</p>
</div>

// ❌ 错误：硬编码颜色
<div className="bg-white border border-gray-200">
  <h2 className="text-gray-900">标题</h2>
</div>

// ❌ 错误：直接使用 CSS 变量
<div style={{ backgroundColor: 'var(--dq-surface)' }}>
```

### 1.4 Button 变体

```typescript
// 主按钮
<Button variant="default">确认</Button>

// 次要按钮
<Button variant="outline">取消</Button>

// 危险操作
<Button variant="destructive">删除</Button>

// 幽灵按钮
<Button variant="ghost">更多</Button>

// 链接样式
<Button variant="link">查看详情</Button>
```

---

## 二、API 调用规范

### 2.1 TanStack Query 使用

**强制要求**：所有服务端数据获取必须使用 TanStack Query。

```typescript
// ✅ 正确：使用 TanStack Query
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ❌ 错误：传统 fetch 模式
const [data, setData] = useState([]);
useEffect(() => {
  fetch('/api/xxx').then(r => r.json()).then(setData);
}, []);
```

### 2.2 现有 Hooks（必须复用）

| Hook | 用途 | queryKey |
|------|------|----------|
| `useDuckDBTables` | 获取 DuckDB 表列表 | `['duckdb-tables']` |
| `useDataSources` | 获取所有数据源 | `['datasources']` |
| `useDatabaseConnections` | 获取数据库连接 | `['database-connections']` |
| `useSchemas` | 获取数据库 Schema | `['schemas', connectionId]` |
| `useSchemaTables` | 获取 Schema 下的表 | `['schema-tables', connectionId, schema]` |

### 2.3 API 函数映射表

| 功能 | API 函数 | 端点 | 方法 |
|------|---------|------|------|
| **表操作** |
| 获取表列表 | `getDuckDBTables()` | `/api/duckdb_tables` | GET |
| 获取表详情 | `getDuckDBTableDetail(name)` | `/api/duckdb/tables/detail/{name}` | GET |
| 删除表 | `deleteDuckDBTableEnhanced(name)` | `/api/duckdb/tables/{name}` | DELETE |
| 刷新表元数据 | `refreshDuckDBTableMetadata(name)` | `/api/duckdb/table/{name}/refresh` | POST |
| **查询执行** |
| 执行 DuckDB SQL | `executeDuckDBSQL(sql, saveAsTable, is_preview)` | `/api/duckdb/execute` | POST |
| 执行通用查询 | `performQuery(request)` | `/api/query` | POST |
| 可视化查询预览 | `previewVisualQuery(config)` | `/api/visual-query/preview` | POST |
| 生成可视化查询 SQL | `generateVisualQuerySQL(config)` | `/api/visual-query/generate` | POST |
| **异步任务** |
| 提交异步查询 | `submitAsyncQuery(payload)` | `/api/async_query` | POST |
| 获取任务列表 | `listAsyncTasks()` | `/api/async_tasks` | GET |
| 获取单个任务 | `getAsyncTask(taskId)` | `/api/async_tasks/{taskId}` | GET |
| 取消任务 | `cancelAsyncTask(taskId)` | `/api/async_tasks/{taskId}/cancel` | POST |
| 重试任务 | `retryAsyncTask(taskId)` | `/api/async_tasks/{taskId}/retry` | POST |
| **数据源** |
| 获取所有数据源 | `listAllDataSources(filters)` | `/api/datasources` | GET |
| 获取数据库连接 | `listDatabaseDataSources(filters)` | `/api/datasources/databases/list` | GET |
| 测试连接 | `testDatabaseConnection(data)` | `/api/datasources/databases/test` | POST |
| 创建连接 | `createDatabaseConnection(data)` | `/api/datasources/databases` | POST |
| 更新连接 | `updateDatabaseConnection(id, data)` | `/api/datasources/databases/{id}` | PUT |
| 删除连接 | `deleteDatabaseConnection(id)` | `/api/datasources/{id}` | DELETE |
| **文件上传** |
| 上传文件 | `uploadFile(file, tableAlias)` | `/api/upload` | POST |
| 上传到 DuckDB | `uploadFileToDuckDB(file, tableAlias)` | `/api/duckdb/upload-file` | POST |
| **列统计** |
| 获取列统计 | `getColumnStatistics(table, column)` | `/api/visual-query/column-stats/{table}/{column}` | GET |

### 2.4 QueryKey 命名规范

```typescript
// 格式：['资源名称-kebab-case', ...参数]

// ✅ 正确
export const DUCKDB_TABLES_QUERY_KEY = ['duckdb-tables'] as const;
export const DATASOURCES_QUERY_KEY = ['datasources'] as const;
export const TABLE_DETAIL_QUERY_KEY = (name: string) => ['duckdb-table-detail', name] as const;
export const ASYNC_TASKS_QUERY_KEY = ['async-tasks'] as const;
export const COLUMN_STATS_QUERY_KEY = (table: string, column: string) => ['column-stats', table, column] as const;

// ❌ 错误
['tables']           // 太泛化
['getTables']        // 不要用函数名
['duckdb_tables']    // 使用 kebab-case，不是 snake_case
```

### 2.5 缓存失效工具函数

使用 `frontend/src/new/utils/cacheInvalidation.ts` 中的函数：

```typescript
import { useQueryClient } from '@tanstack/react-query';
import {
  invalidateDuckDBTables,
  invalidateDataSources,
  invalidateAfterFileUpload,
  invalidateAfterDatabaseChange,
  invalidateAfterTableDelete,
  invalidateAllDataCaches,
} from '@/new/utils/cacheInvalidation';

// 使用示例
const queryClient = useQueryClient();

// 文件上传后
await uploadFile(file);
await invalidateAfterFileUpload(queryClient);

// 数据库连接变更后
await createDatabaseConnection(data);
await invalidateAfterDatabaseChange(queryClient);

// 表删除后
await deleteDuckDBTableEnhanced(tableName);
await invalidateAfterTableDelete(queryClient);

// 异步任务完成后
await invalidateAllDataCaches(queryClient);
```

### 2.6 Mutation 使用模式

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { executeDuckDBSQL } from '@/services/apiClient';
import { invalidateDuckDBTables } from '@/new/utils/cacheInvalidation';

export const useExecuteSQL = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sql, saveAsTable }: { sql: string; saveAsTable?: string }) =>
      executeDuckDBSQL(sql, saveAsTable, true),
    onSuccess: (data, variables) => {
      // 如果保存为表，刷新表列表
      if (variables.saveAsTable) {
        invalidateDuckDBTables(queryClient);
      }
    },
    onError: (error) => {
      console.error('SQL 执行失败:', error);
    },
  });
};
```

---

## 三、API 响应格式规范

### 3.1 标准响应格式

**成功响应**：
```json
{
  "success": true,
  "data": { /* 实际数据 */ },
  "messageCode": "OPERATION_SUCCESS",
  "message": "操作成功",
  "timestamp": "2024-12-02T19:08:05.123456Z"
}
```

**错误响应**：
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": {}
  },
  "messageCode": "ERROR_CODE",
  "message": "错误描述",
  "timestamp": "2024-12-02T19:08:05.123456Z"
}
```

**列表响应**：
```json
{
  "success": true,
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20
  },
  "messageCode": "LIST_RETRIEVED",
  "message": "获取列表成功",
  "timestamp": "2024-12-02T19:08:05.123456Z"
}
```

### 3.2 前端响应处理

```typescript
// 处理 API 响应
const handleApiResponse = <T>(response: ApiResponse<T>): T => {
  if (response.success) {
    return response.data;
  } else {
    throw new Error(response.message || '操作失败');
  }
};

// 在 TanStack Query 中使用
const { data } = useQuery({
  queryKey: ['duckdb-tables'],
  queryFn: async () => {
    const response = await getDuckDBTables();
    return handleApiResponse(response);
  },
});
```

### 3.3 错误处理

```typescript
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

const mutation = useMutation({
  mutationFn: executeSQL,
  onError: (error: Error) => {
    // 显示错误提示
    toast.error(error.message || '操作失败');
  },
  onSuccess: (data) => {
    toast.success('执行成功');
  },
});
```

---

## 四、TypeScript 类型规范

### 4.1 API 响应类型

```typescript
// types/api.ts

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  messageCode: string;
  message: string;
  timestamp: string;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
}

export interface Table {
  name: string;
  type: string;
  row_count?: number;
  source_type?: string;
  created_at?: string;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  executionTime?: number;
}

export interface AsyncTask {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  result?: QueryResult;
  error?: string;
  created_at: string;
  updated_at: string;
}
```

### 4.2 组件 Props 类型

```typescript
// 查询构建器 Props
interface QueryBuilderProps {
  selectedTable: string | null;
  onTableSelect: (table: string) => void;
  onQueryExecute: (sql: string) => void;
}

// 结果面板 Props
interface ResultPanelProps {
  data: QueryResult | null;
  isLoading: boolean;
  error: Error | null;
  onExport?: (format: 'csv' | 'json' | 'parquet') => void;
}

// 数据源面板 Props
interface DataSourcePanelProps {
  selectedTables: string[];
  onTableSelect: (table: string) => void;
  onTableDoubleClick: (table: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}
```

---

## 五、文件组织规范

### 5.1 目录结构

```
frontend/src/new/
├── components/
│   └── ui/                     # shadcn/ui 组件
├── hooks/
│   ├── useDuckDBTables.ts      # ✅ 已实现
│   ├── useDataSources.ts       # ✅ 已实现
│   ├── useDatabaseConnections.ts # ✅ 已实现
│   ├── useQueryWorkspace.ts    # ✅ 已实现
│   ├── useQueryBuilder.ts      # 🆕 需要创建
│   ├── useResultPanel.ts       # 🆕 需要创建
│   └── useSQLEditor.ts         # 🆕 需要创建
├── utils/
│   └── cacheInvalidation.ts    # ✅ 已实现
├── Query/
│   ├── QueryWorkspace.tsx      # ✅ 已实现
│   ├── DataSourcePanel/        # ✅ 已实现
│   ├── QueryTabs/              # ✅ 已实现
│   ├── ResultPanel/            # 🆕 需要完善
│   ├── SQLQuery/               # 🆕 需要创建
│   ├── VisualQuery/            # 🆕 需要创建
│   ├── JoinQuery/              # 🆕 需要创建
│   ├── SetOperations/          # 🆕 需要创建
│   └── PivotTable/             # 🆕 需要创建
└── providers/
    └── QueryProvider.tsx       # ✅ 已实现
```

### 5.2 组件文件模板

```typescript
// Query/SQLQuery/SQLEditor.tsx

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/new/components/ui/button';
import { Card } from '@/new/components/ui/card';
import { executeDuckDBSQL } from '@/services/apiClient';
import { invalidateDuckDBTables } from '@/new/utils/cacheInvalidation';

interface SQLEditorProps {
  onQueryExecute: (result: QueryResult) => void;
}

export const SQLEditor: React.FC<SQLEditorProps> = ({ onQueryExecute }) => {
  const queryClient = useQueryClient();
  const [sql, setSql] = useState('');

  const executeMutation = useMutation({
    mutationFn: (sql: string) => executeDuckDBSQL(sql, null, true),
    onSuccess: (data) => {
      onQueryExecute(data);
    },
  });

  return (
    <Card className="p-4">
      <textarea
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        className="w-full h-40 font-mono text-sm bg-input border border-border rounded-md p-3"
        placeholder="输入 SQL 查询..."
      />
      <div className="flex justify-end mt-4">
        <Button
          onClick={() => executeMutation.mutate(sql)}
          disabled={executeMutation.isPending || !sql.trim()}
        >
          {executeMutation.isPending ? '执行中...' : '执行'}
        </Button>
      </div>
    </Card>
  );
};
```

---

## 六、国际化（i18n）规范

### 6.1 使用方式

```typescript
import { useTranslation } from 'react-i18next';

const MyComponent = () => {
  const { t } = useTranslation('common');
  
  return (
    <Button>{t('actions.execute')}</Button>
  );
};
```

### 6.2 翻译 key 命名规范

```
格式：<模块>.<功能>.<具体文案>

示例：
- query.builder.selectTable      // 查询构建器 - 选择表
- query.result.noData            // 查询结果 - 无数据
- query.filter.addCondition      // 查询过滤 - 添加条件
- query.sql.execute              // SQL 查询 - 执行
- query.export.success           // 导出 - 成功
- error.network                  // 错误 - 网络错误
- error.timeout                  // 错误 - 超时
- actions.save                   // 操作 - 保存
- actions.cancel                 // 操作 - 取消
- status.loading                 // 状态 - 加载中
```

### 6.3 翻译文件位置

```
frontend/src/i18n/locales/
├── zh/
│   └── common.json    # 中文翻译
└── en/
    └── common.json    # 英文翻译
```

### 6.4 新增文案流程

1. 在组件中使用 `t('query.xxx.xxx')` 
2. 在 `zh/common.json` 中添加中文翻译
3. 在 `en/common.json` 中添加英文翻译
4. 测试中英文切换

### 6.5 翻译文件示例

```json
// zh/common.json
{
  "query": {
    "builder": {
      "selectTable": "选择表",
      "selectColumns": "选择列",
      "addFilter": "添加过滤条件"
    },
    "result": {
      "noData": "暂无数据",
      "rowCount": "共 {{count}} 行"
    },
    "sql": {
      "execute": "执行",
      "executing": "执行中..."
    }
  },
  "error": {
    "network": "网络错误，请检查连接",
    "timeout": "请求超时",
    "sqlSyntax": "SQL 语法错误"
  },
  "actions": {
    "save": "保存",
    "cancel": "取消",
    "retry": "重试",
    "export": "导出"
  }
}
```

---

## 七、错误处理规范

### 7.1 错误分类

| 错误类型 | 错误码 | 处理方式 | 用户提示 |
|---------|--------|---------|---------|
| 网络错误 | `NETWORK_ERROR` | 重试 + toast | `t('error.network')` |
| SQL 语法错误 | `SQL_SYNTAX_ERROR` | 高亮错误位置 | `t('error.sqlSyntax')` |
| 表不存在 | `TABLE_NOT_FOUND` | 刷新表列表 | `t('error.tableNotFound')` |
| 权限错误 | `PERMISSION_DENIED` | 提示联系管理员 | `t('error.permission')` |
| 超时错误 | `TIMEOUT` | 建议使用异步任务 | `t('error.timeout')` |
| 数据量过大 | `DATA_TOO_LARGE` | 建议使用异步任务 | `t('error.dataTooLarge')` |

### 7.2 错误处理模式

```typescript
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

const useExecuteSQL = () => {
  const { t } = useTranslation('common');
  
  return useMutation({
    mutationFn: executeDuckDBSQL,
    onError: (error: Error) => {
      // 解析错误类型并显示国际化提示
      if (error.message.includes('syntax error')) {
        toast.error(t('error.sqlSyntax'), {
          description: error.message,
        });
      } else if (error.message.includes('not found')) {
        toast.error(t('error.tableNotFound'));
      } else if (error.message.includes('timeout')) {
        toast.error(t('error.timeout'), {
          action: {
            label: t('actions.useAsyncTask'),
            onClick: () => submitAsAsyncTask(),
          },
        });
      } else {
        toast.error(t('error.general'), {
          description: error.message,
        });
      }
    },
  });
};
```

### 7.3 错误边界组件

```typescript
import { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, AlertTitle, AlertDescription } from '@/new/components/ui/alert';
import { Button } from '@/new/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <Alert variant="destructive">
          <AlertTitle>出错了</AlertTitle>
          <AlertDescription>
            {this.state.error?.message}
            <Button
              variant="link"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              重试
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    return this.props.children;
  }
}
```

---

## 八、UI 状态规范

### 8.1 加载状态

```typescript
import { Skeleton } from '@/new/components/ui/skeleton';

// 表格加载骨架屏
const TableSkeleton = () => (
  <div className="space-y-3">
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
  </div>
);

// 卡片加载骨架屏
const CardSkeleton = () => (
  <div className="space-y-4 p-6">
    <Skeleton className="h-6 w-1/3" />
    <Skeleton className="h-4 w-2/3" />
    <Skeleton className="h-32 w-full" />
  </div>
);

// 按钮加载状态
<Button disabled={isLoading}>
  {isLoading ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {t('status.loading')}
    </>
  ) : (
    t('actions.execute')
  )}
</Button>
```

### 8.2 空状态

```typescript
import { Database, FileQuestion, Upload } from 'lucide-react';

// 无数据状态
const EmptyState = ({ type }: { type: 'table' | 'result' | 'upload' }) => {
  const configs = {
    table: {
      icon: Database,
      title: t('empty.noTables'),
      description: t('empty.noTablesHint'),
      action: t('actions.uploadFile'),
    },
    result: {
      icon: FileQuestion,
      title: t('empty.noResults'),
      description: t('empty.noResultsHint'),
      action: null,
    },
    upload: {
      icon: Upload,
      title: t('empty.noFiles'),
      description: t('empty.dragOrClick'),
      action: t('actions.selectFile'),
    },
  };

  const config = configs[type];
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
      <Icon className="w-10 h-10 mb-2 opacity-50" />
      <p className="font-medium">{config.title}</p>
      <p className="text-xs mt-1">{config.description}</p>
      {config.action && (
        <Button variant="link" className="mt-2">
          {config.action}
        </Button>
      )}
    </div>
  );
};
```

### 8.3 禁用状态

```typescript
// 按钮禁用
<Button 
  disabled={!selectedTable || isExecuting}
  className="disabled:opacity-50 disabled:cursor-not-allowed"
>
  {t('actions.execute')}
</Button>

// 输入框禁用
<Input
  disabled={isLoading}
  className="disabled:bg-muted disabled:cursor-not-allowed"
/>

// 选择器禁用
<Select disabled={!tables.length}>
  <SelectTrigger className="disabled:opacity-50">
    <SelectValue placeholder={t('query.builder.selectTable')} />
  </SelectTrigger>
</Select>
```

### 8.4 错误状态

```typescript
// 输入框错误状态
<div className="space-y-2">
  <Input
    className={cn(
      error && "border-error focus:ring-error"
    )}
    aria-invalid={!!error}
    aria-describedby={error ? "error-message" : undefined}
  />
  {error && (
    <p id="error-message" className="text-xs text-error">
      {error}
    </p>
  )}
</div>

// 表单错误提示
<Alert variant="destructive">
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>{t('error.validationFailed')}</AlertTitle>
  <AlertDescription>
    {errors.map((e, i) => <p key={i}>{e}</p>)}
  </AlertDescription>
</Alert>
```

---

## 九、键盘快捷键规范

### 9.1 SQL 编辑器快捷键

| 快捷键 | 功能 | 实现方式 |
|--------|------|---------|
| `Ctrl+Enter` / `Cmd+Enter` | 执行查询 | `onKeyDown` 事件 |
| `Ctrl+Shift+Enter` | 执行选中 SQL | 获取选中文本 |
| `Ctrl+S` / `Cmd+S` | 保存查询 | 阻止默认行为 |
| `Ctrl+/` | 注释/取消注释 | 编辑器 API |
| `Ctrl+Shift+F` | 格式化 SQL | sql-formatter |
| `Ctrl+Space` | 触发自动补全 | 编辑器 API |

### 9.2 全局快捷键

| 快捷键 | 功能 |
|--------|------|
| `Esc` | 关闭对话框/弹窗 |
| `Ctrl+K` / `Cmd+K` | 打开命令面板 |
| `Ctrl+Shift+P` | 打开命令面板（备选） |

### 9.3 实现示例

```typescript
import { useEffect, useCallback } from 'react';

const useKeyboardShortcuts = (handlers: Record<string, () => void>) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    // Ctrl/Cmd + Enter: 执行
    if (modifier && e.key === 'Enter') {
      e.preventDefault();
      handlers.execute?.();
    }

    // Ctrl/Cmd + S: 保存
    if (modifier && e.key === 's') {
      e.preventDefault();
      handlers.save?.();
    }

    // Ctrl/Cmd + K: 命令面板
    if (modifier && e.key === 'k') {
      e.preventDefault();
      handlers.commandPalette?.();
    }

    // Esc: 关闭
    if (e.key === 'Escape') {
      handlers.close?.();
    }
  }, [handlers]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};

// 使用
useKeyboardShortcuts({
  execute: () => executeMutation.mutate(sql),
  save: () => saveQuery(),
  close: () => setDialogOpen(false),
});
```

### 9.4 快捷键提示 UI

```typescript
// 在 Tooltip 中显示快捷键
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button onClick={handleExecute}>
        <Play className="h-4 w-4 mr-2" />
        {t('actions.execute')}
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>{t('actions.execute')}</p>
      <kbd className="ml-2 text-xs bg-muted px-1 rounded">
        {isMac ? '⌘' : 'Ctrl'}+Enter
      </kbd>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

## 十、性能优化参数

### 10.1 虚拟滚动配置

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

const rowVirtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 35,  // 行高 35px
  overscan: 10,            // 预渲染 10 行
});

// 列虚拟化（大量列时）
const columnVirtualizer = useVirtualizer({
  horizontal: true,
  count: columns.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 150,  // 列宽 150px
  overscan: 3,              // 预渲染 3 列
});
```

### 10.2 防抖/节流参数

| 场景 | 延迟时间 | 方式 | 说明 |
|------|---------|------|------|
| 搜索输入 | 300ms | debounce | 用户停止输入后触发 |
| 窗口调整 | 100ms | throttle | 限制触发频率 |
| 滚动事件 | 16ms | throttle | 60fps |
| 自动保存 | 1000ms | debounce | 用户停止编辑后保存 |
| API 请求 | 500ms | debounce | 防止重复请求 |

```typescript
import { useDebouncedCallback, useThrottledCallback } from 'use-debounce';

// 搜索防抖
const debouncedSearch = useDebouncedCallback(
  (value: string) => setSearchTerm(value),
  300
);

// 滚动节流
const throttledScroll = useThrottledCallback(
  (e: Event) => handleScroll(e),
  16
);
```

### 10.3 大数据集处理

```typescript
// 常量配置
const PERFORMANCE_CONFIG = {
  MAX_PREVIEW_ROWS: 10000,        // 预览最大行数
  MAX_DISTINCT_VALUES: 1000,      // distinct values 最大数量
  SAMPLE_SIZE: 10000,             // 采样大小
  LARGE_DATASET_THRESHOLD: 100000, // 大数据集阈值
  CHUNK_SIZE: 1000,               // 分块处理大小
  VIRTUAL_SCROLL_THRESHOLD: 100,  // 启用虚拟滚动的行数阈值
};

// 大数据集检测
const isLargeDataset = (rowCount: number) => 
  rowCount > PERFORMANCE_CONFIG.LARGE_DATASET_THRESHOLD;

// 分块处理
const processInChunks = async <T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  chunkSize = PERFORMANCE_CONFIG.CHUNK_SIZE
) => {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(chunk.map(processor));
    // 让出主线程
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};
```

### 10.4 缓存策略

```typescript
// TanStack Query 缓存配置
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,    // 5 分钟内数据新鲜
      gcTime: 30 * 60 * 1000,      // 30 分钟后清理
      refetchOnWindowFocus: false, // 窗口聚焦不自动刷新
      retry: 3,                    // 失败重试 3 次
    },
  },
});

// 特定查询的缓存配置
const { data } = useQuery({
  queryKey: ['duckdb-tables'],
  queryFn: getDuckDBTables,
  staleTime: 5 * 60 * 1000,       // 表列表 5 分钟缓存
});

const { data: stats } = useQuery({
  queryKey: ['column-stats', table, column],
  queryFn: () => getColumnStatistics(table, column),
  staleTime: 10 * 60 * 1000,      // 列统计 10 分钟缓存
  gcTime: 60 * 60 * 1000,         // 1 小时后清理
});
```

---

## 十一、检查清单

### 11.1 开发前检查

- [ ] 确认使用 TypeScript（`.tsx` 文件）
- [ ] 确认导入 shadcn/ui 组件
- [ ] 确认使用 TanStack Query
- [ ] 确认使用语义化 Tailwind 类名
- [ ] 确认所有文案使用 i18n

### 11.2 API 调用检查

- [ ] 使用现有 apiClient 函数
- [ ] 使用正确的 queryKey（kebab-case）
- [ ] 配置合理的缓存策略
- [ ] 数据变更后调用缓存失效函数
- [ ] 有完整的错误处理

### 11.3 UI 状态检查

- [ ] 有加载状态（Skeleton 或 Spinner）
- [ ] 有空状态（图标 + 文案）
- [ ] 有错误状态（Alert 或 Toast）
- [ ] 有禁用状态（opacity + cursor）

### 11.4 可访问性检查

- [ ] 所有按钮有 aria-label
- [ ] 表单元素有关联的 label
- [ ] 支持键盘导航
- [ ] 颜色对比度符合 WCAG 2.1 AA

### 11.5 性能检查

- [ ] 大数据集使用虚拟滚动
- [ ] 搜索输入使用防抖
- [ ] 避免不必要的重渲染
- [ ] 使用 useMemo/useCallback 优化

### 11.6 代码审查检查

- [ ] 无硬编码颜色值
- [ ] 无直接 CSS 变量引用
- [ ] 无 useState + useEffect + fetch 模式
- [ ] 有完整的 TypeScript 类型定义
- [ ] 有错误处理和加载状态
- [ ] 所有文案已添加翻译

---

**版本**: 1.1  
**更新时间**: 2024-12-11  
**适用范围**: demo-to-new-migration 所有任务  
**状态**: ✅ 强制执行
