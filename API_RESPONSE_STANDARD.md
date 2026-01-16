duckdb-query/API_RESPONSE_STANDARD.md
# API Response Standard（后端统一规范）

> 目标：所有接口统一结构，支撑前端中英切换（code-driven I18n），无兼容兜底逻辑，禁止裸返回。

## 1. 核心约束
- **必须包装**：所有返回（成功/失败/列表）都通过公共 helper 构造，禁止返回原始 dict/list/Pydantic/异常。
- **I18n 策略**：前端只依赖 `messageCode` 做翻译；`message` 仅兜底/调试。
- **业务错误返回 JSON**：业务类错误必须返回标准错误 JSON，不得裸抛通用异常。
- **时间戳必填**：所有响应包含 `timestamp`。
- **列表必须用 list helper**：分页或列表返回使用专用 helper，包含 `items`、`total`，可选 `page`、`pageSize`。

## 2. 成功响应（通用）
```json
{
  "success": true,
  "data": { "...": "..." },   // 对象、列表或 null
  "messageCode": "OPERATION_SUCCESS",
  "message": "Operation completed successfully",
  "timestamp": "2024-01-01T12:00:00Z"
}
```
- 使用：`create_success_response(data=..., messageCode=..., message=...)`

## 3. 列表响应（分页/集合）
```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "total": 100,
    "page": 1,         // 可选
    "pageSize": 20     // 可选
  },
  "messageCode": "ITEMS_RETRIEVED",
  "message": "Items retrieved successfully",
  "timestamp": "..."
}
```
- 使用：`create_list_response(items, total, page?, pageSize?, messageCode=..., message=...)`

## 4. 错误响应（统一结构）
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found",
    "details": { "id": "123" }   // 可选
  },
  "detail": "The requested resource was not found", // 兼容字段
  "messageCode": "RESOURCE_NOT_FOUND",
  "message": "The requested resource was not found",
  "timestamp": "..."
}
```
- 使用：`JSONResponse(status_code=..., content=create_error_response(code=..., message=..., details?=...))`
- 业务错误/校验错误/不存在/权限等都走此结构。

## 5. 禁止事项
- 禁止直接返回：`{...}`、`[...]`、Pydantic 实例、裸字符串/bytes。
- 禁止业务错误裸抛通用异常导致结构丢失。
- 禁止重复包装或遗漏 `timestamp`。
- 禁止将后端翻译文案写死在 `messageCode`（code 必须稳定且可枚举）。

## 6. 推荐 messageCode / error.code 枚举（示例，可落常量表）
- 通用：`OPERATION_SUCCESS`，`ITEMS_RETRIEVED`，`VALIDATION_ERROR`，`RESOURCE_NOT_FOUND`，`UNAUTHORIZED`，`FORBIDDEN`，`INTERNAL_ERROR`
- 异步任务：`ASYNC_TASK_SUBMITTED`，`ASYNC_TASK_LIST_RETRIEVED`，`ASYNC_TASK_DETAIL_RETRIEVED`，`ASYNC_TASK_CANCELLED`，`ASYNC_TASK_RETRIED`，`ASYNC_TASK_CLEANED`，`ASYNC_TASK_DOWNLOAD_READY`；错误：`ASYNC_TASK_NOT_FOUND`，`ASYNC_TASK_CANCEL_NOT_ALLOWED`，`ASYNC_TASK_RETRY_FAILED`，`DOWNLOAD_GENERATION_FAILED`
- 上传：`UPLOAD_INIT_SUCCESS`，`UPLOAD_CHUNK_ACCEPTED`，`UPLOAD_COMPLETED`，`UPLOAD_CANCELLED`；错误：`UPLOAD_SESSION_NOT_FOUND`，`UNSUPPORTED_FILE_TYPE`，`FILE_TOO_LARGE`，`HASH_MISMATCH`
- 数据源/连接：`DB_CONN_CREATED`，`DB_CONN_UPDATED`，`DB_CONN_DELETED`，`DB_CONN_LIST_RETRIEVED`，`DB_CONN_REFRESHED`，`DB_CONN_TESTED`；错误：`DB_CONNECTION_NOT_FOUND`，`UNSUPPORTED_DB_TYPE`
- DuckDB/查询：`QUERY_EXECUTED`，`QUERY_FAILED`，`TABLE_METADATA_RETRIEVED`，`TABLE_DELETED`，`POOL_STATUS_RETRIEVED`，`POOL_RESET`，`MIGRATION_DONE`
- 视觉查询/集合操作：`VISUAL_QUERY_GENERATED`，`VISUAL_QUERY_PREVIEWED`，`VISUAL_QUERY_VALIDATED`，`SET_OPERATION_GENERATED`，`SET_OPERATION_PREVIEWED`，`SET_OPERATION_EXECUTED`，`SET_OPERATION_EXPORTED`
- 粘贴/URL：`PASTE_SAVED`，`URL_LOADED`；错误：`URL_LOAD_FAILED`
- 收藏：`FAVORITE_SAVED`，`FAVORITE_UPDATED`，`FAVORITE_DELETED`，`FAVORITE_LIST_RETRIEVED`
- 服务器文件：`SERVER_FILE_LISTED`，`SERVER_FILE_IMPORTED`，`SERVER_EXCEL_INSPECTED`，`SERVER_EXCEL_IMPORTED`

## 7. 落地要求与检查清单
- 所有路由返回统一 helper；列表用 list helper。
- 所有错误使用 `JSONResponse+create_error_response`；包含 `error.code`、`messageCode`、`timestamp`。
- Pydantic 响应统一 `model.dict()` 后再包装。
- 全局异常处理：未捕获异常需落入标准错误结构，避免二次包装。
- 自测：为每个端点验证成功/失败路径结构正确，`messageCode` 正确，时间戳存在。