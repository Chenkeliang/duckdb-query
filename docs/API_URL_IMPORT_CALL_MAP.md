# URL 导入 API 调用关系（阶段 A）

> 改路径/字段前必读。后端实现：`api/routers/url_reader.py`；前端封装：`frontend/src/api/fileApi.ts`。

## 调用链

```
UploadPanel.handleUrlImport()
  └─ readFromUrl(url, tableAlias)          [fileApi.ts]
       └─ POST /api/read_from_url          [url_reader.read_from_url]
            └─ create_success_response → normalizeResponse → UploadPanel 用 data.*

getUrlInfo(url)                            [fileApi.ts，当前无 UI 调用]
  └─ GET /api/url_info?url=               [url_reader.get_url_info]
```

| 层级 | 文件 | 符号 |
|------|------|------|
| UI | `frontend/src/DataSource/UploadPanel.tsx` | `handleUrlImport` |
| API | `frontend/src/api/fileApi.ts` | `readFromUrl`, `getUrlInfo` |
| 导出 | `frontend/src/api/index.ts` | 同上 |
| 路由 | `api/routers/url_reader.py` | `read_from_url`, `get_url_info` |

## POST `/api/read_from_url`

### 请求体（必须与 `URLReadRequest` 一致）

| 字段 | 后端类型 | 前端发送 | 说明 |
|------|----------|----------|------|
| `url` | `HttpUrl` | `url` | 必填 |
| `table_alias` | `str` | `table_alias` | 必填 |
| `header` | `bool?` 默认 `true` | ~~`has_header`~~ → **`header`** | 曾误用 `has_header`，后端不识别 |
| `delimiter` | `str?` | `delimiter` | 可选 |
| `encoding` | `str?` | `encoding` | 可选 |
| `file_type` | `str?` | （未传） | 可由 URL 扩展名推断 |

### 成功响应 `data`（`UploadPanel` 消费字段）

| 字段 | 后端 | `UploadPanel` 使用 |
|------|------|-------------------|
| `table_name` | ✓ | `result.table_name`、toast、`onDataSourceSaved.id` |
| `row_count` | ✓ | `onDataSourceSaved.row_count` |
| `columns` | ✓ | `onDataSourceSaved.columns` |
| `column_count`, `file_type`, `url` | ✓ | 未用 |

标准包装：`success`, `data`, `messageCode`（`URL_READ_SUCCESS`）, `message`, `timestamp`。

## GET `/api/url_info`

| 查询参数 | `url`（string） |
|----------|-----------------|
| `data` 字段 | `file_type`, `content_type`, `content_length`, `url` |
| 前端 `getUrlInfo` 返回 | 将 `content_length` 映射为 `size`（兼容旧类型名） |

## 错误路径

- 4xx/5xx：`HTTPException(detail=...)` 或标准错误体 → `handleApiError` / `showErrorToast`
- 404：改路径前为 `/api/url-reader/*` 在 Docker/本地均不存在对应路由

## 验证

```bash
# 后端直连（本地 dev :8000 或 Docker :8001）
curl -s -X POST http://localhost:8001/api/read_from_url \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv","table_alias":"iris_test","header":true}'

# 经前端 nginx（Docker :3000）
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/read_from_url \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv","table_alias":"iris_test"}'
```
