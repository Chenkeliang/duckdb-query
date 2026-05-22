# 前后端 API 契约（真相表）

> **维护规则**：增删响应字段时先更新本表，再改 Pydantic / TypeScript 与调用方（与 [`AGENTS.md`](../AGENTS.md) §9.5 顺序一致）。  
> **环境说明**：若网关或代理改写 JSON，以浏览器 Network 实际响应为准；本表以仓库内 FastAPI 路由与 `create_success_response` / `create_list_response` 为准。  
> **调用图**：阶段 A [`API_URL_IMPORT_CALL_MAP.md`](API_URL_IMPORT_CALL_MAP.md)、B [`API_PHASE_B_CALL_MAP.md`](API_PHASE_B_CALL_MAP.md)、C [`API_PHASE_C_CALL_MAP.md`](API_PHASE_C_CALL_MAP.md)。

## 0. 部署与 API 入口

| 模式 | 前端访问 | 后端 API | 浏览器请求路径 |
|------|----------|----------|----------------|
| **Docker（推荐）** | http://localhost:3000 | 容器内 `:8000`；文档 http://localhost:8001/docs | 相对路径 `/api/...` → nginx → `backend:8000` |
| **本地开发** | http://localhost:5173（Vite 默认） | `uvicorn` → http://localhost:8000 | Vite `proxy` 将 `/api` 转到 `:8000` |

两种模式共用 `frontend/src/api/*`；**无**路径重写。用户查询主路径为 `POST /api/duckdb/execute` 与 `POST /api/duckdb/federated-query`，**不是** `POST /api/execute_sql`。

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
| 400 | `URL_INVALID` | `GET /api/url_info` / `POST /api/read_from_url` 无法访问或格式无效 URL |
| 400 | `VISUAL_QUERY_INVALID` | 可视化 generate / preview 业务配置校验失败 |
| 400 | `CONNECTION_TEST_FAILED` | `POST .../databases/test`、保存后测试失败、`refresh` 测试失败 |
| 400 | `SECURITY_ERROR` | 服务器浏览路径为符号链接 |
| 403 | `AUTHORIZATION_ERROR` | 服务器目录无读权限 |
| 404 | `RESOURCE_NOT_FOUND` | 数据源 id、分块上传会话、DuckDB 表、联邦 `attach_databases[].connection_id` |
| 404 | `FAVORITE_NOT_FOUND` | SQL 收藏 id 不存在 |
| 404 | `QUERY_NOT_FOUND` | 同步查询取消时无对应 `X-Request-ID` 会话 |
| 413 | `FILE_TOO_LARGE` | 分块 `init` 超过 `max_file_size` |
| 499 | `QUERY_CANCELLED` | 同步 DuckDB / 联邦查询取消（`X-Request-ID`） |
| 500 | `QUERY_FAILED` | DuckDB `execute` / 联邦 SQL 执行失败 |
| 503 | `DATABASE_CONNECTION_ERROR` | 联邦查询 ATTACH 外部库失败 |
| 500 | `OPERATION_FAILED` | 数据源 CRUD 列表、粘贴保存、分块完成、服务器导入、迁移/错误统计、快捷键列表加载失败 |
| 500 | `URL_READ_FAILED` | `POST /api/read_from_url` 处理失败 |
| 500 | `SHORTCUT_UPDATE_FAILED` / `SHORTCUT_RESET_FAILED` | 快捷键更新 / 重置持久化失败 |

§4–§5 端点错误码以本表为准；成功体形状不变。

## 2. 查询与 DuckDB（`queryApi.ts` / `tableApi.ts`）

| 方法 | 路径 | 成功体 | `data` 要点 | 前端入口 |
|------|------|--------|-------------|----------|
| POST | `/api/duckdb/execute` | 对象 | `executeDuckDBSQL`；499 `QUERY_CANCELLED`；500 `QUERY_FAILED`（§1.1） |
| POST | `/api/duckdb/federated-query` | 对象 | `executeFederatedQuery`；404 `connection_id`；503 ATTACH；499 / 500 同 execute |
| POST | `/api/query/cancel/{request_id}` | 对象 | `cancelSyncQuery`；404 `QUERY_NOT_FOUND`（无活跃同步查询） |
| POST | `/api/save_query_to_duckdb` | 对象 | 保存结果表元数据（依请求） | `saveQueryToDuckDB` |
| GET | `/api/duckdb/tables` | **列表** | `items[]`: `table_name`, `row_count`, `column_count`, `created_at` | `getDuckDBTables` |
| GET | `/api/duckdb/tables/{name}` | 对象 | 表详情 / `table` 包装 | `getDuckDBTableDetail` |
| DELETE | `/api/duckdb/tables/{name}` | 对象 | `deleted_table` | `deleteDuckDBTable` |
| POST | `/api/duckdb/table/{name}/refresh` | 对象 | `table`, `refreshed` | `refreshDuckDBTableMetadata` |
| GET | `/api/duckdb/pool/status` | 对象 | `pool_status`, `timestamp` | `getConnectionPoolStatus` |
| POST | `/api/duckdb/pool/reset` | 对象 | 依后端 | `resetConnectionPool` |

## 3. 外部库元数据（`databaseSchemasApi.ts` / `tableApi.ts`）

| 方法 | 路径 | 成功体 | `data` 要点 | 前端入口 |
|------|------|--------|-------------|----------|
| GET | `/api/databases/{id}/schemas` | **列表** | `items[]`: `{ name, table_count? }` | `listConnectionSchemas`；404 连接不存在 |
| GET | `/api/databases/{id}/schemas/{schema}/tables` | **列表** | `listSchemaTablesForConnection`；400 非 PostgreSQL / 缺用户名 |
| GET | `/api/database_tables/{id}` | 对象 | `tables[]`（非 `items`） | `listConnectionTablesFlat`；404 / 400 不支持库类型 |
| GET | `/api/datasources/databases/{id}/tables/detail` | 对象 | 表详情 canonical（`table_name`, `schema?`）；经 `CatalogService` | `getExternalTableDetail` |
| GET | `/api/database_table_details/{id}/{table}` | 对象 | 同上（**deprecated**，代理 canonical） | `getExternalDatabaseTableDetails` |

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

## 5. 文件与导入（`fileApi.ts`）

**`import_mode`（可选，默认 `auto`）**：`auto` = 先 `all_varchar` / 字面量读入再 `promote_table_column_types_from_varchar`（ID 列保持 VARCHAR，不升为 DOUBLE）；`literal` = 全列 VARCHAR、不 promote。  
请求字段名：`import_mode`（Form 或 JSON）。前端类型：`FileImportMode`（`fileApi.ts`），上传面板 `UploadPanel` 状态 `importMode`。

| 方法 | 路径 | `import_mode` | 前端入口 |
|------|------|---------------|----------|
| POST | `/api/upload` | Form | `uploadFile`, `uploadFileEnhanced`；400 `VALIDATION_ERROR`/`SECURITY_ERROR`/`FILE_TYPE_NOT_SUPPORTED` |
| POST | `/api/upload/init` | Form | `initChunkedUpload`；413 `FILE_TOO_LARGE`（§1.1） |
| POST | `/api/upload/complete` | 会话 | `completeChunkedUpload`；404 会话 / 400 未完成（§1.1） |
| POST | `/api/data-sources/excel/import` | JSON body | `importExcelSheets`；404 `FILE_NOT_FOUND`；500 `EXCEL_IMPORT_FAILED` |
| POST | `/api/server-files/import` | JSON body | `importServerFile` |
| POST | `/api/server-files/excel/import` | JSON body | `importServerExcelSheets` |
| POST | `/api/read_from_url` | JSON `import_mode?` | `readFromUrl`；400 `URL_INVALID`；500 `URL_READ_FAILED`（§1.1） |
| POST | `/api/upload/chunk` | — | `uploadChunk` |
| DELETE | `/api/upload/cancel/{upload_id}` | — | `cancelChunkedUpload`；404 会话（§1.1） |
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
| POST | `/api/async-tasks` | 对象 | `submitAsyncQuery`（`task_id`；可 `attach_databases` 或由 `datasource` 推导）；400 空 SQL / attach 校验 |
| POST | `/api/async-tasks/{id}/cancel` | 对象 | `cancelAsyncTask`；404 任务不存在；400 `TASK_CANCEL_NOT_ALLOWED` |
| POST | `/api/async-tasks/{id}/retry` | 对象 | `retryAsyncTask`；404 / 400 缺 SQL |
| POST | `/api/async-tasks/{id}/download` | **blob** 或 JSON 错误体 | `downloadAsyncResult`（体：`format`）；400 格式；404 文件 |
| GET | `/api/errors/statistics` | 对象 | `getErrorStatistics` |
| POST | `/api/errors/clear` | 对象 | `clearOldErrors`（query: `days`） |

## 7. 可视化查询与收藏（`visualQueryApi.ts`）

| 方法 | 路径 | 成功体 | 前端入口 |
|------|------|--------|----------|
| POST | `/api/visual-query/generate` | 对象 | `generateVisualQuery`, `generatePivotVisualQuery`；400 `VISUAL_QUERY_INVALID`；500 `OPERATION_FAILED` |
| POST | `/api/visual-query/preview` | 对象 | `previewVisualQuery`, `previewPivotVisualQuery`；400 `VISUAL_QUERY_INVALID`；499 `QUERY_CANCELLED`；500 `OPERATION_FAILED` |
| GET | `/api/visual-query/column-stats/{table}/{column}` | 对象 | 列统计；404 `RESOURCE_NOT_FOUND`；500 `OPERATION_FAILED` |
| POST | `/api/visual-query/distinct-values` | 对象 | Top-N 去重；400 校验；499 取消；500 `QUERY_FAILED` |
| POST | `/api/visual-query/validate` | 对象 | 配置校验（`is_valid` 在 `data`）；400 解析失败；500 服务异常 |
| GET | `/api/sql-favorites` | **列表** | `listSqlFavorites` |
| GET | `/api/sql-favorites/{id}` | 对象 | `getSqlFavorite`（`data.favorite`）；404 `FAVORITE_NOT_FOUND` |
| POST | `/api/sql-favorites` | 对象 | `createSqlFavorite`；400 `FAVORITE_NAME_EXISTS` |
| PUT | `/api/sql-favorites/{id}` | 对象 | `updateSqlFavorite`；404 `FAVORITE_NOT_FOUND` |
| DELETE | `/api/sql-favorites/{id}` | 对象 | `deleteSqlFavorite`；404 `FAVORITE_NOT_FOUND` |
| POST | `/api/sql-favorites/{id}/use` | 对象 | `incrementFavoriteUsage`；404 `FAVORITE_NOT_FOUND` |
| GET | `/api/app-config/features` | 对象 | `getAppConfig` |

**纯前端**：`validateVisualQueryConfig` 无 HTTP。**后端有、未封装**：`POST /api/visual-query/distinct-values`、`POST /api/visual-query/validate`。

## 8. 设置（`settingsShortcutsApi.ts`）

| 方法 | 路径 | 成功体 | 前端入口 |
|------|------|--------|----------|
| GET | `/api/settings/shortcuts` | 对象 | `fetchShortcutsConfig`（`shortcuts`, `defaults`）；500 `OPERATION_FAILED` |
| PUT | `/api/settings/shortcuts/{action_id}` | 对象 | `updateShortcutSetting`；400 无效 `action_id`；500 `SHORTCUT_UPDATE_FAILED` |
| POST | `/api/settings/shortcuts/reset` | 对象 | `resetShortcutsSetting`；400 无效 `action_id`；500 `SHORTCUT_RESET_FAILED` |

## 9. 集合运算（`setOperationsApi.ts`）

| 方法 | 路径 | 成功体 | 前端入口 |
|------|------|--------|----------|
| POST | `/api/set-operations/generate` | 对象 | `generateSetOperation`；400 `VALIDATION_ERROR`；500 `OPERATION_FAILED` |
| POST | `/api/set-operations/preview` | 对象 | `previewSetOperation`；400 / 500（同上） |
| POST | `/api/set-operations/validate` | 对象 | 配置校验（`is_valid` 在 `data`）；500 服务异常 |
| POST | `/api/set-operations/execute` | 对象 | 完整执行；400 / 500 |
| POST | `/api/set-operations/export` | 对象 | 异步导出任务；500 `OPERATION_FAILED` |

执行时前端在 generate 返回的 SQL 后追加 `LIMIT`（与 `maxQueryRows` 一致）；**preview** 端点 LIMIT 由后端 `max_query_rows` 控制，结果写入结果面板。

## 10. 已废弃 / 无前端引用

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/execute_sql` | **deprecated**；纯 DuckDB SQL 请求代理到 `POST /api/duckdb/execute`；其余场景请用 §2 |
| GET | `/api/duckdb_tables` | **deprecated**；委托 `GET /api/duckdb/tables` |
| DELETE | `/api/duckdb_tables/{name}` | **deprecated**；委托 `DELETE /api/duckdb/tables/{name}` |

## 11. 易混字段说明

| 字段 | 含义 |
|------|------|
| `row_count`（visual preview） | 与生成 SQL 匹配的**估算总行**，可能大于 LIMIT |
| `returned_rows`（visual preview） | 本响应**实际返回行数** |
| `row_count`（duckdb execute） | 当前结果集行数（与返回 `data` 长度一致） |
| `preview_limit_applied` | 预览且服务端自动追加 LIMIT 时为整数，否则 `null` |
| `header`（URL 导入请求体） | 是否有表头；**不是** `has_header` |

## 12. Git / 发布注意

同一契约字段变更：优先 **同一 PR** 内后端返回 + 前端消费；若分开发布，在本表增加「最低前端/后端版本」备注。
