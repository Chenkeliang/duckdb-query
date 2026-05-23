# 查询执行流程与引号逻辑

## 部署与 API 入口

| 模式 | 前端 | 后端 | 说明 |
|------|------|------|------|
| Docker（推荐） | http://localhost:3000 | API 经 nginx `/api/` → `:8000` | 见项目 `README.md` |
| 本地开发 | http://localhost:5173（Vite） | http://localhost:8000 | Vite 代理 `/api` |

契约全表：[`docs/API_CONTRACT_FE_BE.md`](../API_CONTRACT_FE_BE.md)。

**已移除（勿再实现）**：`POST /api/execute_sql`、`GET/DELETE /api/duckdb_tables*`。同步查询仅使用 § 统一架构 中的两个端点。

---

## 概述

DuckQuery 使用统一的查询执行模式：

1. **DuckDB 本地查询** - 直接在 DuckDB 中执行
2. **外部数据库查询** - 统一通过 DuckDB ATTACH 机制执行（联邦查询）

## 统一架构（v2.0）

### 设计原则

**所有涉及外部数据库的查询都通过 ATTACH 机制执行**，不再区分"单外部表查询"和"联邦查询"。

| 场景 | API | SQL 格式 |
|------|-----|---------|
| DuckDB 本地表 | `/api/duckdb/execute` | `SELECT * FROM table` |
| 外部表（MySQL/PostgreSQL/SQLite） | `/api/duckdb/federated-query` | `SELECT * FROM mysql_prod.orders` |
| 跨库 JOIN | `/api/duckdb/federated-query` | `SELECT * FROM mysql_prod.orders JOIN local_table` |

### 优点

1. **前端逻辑简化**：只需判断是否涉及外部表
2. **标识符按需引号**：简单名无引号，必要时才用 DuckDB 双引号定界
3. **SQL 语法一致**：用户写的 SQL 始终是 DuckDB 语法
4. **便于扩展**：联邦查询（跨库 JOIN）自然支持
5. **减少 bug**：不会再出现 API 选择错误的问题

---

## 引号规范（按需双引号）

**重要**：引号**不是**联邦查询的识别手段。是否走 `/api/duckdb/federated-query` 由 `attach_databases`、SQL 解析出的 `alias.table` 前缀、选中外部表等决定，与 SQL 中带不带引号无关。

```typescript
// frontend/src/utils/sqlUtils.ts
export function needsQuoting(identifier: string): boolean { /* … */ }
export function quoteIdent(identifier: string, _dialect: SqlDialect): string {
  if (!needsQuoting(identifier)) return identifier;
  const escaped = identifier.replace(/"/g, '""');
  return `"${escaped}"`;
}
```

**规则摘要**：
- 简单标识符（`[a-zA-Z_][a-zA-Z0-9_]*`、非保留字）：生成 SQL 时**不加引号**，如 `mysql_prod.orders`
- 含空格、含 `"`、以数字开头、含 `-` 等非字母数字下划线、SQL 保留字、需保留大小写时：**加双引号**
- 点号仅用于分段拼接（`alias.schema.table`），不对整段 `a.b` 一次性 quote

**原因**：
- 所有查询最终在 DuckDB 执行；`mysql_alias.orders` 与 `"mysql_alias"."orders"` 在常见简单名下均可执行
- 可读 SQL 更接近传统客户端，降低书写心理负担

---

## 外部表引用格式

### 生成函数

```typescript
// frontend/src/utils/sqlUtils.ts
export function generateExternalTableReference(table: SelectedTable): {
  qualifiedName: string;
  attachDatabase: AttachDatabase | null;
}
```

### 示例

| 表类型 | 输入 | 输出 |
|--------|------|------|
| MySQL 表 | `{ name: 'orders', connection: { name: 'prod_db', type: 'mysql' } }` | `mysql_prod_db.orders` |
| PostgreSQL 表（带 schema） | `{ name: 'users', schema: 'public', connection: { name: 'pg_db', type: 'postgresql' } }` | `postgresql_pg_db.public.users` |
| DuckDB 本地表 | `{ name: 'local_table', source: 'duckdb' }` | `local_table` |

---

## 数据流

### 1. DuckDB 本地查询

```
用户选择 DuckDB 表
    ↓
前端生成 SQL: SELECT * FROM table_name LIMIT 10000
    ↓
调用 executeDuckDBSQL(sql)
    ↓
POST /api/duckdb/execute { sql, is_preview: true }
    ↓
后端 DuckDB 直接执行
    ↓
返回结果
```

### 2. 外部表查询（统一使用 ATTACH）

```
用户选择外部表（如 MySQL 的 bschool_order）
    ↓
前端生成 SQL: SELECT * FROM mysql_sorder.store_order.bschool_order LIMIT 10000
前端生成 attachDatabase: { alias: 'mysql_sorder', connectionId: 'xxx' }
    ↓
调用 executeFederatedQuery({ sql, attachDatabases })
    ↓
POST /api/duckdb/federated-query {
  sql,
  attach_databases: [{ alias: 'mysql_sorder', connection_id: 'xxx' }],
  is_preview: true
}
    ↓
后端执行:
  1. ATTACH 外部数据库到 DuckDB（使用别名 mysql_sorder）
  2. 在 DuckDB 中执行 SQL
  3. DETACH 外部数据库
    ↓
返回结果
```

---

## 关键代码

### 前端 - 预览表数据

```typescript
// frontend/src/Query/QueryWorkspace.tsx
const handlePreview = React.useCallback(
  async (table: SelectedTable) => {
    const { qualifiedName, attachDatabase } = generateExternalTableReference(table);
    
    const sql = `SELECT * FROM ${qualifiedName} LIMIT 10000`;
    
    let source: TableSource;
    if (attachDatabase) {
      // 外部表：使用联邦查询模式
      source = {
        type: 'federated',
        attachDatabases: [attachDatabase],
      };
    } else {
      // DuckDB 本地表
      source = { type: 'duckdb' };
    }
    
    await handleQueryExecute(sql, source);
  },
  [handleQueryExecute]
);
```

### 前端 - 查询执行

```typescript
// frontend/src/hooks/useQueryWorkspace.ts
const handleQueryExecute = useCallback(
  async (sql: string, source?: TableSource) => {
    const querySource = source || { type: 'duckdb' };
    
    if (querySource.type === 'federated' || querySource.type === 'external') {
      // 联邦查询（包括单外部表查询）
      await executeFederatedQuery({
        sql,
        attachDatabases: querySource.attachDatabases,
        isPreview: false,
      });
    } else {
      // DuckDB 本地查询
      await executeDuckDBSQL(sql);
    }
  },
  []
);
```

### API 调用

```typescript
// frontend/src/api/queryApi.ts
export const executeFederatedQuery = async (options) => {
  const { sql, attachDatabases, isPreview = true } = options;
  
  const requestBody = {
    sql,
    is_preview: isPreview,
    attach_databases: attachDatabases.map(db => ({
      alias: db.alias,
      connection_id: db.connectionId,
    })),
  };
  
  const response = await apiClient.post('/api/duckdb/federated-query', requestBody);
  return response.data;
};
```

---

## 别名生成规则

```typescript
// frontend/src/utils/sqlUtils.ts
export function generateDatabaseAlias(connection: DatabaseConnection): string {
  // 格式: 类型_名称，如 mysql_orders_db
  const baseAlias = `${connection.type}_${connection.name}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  
  // 确保以字母开头
  return /^[a-z]/.test(baseAlias) ? baseAlias : `db_${baseAlias}`;
}
```

---

## 相关文件

- `frontend/src/utils/sqlUtils.ts` - SQL 工具函数（引号处理、别名生成）
- `frontend/src/hooks/useQueryWorkspace.ts` - 查询执行逻辑
- `frontend/src/Query/QueryWorkspace.tsx` - 预览/导入处理
- `frontend/src/Query/SQLQuery/SQLQueryPanel.tsx` - SQL 面板
- `frontend/src/api/queryApi.ts` - 核心查询 API
- `api/routers/duckdb_query.py` - 后端联邦查询 API

---

## 异步查询

外部库异步任务与同步一致：优先 `attach_databases`；仅传 `datasource` 时后端自动推导 ATTACH（`async_tasks.resolve_attach_databases_for_async`）。入口：`POST /api/async-tasks`（`asyncTaskApi.submitAsyncQuery`）。

## 透视查询（Pivot）

- UI：`QueryTabs` → `PivotPanel`（`frontend/src/Query/PivotTable/`）。
- API：`generatePivotQuery` / `previewPivotQuery`（`pivotQueryApi.ts`）→ `POST /api/pivot-query/generate|preview`。
- 请求体：`config`（`table_name`、`filters`、`limit`）+ `pivot_config`；外部库可传 `attach_databases`（与 SQL 联邦一致）。
- 结果：预览数据经 `ResultPanel` → `DataGridWrapper`（TanStack DataGrid）。契约见 [`API_CONTRACT_FE_BE.md`](../API_CONTRACT_FE_BE.md) §7。

## 集合运算

- DuckDB 表：`generateSetOperation` 生成 SQL；**预览** 走 `previewSetOperation`（LIMIT = 后端 `max_query_rows`）→ `displayQueryPreview` 写入结果面板；**执行** 在 SQL 后追加 `maxQueryRows` LIMIT。
- 外部表：仍提示先导入 DuckDB（后端 `set-operations` 仅查 DuckDB 目录）。

## 文件上传

- 小文件（≤ 8MB）：`POST /api/upload`（`uploadFileAuto` → `uploadFileEnhanced`）。
- 大文件（&gt; 8MB）：`POST /api/upload/init` → `chunk` × N → `complete`（`uploadFileChunked`）；失败时 `DELETE /api/upload/cancel/{id}`。
- 上限：前端按 `useAppConfig().maxFileSize` 拦截，与后端 `max_file_size` 一致。

---

## 版本历史

- **v2.2** (2026-05-21): 移除可视化构建器描述；补充透视 `pivot-query` 路径
- **v2.1** (2026-05-21): 文档对齐契约表；`execute_sql` / `duckdb_tables` 路由已删除；异步 ATTACH 单轨
- **v2.0** (2024-12-19): 统一使用 ATTACH 模式，移除单独的外部数据库查询 API
- **v1.0** (2024-12-04): 初始版本，区分外部查询和联邦查询
