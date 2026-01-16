duckdb-query/API_STANDARDIZATION_FULL_PLAN.md
# API 全链路标准化技术方案（后端+前端）

> 目标：统一所有接口响应结构，支持 code-driven I18n，消除兼容逻辑与裸返回，降低前后端耦合和维护成本。本方案覆盖规范、错误码、后端改造、前端适配、联调与验收、自测与边界处理。

---

## 0. 术语与约定
- **标准成功**：`create_success_response(data=..., messageCode=..., message=..., timestamp=...)`
- **标准列表**：`create_list_response(items, total, page?, pageSize?, messageCode=..., message=..., timestamp=...)`
- **标准错误**：`JSONResponse(status_code=..., content=create_error_response(code=..., message=..., details?=..., messageCode同code, timestamp=...))`
- **禁止**：裸 dict/list/Pydantic/字符串返回；业务错误裸抛；重复包装；遗漏 timestamp。
- **I18n**：前端仅依赖 `messageCode` 做翻译；`message` 为兜底/调试。

---

## 1. 后端统一规范细则
1. 所有路由返回必须经 helper，列表场景必须用 list helper。
2. Pydantic 模型返回需 `.dict()` 后包装。
3. 业务错误/校验错误/不存在/权限等，统一 `JSONResponse + create_error_response`；不得裸 `HTTPException`（可内部短路，但对外输出必须标准结构）。
4. `timestamp` 必填；`messageCode` 必填且稳定、可枚举。
5. 避免全局异常处理中对已标准化响应二次包装；未捕获异常落入标准错误结构（`INTERNAL_ERROR`）。
6. 下载/流式接口：成功直接返回文件流；错误必须返回标准错误 JSON（前端需能解析 blob 中的 JSON）。

---

## 2. 推荐 messageCode / error.code 基线（可落常量表/Enum）
- 通用：`OPERATION_SUCCESS`，`ITEMS_RETRIEVED`，`VALIDATION_ERROR`，`RESOURCE_NOT_FOUND`，`UNAUTHORIZED`，`FORBIDDEN`，`INTERNAL_ERROR`
- 异步任务：`ASYNC_TASK_SUBMITTED`，`ASYNC_TASK_LIST_RETRIEVED`，`ASYNC_TASK_DETAIL_RETRIEVED`，`ASYNC_TASK_CANCELLED`，`ASYNC_TASK_RETRIED`，`ASYNC_TASK_CLEANED`，`ASYNC_TASK_DOWNLOAD_READY`；错误：`ASYNC_TASK_NOT_FOUND`，`ASYNC_TASK_CANCEL_NOT_ALLOWED`，`ASYNC_TASK_RETRY_FAILED`，`DOWNLOAD_GENERATION_FAILED`
- 上传：`UPLOAD_INIT_SUCCESS`，`UPLOAD_CHUNK_ACCEPTED`，`UPLOAD_COMPLETED`，`UPLOAD_CANCELLED`；错误：`UPLOAD_SESSION_NOT_FOUND`，`UNSUPPORTED_FILE_TYPE`，`FILE_TOO_LARGE`，`HASH_MISMATCH`
- 数据源/连接：`DB_CONN_CREATED`，`DB_CONN_UPDATED`，`DB_CONN_DELETED`，`DB_CONN_LIST_RETRIEVED`，`DB_CONN_REFRESHED`，`DB_CONN_TESTED`；错误：`DB_CONNECTION_NOT_FOUND`，`UNSUPPORTED_DB_TYPE`
- DuckDB/查询：`QUERY_EXECUTED`，`QUERY_FAILED`，`TABLE_METADATA_RETRIEVED`，`TABLE_DELETED`，`POOL_STATUS_RETRIEVED`，`POOL_RESET`，`MIGRATION_DONE`
- 视觉查询/集合操作：`VISUAL_QUERY_GENERATED`，`VISUAL_QUERY_PREVIEWED`，`VISUAL_QUERY_VALIDATED`，`SET_OPERATION_GENERATED`，`SET_OPERATION_PREVIEWED`，`SET_OPERATION_EXECUTED`，`SET_OPERATION_EXPORTED`
- 粘贴/URL：`PASTE_SAVED`，`URL_LOADED`；错误：`URL_LOAD_FAILED`
- 收藏：`FAVORITE_SAVED`，`FAVORITE_UPDATED`，`FAVORITE_DELETED`，`FAVORITE_LIST_RETRIEVED`
- 服务器文件：`SERVER_FILE_LISTED`，`SERVER_FILE_IMPORTED`，`SERVER_EXCEL_INSPECTED`，`SERVER_EXCEL_IMPORTED`

---

## 3. 后端逐文件改造要求（路由 -> 预期返回 -> 关键错误码）
### async_tasks.py
- 接口：提交/列表/详情/取消/重试/cleanup/download。
- 成功：统一 success/list helper；download 成功为文件流。
- 错误：不存在 `ASYNC_TASK_NOT_FOUND`；取消不允许 `ASYNC_TASK_CANCEL_NOT_ALLOWED`；下载失败 `DOWNLOAD_GENERATION_FAILED`；校验 `VALIDATION_ERROR`。
- Pydantic response_model 改为 dict 包装。

### chunked_upload.py
- 接口：init/chunk/complete/cancel。
- 成功：success/list helper。
- 错误：`UPLOAD_SESSION_NOT_FOUND`、`UNSUPPORTED_FILE_TYPE`、`FILE_TOO_LARGE`、`HASH_MISMATCH`、`VALIDATION_ERROR`。

### database_tables.py
- 接口：表列表、schema 列表、表详情（含别名路径）。
- 成功：success/list；items/total；详情在 data。
- 错误：`DB_CONNECTION_NOT_FOUND`、`UNSUPPORTED_DB_TYPE`、`VALIDATION_ERROR`、`RESOURCE_NOT_FOUND`（表）。

### duckdb_query.py
- 接口：表列表/详情/删除/刷新、execute、pool status/reset、迁移、错误统计、联邦查询。
- 成功：统一包装；查询返回 data（rows/columns/row_count 等）。
- 错误：`QUERY_FAILED`、`RESOURCE_NOT_FOUND`（表）、`UNSUPPORTED_DB_TYPE`、`POOL_RESET_FAILED`、`VALIDATION_ERROR`、`INTERNAL_ERROR`。

### paste_data.py
- 接口：POST /api/paste-data。
- 成功：返回保存结果 data。
- 错误：`VALIDATION_ERROR`、`QUERY_FAILED`。

### query.py
- 接口：视觉查询生成/预览/校验/统计；通用查询 `/api/query`；`/api/execute_sql`；`/api/save_query_to_duckdb`；DuckDB 表列表/删除；集合操作生成/预览/校验/执行/导出。
- 成功：统一包装；预览/生成类返回 data 中的 sql/rows/columns。
- 错误：`QUERY_FAILED`、`VALIDATION_ERROR`、`RESOURCE_NOT_FOUND`、`UNSUPPORTED_DB_TYPE`。

### query_cancel.py
- 接口：取消同步查询。
- 成功：包装。
- 错误：`RESOURCE_NOT_FOUND`、`OPERATION_NOT_ALLOWED`。

### sql_favorites.py
- 接口：列表/新增/更新/删除/使用。
- 成功：列表用 list；其余用 success。
- 错误：`RESOURCE_NOT_FOUND`、`VALIDATION_ERROR`（重名）。

### url_reader.py
- 接口：read_from_url、url_info。
- 成功：包装 data（表元数据）。
- 错误：`URL_LOAD_FAILED`、`UNSUPPORTED_FILE_TYPE`、`FILE_TOO_LARGE`。

### data_sources.py（含 deprecated）
- 接口：旧连接 CRUD/测试/刷新、upload、excel inspect/import。
- 成功：统一包装。
- 错误：`DB_CONNECTION_NOT_FOUND`、`UNSUPPORTED_DB_TYPE`、`VALIDATION_ERROR`。

### datasources.py（新式统一数据源）
- 接口：/databases*、/files/list、/datasources*。
- 确保全部包装；错误同数据源类错误码。

### config_api.py
- 接口：app-config/features。
- 确认使用 success。

### server_files.py
- 接口：mounted/browse/import/excel inspect&import。
- 成功：包装；列表/导入结果在 data。
- 错误：`RESOURCE_NOT_FOUND`、`UNSUPPORTED_FILE_TYPE`、`VALIDATION_ERROR`。

### settings.py
- 接口：shortcuts 获取/更新/重置。
- 成功：包装；错误：`VALIDATION_ERROR`、`RESOURCE_NOT_FOUND`。

---

## 4. 前端适配方案（必须改造）
### 4.1 公共客户端与类型
- `client.ts`
  - 增加 `normalizeResponse<T>(res)`：返回 `{ data, items?, total?, page?, pageSize?, messageCode, message, timestamp, raw: res.data }`，兼容列表包装。
  - 升级错误处理：读取 `error.code`、`messageCode`、`error.details`；优先基于 `messageCode` 做 i18n，`message` 兜底；支持从 blob 解析 JSON 错误。
- `types.ts`
  - 新增 `StandardSuccess<T>`、`StandardList<T>`、`StandardError`，包含 `messageCode`、`timestamp`、`error`。
  - 替换旧的 `ApiResponse` 定义；分页类型改用 `data.items/total`。

### 4.2 各 API 模块适配
- `asyncTaskApi.ts`：列表/详情/提交/取消/重试用 `normalizeResponse`，下载错误解析 blob JSON。
- `queryApi.ts`：execute/federated/query/set-ops 等全部用 `normalizeResponse`，数据从 data 取；错误 `messageCode`。
- `visualQueryApi.ts`：生成/预览/校验/统计用 `normalizeResponse`。
- `dataSourceApi.ts`：列表/CRUD/测试用 `normalizeResponse`；列表从 `data.items/total` 取。
- `tableApi.ts`、`fileApi.ts`（如有）：同理。
- `sqlFavorites`/`urlReader`/`pasteData` 相关模块：统一解包和错误处理。
- 所有调用者使用 `messageCode` 走 i18n，`message` 兜底。

### 4.3 UI 层
- 文案显示基于 `messageCode` -> i18n 资源（`errors.*`/`success.*`），不再依赖后端 message。
- Loading/Error 状态仅依赖 `success` / `error.code` / `messageCode` / `data`。

---

## 5. 联调与验收
1) 后端完成改造并统一 `messageCode` 常量；前端引入同名单表做映射。
2) 用 Postman/自动化脚本对所有端点验证成功/错误路径：
   - 检查字段：`success`、`data`/`data.items`、`messageCode`、`message`、`timestamp`。
   - 错误路径：校验错误、资源不存在、权限/超时（如有）、下载失败。
3) 前端自测：核对 `normalizeResponse` 输出是否稳定，错误提示是否走 `messageCode`，下载错误能解析。
4) 回归 UI：分页、提示、空态、错误态均正常。

---

## 6. 边界与特殊处理
- **下载接口错误**：若返回 blob，前端需尝试将 blob 转为文本并 JSON 解析，再走标准错误处理。
- **列表字段兼容**：后端必须保证 list helper 输出 `items/total`，可选 `page/pageSize`；前端如未提供分页字段时默认由调用方自行计算。
- **Pydantic 兼容**：后端禁止直接返回模型实例；统一 `.dict()` 后包装。
- **全局异常**：防止二次包装；对未捕获异常统一 `INTERNAL_ERROR`。
- **Deprecated 接口**：即使标记废弃，也需标准结构，以免旧前端崩溃。
- **超时/取消**：联邦查询/长查询取消时，错误码可用 `TIMEOUT`/`QUERY_FAILED`/`ASYNC_TASK_CANCEL_NOT_ALLOWED` 等；前端据此提示。
- **I18n 稳定性**：`messageCode` 不得频繁变动，新增接口必须登记枚举。

---

## 7. 落地步骤（推荐顺序）
1) 后端：落地 `messageCode` 常量表；改造 helper 使用和路由输出；检查全局异常处理。
2) 前端：升级 `client.ts`（normalizeResponse/错误解析）+ `types.ts`（标准类型）。
3) 前端：批量改造 API 模块，替换返回解包逻辑；更新 i18n 资源。
4) 联调与全量自测；修正边界（下载错误、分页、空态）。
5) 文档：`API_RESPONSE_STANDARD.md`、`API_FULL_STANDARDIZATION_PLAN.md`、本文件同步维护。

---

## 8. 验收标准
- 任一端点：成功返回包含 `success=true`、`data`（或 `data.items/total`）、`messageCode`、`timestamp`；错误返回 `success=false`、`error.code`、`messageCode`、`timestamp`。
- 前端：所有 API 通过 `normalizeResponse` 解包，错误通过 `messageCode` 映射；UI 不再依赖后端 message，`message` 仅兜底。
- 下载错误可正确提示；分页数据正确；空态/错误态 UI 正常。
- `messageCode` 集中管理，前后端一致。

---

## 9. 附：接口覆盖清单（便于对照改造）
- async_tasks.py：提交/列表/详情/取消/重试/cleanup/download
- chunked_upload.py：init/chunk/complete/cancel
- database_tables.py：表列表/schema 列表/表详情
- duckdb_query.py：表列表/详情/删除/刷新/execute/pool/migrate/errors/federated
- paste_data.py：粘贴保存
- query.py：visual-query 全套、/api/query、/api/execute_sql、/api/save_query_to_duckdb、duckdb_tables、set-operations 全套
- query_cancel.py：取消同步查询
- sql_favorites.py：列表/增/改/删/使用
- url_reader.py：read_from_url、url_info
- data_sources.py：旧连接 CRUD/测试/刷新、upload、excel inspect/import
- datasources.py：新式数据源 /databases*、/files/list、/datasources*
- config_api.py：app-config/features
- server_files.py：mounted/browse/import/excel inspect/import
- settings.py：shortcuts 获取/更新/重置

此清单需逐项打勾验收，确保无裸返回、无漏包装、无缺失 `messageCode/timestamp`。