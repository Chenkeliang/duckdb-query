# DuckDB持久化问题修复文档

## 问题描述

在之前的版本中，DuckDB表在每次重启后都会丢失，导致用户需要重新上传文件和创建数据源。这个问题的根本原因是：

1. **使用了临时注册方法**：大部分代码使用 `register()` 方法，这只是将DataFrame注册为临时表，重启后会丢失
2. **缺少重新加载机制**：MySQL数据源没有在启动时重新加载的机制
3. **持久化不一致**：只有文件数据源使用了 `CREATE TABLE` 进行真正的持久化

## 解决方案

### 1. 核心功能增强

在 `core/duckdb_engine.py` 中新增了以下函数：

- `create_persistent_table()`: 创建真正的持久化表，数据写入磁盘
- `table_exists()`: 检查表是否存在
- `drop_table_if_exists()`: 安全删除表

### 2. 修改数据源创建逻辑

将所有使用 `register()` 的地方改为使用 `create_persistent_table()`：

- `mysql_datasource_manager.py`: MySQL数据源创建
- `mysql_robust_manager.py`: MySQL强化管理
- `mysql_query.py`: MySQL查询结果
- `query.py`: 查询结果保存、数据库数据源处理
- `data_sources.py`: 数据库连接处理

### 3. 启动时重新加载机制

在 `main.py` 中添加了 `load_mysql_datasources_on_startup()` 函数：

- 读取 `mysql_datasources.json` 配置文件
- 重新执行SQL查询
- 创建持久化表
- 优雅的错误处理

## 技术细节

### register() vs CREATE TABLE 的区别

```python
# 临时注册（重启后丢失）
con.register("table_name", df)

# 持久化表（重启后保留）
create_persistent_table("table_name", df, con)
```

### 持久化表创建流程

1. 删除已存在的同名表
2. 注册临时表
3. 使用 `CREATE TABLE AS SELECT` 创建持久化表
4. 删除临时表
5. 验证表创建成功

### 启动时重新加载流程

1. 加载MySQL连接配置
2. 加载MySQL数据源配置
3. 重新执行SQL查询
4. 创建持久化表
5. 记录成功/失败统计

## 测试验证

### 单元测试

创建了 `tests/test_duckdb_persistence.py` 包含以下测试：

- 持久化表创建测试
- 重新连接后数据保留测试
- register vs persistent_table 对比测试
- 特殊字符表名测试
- MySQL数据源配置测试

### 手动测试步骤

1. **创建数据源**：
   ```bash
   # 上传文件或创建MySQL数据源
   curl -X POST "http://localhost:8000/api/mysql_datasource/create" \
     -H "Content-Type: application/json" \
     -d '{"connection_name": "test", "sql_query": "SELECT * FROM users LIMIT 100", "datasource_alias": "test_users"}'
   ```

2. **验证表存在**：
   ```bash
   curl "http://localhost:8000/api/available_tables"
   ```

3. **重启服务**：
   ```bash
   docker-compose restart backend
   ```

4. **再次验证表存在**：
   ```bash
   curl "http://localhost:8000/api/available_tables"
   ```

## 配置文件格式

### mysql_datasources.json

```json
[
  {
    "datasource_id": "mysql_test_data_12345678",
    "connection_name": "production_db",
    "sql_query": "SELECT * FROM orders WHERE created_at >= '2025-01-01' LIMIT 1000",
    "alias": "recent_orders",
    "created_at": "2025-01-18T10:30:00",
    "row_count": 856,
    "columns": ["id", "customer_id", "amount", "created_at"]
  }
]
```

### mysql_configs.json

```json
[
  {
    "id": "production_db",
    "name": "生产数据库",
    "params": {
      "host": "localhost",
      "port": 3306,
      "username": "app_user",
      "password": "********",
      "database": "ecommerce"
    }
  }
]
```

## 性能优化

### 启动时间优化

- 异步加载数据源（未来改进）
- 只重新加载必要的数据源
- 显示加载进度

### 内存优化

- 及时清理临时表
- 使用流式处理大数据集
- 设置合理的内存限制

## 错误处理

### 常见错误及解决方案

1. **MySQL连接失败**：
   - 检查连接配置
   - 验证网络连通性
   - 确认用户权限

2. **SQL查询失败**：
   - 验证SQL语法
   - 检查表是否存在
   - 确认字段名正确

3. **DuckDB写入失败**：
   - 检查磁盘空间
   - 验证文件权限
   - 确认数据类型兼容性

## 向后兼容性

- 保留了原有的 `register_dataframe()` 函数
- 添加了弃用警告
- 现有API接口保持不变
- 渐进式迁移到新的持久化机制

## 监控和日志

### 关键日志信息

- 数据源重新加载统计
- 持久化表创建成功/失败
- 启动时间性能指标
- 错误详细信息

### 监控指标

- 重启后数据恢复成功率
- 启动时间
- 内存使用情况
- 磁盘空间使用

## 未来改进

1. **增量更新**：支持数据源的增量更新而不是完全重新加载
2. **数据版本控制**：记录数据源的版本信息
3. **自动备份**：定期备份DuckDB文件
4. **集群支持**：支持多实例间的数据同步
5. **性能监控**：添加详细的性能监控和告警

## 总结

通过这次修复，彻底解决了DuckDB表重启后丢失的问题：

- ✅ 所有数据源都使用持久化表
- ✅ 启动时自动重新加载所有数据源
- ✅ 完整的测试覆盖
- ✅ 向后兼容性保证
- ✅ 详细的错误处理和日志记录

用户现在可以放心地重启服务，所有数据源都会自动恢复，无需重新上传文件或重新创建数据源。
