# 后端导入错误修复

## 🐛 问题描述

**错误信息**:
```
cannot import name 'database_manager' from 'core.database_manager'
```

**影响端点**: `GET /api/duckdb_tables`

**错误原因**: 
- `api/routers/query.py` 中导入了 `database_manager`
- 但 `api/core/database_manager.py` 中导出的是 `db_manager`
- 导致导入失败

## ✅ 修复方案

### 修改文件
`api/routers/query.py` (第 2016 行)

### 修改内容
```python
# ❌ 错误的导入
from core.database_manager import database_manager

# ✅ 正确的导入
from core.database_manager import db_manager
```

### 修改变量使用
```python
# ❌ 错误的使用
db_connections = database_manager.list_connections()

# ✅ 正确的使用
db_connections = db_manager.list_connections()
```

## 📊 验证结果

- ✅ Python 语法检查通过
- ✅ 导入错误已修复
- ✅ 变量使用已更正

## 🎯 影响范围

**修复的端点**:
- `GET /api/duckdb_tables` - 获取 DuckDB 表列表

**相关功能**:
- DataSource Panel 数据加载
- 表列表显示
- 数据源管理

## 🚀 测试建议

### 1. 重启后端服务
```bash
cd api
python -m uvicorn main:app --reload
```

### 2. 测试端点
```bash
curl http://localhost:8000/api/duckdb_tables
```

### 3. 验证前端
1. 打开 DataSource Panel
2. 验证表列表正常加载
3. 验证无控制台错误

## 📝 根本原因分析

### 命名不一致
`api/core/database_manager.py` 中：
```python
# 文件末尾导出的实例名称
db_manager = DatabaseManager()
```

但其他地方可能期望导入 `database_manager`（小写下划线命名）。

### 建议
为了避免类似问题，建议：
1. 统一使用 `db_manager` 作为实例名称
2. 或者在 `database_manager.py` 中同时导出两个名称：
   ```python
   db_manager = DatabaseManager()
   database_manager = db_manager  # 别名，向后兼容
   ```

## ✅ 修复状态

**状态**: ✅ 已修复  
**修复时间**: 2024-12-05  
**验证**: 待后端重启后测试

---

**注意**: 这是后端问题，与前端 DataSource Panel 的 6 个问题修复无关。
