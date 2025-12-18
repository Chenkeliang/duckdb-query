# Design Document

## Overview

本设计文档描述了外部数据库工作台导入功能的技术实现方案。该功能采用"外部先导入再使用"的策略，允许用户在查询工作台中直接操作外部数据库表，并将结果导入到 DuckDB 中进行进一步分析。

## Architecture

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Query Workbench                         │
├─────────────────┬─────────────────┬─────────────────────────┤
│   Data Source   │   Query Panels  │     Result Panel        │
│     Panel       │                 │                         │
│                 │  ┌─────────────┐ │  ┌─────────────────────┐ │
│  ┌───────────┐  │  │ SQL Query   │ │  │ Results Display     │ │
│  │ DuckDB    │  │  │ Visual      │ │  │ Import to DuckDB    │ │
│  │ Tables    │  │  │ Join        │ │  │ Export Options      │ │
│  │           │  │  │ Set Ops     │ │  │                     │ │
│  ├───────────┤  │  │ Pivot       │ │  └─────────────────────┘ │
│  │ External  │  │  └─────────────┘ │                         │
│  │ MySQL     │  │                 │                         │
│  │ PostgreSQL│  │                 │                         │
│  │ SQLite    │  │                 │                         │
│  └───────────┘  │                 │                         │
└─────────────────┴─────────────────┴─────────────────────────┘
```

### 数据流架构

```
用户选择外部表
    │
    ▼
SelectedTable 对象创建 { name, source: "external", connection }
    │
    ▼
查询面板生成 SQL (针对外部数据库)
    │
    ▼
执行查询 (直接连接外部数据库)
    │
    ▼
结果显示 + 导入选项
    │
    ▼
用户选择导入 → 调用 /api/save_query_to_duckdb
    │
    ▼
DuckDB 表创建 + 数据源面板刷新
```

## Components and Interfaces

### 1. SelectedTable 数据结构升级

**当前格式 (Legacy)**:
```typescript
type SelectedTable = string; // "table_name"
```

**新格式 (Enhanced)**:
```typescript
interface SelectedTableObject {
  name: string;                    // 表名
  source: "duckdb" | "external";   // 数据源类型
  connection?: {                   // 外部数据库连接信息
    id: string;
    name: string;
    type: "mysql" | "postgresql" | "sqlite";
  };
  schema?: string;                 // 模式名（PostgreSQL）
  displayName?: string;            // 显示名称
}

type SelectedTable = string | SelectedTableObject;
```

**兼容性处理**:
```typescript
// 工具函数：统一处理 SelectedTable
function normalizeSelectedTable(table: SelectedTable): SelectedTableObject {
  if (typeof table === 'string') {
    return { name: table, source: 'duckdb' };
  }
  return table;
}

function getTableName(table: SelectedTable): string {
  return typeof table === 'string' ? table : table.name;
}

function isExternalTable(table: SelectedTable): boolean {
  return typeof table === 'object' && table.source === 'external';
}
```

### 2. DataSourcePanel 增强

**修改位置**: `frontend/src/new/Query/DataSourcePanel/`

**新增功能**:
- 外部数据库表的可视化区分（图标、颜色）
- 点击外部表时创建 SelectedTableObject
- 右键菜单：预览、导入、刷新

```typescript
// DataSourcePanel 中的表点击处理
const handleTableClick = (tableName: string, connection?: DatabaseConnection) => {
  const selectedTable: SelectedTableObject = connection ? {
    name: tableName,
    source: 'external',
    connection: {
      id: connection.id,
      name: connection.name,
      type: connection.type
    }
  } : {
    name: tableName,
    source: 'duckdb'
  };
  
  onTableSelect(selectedTable);
};
```

### 3. SQL Query Panel 增强

**修改位置**: `frontend/src/new/Query/SQLQuery/SQLQueryPanel.tsx`

**新增功能**:
- 检测选中的外部表
- 生成外部数据库预览 SQL
- 执行外部查询的 API 调用

```typescript
// SQL 生成逻辑
const generatePreviewSQL = (selectedTables: SelectedTable[]) => {
  const externalTables = selectedTables.filter(isExternalTable);
  const duckdbTables = selectedTables.filter(t => !isExternalTable(t));
  
  if (externalTables.length > 0 && duckdbTables.length > 0) {
    // 混合查询警告
    showWarning('不能在同一查询中混合 DuckDB 表和外部表');
    return '';
  }
  
  if (externalTables.length > 0) {
    const table = normalizeSelectedTable(externalTables[0]);
    return `SELECT * FROM ${table.name} LIMIT 100`;
  }
  
  // DuckDB 表的处理保持不变
  return selectedTables.map(getTableName).map(name => 
    `SELECT * FROM "${name}" LIMIT 100`
  ).join('\n\nUNION ALL\n\n');
};
```

### 4. Query Execution Service

**修改位置**: `frontend/src/services/apiClient.js`

**新增 API**:
```javascript
// 执行外部数据库查询
export const executeExternalQuery = async (sql, connectionId) => {
  const response = await fetch('/api/execute_sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql,
      connection_id: connectionId,
      source: 'external'
    })
  });
  return response.json();
};

// 导入查询结果到 DuckDB
export const importQueryToDuckDB = async (sql, tableName, connectionId) => {
  const response = await fetch('/api/save_query_to_duckdb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql,
      table_alias: tableName,
      datasource: {
        id: connectionId,
        type: connectionId ? 'mysql' : 'duckdb'
      }
    })
  });
  return response.json();
};
```

### 5. Result Panel 增强

**修改位置**: `frontend/src/new/Query/ResultPanel/ResultPanel.tsx`

**新增功能**:
- 检测外部查询结果
- 显示"导入到 DuckDB"按钮
- 导入对话框组件

```typescript
// 导入对话框组件
const ImportToDuckDBDialog = ({ 
  open, 
  onClose, 
  onImport, 
  defaultTableName 
}) => {
  const [tableName, setTableName] = useState(defaultTableName);
  const [importing, setImporting] = useState(false);
  
  const handleImport = async () => {
    setImporting(true);
    try {
      await onImport(tableName);
      onClose();
      toast.success(`数据已导入到表 "${tableName}"`);
    } catch (error) {
      toast.error(`导入失败: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>导入到 DuckDB</DialogTitle>
          <DialogDescription>
            将查询结果保存为 DuckDB 表，以便进行进一步分析
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="tableName">表名</Label>
            <Input
              id="tableName"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="输入表名"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleImport} disabled={importing || !tableName}>
            {importing ? '导入中...' : '导入'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

## Data Models

### API 请求格式

```typescript
// 执行外部查询请求
interface ExecuteExternalQueryRequest {
  sql: string;
  connection_id: string;
  source: 'external';
  limit?: number;
}

// 导入到 DuckDB 请求
interface ImportToDuckDBRequest {
  sql: string;
  table_alias: string;
  datasource: {
    id: string;
    type: string;
  };
}
```

### 响应格式

```typescript
// 查询结果响应
interface QueryResultResponse {
  success: boolean;
  data: {
    columns: Array<{
      name: string;
      type: string;
    }>;
    rows: any[][];
    execution_time: number;
    row_count: number;
    source: 'duckdb' | 'external';
    connection?: {
      id: string;
      name: string;
      type: string;
    };
  };
  message: string;
}

// 导入结果响应
interface ImportResultResponse {
  success: boolean;
  table_alias: string;
  row_count: number;
  columns: string[];
  message: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: SelectedTable Normalization Consistency
*For any* SelectedTable input (string or object), calling `normalizeSelectedTable()` SHALL always return a valid `SelectedTableObject` with `name` and `source` fields populated.
**Validates: Requirements 2.3, 2.4**

### Property 2: External Table Detection Accuracy
*For any* SelectedTable object with `source: "external"`, the function `isExternalTable()` SHALL return `true`, and for all other inputs SHALL return `false`.
**Validates: Requirements 2.2**

### Property 3: Table Name Extraction Consistency
*For any* SelectedTable input, `getTableName()` SHALL return the same table name regardless of whether the input is a string or an object.
**Validates: Requirements 2.1, 2.3**

### Property 4: Import Operation Data Integrity
*For any* successful import operation, the row count in the DuckDB table SHALL equal the row count from the original query result.
**Validates: Requirements 4.3, 4.4**

### Property 5: Cross-Database Query Prevention
*For any* query attempt mixing DuckDB tables and external tables, the system SHALL prevent execution and display a warning.
**Validates: Requirements 5.4, 6.3, 7.4**

## Error Handling

### 1. 连接错误
- 显示具体的数据库连接错误信息
- 提供重试和诊断选项
- 建议检查连接配置

### 2. 查询错误
- 区分语法错误和执行错误
- 显示数据库特定的错误信息
- 提供 SQL 语法帮助链接

### 3. 导入错误
- 表名冲突处理
- 数据类型转换错误
- 磁盘空间不足警告

## Testing Strategy

### Unit Testing
- SelectedTable 工具函数测试
- SQL 生成逻辑测试
- 数据转换函数测试

### Property-Based Testing
使用 `fast-check` 库进行属性测试：
- 测试 `normalizeSelectedTable` 的幂等性
- 测试 `isExternalTable` 的正确性
- 测试 `getTableName` 的一致性

### Integration Testing
- 外部数据库连接测试
- 查询执行和结果处理测试
- 导入功能端到端测试
