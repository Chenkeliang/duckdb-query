# 调试数据库连接问题

## 🐛 问题

错误信息：`数据库连接 db_meepo 不存在`

## 🔍 原因分析

数据源 ID 格式：`db_{connection_id}`

- 前端看到的 ID: `db_meepo`
- 实际的连接 ID: `meepo`
- 问题：`db_manager.connections` 中没有 `meepo` 连接

## ✅ 检查步骤

### 1. 检查数据库连接列表

在浏览器控制台运行：

```javascript
fetch('/api/datasources/databases/list')
  .then(r => r.json())
  .then(data => {
    console.log('数据库连接列表:', data);
    console.log('连接数量:', data.data?.items?.length || 0);
    if (data.data?.items) {
      data.data.items.forEach(item => {
        console.log(`- ID: ${item.id}, Name: ${item.name}, Type: ${item.subtype}`);
      });
    }
  });
```

**预期结果**：
- 应该看到 `meepo` 连接
- ID 应该是 `db_meepo`

### 2. 检查后端日志

查看后端启动日志，应该有：

```
INFO: 开始加载数据库连接配置...
INFO: 从 DuckDB 加载 X 个数据库连接
INFO: 数据库连接配置加载完成，共 X 个连接
```

### 3. 检查 DuckDB 元数据表

数据库连接配置存储在 DuckDB 的元数据表中。

在后端 Python 控制台运行：

```python
from core.metadata_manager import metadata_manager

# 查看所有数据库连接
connections = metadata_manager.list_database_connections()
print(f"找到 {len(connections)} 个连接:")
for conn in connections:
    print(f"  - ID: {conn['id']}, Name: {conn.get('name')}, Type: {conn.get('type')}")
```

## 🔧 可能的解决方案

### 方案 1: 连接未保存到元数据表

如果连接是临时创建的，没有保存到 DuckDB 元数据表：

```python
# 在后端添加连接
from core.database_manager import db_manager
from models.query_models import DatabaseConnection, DataSourceType

connection = DatabaseConnection(
    id="meepo",
    name="meepo",
    type=DataSourceType.POSTGRESQL,  # 或 MYSQL, SQLITE
    params={
        "host": "localhost",
        "port": 5432,
        "database": "meepo",
        "username": "your_username",
        "password": "your_password"
    }
)

# 添加并保存
db_manager.add_connection(connection, test_connection=False, save_to_metadata=True)
```

### 方案 2: 连接 ID 不匹配

检查前端传递的连接 ID 是否正确：

```typescript
// 在 DatabaseConnectionNode.tsx 中
console.log('Connection ID:', connection.id);
// 应该是 "meepo"，不是 "db_meepo"
```

### 方案 3: 重新加载连接配置

重启后端服务，确保连接配置被重新加载：

```bash
cd api
# Ctrl+C 停止
python -m uvicorn main:app --reload
```

## 📝 数据库连接配置文件位置

连接配置存储在：
- **DuckDB 元数据表**: `api/data/duckdb_data.db` 中的 `database_connections` 表
- **代码位置**: `api/core/database_manager.py` 的 `_load_connections_from_config()` 方法

## 🎯 快速修复

### 选项 A: 通过 API 创建连接

```bash
curl -X POST http://localhost:8000/api/datasources/databases \
  -H "Content-Type: application/json" \
  -d '{
    "id": "meepo",
    "name": "meepo",
    "type": "postgresql",
    "params": {
      "host": "localhost",
      "port": 5432,
      "database": "meepo",
      "username": "your_username",
      "password": "your_password"
    }
  }'
```

### 选项 B: 检查现有连接

```bash
# 查看所有连接
curl http://localhost:8000/api/datasources/databases/list | jq
```

## 🔍 调试信息收集

请提供以下信息：

1. **数据库连接列表**（运行上面的 JavaScript 代码）
2. **后端启动日志**（特别是连接加载部分）
3. **连接是如何创建的**（通过 UI？通过 API？手动配置？）

---

**下一步**: 运行上面的检查步骤，确定问题所在
