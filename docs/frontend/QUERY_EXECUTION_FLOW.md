# 查询执行流程与引号逻辑

## 概述

DuckQuery 使用统一的查询执行模式：

1. **DuckDB 本地查询** - 直接在 DuckDB 中执行
2. **外部数据库查询** - 统一通过 DuckDB ATTACH 机制执行（联邦查询）

## 统一架构（v2.0）

### 设计原则

**所有涉及外部数据库的查询都通过 ATTACH 机制执行**，不再区分"单外部表查询"和"联邦查询"。

| 场景 | API | SQL 格式 |
|------|-----|---------|
| DuckDB 本地表 | `/api/duckdb/execute` | `SELECT * FROM "table"` |
| 外部表（MySQL/PostgreSQL/SQLite） | `/api/duckdb/federated-query` | `SELECT * FROM "mysql_prod"."orders"` |
| 跨库 JOIN | `/api/duckdb/federated-query` | `SELECT * FROM "mysql_prod"."orders" JOIN "local_table"` |

### 优点

1. **前端逻辑简化**：只需判断是否涉及外部表
2. **引号统一**：全部使用 DuckDB 双引号语法
3. **SQL 语法一致**：用户写的 SQL 始终是 DuckDB 语法
4. **便于扩展**：联邦查询（跨库 JOIN）自然支持
5. **减少 bug**：不会再出现 API 选择错误的问题

---

## 引号规范（统一使用双引号）

```typescript
// frontend/src/utils/sqlUtils.ts
export function quoteIdent(identifier: string, _dialect: SqlDialect): string {
  // 统一使用双引号，因为 DuckDB 是最终执行环境
  const escaped = identifier.replace(/"/g, '""');
  return `"${escaped}"`;
}
```

**原因**：
- 所有查询最终都在 DuckDB 中执行
- DuckDB 使用标准 SQL 双引号语法
- 统一引号避免混淆和兼容性问题

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
| MySQL 表 | `{ name: 'orders', connection: { name: 'prod_db', type: 'mysql' } }` | `"mysql_prod_db"."orders"` |
| PostgreSQL 表（带 schema） | `{ name: 'users', schema: 'public', connection: { name: 'pg_db', type: 'postgresql' } }` | `"postgresql_pg_db"."public"."users"` |
| DuckDB 本地表 | `{ name: 'local_table', source: 'duckdb' }` | `"local_table"` |

---

## 数据流

### 1. DuckDB 本地查询

```
用户选择 DuckDB 表
    ↓
前端生成 SQL: SELECT * FROM "table_name" LIMIT 10000
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
前端生成 SQL: SELECT * FROM "mysql_sorder"."store_order"."bschool_order" LIMIT 10000
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

## 版本历史

- **v2.0** (2024-12-19): 统一使用 ATTACH 模式，移除单独的外部数据库查询 API
- **v1.0** (2024-12-04): 初始版本，区分外部查询和联邦查询
