# Design Document: External Table Integration Fixes

## Overview

本设计文档描述如何修复外部数据库表（MySQL/PostgreSQL/SQLite）在新工作台中的集成问题。核心目标是建立统一的 SelectedTable 数据流，修复 API 契约不匹配，并确保外部表的查询、导入功能端到端可用。

## Architecture

### 数据流架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           QueryWorkspace                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ State: selectedTables: Record<TabId, SelectedTable[]>               │   │
│  │        lastQuery: { sql: string, source: TableSource } | null       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                         │
│         ┌──────────────────────────┼──────────────────────────┐             │
│         ▼                          ▼                          ▼             │
│  ┌─────────────┐           ┌─────────────┐           ┌─────────────┐       │
│  │DataSourcePanel│         │  QueryTabs  │           │ ResultPanel │       │
│  │             │           │             │           │             │       │
│  │ onTableSelect│──────────▶│SelectedTable[]│        │ source      │       │
│  │ (SelectedTable)│        │             │           │ currentSQL  │       │
│  └─────────────┘           └─────────────┘           └─────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### API 契约

| 端点 | 方法 | 请求 | 响应 |
|------|------|------|------|
| `/api/datasources/databases/list` | GET | - | `{ success, data: { items: DataSource[] } }` |
| `/api/datasources/databases/test` | POST | `{ host, port, ... }` | `{ success, data: { connection_test: { success } } }` |
| `/api/datasources/databases/{id}/refresh` | POST | - | `{ success, data: { connection_test: { success } } }` |
| `/api/execute_sql` | POST | `{ sql, datasource: { id, type } }` | `{ success, data, columns }` |
| `/api/save_query_to_duckdb` | POST | `{ sql, table_alias, datasource: { id, type } }` | `{ success, row_count }` |


## Components and Interfaces

### 1. SelectedTable 类型定义（已存在，需统一使用）

```typescript
// frontend/src/new/types/SelectedTable.ts
export interface SelectedTableObject {
  name: string;
  source: 'duckdb' | 'external';
  connection?: {
    id: string;      // 原始 ID（不带 db_ 前缀）
    name: string;
    type: 'mysql' | 'postgresql' | 'sqlite';
  };
  schema?: string;
  displayName?: string;
}

export type SelectedTable = string | SelectedTableObject;
```

### 2. useQueryWorkspace Hook 改造

```typescript
// frontend/src/new/hooks/useQueryWorkspace.ts
export interface UseQueryWorkspaceReturn {
  // 改为 SelectedTable[] 而非 string[]
  selectedTables: Record<string, SelectedTable[]>;
  currentTab: string;
  queryResults: QueryResult | null;
  // 新增：最后执行的查询信息（用于导入）
  lastQuery: { sql: string; source: TableSource } | null;
  
  // 改为接收 SelectedTable 对象
  handleTableSelect: (table: SelectedTable) => void;
  handleRemoveTable: (table: SelectedTable) => void;
  handleTabChange: (tab: string) => void;
  // 新增 source 参数
  handleQueryExecute: (sql: string, source?: TableSource) => Promise<void>;
}
```

### 3. useDatabaseConnections Hook 修复

```typescript
// frontend/src/new/hooks/useDatabaseConnections.ts
const fetchDatabaseConnections = async (): Promise<DatabaseConnection[]> => {
  const response = await fetch('/api/datasources/databases/list');
  const data = await response.json();
  
  // 正确解析 API 响应
  const items = data.data?.items ?? [];
  return items.map(item => ({
    id: item.id?.replace(/^db_/, '') || item.id,  // 去除 db_ 前缀
    name: item.name,
    type: item.subtype,  // mysql/postgresql/sqlite（从 subtype 获取）
    status: item.status,
    params: {
      host: item.connection_info?.host,
      port: item.connection_info?.port,
      database: item.connection_info?.database,
      ...item.metadata,
    },
  }));
};
```

### 4. useDataSources Hook 修复

```typescript
// frontend/src/new/hooks/useDataSources.ts
export const useDataSources = (filters = {}) => {
  const query = useQuery({
    queryKey: [...DATA_SOURCES_QUERY_KEY, filters],
    queryFn: () => listAllDataSources(filters),
    // ...
  });

  // 修复：正确读取 API 响应路径
  const items = query.data?.data?.items ?? [];
  const dataSources: DataSource[] = items.map(item => ({
    id: item.id?.replace(/^db_/, '') || item.id,
    name: item.name,
    type: item.type,
    dbType: item.subtype,  // 真实数据库类型
    // ...
  }));

  return { dataSources, /* ... */ };
};
```

### 5. QueryWorkspace 组件改造

```typescript
// frontend/src/new/Query/QueryWorkspace.tsx
export const QueryWorkspace: React.FC<QueryWorkspaceProps> = ({ previewSQL }) => {
  const {
    selectedTables,
    currentTab,
    queryResults,
    lastQuery,  // 新增
    handleTableSelect,
    handleRemoveTable,
    handleTabChange,
    handleQueryExecute,
  } = useQueryWorkspace();

  return (
    <PanelGroup>
      <DataSourcePanel
        selectedTables={selectedTables[currentTab] || []}
        onTableSelect={handleTableSelect}  // 传递 SelectedTable 对象
        // ...
      />
      <QueryTabs
        selectedTables={selectedTables[currentTab] || []}  // SelectedTable[]
        onExecute={handleQueryExecute}  // (sql, source?) => Promise<void>
        // ...
      />
      <ResultPanel
        // 新增：传递查询来源信息
        source={lastQuery?.source}
        currentSQL={lastQuery?.sql}
        // ...
      />
    </PanelGroup>
  );
};
```

### 6. ResultPanel 导入按钮逻辑

```typescript
// frontend/src/new/Query/ResultPanel/ResultPanel.tsx
interface ResultPanelProps {
  data: Record<string, unknown>[] | null;
  columns: string[] | null;
  loading: boolean;
  error: Error | null;
  // 新增
  source?: TableSource;
  currentSQL?: string;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({
  data, columns, loading, error, source, currentSQL
}) => {
  // 显示导入按钮的条件：有外部数据源且有 SQL
  const showImportButton = source?.type === 'external' && currentSQL;
  
  return (
    <div>
      {showImportButton && (
        <Button onClick={() => setImportDialogOpen(true)}>
          导入到 DuckDB
        </Button>
      )}
      <ImportToDuckDBDialog
        open={importDialogOpen}
        sql={currentSQL}
        source={source}
        // ...
      />
    </div>
  );
};
```

### 7. ImportToDuckDBDialog ID 处理

```typescript
// frontend/src/new/Query/ResultPanel/ImportToDuckDBDialog.tsx
const handleImport = async () => {
  const response = await fetch('/api/save_query_to_duckdb', {
    method: 'POST',
    body: JSON.stringify({
      sql,
      table_alias: tableName,
      datasource: {
        // 确保 ID 不带 db_ 前缀
        id: source?.connectionId?.replace(/^db_/, '') || source?.connectionId,
        type: source?.databaseType || 'mysql',
      },
    }),
  });
  // ...
};
```


### 8. DataSourcePanel 选中状态匹配

```typescript
// frontend/src/new/Query/DataSourcePanel/DatabaseConnectionNode.tsx
const isTableSelected = (table: ExternalTable, selectedTables: SelectedTable[]): boolean => {
  return selectedTables.some(selected => {
    if (typeof selected === 'string') {
      // 旧格式：字符串匹配（向后兼容）
      return selected === table.name || 
             selected === `${connectionId}.${table.schema}.${table.name}`;
    }
    // 新格式：对象匹配
    return selected.source === 'external' &&
           selected.connection?.id === connectionId &&
           selected.schema === table.schema &&
           selected.name === table.name;
  });
};
```

### 9. JoinQueryPanel 配置收缩

```typescript
// frontend/src/new/Query/JoinQuery/JoinQueryPanel.tsx
useEffect(() => {
  const activeTables = selectedTables.filter(t => /* 有效表 */);
  
  // 当表数量减少时，收缩 joinConfigs
  if (activeTables.length < joinConfigs.length + 1) {
    setJoinConfigs(prev => prev.slice(0, Math.max(0, activeTables.length - 1)));
    // 同步清理 selectedColumns
    setSelectedColumns(prev => {
      const newColumns = { ...prev };
      Object.keys(newColumns).forEach(key => {
        if (!activeTables.some(t => getTableName(t) === key)) {
          delete newColumns[key];
        }
      });
      return newColumns;
    });
  }
}, [selectedTables]);
```

### 10. SetOperationsPanel 列一致性校验

```typescript
// frontend/src/new/Query/SetOperations/SetOperationsPanel.tsx
const validateColumnConsistency = (): { valid: boolean; error?: string } => {
  if (selectedTables.length < 2) return { valid: true };
  
  const firstTableColumns = selectedColumns[getTableName(selectedTables[0])] || [];
  const baselineSet = new Set(firstTableColumns);
  
  for (let i = 1; i < selectedTables.length; i++) {
    const tableName = getTableName(selectedTables[i]);
    const tableColumns = selectedColumns[tableName] || [];
    
    // 检查列数量是否一致
    if (tableColumns.length !== firstTableColumns.length) {
      return { 
        valid: false, 
        error: `表 "${tableName}" 选择的列数量与第一个表不一致` 
      };
    }
    
    // 检查列名是否匹配
    for (const col of tableColumns) {
      if (!baselineSet.has(col)) {
        return { 
          valid: false, 
          error: `表 "${tableName}" 的列 "${col}" 在第一个表中不存在` 
        };
      }
    }
  }
  
  return { valid: true };
};
```

### 11. PivotTablePanel 真正实现

```typescript
// frontend/src/new/Query/PivotTable/PivotTablePanel.tsx
const generatePivotSQL = async (): Promise<string | null> => {
  if (!selectedTable || !rowFields.length || !columnField || !valueField) {
    return null;
  }
  
  const tableName = getTableName(selectedTable);
  
  // 1. 先查询 columnField 的 distinct 值
  const distinctSQL = `SELECT DISTINCT "${columnField}" FROM "${tableName}" LIMIT 20`;
  const distinctResult = await executeDuckDBSQL(distinctSQL);
  const distinctValues = distinctResult.data?.map(row => row[columnField]) || [];
  
  if (distinctValues.length > 20) {
    toast.warning('透视列值超过 20 个，建议先导入 DuckDB 再透视');
  }
  
  // 2. 生成 CASE WHEN 表达式
  const pivotColumns = distinctValues.map(val => {
    const safeVal = String(val).replace(/'/g, "''");
    const safeAlias = String(val).replace(/"/g, '""');
    return `SUM(CASE WHEN "${columnField}" = '${safeVal}' THEN "${valueField}" END) AS "${safeAlias}"`;
  });
  
  // 3. 组装完整 SQL
  const sql = `
    SELECT ${rowFields.map(f => `"${f}"`).join(', ')},
           ${pivotColumns.join(',\n           ')}
    FROM "${tableName}"
    GROUP BY ${rowFields.map(f => `"${f}"`).join(', ')}
  `;
  
  return sql.trim();
};
```

## Data Models

### SelectedTable 完整类型

```typescript
// 数据源类型
type DataSourceType = 'duckdb' | 'external';

// 数据库类型
type DatabaseType = 'mysql' | 'postgresql' | 'sqlite';

// 外部连接信息
interface ExternalConnection {
  id: string;        // 原始 ID（不带 db_ 前缀）
  name: string;      // 连接显示名称
  type: DatabaseType;
}

// 选中的表对象
interface SelectedTableObject {
  name: string;
  source: DataSourceType;
  connection?: ExternalConnection;
  schema?: string;
  displayName?: string;
}

// 联合类型（向后兼容）
type SelectedTable = string | SelectedTableObject;
```

### TableSource 类型

```typescript
interface TableSource {
  type: 'duckdb' | 'external';
  connectionId?: string;    // 原始 ID（不带 db_ 前缀）
  connectionName?: string;
  databaseType?: DatabaseType;
  schema?: string;
}
```

### API 响应类型

```typescript
// 数据源列表响应
interface DataSourceListResponse {
  success: boolean;
  data: {
    items: Array<{
      id: string;           // 带 db_ 前缀
      name: string;
      type: 'database';     // 固定为 database
      subtype: DatabaseType; // 真实数据库类型
      status: string;
      connection_info: {
        host: string;
        port: number;
        database: string;
        username: string;
        password: string;   // "***ENCRYPTED***" 或实际密码
      };
      metadata?: Record<string, unknown>;
    }>;
    total: number;
  };
}

// 连接测试响应
interface ConnectionTestResponse {
  success: boolean;
  data: {
    connection_test: {
      success: boolean;
      message?: string;
    };
  };
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: SelectedTable Data Flow Integrity

*For any* external table selection event, the SelectedTable object stored in QueryWorkspace state SHALL contain all required fields (name, source='external', connection.id, connection.type) and these fields SHALL be preserved when passed to QueryTabs and child panels.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4**

### Property 2: API Response Transformation Correctness

*For any* API response from `/api/datasources/databases/list`, the useDatabaseConnections hook SHALL:
- Strip "db_" prefix from all item.id values
- Map item.subtype to connection.type
- Preserve all connection_info fields in params

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 3: External Query Execution Routing

*For any* query execution with source.type='external', the system SHALL call `/api/execute_sql` with datasource.id (without db_ prefix) and datasource.type matching the actual database type, and SHALL NOT call the DuckDB execution path.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 4: Import Dialog Data Flow Correctness

*For any* import operation from external query results, the ImportToDuckDBDialog SHALL receive currentSQL and source from QueryWorkspace, and the API request SHALL contain datasource.id without "db_" prefix and datasource.type as the actual database type.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

### Property 5: External Table Selection State Correctness

*For any* external table in DataSourcePanel, the isSelected state SHALL be determined by matching connection.id + schema + table.name (or SelectedTable object comparison), and the visual highlight SHALL accurately reflect this state.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 6: Connection Test API Routing

*For any* connection test operation, if the connection is not yet saved, the system SHALL call POST `/api/datasources/databases/test`; if the connection is already saved, the system SHALL call POST `/api/datasources/databases/{id}/refresh`.

**Validates: Requirements 6.1, 6.2, 6.3**

### Property 7: Join Config Synchronization

*For any* table removal from JoinQueryPanel, the joinConfigs array length SHALL equal (activeTables.length - 1), and selectedColumns SHALL not contain entries for removed tables.

**Validates: Requirements 7.1, 7.2**

### Property 8: Join Multi-Condition SQL Generation

*For any* JoinConfig with multiple conditions, the generated SQL SHALL combine all conditions with AND operator in the ON clause.

**Validates: Requirements 7.3, 7.4**

### Property 9: Set Operations Column Validation

*For any* Set Operations with 2+ tables, if the selected columns across tables have different counts or non-matching names, the execute button SHALL be disabled and a warning SHALL be displayed.

**Validates: Requirements 8.1, 8.2, 8.3, 8.4**

### Property 10: Pivot SQL Generation Correctness

*For any* pivot configuration with rowFields, columnField, and valueField, the generated SQL SHALL contain CASE WHEN expressions for each distinct value of columnField, and SHALL GROUP BY all rowFields.

**Validates: Requirements 9.1, 9.3, 9.4**

### Property 11: External Table Context Menu Filtering

*For any* right-click on an external table, the context menu SHALL NOT contain DuckDB-specific options (DESCRIBE, DROP), and SHALL contain Preview and Import options.

**Validates: Requirements 11.1, 11.2, 11.3**

### Property 12: AG Grid Community Compatibility

*For any* AG Grid configuration in the new layout, enableRangeSelection SHALL be false or undefined, and all grid API calls SHALL use optional chaining (gridApi?.method?.()).

**Validates: Requirements 12.1, 12.2, 12.3**

## Error Handling

### API 错误处理

| 场景 | 处理方式 |
|------|----------|
| 数据源列表获取失败 | 显示错误提示，允许重试 |
| 连接测试失败 | 显示具体错误信息（连接超时、认证失败等） |
| 外部查询执行失败 | 显示数据库错误信息，保留 SQL 供用户修改 |
| 导入失败 | 显示错误原因，不关闭对话框，允许重试 |

### 数据验证错误

| 场景 | 处理方式 |
|------|----------|
| Set Operations 列不一致 | 禁用执行按钮，显示具体不一致信息 |
| Pivot 透视列值过多 | 显示警告，建议先导入 DuckDB |
| Join 表被删除 | 自动收缩配置，清理孤立数据 |

### 边界情况

| 场景 | 处理方式 |
|------|----------|
| 外部表无列信息 | 显示提示"请先导入 DuckDB" |
| 混合数据源（DuckDB + 外部） | 禁止操作，显示提示 |
| 密码字段为 "***ENCRYPTED***" | 保存时保留原密码 |

## Testing Strategy

### 单元测试

使用 Vitest 进行单元测试：

1. **tableUtils.ts 工具函数测试**
   - normalizeSelectedTable 转换正确性
   - isExternalTable 判断正确性
   - getTableConnection 提取正确性

2. **Hook 测试**
   - useDatabaseConnections API 响应解析
   - useDataSources 数据转换
   - useQueryWorkspace 状态管理

3. **组件测试**
   - DataSourcePanel 选中状态渲染
   - ImportToDuckDBDialog 表单验证
   - JoinQueryPanel 配置收缩

### 属性测试

使用 fast-check 进行属性测试：

```typescript
import fc from 'fast-check';

// Property 2: API Response Transformation
test('useDatabaseConnections strips db_ prefix from all IDs', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({
        id: fc.string().map(s => `db_${s}`),
        name: fc.string(),
        subtype: fc.constantFrom('mysql', 'postgresql', 'sqlite'),
      })),
      (items) => {
        const result = transformDatabaseConnections(items);
        return result.every(conn => !conn.id.startsWith('db_'));
      }
    )
  );
});

// Property 7: Join Config Synchronization
test('joinConfigs length equals activeTables.length - 1 after removal', () => {
  fc.assert(
    fc.property(
      fc.array(fc.string(), { minLength: 2, maxLength: 10 }),
      fc.integer({ min: 0 }),
      (tables, removeIndex) => {
        const idx = removeIndex % tables.length;
        const remaining = tables.filter((_, i) => i !== idx);
        const expectedConfigLength = Math.max(0, remaining.length - 1);
        // 验证配置收缩逻辑
        return shrinkJoinConfigs(tables, idx).length === expectedConfigLength;
      }
    )
  );
});
```

### 测试配置

- 属性测试最小迭代次数：100
- 测试标注格式：`**Feature: external-table-integration-fixes, Property {number}: {property_text}**`

