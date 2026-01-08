---
inclusion: always
---
# 当前项目状态约束规则（2026-01 更新）

> **最后更新**: 2026-01-08  
> **版本**: 2.0  
> **状态**: ✅ 已验证与代码一致

## 🎯 项目当前状态

### 1. 已完成的架构升级

#### 前端架构
- ✅ **双入口隔离**: 新旧布局完全分离，互不影响
  - 旧入口: `frontend/src/App.tsx` (保持不变，未来废弃)
  - 新入口: `frontend/src/main.tsx` → 新布局组件
- ✅ **TypeScript 迁移**: 新布局全部使用 TypeScript
- ✅ **API 模块化**: 统一的 TypeScript API 模块 (`frontend/src/api/`)
- ✅ **TanStack Query**: 统一的数据获取和缓存管理
- ✅ **Shadcn/UI**: 新布局统一使用 shadcn/ui + Tailwind CSS
- ✅ **双表格组件**: AG Grid (稳定) + TanStack DataGrid (新)

#### 后端架构
- ✅ **连接池管理**: `DuckDBConnectionPool` 统一管理数据库连接
- ✅ **异步任务系统**: 基于连接池的非阻塞任务执行
- ✅ **联邦查询**: 支持 ATTACH 外部数据库的联邦查询
- ✅ **统一响应格式**: `response_helpers.py` 提供标准化响应
- ✅ **元数据管理**: `metadata_manager.py` 统一管理表元数据

### 2. 当前技术栈

#### 前端（新布局 `frontend/src/new/`）
| 技术 | 版本/说明 | 用途 |
|------|----------|------|
| React | 18 | UI 框架 |
| TypeScript | 5.x | 类型系统 |
| Vite | 5.x | 构建工具 |
| TanStack Query | 5.x | 数据获取与缓存 |
| TanStack Table | 8.x | 表格组件（新 DataGrid） |
| AG Grid | v34 Community | 表格组件（稳定版） |
| Shadcn/UI | Latest | UI 组件库 |
| Tailwind CSS | 3.x | 样式框架 |
| Lucide React | Latest | 图标库 |
| React Hook Form | 7.x | 表单管理 |
| Zod | 3.x | 模式验证 |
| Axios | 1.x | HTTP 客户端 |
| React i18next | Latest | 国际化 |

#### 后端 (`api/`)
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
| **数据获取 Hooks** | `frontend/src/new/hooks/` | ✅ 完成 | TanStack Query hooks |
| **缓存失效工具** | `frontend/src/new/utils/cacheInvalidation.ts` | ✅ 完成 | 统一缓存管理 |
| **UI 组件库** | `frontend/src/new/components/ui/` | ✅ 完成 | Shadcn/UI 组件 |
| **布局组件** | `frontend/src/new/Layout/` | ✅ 完成 | Sidebar, Header, PageShell |
| **查询工作台** | `frontend/src/new/Query/` | ✅ 完成 | 多种查询模式 |
| **数据源管理** | `frontend/src/new/DataSource/` | ✅ 完成 | 数据库连接、文件上传 |
| **AG Grid 封装** | `frontend/src/new/Query/ResultPanel/AGGridWrapper.tsx` | ⚠️ 稳定 | 标记为 deprecated |
| **TanStack DataGrid** | `frontend/src/new/Query/DataGrid/` | ✅ 完成 | 新表格组件 |
| **DataGrid 包装器** | `frontend/src/new/Query/ResultPanel/DataGridWrapper.tsx` | ✅ 完成 | AG Grid 兼容接口 |

#### 后端核心模块

| 模块 | 路径 | 状态 | 说明 |
|------|------|------|------|
| **连接池** | `api/core/duckdb_pool.py` | ✅ 完成 | 线程安全连接池 |
| **任务管理器** | `api/core/task_manager.py` | ✅ 完成 | 异步任务管理 |
| **元数据管理器** | `api/core/metadata_manager.py` | ✅ 完成 | 表元数据管理 |
| **配置管理器** | `api/core/config_manager.py` | ✅ 完成 | 应用配置管理 |
| **响应辅助函数** | `api/utils/response_helpers.py` | ✅ 完成 | 统一响应格式 |
| **异步任务 API** | `api/routers/async_tasks.py` | ✅ 完成 | 异步任务端点 |
| **查询 API** | `api/routers/duckdb_query.py` | ✅ 完成 | DuckDB 查询端点 |
| **数据源 API** | `api/routers/datasources.py` | ✅ 完成 | 数据源管理端点 |

### 4. API 端点规范

#### 当前端点命名规范

| 资源 | 端点 | 状态 | 说明 |
|------|------|------|------|
| DuckDB 表 | `/api/duckdb/tables` | ✅ 推荐 | 新端点（kebab-case） |
| DuckDB 表 | `/api/duckdb_tables` | ⚠️ 兼容 | 旧端点（向后兼容） |
| DuckDB 查询 | `/api/duckdb/execute` | ✅ 推荐 | 本地查询 |
| 联邦查询 | `/api/duckdb/federated-query` | ✅ 推荐 | 外部数据库查询 |
| 异步任务 | `/api/async_query` | ✅ 推荐 | 异步任务提交 |
| 数据源 | `/api/datasources` | ✅ 推荐 | 数据源管理 |
| 数据库连接 | `/api/datasources/databases` | ✅ 推荐 | 数据库连接 CRUD |

#### 端点迁移状态

- ✅ **新布局**: 已全部使用新端点（`/api/duckdb/tables`）
- ⚠️ **旧端点保留**: 为向后兼容保留 `/api/duckdb_tables`
- 🎯 **迁移目标**: 最终废弃所有 snake_case 端点

### 5. 数据获取模式

#### 新布局（强制使用 TanStack Query）

```typescript
// ✅ 正确：使用 TanStack Query Hook
import { useDuckDBTables } from '@/new/hooks/useDuckDBTables';

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

#### 新布局（TanStack Query）

```typescript
// ✅ 正确：使用缓存失效工具
import { useQueryClient } from '@tanstack/react-query';
import {
  invalidateAllDataCaches,
  invalidateAfterFileUpload,
  invalidateAfterTableDelete,
  invalidateAfterTableCreate,
  invalidateAfterDatabaseChange,
} from '@/new/utils/cacheInvalidation';

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
| **AGGridWrapper** | ⚠️ Deprecated | 现有功能维护 | 标记为废弃，但仍可用 |
| **DataGrid** | ✅ 推荐 | 新功能开发 | 基于 TanStack Table |
| **DataGridWrapper** | ✅ 推荐 | AG Grid 迁移 | 提供 AG Grid 兼容接口 |

#### 迁移策略

1. **现有功能**: 继续使用 AGGridWrapper，保持稳定
2. **新功能**: 优先使用 DataGrid
3. **渐进迁移**: 通过 DataGridWrapper 逐步替换 AGGridWrapper
4. **用户选择**: ResultPanel 提供切换按钮，用户可选择表格组件

### 8. 文件组织规范

#### 前端目录结构

```
frontend/src/
├── api/                          # TypeScript API 模块（新）
│   ├── client.ts                 # Axios 客户端配置
│   ├── types.ts                  # 共享类型定义
│   ├── queryApi.ts               # 查询 API
│   ├── dataSourceApi.ts          # 数据源 API
│   ├── tableApi.ts               # 表 API
│   ├── fileApi.ts                # 文件 API
│   ├── asyncTaskApi.ts           # 异步任务 API
│   ├── visualQueryApi.ts         # 可视化查询 API
│   └── index.ts                  # 统一导出
├── new/                          # 新布局（shadcn/ui + TypeScript）
│   ├── components/
│   │   └── ui/                   # Shadcn/UI 组件库
│   ├── Layout/                   # 布局组件
│   ├── DataSource/               # 数据源管理
│   ├── Query/                    # 查询工作台
│   │   ├── SQLQuery/             # SQL 查询
│   │   ├── VisualQuery/          # 可视化查询
│   │   ├── JoinQuery/            # 连接查询
│   │   ├── PivotTable/           # 透视表
│   │   ├── SetOperations/        # 集合操作
│   │   ├── ResultPanel/          # 结果面板
│   │   ├── DataGrid/             # TanStack DataGrid
│   │   ├── DataSourcePanel/      # 数据源面板
│   │   ├── AsyncTasks/           # 异步任务
│   │   └── QueryTabs/            # 查询标签页
│   ├── hooks/                    # TanStack Query Hooks
│   ├── utils/                    # 工具函数
│   └── providers/                # Context Providers
├── i18n/                         # 国际化
├── styles/                       # 样式文件
└── main.tsx                      # 应用入口
```

#### 后端目录结构

```
api/
├── core/                         # 核心模块
│   ├── duckdb_pool.py            # 连接池
│   ├── task_manager.py           # 任务管理器
│   ├── metadata_manager.py       # 元数据管理器
│   ├── config_manager.py         # 配置管理器
│   └── duckdb_engine.py          # DuckDB 引擎
├── routers/                      # API 路由
│   ├── async_tasks.py            # 异步任务
│   ├── duckdb_query.py           # DuckDB 查询
│   ├── datasources.py            # 数据源管理
│   ├── query.py                  # 通用查询
│   └── settings.py               # 设置
├── models/                       # Pydantic 模型
├── utils/                        # 工具函数
│   └── response_helpers.py       # 响应辅助函数
├── tests/                        # 测试
└── main.py                       # 应用入口
```

## 🚫 当前禁止的修改

### 前端

- **禁止在新布局中使用 MUI 组件**
- **禁止在新布局中使用 `useState` + `useEffect` 管理服务端数据**（必须使用 TanStack Query）
- **禁止绕过 `cacheInvalidation.ts` 自行实现缓存刷新**
- **禁止在新布局中引入自定义 CSS 文件**（除第三方库官方 CSS）
- **禁止在新布局中使用 Tailwind arbitrary values**（如 `text-[11px]`）
- **禁止硬编码颜色**（必须使用 Tailwind 语义类）
- **禁止修改旧布局文件**（除非明确指示）

### 后端

- **禁止使用全局单例 DuckDB 连接**（必须使用连接池）
- **禁止在路由中直接创建 DuckDB 连接**（必须通过连接池）
- **禁止忽略异步任务完成后的元数据记录**
- **禁止返回不符合统一响应格式的响应**

## ✅ 当前必须遵循的规范

### 前端数据获取

```typescript
// ✅ 必须：使用 TanStack Query Hook
import { useDuckDBTables } from '@/new/hooks/useDuckDBTables';

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
import { invalidateAfterTableCreate } from '@/new/utils/cacheInvalidation';

await invalidateAfterTableCreate(queryClient);
```

### 后端连接管理

```python
# ✅ 必须：使用连接池
from core.duckdb_pool import pool

with pool.get_connection() as conn:
    result = conn.execute(sql).fetchall()
```

### 后端响应格式

```python
# ✅ 必须：使用统一响应格式
from utils.response_helpers import create_success_response, MessageCode

return create_success_response(
    data={"tables": tables},
    message_code=MessageCode.OPERATION_SUCCESS
)
```

## 📁 关键文件索引

### 前端关键文件

| 文件 | 用途 | 状态 |
|------|------|------|
| `frontend/src/api/index.ts` | API 模块统一导出 | ✅ 最新 |
| `frontend/src/api/client.ts` | Axios 客户端配置 | ✅ 最新 |
| `frontend/src/api/queryApi.ts` | 查询 API 函数 | ✅ 最新 |
| `frontend/src/api/tableApi.ts` | 表 API 函数 | ✅ 最新 |
| `frontend/src/api/dataSourceApi.ts` | 数据源 API 函数 | ✅ 最新 |
| `frontend/src/new/hooks/useDuckDBTables.ts` | DuckDB 表 Hook | ✅ 最新 |
| `frontend/src/new/hooks/useDataSources.ts` | 数据源 Hook | ✅ 最新 |
| `frontend/src/new/hooks/useDatabaseConnections.ts` | 数据库连接 Hook | ✅ 最新 |
| `frontend/src/new/utils/cacheInvalidation.ts` | 缓存失效工具 | ✅ 最新 |
| `frontend/src/new/Query/DataGrid/DataGrid.tsx` | TanStack DataGrid | ✅ 最新 |
| `frontend/src/new/Query/ResultPanel/AGGridWrapper.tsx` | AG Grid 封装 | ⚠️ Deprecated |
| `frontend/src/new/Query/ResultPanel/DataGridWrapper.tsx` | DataGrid 包装器 | ✅ 最新 |

### 后端关键文件

| 文件 | 用途 | 状态 |
|------|------|------|
| `api/main.py` | 应用入口 | ✅ 最新 |
| `api/core/duckdb_pool.py` | 连接池 | ✅ 最新 |
| `api/core/task_manager.py` | 任务管理器 | ✅ 最新 |
| `api/core/metadata_manager.py` | 元数据管理器 | ✅ 最新 |
| `api/utils/response_helpers.py` | 响应辅助函数 | ✅ 最新 |
| `api/routers/async_tasks.py` | 异步任务 API | ✅ 最新 |
| `api/routers/duckdb_query.py` | DuckDB 查询 API | ✅ 最新 |
| `api/routers/datasources.py` | 数据源 API | ✅ 最新 |

## 🎯 当前开发重点

### 短期目标（1-2 周）

1. ✅ 完成 TanStack DataGrid 稳定性验证
2. 🔄 逐步迁移 AGGridWrapper 到 DataGridWrapper
3. 🔄 完善联邦查询功能
4. 🔄 优化缓存配置可配置化

### 中期目标（1-2 月）

1. 📋 完全废弃旧端点（`/api/duckdb_tables`）
2. 📋 完全废弃 AGGridWrapper
3. 📋 完善测试覆盖率
4. 📋 性能优化和监控

### 长期目标（3-6 月）

1. 📋 完全移除旧布局代码
2. 📋 完善文档和示例
3. 📋 国际化完善
4. 📋 插件系统

## 📊 技术债务清单

| 项目 | 优先级 | 预计工作量 | 说明 |
|------|--------|-----------|------|
| 废弃旧 API 端点 | 🔴 高 | 1 周 | 移除 `/api/duckdb_tables` |
| 废弃 AGGridWrapper | 🟡 中 | 2 周 | 完全迁移到 DataGrid |
| 移除旧布局代码 | 🟢 低 | 1 月 | 清理 `frontend/src/components/` |
| 完善单元测试 | 🟡 中 | 持续 | 提升测试覆盖率 |
| 性能优化 | 🟡 中 | 持续 | 大数据量场景优化 |

## 🔗 相关文档

- [AGENTS.md](../../AGENTS.md) - 项目开发规范总览
- [TanStack Query 使用标准](./tanstack-query-standards.md)
- [Shadcn/UI 使用标准](./shadcn-ui-standards.md)
- [数据源刷新模式](./data-source-refresh-patterns.md)
- [API 响应格式标准](./api-response-format-standard.md)
- [前端 Hooks 使用指南](../../frontend/src/new/hooks/README.md)
- [DataGrid 组件文档](../../frontend/src/new/Query/DataGrid/README.md)

---

**维护者**: 项目团队  
**审核周期**: 每月更新  
**反馈渠道**: 项目 Issue 或 PR
