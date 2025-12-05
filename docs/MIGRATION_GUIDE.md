# 数据源元数据迁移指南

## 概述

从版本 X.X.X 开始，DuckQuery 将数据库连接配置和文件数据源元数据从 JSON 文件迁移到 DuckDB 元数据表中。这个变更带来以下好处：

- ✅ **统一存储**：所有元数据统一存储在 DuckDB 中
- ✅ **更好的性能**：利用 DuckDB 的查询优化和索引
- ✅ **数据安全**：敏感信息（如密码）自动加密存储
- ✅ **事务支持**：元数据操作支持事务和回滚
- ✅ **易于备份**：只需备份 DuckDB 数据库文件

## 自动迁移

### 启动时自动迁移

应用启动时会自动检测是否需要迁移：

1. **检测 JSON 文件**：检查 `config/datasources.json` 和 `config/file-datasources.json` 是否存在
2. **执行迁移**：如果检测到 JSON 文件，自动执行迁移
3. **备份原文件**：迁移成功后，原 JSON 文件会被重命名为 `.json.backup`
4. **加载配置**：从 DuckDB 加载配置

### 迁移日志

启动时会看到类似以下的日志：

```
INFO: 检查是否需要数据迁移...
INFO: 检测到 JSON 配置文件，开始执行数据迁移...
INFO: 从 JSON 文件加载 2 个数据库连接
INFO: 迁移数据库连接完成: 2/2
INFO: 从 JSON 文件加载 5 个文件数据源配置
INFO: 迁移文件数据源完成: 5/5
INFO: 验证迁移结果: 2 个数据库连接, 5 个文件数据源
INFO: ✅ 数据迁移成功完成，共迁移 7 条记录
INFO:    - 数据库连接: 2 个
INFO:    - 文件数据源: 5 个
```

## 手动迁移

如果需要手动执行迁移，可以使用以下 Python 代码：

```python
from core.migration_manager import migration_manager

# 检查是否需要迁移
if migration_manager.needs_migration():
    # 执行迁移（cleanup_json=True 会删除原 JSON 文件）
    result = migration_manager.migrate_from_json(cleanup_json=True)
    
    if result.success:
        print(f"迁移成功: {result.records_migrated} 条记录")
        print(f"详细信息: {result.details}")
    else:
        print(f"迁移失败: {result.error_message}")
```

## 迁移状态

### 查看迁移状态

```python
from core.migration_manager import migration_manager

status = migration_manager.get_migration_status()
if status:
    print(f"状态: {status['status']}")
    print(f"开始时间: {status['started_at']}")
    print(f"完成时间: {status['completed_at']}")
    print(f"迁移记录数: {status['records_migrated']}")
```

### 重置迁移状态

如果需要重新执行迁移：

```python
from core.migration_manager import migration_manager

# 重置迁移状态
migration_manager.reset_migration_status()

# 重新执行迁移
result = migration_manager.migrate_from_json()
```

## 数据结构

### 数据库连接元数据表

表名：`system_database_connections`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR | 连接 ID（主键）|
| name | VARCHAR | 连接名称 |
| type | VARCHAR | 数据库类型（mysql, postgresql, sqlite）|
| params | JSON | 连接参数（加密存储）|
| status | VARCHAR | 连接状态 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| last_tested | TIMESTAMP | 最后测试时间 |
| metadata | JSON | 额外元数据 |

### 文件数据源元数据表

表名：`system_file_datasources`

| 字段 | 类型 | 说明 |
|------|------|------|
| source_id | VARCHAR | 数据源 ID（主键）|
| filename | VARCHAR | 文件名 |
| file_path | VARCHAR | 文件路径 |
| file_type | VARCHAR | 文件类型（csv, excel, json）|
| row_count | INTEGER | 行数 |
| column_count | INTEGER | 列数 |
| columns | JSON | 列名列表 |
| column_profiles | JSON | 列统计信息 |
| upload_time | TIMESTAMP | 上传时间 |
| last_accessed | TIMESTAMP | 最后访问时间 |
| file_size | BIGINT | 文件大小 |
| file_hash | VARCHAR | 文件哈希值 |
| metadata | JSON | 额外元数据 |

### 迁移状态表

表名：`system_migration_status`

| 字段 | 类型 | 说明 |
|------|------|------|
| migration_name | VARCHAR | 迁移名称（主键）|
| status | VARCHAR | 迁移状态（running, completed, failed）|
| started_at | TIMESTAMP | 开始时间 |
| completed_at | TIMESTAMP | 完成时间 |
| error_message | TEXT | 错误信息 |
| records_migrated | INTEGER | 迁移记录数 |
| metadata | JSON | 额外元数据 |

## 安全性

### 密码加密

数据库连接的密码会自动加密存储：

- **加密算法**：XOR + Base64
- **加密范围**：`params` 字段中的 `password`、`secret`、`token`、`key`、`credential`、`api_key` 等敏感字段
- **自动处理**：保存时自动加密，读取时自动解密

### 加密密钥

默认使用内置密钥，生产环境建议设置环境变量：

```bash
export DUCKQUERY_ENCRYPTION_KEY="your-secret-key-here"
```

## 故障排查

### 迁移失败

如果迁移失败，检查以下内容：

1. **JSON 文件格式**：确保 JSON 文件格式正确
2. **文件权限**：确保应用有读写权限
3. **DuckDB 连接**：确保 DuckDB 数据库可访问
4. **日志信息**：查看详细的错误日志

### 数据丢失

如果担心数据丢失：

1. **备份文件**：迁移前手动备份 JSON 文件
2. **保留备份**：迁移后的 `.json.backup` 文件会保留
3. **DuckDB 备份**：定期备份 DuckDB 数据库文件

### 回滚迁移

如果需要回滚到 JSON 文件：

1. 恢复备份文件：
   ```bash
   mv config/datasources.json.backup config/datasources.json
   mv config/file-datasources.json.backup config/file-datasources.json
   ```

2. 重置迁移状态：
   ```python
   from core.migration_manager import migration_manager
   migration_manager.reset_migration_status()
   ```

3. 重启应用

## API 兼容性

迁移后，所有现有 API 保持不变：

- ✅ 数据库连接管理 API
- ✅ 文件数据源管理 API
- ✅ 查询执行 API
- ✅ 数据导入导出 API

应用代码无需修改，迁移对上层应用完全透明。

## 性能优化

### 缓存机制

元数据管理器实现了缓存机制：

- **缓存时间**：5 分钟
- **自动失效**：更新/删除操作自动清除缓存
- **手动清除**：可以手动清除缓存

```python
from core.metadata_manager import metadata_manager

# 清除所有缓存
metadata_manager.invalidate_cache()

# 清除特定缓存
metadata_manager.invalidate_cache(table="system_database_connections", id="conn_id")
```

### 索引优化

元数据表已创建索引：

- `system_database_connections`: `type`, `status`
- `system_file_datasources`: `file_type`, `upload_time`

## 最佳实践

1. **定期备份**：定期备份 DuckDB 数据库文件
2. **监控日志**：关注迁移相关的日志信息
3. **测试环境**：在测试环境先验证迁移流程
4. **保留备份**：保留 JSON 备份文件一段时间
5. **安全密钥**：生产环境使用自定义加密密钥

## 支持

如果遇到问题，请：

1. 查看应用日志
2. 检查迁移状态
3. 提交 Issue 并附上日志信息

---

**版本**: 1.0  
**更新时间**: 2024-12-03  
**适用版本**: X.X.X+
