# DuckQuery 项目 AGENT 规则（v3.2）

> **更新时间**：2026-01-19  
> **适用范围**：全项目（前端、后端、测试、文档）  
> **权威性**：本文件为唯一 AGENT 约束来源。

---

## 目录
1. 项目架构与技术栈  
2. 目录结构与关键文件  
3. 运行与测试  
4. 前端开发规范  
5. UI / 样式规范（**禁止自定义**）  
6. AG Grid v34 规范  
7. 状态管理与数据获取  
8. 后端开发规范  
9. API 与响应规范  
10. 测试规范  
11. 质量检查清单  
12. 代理行为约束

---

## 1. 项目架构与技术栈

### 技术栈
| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + Vite + TypeScript |
| UI 组件 | shadcn/ui + Tailwind CSS |
| 状态管理 | TanStack Query 5.x + React Hooks |
| 表格 | AG Grid v34 Community + TanStack Table |
| 后端框架 | FastAPI + Python 3.11+ |
| 数据库 | DuckDB（本地）+ MySQL/PostgreSQL/SQLite（联邦查询） |
| 国际化 | react-i18next |

### 入口文件
| 入口 | 路径 | 说明 |
|------|------|------|
| 前端主入口 | `frontend/src/main.tsx` | React 应用入口 |
| 查询工作台 | `frontend/src/QueryWorkbenchPage.tsx` | 查询主页面 |
| 后端入口 | `api/main.py` | FastAPI 应用入口 |

---

## 2. 目录结构与关键文件

```
duckdb-query/
├── api/                              # 后端 FastAPI
│   ├── core/                         # 核心模块
│   │   ├── common/                   # 通用工具（时区、配置、缓存）
│   │   ├── data/                     # 数据处理（文件导入、Excel）
│   │   ├── database/                 # 数据库引擎
│   │   └── services/                 # 服务层（任务管理）
│   ├── routers/                      # API 路由
│   ├── models/                       # Pydantic 模型
│   ├── utils/                        # 工具函数（响应格式）
│   └── tests/                        # 后端测试
├── frontend/
│   └── src/
│       ├── api/                      # TypeScript API 模块 ⭐
│       │   ├── client.ts             # Axios 客户端配置
│       │   ├── types.ts              # 共享类型定义
│       │   ├── queryApi.ts           # 查询 API
│       │   ├── tableApi.ts           # 表 API
│       │   ├── dataSourceApi.ts      # 数据源 API
│       │   ├── fileApi.ts            # 文件 API
│       │   ├── asyncTaskApi.ts       # 异步任务 API
│       │   ├── visualQueryApi.ts     # 可视化查询 API
│       │   └── index.ts              # 统一导出
│       ├── hooks/                    # 共享 Hooks（TanStack Query）⭐
│       │   ├── useDuckDBTables.ts    # DuckDB 表列表
│       │   ├── useDataSources.ts     # 数据源列表
│       │   ├── useDatabaseConnections.ts # 数据库连接
│       │   ├── useTableColumns.ts    # 表列信息
│       │   ├── useSchemas.ts         # Schema 列表
│       │   └── ...
│       ├── utils/                    # 工具函数 ⭐
│       │   ├── cacheInvalidation.ts  # 缓存失效工具
│       │   ├── sqlUtils.ts           # SQL 工具
│       │   └── ...
│       ├── Query/                    # 查询相关组件
│       │   ├── SQLQuery/             # SQL 查询编辑器
│       │   ├── VisualQuery/          # 可视化查询构建器
│       │   ├── JoinQuery/            # 连接查询
│       │   ├── PivotTable/           # 透视表
│       │   ├── SetOperations/        # 集合操作
│       │   ├── ResultPanel/          # 结果展示面板
│       │   ├── DataGrid/             # TanStack DataGrid
│       │   ├── DataSourcePanel/      # 数据源树形面板
│       │   ├── AsyncTasks/           # 异步任务面板
│       │   └── QueryTabs/            # 查询标签页
│       ├── DataSource/               # 数据源管理
│       ├── Layout/                   # 布局组件
│       ├── Settings/                 # 设置页面
│       ├── components/               # 通用组件
│       │   └── ui/                   # shadcn/ui 组件库
│       ├── providers/                # Context Providers
│       ├── styles/                   # 样式文件
│       │   └── tailwind.css          # Tailwind 主题变量
│       └── i18n/                     # 国际化
├── config/                           # 配置文件
├── docs/                             # 文档
└── docker-compose.yml
```

**关键文件索引**

| 文件 | 用途 |
|------|------|
| `frontend/src/api/index.ts` | API 模块统一导出 |
| `frontend/src/api/types.ts` | 共享类型定义（StandardSuccess, StandardError 等） |
| `frontend/src/hooks/useDuckDBTables.ts` | DuckDB 表列表 Hook |
| `frontend/src/hooks/useDataSources.ts` | 数据源列表 Hook |
| `frontend/src/hooks/useDatabaseConnections.ts` | 数据库连接 Hook |
| `frontend/src/utils/cacheInvalidation.ts` | 缓存失效工具 |
| `frontend/src/Query/ResultPanel/AGGridWrapper.tsx` | AG Grid 封装组件 |
| `frontend/src/Query/DataGrid/DataGrid.tsx` | TanStack DataGrid 组件 |
| `api/utils/response_helpers.py` | 统一响应格式 |
| `api/core/common/timezone_utils.py` | 时区工具 |
| `api/routers/async_tasks.py` | 异步任务 API |
| `api/routers/duckdb_query.py` | DuckDB 查询 API |

---

## 3. 运行与测试

### 后端
```bash
cd api
python -m uvicorn main:app --reload
python -m pytest tests -q
```

### 前端
```bash
cd frontend
npm install
npm run dev
npm run lint
npx tsc --noEmit
npm run build
```

---

## 4. 前端开发规范

### 4.1 文件与命名
| 类型 | 规则 | 示例 |
|------|------|------|
| 组件 | PascalCase.tsx | `DataPasteCard.tsx` |
| Hook | camelCase.ts（use 前缀） | `useDuckDBTables.ts` |
| 工具 | camelCase.ts | `cacheInvalidation.ts` |
| 测试 | *.test.tsx / *.test.ts | `useDuckDBTables.test.ts` |
| 常量 | UPPER_SNAKE_CASE | `DUCKDB_TABLES_QUERY_KEY` |

### 4.2 导入约束
**正确示例**
```tsx
// UI 组件
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// 图标
import { Home } from 'lucide-react';

// TanStack Query
import { useQuery } from '@tanstack/react-query';

// API 模块
import { executeDuckDBSQL, getDuckDBTables } from '@/api';

// Hooks
import { useDuckDBTables } from '@/hooks/useDuckDBTables';

// 工具函数
import { invalidateAfterTableCreate } from '@/utils/cacheInvalidation';
```

**禁止示例**
```tsx
import { Button } from '@mui/material';     // ❌ 禁止 MUI
import '@/styles/modern.css';               // ❌ 禁止旧样式
fetch('/api/duckdb/tables');                // ❌ 禁止直接 fetch
```

### 4.3 TypeScript 与表单
- Props 必须定义接口/类型
- 禁止滥用 `any`
- 表单使用 `react-hook-form + zod`

```tsx
interface DatabaseFormProps {
  onSaved?: () => void;
}

const schema = z.object({
  host: z.string().min(1),
  port: z.number().min(1).max(65535),
});
type FormData = z.infer<typeof schema>;
```

### 4.4 数据获取（TanStack Query 强制）
- 所有服务端数据必须使用 TanStack Query
- 禁止 `useEffect + fetch + useState` 管服务端数据
- 共享数据抽成 `frontend/src/hooks/` 的共享 Hook

**示例**
```tsx
import { useDuckDBTables } from '@/hooks/useDuckDBTables';

function MyComponent() {
  const { tables, isLoading, refresh } = useDuckDBTables();

  if (isLoading) return <div>加载中...</div>;

  return (
    <ul>
      {tables.map(table => (
        <li key={table.name}>{table.name}</li>
      ))}
    </ul>
  );
}
```

**QueryKey 命名**
- ✅ `['duckdb-tables']`、`['datasources', id]`、`['async-tasks']`
- ❌ `['tables']`、`['getTables']`、`['duckdb_tables']`

### 4.5 缓存刷新规则（强制）

任何创建/删除表的操作**必须**调用缓存刷新：

```tsx
import { 
  invalidateAfterTableCreate, 
  invalidateAfterTableDelete,
  invalidateAfterFileUpload,
  invalidateAllDataCaches,
} from '@/utils/cacheInvalidation';

// 创建表后
await invalidateAfterTableCreate(queryClient);

// 删除表后
await invalidateAfterTableDelete(queryClient);

// 文件上传后
await invalidateAfterFileUpload(queryClient);

// 异步任务完成后
await invalidateAllDataCaches(queryClient);
```

**必须刷新的场景清单**：
| 场景 | 刷新函数 |
|------|----------|
| SQL saveAsTable | `invalidateAllDataCaches()` |
| 可视化查询 saveAsTable | `invalidateAfterTableCreate()` |
| 粘贴数据创建表 | `invalidateAfterTableCreate()` |
| 文件上传/导入 | `invalidateAfterFileUpload()` |
| 表删除 | `invalidateAfterTableDelete()` |
| 数据库连接变更 | `invalidateAfterDatabaseChange()` |

---

## 5. UI / 样式规范（**禁止自定义**）

> **总原则**：只能使用 **shadcn/ui 组件 + Tailwind 类**。

### 5.1 禁止自定义清单
- ❌ 禁止新增/导入任何自定义 CSS 文件
- ❌ 禁止新增 CSS 变量/主题/设计 token
- ❌ 禁止 inline style（除非是动态尺寸/位置）
- ❌ 禁止 Tailwind arbitrary values（如 `text-[11px]`）
- ❌ 禁止硬编码颜色（`#hex`、`rgb()`）
- ❌ 禁止 `!important`

### 5.2 组件优先级
1. **优先 shadcn/ui**：Button / Input / Card / Dialog / Tabs / DropdownMenu / Tooltip / Toast
2. Tailwind 只做布局与间距
3. 不重复造轮子

### 5.3 图标
- 统一使用 `lucide-react`
- 禁止 MUI Icons

---

## 6. AG Grid v34 规范

### 6.1 只用官方 Alpine CSS 主题
```tsx
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
```

### 6.2 必须禁用 Theming API
```ts
gridOptions.theme = 'legacy';
```

### 6.3 配置对象稳定性
- `gridOptions` 和 `defaultColDef` 必须用 `useMemo` 包裹
- 事件回调中的 `setState` 必须做浅比较

---

## 7. 状态管理与数据获取

### 7.1 状态管理
- 业务状态集中在 `useAppShell` (`frontend/src/hooks/useAppShell.ts`)
- 状态机/全局状态在 `frontend/src/hooks/` 下的独立 Hook 中完成

### 7.2 API 调用
- **必须使用** `frontend/src/api/` TypeScript 模块
- **禁止** 直接使用 `fetch` 或 `axios`

```tsx
// ✅ 正确
import { executeDuckDBSQL, getDuckDBTables } from '@/api';

const result = await executeDuckDBSQL({ sql, isPreview: true });
const tables = await getDuckDBTables();

// ❌ 错误
const response = await fetch('/api/duckdb/tables');
```

---

## 8. 后端开发规范

### 8.1 基本规范
- 遵循 PEP 8
- 公共 API 必须有 docstring + 类型标注
- 路由命名 kebab-case

### 8.2 DuckDB 连接
- 使用 `with_duckdb_connection()` 上下文管理器
- 禁止模块级长连接/全局 duckdb.connect()

### 8.3 时区处理

**核心原则**：根据目标字段的数据类型选择函数，而不是根据业务场景。

```python
from core.common.timezone_utils import get_current_time_iso, get_current_time

# 需要字符串时（JSON 存储、API 响应）
created_at = get_current_time_iso()  # "2026-01-19T16:00:00+08:00"

# 需要 datetime 对象时（Pydantic 模型、数据库字段）
created_at = get_current_time()  # datetime 对象
```

| 目标类型 | 函数 | 使用场景 |
|----------|------|----------|
| `str` | `get_current_time_iso()` | JSON 文件、API 响应 |
| `datetime` | `get_current_time()` | Pydantic 模型、ORM |
| `datetime(UTC)` | `get_storage_time()` | DuckDB 存储 |

**注意**：两个函数返回的是**同一个时间点**，只是格式不同。
- **存储时间**：使用 `get_storage_time()` 返回 UTC naive datetime

```python
from core.common.timezone_utils import get_current_time_iso, get_current_time

# 保存文件数据源元数据
file_info = {
    "source_id": source_id,
    "created_at": get_current_time_iso(),  # ✅ ISO 字符串
}

# 数据库连接
connection.created_at = get_current_time()  # ✅ datetime 对象
```

### 8.4 表名处理
- 用户提供的表别名：`allow_leading_digit=True`（尊重用户输入）
- 文件名默认值：`allow_leading_digit=False`（避免数字开头）

```python
from core.data.excel_import_manager import sanitize_identifier

# 用户提供了表别名
source_id = sanitize_identifier(
    table_alias, 
    allow_leading_digit=True,  # ✅ 尊重用户输入
    prefix="table"
)

# 使用文件名作为默认值
source_id = sanitize_identifier(
    filename, 
    allow_leading_digit=False,  # ✅ 避免数字开头
    prefix="table"
)
```

---

## 9. API 与响应规范

### 9.1 端点命名
- 统一 `/api/...`
- 资源名 kebab-case

### 9.2 统一响应格式

**成功响应**：
```json
{
  "success": true,
  "data": {},
  "messageCode": "OPERATION_SUCCESS",
  "message": "操作成功",
  "timestamp": "2026-01-19T08:00:00.000Z"
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
  "timestamp": "2026-01-19T08:00:00.000Z"
}
```

**列表响应**：
```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 0
  },
  "messageCode": "ITEMS_RETRIEVED",
  "message": "获取列表成功",
  "timestamp": "2026-01-19T08:00:00.000Z"
}
```

### 9.3 后端使用
```python
from utils.response_helpers import create_success_response, create_list_response, MessageCode

# 成功响应
return create_success_response(
    data={"table": table_info},
    message_code=MessageCode.TABLE_CREATED
)

# 列表响应
return create_list_response(
    items=tables,
    total=len(tables),
    message_code=MessageCode.TABLES_RETRIEVED
)
```

### 9.4 前端类型
```typescript
// frontend/src/api/types.ts
interface StandardSuccess<T = unknown> {
  success: true;
  data: T;
  messageCode: string;
  message: string;
  timestamp: string;
}

interface StandardError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  messageCode: string;
  message: string;
  timestamp: string;
}
```

---

## 10. 测试规范

### 前端
- 组件/共享 Hook 必须有单测
- 测试文件放在同目录 `__tests__/`

```
frontend/src/hooks/useDuckDBTables.ts
frontend/src/hooks/__tests__/useDuckDBTables.test.ts
```

### 后端
```bash
python -m pytest api/tests -q
```

---

## 11. 质量检查清单（提交前）

### UI
- [ ] 仅使用 shadcn/ui + Tailwind 标准类
- [ ] 图标统一 lucide-react
- [ ] 无硬编码颜色 / CSS var / `!important`

### 数据获取
- [ ] 使用 TanStack Query
- [ ] 使用 `@/api` 模块
- [ ] QueryKey 常量化 + kebab-case
- [ ] Mutation 后调用缓存刷新

### 后端
- [ ] 使用统一响应格式
- [ ] 时区处理正确
- [ ] 表名处理正确

### 构建
- [ ] `npm run build` 通过
- [ ] `npm run lint` 无错误
- [ ] `npx tsc --noEmit` 无错误

---

## 12. 代理行为约束
- 未经指示不修改代码；仅分析则不动代码
- 不做全局安装，避免触碰非项目文件
- 清理/删除前先 grep 查引用，确认无用再删
