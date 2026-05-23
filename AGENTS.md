# DuckQuery 项目 AGENT 规则（v3.3）

> **更新时间**：2026-05-18  
> **适用范围**：全项目（前端、后端、测试、文档）  
> **权威性**：本文件为唯一 AGENT 约束来源。  
> **契约真相表**：`frontend/src/api/*` 在用路径、部署入口与字段语义见 [`docs/API_CONTRACT_FE_BE.md`](docs/API_CONTRACT_FE_BE.md)（与 §9 响应格式互补）。**改 API 时须先更新该表，再改后端与 `frontend/src/api/*`。**  
> **调用链路**：入湖 / 查询 / 元数据 / 异步的全局调用图见 [`docs/ARCHITECTURE_CALL_MAP.md`](docs/ARCHITECTURE_CALL_MAP.md)；改相关逻辑前先对照该文档。

---

## 目录
1. 项目架构与技术栈  
2. 目录结构与关键文件  
2.1 前后端契约与 PR 模板  
3. 运行与测试  
4. 前端开发规范  
5. UI / 样式规范（**禁止自定义**）  
6. 查询结果表格（TanStack DataGrid）  
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
| 表格 | TanStack Table + DataGrid（查询结果区） |
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
│       │   ├── queryApi.ts           # 查询 API（含取消同步查询等）
│       │   ├── tableApi.ts           # 表 API
│       │   ├── dataSourceApi.ts      # 数据源 API
│       │   ├── databaseSchemasApi.ts # 外部库 schemas / 表列表 / 表详情
│       │   ├── settingsShortcutsApi.ts # 设置：快捷键 API
│       │   ├── fileApi.ts            # 文件 API
│       │   ├── asyncTaskApi.ts       # 异步任务 API
│       │   ├── visualQueryApi.ts     # 可视化查询 / 收藏 / 应用配置 API
│       │   ├── setOperationsApi.ts   # 集合运算 API
│       │   ├── joinQueryApi.ts       # 多表 JOIN（POST /api/query）
│       │   └── index.ts              # 统一导出（@/api）
│       ├── hooks/                    # 共享 Hooks（TanStack Query）⭐
│       │   ├── useDuckDBTables.ts    # DuckDB 表列表
│       │   ├── useDataSources.ts     # 数据源列表
│       │   ├── useDatabaseConnections.ts # 数据库连接
│       │   ├── useTableColumns.ts    # 表列信息
│       │   ├── useSchemas.ts         # Schema 列表（经 @/api → listConnectionSchemas）
│       │   ├── useSchemaTables.ts    # Schema 下表列表（经 @/api）
│       │   └── ...
│       ├── utils/                    # 工具函数 ⭐
│       │   ├── cacheInvalidation.ts  # 缓存失效工具
│       │   ├── sqlUtils.ts           # SQL 工具
│       │   └── ...
│       ├── Query/                    # 查询相关组件
│       │   ├── SQLQuery/             # SQL 查询编辑器
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
│   ├── API_CONTRACT_FE_BE.md         # 前后端 API 契约真相表（按域 / 端点 / data 语义）
│   └── archive/                      # 已废止文档（勿作实现依据）
├── .github/                          # CI / PR 模板
│   └── pull_request_template.md      # PR：契约与验证勾选
└── docker-compose.yml
```

**关键文件索引**

| 文件 | 用途 |
|------|------|
| `frontend/src/api/index.ts` | API 模块统一导出（`@/api`） |
| `frontend/src/api/types.ts` | 共享类型定义（StandardSuccess, StandardError 等） |
| `frontend/src/api/client.ts` | `apiClient`、`normalizeResponse`、错误归一化 |
| `frontend/src/api/queryApi.ts` | DuckDB / 联邦执行、`cancelSyncQuery` 等 |
| `frontend/src/api/visualQueryApi.ts` | 可视化预览 / 生成 SQL、收藏、应用配置 |
| `frontend/src/api/joinQueryApi.ts` | 结构化 JOIN：`performJoinQuery` |
| `frontend/src/api/setOperationsApi.ts` | 集合运算 generate / validate / execute 等 |
| `frontend/src/api/databaseSchemasApi.ts` | 外部库 schemas / 表 / 表详情 |
| `frontend/src/api/settingsShortcutsApi.ts` | 快捷键配置 API |
| `docs/API_CONTRACT_FE_BE.md` | 端点契约表（与后端路由、`normalizeResponse` 对齐） |
| `docs/ARCHITECTURE_CALL_MAP.md` | 全局分域调用图（入湖 / 查询 / 元数据 / 异步 / 可视化） |
| `.github/pull_request_template.md` | PR 自检：契约 / lint / pytest |
| `frontend/src/hooks/useDuckDBTables.ts` | DuckDB 表列表 Hook |
| `frontend/src/hooks/useDataSources.ts` | 数据源列表 Hook |
| `frontend/src/hooks/useDatabaseConnections.ts` | 数据库连接 Hook |
| `frontend/src/utils/cacheInvalidation.ts` | 缓存失效工具 |
| `frontend/src/Query/ResultPanel/DataGridWrapper.tsx` | 查询结果 DataGrid 封装 |
| `frontend/src/Query/DataGrid/DataGrid.tsx` | TanStack DataGrid 组件 |
| `api/utils/response_helpers.py` | 统一响应格式 |
| `api/core/common/timezone_utils.py` | 时区工具 |
| `api/routers/async_tasks.py` | 异步任务 API |
| `api/routers/file_ingestion.py` | 文件入湖（上传、Excel） |
| `api/routers/join_query.py` | 多表 JOIN、`/api/query`、结果入湖 |
| `api/routers/duckdb_query.py` | DuckDB / 联邦 SQL 执行 |

### 2.1 前后端契约与 PR 模板

| 资源 | 用途 |
|------|------|
| [`docs/API_CONTRACT_FE_BE.md`](docs/API_CONTRACT_FE_BE.md) | 端点、成功体、`data` 字段语义、前端消费入口；**与后端路由、§9.2 同源维护** |
| [`.github/pull_request_template.md`](.github/pull_request_template.md) | PR 勾选：是否改 API、是否已更新契约表、验证命令 |

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
fetch('/api/duckdb/tables');                // ❌ 禁止对本后端 /api 裸 fetch（须 @/api + apiClient）
import { extractMessage } from '@/api/client'; // ❌ 禁止业务文件深路径（须 import { extractMessage } from '@/api'）
```

**允许的 `fetch`（须在代码中注释说明）**：仅访问**第三方** URL（如 GitHub）。本后端动态路径仍须 `apiClient`（见 `useQueryExecution`）。

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
- ✅ 推荐可辨.resource + kebab：`['duckdb-tables']`、`['datasources', id]`、`['async-tasks']`
- 现有代码中仍有 `['schemas', connectionId]`、`['schema-tables', …]` 等历史 Key；**新功能**优先采用上表风格；若重命名 Key，须同步 `cacheInvalidation.ts` 等前缀失效逻辑。
- ❌ 过于泛化：`['tables']`、`['getTables']`、`['duckdb_tables']`

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

## 6. 查询结果表格（TanStack DataGrid）

- 结果区**仅**使用 `ResultPanel` → `DataGridWrapper` → `Query/DataGrid/DataGrid.tsx`（TanStack Table + 虚拟滚动）
- 列定义经 `useDataGridColumns` 生成（类型检测、数值/日期/布尔格式化）
- 禁止再引入 `ag-grid-community` / `ag-grid-react`
- 列配置与 `columns` 引用须 `useMemo` 稳定化，避免无意义重渲染

---

## 7. 状态管理与数据获取

### 7.1 状态管理
- 业务状态集中在 `useAppShell` (`frontend/src/hooks/useAppShell.ts`)
- 状态机/全局状态在 `frontend/src/hooks/` 下的独立 Hook 中完成

### 7.2 API 调用
- **必须使用** `frontend/src/api/` 下的封装函数；**业务代码**（`frontend/src` 下除 `frontend/src/api/` 自身实现文件外）应 **`import { … } from '@/api'`**（与 `index.ts` 导出一致），禁止 `import … from '@/api/xxxApi'`、`@/api/client`、`@/api/types` 等深路径。
- **`frontend/src/api/*.ts` 内部**：模块之间仍用相对路径（如 `./client`、`./types`），**禁止**在 api 子模块内 `from '@/api'`（避免 barrel 循环依赖）。
- **禁止**对本项目后端 `/api/...` 使用裸 **`fetch`** 或未走 `apiClient` 的 **`axios`**，以免绕过统一错误体、`normalizeResponse`、超时与请求头约定。
- **例外**（须注释「第三方」或「动态端点待收敛」）：第三方 HTTP；本仓库内动态 endpoint（如 `useQueryExecution`）**仍须** `apiClient`，禁止裸 `fetch`。新增固定 `/api/...` 端点时**须**在 `frontend/src/api/` 增加封装并改为经 `apiClient`；**新增**的 client 工具函数须从 `client.ts` 再导出到 `index.ts`，业务侧仍只从 `@/api` 导入。

```tsx
// ✅ 正确
import { executeDuckDBSQL, getDuckDBTables, listConnectionSchemas } from '@/api';

const result = await executeDuckDBSQL({ sql, isPreview: true });
const tables = await getDuckDBTables();

// ❌ 错误（本后端）
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

### 9.5 前后端契约维护（与 `docs/API_CONTRACT_FE_BE.md` 一致）

| 动作 | 顺序 |
|------|------|
| 修改某端点 JSON 形状或语义 | 1）更新 `docs/API_CONTRACT_FE_BE.md` 对应行；2）改 `api/routers/*` 与 Pydantic；3）改 `frontend/src/api/*` 类型与解包；4）改调用方 / 单测。 |
| 新增 `/api/...` 端点 | 契约表新增一行后再实现；前端须经 `apiClient` + `normalizeResponse`（列表用 `items`/`total`）。 |
| 列表 vs 对象成功体 | 后端列表用 `create_list_response`；前端 `normalizeResponse` 会填充 `items`（见 `client.ts`）。 |

**说明**：网关或代理若改写 JSON，以线上 Network 为准；契约表以仓库内 FastAPI 与 `response_helpers` 为准。

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
cd api
python -m pytest tests -q
```

---

## 11. 质量检查清单（提交前）

### UI
- [ ] 仅使用 shadcn/ui + Tailwind 标准类
- [ ] 图标统一 lucide-react
- [ ] 无硬编码颜色 / CSS var / `!important`

### 数据获取
- [ ] 使用 TanStack Query
- [ ] 本后端请求经 `@/api`（`apiClient`），无未说明的裸 `fetch`
- [ ] QueryKey 常量化；新代码优先 kebab.resource 风格
- [ ] Mutation 后调用缓存刷新

### API / 契约
- [ ] 若改响应字段或端点：已同步 [`docs/API_CONTRACT_FE_BE.md`](docs/API_CONTRACT_FE_BE.md)

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

### 12.1 透视表 Tab（**禁止误删**）

查询工作台「透视表」为**在产功能**（`QueryTabs` → `PivotPanel`），清理时**不得**删除或整文件移除：

| 层级 | 路径 |
|------|------|
| 前端 UI | `frontend/src/Query/PivotTable/`（`PivotPanel`、`PivotTableDesigner`、`buildPivotQueryPayload`） |
| 前端 API | `frontend/src/api/visualQueryApi.ts` 的 `generatePivotVisualQuery` / `previewPivotVisualQuery` |
| 后端路由 | `api/routers/visual_query.py`（`/api/visual-query/generate`、`/preview`） |
| SQL 生成 | `api/core/services/pivot_query_generator.py`、`visual_query_sql_common.py` |
| 表元数据 | `api/core/services/table_metadata_service.py` |
| 集合运算 SQL | `api/core/services/set_operation_generator.py` |

已移除 **Visual 构建器**（`frontend/src/Query/VisualQuery/`、HTTP `mode=regular`、`/api/visual-query/validate` 等）及后端 `regular_query_generator`、构建器专用 Pydantic 字段。透视路径见 `PivotTable/*` 与 `POST /api/visual-query/*`。

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **duckdb-query** (12234 symbols, 21948 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/duckdb-query/context` | Codebase overview, check index freshness |
| `gitnexus://repo/duckdb-query/clusters` | All functional areas |
| `gitnexus://repo/duckdb-query/processes` | All execution flows |
| `gitnexus://repo/duckdb-query/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
