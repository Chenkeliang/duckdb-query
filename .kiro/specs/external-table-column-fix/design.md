# Design Document: External Table Column Fix

## Overview

本设计文档描述了修复外部数据库表在查询工作台中三个关键问题的技术方案：
1. 外部表列信息获取失败
2. 联邦查询 API 404 错误
3. SQL 查询面板联邦查询支持

## Architecture

### 混用/非混用判断逻辑

当前系统通过 `selectedTables` 数组来判断查询涉及的数据源类型：

```typescript
// 在 SQLQueryPanel 中的 tableSourceInfo 计算逻辑
const tableSourceInfo = useMemo(() => {
  const normalizedTables = selectedTables.map(t => normalizeSelectedTable(t));
  
  // 分类：外部表 vs DuckDB 表
  const externalTables = normalizedTables.filter(t => t.source === 'external');
  const duckdbSelectedTables = normalizedTables.filter(t => t.source !== 'external');
  
  // 混用判断：同时存在外部表和 DuckDB 表
  const hasMixedSources = externalTables.length > 0 && duckdbSelectedTables.length > 0;
  
  // 纯外部表判断
  const isExternal = externalTables.length > 0 && duckdbSelectedTables.length === 0;
  
  return { hasMixedSources, isExternal, ... };
}, [selectedTables]);
```

**三种场景：**

| 场景 | 条件 | 处理方式 |
|------|------|---------|
| 纯 DuckDB | `externalTables.length === 0` | 使用 `executeDuckDBSQL()` |
| 纯外部数据库 | `duckdbTables.length === 0 && externalTables.length > 0` | 使用 `executeExternalSQL()` |
| 混用（DuckDB + 外部） | `hasMixedSources === true` | **当前：禁止执行** → **目标：使用联邦查询** |

### SQL 查询多表支持方案

**当前问题：** SQLQueryPanel 禁止混用 DuckDB 和外部表

**目标方案：** 通过联邦查询 API 支持混用

```
用户选择表 → selectedTables 更新 → tableSourceInfo 计算
                                          │
                                          ▼
                              ┌─────────────────────────┐
                              │   hasMixedSources?      │
                              └─────────────────────────┘
                                    │           │
                                   Yes          No
                                    │           │
                                    ▼           ▼
                         ┌──────────────┐  ┌──────────────────┐
                         │ 联邦查询模式  │  │ 单数据源模式      │
                         │              │  │                  │
                         │ 1. 提取外部表 │  │ isExternal?      │
                         │    连接信息   │  │   Yes → External │
                         │ 2. 构建      │  │   No  → DuckDB   │
                         │    attachDbs │  │                  │
                         │ 3. 调用联邦  │  └──────────────────┘
                         │    查询 API  │
                         └──────────────┘
```

### 当前架构问题

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend                                  │
├─────────────────────────────────────────────────────────────────┤
│  JoinQueryPanel                                                  │
│  ├── 使用 getDuckDBTableDetail() 获取列信息 ❌                   │
│  │   └── 只支持 DuckDB 内部表                                    │
│  └── 外部表列信息为空                                            │
├─────────────────────────────────────────────────────────────────┤
│  SQLQueryPanel                                                   │
│  ├── 使用 executeDuckDBSQL() 执行查询                            │
│  │   └── 不支持 attach_databases 参数                            │
│  └── 无法执行联邦查询                                            │
├─────────────────────────────────────────────────────────────────┤
│  apiClient.js                                                    │
│  ├── executeFederatedQuery() 调用 /api/duckdb/query              │
│  └── 后端未完整实现 attach_databases 处理 ❌                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend                                   │
├─────────────────────────────────────────────────────────────────┤
│  /api/duckdb/query (duckdb_query.py)                            │
│  ├── DuckDBQueryRequest 模型不包含 attach_databases ❌           │
│  └── 未实现 ATTACH 数据库逻辑                                    │
├─────────────────────────────────────────────────────────────────┤
│  /api/database_table_details/{connection_id}/{table_name}       │
│  └── 已实现，但前端未使用 ✓                                      │
├─────────────────────────────────────────────────────────────────┤
│  build_attach_sql() (duckdb_engine.py)                          │
│  └── 已实现 ATTACH SQL 生成 ✓                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 目标架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend                                  │
├─────────────────────────────────────────────────────────────────┤
│  JoinQueryPanel                                                  │
│  ├── 检测表来源 (DuckDB vs External)                             │
│  ├── DuckDB 表: getDuckDBTableDetail()                          │
│  └── 外部表: getExternalTableDetail() ✓                         │
├─────────────────────────────────────────────────────────────────┤
│  SQLQueryPanel                                                   │
│  ├── 检测 selectedTables 中是否有外部表                          │
│  ├── 有外部表: executeFederatedQuery()                          │
│  └── 纯 DuckDB: executeDuckDBSQL()                              │
├─────────────────────────────────────────────────────────────────┤
│  apiClient.js                                                    │
│  ├── executeFederatedQuery() → /api/duckdb/federated-query      │
│  └── getExternalTableDetail() → /api/database_table_details/... │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend                                   │
├─────────────────────────────────────────────────────────────────┤
│  /api/duckdb/federated-query (新端点)                           │
│  ├── FederatedQueryRequest 模型                                  │
│  │   ├── sql: str                                                │
│  │   ├── attach_databases: List[AttachDatabase]                 │
│  │   ├── is_preview: bool                                        │
│  │   └── save_as_table: Optional[str]                           │
│  ├── 获取连接配置并解密密码                                      │
│  ├── 执行 ATTACH 语句                                            │
│  ├── 执行用户 SQL                                                │
│  └── 执行 DETACH 清理                                            │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Frontend: JoinQueryPanel 列信息获取

**文件**: `frontend/src/new/Query/JoinQuery/JoinQueryPanel.tsx`

**修改**: 更新 `tableColumnsQueries` 的 `queryFn` 以支持外部表

```typescript
// 获取表的列信息
const tableColumnsQueries = useQueries({
  queries: activeTables.map((table) => {
    const tableName = getTableName(table);
    const normalized = normalizeSelectedTable(table);
    const isExternal = normalized.source === 'external';
    
    return {
      queryKey: ['table-columns', tableName, isExternal ? normalized.connection?.id : 'duckdb'],
      queryFn: async () => {
        if (isExternal && normalized.connection?.id) {
          // 外部表：使用 getExternalTableDetail API
          const response = await getExternalTableDetail(
            normalized.connection.id,
            tableName,
            normalized.schema
          );
          // 转换响应格式以匹配 DuckDB 表格式
          return {
            name: tableName,
            columns: (response.columns || []).map((col: any) => ({
              name: col.name,
              type: col.type,
            })),
          };
        }
        // DuckDB 表：使用原有逻辑
        const response = await getDuckDBTableDetail(tableName);
        const tableData = response?.table || response;
        const rawColumns = tableData?.columns || [];
        return {
          name: tableName,
          columns: rawColumns.map((col: any) => ({
            name: col.column_name || col.name,
            type: col.data_type || col.type,
          })),
        };
      },
      enabled: !!tableName,
      staleTime: 5 * 60 * 1000,
    };
  }),
});
```

### 2. Backend: 联邦查询 API 端点

**文件**: `api/routers/duckdb_query.py`

**新增**: `/api/duckdb/federated-query` 端点

```python
class FederatedQueryRequest(BaseModel):
    """联邦查询请求模型"""
    sql: str
    attach_databases: Optional[List[AttachDatabase]] = None
    is_preview: Optional[bool] = True
    save_as_table: Optional[str] = None
    timeout: Optional[int] = 30000  # 毫秒


@router.post("/api/duckdb/federated-query", tags=["DuckDB Query"])
async def execute_federated_query(request: FederatedQueryRequest):
    """
    执行联邦查询，支持跨数据库 ATTACH
    
    流程：
    1. 验证请求参数
    2. 获取外部数据库连接配置
    3. 执行 ATTACH 语句
    4. 执行用户 SQL
    5. 执行 DETACH 清理
    6. 返回结果
    """
    con = get_db_connection()
    attached_aliases = []
    
    try:
        # 1. ATTACH 外部数据库
        if request.attach_databases:
            for attach_db in request.attach_databases:
                # 获取连接配置
                connection = db_manager.get_connection(attach_db.connection_id)
                if not connection:
                    raise HTTPException(
                        status_code=404,
                        detail=f"数据库连接 {attach_db.connection_id} 不存在"
                    )
                
                # 解密密码
                db_config = connection.params.copy()
                if password_encryptor.is_encrypted(db_config.get('password', '')):
                    db_config['password'] = password_encryptor.decrypt_password(db_config['password'])
                db_config['type'] = connection.type
                
                # 生成并执行 ATTACH SQL
                attach_sql = build_attach_sql(attach_db.alias, db_config)
                con.execute(attach_sql)
                attached_aliases.append(attach_db.alias)
        
        # 2. 执行用户 SQL
        result_df = con.execute(request.sql).fetchdf()
        
        # 3. 返回结果
        return {
            "success": True,
            "columns": result_df.columns.tolist(),
            "data": normalize_dataframe_output(result_df),
            "row_count": len(result_df),
        }
        
    finally:
        # 4. DETACH 清理
        for alias in attached_aliases:
            try:
                con.execute(f"DETACH {alias}")
            except Exception as e:
                logger.warning(f"DETACH {alias} 失败: {e}")
```

### 3. Frontend: SQLQueryPanel 联邦查询支持

**文件**: `frontend/src/new/Query/SQLQuery/SQLQueryPanel.tsx`

**修改**: 移除混用限制，支持联邦查询

```typescript
// 修改 handleExecute 函数
const handleExecute = useCallback(async () => {
  if (!sql.trim()) return;
  
  // 移除混用限制，改为使用联邦查询
  // if (tableSourceInfo.hasMixedSources) { ... } // 删除这段
  
  if (onExecute) {
    setIsExecuting(true);
    const { displaySql } = applyDisplayLimit(sql.trim());
    const startTime = Date.now();
    try {
      // 如果有混用，传递联邦查询所需的 attachDatabases 信息
      let source = tableSourceInfo.currentSource;
      if (tableSourceInfo.hasMixedSources) {
        // 构建联邦查询的 attachDatabases
        const attachDatabases = extractAttachDatabases(selectedTables);
        source = {
          type: 'federated',
          attachDatabases,
        };
      }
      await onExecute(displaySql, source);
      addToHistory({ sql: displaySql, executionTime: Date.now() - startTime });
    } catch (err) {
      // ... 错误处理
    } finally {
      setIsExecuting(false);
    }
  }
}, [sql, onExecute, tableSourceInfo, selectedTables, applyDisplayLimit]);
```

### 4. Frontend: useQueryWorkspace 联邦查询路由

**文件**: `frontend/src/new/hooks/useQueryWorkspace.ts`

**修改**: 在 `executeQuery` 中根据 source.type 选择 API

```typescript
const executeQuery = async (sql: string, source?: TableSource) => {
  if (source?.type === 'federated' && source.attachDatabases?.length > 0) {
    // 联邦查询：使用 executeFederatedQuery
    return await executeFederatedQuery({
      sql,
      attachDatabases: source.attachDatabases,
      isPreview: true,
    });
  } else if (source?.type === 'external' && source.connectionId) {
    // 纯外部数据库查询
    return await executeExternalSQL(sql, {
      id: source.connectionId,
      type: source.databaseType,
    }, true);
  } else {
    // DuckDB 查询
    return await executeDuckDBSQL(sql, null, true);
  }
};
```

### 5. Frontend: apiClient 更新

**文件**: `frontend/src/services/apiClient.js`

**修改**: 更新 `executeFederatedQuery` 使用新端点

```javascript
export const executeFederatedQuery = async (options) => {
  const { 
    sql, 
    attachDatabases, 
    isPreview = true, 
    saveAsTable = null,
    timeout = 30000 
  } = options;
  
  try {
    const requestBody = {
      sql,
      is_preview: isPreview,
    };
    
    if (attachDatabases && attachDatabases.length > 0) {
      requestBody.attach_databases = attachDatabases.map(db => ({
        alias: db.alias,
        connection_id: db.connectionId,
      }));
    }
    
    if (saveAsTable) {
      requestBody.save_as_table = saveAsTable;
    }
    
    // 使用新的联邦查询端点
    const response = await apiClient.post('/api/duckdb/federated-query', requestBody, {
      timeout,
    });
    
    return response.data;
  } catch (error) {
    const parsedError = parseFederatedQueryError(error);
    const enhancedError = new Error(parsedError.message);
    enhancedError.type = parsedError.type;
    enhancedError.connectionName = parsedError.connectionName;
    enhancedError.originalError = error;
    throw enhancedError;
  }
};
```

## Data Models

### TableSource (前端类型扩展)

```typescript
// 扩展 TableSource 类型以支持联邦查询
export type TableSource = 
  | { type: 'duckdb' }
  | { 
      type: 'external';
      connectionId?: string;
      connectionName?: string;
      databaseType?: string;
      schema?: string;
    }
  | {
      type: 'federated';  // 新增：联邦查询类型
      attachDatabases: Array<{
        alias: string;
        connectionId: string;
      }>;
    };
```

### AttachDatabase (已存在)

```python
class AttachDatabase(BaseModel):
    """外部数据库连接信息，用于联邦查询"""
    alias: str = Field(..., description="SQL 中使用的数据库别名")
    connection_id: str = Field(..., description="已保存的数据库连接 ID")
```

### FederatedQueryRequest (新增)

```python
class FederatedQueryRequest(BaseModel):
    """联邦查询请求模型"""
    sql: str = Field(..., description="SQL 查询语句")
    attach_databases: Optional[List[AttachDatabase]] = Field(
        None, description="需要 ATTACH 的外部数据库列表"
    )
    is_preview: Optional[bool] = Field(True, description="是否为预览模式")
    save_as_table: Optional[str] = Field(None, description="保存结果为表名")
    timeout: Optional[int] = Field(30000, description="超时时间（毫秒）")
```

### FederatedQueryResponse (新增)

```python
class FederatedQueryResponse(BaseModel):
    """联邦查询响应模型"""
    success: bool
    columns: List[str] = []
    data: List[Dict[str, Any]] = []
    row_count: int = 0
    execution_time_ms: float = 0
    attached_databases: List[str] = []
    message: str = ""
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: External Table Column API Selection

*For any* selected table in JoinQueryPanel, if the table source is 'external', the system should call `getExternalTableDetail` API; otherwise, it should call `getDuckDBTableDetail` API.

**Validates: Requirements 1.1, 4.1**

### Property 2: Column Data Format Consistency

*For any* external table column response, the transformed output should have the same structure as DuckDB table column response (containing `name` and `type` fields).

**Validates: Requirements 1.4, 4.2**

### Property 3: Federated Query API Routing

*For any* query execution with non-empty `attachDatabases` array, the system should route the request to the federated query API endpoint.

**Validates: Requirements 2.1, 3.2**

### Property 4: Pure DuckDB Query Routing

*For any* query execution with empty or undefined `attachDatabases`, the system should use the standard DuckDB query API.

**Validates: Requirements 3.3**

### Property 5: Attach Database Parameter Validation

*For any* federated query request, if `attach_databases` contains an invalid `connection_id`, the system should return a 404 error with a descriptive message.

**Validates: Requirements 2.2, 4.3**

### Property 6: Federated Query Response Format

*For any* successful federated query execution, the response should contain `success`, `columns`, `data`, and `row_count` fields.

**Validates: Requirements 2.3**

## Additional Considerations

### 1. 其他查询面板的外部表支持（本次修复范围）

除了 JoinQueryPanel 和 SQLQueryPanel，以下面板也需要修复：

| 面板 | 当前状态 | 修复方案 |
|------|---------|---------|
| **PivotTablePanel** | 外部表返回空值 | 使用联邦查询 API 获取 distinct 值 |
| **SetOperationsPanel** | 使用 `getDuckDBTableDetail` | 使用 `useTableColumns` Hook |
| **VisualQuery/QueryBuilder** | 需要确认 | 使用 `useTableColumns` Hook |

### 2. useQueryWorkspace 联邦查询支持

当前 `useQueryWorkspace.handleQueryExecute` 只支持两种类型：
- `type: 'duckdb'` → `executeDuckDBSQL`
- `type: 'external'` → `executeExternalSQL`

需要添加第三种类型：
- `type: 'federated'` → `executeFederatedQuery`

### 3. 外部表列信息获取的统一封装

建议创建一个统一的 Hook 来获取表列信息，自动根据表来源选择正确的 API：

```typescript
// frontend/src/new/hooks/useTableColumns.ts
export interface TableColumn {
  name: string;
  type: string;
}

export interface UseTableColumnsResult {
  columns: TableColumn[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isEmpty: boolean;  // 列数组为空
  refetch: () => void;
}

export const useTableColumns = (table: SelectedTable | null): UseTableColumnsResult => {
  const normalized = table ? normalizeSelectedTable(table) : null;
  const isExternal = normalized?.source === 'external';
  
  const query = useQuery({
    queryKey: ['table-columns', normalized?.name, isExternal ? normalized?.connection?.id : 'duckdb'],
    queryFn: async () => {
      if (!normalized) return [];
      
      if (isExternal && normalized.connection?.id) {
        // 外部表
        const response = await getExternalTableDetail(
          normalized.connection.id,
          normalized.name,
          normalized.schema
        );
        return transformExternalColumns(response.columns);
      } else {
        // DuckDB 表
        const response = await getDuckDBTableDetail(normalized.name);
        return transformDuckDBColumns(response.table?.columns);
      }
    },
    enabled: !!normalized,
  });
  
  return {
    columns: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isEmpty: !query.isLoading && (query.data?.length === 0),
    refetch: query.refetch,
  };
};

// 列数据转换函数 - 处理边界情况
const transformExternalColumns = (columns: any[]): TableColumn[] => {
  if (!Array.isArray(columns)) return [];
  return columns.map(col => ({
    name: col.name || col.column_name || 'unknown',
    type: col.type || col.data_type || 'unknown',
  })).filter(col => col.name !== 'unknown');
};

const transformDuckDBColumns = (columns: any[]): TableColumn[] => {
  if (!Array.isArray(columns)) return [];
  return columns.map(col => ({
    name: col.column_name || col.name || 'unknown',
    type: col.data_type || col.type || 'unknown',
  })).filter(col => col.name !== 'unknown');
};
```

### 3.1 边界情况处理

| 边界情况 | 处理方式 |
|---------|---------|
| `columns` 为 `null` 或 `undefined` | 返回空数组 `[]` |
| `columns` 不是数组 | 返回空数组 `[]` |
| 列的 `name` 为空 | 使用 `'unknown'` 作为默认值，然后过滤掉 |
| 列的 `type` 为空 | 使用 `'unknown'` 作为默认值 |
| API 返回错误 | 设置 `isError: true`，显示错误提示 |
| 表不存在 | 返回 404 错误，显示 "表不存在" 提示 |
| 连接不存在 | 返回 404 错误，显示 "连接不存在" 提示 |

### 4. 联邦查询的 SQL 生成

对于混用场景，SQL 中的表引用需要使用正确的格式：
- DuckDB 表：`"table_name"`
- 外部表：`alias.schema.table_name` 或 `alias.table_name`

`sqlUtils.ts` 中的 `extractAttachDatabases` 和 `formatTableReference` 函数已经实现了这个逻辑。

### 5. 错误处理增强

联邦查询可能遇到的错误类型：
1. **ATTACH 失败** - 外部数据库连接失败
2. **认证失败** - 用户名/密码错误
3. **网络超时** - 数据库不可达
4. **SQL 语法错误** - 跨数据库 SQL 兼容性问题
5. **权限不足** - 外部数据库权限问题

`parseFederatedQueryError` 函数已经实现了错误解析，但需要确保所有调用点都使用它。

## Error Handling

### 外部表列信息获取错误

| 错误类型 | 错误码 | 用户提示 | 处理方式 |
|---------|--------|---------|---------|
| 连接不存在 | 404 | "数据库连接不存在" | 显示错误，允许重试 |
| 表不存在 | 404 | "表不存在" | 显示错误，允许重试 |
| 连接超时 | 408 | "连接超时，请检查网络" | 显示错误，允许重试 |
| 认证失败 | 401 | "认证失败，请检查凭据" | 显示错误，引导用户检查连接配置 |
| 列信息为空 | - | "无法获取表结构" | 显示提示，允许重试 |

### 联邦查询错误

| 错误类型 | 错误码 | 用户提示 | 处理方式 |
|---------|--------|---------|---------|
| ATTACH 失败 | 500 | "连接外部数据库失败: {db_name}" | 显示具体数据库名称 |
| SQL 语法错误 | 400 | "SQL 语法错误: {detail}" | 显示详细错误信息 |
| 查询超时 | 408 | "查询超时" | 建议用户优化查询或增加超时时间 |
| 权限不足 | 403 | "权限不足" | 引导用户检查数据库权限 |

### UI 组件边界情况处理

| 组件 | 边界情况 | 处理方式 |
|------|---------|---------|
| TableCard | 列数组为空 | 显示 "无法获取列信息" 提示 |
| TableCard | 列名为空字符串 | 过滤掉该列，不显示 |
| JoinConnector | 左/右表列为空 | 禁用列选择下拉框，显示提示 |
| SetConnector | 列数量不一致 | 显示具体的列数量差异 |
| PivotTablePanel | distinct 值为空 | 显示 "无数据" 提示 |
| PivotTablePanel | distinct 值超过阈值 | 显示警告，只显示前 N 个值 |

## Testing Strategy

### 单元测试

1. **JoinQueryPanel 列信息获取测试**
   - 测试 DuckDB 表列信息获取
   - 测试外部表列信息获取
   - 测试混合表场景

2. **apiClient 联邦查询测试**
   - 测试请求参数构建
   - 测试错误解析

3. **后端联邦查询端点测试**
   - 测试 ATTACH/DETACH 流程
   - 测试参数验证
   - 测试错误处理

### 属性测试

使用 Vitest 进行属性测试：

```typescript
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

describe('External Table Column Fix Properties', () => {
  /**
   * Property 1: External Table Column API Selection
   * **Feature: external-table-column-fix, Property 1: External Table Column API Selection**
   * **Validates: Requirements 1.1, 4.1**
   */
  it('should select correct API based on table source', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }),
          source: fc.constantFrom('duckdb', 'external'),
          connection: fc.option(fc.record({
            id: fc.string({ minLength: 1 }),
            type: fc.constantFrom('mysql', 'postgresql'),
          })),
        }),
        (table) => {
          const isExternal = table.source === 'external';
          const shouldUseExternalAPI = isExternal && table.connection?.id;
          // Verify API selection logic
          return shouldUseExternalAPI === (table.source === 'external' && !!table.connection?.id);
        }
      )
    );
  });

  /**
   * Property 2: Column Data Format Consistency
   * **Feature: external-table-column-fix, Property 2: Column Data Format Consistency**
   * **Validates: Requirements 1.4, 4.2**
   */
  it('should transform external table columns to consistent format', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          name: fc.string({ minLength: 1 }),
          type: fc.string({ minLength: 1 }),
        })),
        (columns) => {
          const transformed = columns.map(col => ({
            name: col.name,
            type: col.type,
          }));
          return transformed.every(col => 
            typeof col.name === 'string' && 
            typeof col.type === 'string'
          );
        }
      )
    );
  });
});
```

### 集成测试

1. **端到端联邦查询测试**
   - 创建测试数据库连接
   - 执行跨数据库查询
   - 验证结果正确性

2. **UI 集成测试**
   - 测试 JoinQueryPanel 外部表选择
   - 测试 SQLQueryPanel 联邦查询执行
