---
inclusion: always
---
# 当前项目状态约束规则（2026-01 更新）

> **最后更新**: 2026-05-23  
> **版本**: 2.2  
> **状态**: ✅ 已验证与代码一致

## 🎯 项目当前状态

### 1. 已完成的架构升级

#### 前端架构
- ✅ **TypeScript 迁移**: 全部使用 TypeScript
- ✅ **API 模块化**: 统一的 TypeScript API 模块 (`frontend/src/api/`)
- ✅ **TanStack Query**: 统一的数据获取和缓存管理
- ✅ **Shadcn/UI**: 统一使用 shadcn/ui + Tailwind CSS
- ✅ **结果表格**: TanStack DataGrid（`Query/DataGrid` + `DataGridWrapper`）

#### 后端架构
- ✅ **连接池管理**: `DuckDBConnectionPool` 统一管理数据库连接
- ✅ **异步任务系统**: 基于连接池的非阻塞任务执行
- ✅ **联邦查询**: 支持 ATTACH 外部数据库的联邦查询
- ✅ **统一响应格式**: `response_helpers.py` 提供标准化响应
- ✅ **时区统一**: `timezone_utils.py` 提供统一时区处理

### 2. 当前技术栈

#### 前端
| 技术 | 版本/说明 | 用途 |
|------|----------|------|
| React | 18 | UI 框架 |
| TypeScript | 5.x | 类型系统 |
| Vite | 5.x | 构建工具 |
| TanStack Query | 5.x | 数据获取与缓存 |
| TanStack Table | 8.x | 查询结果 DataGrid |
| Shadcn/UI | Latest | UI 组件库 |
| Tailwind CSS | 3.x | 样式框架 |
| Lucide React | Latest | 图标库 |
| React Hook Form | 7.x | 表单管理 |
| Zod | 3.x | 模式验证 |
| Axios | 1.x | HTTP 客户端 |
| React i18next | Latest | 国际化 |

#### 后端
| 技术 | 版本/说明 | 用途 |
|------|----------|------|
| Python | 3.11+ | 运行时 |
| FastAPI | Latest | Web 框架 |
| DuckDB | Latest | 数据库引擎 |
| Pydantic | 2.x | 数据验证 |
| Uvicorn | Latest | ASGI 服务器 |

### 3. 核心模块状态

#### 前端核心模块

| 模块 | 路径 | 状态 | 说明 |
|------|------|------|------|
| **API 客户端** | `frontend/src/api/` | ✅ 完成 | TypeScript 模块化 API |
| **数据获取 Hooks** | `frontend/src/hooks/` | ✅ 完成 | TanStack Query hooks |
| **缓存失效工具** | `frontend/src/utils/cacheInvalidation.ts` | ✅ 完成 | 统一缓存管理 |
| **UI 组件库** | `frontend/src/components/ui/` | ✅ 完成 | Shadcn/UI 组件 |
| **布局组件** | `frontend/src/Layout/` | ✅ 完成 | Sidebar, Header, PageShell |
| **查询工作台** | `frontend/src/Query/` | ✅ 完成 | 多种查询模式 |
| **数据源管理** | `frontend/src/DataSource/` | ✅ 完成 | 数据库连接、文件上传 |
| **TanStack DataGrid** | `frontend/src/Query/DataGrid/` | ✅ 完成 | 结果表格 |
| **DataGrid 包装器** | `frontend/src/Query/ResultPanel/DataGridWrapper.tsx` | ✅ 完成 | 查询结果区封装 |

#### 后端核心模块

| 模块 | 路径 | 状态 | 说明 |
|------|------|------|------|
| **连接池** | `api/core/database/duckdb_pool.py` | ✅ 完成 | 线程安全连接池 |
| **任务管理器** | `api/core/services/task_manager.py` | ✅ 完成 | 异步任务管理 |
| **配置管理器** | `api/core/common/config_manager.py` | ✅ 完成 | 应用配置管理 |
| **时区工具** | `api/core/common/timezone_utils.py` | ✅ 完成 | 统一时区处理 |
| **响应辅助函数** | `api/utils/response_helpers.py` | ✅ 完成 | 统一响应格式 |
| **异步任务 API** | `api/routers/async_tasks.py` | ✅ 完成 | 异步任务端点 |
| **查询 API** | `api/routers/duckdb_query.py` | ✅ 完成 | DuckDB 查询端点 |
| **数据源 API** | `api/routers/datasources.py` | ✅ 完成 | 数据源管理端点 |

### 4. API 端点规范

#### 当前端点命名规范

| 资源 | 端点 | 状态 | 说明 |
|------|------|------|------|
| DuckDB 表 | `/api/duckdb/tables` | ✅ 推荐 | 新端点（kebab-case） |
| DuckDB 查询 | `/api/duckdb/execute` | ✅ 推荐 | 本地查询 |
| 联邦查询 | `/api/duckdb/federated-query` | ✅ 推荐 | 外部数据库查询 |
| 异步任务 | `/api/async_query` | ✅ 推荐 | 异步任务提交 |
| 数据源 | `/api/datasources` | ✅ 推荐 | 数据源管理 |
| 数据库连接 | `/api/datasources/databases` | ✅ 推荐 | 数据库连接 CRUD |
| 粘贴数据 | `/api/paste-data` | ✅ 推荐 | 粘贴数据创建表 |
| URL 导入 | `/api/url-reader/import` | ✅ 推荐 | URL 文件导入 |

### 5. 数据获取模式

#### 使用 TanStack Query Hook

```typescript
// ✅ 正确：使用 TanStack Query Hook
import { useDuckDBTables } from '@/hooks/useDuckDBTables';

function MyComponent() {
  const { tables, isLoading, refresh } = useDuckDBTables();
  // ...
}
```

#### API 调用方式

```typescript
// ✅ 正确：使用 TypeScript API 模块
import { getDuckDBTables, executeDuckDBSQL } from '@/api';

// 获取表列表
const tables = await getDuckDBTables();

// 执行查询
const result = await executeDuckDBSQL({
  sql: 'SELECT * FROM my_table',
  isPreview: true
});
```

### 6. 缓存管理模式

```typescript
// ✅ 正确：使用缓存失效工具
import { useQueryClient } from '@tanstack/react-query';
import {
  invalidateAllDataCaches,
  invalidateAfterFileUpload,
  invalidateAfterTableDelete,
  invalidateAfterTableCreate,
  invalidateAfterDatabaseChange,
} from '@/utils/cacheInvalidation';

const queryClient = useQueryClient();

// 异步任务完成后
await invalidateAllDataCaches(queryClient);

// 文件上传后
await invalidateAfterFileUpload(queryClient);

// 表删除后
await invalidateAfterTableDelete(queryClient);

// 表创建后
await invalidateAfterTableCreate(queryClient);

// 数据库连接变更后
await invalidateAfterDatabaseChange(queryClient);
```

### 7. 表格组件策略

#### 双表格组件共存

| 组件 | 状态 | 使用场景 | 说明 |
|------|------|----------|------|
| **DataGrid** | ✅ 现行 | 查询结果展示 | TanStack Table |
| **DataGridWrapper** | ✅ 现行 | `ResultPanel` | 结果区封装 |
| ~~AG Grid~~ | 已移除 | — | 依赖已从 `package.json` 删除 |

### 8. 文件组织规范

#### 前端目录结构

```
frontend/src/
├── api/                          # TypeScript API 模块
│   ├── client.ts                 # Axios 客户端配置
│   ├── types.ts                  # 共享类型定义
│   ├── queryApi.ts               # 查询 API
│   ├── dataSourceApi.ts          # 数据源 API
│   ├── tableApi.ts               # 表 API
│   ├── fileApi.ts                # 文件 API
│   ├── asyncTaskApi.ts           # 异步任务 API
│   ├── pivotQueryApi.ts          # 透视查询 API（`/api/pivot-query/*`）
│   ├── databaseSchemasApi.ts     # 外部库 schemas / 表
│   ├── settingsShortcutsApi.ts   # 快捷键配置
│   └── index.ts                  # 统一导出
├── hooks/                        # TanStack Query Hooks
│   ├── useDuckDBTables.ts        # DuckDB 表列表
│   ├── useDataSources.ts         # 数据源列表
│   ├── useDatabaseConnections.ts # 数据库连接
│   ├── useTableColumns.ts        # 表列信息
│   ├── useSchemas.ts             # Schema 列表
│   └── ...
├── utils/                        # 工具函数
│   ├── cacheInvalidation.ts      # 缓存失效工具
│   ├── sqlUtils.ts               # SQL 工具
│   └── ...
├── Query/                        # 查询工作台
│   ├── SQLQuery/                 # SQL 查询
│   ├── JoinQuery/                # 连接查询
│   ├── PivotTable/               # 透视表（原 Visual 构建器已移除）
│   ├── SetOperations/            # 集合操作
│   ├── ResultPanel/              # 结果面板
│   ├── DataGrid/                 # TanStack DataGrid
│   ├── DataSourcePanel/          # 数据源面板
│   ├── AsyncTasks/               # 异步任务
│   └── QueryTabs/                # 查询标签页
├── DataSource/                   # 数据源管理
├── Layout/                       # 布局组件
├── Settings/                     # 设置页面
├── components/                   # 通用组件
│   └── ui/                       # Shadcn/UI 组件库
├── providers/                    # Context Providers
├── i18n/                         # 国际化
├── styles/                       # 样式文件
└── main.tsx                      # 应用入口
```

#### 后端目录结构

```
api/
├── core/                         # 核心模块
│   ├── common/                   # 通用工具
│   │   ├── config_manager.py     # 配置管理
│   │   ├── timezone_utils.py     # 时区工具
│   │   └── cache_manager.py      # 缓存管理
│   ├── data/                     # 数据处理
│   │   ├── file_datasource_manager.py  # 文件数据源
│   │   └── excel_import_manager.py     # Excel 导入
│   ├── database/                 # 数据库
│   │   ├── duckdb_engine.py      # DuckDB 引擎
│   │   └── database_manager.py   # 数据库管理
│   └── services/                 # 服务层
│       └── task_manager.py       # 任务管理
├── routers/                      # API 路由
│   ├── async_tasks.py            # 异步任务
│   ├── duckdb_query.py           # DuckDB 查询
│   ├── datasources.py            # 数据源管理
│   ├── file_ingestion.py         # 文件入湖（上传、Excel）
│   ├── join_query.py             # 多表 JOIN /api/query
│   ├── paste_data.py             # 粘贴数据
│   ├── url_reader.py             # URL 导入
│   └── settings.py               # 设置
├── models/                       # Pydantic 模型
├── utils/                        # 工具函数
│   └── response_helpers.py       # 响应辅助函数
├── tests/                        # 测试
└── main.py                       # 应用入口
```

## 🚫 当前禁止的修改

### 前端

- **禁止使用 MUI 组件**
- **禁止使用 `useState` + `useEffect` 管理服务端数据**（必须使用 TanStack Query）
- **禁止绕过 `cacheInvalidation.ts` 自行实现缓存刷新**
- **禁止引入自定义 CSS 文件**（除第三方库官方 CSS）
- **禁止使用 Tailwind arbitrary values**（如 `text-[11px]`）
- **禁止硬编码颜色**（必须使用 Tailwind 语义类）
- **禁止直接使用 fetch**（必须使用 `@/api` 模块）

### 后端

- **禁止使用全局单例 DuckDB 连接**（必须使用连接池）
- **禁止在路由中直接创建 DuckDB 连接**（必须通过连接池）
- **禁止忽略异步任务完成后的元数据记录**
- **禁止返回不符合统一响应格式的响应**
- **禁止混用时区函数**（元数据用 `get_current_time_iso()`，连接用 `get_current_time()`）

## ✅ 当前必须遵循的规范

### 前端数据获取

```typescript
// ✅ 必须：使用 TanStack Query Hook
import { useDuckDBTables } from '@/hooks/useDuckDBTables';

const { tables, isLoading, refresh } = useDuckDBTables();
```

### 前端 API 调用

```typescript
// ✅ 必须：使用 TypeScript API 模块
import { getDuckDBTables, deleteDuckDBTableEnhanced } from '@/api';

const tables = await getDuckDBTables();
await deleteDuckDBTableEnhanced(tableName);
```

### 前端缓存失效

```typescript
// ✅ 必须：使用缓存失效工具函数
import { invalidateAfterTableCreate } from '@/utils/cacheInvalidation';

await invalidateAfterTableCreate(queryClient);
```

### 后端连接管理

```python
# ✅ 必须：使用连接池
from core.database.duckdb_engine import with_duckdb_connection

with with_duckdb_connection() as conn:
    result = conn.execute(sql).fetchall()
```

### 后端响应格式

```python
# ✅ 必须：使用统一响应格式
from utils.response_helpers import create_success_response, MessageCode

return create_success_response(
    data={"tables": tables},
    message_code=MessageCode.TABLES_RETRIEVED
)
```

### 后端时区处理

```python
# ✅ 必须：正确使用时区函数
from core.common.timezone_utils import get_current_time_iso, get_current_time

# 保存文件数据源元数据
file_info = {
    "created_at": get_current_time_iso(),  # ISO 字符串
}

# 数据库连接
connection.created_at = get_current_time()  # datetime 对象
```

### 后端表名处理

```python
# ✅ 必须：正确处理表名
from core.data.excel_import_manager import sanitize_identifier

# 用户提供了表别名 - 尊重用户输入
source_id = sanitize_identifier(
    table_alias, 
    allow_leading_digit=True,
    prefix="table"
)

# 使用文件名作为默认值 - 避免数字开头
source_id = sanitize_identifier(
    filename, 
    allow_leading_digit=False,
    prefix="table"
)
```

## 📁 关键文件索引

### 前端关键文件

| 文件 | 用途 | 状态 |
|------|------|------|
| `frontend/src/api/index.ts` | API 模块统一导出 | ✅ 最新 |
| `frontend/src/api/client.ts` | Axios 客户端配置 | ✅ 最新 |
| `frontend/src/api/types.ts` | 共享类型定义 | ✅ 最新 |
| `frontend/src/api/queryApi.ts` | 查询 API 函数 | ✅ 最新 |
| `frontend/src/api/tableApi.ts` | 表 API 函数 | ✅ 最新 |
| `frontend/src/api/dataSourceApi.ts` | 数据源 API 函数 | ✅ 最新 |
| `frontend/src/api/fileApi.ts` | 文件 API 函数 | ✅ 最新 |
| `frontend/src/hooks/useDuckDBTables.ts` | DuckDB 表 Hook | ✅ 最新 |
| `frontend/src/hooks/useDataSources.ts` | 数据源 Hook | ✅ 最新 |
| `frontend/src/hooks/useDatabaseConnections.ts` | 数据库连接 Hook | ✅ 最新 |
| `frontend/src/utils/cacheInvalidation.ts` | 缓存失效工具 | ✅ 最新 |
| `frontend/src/Query/DataGrid/DataGrid.tsx` | TanStack DataGrid | ✅ 最新 |
| `frontend/src/Query/ResultPanel/DataGridWrapper.tsx` | 结果区 DataGrid 包装 | ✅ 最新 |

### 后端关键文件

| 文件 | 用途 | 状态 |
|------|------|------|
| `api/main.py` | 应用入口 | ✅ 最新 |
| `api/core/common/timezone_utils.py` | 时区工具 | ✅ 最新 |
| `api/core/common/config_manager.py` | 配置管理 | ✅ 最新 |
| `api/core/data/file_datasource_manager.py` | 文件数据源管理 | ✅ 最新 |
| `api/core/data/excel_import_manager.py` | Excel 导入管理 | ✅ 最新 |
| `api/utils/response_helpers.py` | 响应辅助函数 | ✅ 最新 |
| `api/routers/async_tasks.py` | 异步任务 API | ✅ 最新 |
| `api/routers/duckdb_query.py` | DuckDB 查询 API | ✅ 最新 |
| `api/routers/datasources.py` | 数据源 API | ✅ 最新 |
| `api/routers/file_ingestion.py` | 文件入湖 API | ✅ 最新 |
| `api/routers/join_query.py` | JOIN 查询 API | ✅ 最新 |
| `api/routers/paste_data.py` | 粘贴数据 API | ✅ 最新 |

## 🔗 相关文档

- [AGENTS.md](../../AGENTS.md) - 项目开发规范总览
- [TanStack Query 使用标准](./tanstack-query-standards.md)
- [Shadcn/UI 使用标准](./shadcn-ui-standards.md)
- [数据源刷新模式](./data-source-refresh-patterns.md)
- [API 响应格式标准](./api-response-format-standard.md)
- [TypeScript API 模块标准](./typescript-api-module-standards.md)
- [前端 Hooks 使用指南](../../frontend/src/hooks/README.md)
- [DataGrid 组件文档](../../frontend/src/Query/DataGrid/README.md)

---

**维护者**: 项目团队  
**审核周期**: 每月更新  
**反馈渠道**: 项目 Issue 或 PR
