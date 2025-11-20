# Duck Query 配置说明

本文档详细说明 Duck Query 的所有配置选项。

## 配置位置与系统表

- **应用配置**: `config/app-config.json`。
- **系统表存储**（DuckDB 内部）：
  - `system_datasources`: 保存所有 MySQL/PostgreSQL/SQLite 等数据库连接定义。
  - `system_sql_favorites`: 保存 SQL 收藏列表。
  - `system_file_sources`: 保存文件数据源（上传/URL/服务器目录/粘贴/异步任务结果）的元数据。
- **示例文件**: `config/app-config.example.json`（仅用于初始化 `app-config.json`）。

> 说明：早期版本使用 `config/datasources.json`、`config/file-datasources.json`、`config/sql-favorites.json` 写入配置。现在这些信息全部保存在 DuckDB 的系统表中。若需备份或迁移，只需复制 DuckDB 数据库文件（默认 `data/duckdb/duckquery.duckdb`）或导出上述系统表内容即可。

## 应用配置 (app-config.json)

### 基础配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `debug` | boolean | `false` | 调试模式开关 |
| `cors_origins` | array | `["http://localhost:3000"]` | 跨域请求允许的源 |
| `max_file_size` | number | `53687091200` | 最大文件大小(字节，默认50GB) |
| `max_query_rows` | number | `10000` | 查询结果最大行数 |
| `max_tables` | number | `200` | 最大表数量 |
| `timezone` | string | `"UTC"` | 时区设置（可根据部署地区调整，如 `"Asia/Shanghai"`） |

### DuckDB 配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `duckdb_memory_limit` | string | `"8GB"` | DuckDB内存限制 |
| `duckdb_threads` | number | `8` | DuckDB线程数 |
| `duckdb_temp_directory` | string | `null` | 临时文件目录 |
| `duckdb_home_directory` | string | `null` | 主目录 |
| `duckdb_extension_directory` | string | `null` | 扩展目录 |
| `duckdb_enable_profiling` | string | `"query_tree"` | 查询分析模式 |
| `duckdb_profiling_output` | string | `null` | 分析输出 |
| `duckdb_prefer_range_joins` | boolean | `false` | 优先使用范围连接 |
| `duckdb_enable_object_cache` | boolean | `true` | 启用对象缓存 |
| `duckdb_preserve_insertion_order` | boolean | `false` | 保持插入顺序 |
| `duckdb_enable_progress_bar` | boolean | `false` | 启用进度条 |
| `duckdb_extensions` | array | `["excel", "json", "parquet"]` | 自动安装/加载的 DuckDB 扩展 |
| `duckdb_remote_settings` | object | `{}` | 启动时自动执行的 `SET` 语句（如 `s3_region` 等） |
| `server_data_mounts` | array | `[]` | 允许直接读取文件的服务器挂载目录列表 |

### 连接池配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `pool_min_connections` | number | `2` | 连接池最小连接数 |
| `pool_max_connections` | number | `10` | 连接池最大连接数 |
| `pool_connection_timeout` | number | `30` | 连接超时(秒) |
| `pool_idle_timeout` | number | `300` | 空闲超时(秒) |
| `pool_max_retries` | number | `3` | 最大重试次数 |
| `pool_wait_timeout` | number | `1.0` | 等待超时(秒) |

### 数据库连接配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `db_connect_timeout` | number | `10` | 数据库连接超时(秒) |
| `db_read_timeout` | number | `30` | 数据库读取超时(秒) |
| `db_write_timeout` | number | `30` | 数据库写入超时(秒) |
| `db_ping_timeout` | number | `5` | 数据库ping超时(秒) |

### 其他配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `table_metadata_cache_ttl_hours` | number | `24` | 表元数据缓存有效期(小时)，小于等于 0 则禁用缓存 |
| `url_reader_timeout` | number | `30` | URL读取超时(秒) |
| `url_reader_head_timeout` | number | `10` | URL HEAD请求超时(秒) |
| `sqlite_timeout` | number | `10` | SQLite超时(秒) |

## 系统表（DuckDB 内部）

以下表位于 DuckDB 数据库文件中，只要备份 `data/duckdb/duckquery.duckdb` 即可保留对应配置。

### `system_datasources`

| 字段 | 说明 |
| --- | --- |
| `id` | 唯一标识 |
| `name` | 显示名称 |
| `type` | `mysql` / `postgresql` / `sqlite` 等 |
| `params` | 连接参数（JSON，含 host/port/database 等） |
| `created_at` / `updated_at` | 时间戳 |

前端/后端通过 `/api/data-sources` 读写该表，无需再编辑 `config/datasources.json`。

### `system_sql_favorites`

| 字段 | 说明 |
| --- | --- |
| `id` | 唯一标识 |
| `name` | 收藏名称 |
| `sql` | SQL 内容 |
| `type` | `duckdb` / `mysql` 等 |
| `description` / `tags` | 描述与标签 |
| `usage_count` | 使用次数 |
| `created_at` / `updated_at` | 时间戳 |

### `system_file_sources`

保存上传/URL/粘贴/异步任务等文件表的元数据（与旧版 `file-datasources.json` 字段一致），可用于恢复表列表、统计等。

## 配置建议

### 开发环境
```json
{
  "debug": true,
  "max_query_rows": 1000,
  "duckdb_memory_limit": "2GB",
  "duckdb_threads": 4
}
```

### 生产环境
```json
{
  "debug": false,
  "max_query_rows": 50000,
  "duckdb_memory_limit": "16GB",
  "duckdb_threads": 16,
  "pool_max_connections": 20
}
```

### 大数据处理
```json
{
  "max_file_size": 107374182400,
  "duckdb_memory_limit": "32GB",
  "duckdb_threads": 32
}
```

## 环境变量覆盖

可以通过环境变量覆盖配置：

```bash
export DUCK_QUERY_DEBUG=true
export DUCK_QUERY_MAX_QUERY_ROWS=50000
export DUCK_QUERY_DUCKDB_MEMORY_LIMIT=16GB
```

## 配置验证

启动时会自动验证配置文件的格式和必需字段。如果配置有误，会在日志中显示错误信息。
