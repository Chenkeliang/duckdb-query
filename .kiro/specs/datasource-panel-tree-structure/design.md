# 数据源面板树形结构设计文档

## Overview

实现类似 DataGrip 的数据源面板树形结构，支持 DuckDB 表分组显示和外部数据库连接的多层级展示。采用懒加载策略优化性能，使用 TanStack Query 进行数据缓存管理。

## Architecture

### 组件层级结构

```
DataSourcePanel (主容器)
├── SearchBar (搜索栏)
├── TreeView (树形视图)
│   ├── DuckDBSection (DuckDB 分组)
│   │   ├── SystemTablesGroup (系统表分组)
│   │   │   └── TableItem[]
│   │   └── NormalTablesGroup (普通表分组)
│   │       └── TableItem[]
│   └── DatabaseConnectionsSection (数据库连接分组)
│       └── DatabaseConnectionNode[] (数据库连接节点)
│           └── SchemaNode[] (Schema 节点)
│               └── TableItem[] (表节点)
└── ActionBar (操作栏 - 刷新/添加)
```

### 数据流架构

```
┌─────────────────┐
│  DataSourcePanel│
└────────┬────────┘
         │
         ├─── useDuckDBTables() ──→ TanStack Query ──→ /api/duckdb_tables
         │
         └─── useDatabaseConnections() ──→ TanStack Query ──→ /api/database_connections
                    │
                    └─── useSchemas(connectionId) ──→ /api/database_connections/{id}/schemas
                              │
                              └─── useTables(connectionId, schema) ──→ /api/database_connections/{id}/schemas/{schema}/tables
```

## Components and Interfaces

### 1. DataSourcePanel (主组件)

**职责**: 数据源面板的主容器，协调所有子组件

```typescript
interface DataSourcePanelProps {
  selectedTables: string[];
  onTableSelect: (tableName: string, source: TableSource) => void;
  onRefresh?: () => void;
  onCollapse?: () => void;
  selectionMode?: 'single' | 'multiple';
  onPreview?: (tableName: string, source: TableSource) => void;
  onDelete?: (tableName: string, source: TableSource) => void;
}

interface TableSource {
  type: 'duckdb' | 'external';
  connectionId?: string;
  schema?: string;
}
```

### 2. TreeNode (通用树节点组件)

**职责**: 可复用的树节点组件，支持展开/折叠、图标、缩进

```typescript
interface TreeNodeProps {
  id: string;
  label: string;
  icon?: React.ReactNode;
  level: number; // 缩进层级 (0, 1, 2, 3)
  isExpandable: boolean;
  isExpanded?: boolean;
  isSelected?: boolean;
  badge?: string | number; // 显示数量徽章
  statusIndicator?: 'success' | 'warning' | 'error' | 'inactive';
  onToggle?: () => void;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}
```

### 3. DatabaseConnectionNode (数据库连接节点)

**职责**: 显示数据库连接，支持懒加载 schemas

```typescript
interface DatabaseConnectionNodeProps {
  connection: DatabaseConnection;
  level: number;
  onTableSelect: (tableName: string, source: TableSource) => void;
}

interface DatabaseConnection {
  id: string;
  name: string;
  type: 'postgresql' | 'mysql' | 'sqlite' | 'sqlserver';
  status: 'active' | 'inactive' | 'error';
  host?: string;
  port?: number;
  database?: string;
}
```

### 4. SchemaNode (Schema 节点)

**职责**: 显示 schema，支持懒加载表列表

```typescript
interface SchemaNodeProps {
  connectionId: string;
  schema: Schema;
  level: number;
  onTableSelect: (tableName: string, source: TableSource) => void;
}

interface Schema {
  name: string;
  tableCount?: number;
}
```

### 5. TableItem (表节点)

**职责**: 显示单个表，支持选择、预览、删除

```typescript
interface TableItemProps {
  name: string;
  rowCount?: number;
  level: number;
  isSelected: boolean;
  source: TableSource;
  onSelect: (tableName: string, source: TableSource) => void;
  onPreview?: (tableName: string, source: TableSource) => void;
  onDelete?: (tableName: string, source: TableSource) => void;
}
```

## Data Models

### API 响应模型

#### 1. DuckDB 表列表响应

```typescript
interface DuckDBTablesResponse {
  success: boolean;
  tables: DuckDBTable[];
  total_tables: number;
}

interface DuckDBTable {
  table_name: string;
  row_count: number;
  columns: string[];
  column_count: number;
  created_at?: string;
}
```

#### 2. 数据库连接列表响应

```typescript
interface DatabaseConnectionsResponse {
  success: boolean;
  connections: DatabaseConnection[];
  total_connections: number;
}
```

#### 3. Schema 列表响应

```typescript
interface SchemasResponse {
  success: boolean;
  connection_id: string;
  schemas: Schema[];
  total_schemas: number;
}
```

#### 4. 表列表响应

```typescript
interface TablesResponse {
  success: boolean;
  connection_id: string;
  schema: string;
  tables: ExternalTable[];
  total_tables: number;
}

interface ExternalTable {
  name: string;
  type: 'TABLE' | 'VIEW' | 'MATERIALIZED_VIEW';
  row_count?: number;
  comment?: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: DuckDB 表分组一致性

*For any* DuckDB 表列表，所有以 `system_` 开头的表应该且仅应该出现在系统表分组中，其他表应该出现在普通表分组中

**Validates: Requirements 1.2, 1.3**

### Property 2: 树节点展开状态独立性

*For any* 树节点，展开或折叠一个节点不应该影响其他节点的展开状态

**Validates: Requirements 1.4**

### Property 3: 懒加载数据一致性

*For any* 数据库连接，当用户展开该连接时，加载的 schemas 应该与服务器返回的数据完全一致

**Validates: Requirements 5.2, 5.3**

### Property 4: 搜索过滤完整性

*For any* 搜索关键词，过滤后的结果应该包含所有名称中包含该关键词的表（不区分大小写），且不包含任何不匹配的表

**Validates: Requirements 4.4**

### Property 5: 表选择唯一性（单选模式）

*For any* 表选择操作（在单选模式下），选中一个表后，之前选中的表应该被取消选中

**Validates: Requirements 4.1, 4.2**

### Property 6: 缓存失效一致性

*For any* 刷新操作，所有相关的缓存数据应该被清除，且下次访问时应该从服务器重新加载

**Validates: Requirements 7.3**

### Property 7: 连接状态显示准确性

*For any* 数据库连接，显示的状态应该与服务器返回的实际状态一致

**Validates: Requirements 3.1, 3.2, 3.3**

## Error Handling

### 1. 网络错误处理

```typescript
// 使用 TanStack Query 的错误处理
const { data, error, isError } = useQuery({
  queryKey: ['database-connections'],
  queryFn: fetchDatabaseConnections,
  retry: 2, // 重试 2 次
  retryDelay: 1000, // 重试延迟 1 秒
});

if (isError) {
  toast.error('加载数据库连接失败：' + error.message);
  // 显示重试按钮
}
```

### 2. 懒加载失败处理

```typescript
// Schema 加载失败
const { data: schemas, error, refetch } = useSchemas(connectionId);

if (error) {
  return (
    <div className="text-error text-sm p-2">
      <AlertCircle className="inline h-4 w-4 mr-1" />
      加载失败
      <button onClick={() => refetch()} className="ml-2 underline">
        重试
      </button>
    </div>
  );
}
```

### 3. 空状态处理

```typescript
// 无数据时的显示
if (tables.length === 0) {
  return (
    <div className="text-muted-foreground text-sm p-4 text-center">
      {searchQuery ? '未找到匹配的表' : '暂无数据表'}
    </div>
  );
}
```

## Testing Strategy

### Unit Tests

1. **TreeNode 组件测试**
   - 测试展开/折叠功能
   - 测试图标和徽章显示
   - 测试缩进层级渲染

2. **表分组逻辑测试**
   - 测试 `system_` 前缀识别
   - 测试分组数据结构生成

3. **搜索过滤测试**
   - 测试大小写不敏感搜索
   - 测试空搜索结果处理

### Integration Tests

1. **数据加载流程测试**
   - 测试 DuckDB 表加载
   - 测试数据库连接加载
   - 测试懒加载 schemas 和 tables

2. **用户交互测试**
   - 测试节点展开/折叠
   - 测试表选择
   - 测试右键菜单

### Property-Based Tests

使用 `@fast-check/vitest` 进行属性测试：

1. **Property 1: 表分组一致性测试**
   ```typescript
   test('system_ 前缀的表应该在系统表分组', () => {
     fc.assert(
       fc.property(
         fc.array(fc.record({
           table_name: fc.oneof(
             fc.string().map(s => `system_${s}`),
             fc.string().filter(s => !s.startsWith('system_'))
           ),
           row_count: fc.nat()
         })),
         (tables) => {
           const grouped = groupTables(tables);
           const systemTables = grouped.system;
           const normalTables = grouped.normal;
           
           // 所有系统表都以 system_ 开头
           systemTables.every(t => t.table_name.startsWith('system_')) &&
           // 所有普通表都不以 system_ 开头
           normalTables.every(t => !t.table_name.startsWith('system_'))
         }
       )
     );
   });
   ```

2. **Property 4: 搜索过滤完整性测试**
   ```typescript
   test('搜索应该返回所有匹配的表', () => {
     fc.assert(
       fc.property(
         fc.array(fc.record({
           table_name: fc.string(),
           row_count: fc.nat()
         })),
         fc.string(),
         (tables, searchQuery) => {
           const filtered = filterTables(tables, searchQuery);
           const lowerQuery = searchQuery.toLowerCase();
           
           // 所有返回的表都包含搜索关键词
           filtered.every(t => 
             t.table_name.toLowerCase().includes(lowerQuery)
           ) &&
           // 所有包含关键词的表都被返回
           tables.filter(t => 
             t.table_name.toLowerCase().includes(lowerQuery)
           ).length === filtered.length
         }
       )
     );
   });
   ```

## Implementation Details

### 1. 懒加载实现

使用 TanStack Query 的 `enabled` 选项实现懒加载：

```typescript
// 只有当节点展开时才加载数据
const { data: schemas } = useQuery({
  queryKey: ['schemas', connectionId],
  queryFn: () => fetchSchemas(connectionId),
  enabled: isExpanded, // 只有展开时才加载
  staleTime: 5 * 60 * 1000, // 5 分钟缓存
});
```

### 2. 状态管理

使用 React 本地状态管理展开/折叠状态：

```typescript
const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

const toggleNode = (nodeId: string) => {
  setExpandedNodes(prev => {
    const next = new Set(prev);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    return next;
  });
};
```

### 3. 图标映射

```typescript
const DATABASE_ICONS = {
  postgresql: <Database className="h-4 w-4 text-blue-500" />,
  mysql: <Database className="h-4 w-4 text-orange-500" />,
  sqlite: <Database className="h-4 w-4 text-gray-500" />,
  sqlserver: <Database className="h-4 w-4 text-red-500" />,
};

const STATUS_INDICATORS = {
  active: <div className="h-2 w-2 rounded-full bg-success" />,
  inactive: <div className="h-2 w-2 rounded-full bg-muted" />,
  error: <div className="h-2 w-2 rounded-full bg-error" />,
};
```

### 4. 缩进层级

使用 Tailwind 动态类名实现缩进：

```typescript
const getIndentClass = (level: number) => {
  const indentMap = {
    0: 'pl-2',
    1: 'pl-6',
    2: 'pl-10',
    3: 'pl-14',
  };
  return indentMap[level] || 'pl-2';
};
```

## API Endpoints

### 现有 API 分析

#### 1. 获取数据库连接列表

**现有端点**: `GET /databases/list` (datasources.py)

**返回格式**:
```json
{
  "success": true,
  "datasources": [
    {
      "id": "conn_123",
      "name": "Production DB",
      "type": "postgresql",
      "subtype": "postgresql",
      "status": "active",
      "params": {
        "host": "localhost",
        "port": 5432,
        "database": "mydb",
        "schema": "public"
      }
    }
  ]
}
```

**前端使用**: 直接使用现有端点，无需修改

#### 2. 获取数据库表列表

**现有端点**: `GET /api/database_tables/{connection_id}` (database_tables.py)

**返回格式**:
```json
{
  "success": true,
  "connection_id": "conn_123",
  "connection_name": "Production DB",
  "database": "mydb",
  "tables": [
    {
      "table_name": "users",
      "columns": [...],
      "column_count": 10,
      "row_count": 0
    }
  ],
  "table_count": 20
}
```

**问题**: 
- 当前 API 直接返回所有表，不区分 schema
- PostgreSQL 的 schema 信息在 `params.schema` 中，但不支持多 schema 展示

**解决方案**: 
- 对于 MySQL: 直接使用现有 API（MySQL 没有 schema 概念）
- 对于 PostgreSQL: 
  - 方案 A（简化）: 只显示配置的 schema 下的表
  - 方案 B（完整）: 新增 API 支持多 schema 查询

### 需要新增的 API（可选，用于完整的 DataGrip 体验）

#### 1. 获取连接下的所有 Schemas（仅 PostgreSQL）

```python
@router.get("/api/database_connections/{connection_id}/schemas", tags=["Database"])
async def list_connection_schemas(connection_id: str):
    """获取指定数据库连接下的所有 schemas（仅 PostgreSQL）"""
    try:
        from core.database_manager import db_manager
        import psycopg2
        
        connection = db_manager.get_connection(connection_id)
        if not connection:
            raise HTTPException(status_code=404, detail="连接不存在")
        
        db_type = connection.type.value if hasattr(connection.type, "value") else str(connection.type)
        
        if db_type != "postgresql":
            # MySQL 不支持 schema，返回空列表
            return {
                "success": True,
                "connection_id": connection_id,
                "schemas": [],
                "total_schemas": 0
            }
        
        # PostgreSQL: 查询所有 schemas
        db_config = connection.params
        username = db_config.get("user") or db_config.get("username")
        password = db_config.get("password", "")
        
        if password_encryptor.is_encrypted(password):
            password = password_encryptor.decrypt_password(password)
        
        conn = psycopg2.connect(
            host=db_config.get("host", "localhost"),
            port=int(db_config.get("port", 5432)),
            user=username,
            password=password,
            database=db_config["database"],
        )
        
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        schema_name,
                        (SELECT COUNT(*) 
                         FROM information_schema.tables 
                         WHERE table_schema = schema_name 
                         AND table_type = 'BASE TABLE') as table_count
                    FROM information_schema.schemata
                    WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
                    ORDER BY schema_name
                """)
                
                schemas = []
                for row in cursor.fetchall():
                    schemas.append({
                        "name": row[0],
                        "table_count": row[1]
                    })
                
                return {
                    "success": True,
                    "connection_id": connection_id,
                    "schemas": schemas,
                    "total_schemas": len(schemas)
                }
        finally:
            conn.close()
            
    except Exception as e:
        logger.error(f"获取 schemas 失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
```

#### 2. 获取指定 Schema 下的表（仅 PostgreSQL）

```python
@router.get("/api/database_connections/{connection_id}/schemas/{schema}/tables", tags=["Database"])
async def list_schema_tables(connection_id: str, schema: str):
    """获取指定 schema 下的所有表（仅 PostgreSQL）"""
    try:
        from core.database_manager import db_manager
        import psycopg2
        
        connection = db_manager.get_connection(connection_id)
        if not connection:
            raise HTTPException(status_code=404, detail="连接不存在")
        
        db_config = connection.params
        username = db_config.get("user") or db_config.get("username")
        password = db_config.get("password", "")
        
        if password_encryptor.is_encrypted(password):
            password = password_encryptor.decrypt_password(password)
        
        conn = psycopg2.connect(
            host=db_config.get("host", "localhost"),
            port=int(db_config.get("port", 5432)),
            user=username,
            password=password,
            database=db_config["database"],
        )
        
        try:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = %s AND table_type = 'BASE TABLE'
                    ORDER BY table_name
                """, (schema,))
                
                tables = []
                for row in cursor.fetchall():
                    tables.append({
                        "name": row[0],
                        "type": "TABLE",
                        "row_count": 0  # 不统计行数，提升性能
                    })
                
                return {
                    "success": True,
                    "connection_id": connection_id,
                    "schema": schema,
                    "tables": tables,
                    "total_tables": len(tables)
                }
        finally:
            conn.close()
            
    except Exception as e:
        logger.error(f"获取表列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
```

### 实施建议

#### Phase 1: 使用现有 API（快速实现）

- 使用 `GET /databases/list` 获取连接列表
- 使用 `GET /api/database_tables/{connection_id}` 获取表列表
- 对于 PostgreSQL，只显示配置的 schema
- 树形结构: 连接 → 表（扁平化，不显示 schema 层级）

#### Phase 2: 完整 DataGrip 体验（可选）

- 新增 schemas API
- 树形结构: 连接 → Schema → 表（完整层级）
- 支持多 schema 切换

## Performance Considerations

### 1. 虚拟滚动

如果表数量超过 100，使用 `@tanstack/react-virtual` 实现虚拟滚动：

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

const parentRef = useRef<HTMLDivElement>(null);

const virtualizer = useVirtualizer({
  count: tables.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 32, // 每个表项高度
  overscan: 5, // 预渲染 5 个
});
```

### 2. 防抖搜索

搜索输入使用 300ms 防抖：

```typescript
const [searchQuery, setSearchQuery] = useState('');
const [debouncedSearch, setDebouncedSearch] = useState('');

useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedSearch(searchQuery);
  }, 300);
  return () => clearTimeout(timer);
}, [searchQuery]);
```

### 3. 缓存策略

- DuckDB 表列表：5 分钟缓存
- 数据库连接列表：10 分钟缓存
- Schemas：10 分钟缓存
- 表列表：5 分钟缓存

## Migration Plan

### Phase 1: 基础结构（1-2 天）
1. 创建 TreeNode 通用组件
2. 重构 DataSourcePanel 使用树形结构
3. 实现 DuckDB 表分组显示

### Phase 2: 数据库连接（2-3 天）
1. 创建后端 API（schemas、tables）
2. 实现 DatabaseConnectionNode 组件
3. 实现 SchemaNode 组件
4. 集成懒加载逻辑

### Phase 3: 优化和测试（1-2 天）
1. 添加虚拟滚动（如需要）
2. 优化缓存策略
3. 编写单元测试和集成测试
4. 编写属性测试

## Dependencies

### 新增依赖

```json
{
  "@tanstack/react-virtual": "^3.0.0",
  "@fast-check/vitest": "^0.1.0"
}
```

### 现有依赖

- `@tanstack/react-query` - 数据获取和缓存
- `lucide-react` - 图标
- `sonner` - Toast 通知
