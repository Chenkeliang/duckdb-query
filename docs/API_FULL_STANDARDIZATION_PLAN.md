# API 全量标准化落地方案（后端）

> **版本**: 2.0  
> **最后更新**: 2026-01-23  
> **状态**: ✅ 大部分已完成  
> **目标**: 强制统一响应结构，支持前端中英切换（code-driven I18n），无兼容逻辑、无裸返回。

## 📋 更新说明

本文档记录了 API 标准化的实施计划和进度。大部分接口已完成标准化改造。

**最新规范文档**: [.kiro/steering/api-response-format-standard.md](../.kiro/steering/api-response-format-standard.md)

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

> **说明**: 
> - **✅ 已完成** = 已使用 response_helpers 标准化
> - **🔄 进行中** = 部分完成，需继续改造
> - **📋 待改造** = 尚未开始

### async_tasks.py（✅ 已完成）
- POST `/api/async-tasks` ✅
- GET `/api/async-tasks` ✅
- GET `/api/async-tasks/{task_id}` ✅
- POST `/api/async-tasks/{task_id}/cancel` ✅
- POST `/api/async-tasks/{task_id}/retry` ✅
- POST `/api/async-tasks/cleanup-stuck` ✅
- POST `/api/async-tasks/{task_id}/download` ✅

### duckdb_query.py（✅ 已完成）
- GET `/api/duckdb/tables` ✅
- GET `/api/duckdb/tables/detail/{table_name}` ✅
- POST `/api/duckdb/execute` ✅
- DELETE `/api/duckdb/tables/{table_name}` ✅
- POST `/api/duckdb/federated-query` ✅
- GET `/api/duckdb/pool/status` ✅
- POST `/api/duckdb/pool/reset` ✅

### datasources.py（✅ 已完成）
- POST `/databases/test` ✅
- POST `/databases/{id}/refresh` ✅
- POST `/databases` ✅
- PUT `/databases/{id}` ✅
- GET `/databases/list` ✅
- GET `/` ✅
- GET `/{id}` ✅
- DELETE `/{id}` ✅

### settings.py（✅ 已完成）
- GET `/shortcuts` ✅
- PUT `/shortcuts/{action_id}` ✅
- POST `/shortcuts/reset` ✅

### 其他路由（🔄 部分完成）
- chunked_upload.py - 🔄 部分使用标准格式
- database_tables.py - 🔄 部分使用标准格式
- paste_data.py - ✅ 已完成
- query.py - 🔄 部分使用标准格式
- sql_favorites.py - 📋 待改造
- url_reader.py - 📋 待改造
- server_files.py - ✅ 已完成

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

## 相关文档

- [API 响应格式标准（详细版）](../.kiro/steering/api-response-format-standard.md) - 完整的规范文档
- [API 响应格式标准（快速参考）](./API_RESPONSE_STANDARD.md) - 快速参考版本
- [国际化强制规范](../.kiro/steering/i18n-enforcement-standards.md) - MessageCode 和 i18n 机制
- [后端开发约束](../.kiro/steering/backend-constraints.md) - 后端开发规范

---

**最后更新**: 2026-01-23  
**维护者**: 项目团队