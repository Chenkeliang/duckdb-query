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
| `duckdb_threads` | integer | CPU cores | Number of parallel query threads (follows `os.cpu_count()` when omitted) |
| `duckdb_temp_directory` | string | `null` | Custom temp directory for DuckDB |
| `duckdb_extensions` | string[] | `["excel", "json", "parquet", "httpfs", "mysql", "postgres"]` | Extensions to auto-load |
| `duckdb_enable_object_cache` | boolean | `true` | Object cache (legacy no-op since DuckDB 1.5.3; kept for compatibility) |

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

AI features (Text-to-SQL chat, error doctor, AI chart suggestions, data chat) are **disabled by default** and are **not stored in this configuration file** — configure them in-app under **Settings → AI Model**, persisted to `system.db` (see API `docs/API_CONTRACT_FE_BE.md` §9.3).

- **Privacy**: provider `api_key` values are stored **Fernet-encrypted**; the read endpoint returns a masked `****` and never echoes back the plaintext. Generated SQL is always placed into the editor — **never auto-executed**.
- **Provider types**: `openai` / `anthropic` / `ollama` / `openai_compatible` (custom `base_url`).
- **Per-feature model selection**: `features.{explain | nl_to_sql | chat | suggest_chart | error_fix}` can each specify a provider/model, falling back to `default_provider` when unset.
- **Timeout / retries**: `timeout_seconds` (default 30), `num_retries` (default 2); exponential backoff on network errors and 429/5xx (deterministic auth/param errors are not retried).
- Failed calls return error codes `ai_not_configured` / `ai_disabled`, which the frontend uses to guide the user to Settings.

---

## Frontend Build Flags (Vite, build-time)

| Env | What it does |
|-----|---------------|
| `VITE_DEMO=true` | Browser-only demo build: queries run on **DuckDB-Wasm**; database-connection and AI entry points are locked behind an upgrade prompt. **Only set for the gh-pages build; never set for self-hosted / Docker.** |
| `VITE_API_URL` | Frontend API base URL (empty = same-origin). |
| `VITE_BASE_URL` | Deployment subpath (gh-pages uses `/duckdb-query/`). |

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

---

## Query Behavior Notes

See [QUERY_BEHAVIOR_ZH.md](QUERY_BEHAVIOR_ZH.md) (Chinese only) for JOIN / set-operation preview, LIMIT, and BY NAME semantics.

---

## Slow Query & Profiling

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `duckdb_enable_profiling` | string | `"no_output"` | Per-connection `SET enable_profiling` (`query_tree` is remapped to `no_output` to prevent log flooding; use `query_tree_optimizer` or `json` for execution-tree diagnostics) |
| `duckdb_profiling_output` | string \| null | `null` | Profiling output file (on Docker this must be on a mounted volume, e.g. `/app/data/duckdb/profiling.json`) |
| `duckdb_auto_explain_threshold_ms` | integer | `0` | Log `EXPLAIN` output for queries slower than this many ms; `0` disables it; `5000` is a reasonable production value |

Environment variable: `DUCKDB_AUTO_EXPLAIN_THRESHOLD_MS`.

---

## JSON / VARIANT Ingestion

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `json_import_column_type` | string | `"auto"` | `auto`: DuckDB infers column types; `variant`: every column becomes `VARIANT` (upload-time `import_mode=variant` takes precedence) |

**DuckDB storage format**: the app opens `main.db` / `system.db` with `storage_compatibility_version=latest` (see `api/core/database/duckdb_storage.py`); new databases use v1.5.x storage, which can persist `VARIANT` columns.

### Migrating an older main.db to latest (small table/data volumes)

Older databases are typically on `v1.0.0+` / `v1.4.x` storage and **cannot** write `VARIANT` tables directly — a one-time migration is required:

1. **Stop** the API (`uvicorn` / container) so the `.db` file isn't locked.
2. Confirm the Python package is **`duckdb==1.5.3`** (`cd api && pip install -r requirements.txt`).
3. Preview:
   ```bash
   cd api
   python scripts/migrate_storage_to_latest.py --dry-run
   ```
4. Run it (backs up to `data/duckdb/backup_storage_migration_<timestamp>/` before replacing the database file):
   ```bash
   python scripts/migrate_storage_to_latest.py
   ```
   Or skip the interactive prompt: `python scripts/migrate_storage_to_latest.py --yes`
5. **Restart** the service, then verify by uploading JSON in the UI or setting `json_import_column_type=variant`.

Migrate only the main or system database: `--only main` / `--only system`.

Migration logic: open the old database read-only → create a new file on `latest` storage → `CREATE TABLE AS SELECT` per table → back up the old file and swap it in.

---

## Enterprise Network & Extensions

| Mechanism | Description |
|-----------|--------------|
| `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` | Passed through from the host by `docker-compose.yml`; `url_reader`'s **requests fallback download** honors the proxy |
| `DUCKDB_EXTENSION_DIRECTORY` | Persistent extension directory, default `/app/data/duckdb/extensions` (matches the `./data` volume) |
| `DUCKDB_REMOTE_SETTINGS` | JSON string merged into `duckdb_remote_settings` (S3/OSS credentials — do not bake into the image) |
| `duckdb_extensions` | Defaults include `httpfs`; the Docker image pre-installs `mysql`, `postgres`, `httpfs`, `spatial`, etc. |

**Note**: whether DuckDB's **httpfs** extension honors the system proxy depends on DuckDB 1.5.3's runtime behavior — test it against `s3://` or HTTPS URLs in the target environment. The application layer only guarantees proxy support on the Python `requests` fallback path.

S3 data paths go over the network via `duckdb_remote_settings` and do **not** depend on `server_data_mounts` host directory mounts.
