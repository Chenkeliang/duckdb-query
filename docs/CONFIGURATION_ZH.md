# DuckQuery 配置参考

本文档提供 DuckQuery 所有配置选项的完整参考。

## 配置文件

主配置文件位于 `config/app-config.json`（或 `config/app-config.jsonc`，`.json` 优先）。首次运行请复制示例文件：

```bash
cp config/app-config.example.jsonc config/app-config.jsonc
```

---

## 核心设置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `debug` | boolean | `false` | 开启详细调试日志 |
| `cors_origins` | string[] | `["http://localhost:48000"]` | 允许的前端跨域源 |
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
| `duckdb_threads` | integer | CPU 核心数 | 并行查询线程数（省略则跟随 `os.cpu_count()`） |
| `duckdb_temp_directory` | string | `null` | 自定义临时目录 |
| `duckdb_extensions` | string[] | `["excel", "json", "parquet", "httpfs", "mysql", "postgres"]` | 自动加载的扩展 |
| `duckdb_enable_object_cache` | boolean | `true` | 对象缓存（DuckDB 1.5.3 起为 no-op，仅兼容保留） |

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
| `cors_origins` | `CORS_ORIGINS=http://localhost:48000,http://localhost:8080` |
| `max_file_size` | `MAX_FILE_SIZE=1073741824` |
| `duckdb_memory_limit` | `DUCKDB_MEMORY_LIMIT=16GB` |

---

## 完整配置示例

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
    { "label": "共享数据", "path": "/app/server_mounts" }
  ],
  "pool_min_connections": 2,
  "pool_max_connections": 10,
  "db_read_timeout": 30,
  "federated_query_timeout": 300,
  "duckdb_auto_explain_threshold_ms": 0,
  "json_import_column_type": "auto"
}
```

---

## 查询行为说明

JOIN / 集合运算的预览、LIMIT、BY NAME 语义见 [QUERY_BEHAVIOR_ZH.md](QUERY_BEHAVIOR_ZH.md)。

---

## 慢查询与 Profiling

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `duckdb_enable_profiling` | string | `"no_output"` | 连接级 `SET enable_profiling`（`query_tree` 会被重映射为 `no_output` 防刷屏；执行树诊断请用 `query_tree_optimizer` 或 `json`） |
| `duckdb_profiling_output` | string \| null | `null` | Profiling 输出文件（Docker 须挂载卷，如 `/app/data/duckdb/profiling.json`） |
| `duckdb_auto_explain_threshold_ms` | integer | `0` | 超过该毫秒数在日志中输出 `EXPLAIN`；`0` 关闭；生产可设 `5000` |

环境变量：`DUCKDB_AUTO_EXPLAIN_THRESHOLD_MS`。

---

## JSON / VARIANT 入湖

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `json_import_column_type` | string | `"auto"` | `auto`：DuckDB 推断类型；`variant`：各列 `VARIANT`（上传 `import_mode=variant` 优先） |

**DuckDB 存储格式**：应用连接 `main.db` / `system.db` 时使用 `storage_compatibility_version=latest`（见 `api/core/database/duckdb_storage.py`），新库为 v1.5.x 存储，可持久化 `VARIANT` 列。

### 从旧版 main.db 迁移到 latest（表/数据不多时）

旧库多为 `v1.0.0+` / `v1.4.x` 存储，**不能**直接写入 `VARIANT` 表，需一次性迁移：

1. **停止** API（`uvicorn` / 容器），避免 `.db` 被占用。
2. 确认 Python 包为 **`duckdb==1.5.3`**（`cd api && pip install -r requirements.txt`）。
3. 预览：
   ```bash
   cd api
   python scripts/migrate_storage_to_latest.py --dry-run
   ```
4. 执行（会备份到 `data/duckdb/backup_storage_migration_<时间戳>/` 后替换库文件）：
   ```bash
   python scripts/migrate_storage_to_latest.py
   ```
   或跳过交互：`python scripts/migrate_storage_to_latest.py --yes`
5. **重启** 服务；在 UI 上传 JSON 或设置 `json_import_column_type=variant` 验证。

仅迁移主库或系统库：`--only main` / `--only system`。

迁移逻辑：只读打开旧库 → 用 `latest` 建新文件 → 逐表 `CREATE TABLE AS SELECT` → 备份旧文件并替换。

---

## 企业网络与扩展

| 机制 | 说明 |
|------|------|
| `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` | `docker-compose.yml` 从宿主机透传；`url_reader` 的 **requests 回退下载** 会使用代理 |
| `DUCKDB_EXTENSION_DIRECTORY` | 扩展持久化目录，默认 `/app/data/duckdb/extensions`（与 `./data` 卷一致） |
| `DUCKDB_REMOTE_SETTINGS` | JSON 字符串，合并进 `duckdb_remote_settings`（S3/OSS 密钥，勿写入镜像） |
| `duckdb_extensions` | 默认含 `httpfs`；镜像构建预装 `mysql`、`postgres`、`httpfs`、`spatial` 等 |

**说明**：DuckDB **httpfs** 是否走系统代理取决于 DuckDB 1.5.3 运行时行为，须在目标环境用 `s3://` 或 HTTPS URL 实测。应用层仅保证 Python `requests` 回退路径读代理。

S3 数据路径走网络与 `duckdb_remote_settings`，**不**依赖 `server_data_mounts` 宿主机目录挂载。
