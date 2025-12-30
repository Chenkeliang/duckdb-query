# DuckQuery 配置参考

本文档提供 DuckQuery 所有配置选项的完整参考。

## 配置文件

主配置文件位于 `config/app-config.json`。首次运行请复制示例文件：

```bash
cp config/app-config.example.json config/app-config.json
```

---

## 核心设置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `debug` | boolean | `false` | 开启详细调试日志 |
| `cors_origins` | string[] | `["http://localhost:3000"]` | 允许的前端跨域源 |
| `timezone` | string | `"Asia/Shanghai"` | 默认时区 |

---

## 文件与上传限制

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `max_file_size` | integer | `53687091200` (50GB) | 最大上传文件大小（字节） |
| `max_query_rows` | integer | `10000` | 单次查询最大返回行数 |
| `max_tables` | integer | `200` | 侧边栏最大显示表数量 |

---

## DuckDB 引擎设置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `duckdb_memory_limit` | string | `"8GB"` | DuckDB 最大可用内存 |
| `duckdb_threads` | integer | `8` | 并行查询线程数（建议设为 CPU 核心数） |
| `duckdb_temp_directory` | string | `null` | 自定义临时目录 |
| `duckdb_extensions` | string[] | `["excel", "json", "parquet", "httpfs", "mysql", "postgres"]` | 自动加载的扩展 |
| `duckdb_enable_object_cache` | boolean | `true` | 启用对象缓存以提升性能 |

---

## 服务器文件挂载

挂载宿主机目录，无需上传即可直接读取文件：

```json
"server_data_mounts": [
  { "label": "共享数据", "path": "/app/server_mounts" },
  { "label": "下载目录", "path": "/app/host_downloads" }
]
```

### Docker 配置

在 `docker-compose.yml` 中映射宿主机路径到容器路径：

```yaml
volumes:
  - ./server_data:/app/server_mounts
  - ~/Downloads:/app/host_downloads
```

然后在 `app-config.json` 中引用**容器内路径**。

---

## S3/OSS 远程设置

访问 S3 或阿里云 OSS 远程文件：

```json
"duckdb_remote_settings": {
  "s3_region": "'cn-hangzhou'",
  "s3_endpoint": "'oss-cn-hangzhou.aliyuncs.com'",
  "s3_url_style": "'path'",
  "s3_use_ssl": "true",
  "s3_access_key_id": "'你的ACCESS_KEY'",
  "s3_secret_access_key": "'你的SECRET_KEY'"
}
```

> **注意**: 值必须用单引号包裹。

---

## 连接池设置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `pool_min_connections` | integer | `2` | 连接池最小连接数 |
| `pool_max_connections` | integer | `10` | 连接池最大连接数 |
| `pool_connection_timeout` | integer | `30` | 获取连接超时时间（秒） |
| `pool_idle_timeout` | integer | `300` | 空闲连接关闭时间（秒） |

---

## 超时设置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `db_connect_timeout` | integer | `10` | 数据库连接超时（秒） |
| `db_read_timeout` | integer | `30` | 数据库读取超时（秒） |
| `federated_query_timeout` | integer | `300` | 跨库查询超时（秒） |
| `url_reader_timeout` | integer | `30` | HTTP URL 读取超时（秒） |

---

## 环境变量覆盖

大部分配置可通过环境变量覆盖：

| 配置项 | 环境变量 |
|--------|----------|
| `debug` | `DEBUG=true` |
| `cors_origins` | `CORS_ORIGINS=http://localhost:3000,http://localhost:8080` |
| `max_file_size` | `MAX_FILE_SIZE=1073741824` |
| `duckdb_memory_limit` | `DUCKDB_MEMORY_LIMIT=16GB` |

---

## 完整配置示例

```json
{
  "debug": false,
  "cors_origins": ["http://localhost:3000", "http://localhost:5173"],
  "max_file_size": 53687091200,
  "max_query_rows": 10000,
  "timezone": "Asia/Shanghai",
  "duckdb_memory_limit": "8GB",
  "duckdb_threads": 8,
  "duckdb_extensions": ["excel", "json", "parquet", "httpfs", "mysql", "postgres"],
  "server_data_mounts": [
    { "label": "共享数据", "path": "/app/server_mounts" }
  ],
  "pool_min_connections": 2,
  "pool_max_connections": 10,
  "db_read_timeout": 30,
  "federated_query_timeout": 300
}
```
