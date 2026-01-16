# API 响应格式全链路标准化需求文档

> **版本**: 1.0  
> **创建时间**: 2026-01-16  
> **状态**: 📋 规划中

---

## 📋 需求概述

统一所有 API 接口的响应格式，实现 Code-Driven I18n，消除裸返回和兼容逻辑，降低前后端耦合。

### 核心目标

1. **后端统一包装** - 所有接口必须使用 `create_success_response` / `create_error_response`
2. **前端统一解包** - 创建 `normalizeResponse` 统一处理所有 API 响应
3. **I18n 驱动** - 前端仅依赖 `messageCode` 翻译，`message` 为兜底
4. **消除裸返回** - 禁止 Pydantic 模型直接返回、禁止手动构造 dict

---

## 🔒 全局约束

### 后端约束
- 所有路由返回必须经 helper 函数
- Pydantic 模型返回需 `.dict()` 后包装
- 业务错误统一 `JSONResponse + create_error_response`
- `timestamp` 和 `messageCode` 必填
- 禁止全局异常处理二次包装

### 前端约束
- 所有 API 调用必须经 `normalizeResponse` 解包
- 错误提示基于 `messageCode` 走 i18n
- 下载接口错误需解析 blob JSON

---

## 🔴 前端现状分析（迁移前必读）

### 1) 当前响应解包问题
- **现状**: 所有 API 模块直接使用 `response.data` 或旧的 `ApiResponse` 结构（仅 `success/message/data`）
- **缺失**: 无统一 `normalizeResponse`，不支持 `messageCode/timestamp`
- **影响**: 后端切换新结构后，业务数据在 `data`、列表在 `data.items/total`，旧逻辑拿不到字段

### 2) 错误处理缺陷
- **现状**: `handleApiError` 只看 `detail`/`error.message`，未基于 `messageCode/error.code` 做 i18n
- **缺失**: 无 blob JSON 错误解析
- **影响**: 下载/文件接口的标准错误将被吞掉或提示错误

### 3) 主要受影响模块

| 模块 | 当前行为 | 问题 |
|------|----------|------|
| `asyncTaskApi.ts` | 列表/详情/提交/取消/重试直接 `return response.data` | 不会解包 `data` 或 `data.items` |
| `queryApi.ts` | 执行/预览直接 `response.data` | 不解包标准 envelope |
| `visualQueryApi.ts` | 生成/集合操作直接 `response.data` | 不解包标准 envelope |
| `dataSourceApi.ts` | 部分手动从 `data.items` 取，类型缺 `messageCode/timestamp` | 其余 CRUD/Test 仍直接 `response.data` |
| `sqlFavorites` | 直接 `response.data` | 无解包 |
| `urlReader` | 直接 `response.data` | 无解包 |
| `pasteData` | 直接 `response.data` | 无解包 |
| `file 上传` | 直接 `response.data` | 无解包 |
| **UI 层** | 文案依赖 `message` 字符串 | 不基于 `messageCode` 翻译 |

### 4) 解决方案（必须先做，避免前端全线报错）

#### Step 1: `client.ts` 增加 `normalizeResponse`
- 统一解包 `data` / `data.items/total/page/pageSize`
- 返回 `messageCode` / `timestamp` / `raw`
- 错误时抛出带 `code/messageCode` 的 `ApiError`

#### Step 2: 升级 `handleApiError`
- 支持标准错误结构（`error.code/messageCode/details`）
- 添加 blob JSON 解析（`parseBlobError`）
- 优先用 `messageCode` 做 i18n，`message` 兜底

#### Step 3: `types.ts` 类型升级
- 标记旧 `ApiResponse` 为 `@deprecated`
- 新增 `StandardSuccess<T>`、`StandardList<T>`、`StandardError`
- 新增 `NormalizedResponse<T>`

#### Step 4: 各 API 模块改造
- 使用 `normalizeResponse` 解包
- 从解包后的 `data/items/total` 取值
- UI/Toast 改用 `messageCode` 翻译

---

## 1️⃣ 标准响应格式

### 成功响应
```json
{
  "success": true,
  "data": { ... },
  "messageCode": "OPERATION_SUCCESS",
  "message": "操作成功",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### 列表响应
```json
{
  "success": true,
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20
  },
  "messageCode": "ITEMS_RETRIEVED",
  "message": "获取成功",
  "timestamp": "..."
}
```

### 错误响应
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "资源不存在",
    "details": {}
  },
  "detail": "资源不存在",
  "messageCode": "RESOURCE_NOT_FOUND",
  "message": "资源不存在",
  "timestamp": "..."
}
```

---

## 2️⃣ MessageCode 枚举基线

### 通用
- `OPERATION_SUCCESS` / `ITEMS_RETRIEVED` / `VALIDATION_ERROR`
- `RESOURCE_NOT_FOUND` / `UNAUTHORIZED` / `FORBIDDEN` / `INTERNAL_ERROR`

### 异步任务
- `ASYNC_TASK_SUBMITTED` / `ASYNC_TASK_LIST_RETRIEVED` / `ASYNC_TASK_CANCELLED`
- `ASYNC_TASK_NOT_FOUND` / `ASYNC_TASK_CANCEL_NOT_ALLOWED`

### 上传
- `UPLOAD_INIT_SUCCESS` / `UPLOAD_CHUNK_ACCEPTED` / `UPLOAD_COMPLETED`
- `UPLOAD_SESSION_NOT_FOUND` / `FILE_TOO_LARGE`

### 数据源
- `DB_CONN_CREATED` / `DB_CONN_TESTED` / `DB_CONNECTION_NOT_FOUND`

### 查询
- `QUERY_EXECUTED` / `QUERY_FAILED` / `TABLE_METADATA_RETRIEVED`

### 视觉查询
- `VISUAL_QUERY_GENERATED` / `VISUAL_QUERY_PREVIEWED` / `SET_OPERATION_EXECUTED`

### 其他
- `PASTE_SAVED` / `URL_LOADED` / `FAVORITE_SAVED` / `SERVER_FILE_IMPORTED`

---

## 3️⃣ 需要改造的后端文件

| 文件 | 当前状态 | 改造内容 |
|------|----------|----------|
| `async_tasks.py` | Pydantic 直接返回 | 包装 `.dict()` |
| `chunked_upload.py` | 裸 dict | 使用 helper |
| `database_tables.py` | 裸 dict/list | 使用 helper |
| `duckdb_query.py` | 裸 dict | 全面包装 |
| `paste_data.py` | 裸 dict | 使用 helper |
| `query.py` | Pydantic 直接返回 | 包装 `.dict()` |
| `query_cancel.py` | 部分合规 | 验证完整性 |
| `sql_favorites.py` | 手动 `{"success": true}` | 使用 helper |
| `url_reader.py` | 裸 dict | 使用 helper |

---

## 4️⃣ 需要改造的前端文件

### 公共层
| 文件 | 改造内容 |
|------|----------|
| `client.ts` | 新增 `normalizeResponse<T>()` |
| `types.ts` | 新增 `StandardSuccess<T>` / `StandardError` |

### API 模块
| 文件 | 改造内容 |
|------|----------|
| `asyncTaskApi.ts` | 使用 `normalizeResponse` |
| `queryApi.ts` | 使用 `normalizeResponse` |
| `visualQueryApi.ts` | 使用 `normalizeResponse` |
| `dataSourceApi.ts` | 使用 `normalizeResponse` |
| `fileApi.ts` | 使用 `normalizeResponse` |

### UI 层
- 文案显示基于 `messageCode` → i18n
- Loading/Error 状态依赖 `success` / `error.code`

---

## 5️⃣ 验收标准

1. **后端**: 任一端点成功返回包含 `success=true` / `data` / `messageCode` / `timestamp`
2. **后端**: 错误返回包含 `success=false` / `error.code` / `messageCode` / `timestamp`
3. **前端**: 所有 API 通过 `normalizeResponse` 解包
4. **前端**: 错误提示走 `messageCode` 映射
5. **I18n**: `messageCode` 集中管理，前后端一致

---

## 6️⃣ 前端 handleApiError 升级要求

### 核心升级点

1. **支持 Blob JSON 解析**: 下载接口错误返回 blob，需尝试转文本后 JSON.parse
2. **优先 messageCode 翻译**: `t(`errors.${messageCode}`)` 优先，`message` 兜底
3. **错误结构提取**: 提取 `error.code` / `error.details` 供 UI 层使用

### 示例

```typescript
// 检测 blob 错误
if (contentType?.includes('application/json')) {
  const text = await blob.text();
  const errorData = JSON.parse(text);
  throw new ApiError(errorData.error.code, t(`errors.${errorData.messageCode}`) || errorData.message);
}
```

---

## 7️⃣ MessageCode 集中管理

### 后端
- **文件**: `api/utils/response_helpers.py`
- **形式**: `MessageCode(str, Enum)` 枚举类
- **规则**: 新增接口必须先登记枚举，禁止硬编码字符串

### 前端
- **中文**: `frontend/src/i18n/locales/zh/errors.json`
- **英文**: `frontend/src/i18n/locales/en/errors.json`
- **规则**: 与后端枚举保持 1:1 映射

### 一致性维护
- 后端新增枚举时同步更新前端
- Code Review 检查 messageCode 一致性
- 可考虑自动同步脚本

---

## 8️⃣ 全局异常处理约束

- **禁止二次包装**: 全局 handler 不得对已标准化的 `JSONResponse` 再包装
- **未捕获异常**: 统一使用 `INTERNAL_ERROR` 代码
- **检测方法**: 检查响应体是否已含 `success` 字段
