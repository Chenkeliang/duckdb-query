# DuckQuery 项目开发规范

> **版本**: 2.0  
> **更新时间**: 2024-12-12  
> **适用范围**: 全项目（前端、后端、测试）

---

## 目录

1. [项目架构](#项目架构)
2. [目录结构](#目录结构)
3. [运行与测试](#运行与测试)
4. [前端开发规范](#前端开发规范)
5. [后端开发规范](#后端开发规范)
6. [API 规范](#api-规范)
7. [数据获取规范](#数据获取规范)
8. [UI 与样式规范](#ui-与样式规范)
9. [组件规范](#组件规范)
10. [状态管理规范](#状态管理规范)
11. [测试规范](#测试规范)
12. [代码质量检查清单](#代码质量检查清单)
13. [代理约束](#代理约束)

---

## 项目架构

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + Vite + TypeScript |
| UI 组件 | 新布局: shadcn/ui + Tailwind CSS / 旧布局: MUI v5 |
| 状态管理 | TanStack Query（服务端状态）+ React Hooks（本地状态）|
| 数据表格 | AG Grid v34 Community（legacy CSS 主题模式）|
| 后端框架 | FastAPI + Python 3.11+ |
| 数据库 | DuckDB（嵌入式 OLAP）|
| 国际化 | react-i18next |

### 双入口架构

项目存在两个独立入口，必须严格隔离：

| 入口 | 路径 | UI 组件 | 样式方案 | 状态管理 |
|------|------|---------|----------|----------|
| 旧入口 | `ShadcnApp.jsx` | MUI v5 | modern.css | useState + useEffect |
| 新入口 | `DuckQueryApp.tsx` | shadcn/ui | Tailwind CSS | TanStack Query |

**隔离规则**：
- 新布局代码禁止导入 MUI 组件
- 新布局代码禁止引用 modern.css
- 旧布局代码禁止导入 shadcn/ui 组件
- 旧布局代码保持不变，不做修改


---

## 目录结构

### 项目根目录

```
duckquery/
├── api/                          # 后端 FastAPI 应用
│   ├── core/                     # 核心模块
│   │   ├── duckdb_engine.py      # DuckDB 查询引擎
│   │   ├── duckdb_pool.py        # DuckDB 连接池
│   │   ├── task_manager.py       # 异步任务管理
│   │   ├── database_manager.py   # 数据库连接管理
│   │   └── ...
│   ├── routers/                  # API 路由
│   │   ├── async_tasks.py        # 异步任务端点
│   │   ├── duckdb_query.py       # DuckDB 查询端点
│   │   ├── datasources.py        # 数据源管理端点
│   │   ├── query.py              # 通用查询端点
│   │   └── ...
│   ├── models/                   # Pydantic 数据模型
│   │   ├── datasource_models.py  # 数据源模型
│   │   ├── query_models.py       # 查询模型
│   │   └── visual_query_models.py # 可视化查询模型
│   ├── services/                 # 业务逻辑服务
│   ├── utils/                    # 工具函数
│   │   └── response_helpers.py   # 统一响应格式
│   ├── tests/                    # 后端测试
│   └── main.py                   # 应用入口
│
├── frontend/                     # 前端 React 应用
│   └── src/
│       ├── new/                  # 新布局（shadcn/ui）⭐ 新功能开发区
│       │   ├── components/ui/    # shadcn/ui 组件库
│       │   ├── Layout/           # 布局组件（Sidebar, Header, PageShell）
│       │   ├── DataSource/       # 数据源管理组件
│       │   ├── Query/            # 查询相关组件
│       │   │   ├── VisualQuery/  # 可视化查询构建器
│       │   │   ├── SQLQuery/     # SQL 查询编辑器
│       │   │   ├── ResultPanel/  # 结果展示面板（AG Grid）
│       │   │   ├── DataSourcePanel/ # 数据源树形面板
│       │   │   ├── AsyncTasks/   # 异步任务面板
│       │   │   └── QueryTabs/    # 查询标签页
│       │   ├── hooks/            # 共享 Hooks（TanStack Query）
│       │   ├── providers/        # Context Providers
│       │   └── utils/            # 工具函数
│       │
│       ├── components/           # 旧布局（MUI）- 保持不变
│       ├── services/             # API 客户端
│       │   ├── apiClient.js      # 统一 API 调用
│       │   └── asyncTasks.js     # 异步任务服务
│       ├── styles/               # 样式文件
│       │   ├── tailwind.css      # CSS 变量定义（新布局）
│       │   └── modern.css        # 旧布局样式
│       └── i18n/                 # 国际化配置
│
├── config/                       # 配置文件
├── docs/                         # 文档
├── temp_files/                   # 临时文件（不提交）
├── exports/                      # 导出文件
└── docker-compose.yml            # Docker 配置
```

### 关键文件索引

| 文件 | 用途 |
|------|------|
| `api/main.py` | 后端入口 |
| `api/core/duckdb_pool.py` | DuckDB 连接池管理 |
| `api/routers/async_tasks.py` | 异步任务 API |
| `api/routers/duckdb_query.py` | DuckDB 查询 API |
| `api/utils/response_helpers.py` | 统一响应格式 |
| `frontend/src/new/hooks/useDuckDBTables.ts` | 表列表 Hook |
| `frontend/src/new/Query/ResultPanel/AGGridWrapper.tsx` | AG Grid 封装 |
| `frontend/src/services/apiClient.js` | 前端 API 客户端 |
| `frontend/src/styles/tailwind.css` | CSS 变量定义 |
| `frontend/tailwind.config.js` | Tailwind 配置 |


---

## 运行与测试

### 后端

```bash
# 进入 api 目录
cd api

# 启动开发服务器
python -m uvicorn main:app --reload --port 8000

# 运行测试
python -m pytest tests -q

# 类型检查
python -m mypy .
```

### 前端

```bash
# 进入 frontend 目录
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 代码检查
npm run lint

# 类型检查
npx tsc --noEmit

# 构建生产版本
npm run build
```

### Docker

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

---

## 前端开发规范

### 文件命名

| 类型 | 命名规则 | 示例 |
|------|----------|------|
| 组件文件 | PascalCase.tsx | `DataPasteCard.tsx` |
| Hook 文件 | camelCase.ts（use 前缀）| `useDuckDBTables.ts` |
| 工具函数 | camelCase.ts | `cacheInvalidation.ts` |
| 测试文件 | *.test.tsx / *.test.ts | `useDuckDBTables.test.tsx` |
| 常量 | UPPER_SNAKE_CASE | `DUCKDB_TABLES_QUERY_KEY` |

### 导入规范

```tsx
// ✅ 新布局正确导入
import { Button } from '@/new/components/ui/button';
import { Card } from '@/new/components/ui/card';
import { Home, Database } from 'lucide-react';
import { useDuckDBTables } from '@/new/hooks/useDuckDBTables';
import { useQuery } from '@tanstack/react-query';

// ❌ 新布局禁止导入
import { Button } from '@mui/material';           // 禁止
import '@/styles/modern.css';                     // 禁止
import { useState, useEffect } from 'react';      // 用于数据获取时禁止
```

### TypeScript 规范

```tsx
// ✅ Props 必须定义接口
interface DataPasteCardProps {
  onDataSourceSaved?: (source: DataSource) => void;
  showNotification?: (message: string, severity: string) => void;
  initialData?: string;
}

export function DataPasteCard({ 
  onDataSourceSaved, 
  showNotification, 
  initialData = '' 
}: DataPasteCardProps) {
  // 组件实现
}

// ✅ 使用 zod 进行表单验证
import { z } from 'zod';

const formSchema = z.object({
  host: z.string().min(1, '主机地址不能为空'),
  port: z.number().min(1).max(65535),
  database: z.string().min(1, '数据库名不能为空'),
});

type FormData = z.infer<typeof formSchema>;

// ❌ 禁止滥用 any
const data: any = response;  // 禁止
```

### 编码风格

- 组件使用函数式组件 + Hooks
- 优先使用 const 声明
- 使用解构赋值获取 props
- 复杂逻辑抽取为自定义 Hook
- 公共组件必须添加 JSDoc 注释


---

## 后端开发规范

### 编码风格

- 遵循 PEP 8 规范
- 公共 API 必须有 docstring 和类型标注
- 时间统一使用 UTC（naive datetime）
- 路由命名使用 kebab-case（如 `visual-query`、`async-tasks`）

### DuckDB 连接管理

```python
# ✅ 使用连接池，避免阻塞
from core.duckdb_pool import DuckDBConnectionPool

pool = DuckDBConnectionPool()

async def execute_query(sql: str):
    async with pool.get_connection() as conn:
        return conn.execute(sql).fetchall()

# ❌ 禁止全局单例连接（会导致阻塞）
global_conn = duckdb.connect()  # 禁止
```

### 异步任务处理

```python
# ✅ 使用统一的异步任务端点
@router.post("/api/async_query")
async def create_async_query(request: AsyncQueryRequest):
    task_id = str(uuid.uuid4())
    background_tasks.add_task(
        execute_async_query,
        task_id=task_id,
        sql=request.sql,
        pool=pool
    )
    return {"task_id": task_id, "status": "pending"}

# ❌ 禁止使用旧端点
@router.post("/api/async-tasks/create")  # 禁止
```

### 响应格式

所有 API 必须使用统一响应格式：

```python
from utils.response_helpers import (
    create_success_response,
    create_error_response,
    create_list_response,
    MessageCode
)

# ✅ 成功响应
@router.post("/api/resource")
async def create_resource(data: ResourceCreate):
    result = service.create(data)
    return create_success_response(
        data={"resource": result},
        message_code=MessageCode.CONNECTION_CREATED
    )

# ✅ 错误响应
return create_error_response(
    code="OPERATION_FAILED",
    message=f"创建失败: {str(e)}",
    details={"error": str(e)}
)

# ✅ 列表响应
return create_list_response(
    items=[ds.dict() for ds in datasources],
    total=len(datasources),
    message_code=MessageCode.DATASOURCES_RETRIEVED
)
```

---

## API 规范

### 端点统一

| 操作 | 端点 | 方法 |
|------|------|------|
| 获取 DuckDB 表列表 | `/api/duckdb/tables` | GET |
| 删除 DuckDB 表 | `/api/duckdb/tables/{table_name}` | DELETE |
| 获取表详情 | `/api/duckdb/tables/detail/{table_name}` | GET |
| 执行 DuckDB SQL | `/api/duckdb/execute` | POST |
| 创建异步任务 | `/api/async_query` | POST |
| 获取异步任务列表 | `/api/async_tasks` | GET |
| 获取异步任务状态 | `/api/async_tasks/{task_id}` | GET |
| 取消异步任务 | `/api/async_tasks/{task_id}/cancel` | POST |
| 获取数据源列表 | `/api/datasources` | GET |
| 创建数据库连接 | `/api/datasources/databases` | POST |
| 测试数据库连接 | `/api/datasources/databases/test` | POST |
| 可视化查询生成 | `/api/visual-query/generate` | POST |
| 可视化查询预览 | `/api/visual-query/preview` | POST |

### 响应格式标准

**成功响应**：
```json
{
  "success": true,
  "data": { ... },
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
    "total": 100
  },
  "messageCode": "LIST_RETRIEVED",
  "message": "获取列表成功",
  "timestamp": "2024-12-02T19:08:05.123456Z"
}
```

### 前端 API 调用

```tsx
// ✅ 使用增强版 API 函数
import { 
  fetchDuckDBTableSummaries,
  deleteDuckDBTableEnhanced,
  submitAsyncQuery 
} from '@/services/apiClient';

// 获取表列表
const tables = await fetchDuckDBTableSummaries();

// 删除表
await deleteDuckDBTableEnhanced(tableName);

// 提交异步查询
const task = await submitAsyncQuery({ sql: query });

// ❌ 禁止使用旧版 API
import { getDuckDBTables } from '@/services/apiClient';  // 禁止
```


---

## 数据获取规范

### TanStack Query 强制使用

新布局中所有服务端数据获取必须使用 TanStack Query：

```tsx
// ❌ 禁止：传统 fetch 模式
const [data, setData] = useState([]);
const [loading, setLoading] = useState(false);

useEffect(() => {
  setLoading(true);
  fetch('/api/tables')
    .then(res => res.json())
    .then(setData)
    .finally(() => setLoading(false));
}, []);

// ✅ 正确：使用 TanStack Query
import { useQuery } from '@tanstack/react-query';

const { data, isLoading, isError } = useQuery({
  queryKey: ['duckdb-tables'],
  queryFn: fetchDuckDBTableSummaries,
  staleTime: 5 * 60 * 1000,
});
```

### 共享 Hook 模式

对于多组件共享的数据，必须创建共享 Hook：

```tsx
// frontend/src/new/hooks/useDuckDBTables.ts

export const DUCKDB_TABLES_QUERY_KEY = ['duckdb-tables'] as const;

export const useDuckDBTables = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: DUCKDB_TABLES_QUERY_KEY,
    queryFn: fetchDuckDBTableSummaries,
    staleTime: 5 * 60 * 1000,      // 5 分钟内新鲜
    gcTime: 10 * 60 * 1000,        // 10 分钟后清理
    refetchOnWindowFocus: true,    // 窗口聚焦时刷新
    refetchOnMount: false,         // 优先使用缓存
  });

  const tables = Array.isArray(query.data?.tables) ? query.data.tables : [];

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: DUCKDB_TABLES_QUERY_KEY });
    return query.refetch();
  };

  return {
    tables,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refresh,
  };
};
```

### QueryKey 命名规范

```tsx
// ✅ 正确命名（kebab-case）
['duckdb-tables']
['datasources']
['datasources', id]
['async-tasks']
['query-results', queryId]

// ❌ 错误命名
['tables']           // 太泛化
['getTables']        // 不要用函数名
['duckdb_tables']    // 使用 kebab-case，不是 snake_case
```

### 缓存失效策略

```tsx
// 数据变更后必须刷新缓存
const queryClient = useQueryClient();

const handleDelete = async (tableName: string) => {
  await deleteDuckDBTableEnhanced(tableName);
  // 必须使缓存失效
  await queryClient.invalidateQueries({ queryKey: ['duckdb-tables'] });
};

// 批量失效
await Promise.all([
  queryClient.invalidateQueries({ queryKey: ['duckdb-tables'] }),
  queryClient.invalidateQueries({ queryKey: ['datasources'] }),
]);
```

### Mutation 模式

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

const queryClient = useQueryClient();

const deleteMutation = useMutation({
  mutationFn: deleteDuckDBTableEnhanced,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['duckdb-tables'] });
    toast.success('删除成功');
  },
  onError: (error) => {
    toast.error(`删除失败: ${error.message}`);
  },
});
```


---

## UI 与样式规范

### 三层架构（强制执行）

```
┌─────────────────────────────────────────────────────────────┐
│  1. 定义层 (tailwind.css)                                   │
│     定义 CSS 变量: --dq-surface, --dq-foreground, etc.      │
├─────────────────────────────────────────────────────────────┤
│  2. 映射层 (tailwind.config.js)                             │
│     映射为 Tailwind 类名: bg-surface, text-foreground       │
├─────────────────────────────────────────────────────────────┤
│  3. 使用层 (组件)                                           │
│     只使用 Tailwind 类名，禁止直接使用 CSS 变量              │
└─────────────────────────────────────────────────────────────┘
```

### 语义化类名速查表

#### 背景色
| 类名 | 用途 |
|------|------|
| `bg-background` | 页面背景 |
| `bg-surface` | 卡片/面板背景（最常用）|
| `bg-surface-hover` | 悬停状态背景 |
| `bg-surface-elevated` | 浮层背景（对话框、下拉菜单）|
| `bg-muted` | 次要背景（标签页背景、禁用态）|
| `bg-primary` | 主色调背景（按钮、徽章）|
| `bg-input` | 输入框背景 |

#### 文本颜色
| 类名 | 用途 |
|------|------|
| `text-foreground` | 主要文本（标题、正文）|
| `text-muted-foreground` | 次要文本（说明、标签）|
| `text-primary` | 主色调文本（链接、强调）|
| `text-primary-foreground` | 主色调背景上的文本 |

#### 边框
| 类名 | 用途 |
|------|------|
| `border-border` | 标准边框（最常用）|
| `border-border-subtle` | 更淡的边框（表格内线）|
| `border-primary` | 主色调边框（激活状态）|

#### 状态颜色
| 状态 | 主色 | 背景 | 边框 |
|------|------|------|------|
| Success | `text-success` / `bg-success` | `bg-success-bg` | `border-success-border` |
| Warning | `text-warning` / `bg-warning` | `bg-warning-bg` | `border-warning-border` |
| Error | `text-error` / `bg-error` | `bg-error-bg` | `border-error-border` |
| Info | `text-info` / `bg-info` | `bg-info-bg` | `border-info-border` |

#### 圆角系统
| 类名 | 尺寸 | 用途 |
|------|------|------|
| `rounded-sm` | 4px | 极小元素 |
| `rounded-md` | 6px | 输入框/按钮（默认）|
| `rounded-lg` | 8px | 标签页、列表项 |
| `rounded-xl` | 12px | 卡片（最常用）|
| `rounded-2xl` | 16px | 大卡片 |
| `rounded-full` | 50% | 圆形（头像、指示器）|

#### Z-Index 层级（使用语义化类名）
| 类名 | 值 | 用途 |
|------|-----|------|
| `z-dropdown` | 1000 | 下拉菜单、选择器 |
| `z-sticky` | 1020 | 粘性元素 |
| `z-fixed` | 1030 | 固定元素 |
| `z-modal-backdrop` | 1040 | 模态背景 |
| `z-modal` | 1050 | 模态内容 |
| `z-popover` | 1060 | Popover |
| `z-tooltip` | 1070 | Tooltip |
| `z-notification` | 1080 | 通知 |

#### 动画时长
| 类名 | 时长 | 用途 |
|------|------|------|
| `duration-fast` | 150ms | 悬停效果、按钮状态 |
| `duration-normal` | 200ms | 标准过渡（默认）|
| `duration-slow` | 300ms | 展开/收起 |
| `duration-slower` | 500ms | 页面切换 |

### 样式禁止清单

```tsx
// ❌ 禁止硬编码颜色
<div style={{ color: '#fff' }}>              // 禁止
<div className="bg-blue-500">                // 禁止
<div className="text-green-600">             // 禁止

// ❌ 禁止直接使用 CSS 变量
<div style={{ color: 'var(--dq-foreground)' }}>  // 禁止

// ❌ 禁止使用 !important
.my-class { color: red !important; }         // 禁止

// ❌ 禁止随意 z-index
<div className="z-[9999]">                   // 禁止
<div className="z-50">                       // 禁止

// ❌ 禁止创建自定义 CSS 主题文件
// 如 ag-grid-theme.css 中的 --ag-* 变量覆盖

// ✅ 正确做法
<div className="text-foreground">            // 正确
<div className="bg-primary">                 // 正确
<div className="text-success">               // 正确
<div className="z-modal">                    // 正确
```


---

## 组件规范

### shadcn/ui 组件使用

新布局必须使用 shadcn/ui 组件：

```tsx
// ✅ 正确导入
import { Button } from '@/new/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/new/components/ui/card';
import { Input } from '@/new/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/new/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/new/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/new/components/ui/tooltip';
```

### 标准组件模式

#### 卡片容器
```tsx
<Card className="bg-surface border-border shadow-sm">
  <CardHeader>
    <CardTitle className="text-foreground">标题</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* 内容 */}
  </CardContent>
</Card>
```

#### 按钮
```tsx
// 主按钮
<Button variant="default">确认</Button>

// 次要按钮
<Button variant="outline">取消</Button>

// 危险按钮
<Button variant="destructive">删除</Button>

// 图标按钮（必须有 aria-label）
<Button variant="ghost" size="icon" aria-label="设置">
  <Settings className="h-4 w-4" />
</Button>
```

#### 输入框
```tsx
<Input 
  placeholder="请输入..."
  className="bg-input border-border"
/>
```

### AG Grid 配置（v34）

AG Grid v34 必须使用 legacy CSS 主题模式：

```tsx
// AGGridWrapper.tsx
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
// 禁止导入自定义主题 CSS

const gridOptions: GridOptions = {
  // 必须设置 theme: 'legacy' 禁用 Theming API
  theme: 'legacy',
  // ... 其他配置
};

// 主题类名切换
const themeClass = isDarkMode ? 'ag-theme-alpine-dark' : 'ag-theme-alpine';

return (
  <div className={`${themeClass} h-full w-full`}>
    <AgGridReact {...props} />
  </div>
);
```

**重要**：AG Grid v34 默认启用 Theming API（themeQuartz），会覆盖 CSS 主题变量。必须设置 `theme: 'legacy'` 才能使用 Alpine CSS 主题。

### 图标使用

新布局统一使用 lucide-react：

```tsx
import { 
  Home, 
  Database, 
  Settings, 
  Plus, 
  Trash2, 
  RefreshCw,
  ChevronRight,
  ChevronDown 
} from 'lucide-react';

// ❌ 禁止使用 MUI Icons
import { Home } from '@mui/icons-material';  // 禁止
```

### 可访问性要求

```tsx
// ✅ 图标按钮必须有 aria-label
<Button variant="ghost" size="icon" aria-label="刷新">
  <RefreshCw className="h-4 w-4" />
</Button>

// ✅ 表单字段必须有 label
<div className="space-y-2">
  <Label htmlFor="host">主机地址</Label>
  <Input id="host" placeholder="localhost" />
</div>

// ✅ 对话框必须支持 Esc 关闭
<Dialog open={open} onOpenChange={setOpen}>
  {/* 内容 */}
</Dialog>
```


---

## 状态管理规范

### 状态分类

| 状态类型 | 管理方式 | 示例 |
|----------|----------|------|
| 服务端状态 | TanStack Query | 表列表、数据源列表、异步任务 |
| 本地 UI 状态 | useState | 对话框开关、表单输入、展开/收起 |
| 跨组件状态 | Context / Zustand | 主题、用户偏好 |

### 服务端状态（TanStack Query）

```tsx
// ✅ 使用 TanStack Query 管理服务端状态
const { data: tables, isLoading } = useDuckDBTables();
const { data: datasources } = useDataSources();

// ❌ 禁止使用 useState + useEffect 获取服务端数据
const [tables, setTables] = useState([]);
useEffect(() => {
  fetchTables().then(setTables);
}, []);
```

### 本地 UI 状态

```tsx
// ✅ 简单 UI 状态使用 useState
const [isOpen, setIsOpen] = useState(false);
const [searchTerm, setSearchTerm] = useState('');
const [selectedTab, setSelectedTab] = useState('visual');
```

### 表单状态

```tsx
// ✅ 使用 react-hook-form + zod
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const form = useForm<FormData>({
  resolver: zodResolver(formSchema),
  defaultValues: {
    host: '',
    port: 3306,
  },
});
```

### 异步任务状态

```tsx
// 异步任务完成后必须刷新相关数据
const handleTaskCompleted = async (task: AsyncTask) => {
  if (task.status === 'completed') {
    // 刷新表列表
    await queryClient.invalidateQueries({ queryKey: ['duckdb-tables'] });
    // 显示成功通知
    toast.success('任务完成');
  }
};
```

---

## 测试规范

### 测试文件位置

```
frontend/src/new/
├── Component/
│   ├── Component.tsx
│   └── __tests__/
│       └── Component.test.tsx
├── hooks/
│   ├── useHook.ts
│   └── __tests__/
│       └── useHook.test.tsx
```

### 测试命名

```tsx
describe('useDuckDBTables', () => {
  it('should return empty array when no data', () => {});
  it('should return tables when data is available', () => {});
  it('should handle loading state correctly', () => {});
  it('should handle error state correctly', () => {});
});
```

### 测试覆盖要求

- 核心业务逻辑必须有单元测试
- 共享 Hooks 必须有测试
- 关键用户流程必须有集成测试
- 测试数据不能硬编码

### 后端测试

```bash
# 运行所有测试
python -m pytest tests -q

# 运行特定测试
python -m pytest tests/test_async_tasks.py -v

# 生成覆盖率报告
python -m pytest tests --cov=. --cov-report=html
```


---

## 代码质量检查清单

### 提交前必检

#### 样式与主题
- [ ] 零硬编码颜色（`#hex`、`rgb()`、`hsl()`、Tailwind 原色如 `bg-blue-500`）
- [ ] 零直接使用 CSS 变量（`var(--dq-*)`）
- [ ] 零 `!important` 使用
- [ ] 零自定义 CSS 主题文件
- [ ] 明/暗模式对比度达标
- [ ] Z-Index 使用语义化类名

#### 数据获取
- [ ] 使用 TanStack Query 而非 useState + useEffect
- [ ] QueryKey 使用常量并导出
- [ ] 数据变更后调用 invalidateQueries
- [ ] 共享数据创建共享 Hook

#### TypeScript
- [ ] Props 有类型定义
- [ ] 无 `any` 类型滥用
- [ ] 函数参数有类型注解
- [ ] 使用 zod 进行表单验证

#### 组件
- [ ] 使用 shadcn/ui 组件（新布局）
- [ ] 图标使用 lucide-react
- [ ] 图标按钮有 aria-label
- [ ] 表单字段有 label

#### API
- [ ] 使用统一响应格式
- [ ] 使用增强版 API 函数
- [ ] 错误处理完善

#### 构建验证
- [ ] `npm run build` 成功
- [ ] `npm run lint` 无错误
- [ ] `npx tsc --noEmit` 无错误

---

## 代理约束

### 行为约束

- 未经指示不修改代码；仅分析则不动代码
- 避免新增 `!important`，优先使用 shadcn/ui 组件和 Tailwind 语义化类名
- 禁止创建自定义 CSS 主题文件（如 `--ag-*` 变量覆盖）
- 清理未用样式/组件前先用 `grep` 查引用，确认无用再删
- 不做全局安装，避免触碰非项目文件
- 提交前清理敏感的 `temp_files/`

### 提交规范

```
feat: 添加数据粘贴功能
fix: 修复表格刷新问题
refactor: 重构数据源面板
docs: 更新 API 文档
style: 调整按钮样式
test: 添加单元测试
chore: 更新依赖版本
```

### 文档更新

- 行为变更必须更新 `docs/CHANGELOG.md`
- 仅在范围变更时改 `README.md`
- 配置示例保持脱敏（`config/*.example`）

---

## 参考资源

### 官方文档
- [TanStack Query](https://tanstack.com/query/latest)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [AG Grid](https://www.ag-grid.com/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [react-hook-form](https://react-hook-form.com/)
- [zod](https://zod.dev/)

### 项目文档
- `frontend/src/new/hooks/README.md` - Hook 使用文档
- `frontend/src/new/docs/` - 前端文档
- `.kiro/steering/` - Steering 规则文件

---

**维护者**: DuckQuery Team  
**最后更新**: 2024-12-12
