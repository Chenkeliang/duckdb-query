# API 路径修复 - Schema 和表数据获取

## 🐛 问题描述

**现象**: 数据库连接展开后显示"暂无数据"，无法获取 schema 和表列表

**根本原因**: 前端 API 调用缺少 `/api` 前缀

## ✅ 修复内容

### 1. 前端 - useSchemas.ts

**文件**: `frontend/src/new/hooks/useSchemas.ts`

```typescript
// ❌ 错误的路径（缺少 /api 前缀）
const response = await fetch(`/databases/${connectionId}/schemas`);

// ✅ 正确的路径
const response = await fetch(`/api/databases/${connectionId}/schemas`);
```

### 2. 后端 - list_connection_schemas 路由

**文件**: `api/routers/database_tables.py` (第 339 行)

```python
# ❌ 错误的路由（缺少 /api 前缀）
@router.get("/databases/{connection_id}/schemas", tags=["Database Management"])

# ✅ 正确的路由
@router.get("/api/databases/{connection_id}/schemas", tags=["Database Management"])
```

---

### 3. 前端 - useSchemaTables.ts

**文件**: `frontend/src/new/hooks/useSchemaTables.ts`

```typescript
// ❌ 错误的路径（缺少 /api 前缀）
const url = schema
  ? `/databases/${connectionId}/schemas/${schema}/tables`
  : `/api/database_tables/${connectionId}`;

// ✅ 正确的路径
const url = schema
  ? `/api/databases/${connectionId}/schemas/${schema}/tables`
  : `/api/database_tables/${connectionId}`;
```

### 4. 后端 - list_schema_tables 路由

**文件**: `api/routers/database_tables.py` (第 439 行)

```python
# ❌ 错误的路由（缺少 /api 前缀）
@router.get("/databases/{connection_id}/schemas/{schema}/tables", ...)

# ✅ 正确的路由
@router.get("/api/databases/{connection_id}/schemas/{schema}/tables", ...)
```

---

## 📊 影响范围

### 修复的功能
- ✅ PostgreSQL 数据库的 schema 列表加载
- ✅ PostgreSQL schema 下的表列表加载
- ✅ MySQL/SQLite 数据库的表列表加载
- ✅ DataSource Panel 树形结构展开

### 相关组件
- `DatabaseConnectionNode.tsx` - 数据库连接节点
- `SchemaNode.tsx` - Schema 节点
- `TableItem.tsx` - 表项

---

## 🧪 测试验证

### 测试步骤

#### 1. PostgreSQL 数据库
```
1. 展开 PostgreSQL 连接节点
2. 验证: 显示 schema 列表（如 public, information_schema）
3. 展开某个 schema
4. 验证: 显示该 schema 下的表列表
```

#### 2. MySQL 数据库
```
1. 展开 MySQL 连接节点
2. 验证: 直接显示表列表（MySQL 没有 schema 概念）
```

#### 3. SQLite 数据库
```
1. 展开 SQLite 连接节点
2. 验证: 直接显示表列表
```

### 预期结果
- ✅ 不再显示"暂无数据"
- ✅ Schema 列表正常加载
- ✅ 表列表正常加载
- ✅ 加载状态正确显示（Spinner）

---

## 🔍 问题根因分析

### 为什么会出现这个问题？

1. **后端路由有 `/api` 前缀**
   ```python
   @router.get("/api/databases/{connection_id}/schemas", ...)
   ```

2. **前端调用缺少前缀**
   ```typescript
   fetch(`/databases/${connectionId}/schemas`)  // ❌ 404
   ```

3. **结果**: 请求 404，返回空数据

### 为什么其他 API 正常？

其他 API（如 `useDuckDBTables`、`useDatabaseConnections`）都正确使用了 `/api` 前缀：

```typescript
// ✅ 正确示例
fetch('/api/duckdb/tables')
fetch('/api/datasources/databases/list')
```

---

## 📝 修复清单

- [x] 修复 `useSchemas.ts` API 路径
- [x] 修复 `useSchemaTables.ts` API 路径
- [x] 验证 TypeScript 编译通过
- [x] 创建修复文档

---

## 🚀 部署建议

### 前端
```bash
# 刷新浏览器即可（Vite 热更新）
# 或者重启开发服务器
cd frontend
npm run dev
```

### 测试
1. 打开 DataSource Panel
2. 展开数据库连接
3. 验证 schema 和表列表正常显示

---

## 📚 相关文档

- **后端路由**: `api/routers/database_tables.py`
- **前端 Hooks**: 
  - `frontend/src/new/hooks/useSchemas.ts`
  - `frontend/src/new/hooks/useSchemaTables.ts`
- **组件**: `frontend/src/new/Query/DataSourcePanel/DatabaseConnectionNode.tsx`

---

## ✅ 修复状态

**状态**: ✅ 已修复  
**修复时间**: 2024-12-05  
**验证**: 待前端刷新后测试

---

**注意**: 这是前端 API 路径问题，与之前的 6 个问题修复和后端导入错误修复都是独立的。
