---
inclusion: always
---
# API 统一化约束规则（2026-01 更新）

> **最后更新**: 2026-01-08  
> **版本**: 2.0  
> **状态**: ✅ 已验证与代码一致

## 🎯 API 统一原则

### 1. 端点统一约束

#### 命名规范

- **格式**: `/api/{resource}/{action}` (kebab-case)
- **资源名**: 使用复数形式（tables, datasources, connections）
- **操作名**: 使用动词或名词（execute, test, refresh）

#### 标准端点

| 资源 | 端点 | 方法 | 状态 | 说明 |
|------|------|------|------|------|
| **DuckDB 表** | `/api/duckdb/tables` | GET | ✅ 推荐 | 获取表列表 |
| **DuckDB 表** | `/api/duckdb/tables/{name}` | GET | ✅ 推荐 | 获取表详情 |
| **DuckDB 表** | `/api/duckdb/tables/{name}` | DELETE | ✅ 推荐 | 删除表 |
| **DuckDB 表** | `/api/duckdb/tables/{name}/refresh` | POST | ✅ 推荐 | 刷新表元数据 |
| **DuckDB 查询** | `/api/duckdb/execute` | POST | ✅ 推荐 | 执行本地查询 |
| **联邦查询** | `/api/duckdb/federated-query` | POST | ✅ 推荐 | 执行联邦查询 |
| **异步任务** | `/api/async_query` | POST | ✅ 推荐 | 提交异步任务 |
| **异步任务** | `/api/async_query/{id}` | GET | ✅ 推荐 | 获取任务状态 |
| **异步任务** | `/api/async_query/{id}/cancel` | POST | ✅ 推荐 | 取消任务 |
| **数据源** | `/api/datasources` | GET | ✅ 推荐 | 获取数据源列表 |
| **数据源** | `/api/datasources/{id}` | GET | ✅ 推荐 | 获取数据源详情 |
| **数据源** | `/api/datasources/{id}` | DELETE | ✅ 推荐 | 删除数据源 |
| **数据库连接** | `/api/datasources/databases` | GET | ✅ 推荐 | 获取连接列表 |
| **数据库连接** | `/api/datasources/databases` | POST | ✅ 推荐 | 创建连接 |
| **数据库连接** | `/api/datasources/databases/{id}` | PUT | ✅ 推荐 | 更新连接 |
| **数据库连接** | `/api/datasources/databases/{id}` | DELETE | ✅ 推荐 | 删除连接 |
| **数据库连接** | `/api/datasources/databases/test` | POST | ✅ 推荐 | 测试新连接 |
| **数据库连接** | `/api/datasources/databases/{id}/refresh` | POST | ✅ 推荐 | 刷新连接 |

#### 已移除的历史端点（勿用）

| 端点 | 状态 | 替代端点 |
|------|------|----------|
| `/api/duckdb_tables` | 已删除 | `/api/duckdb/tables` |
| `/api/duckdb_tables/{name}` | 已删除 | `/api/duckdb/tables/{name}` |
| `/api/visual-query/*` | 已删除 | `/api/pivot-query/*` |
| `POST /api/execute_sql` | 已删除 | `/api/duckdb/execute` 或 `federated-query` |

### 2. 前端 API 调用统一

#### TypeScript API 模块

新布局必须使用 `frontend/src/api/` 模块：

```typescript
// ✅ 正确：使用 TypeScript API 模块
import {
  getDuckDBTables,
  deleteDuckDBTableEnhanced,
  executeDuckDBSQL,
  executeFederatedQuery,
  listDatabaseConnections,
  createDatabaseConnection,
} from '@/api';

// 获取表列表
const tables = await getDuckDBTables();

// 删除表
await deleteDuckDBTableEnhanced(tableName);

// 执行查询
const result = await executeDuckDBSQL({
  sql: 'SELECT * FROM my_table',
  isPreview: true
});

// 执行联邦查询
const result = await executeFederatedQuery({
  sql: 'SELECT * FROM db1.table1 JOIN db2.table2',
  attachDatabases: [
    { alias: 'db1', connectionId: 'conn1' },
    { alias: 'db2', connectionId: 'conn2' }
  ]
});
```

#### API 模块结构

```
frontend/src/api/
├── client.ts              # Axios 客户端配置
├── types.ts               # 共享类型定义
├── queryApi.ts            # 查询相关 API
├── tableApi.ts            # 表相关 API
├── dataSourceApi.ts       # 数据源相关 API
├── fileApi.ts             # 文件相关 API
├── asyncTaskApi.ts        # 异步任务相关 API
├── visualQueryApi.ts      # 可视化查询相关 API
└── index.ts               # 统一导出
```

#### API 函数命名规范

| 操作 | 命名模式 | 示例 |
|------|----------|------|
| 获取列表 | `list{Resource}` | `listDatabaseConnections()` |
| 获取单个 | `get{Resource}` | `getDatabaseConnection(id)` |
| 创建 | `create{Resource}` | `createDatabaseConnection(data)` |
| 更新 | `update{Resource}` | `updateDatabaseConnection(id, data)` |
| 删除 | `delete{Resource}` | `deleteDatabaseConnection(id)` |
| 执行 | `execute{Action}` | `executeDuckDBSQL(sql)` |
| 测试 | `test{Resource}` | `testDatabaseConnection(data)` |
| 刷新 | `refresh{Resource}` | `refreshDatabaseConnection(id)` |

### 3. 数据获取统一（TanStack Query）

#### 必须使用 TanStack Query Hooks

新布局所有服务端数据获取必须使用 TanStack Query：

```typescript
// ✅ 正确：使用 TanStack Query Hook
import { useDuckDBTables } from '@/hooks/useDuckDBTables';

function MyComponent() {
  const { tables, isLoading, isFetching, refresh } = useDuckDBTables();

  if (isLoading) return <div>加载中...</div>;

  return (
    <div>
      <button onClick={refresh} disabled={isFetching}>
        {isFetching ? '刷新中...' : '刷新'}
      </button>
      <ul>
        {tables.map(table => (
          <li key={table.name}>{table.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

```typescript
// ❌ 错误：不要使用 useState + useEffect
function MyComponent() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch('/api/duckdb/tables')
      .then(res => res.json())
      .then(data => setTables(data.tables))
      .finally(() => setLoading(false));
  }, []);

  // ...
}
```

#### 可用 Hooks

| Hook | 用途 | 文件 |
|------|------|------|
| `useDuckDBTables` | DuckDB 表列表 | `frontend/src/hooks/useDuckDBTables.ts` |
| `useDataSources` | 数据源列表 | `frontend/src/hooks/useDataSources.ts` |
| `useDatabaseConnections` | 数据库连接列表 | `frontend/src/hooks/useDatabaseConnections.ts` |
| `useTableColumns` | 表列信息 | `frontend/src/hooks/useTableColumns.ts` |
| `useSchemas` | 数据库 Schema 列表 | `frontend/src/hooks/useSchemas.ts` |
| `useSchemaTables` | Schema 下的表列表 | `frontend/src/hooks/useSchemaTables.ts` |

### 4. 缓存管理统一

#### 缓存失效工具函数

所有缓存失效操作必须使用 `frontend/src/utils/cacheInvalidation.ts` 中的函数：

```typescript
import { useQueryClient } from '@tanstack/react-query';
import {
  invalidateAllDataCaches,
  invalidateAfterFileUpload,
  invalidateAfterTableDelete,
  invalidateAfterTableCreate,
  invalidateAfterDatabaseChange,
} from '@/utils/cacheInvalidation';

const queryClient = useQueryClient();

// 场景 1: 异步任务完成后
await invalidateAllDataCaches(queryClient);

// 场景 2: 文件上传后
await invalidateAfterFileUpload(queryClient);

// 场景 3: 表删除后
await invalidateAfterTableDelete(queryClient);

// 场景 4: 表创建后（saveAsTable、粘贴数据）
await invalidateAfterTableCreate(queryClient);

// 场景 5: 数据库连接变更后
await invalidateAfterDatabaseChange(queryClient);
```

#### 缓存失效场景清单

| 场景 | 刷新函数 | 调用位置 |
|------|----------|----------|
| SQL saveAsTable | `invalidateAllDataCaches()` | `useSQLEditor.ts` |
| 透视 / 可视化 saveAsTable | `invalidateAfterTableCreate()` | `PivotPanel` 等 |
| 粘贴数据创建表 | `invalidateAfterTableCreate()` | `DataPasteCard.tsx` |
| 文件上传 | `invalidateAfterFileUpload()` | `UploadPanel.tsx` |
| 表删除 | `invalidateAfterTableDelete()` | `ContextMenu.tsx` |
| 数据库连接创建 | `invalidateAfterDatabaseChange()` | `DatabaseForm.tsx` |
| 数据库连接更新 | `invalidateAfterDatabaseChange()` | `DatabaseForm.tsx` |
| 数据库连接删除 | `invalidateAfterDatabaseChange()` | `ContextMenu.tsx` |

### 5. 错误处理统一

#### 前端错误处理

```typescript
import { handleApiError } from '@/api';

try {
  const result = await executeDuckDBSQL({ sql });
} catch (error) {
  // handleApiError 会抛出增强的错误对象
  throw handleApiError(error as never, '查询执行失败');
}
```

#### 联邦查询错误处理

```typescript
import { executeFederatedQuery, parseFederatedQueryError } from '@/api';

try {
  const result = await executeFederatedQuery(options);
} catch (error) {
  const parsedError = parseFederatedQueryError(error as Error);
  
  switch (parsedError.type) {
    case 'connection':
      toast.error(`连接失败: ${parsedError.connectionName}`);
      break;
    case 'authentication':
      toast.error('认证失败，请检查用户名和密码');
      break;
    case 'timeout':
      toast.error(`连接超时: ${parsedError.host}`);
      break;
    case 'network':
      toast.error('网络连接失败');
      break;
    case 'query':
      toast.error(`查询错误: ${parsedError.message}`);
      break;
  }
}
```

## 🚫 严格禁止的 API 使用

### 前端

```typescript
// ❌ 禁止：裸 fetch 本后端 API（须 @/api + apiClient）
// 以下路径已删除，勿再实现：
// fetch('/api/duckdb_tables');

// ❌ 禁止：使用 useState + useEffect 管理服务端数据
const [tables, setTables] = useState([]);
useEffect(() => {
  fetch('/api/duckdb/tables').then(r => r.json()).then(setTables);
}, []);

// ❌ 禁止：绕过缓存失效工具
queryClient.invalidateQueries({ queryKey: ['duckdb-tables'] }); // 应使用 invalidateAfterTableDelete

// ❌ 禁止：混用不同的 API 调用方式
import { getDuckDBTables } from '@/api';
fetch('/api/duckdb/tables'); // 不要混用
```

### 后端

```python
# ❌ 禁止：返回不符合统一格式的响应
return {"tables": tables}  # 缺少 success, messageCode 等字段

# ❌ 禁止：使用 snake_case 端点（新端点）
@router.get("/api/duckdb_tables")  # 应使用 /api/duckdb/tables

# ❌ 禁止：不使用响应辅助函数
return {"success": True, "data": data}  # 应使用 create_success_response
```

## ✅ 必须遵循的 API 规范

### 前端

1. **必须使用 TypeScript API 模块** (`frontend/src/api/`)
2. **必须使用 TanStack Query Hooks** 管理服务端数据
3. **必须使用缓存失效工具函数** (`cacheInvalidation.ts`)
4. **必须使用统一的错误处理** (`handleApiError`)
5. **必须使用新端点** (`/api/duckdb/tables`)

### 后端

1. **必须使用 kebab-case 端点命名** (`/api/duckdb/tables`)
2. **必须使用响应辅助函数** (`response_helpers.py`)
3. **必须返回统一响应格式** (包含 success, messageCode, message, timestamp)
4. **必须使用连接池** (`DuckDBConnectionPool`)
5. **必须记录元数据** (表创建后调用 `save_file_datasource`)

## 📊 API 迁移状态

### 前端迁移状态

| 模块 | 旧方式 | 新方式 | 状态 |
|------|--------|--------|------|
| 表列表 | ~~`GET /api/duckdb_tables`~~（已删） | `useDuckDBTables()` → `GET /api/duckdb/tables` | ✅ 完成 |
| 表删除 | ~~`DELETE /api/duckdb_tables/{name}`~~（已删） | `deleteDuckDBTable()` | ✅ 完成 |
| 查询执行 | `fetch('/api/duckdb/execute')` | `executeDuckDBSQL()` | ✅ 完成 |
| 数据源列表 | `fetch('/api/datasources')` | `useDataSources()` | ✅ 完成 |
| 数据库连接 | `fetch('/api/datasources/databases')` | `useDatabaseConnections()` | ✅ 完成 |

### 后端迁移状态

| 端点 | 旧端点 | 新端点 | 状态 |
|------|--------|--------|------|
| 表列表 | ~~`/api/duckdb_tables`~~（已删除） | `/api/duckdb/tables` | ✅ 仅新端点 |
| 表删除 | ~~`/api/duckdb_tables/{name}`~~（已删除） | `/api/duckdb/tables/{name}` | ✅ 仅新端点 |
| 查询执行 | - | `/api/duckdb/execute` | ✅ 已实现 |
| 联邦查询 | - | `/api/duckdb/federated-query` | ✅ 已实现 |

## 📁 相关文件参考

### 前端

- API 模块: `frontend/src/api/`
- TanStack Query Hooks: `frontend/src/hooks/`
- 缓存失效工具: `frontend/src/utils/cacheInvalidation.ts`
- Hooks 使用指南: `frontend/src/hooks/README.md`

### 后端

- 响应辅助函数: `api/utils/response_helpers.py`
- DuckDB 查询路由: `api/routers/duckdb_query.py`
- 数据源路由: `api/routers/datasources.py`
- 异步任务路由: `api/routers/async_tasks.py`

## 🔗 相关文档

- [当前项目状态](./current-project-status.md)
- [TanStack Query 使用标准](./tanstack-query-standards.md)
- [数据源刷新模式](./data-source-refresh-patterns.md)
- [API 响应格式标准](./api-response-format-standard.md)

---

**维护者**: 项目团队  
**审核周期**: 每月更新  
**反馈渠道**: 项目 Issue 或 PR
