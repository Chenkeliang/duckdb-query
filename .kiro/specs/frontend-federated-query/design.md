# Design Document: Frontend Federated Query Support

## Overview

本设计文档描述了 DuckQuery 前端联邦查询支持的技术实现方案。该功能允许用户在可视化查询界面中跨数据库进行关联查询，支持 DuckDB 本地表与外部数据库（MySQL、PostgreSQL）表的 JOIN 操作。

后端已实现联邦查询基础设施（通过 DuckDB 的 ATTACH 机制），前端需要：
1. 支持跨数据源的表选择
2. 生成正确的联邦查询 SQL
3. 传递 `attach_databases` 参数给后端 API
4. 提供清晰的连接状态反馈

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  JoinQueryPanel │  │  QueryBuilder   │  │   SQLEditor     │ │
│  │  (跨数据库JOIN) │  │  (可视化查询)   │  │   (SQL编辑器)   │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                │                                │
│  ┌─────────────────────────────▼─────────────────────────────┐ │
│  │              useFederatedQuery Hook                        │ │
│  │  - 管理 attach_databases 状态                              │ │
│  │  - 生成联邦查询 SQL                                        │ │
│  │  - 处理连接状态                                            │ │
│  └─────────────────────────────┬─────────────────────────────┘ │
│                                │                                │
│  ┌─────────────────────────────▼─────────────────────────────┐ │
│  │              API Client (apiClient.js)                     │ │
│  │  - executeFederatedQuery(sql, attachDatabases)             │ │
│  └─────────────────────────────┬─────────────────────────────┘ │
└────────────────────────────────┼────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend API                               │
│  POST /api/duckdb/query                                         │
│  {                                                              │
│    "sql": "SELECT ... FROM local JOIN mysql_db.table ...",      │
│    "attach_databases": [                                        │
│      { "alias": "mysql_db", "connection_id": "1" }              │
│    ]                                                            │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. useFederatedQuery Hook

新增 Hook 用于管理联邦查询状态和逻辑。

```typescript
// frontend/src/new/hooks/useFederatedQuery.ts

interface AttachDatabase {
  alias: string;           // 数据库别名，用于 SQL 中引用
  connectionId: string;    // 数据库连接 ID
}

interface FederatedQueryState {
  attachDatabases: AttachDatabase[];
  hasExternalTables: boolean;
  hasMixedSources: boolean;
}

interface UseFederatedQueryReturn {
  // 状态
  state: FederatedQueryState;
  
  // 操作
  addTable: (table: SelectedTable) => void;
  removeTable: (table: SelectedTable) => void;
  clearTables: () => void;
  
  // SQL 生成
  generateSQL: (config: QueryConfig) => string;
  
  // 获取 attach_databases 参数
  getAttachDatabases: () => AttachDatabase[];
  
  // 执行查询
  executeQuery: (sql: string) => Promise<QueryResult>;
}
```

### 2. API Client 扩展

扩展 `apiClient.js` 支持 `attach_databases` 参数。

```typescript
// frontend/src/services/apiClient.js

interface ExecuteQueryOptions {
  sql: string;
  attachDatabases?: AttachDatabase[];
  timeout?: number;  // 默认 2000ms 用于 ATTACH 连接
}

export const executeFederatedQuery = async (options: ExecuteQueryOptions) => {
  const response = await apiClient.post('/api/duckdb/query', {
    sql: options.sql,
    attach_databases: options.attachDatabases,
  }, {
    timeout: options.timeout || 30000,
  });
  return response.data;
};
```

### 3. SQL 生成工具

扩展 `sqlUtils.ts` 支持联邦查询 SQL 生成。

```typescript
// frontend/src/new/utils/sqlUtils.ts

interface TableReference {
  name: string;
  schema?: string;
  alias?: string;           // 数据库别名（外部表）
  isExternal: boolean;
  connectionId?: string;
}

// 生成完整的表引用
export const formatTableReference = (
  table: TableReference,
  dialect: SQLDialect
): string => {
  if (table.isExternal && table.alias) {
    // 外部表: alias.schema.table 或 alias.table
    const parts = [table.alias];
    if (table.schema) parts.push(table.schema);
    parts.push(table.name);
    return parts.map(p => quoteIdent(p, dialect)).join('.');
  }
  // DuckDB 本地表: 直接使用表名
  return quoteIdent(table.name, dialect);
};

// 从选中的表列表生成 attach_databases
export const extractAttachDatabases = (
  tables: SelectedTable[]
): AttachDatabase[] => {
  const seen = new Set<string>();
  const result: AttachDatabase[] = [];
  
  for (const table of tables) {
    const normalized = normalizeSelectedTable(table);
    if (normalized.source === 'external' && normalized.connection) {
      const connectionId = normalized.connection.id;
      if (!seen.has(connectionId)) {
        seen.add(connectionId);
        result.push({
          alias: generateDatabaseAlias(normalized.connection),
          connectionId,
        });
      }
    }
  }
  
  return result;
};

// 生成唯一的数据库别名
export const generateDatabaseAlias = (
  connection: DatabaseConnection,
  existingAliases?: Set<string>
): string => {
  // 基础别名: 类型_名称，如 mysql_orders_db
  let baseAlias = `${connection.type}_${connection.name}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  
  if (!existingAliases || !existingAliases.has(baseAlias)) {
    return baseAlias;
  }
  
  // 如果有冲突，添加数字后缀
  let counter = 1;
  while (existingAliases.has(`${baseAlias}_${counter}`)) {
    counter++;
  }
  return `${baseAlias}_${counter}`;
};
```

### 4. JoinQueryPanel 扩展

修改 `JoinQueryPanel.tsx` 支持跨数据库 JOIN。

```typescript
// 主要修改点：

// 1. 移除跨数据库限制
const canExecute = React.useMemo(() => {
  if (activeTables.length < 2) return false;
  // 移除: if (sourceAnalysis.mixed) return false;
  // 移除: if (sourceAnalysis.hasExternal) return false;
  return true;
}, [activeTables.length]);

// 2. 生成 attach_databases
const attachDatabases = React.useMemo(() => {
  return extractAttachDatabases(activeTables);
}, [activeTables]);

// 3. 执行查询时传递 attach_databases
const handleExecute = async () => {
  const sql = generateSQL();
  if (!sql || !onExecute) return;
  
  setIsExecuting(true);
  try {
    await onExecute(sql, tableSource, attachDatabases);
  } finally {
    setIsExecuting(false);
  }
};
```

### 5. 连接状态指示器组件

新增组件显示将要附加的数据库。

```typescript
// frontend/src/new/Query/components/AttachedDatabasesIndicator.tsx

interface AttachedDatabasesIndicatorProps {
  attachDatabases: AttachDatabase[];
  connections: DatabaseConnection[];
  onRetry?: (connectionId: string) => void;
}

export const AttachedDatabasesIndicator: React.FC<Props> = ({
  attachDatabases,
  connections,
  onRetry,
}) => {
  if (attachDatabases.length === 0) return null;
  
  return (
    <div className="flex items-center gap-2 text-xs">
      <Database className="w-3 h-3 text-muted-foreground" />
      <span className="text-muted-foreground">将连接:</span>
      {attachDatabases.map((db) => {
        const conn = connections.find(c => c.id === db.connectionId);
        return (
          <Tooltip key={db.connectionId}>
            <TooltipTrigger>
              <Badge variant="outline" className="text-xs">
                {DATABASE_TYPE_ICONS[conn?.type || 'unknown']}
                {db.alias}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <div>
                <div>{conn?.name}</div>
                <div className="text-muted-foreground">
                  {conn?.host}:{conn?.port}/{conn?.database}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
};
```

## Data Models

### AttachDatabase

```typescript
interface AttachDatabase {
  alias: string;           // SQL 中使用的数据库别名
  connectionId: string;    // 后端数据库连接 ID
}
```

### FederatedQueryRequest

```typescript
interface FederatedQueryRequest {
  sql: string;
  attach_databases?: AttachDatabase[];
  is_preview?: boolean;
  save_as_table?: string;
}
```

### FederatedQueryError

```typescript
interface FederatedQueryError {
  type: 'connection' | 'authentication' | 'timeout' | 'query';
  message: string;
  connectionId?: string;
  connectionName?: string;
  databaseType?: string;
  host?: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Attach databases list consistency
*For any* set of selected tables, the `attach_databases` list SHALL contain exactly the unique external database connections referenced by those tables, with no duplicates and no DuckDB tables included.
**Validates: Requirements 1.3, 8.3, 9.3**

### Property 2: External table SQL prefix
*For any* external table in a query, the generated SQL SHALL include the database alias prefix in the format `alias.schema.table` or `alias.table`.
**Validates: Requirements 2.1, 4.2**

### Property 3: DuckDB table SQL format
*For any* DuckDB local table in a mixed-source query, the generated SQL SHALL use unqualified table names without any database prefix.
**Validates: Requirements 8.2**

### Property 4: Attach databases removal consistency
*For any* table removal operation, if no remaining tables reference a particular external connection, that connection SHALL be removed from the `attach_databases` list.
**Validates: Requirements 1.4**

### Property 5: Unique database aliases
*For any* set of external database connections, the generated aliases SHALL be unique, even if multiple connections have similar names.
**Validates: Requirements 9.2, 9.5**

### Property 6: API request serialization
*For any* federated query execution, the `attach_databases` array SHALL be correctly serialized as JSON in the POST request body.
**Validates: Requirements 2.4, 6.2, 6.4**

### Property 7: Column alias in multi-table queries
*For any* query involving multiple tables, each column reference in SELECT and WHERE clauses SHALL be prefixed with its source table alias.
**Validates: Requirements 4.3, 4.4**

### Property 8: UI indicator reactivity
*For any* change to the selected tables list, the attached databases UI indicator SHALL update immediately to reflect the current `attach_databases` state.
**Validates: Requirements 7.3**

## Error Handling

### Connection Errors

| Error Type | Detection | User Message | Action |
|------------|-----------|--------------|--------|
| Authentication Failed | API returns 401/403 | "数据库认证失败，请检查连接凭据" | 提供跳转到数据源设置的链接 |
| Connection Timeout | 2秒超时 | "连接超时: {host}:{port}" | 提供重试按钮 |
| Network Unreachable | API returns network error | "无法连接到数据库: {host}" | 提供重试按钮和设置链接 |
| Database Not Found | API returns 404 | "数据库不存在: {database}" | 提供跳转到数据源设置的链接 |

### Error Response Parsing

```typescript
const parseFederatedQueryError = (error: any): FederatedQueryError => {
  const detail = error.response?.data?.detail || error.message;
  
  // 解析 ATTACH 错误
  if (detail.includes('ATTACH')) {
    const match = detail.match(/ATTACH.*?'([^']+)'/);
    return {
      type: 'connection',
      message: '数据库连接失败',
      connectionName: match?.[1],
    };
  }
  
  // 解析认证错误
  if (detail.includes('authentication') || detail.includes('password')) {
    return {
      type: 'authentication',
      message: '数据库认证失败，请检查用户名和密码',
    };
  }
  
  // 解析超时错误
  if (detail.includes('timeout') || error.code === 'ECONNABORTED') {
    return {
      type: 'timeout',
      message: '连接超时，请检查网络或数据库状态',
    };
  }
  
  return {
    type: 'query',
    message: detail,
  };
};
```

## Testing Strategy

### Unit Tests

使用 Vitest 进行单元测试：

1. **SQL 生成测试**
   - 测试外部表 SQL 前缀生成
   - 测试 DuckDB 表 SQL 格式
   - 测试混合源查询 SQL 生成

2. **attach_databases 提取测试**
   - 测试从表列表提取外部连接
   - 测试去重逻辑
   - 测试别名生成

3. **错误解析测试**
   - 测试各种错误类型的解析

### Property-Based Tests

使用 fast-check 进行属性测试，每个测试运行至少 100 次迭代：

1. **Property 1 测试**: 验证 attach_databases 列表一致性
2. **Property 2 测试**: 验证外部表 SQL 前缀
3. **Property 3 测试**: 验证 DuckDB 表 SQL 格式
4. **Property 4 测试**: 验证表移除后的 attach_databases 更新
5. **Property 5 测试**: 验证数据库别名唯一性
6. **Property 6 测试**: 验证 API 请求序列化
7. **Property 7 测试**: 验证多表查询的列别名
8. **Property 8 测试**: 验证 UI 指示器响应性

### Integration Tests

1. **端到端联邦查询测试**
   - 测试 DuckDB + MySQL 混合查询
   - 测试多外部数据库查询
   - 测试连接失败场景

2. **UI 交互测试**
   - 测试表选择和移除
   - 测试连接状态指示器
   - 测试错误提示显示
