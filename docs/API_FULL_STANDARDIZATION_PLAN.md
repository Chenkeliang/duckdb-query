# API 全量标准化落地方案（后端）

> 目标：强制统一响应结构，支持前端中英切换（code-driven I18n），无兼容逻辑、无裸返回。

## 统一规范（摘要）
- **成功响应**：`create_success_response(data=..., messageCode=..., message=..., timestamp=...)`
- **列表响应**：`create_list_response(items, total, page?, pageSize?, messageCode=..., message=..., timestamp=...)`
- **错误响应**：`JSONResponse(status_code=..., content=create_error_response(code=..., message=..., details?=..., messageCode同code, timestamp=...))`
- **禁止**：直接返回 dict/list/Pydantic；业务错误直接 `HTTPException` 裸抛；重复包装或缺失 `timestamp`。
- **I18n**：前端只以 `messageCode` 做翻译；`message` 为兜底/调试。
- **错误中台**：未捕获异常统一落入标准错误结构（需检查全局异常处理避免二次包装）。

## 推荐 messageCode / error.code（示例，可落表/Enum）
- 通用：`OPERATION_SUCCESS`，`ITEMS_RETRIEVED`，`VALIDATION_ERROR`，`RESOURCE_NOT_FOUND`，`UNAUTHORIZED`，`FORBIDDEN`，`INTERNAL_ERROR`
- 异步任务：`ASYNC_TASK_SUBMITTED`，`ASYNC_TASK_LIST_RETRIEVED`，`ASYNC_TASK_DETAIL_RETRIEVED`，`ASYNC_TASK_CANCELLED`，`ASYNC_TASK_RETRIED`，`ASYNC_TASK_CLEANED`，`ASYNC_TASK_DOWNLOAD_READY`；错误：`ASYNC_TASK_NOT_FOUND`，`ASYNC_TASK_CANCEL_NOT_ALLOWED`，`ASYNC_TASK_RETRY_FAILED`，`DOWNLOAD_GENERATION_FAILED`
- 上传：`UPLOAD_INIT_SUCCESS`，`UPLOAD_CHUNK_ACCEPTED`，`UPLOAD_COMPLETED`，`UPLOAD_CANCELLED`；错误：`UPLOAD_SESSION_NOT_FOUND`，`UNSUPPORTED_FILE_TYPE`，`FILE_TOO_LARGE`，`HASH_MISMATCH`
- 数据源/连接：`DB_CONN_CREATED`，`DB_CONN_UPDATED`，`DB_CONN_DELETED`，`DB_CONN_LIST_RETRIEVED`，`DB_CONN_REFRESHED`，`DB_CONN_TESTED`；错误：`DB_CONNECTION_NOT_FOUND`，`UNSUPPORTED_DB_TYPE`
- DuckDB/查询：`QUERY_EXECUTED`，`QUERY_FAILED`，`TABLE_METADATA_RETRIEVED`，`TABLE_DELETED`，`POOL_STATUS_RETRIEVED`，`POOL_RESET`，`MIGRATION_DONE`
- 视觉查询/集合操作：`VISUAL_QUERY_GENERATED`，`VISUAL_QUERY_PREVIEWED`，`VISUAL_QUERY_VALIDATED`，`SET_OPERATION_GENERATED`，`SET_OPERATION_PREVIEWED`，`SET_OPERATION_EXECUTED`，`SET_OPERATION_EXPORTED`
- 粘贴/URL：`PASTE_SAVED`，`URL_LOADED`；错误：`URL_LOAD_FAILED`
- 收藏：`FAVORITE_SAVED`，`FAVORITE_UPDATED`，`FAVORITE_DELETED`，`FAVORITE_LIST_RETRIEVED`
- 服务器文件：`SERVER_FILE_LISTED`，`SERVER_FILE_IMPORTED`，`SERVER_EXCEL_INSPECTED`，`SERVER_EXCEL_IMPORTED`

## 路由覆盖清单与整改状态
> 说明：**需改造** = 存在裸返回或裸 `HTTPException`；**已合规** = 文档/代码已用 helper；**待确认** = 未仔细核验深层分支。

### async_tasks.py（需改造）
- POST `/api/async-tasks`
- GET `/api/async-tasks`
- GET `/api/async-tasks/{task_id}`
- POST `/api/async-tasks/{task_id}/cancel`
- POST `/api/async-tasks/{task_id}/retry`
- POST `/api/async-tasks/cleanup-stuck`
- POST `/api/async-tasks/{task_id}/download`
- 后台执行/下载异常需标准错误；response_model Pydantic 需改为包装后的 dict。

### chunked_upload.py（需改造）
- POST `/api/upload/init`
- POST `/api/upload/chunk`
- POST `/api/upload/complete`
- DELETE `/api/upload/cancel/{upload_id}`
- 所有路径成功改用 success/list helper，业务错误统一 error helper。

### database_tables.py（需改造）
- GET `/api/datasources/databases/{connection_id}/tables`
- GET `/api/database_tables/{connection_id}`
- GET `/api/datasources/databases/{connection_id}/schemas`
- GET `/api/databases/{connection_id}/schemas`
- GET `/api/datasources/databases/{connection_id}/schemas/{schema}/tables`
- GET `/api/databases/{connection_id}/schemas/{schema}/tables`
- GET `/api/datasources/databases/{connection_id}/tables/detail`
- GET `/api/database_table_details/{connection_id}/{table_name}`
- 全部返回统一包装，连接不存在/类型不支持/参数缺失走 error helper。

### duckdb_query.py（需改造）
- GET `/api/duckdb/tables`
- GET `/api/duckdb/tables/detail/{table_name}`
- GET `/api/duckdb/tables/{table_name}`（别名）
- POST `/api/duckdb/table/{table_name}/refresh`
- POST `/api/duckdb/execute`
- DELETE `/api/duckdb/tables/{table_name}`
- GET `/api/duckdb/pool/status`
- POST `/api/duckdb/pool/reset`
- POST `/api/duckdb/migrate/created_at`
- GET `/api/errors/statistics`
- POST `/api/errors/clear`
- POST `/api/duckdb/federated-query`
- 所有返回需 helper；错误需 JSONResponse + error helper。

### paste_data.py（需改造）
- POST `/api/paste-data`
- 现有返回/错误需统一包装。

### query.py（需改造）
- Visual Query：
  - POST `/api/visual-query/generate`
  - POST `/api/visual-query/preview`
  - POST `/api/visual-query/distinct-values`
  - GET `/api/visual-query/column-stats/{table_name}/{column_name}`
  - POST `/api/visual-query/validate`
- Query：
  - POST `/api/query`
  - POST `/api/execute_sql`
  - POST `/api/save_query_to_duckdb`
  - GET `/api/duckdb_tables`
  - DELETE `/api/duckdb_tables/{table_name}`
- Set Operations：
  - POST `/api/set-operations/generate`
  - POST `/api/set-operations/preview`
  - POST `/api/set-operations/validate`
  - POST `/api/set-operations/execute`
  - POST `/api/set-operations/simple-union`
  - POST `/api/set-operations/export`
- 全部 Pydantic 返回改为 dict + success helper；错误统一 error helper。

### query_cancel.py（需改造）
- POST `/api/query/cancel/{request_id}`
- 检查返回/错误统一 helper。

### sql_favorites.py（需改造）
- GET `/api/sql-favorites`
- POST `/api/sql-favorites`
- PUT `/api/sql-favorites/{favorite_id}`
- DELETE `/api/sql-favorites/{favorite_id}`
- POST `/api/sql-favorites/{favorite_id}/use`
- 成功/错误均需 helper。

### url_reader.py（需改造）
- POST `/api/read_from_url`
- GET `/api/url_info`
- 包装成功与错误（URL 不可达、类型不支持等）。

### data_sources.py（多数旧/废弃端点，需统一）
- Deprecated 端点（仍需标准结构）：
  - POST `/api/database_connections/test`
  - POST `/api/database_connections/{connection_id}/refresh`
  - POST `/api/test_connection_simple`
  - POST `/api/database_connections`
  - GET `/api/database_connections`
  - GET `/api/database_connections/{connection_id}`
  - PUT `/api/database_connections/{connection_id}`
  - DELETE `/api/database_connections/{connection_id}`
  - POST `/api/database/connect`
- 其他：
  - POST `/api/upload`（上传文件）
  - POST `/api/data-sources/excel/inspect`
  - POST `/api/data-sources/excel/import`
- 全部需 success/error helper；弃用端点同样保持标准格式。

### datasources.py（新式统一数据源，需确认是否已合规）
- POST `/databases/test`
- POST `/databases/{id}/refresh`
- POST `/databases`
- PUT `/databases/{id}`
- GET `/databases/list`
- GET `/files/list`
- GET `/` （`/datasources` 根，列表）
- GET `/{id}`
- DELETE `/{id}`
- 当前文件部分已用 helper，但需全面确认无裸返回/HTTPException。

### config_api.py（标记已合规，仍需复核深层）
- GET `/api/app-config/features`
- 检查是否全路径都用 helper。

### server_files.py（文档标记合规，需复核深层）
- GET `/api/server-files/mounted`
- GET `/api/server-files/browse`
- POST `/api/server-files/import`
- POST `/api/server-files/excel/inspect`
- POST `/api/server-files/excel/import`
- 检查异常处理是否统一。

### settings.py（标记合规）
- GET `/shortcuts`
- PUT `/shortcuts/{action_id}`
- POST `/shortcuts/reset`
- 确认均使用 helper（文件中已有）。

### async 补充：query_proxy.py
- 当前无路由装饰器，无需改造（仅代理模型定义）。

## 落地步骤（建议执行顺序）
1. **集中枚举 messageCode/error.code**：在 utils/常量文件中定义，前后端共享。
2. **批量整改非合规文件**：async_tasks、chunked_upload、database_tables、duckdb_query、paste_data、query、query_cancel、sql_favorites、url_reader、data_sources（含废弃端点）。
3. **复核“已合规/待确认”文件**：datasources.py、config_api.py、server_files.py 深层分支。
4. **全局异常处理检查**：确保未捕获异常落入标准错误；避免已标准化响应被二次包装。
5. **自测清单**：对每个端点验证成功/失败路径均返回标准结构（含 timestamp, messageCode）。

## 验收标准
- 任意端点响应结构满足规范；无裸 dict/list/Pydantic/HTTPException。
- 所有错误路径返回 `success=false` 且包含 `error.code`、`messageCode`、`timestamp`。
- 列表端点使用 `create_list_response`，分页信息正确。
- 前端仅依赖 `messageCode` 完成中英切换，无需解析 message 文本。