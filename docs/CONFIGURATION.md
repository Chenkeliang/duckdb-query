# DuckQuery Configuration Reference

This document provides a comprehensive reference for all configuration options in DuckQuery.

## Configuration File

The main configuration file is located at `config/app-config.json` (or `config/app-config.jsonc`; `.json` takes precedence). On first run, copy the example file:

```bash
cp config/app-config.example.jsonc config/app-config.jsonc
```

---

## Core Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `debug` | boolean | `false` | Enable verbose debug logging |
| `cors_origins` | string[] | `["http://localhost:48000"]` | Allowed CORS origins for the frontend |
| `timezone` | string | `"Asia/Shanghai"` | Default timezone for date/time operations |

---

## File & Upload Limits

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `max_file_size` | integer | `53687091200` (50GB) | Maximum file upload size in bytes |
| `max_query_rows` | integer | `10000` | Maximum rows returned in a single query result |
| `max_tables` | integer | `200` | Maximum number of tables displayed in the sidebar |

---

## DuckDB Engine Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `duckdb_memory_limit` | string | `"8GB"` | Maximum memory DuckDB can use |
| `duckdb_threads` | integer | `8` | Number of parallel query threads (set to CPU cores) |
| `duckdb_temp_directory` | string | `null` | Custom temp directory for DuckDB |
| `duckdb_extensions` | string[] | `["excel", "json", "parquet", "httpfs", "mysql", "postgres"]` | Extensions to auto-load |
| `duckdb_enable_object_cache` | boolean | `true` | Enable object cache for better performance |

---

## Server File Mounts

Mount host directories to allow direct file access without uploading:

```json
"server_data_mounts": [
  { "label": "Shared Data", "path": "/app/server_mounts" },
  { "label": "Downloads", "path": "/app/host_downloads" }
]
```

### Docker Setup

In `docker-compose.yml`, map host paths to container paths:

```yaml
volumes:
  - ./server_data:/app/server_mounts
  - ~/Downloads:/app/host_downloads
```

Then reference the **container path** in `app-config.json`.

---

## S3/OSS Remote Settings

For accessing remote files from S3 or Aliyun OSS:

```json
"duckdb_remote_settings": {
  "s3_region": "'cn-hangzhou'",
  "s3_endpoint": "'oss-cn-hangzhou.aliyuncs.com'",
  "s3_url_style": "'path'",
  "s3_use_ssl": "true",
  "s3_access_key_id": "'YOUR_ACCESS_KEY'",
  "s3_secret_access_key": "'YOUR_SECRET_KEY'"
}
```

> **Note**: Values must be wrapped in single quotes as shown.

---

## Connection Pool Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `pool_min_connections` | integer | `2` | Minimum connections in pool |
| `pool_max_connections` | integer | `10` | Maximum connections in pool |
| `pool_connection_timeout` | integer | `30` | Seconds to wait for a connection |
| `pool_idle_timeout` | integer | `300` | Seconds before idle connection is closed |

---

## Timeout Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `db_connect_timeout` | integer | `10` | Database connection timeout (seconds) |
| `db_read_timeout` | integer | `30` | Database read timeout (seconds) |
| `federated_query_timeout` | integer | `300` | Cross-database query timeout (seconds) |
| `url_reader_timeout` | integer | `30` | HTTP URL fetch timeout (seconds) |

---

## AI / LLM

AI 功能(问数 Text-to-SQL、报错医生、AI 图表推荐、数据对话)**默认关闭**,且**不在本配置文件里**——在应用内「**设置 → AI 模型**」配置,持久化到 `system.db`(见 API `docs/API_CONTRACT_FE_BE.md` §9.3)。

- **隐私**:供应商 `api_key` 以 **Fernet 加密**存储,读取接口返回掩码 `****`、从不回传明文;生成的 SQL 永远只填入编辑器、**绝不自动执行**。
- **供应商类型**:`openai` / `anthropic` / `ollama` / `openai_compatible`(自定义 `base_url`)。
- **按功能选模型**:`features.{explain | nl_to_sql | chat | suggest_chart | error_fix}` 可各指定 provider/model,缺省回落到 `default_provider`。
- **超时 / 重试**:`timeout_seconds`(默认 30)、`num_retries`(默认 2);依赖后端 `tenacity`。
- 调用失败返回错误码 `ai_not_configured` / `ai_disabled`,前端据此引导去设置。

---

## Frontend Build Flags (Vite, build-time)

| Env | 作用 |
|-----|------|
| `VITE_DEMO=true` | 浏览器内 Demo 构建:查询走 **DuckDB-Wasm**,连库 / AI 入口锁为升级引导。**仅 gh-pages 构建设此项;自托管 / Docker 不设。** |
| `VITE_API_URL` | 前端 API 基址(留空 = 同源)。 |
| `VITE_BASE_URL` | 部署子路径(gh-pages 用 `/duckdb-query/`)。 |

---

## Environment Variable Overrides

Most settings can be overridden via environment variables:

| Config Key | Environment Variable |
|------------|---------------------|
| `debug` | `DEBUG=true` |
| `cors_origins` | `CORS_ORIGINS=http://localhost:48000,http://localhost:8080` |
| `max_file_size` | `MAX_FILE_SIZE=1073741824` |
| `duckdb_memory_limit` | `DUCKDB_MEMORY_LIMIT=16GB` |

---

## Example Full Configuration

```json
{
  "debug": false,
  "cors_origins": ["http://localhost:48000"],
  "max_file_size": 53687091200,
  "max_query_rows": 10000,
  "timezone": "Asia/Shanghai",
  "duckdb_memory_limit": "8GB",
  "duckdb_threads": 8,
  "duckdb_extensions": ["excel", "json", "parquet", "httpfs", "mysql", "postgres"],
  "server_data_mounts": [
    { "label": "Shared Data", "path": "/app/server_mounts" }
  ],
  "pool_min_connections": 2,
  "pool_max_connections": 10,
  "db_read_timeout": 30,
  "federated_query_timeout": 300
}
```
