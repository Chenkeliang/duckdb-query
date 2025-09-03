# Duck Query 配置说明

本文档详细说明 Duck Query 的所有配置选项。

## 配置文件位置

- **应用配置**: `config/app-config.json`
- **数据源配置**: `config/datasources.json`
- **示例文件**: `config/app-config.example.json`, `config/datasources.example.json`

## 应用配置 (app-config.json)

### 基础配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `debug` | boolean | `false` | 调试模式开关 |
| `cors_origins` | array | `["http://localhost:3000"]` | 跨域请求允许的源 |
| `max_file_size` | number | `53687091200` | 最大文件大小(字节，默认50GB) |
| `query_timeout` | number | `300` | 查询超时时间(秒) |
| `download_timeout` | number | `600` | 下载超时时间(秒) |
| `max_query_rows` | number | `10000` | 查询结果最大行数 |
| `max_tables` | number | `200` | 最大表数量 |
| `enable_caching` | boolean | `true` | 启用缓存 |
| `cache_ttl` | number | `3600` | 缓存生存时间(秒) |
| `timezone` | string | `"Asia/Shanghai"` | 时区设置 |

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
| `duckdb_extensions` | array | `["excel", "json", "parquet"]` | 启用的扩展 |

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
| `query_proxy_timeout` | number | `300` | 查询代理超时(秒) |
| `url_reader_timeout` | number | `30` | URL读取超时(秒) |
| `url_reader_head_timeout` | number | `10` | URL HEAD请求超时(秒) |
| `sqlite_timeout` | number | `10` | SQLite超时(秒) |

## 数据源配置 (datasources.json)

```json
{
  "database_sources": [
    {
      "id": "unique_id",
      "name": "显示名称",
      "type": "mysql|postgresql",
      "host": "数据库主机",
      "port": 3306,
      "database": "数据库名",
      "username": "用户名",
      "password": "加密后的密码"
    }
  ]
}
```

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
  "query_timeout": 1800,
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
