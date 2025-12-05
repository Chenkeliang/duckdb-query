# 数据源 ID 前缀设计说明

## 🎯 设计目的

使用 ID 前缀来区分不同类型的数据源，实现统一的数据源管理。

## 📋 ID 前缀规范

### 数据库连接
- **前缀**: `db_`
- **示例**: `db_meepo`, `db_mysql_prod`, `db_postgres_dev`
- **用途**: 外部数据库连接（MySQL, PostgreSQL, SQLite, SQL Server）

### 文件数据源（DuckDB 表）
- **前缀**: `file_` 或 `table_`
- **示例**: `file_users_csv`, `table_orders`
- **用途**: 上传的文件或 DuckDB 内部表

## 🔧 API 设计

### 统一数据源 API（使用前缀）

这些 API 使用**带前缀**的 ID：

```
GET  /api/datasources                    # 列出所有数据源
GET  /api/datasources/{id}               # 获取单个数据源（id 带前缀）
DELETE /api/datasources/{id}             # 删除数据源（id 带前缀）

GET  /api/datasources/databases/list     # 列出数据库连接（返回 db_ 前缀）
GET  /api/datasources/files/list         # 列出文件数据源（返回 file_ 前缀）
```

**示例**：
```bash
GET /api/datasources/db_meepo           # ✅ 正确
GET /api/datasources/file_users_csv     # ✅ 正确
```

### 数据库表管理 API（不使用前缀）

这些 API 使用**不带前缀**的原始连接 ID：

```
GET /api/database_tables/{connection_id}                      # 获取表列表
GET /api/databases/{connection_id}/schemas                    # 获取 schemas
GET /api/databases/{connection_id}/schemas/{schema}/tables    # 获取 schema 下的表
```

**示例**：
```bash
GET /api/databases/meepo/schemas        # ✅ 正确（不带 db_ 前缀）
GET /api/databases/db_meepo/schemas     # ❌ 错误（会找不到连接）
```

## 🐛 问题根源

### 数据流

1. **前端获取连接列表**：
   ```typescript
   fetch('/api/datasources/databases/list')
   // 返回: [{ id: 'db_meepo', name: 'meepo', ... }]
   ```

2. **前端使用连接 ID**：
   ```typescript
   connection.id = 'db_meepo'  // 带前缀
   ```

3. **前端调用 schemas API**：
   ```typescript
   fetch(`/api/databases/${connection.id}/schemas`)
   // 实际请求: /api/databases/db_meepo/schemas
   ```

4. **后端查找连接**：
   ```python
   connection = db_manager.get_connection('db_meepo')  # ❌ 找不到
   # db_manager 中存储的是: 'meepo'（不带前缀）
   ```

### 为什么会这样？

- **datasource_aggregator** 负责统一数据源视图，给所有数据库连接加 `db_` 前缀
- **database_manager** 负责实际的数据库连接管理，使用原始 ID（不带前缀）
- **database_tables API** 直接使用 database_manager，期望原始 ID

## ✅ 解决方案

### 方案 1: 前端去掉前缀（已实施）✅

在调用 `database_tables` API 前，去掉 `db_` 前缀：

```typescript
// frontend/src/new/hooks/useSchemas.ts
const actualConnectionId = connectionId.startsWith('db_') 
  ? connectionId.substring(3)  // 'db_meepo' → 'meepo'
  : connectionId;

fetch(`/api/databases/${actualConnectionId}/schemas`);
```

**优点**：
- ✅ 不改变后端逻辑
- ✅ 保持 ID 前缀设计的一致性
- ✅ 修改范围小

**缺点**：
- ⚠️ 前端需要知道 ID 前缀规则

### 方案 2: 后端自动处理前缀（备选）

修改 `database_tables.py` 路由，自动去掉前缀：

```python
@router.get("/api/databases/{connection_id}/schemas")
async def list_connection_schemas(connection_id: str):
    # 去掉 db_ 前缀（如果存在）
    actual_id = connection_id[3:] if connection_id.startswith('db_') else connection_id
    
    connection = db_manager.get_connection(actual_id)
    # ...
```

**优点**：
- ✅ 前端不需要处理前缀
- ✅ API 更灵活（支持带或不带前缀）

**缺点**：
- ⚠️ 需要修改多个后端路由
- ⚠️ 增加后端复杂度

## 📊 当前实施方案

**选择方案 1**：前端去掉前缀

**修改文件**：
- `frontend/src/new/hooks/useSchemas.ts`
- `frontend/src/new/hooks/useSchemaTables.ts`

**修改内容**：
```typescript
const actualConnectionId = connectionId.startsWith('db_') 
  ? connectionId.substring(3) 
  : connectionId;
```

## 🎯 设计建议

### 未来改进

为了避免混淆，建议：

1. **统一 ID 格式**：
   - 所有 API 都使用带前缀的 ID
   - 或者所有 API 都使用不带前缀的 ID

2. **文档化**：
   - 在 API 文档中明确说明 ID 格式要求
   - 在代码注释中说明前缀规则

3. **类型安全**：
   - 使用 TypeScript 类型区分不同的 ID
   ```typescript
   type DataSourceId = `db_${string}` | `file_${string}`;
   type ConnectionId = string;  // 不带前缀
   ```

---

**总结**：ID 前缀是为了区分数据源类型，但不同 API 对前缀的处理不一致，导致了这个问题。通过前端去掉前缀，可以快速解决问题。
