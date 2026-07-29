# 前后端 API 契约（真相表）

> **维护规则**：增删响应字段时先更新本表，再改 Pydantic / TypeScript 与调用方（与 [`AGENTS.md`](../AGENTS.md) §8.5 顺序一致）。  
> **字段级实时真相**：所有端点均带 OpenAPI `tags`，运行中的 **Swagger `/docs`**（Docker: `:48001/docs`，本地: `:48001/docs`）和 `/openapi.json` 始终与代码同步；本表负责**高层导航 + 前端模块索引**，新增端点务必在此**登记一行**(否则就像 AI 端点那样漏掉)。  
> **环境说明**：若网关或代理改写 JSON，以浏览器 Network 实际响应为准；本表以仓库内 FastAPI 路由与 `create_success_response` / `create_list_response` 为准。  
> **调用图**：见 [`ARCHITECTURE_CALL_MAP.md`](ARCHITECTURE_CALL_MAP.md)、[`frontend/QUERY_EXECUTION_FLOW.md`](frontend/QUERY_EXECUTION_FLOW.md)。

## 0. 部署与 API 入口

| 模式 | 前端访问 | 后端 API | 浏览器请求路径 |
|------|----------|----------|----------------|
| **Docker（推荐）** | http://localhost:48000 | 容器内 `:8000`；文档 http://localhost:48001/docs | 相对路径 `/api/...` → nginx → `backend:8000` |
| **本地开发** | http://localhost:48000（Vite） | `uvicorn` → http://localhost:48001 | Vite `proxy` 将 `/api` 转到 `:48001` |

两种模式共用 `frontend/src/api/*`；**无**路径重写。用户查询主路径为 `POST /api/duckdb/execute` 与 `POST /api/duckdb/federated-query`，**不是** `POST /api/execute_sql`。

### 0.1 前端模块索引（`frontend/src/api/index.ts`）

| 模块文件 | 契约章节 | 说明 |
|----------|----------|------|
| `client.ts` | §1 | `apiClient`、`normalizeResponse`、错误归一化 |
| `queryApi.ts` | §2 | DuckDB / 联邦执行、取消、`save_query_to_duckdb` |
| `tableApi.ts` | §2、§3 | DuckDB 表；外部表详情 |
| `databaseSchemasApi.ts` | §3 | 连接 schemas / 表列表 |
| `dataSourceApi.ts` | §4 | 数据源 CRUD / 测试 / 刷新 |
| `uploadApi.ts` | §5 | 本地上传与分块（从 `fileApi` 再导出） |
| `fileApi.ts` | §5 | URL / Excel / 服务器文件 / 粘贴 |
| `asyncTaskApi.ts` | §6 | 异步任务、连接池状态、错误统计 |
| `pivotQueryApi.ts` | §7 | 透视 generate/preview、SQL 收藏、应用配置（`POST /api/pivot-query/*`） |
| `settingsShortcutsApi.ts` | §8 | 快捷键 |
| `setOperationsApi.ts` | §9 | 集合运算 generate / preview / validate / execute 等 |
| `queryExportApi.ts` | §9.1 | 查询结果服务端导出 |
| `joinQueryApi.ts` | §9.2 | 结构化多表 JOIN：`performJoinQuery` |
| `aiApi.ts` | §9.3 | AI 设置 / 供应商测试 / 报错医生 / 解释 / 问数 / 对话 / 图表推荐 |

## 1. 标准成功体

| 形式 | `HTTP` | JSON 根字段 |
|------|--------|-------------|
| 对象载荷 | 200 | `success`, `data`, `messageCode`, `message`, `timestamp` |
| 列表载荷 | 200 | 同上，`data` 内含 `items`, `total`（及可选 `page` / `pageSize`） |

前端统一经 [`frontend/src/api/client.ts`](../frontend/src/api/client.ts) 的 `apiClient` + `normalizeResponse` 解包（列表响应同时填充 `normalized.items`）。

## 1.1 标准错误体

失败时 JSON 根字段：`success: false`，`error: { code, message, details? }`，`messageCode`，`message`，`timestamp`。**不含**顶层 `detail`（与 FastAPI 默认 422 裸数组区分）。业务路由用 `BaseAPIException` / `error_json_response`；遗留 `HTTPException` 由全局 handler 包成同一信封。

| HTTP | `error.code` | 典型场景 |
|------|--------------|----------|
| 422 | `VALIDATION_ERROR` | Pydantic 请求体（`details.errors[]`） |
| 400 | `VALIDATION_ERROR` | 空 SQL、粘贴/分块校验、路径不在挂载白名单、表名冲突、无效快捷键 `action_id` |
| 400 | `INVALID_TABLE_NAME` / `INVALID_ALIAS` / `INVALID_LIMIT` / `INVALID_OFFSET` / `MISSING_*` | `core.common.validators` 参数校验（`details.field`） |
| 403 | `PROTECTED_SCHEMA` / `RESERVED_NAME` / `PATH_NOT_ALLOWED` / `SYMLINK_NOT_ALLOWED` | 表名/路径安全校验 |
| 400 | `URL_INVALID` | `GET /api/url_info` / `POST /api/read_from_url` 无法访问或格式无效 URL |
| 400 | `PIVOT_QUERY_INVALID` | 透视 generate / preview 业务配置校验失败 |
| 400 | `CONNECTION_TEST_FAILED` | `POST .../databases/test`、保存后测试失败、`refresh` 测试失败 |
| 400 | `SECURITY_ERROR` | 服务器浏览路径为符号链接 |
| 403 | `AUTHORIZATION_ERROR` | 服务器目录无读权限 |
| 404 | `RESOURCE_NOT_FOUND` | 数据源 id、分块上传会话、DuckDB 表、联邦 `attach_databases[].connection_id` |
| 404 | `FAVORITE_NOT_FOUND` | SQL 收藏 id 不存在 |
| 404 | `QUERY_NOT_FOUND` | 同步查询取消时无对应 `X-Request-ID` 会话 |
| 409 | `UPLOAD_PROCESSING` | 分块上传已进入合并/导入阶段，不能再取消 |
| 413 | `FILE_TOO_LARGE` | 分块 `init` 超过 `max_file_size` |
| 499 | `QUERY_CANCELLED` | 同步 DuckDB / 联邦查询取消（`X-Request-ID`） |
| 500 | `QUERY_FAILED` | DuckDB `execute` / 联邦 SQL 执行失败 |
| 503 | `DATABASE_CONNECTION_ERROR` | 联邦查询 ATTACH 外部库失败 |
| 504 | `QUERY_TIMEOUT` | 联邦查询超过 `federated_query_timeout`（默认 300s）被看门狗中止 |
| 500 | `OPERATION_FAILED` | 数据源 CRUD 列表、粘贴保存、分块完成、服务器导入、迁移/错误统计、快捷键列表加载失败 |
| 500 | `URL_READ_FAILED` | `POST /api/read_from_url` 处理失败 |
| 500 | `SHORTCUT_UPDATE_FAILED` / `SHORTCUT_RESET_FAILED` | 快捷键更新 / 重置持久化失败 |

§4–§5 端点错误码以本表为准；成功体形状不变。

## 2. 查询与 DuckDB（`queryApi.ts` / `tableApi.ts`）

| 方法 | 路径 | 成功体 | `data` 要点 | 前端入口 |
|------|------|--------|-------------|----------|
| POST | `/api/duckdb/execute` | 对象 | `executeDuckDBSQL`；`data`: `columns`, `column_types[]`（`{name, duckdb_type}`；来自 `DESCRIBE (<sql>)`，PRAGMA/EXPLAIN/多语句等不可 DESCRIBE 时由同一次执行的游标 description 类型兜底）, `data`, `row_count`, `preview_limit_applied?`；499 / 500 |
| POST | `/api/duckdb/federated-query` | 对象 | `executeFederatedQuery`；同上含 `column_types`；额外 `optimized_sql`（半连接下推改写后 SQL）、`suggestions[]`（审计列时间界建议，**不自动改结果**）；404 `connection_id`；503 ATTACH；499 / 500 / **504 超时** |
| POST | `/api/query/cancel/{request_id}` | 对象 | `cancelSyncQuery`；404 `QUERY_NOT_FOUND`（无活跃同步查询） |
| POST | `/api/save_query_to_duckdb` | 对象 | 保存结果表元数据（依请求）；`apply_row_limit`（默认 `false`，兼容 `applyRowLimit`）为保存对话框的最终选择：`false`＝移除查询页面最外层 `LIMIT` 后全量保存（子查询 `LIMIT` 保留），`true`＝保留页面最外层 `LIMIT`，页面无最外层 `LIMIT` 时补默认 `max_query_rows` | `saveQueryToDuckDB` |
| GET | `/api/duckdb/tables` | **列表** | `items[]`: `table_name`, `row_count`, `column_count`, `created_at`（应用时区 ISO，仅展示，可为 null）。顺序 = `system_table_registry.sort_seq` 倒序（稳定创建序登记表，新建/替换置顶，跨重启稳定；与 AI 目录同口径） | `getDuckDBTables` |
| GET | `/api/duckdb/tables/{name}` | 对象 | 表详情 / `table` 包装 | `getDuckDBTableDetail` |
| DELETE | `/api/duckdb/tables/{name}` | 对象 | `deleted_table` | `deleteDuckDBTable` |
| POST | `/api/duckdb/table/{name}/refresh` | 对象 | `table`, `refreshed` | `refreshDuckDBTableMetadata` |
| GET | `/api/duckdb/pool/status` | 对象 | `pool_status`, `timestamp` | `getConnectionPoolStatus` |
| POST | `/api/duckdb/pool/reset` | 对象 | 依后端 | `resetConnectionPool` |

## 3. 外部库元数据（`databaseSchemasApi.ts` / `tableApi.ts`）

| 方法 | 路径 | 成功体 | `data` 要点 | 前端入口 |
|------|------|--------|-------------|----------|
| GET | `/api/datasources/databases/{id}/schemas` | **列表** | `items[]`: `{ name, table_count? }`；PostgreSQL=全部用户 schemas，MySQL=所连库（schema≡database，单条），SQLite/DuckDB=空 | `listConnectionSchemas`（**前端已用**，UI 仅对 PostgreSQL 展示） |
| GET | `/api/datasources/databases/{id}/schemas/{schema}/tables` | **列表** | `listSchemaTablesForConnection` |
| GET | `/api/datasources/databases/{id}/tables` | 对象 | `tables[]`（非 `items`） | `listConnectionTablesFlat`（**前端已用**） |
| GET | `/api/datasources/databases/{id}/tables/detail` | 对象 | `table_name`, `columns`, `indexes?`, `table_comment?` | `getExternalTableDetail`；`ContextMenu` / `useTableColumns` |

## 4. 数据源连接（`dataSourceApi.ts`）

| 方法 | 路径 | 成功体 | 前端入口 |
|------|------|--------|----------|
| GET | `/api/datasources` | **列表** | `listAllDataSources` |
| GET | `/api/datasources?type=database` | **列表** | `listDatabaseConnections` |
| GET | `/api/datasources/databases/list` | **列表** | `listDatabaseDataSources` |
| GET | `/api/datasources/files/list` | **列表** | `listFileDataSources` |
| GET | `/api/datasources/{id}` | 对象 | `getDatabaseConnection`；404 `RESOURCE_NOT_FOUND`（§1.1） |
| POST | `/api/datasources/databases` | 对象 | `createDatabaseConnection`；400 `CONNECTION_TEST_FAILED`（保存成功但测试失败） |
| PUT | `/api/datasources/databases/{id}` | 对象 | `updateDatabaseConnection`；404；400 `CONNECTION_TEST_FAILED` |
| DELETE | `/api/datasources/{id}` | 对象 | `deleteDatabaseConnection`（id 可带 `db_` 前缀）；404/500（§1.1） |
| POST | `/api/datasources/databases/test` | 对象 | `testDatabaseConnection`, `testConnection`；400 `CONNECTION_TEST_FAILED` |
| POST | `/api/datasources/databases/{id}/refresh` | 对象 | `refreshDatabaseConnection`；404；400 `CONNECTION_TEST_FAILED` |

## 5. 文件与导入（`fileApi.ts` / `uploadApi.ts`）

`uploadApi.ts` 封装：`uploadFile`、`uploadFileAuto`、`initChunkedUpload`、`uploadChunk`、`completeChunkedUpload`、`cancelChunkedUpload`（阈值 `CHUNKED_UPLOAD_THRESHOLD_BYTES`）。其余入湖能力在 `fileApi.ts`。

**`import_mode`（可选，默认 `auto`）**：`auto` = 先 `all_varchar` / 字面量读入再 `promote_table_column_types_from_varchar`（ID 列保持 VARCHAR，不升为 DOUBLE）；`literal` = 全列 VARCHAR、不 promote；`variant` = JSON/JSONL 各列 VARIANT。  
当 `import_mode=auto` 且文件类型为 `json`/`jsonl` 时，若 app-config `json_import_column_type=variant`，服务端解析为 `variant`（`resolve_import_mode`）。  
请求字段名：`import_mode`（Form 或 JSON）。前端类型：`FileImportMode`（`fileApi.ts`），上传面板 `UploadPanel` 状态 `importMode`。

| 方法 | 路径 | `import_mode` | 前端入口 |
|------|------|---------------|----------|
| POST | `/api/upload` | Form | `uploadFile`, `uploadFileEnhanced`；400 `VALIDATION_ERROR`/`SECURITY_ERROR`/`FILE_TYPE_NOT_SUPPORTED` |
| POST | `/api/upload/init` | Form | `initChunkedUpload`；413 `FILE_TOO_LARGE`（§1.1） |
| POST | `/api/upload/complete` | 会话 | `completeChunkedUpload`；404 会话 / 400 未完成（§1.1） |
| POST | `/api/data-sources/excel/import` | JSON body | `importExcelSheets`；404 `FILE_NOT_FOUND`；500 `EXCEL_IMPORT_FAILED` |
| POST | `/api/server-files/import` | JSON body | `importServerFile` |
| POST | `/api/server-files/excel/import` | JSON body | `importServerExcelSheets` |
| POST | `/api/read_from_url` | JSON `import_mode?`, `prefer_native?`（默认 true，false 时对 http(s) 跳过 DuckDB/httpfs 直读） | `readFromUrl`；s3:// 禁止 requests 回退；400 `URL_INVALID`；500 `URL_READ_FAILED`（§1.1） |
| POST | `/api/upload/chunk` | — | `uploadChunk` |
| DELETE | `/api/upload/cancel/{upload_id}` | — | `cancelChunkedUpload`；404 会话；409 已进入处理阶段（§1.1） |
| — | `uploadFileAuto` | 同上 | 文件 &gt; 8MB 走分块，否则 `POST /api/upload` |
| GET | `/api/url_info` | — | `getUrlInfo`；400 `URL_INVALID`（§1.1） |
| POST | `/api/data-sources/excel/inspect` | — | `inspectExcelSheets`；404 `FILE_NOT_FOUND` |
| GET | `/api/server-files/mounted` | — | `getServerMounts` |
| GET | `/api/server-files/browse` | — | `browseServerDirectory`；404/400/403（§1.1） |
| POST | `/api/server-files/excel/inspect` | JSON `table_alias?` | `inspectServerExcelSheets` |
| POST | `/api/paste-data` | — | `pasteData`；400 校验 / 500（§1.1） |

## 6. 异步任务与运维（`asyncTaskApi.ts`）

| 方法 | 路径 | 成功体 | 前端入口 |
|------|------|--------|----------|
| GET | `/api/async-tasks` | **列表** | `listAsyncTasks`（`limit`, `offset`, `order_by`） |
| GET | `/api/async-tasks/{id}` | 对象 | `getAsyncTask`；404 `RESOURCE_NOT_FOUND` |
| POST | `/api/async-tasks` | 对象 | `submitAsyncQuery`（`task_id`；可 `attach_databases` 或由 `datasource` 推导）；`apply_row_limit`（默认 `false`）为最终行数选择：`false`＝移除查询页面最外层 `LIMIT` 后全量执行（子查询 `LIMIT` 保留），`true`＝保留已有最外层 `LIMIT`，没有时补默认 `max_query_rows`（默认值不是硬上限）；判定走 sqlglot AST，禁止按 LIMIT 数值猜来源；retry 保留原任务选择；400 空 SQL / attach 校验 |
| POST | `/api/async-tasks/{id}/cancel` | 对象 | `cancelAsyncTask`；404 任务不存在；400 `TASK_CANCEL_NOT_ALLOWED` |
| POST | `/api/async-tasks/{id}/retry` | 对象 | `retryAsyncTask`；404 / 400 缺 SQL |
| GET / POST | `/api/async-tasks/{id}/download` | **blob** 或 JSON 错误体 | `getAsyncDownloadUrl`（query / body：`format=csv\|parquet\|json\|xlsx`）；JSON 为标准数组；XLSX 含表头且最多 1,048,575 条数据；400 格式或 XLSX 行数超限；404 文件 |
| POST | `/api/async-tasks/{id}/export-to-path` | `path`, `size_bytes` | `exportAsyncResultToPath`（体：`format=csv\|parquet\|json\|xlsx`, `target_path`）；**桌面模式专用**——后端直写用户经原生存盘对话框选定的本地路径；非桌面（未设 `ALLOW_ARBITRARY_LOCAL_PATHS=1`）403，浏览器场景继续用 GET `/download` 流式；400 路径、格式或 XLSX 行数超限 |
| GET | `/api/errors/statistics` | 对象 | `getErrorStatistics` |
| POST | `/api/errors/clear` | 对象 | `clearOldErrors`（query: `days`） |

## 7. 透视查询与收藏（`pivotQueryApi.ts`）

> **2026-05**：工作台已移除「可视化查询」Tab。`POST /api/pivot-query/*` 仅 **透视**（必填 `pivot_config`；响应 `data.mode` 为 `pivot`）。`config` 仅 `table_name`、`filters`、`limit`；`FilterConfig` 为 `column` / `operator` / `value`（`value2` 用于 BETWEEN）/ `logic_operator`。集合操作模型见 `set_operation_models.py`。

| 方法 | 路径 | 成功体 | 前端入口 |
|------|------|--------|----------|
| POST | `/api/pivot-query/generate` | 对象 | `generatePivotQuery`（`pivot_config` 必填；可选 `attach_databases`；`pivot_config.values[].typeConversion`=聚合前 TRY_CAST 目标，走白名单校验）；列维度去重值超过 app `pivot_max_columns` 时 **400 `PIVOT_COLUMN_LIMIT_EXCEEDED`**，`error.details={column,cap,observed_at_least}`（前端据结构化字段提示，勿解析消息文本）；配置无效 400 `PIVOT_QUERY_INVALID`。**服务端路径出错时前端不回退本地 PIVOT**（本地 SQL 无列上限保护） |
| POST | `/api/pivot-query/preview` | 对象 | `previewPivotQuery`（`pivot_config` 必填；可选 `attach_databases`；可选顶层 `limit`=预览行数上限，缺省回退 app `max_query_rows`，响应 `row_count`=透视后总行数、`returned_rows`=实际返回行数；MCP 工具 `pivot` 预览默认传 `limit=100`）；400 `PIVOT_QUERY_INVALID`；499 `QUERY_CANCELLED`；500 `OPERATION_FAILED` |
| GET | `/api/sql-favorites` | **列表** | `listSqlFavorites` |
| GET | `/api/sql-favorites/{id}` | 对象 | `getSqlFavorite`（`data.favorite`）；404 `FAVORITE_NOT_FOUND` |
| POST | `/api/sql-favorites` | 对象 | `createSqlFavorite`；400 `FAVORITE_NAME_EXISTS` |
| PUT | `/api/sql-favorites/{id}` | 对象 | `updateSqlFavorite`；404 `FAVORITE_NOT_FOUND` |
| DELETE | `/api/sql-favorites/{id}` | 对象 | `deleteSqlFavorite`；404 `FAVORITE_NOT_FOUND` |
| POST | `/api/sql-favorites/{id}/use` | 对象 | `incrementFavoriteUsage`；404 `FAVORITE_NOT_FOUND` |
| GET | `/api/app-config/features` | 对象 | `getAppConfig`；含 `json_import_column_type`, `remote_storage_configured`（是否配置 `duckdb_remote_settings`）, `pivot_max_columns`（透视结果列数上限，默认 300；前端据此发 `column_value_limit`） |
| POST | `/api/columns/infer-cast` | 对象 | `inferColumnCast`（`columnAnalysisApi.ts`）；入参 `{table_name, column, filters?, attach_databases?}`；在筛选后真实数据上刻画一列作为数值 cast 目标：`{recommended: 'BIGINT'\|'DECIMAL(38,s)'\|null, total, numeric, non_numeric, max_int_digits, max_frac_digits, safe_decimal_cast, reason}`；DECIMAL scale 取自实际数据。`safe_decimal_cast`=是否可**安全自动量化**（`recommended` 非 null 时恒 true；语义非"数学上能否放进 DECIMAL(38)"——二进制浮点源即便数值能放进也为 false，量化有损）。`reason`∈ `null\|empty\|non_numeric\|binary_float\|scientific\|overflow`（不安全原因）：`binary_float`=源列本就是 FLOAT/DOUBLE（`CAST(AS VARCHAR)` 是最短往返串，量化会让 `19.99→19.98999999999999744` 失真，交 JOIN 分侧转换/用户显式选；此分支跳过 O(n) 文本扫描，但 `total`/`numeric` 仍以轻量 `count(*)`+`isfinite` 如实统计，`max_int_digits`/`max_frac_digits`=0）；`scientific`=含科学计数法文本无法可靠定标度；`overflow`=整数位+小数位超 38。任一不安全 → `recommended=null`，不静默丢数据。供透视文本聚合与 JOIN 类型冲突的数据感知安全推荐 |

## 8. 设置（`settingsShortcutsApi.ts`）

| 方法 | 路径 | 成功体 | 前端入口 |
|------|------|--------|----------|
| GET | `/api/settings/shortcuts` | 对象 | `fetchShortcutsConfig`（`shortcuts`, `defaults`）；500 `OPERATION_FAILED` |
| PUT | `/api/settings/shortcuts/{action_id}` | 对象 | `updateShortcutSetting`；400 无效 `action_id`；500 `SHORTCUT_UPDATE_FAILED` |
| POST | `/api/settings/shortcuts/reset` | 对象 | `resetShortcutsSetting`；400 无效 `action_id`；500 `SHORTCUT_RESET_FAILED` |

## 9. 集合运算（`setOperationsApi.ts`）

BY NAME、LIMIT、预览 vs 执行语义见 [QUERY_BEHAVIOR_ZH.md](QUERY_BEHAVIOR_ZH.md)。请求体可含 `attach_databases`（联邦表 UNION/INTERSECT/EXCEPT）。

| 方法 | 路径 | 成功体 | 前端入口 |
|------|------|--------|----------|
| POST | `/api/set-operations/generate` | 对象 | `generateSetOperation`；400 `VALIDATION_ERROR`；500 `OPERATION_FAILED` |
| POST | `/api/set-operations/preview` | 对象 | `previewSetOperation`；400 / 500（同上） |
| POST | `/api/set-operations/validate` | 对象 | `validateSetOperation`；500 服务异常 |
| POST | `/api/set-operations/execute` | 对象 | `executeSetOperation`（`save_as_table` / `preview`）；400 / 500 |
| POST | `/api/set-operations/simple-union` | 对象 | `simpleUnionSetOperation` |

## 9.1 查询结果服务端导出（`queryExportApi.ts`）

| 方法 | 路径 | 成功 `data` | 前端 |
|------|------|-------------|------|
| POST | `/api/query-results/export` | `file_id`, `download_url`, `format`, `row_count_estimate?` | `exportQueryResults`；`apply_row_limit`（默认 `false`）语义与 `/api/async-tasks` 相同（`false` 移除最外层 `LIMIT`，`true` 保留已有最外层 `LIMIT`、没有则补默认 `max_query_rows`）；子查询 `LIMIT` 始终保留 |
| GET | `/api/query-results/export/{file_id}/download` | 文件流 | `getQueryExportDownloadUrl` + 浏览器下载 |
| POST | `/api/query-results/export/{file_id}/save-to-path` | `path`, `size_bytes` | `saveQueryExportToPath`（体：`target_path`）；**桌面模式专用**（同 async export-to-path 门控，非桌面 403）；400 路径非法；404 文件不存在 |

请求：`{ sql, format: "parquet"|"csv", attach_databases? }`；支持 `X-Request-ID` 取消（499 `QUERY_CANCELLED`）。

**`setOperationsApi.ts` 已封装**：`generate`、`preview`、`validate`、`execute`、`simple-union`。

执行时前端在 generate 返回的 SQL 后追加 `LIMIT`（与 `maxQueryRows` 一致）；**preview** 端点 LIMIT 由后端 `max_query_rows` 控制，结果写入结果面板。

## 9.2 多表 JOIN（`joinQueryApi.ts`）

| 方法 | 路径 | 成功体 | 前端入口 |
|------|------|--------|----------|
| POST | `/api/query` | 对象 | `performJoinQuery`；`data`: `data`, `columns`, `column_types[]`, `sql`, `row_count` |
| POST | `/api/save_query_to_duckdb` | 对象 | 见 §2 `saveQueryToDuckDB` |

## 9.3 AI（统一 Agent Engine；`agentApi.ts`/`aiApi.ts`，后端 `routers/ai.py`，OpenAPI tag `AI`）

> **1.3.0 破坏性升级**:5 个旧独立 LLM 服务(chat/nl-to-sql/error-doctor/explain-sql/suggest-chart)已合并为**单一 Agent Engine + 多 Profile**。所有 AI 调用统一走 `POST /api/ai/agent/{stream,run}`,请求体 `{ mode, session_id?, input, context }`,由 `mode` 判别 Profile(prompt/工具/预算/输出模型/失败策略)。**禁止**按 `session_id` 前缀判断功能:`session_id` 仅作会话关联,`run_id` 标识单次执行/取消/观测,`mode` 决定行为。
>
> AI **默认关闭**;供应商 `api_key` 服务端 **Fernet 加密**存储,读取接口返回掩码 `****`、从不回传明文。AI 起草的 SQL 永远只填入编辑器、**绝不自动执行**;**数据智能体**(`mode=data_qa`)例外且仅限:自行执行**只读、限行(≤100)、限次(≤3)、可取消**的探查 SELECT,范围限本地表与本次请求授权的连接别名,其最终产出的 SQL 同样只填入编辑器。AI 上下文除表结构外还带**本地表的有界数据样例**(≤3 行样本 + 低基数文本列取值,随 prompt 发给所配置的 LLM 供应商;联邦表不预采样,智能体对联邦表的取值验证走上述受授权的探查查询)。

| 方法 | 路径 | 请求 | 成功体 | 前端入口 |
|------|------|------|--------|----------|
| GET | `/api/settings/ai` | — | `AiSettings`（`providers[].api_key` 掩码为 `****`） | `getAiSettings` |
| PUT | `/api/settings/ai` | `AiSettings` | `{ saved: true }` | `saveAiSettings` |
| POST | `/api/ai/providers/{id}/test` | — | `{ ok, sample? }` | `testProvider` |
| POST | `/api/ai/agent/stream` | `AgentRequest`(见下) | **SSE 流**(`text/event-stream`,响应头含 `X-Accel-Buffering: no`):事件见下表;主要供 `data_qa` 展示步骤/取消。未配置/关闭在建流前返回 400 `ai_not_configured`/`ai_disabled`;**未知 `mode` 或输入不合 Profile 契约**返回 400 `VALIDATION_ERROR`(未知 mode 是判别键取值错误,属非法输入,**不是** `ai_not_configured`) | `streamAgent` |
| POST | `/api/ai/agent/run` | `AgentRequest` | **非流式 JSON**:`{ result, termination_reason, message, run_id, session_id }`——与 stream 复用同一个 run_agent(同 Engine+Profile)。`result` 为该 mode 的 output_model 或 `null`(校验失败/回退)。供 `generate_sql`/`repair_sql`/`explain_sql`/`suggest_chart` 与 MCP。成功与各类终止均返回同结构。未配置/关闭/输入非法同上 400 | `runAgent<T>` |
| GET | `/api/ai/agent-runs` | `limit?`(≤100) | **列表** `items[]`: `run_id`,`mode`,`provider`,`model`,`steps`,`llm_calls`,`tool_calls`,`sql_calls`,`sql_rejected`,`json_errors`,`termination_reason`,`elapsed_ms`,`created_at`(应用时区 ISO) | （调试/观测,暂无 FE 入口） |

**AgentRequest**：`{ mode, session_id?, input, context }`,`context = { tables[], attach_databases[], current_sql?, locale }`。`mode` 与 `input`/`result`(output_model)/失败策略：

| mode | input | result（output_model） | 失败策略 | 入口 |
|---|---|---|---|---|
| `data_qa` | `{ messages:[{role,content}] }` | `{ content, sql\|null, evidence[] }` | typed_error | 前端问数对话抽屉（`streamAgent`） |
| `generate_sql` | `{ question }` | `{ sql, used_tables[], safe }`（`EXPLAIN` 干跑校验,不执行) | reject（`null`） | **后端 / MCP `generate_sql`**（当前无现役前端按钮） |
| `repair_sql` | `{ sql, error }` | `{ explanation, fixed_sql\|null, safe }` | reject（`null`） | 前端结果面板报错修复（`runAgent`）+ MCP |
| `explain_sql` | `{ sql }` | `{ explanation }`（无工具,`max_steps=1`) | typed_error | **后端 / MCP `explain_sql`**（当前无现役前端按钮） |
| `suggest_chart` | `{ columns[], sample[] }` | `ChartSpec{ type, x, y[], agg?, xBin?, reason? }` | fallback（`null`→前端 `defaultSpec`） | 前端图表 AI 推荐（`runAgent`）+ MCP |

> 失败策略与终止码：`typed_error` → **error 事件**,`termination_reason=output_invalid`;`reject`/`fallback` → **answer 事件**,`result` 为 `null`(或 fallback),`termination_reason` 为 `output_invalid`(输出模型校验失败)或 `sql_validation_failed`(`generate_sql`/`repair_sql` 的 `EXPLAIN` 干跑失败)。故 `answer` 的 `termination_reason` 不只是 `completed`。
>
> **`data_qa` 的三个终止动作 `final` / `answer` / `refuse`**：`final` 是**带数据的答复**——模型只提交本轮成功 `run_query` 的内部 `query_id`；后端据该 ID 回填实际执行的 `sql`，并从 SQL AST 提取真实业务表生成 `evidence[]`，不采信模型自报的 SQL/证据。不存在、失败或未读取真实表的查询 ID（如 `SELECT 1` / `SELECT CURRENT_DATE`）一律拒绝并回喂纠错；预算耗尽仍不达标 → **error 事件**、`termination_reason=ungrounded_final`，绝不 `completed`。`answer` 用于无需查数的解释/普通回答，`refuse` 用于写入、文件、越权或缺少作用域；二者均由后端强制 `sql=null` / `evidence=[]`，仅 `refuse` 可产生范围外表建议。`query_id` 只属于模型内部协议，对外 `result` 仍是 `{content, sql|null, evidence[]}`，前端与 MCP 参数不变。
>
> **`safe` 由后端派生,不采信模型**：`generate_sql`/`repair_sql` 结果里的 `safe` **不在 output_model**(模型若在 `result` 里带 `safe`,`model_dump()` 阶段被丢弃),而由后端 `finalize` 用 AST 只读判定(`is_select_only`)重算并追加——`generate_sql.safe = SQL 为单条只读 SELECT`;`repair_sql` 中 `fixed_sql` 非只读 SELECT 时 `fixed_sql` 抹为 `null` 且 `safe=false`。前端(`ResultPanel`)据 `safe` 决定是否允许"应用修复 SQL",故此值必须服务端可信,不能让 LLM 决定。

**SSE 事件**（每条 `event:` + 单行 `data:` JSON,均含 `run_id`;`answer` 与 `error` 互斥,`done` 恒为最后一条;15s 无事件发注释行心跳）:

| event | data |
|---|---|
| `run_started` | `{run_id, session_id\|null, limits:{steps, sql_calls, seconds, llm_calls}}` |
| `tool_started` | `{run_id, tool_call_id, tool, args_summary}`（`data_qa` 的 `tool` 取值:`search_tables` / `describe_tables` / `inspect_table` / `run_query`;前端按名字展示即可,新增工具不需要前端改动） |
| `tool_completed` | `{run_id, tool_call_id, tool, ok, ui_summary, truncated, elapsed_ms}` |
| `answer` | `{run_id, result\|null, termination_reason: completed\|output_invalid\|sql_validation_failed}`（`result` 为该 mode 的 output_model 或 `null`;`data_qa` 的 `result.sql` 仅供插入编辑器） |
| `error` | `{run_id, termination_reason: protocol_violation\|ungrounded_final\|budget_llm\|budget_time\|cancelled\|provider_error\|output_invalid\|internal_error, message}` |
| `done` | `{run_id, session_id\|null, usage:{steps, llm_calls, tool_calls, sql_calls, elapsed_ms}}` |

取消:客户端断开连接即取消(服务端中断在跑查询);执行中的探查查询也可经 `POST /api/query/cancel/{run_id}` 中断。

- `attach_databases`：`[{ alias, connection_id }]`；后端据此先 ATTACH 远端库,再取**联邦表**结构(注入 schema 用)。
- 未配置 / 关闭时返回错误码 `ai_not_configured` / `ai_disabled`,前端据此引导去「AI 模型」设置。
- `AiSettings`：`{ enabled, default_provider, providers[], features, timeout_seconds, num_retries }`;`features` 键为 Profile 的 `model_feature`(`data_qa`/`generate_sql`/`repair_sql`/`explain_sql`/`suggest_chart`),解析顺序 per-profile 覆盖 → `default_provider` 兜底 → 首个启用供应商。旧功能键(chat/nl_to_sql/error_doctor/explain)升级时一次性迁移到对应 Profile 键。provider 类型 `openai | anthropic | anthropic_compatible | ollama | openai_compatible`(后两者需填 `base_url`;`anthropic_compatible` 走 `/v1/messages` 协议的第三方网关)。详见 `docs/CONFIGURATION.md` → AI / LLM。

## 10. 已移除的历史端点（勿再使用）

以下路径已从后端删除；请用 §2 / §3 canonical 路径替代：

| 原路径 | 替代 |
|--------|------|
| `POST /api/execute_sql` | `POST /api/duckdb/execute` 或 `POST /api/duckdb/federated-query` |
| `GET /api/duckdb_tables` | `GET /api/duckdb/tables` |
| `DELETE /api/duckdb_tables/{name}` | `DELETE /api/duckdb/tables/{name}` |
| `GET /api/database_tables/{id}` | `GET /api/datasources/databases/{id}/tables` |
| `GET /api/database_table_details/{id}/{table}` | `GET /api/datasources/databases/{id}/tables/detail` |
| `GET /api/databases/{id}/schemas` | `GET /api/datasources/databases/{id}/schemas` |
| `POST /api/ai/nl-to-sql` | `POST /api/ai/agent/run`（`mode=generate_sql`） |
| `POST /api/ai/error-fix` | `POST /api/ai/agent/run`（`mode=repair_sql`） |
| `POST /api/ai/explain-sql` | `POST /api/ai/agent/run`（`mode=explain_sql`） |
| `POST /api/ai/suggest-chart` | `POST /api/ai/agent/run`（`mode=suggest_chart`） |
| `POST /api/ai/agent-chat` / `…/result` | `POST /api/ai/agent/stream`（`mode=data_qa`）/ `POST /api/ai/agent/run` |

## 11. 易混字段说明

| 字段 | 含义 |
|------|------|
| `row_count`（pivot preview） | 与生成 SQL 匹配的**估算总行**，可能大于 LIMIT |
| `returned_rows`（pivot preview） | 本响应**实际返回行数** |
| `row_count`（duckdb execute） | 当前结果集行数（与返回 `data` 长度一致） |
| `preview_limit_applied` | 预览且服务端自动追加 LIMIT 时为整数，否则 `null` |
| `header`（URL 导入请求体） | 是否有表头；**不是** `has_header` |

## 11.1 类型与 cast 契约（v1.2.1 起）

- **cast 目标白名单**：`left_cast`/`right_cast`（JOIN 条件）、`typeConversion`（pivot value，`'auto'` 哨兵除外）、`resolved_casts[].cast`（pivot）最终原样拼进 `TRY_CAST(... AS X)`，统一经 `core.common.duckdb_types.validate_cast_type` 校验——只接受 **DuckDB 规范标量类型**（别名如 `text`/`int8` 会归一到 `VARCHAR`/`BIGINT` 规范拼写返回）或完整 `DECIMAL(p,s)`（`p≤38`、`s≤p`）；**裸 `DECIMAL` 拒绝**（隐性 `DECIMAL(18,3)` 有损），非法值 400/422。
- **粘贴板 `column_types`**：`VARCHAR`/`INTEGER`(实落 BIGINT)/`DECIMAL`(标度按列内数据推断，全整数列落 BIGINT，混杂列保 VARCHAR)/`DOUBLE`/`DATE`(按内容定型：纯日期→DATE、含时间→TIMESTAMP、非日期内容→VARCHAR、全空列→TIMESTAMP+NULL)/`BOOLEAN`。
- **类型名归一**：前端 `utils/duckdbTypes.ts` 与后端 `core.common.duckdb_types` 为镜像模块，MySQL `datetime`/`bigint unsigned`、PG `timestamp without time zone` 等源库原生名在判定前归一为 DuckDB 规范名；两侧词表改动必须同步。

## 12. Git / 发布注意

同一契约字段变更：优先 **同一 PR** 内后端返回 + 前端消费；若分开发布，在本表增加「最低前端/后端版本」备注。
