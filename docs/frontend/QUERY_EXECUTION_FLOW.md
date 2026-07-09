# 查询执行流程与引号逻辑

## 部署与 API 入口

| 模式 | 前端 | 后端 | 说明 |
|------|------|------|------|
| Docker（推荐） | http://localhost:48000 | API 经 nginx `/api/` → `:8000` | 见项目 `README.md` |
| 本地开发 | http://localhost:48000（Vite） | http://localhost:48001 | Vite 代理 `/api` |

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

### MySQL / DataGrip 双引号字符串（兼容层）

DuckDB **不能**像 MySQL（非 `ANSI_QUOTES`）那样把 `"literal"` 当字符串；双引号在 DuckDB 里表示**标识符**。

为贴近 DataGrip 手写习惯，联邦查询在**执行前**会做一层归一化（前端 `normalizeMysqlDoubleQuotedStringsForDuckdb`、后端 `normalize_mysql_double_quoted_strings_for_duckdb`）：

| 场景 | 行为 |
|------|------|
| `IN ("A", "B")`、`= "x"` 等 | `"…"` → `'…'` |
| `"schema"."table"` | 保留双引号（限定标识符） |

仍建议新 SQL 优先使用单引号字符串；兼容层不覆盖 `AS "alias"` 等全部 MySQL 方言。

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

## 关键实现（结构描述 + 指针；不贴长代码，以源码为准）

### 前端执行链（`frontend/src/hooks/useQueryWorkspace.ts`）

- `TableSource.type` 联合类型仅 **`'duckdb' | 'federated'`**（`types/queryWorkspace.ts`）；早期的 `'external'` 分支已删除。
- 调用链：`handleQueryExecute`（薄封装）→ `executeQuery` → `runSqlQuery`（真正按 `source.type` 分支调 `executeDuckDBSQL` / `executeFederatedQuery`）。
- **槽位化并发控制**：每个结果槽（单结果槽 / 每个保留的结果 Tab）由 `beginQueryExecution` 独立分配 `requestId` + `AbortController`；响应回来先查 `isStale`，**过期响应直接丢弃**（多标签页竞态修复）。
- 结果面板支持多 Tab（`resultTabs` / `retainQueryResults`）；失败记录在 `lastFailure`，`retryLastFailure` 一键重跑。
- 表预览（`QueryWorkspace.tsx` `handlePreview`）：`SELECT * FROM {qualifiedName} LIMIT {maxQueryRows}`——LIMIT 来自 `useAppConfig().maxQueryRows`（**不是**硬编码 10000），带 try/catch + `showErrorToast`。

### 同步查询取消（前后端全链路）

- 前端每个同步请求带 `X-Request-ID` 头；取消时 `useQueryWorkspace.cancelQuery` 按槽位 `abort()` HTTP 请求，**并**调 `cancelSyncQuery(requestId)`（`queryApi.ts`）。
- 后端 `POST /api/query/cancel/{request_id}`（`api/routers/query_cancel.py`）经 `connection_registry.interrupt(f"sync:{request_id}")` **真正中断**服务端正在执行的 DuckDB 连接——不只是断开 HTTP。
- `/api/duckdb/execute` 与 `/api/duckdb/federated-query` 都以 `sync:{X-Request-ID}` 注册连接,取消对两者一致生效。

### 联邦执行的服务端增强（2026-06 起）

- `POST /api/duckdb/federated-query` 在 ATTACH → 执行 → DETACH 基础上接入:下推优化器(`core/database/federated_optimizer.py`,半连接键下推 + 审计列时间界建议)、**超时看门狗**、`connection_id` 归一化(`db_` 前缀容错)。对调用方透明。

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

外部库异步任务与同步一致：优先 `attach_databases`；仅传 `datasource` 时后端自动推导 ATTACH（`resolve_attach_databases_for_async`，定义于 `api/core/common/connection_alias.py`，`async_tasks` / `join_query` 共用）。入口：`POST /api/async-tasks`（`asyncTaskApi.submitAsyncQuery`）。

**结果表命名与覆盖守卫（2026-07-09 起，commit `62d3add`）**：

| 情况 | 行为 |
|------|------|
| `custom_table_name` 清洗后为空（如 `"!!!"`） | 回退 task_id 派生表名，**绝不建空名表** |
| 自定义名撞 `main` schema 已有表、未传 `overwrite` | **任务失败拒绝**，不再静默 `CREATE OR REPLACE` 覆盖用户表 |
| 请求体显式 `overwrite: true` | 允许覆盖 |
| 重试任务（retry） | 固定 `overwrite=True`（用户显式"重做"语义） |

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

## Demo 模式（DuckDB-Wasm）

`VITE_DEMO=true` 构建下,`executeDuckDBSQL` 在 `IS_DEMO` 分支改走**浏览器内 DuckDB-Wasm**（`src/demo/wasmEngine.ts`），不发后端;`executeFederatedQuery`（连 MySQL/PG）在浏览器内不可用、入口已锁。正常 / 自托管构建此分支在**编译期被剥离**,执行流程同上文。详见 `docs/CONFIGURATION.md` → Frontend Build Flags。

---

## 版本历史

- **v2.4** (2026-07-09): 「关键代码」改为结构描述+指针（旧代码块含已删除的 `'external'` 分支与硬编码 LIMIT）；新增同步取消全链路、槽位化竞态控制、联邦优化器/看门狗、异步结果表命名与 overwrite 守卫
- **v2.3** (2026-06-02): 补充 AI 端点(契约 §9.2)、AI/LLM 配置、Demo(DuckDB-Wasm)旁路
- **v2.2** (2026-05-21): 移除可视化构建器描述；补充透视 `pivot-query` 路径
- **v2.1** (2026-05-21): 文档对齐契约表；`execute_sql` / `duckdb_tables` 路由已删除；异步 ATTACH 单轨
- **v2.0** (2024-12-19): 统一使用 ATTACH 模式，移除单独的外部数据库查询 API
- **v1.0** (2024-12-04): 初始版本，区分外部查询和联邦查询
