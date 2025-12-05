# 后端 API 结构分析

## 现有 API 端点分析

### 1. 数据库连接管理 API

#### datasources.py (统一数据源 API)
```
POST   /databases/test              - 测试数据库连接
POST   /databases                   - 创建数据库连接
PUT    /databases/{id}              - 更新数据库连接
GET    /databases/list              - 获取数据库连接列表
POST   /databases/{id}/refresh      - 刷新数据库连接
```

**特点**:
- ✅ RESTful 风格
- ✅ 统一的路径前缀 `/databases`
- ✅ 支持完整的 CRUD 操作
- ✅ 已集成到统一数据源系统

#### data_sources.py (旧版 API)
```
POST   /api/database/connect        - 连接数据库并返回表信息
POST   /api/test_connection_simple  - 简化的连接测试
```

**特点**:
- ❌ 路径不统一（`/api/database` vs `/databases`）
- ❌ 功能与 datasources.py 重复
- ❌ 不符合 RESTful 规范
- ⚠️ **建议废弃**

### 2. 数据库表查询 API

#### database_tables.py
```
GET    /api/database_tables/{connection_id}                    - 获取连接下的所有表
GET    /api/database_table_details/{connection_id}/{table_name} - 获取表详情
```

**特点**:
- ✅ 功能明确
- ⚠️ 路径不够 RESTful（应该是 `/databases/{id}/tables`）
- ⚠️ 不支持 schema 层级

## API 结构优化建议

### 方案 A: 保持现有结构，新增 schema API

**优点**: 
- 最小改动
- 向后兼容

**缺点**:
- API 路径不统一
- 不够 RESTful

**新增端点**:
```
GET    /api/database_connections/{connection_id}/schemas                    - 获取 schemas
GET    /api/database_connections/{connection_id}/schemas/{schema}/tables    - 获取 schema 下的表
```

### 方案 B: 统一到 RESTful 风格（推荐）

**优点**:
- 路径统一、清晰
- 符合 RESTful 规范
- 易于理解和维护

**缺点**:
- 需要重构现有代码
- 可能影响现有前端调用

**统一后的端点**:
```
# 数据库连接管理
POST   /databases/test                                  - 测试连接
POST   /databases                                       - 创建连接
GET    /databases                                       - 获取连接列表
GET    /databases/{id}                                  - 获取单个连接
PUT    /databases/{id}                                  - 更新连接
DELETE /databases/{id}                                  - 删除连接
POST   /databases/{id}/refresh                          - 刷新连接

# 数据库表查询（新增 schema 层级）
GET    /databases/{id}/schemas                          - 获取 schemas（PostgreSQL）
GET    /databases/{id}/schemas/{schema}/tables          - 获取 schema 下的表
GET    /databases/{id}/tables                           - 获取所有表（MySQL，扁平化）
GET    /databases/{id}/tables/{table_name}              - 获取表详情
```

### 方案 C: 混合方案（推荐用于渐进式迁移）

**阶段 1**: 新增 schema API，保持现有 API 不变
```
GET    /databases/{id}/schemas                          - 新增
GET    /databases/{id}/schemas/{schema}/tables          - 新增
GET    /api/database_tables/{connection_id}             - 保留（标记为 deprecated）
```

**阶段 2**: 逐步迁移前端调用到新 API

**阶段 3**: 废弃旧 API

## 可以废弃的 API

### 立即废弃（功能重复）

1. **POST /api/database/connect** (data_sources.py)
   - 替代方案: `POST /databases` + `GET /databases/{id}/tables`
   - 理由: 功能与统一数据源 API 重复

2. **POST /api/test_connection_simple** (data_sources.py)
   - 替代方案: `POST /databases/test`
   - 理由: 功能与统一数据源 API 重复

### 计划废弃（需要迁移）

3. **GET /api/database_tables/{connection_id}** (database_tables.py)
   - 替代方案: `GET /databases/{id}/tables` 或 `GET /databases/{id}/schemas/{schema}/tables`
   - 理由: 路径不统一，不支持 schema 层级
   - 迁移策略: 保留 6 个月，标记为 deprecated

4. **GET /api/database_table_details/{connection_id}/{table_name}** (database_tables.py)
   - 替代方案: `GET /databases/{id}/tables/{table_name}`
   - 理由: 路径不统一
   - 迁移策略: 保留 6 个月，标记为 deprecated

## 推荐实施方案

### Phase 1: 新增 schema API（本次实现）

在 `api/routers/database_tables.py` 中新增：

```python
@router.get("/databases/{connection_id}/schemas", tags=["Database Management"])
async def list_connection_schemas(connection_id: str):
    """获取数据库连接下的所有 schemas（仅 PostgreSQL）"""
    # 实现...

@router.get("/databases/{connection_id}/schemas/{schema}/tables", tags=["Database Management"])
async def list_schema_tables(connection_id: str, schema: str):
    """获取指定 schema 下的所有表"""
    # 实现...
```

**优点**:
- 路径统一（都是 `/databases` 前缀）
- 支持 schema 层级
- 不影响现有 API

### Phase 2: 标记旧 API 为 deprecated（下个版本）

```python
@router.get("/api/database_tables/{connection_id}", 
            tags=["Database Management"],
            deprecated=True,
            description="⚠️ 已废弃，请使用 GET /databases/{id}/tables")
async def get_database_tables(connection_id: str):
    # 保留实现，但添加警告日志
    logger.warning("使用了已废弃的 API: /api/database_tables/{connection_id}")
    # ...
```

### Phase 3: 移除旧 API（6 个月后）

完全移除 `data_sources.py` 中的重复端点。

## 数据库类型兼容性

### MySQL
- 没有 schema 概念
- `GET /databases/{id}/schemas` 返回空列表
- `GET /databases/{id}/tables` 返回所有表（扁平化）

### PostgreSQL
- 支持多 schema
- `GET /databases/{id}/schemas` 返回 schema 列表
- `GET /databases/{id}/schemas/{schema}/tables` 返回指定 schema 下的表
- `GET /databases/{id}/tables` 返回配置的默认 schema 下的表

### SQLite
- 没有 schema 概念
- 与 MySQL 相同的处理方式

## 前端调用示例

### 获取数据库连接列表
```typescript
const { data } = useQuery({
  queryKey: ['databases'],
  queryFn: () => fetch('/databases').then(r => r.json())
});
```

### 获取 PostgreSQL schemas
```typescript
const { data } = useQuery({
  queryKey: ['databases', connectionId, 'schemas'],
  queryFn: () => fetch(`/databases/${connectionId}/schemas`).then(r => r.json()),
  enabled: isExpanded && dbType === 'postgresql'
});
```

### 获取 schema 下的表
```typescript
const { data } = useQuery({
  queryKey: ['databases', connectionId, 'schemas', schema, 'tables'],
  queryFn: () => fetch(`/databases/${connectionId}/schemas/${schema}/tables`).then(r => r.json()),
  enabled: isExpanded
});
```

### 获取 MySQL 表（扁平化）
```typescript
const { data } = useQuery({
  queryKey: ['databases', connectionId, 'tables'],
  queryFn: () => fetch(`/databases/${connectionId}/tables`).then(r => r.json()),
  enabled: isExpanded && dbType === 'mysql'
});
```

## 总结

### 立即行动
1. ✅ 新增 `/databases/{id}/schemas` API
2. ✅ 新增 `/databases/{id}/schemas/{schema}/tables` API
3. ❌ 废弃 `/api/database/connect`
4. ❌ 废弃 `/api/test_connection_simple`

### 后续计划
1. 标记 `/api/database_tables/{connection_id}` 为 deprecated
2. 标记 `/api/database_table_details/{connection_id}/{table_name}` 为 deprecated
3. 6 个月后移除所有 deprecated API

### 收益
- ✅ API 路径统一
- ✅ 符合 RESTful 规范
- ✅ 支持 schema 层级
- ✅ 易于理解和维护
- ✅ 向后兼容（渐进式迁移）
