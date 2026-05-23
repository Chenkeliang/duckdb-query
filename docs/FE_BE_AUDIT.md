# 前后端全面评估报告

> **评估日期**：2026-05-21  
> **部署形态**：Docker 推荐 + 本地 dev（见 `README.md`、`quick-start.sh`）；无独立线上网关。  
> **方法**：静态扫描 `api/routers/*.py` 与 `frontend/src/api/*.ts`、业务引用 grep、对照契约 [`API_CONTRACT_FE_BE.md`](./API_CONTRACT_FE_BE.md)。  
> **阶段 A–D（2026-05）**：URL 导入、前端 API 收敛、后端 ATTACH 单轨、契约表扩写已完成；下文「已修复」项以删除线或 ✅ 标注。

---

## 1. 执行摘要

| 维度 | 结论 |
|------|------|
| **主查询路径** | ✅ 同步：`executeDuckDBSQL` + `executeFederatedQuery`（ATTACH），与 v2.0/v2.1 文档一致 |
| **P0 断链** | ✅ URL 导入已对齐（契约 §5、`fileApi.readFromUrl`） |
| **遗留双轨** | ✅ 异步新任务统一 ATTACH（阶段 C）；`execute_sql` / `duckdb_tables` 等 legacy HTTP 已移除，无前端引用 |
| **契约表** | ✅ [`API_CONTRACT_FE_BE.md`](./API_CONTRACT_FE_BE.md) 按域覆盖 `frontend/src/api/*` 在用路径（阶段 D） |
| **死代码 API** | ✅ 阶段 B 已从 `queryApi` / `index.ts` 移除 `execute_sql`、`performQuery` 等 |
| **响应规范** | ✅ 主路由已用 `error_json_response` / `create_success_response`；边缘脚本或历史文档可能仍提及 `HTTPException` |

---

## 2. 运行拓扑（Docker + 本地开发）

### 2.1 Docker（`./quick-start.sh`）

| 组件 | 访问 |
|------|------|
| 前端 | http://localhost:3000 |
| API 文档 | http://localhost:8001/docs |
| API 流量 | 浏览器 `/api/*` → nginx → `backend:8000` |

### 2.2 本地开发（README）

| 组件 | 默认 |
|------|------|
| 后端 | `cd api && uvicorn main:app --reload` → :8000 |
| 前端 | `cd frontend && npm run dev` → :5173（Vite proxy `/api` → :8000） |

两种形态共用 `frontend/src/api/*`；**无**网关路径重写。

---

## 3. Docker 代理细节

```
浏览器 → host:3000 (nginx frontend)
           location /api/ → proxy_pass http://backend:8000
后端容器 dataquery-backend 监听 8000（compose 映射 host:8001）
```

| 配置 | 值 | 说明 |
|------|-----|------|
| `frontend/nginx.conf` | `proxy_pass http://backend:8000` | 与 compose 服务名一致，**无**路径重写 |
| `VITE_API_URL`（构建） | `""` | 生产构建走相对路径 `/api/...`，经 nginx 代理 |
| `REACT_APP_API_URL`（compose） | `http://dataquery-backend:8000` | 构建时用 `import.meta.env.VITE_API_URL`；若为空则仍走相对路径 |

**推论**：不存在「线上网关改写 `/api/url-reader` → `/api/read_from_url`」；路径不一致在 Docker 下即为真实缺陷。

---

## 4. 端点 inventory

### 3.1 规模

| 来源 | 数量 |
|------|------|
| 后端 `@router.*`（`api/routers/*.py`） | **76** |
| 前端 `apiClient` / `uploadClient` 调用模式 | **~59**（去重后） |
| `docs/API_CONTRACT_FE_BE.md` 登记 | **~50+**（按域分表，见阶段 D） |

### 3.2 P0：URL 导入（已修复）

| 前端（现） | 后端 | 调用方 |
|------------|------|--------|
| `POST /api/read_from_url` | 同左 | `UploadPanel` → `readFromUrl` |
| `GET /api/url_info` | 同左 | `getUrlInfo`（无 UI，已对齐字段） |

请求体：`header`（非 `has_header`）。详见 [`API_CONTRACT_FE_BE.md`](./API_CONTRACT_FE_BE.md) §5。

### 3.3 P1：路径/资源名不一致（调用即失败）

| 前端 | 后端 | 业务是否使用 |
|------|------|--------------|
| `GET /api/duckdb/pool/status` | 同左 | `asyncTaskApi.getConnectionPoolStatus`（管理/诊断，无 UI 强依赖） |
| `POST /api/duckdb/pool/reset` | 同左 | `asyncTaskApi.resetConnectionPool` |
| `POST /api/duckdb/tables/{name}/refresh` | `POST /api/duckdb/table/{name}/refresh` | 否（刷新菜单只做 cache invalidate） |
| `POST /api/duckdb/upload-file` | （无）主上传为 `POST /api/upload` | 否 |
| `GET /api/features` | （无）配置为 `GET /api/app-config/features` | 否（`useAppConfig` 用正确路径） |

### 3.4 P2：前端封装存在、后端无路由且无业务引用

> ✅ 阶段 B 已从 `frontend/src/api` 删除下列死路径封装；若 grep 到残留 import 应视为遗漏。

| 前端路径（已移除） | 说明 |
|----------|------|
| ~~`POST /api/save_query_result_as_datasource`~~ | 无后端 |
| ~~`GET /api/available_tables`~~ | 无后端 |
| ~~`GET /api/tables/all`~~ | 无后端 |
| ~~`GET /api/file_preview/{filename}`~~ | 无后端 |
| ~~`POST /api/tables/distinct-values`~~ | 已移除（原 `POST /api/visual-query/distinct-values` 随可视化构建器下线） |
| ~~`GET /api/tables/{t}/columns/{c}/statistics`~~ | 已移除（原 `GET /api/visual-query/column-stats/...`） |

### 3.5 后端有能力、前端未走 `@/api` 或本地拼 SQL

| 后端 | 说明 |
|------|------|
| `POST /api/set-operations/*` | ✅ `setOperationsApi.ts` 全端点封装；面板仍用 `generate` + `preview` + `onExecute`（SQL 路径） |
| `POST /api/upload/init|chunk|complete` | 分块上传后端完整；前端当前主要 `POST /api/upload` |
| ~~`POST /api/visual-query/distinct-values|validate`~~ | 已移除；透视仅 `generate`/`preview`（`mode: pivot`）见 `pivotQueryApi.ts` |
| `POST /api/duckdb/migrate/created_at` | 运维向，无前端 |

### 3.6 重复端点（同一资源多套 URL）

| 能力 | Legacy | 现行/并列 | 前端实际 |
|------|--------|-----------|----------|
| DuckDB 表列表 | ~~`GET /api/duckdb_tables`~~（已移除） | `GET /api/duckdb/tables` | ✅ **`getDuckDBTables()`** |
| 删 DuckDB 表 | ~~`DELETE /api/duckdb_tables/{name}`~~（已移除） | `DELETE /api/duckdb/tables/{name}` | ✅ **`deleteDuckDBTable`** |
| 外部 schemas | — | `/api/databases/...` 与 `/api/datasources/databases/...` | `databaseSchemasApi` 用 **databases** |
| 外部表列表 | `GET /api/database_tables/{id}` | `.../schemas/{schema}/tables` | 无 schema 时用扁平接口 |

---

## 5. 查询执行架构

```mermaid
flowchart TB
  subgraph sync_ok [同步主路径 - 已对齐]
    UI[SQL/Join/Set/预览]
    WS[useQueryWorkspace]
    DUCK[POST /api/duckdb/execute]
    FED[POST /api/duckdb/federated-query]
    UI --> WS
    WS -->|本地表| DUCK
    WS -->|attach_databases| FED
  end
  subgraph async_path [异步任务]
    ASYNC[async_tasks] --> FED
  end
```

| 项目 | 状态 |
|------|------|
| `TableSource.type`：`duckdb \| federated` | 外部表元数据仍为 `SelectedTable.source === 'external'` |
| `executeExternalSQL` / `executeSQL` / `performQuery` | 仅 `api/index.ts` 导出，**无** `frontend/src` 业务 import |
| 引号策略 | 已改为按需引号（`sqlUtils.needsQuoting`） |
| 透视表 | `PivotPanel` → `/api/pivot-query/*`；构建器 Tab 已移除 |
| 集合运算 | ✅ `SetOperationsPanel` → `setOperationsApi`（`generate` / `preview` / `validate`） |

---

## 6. 响应格式与字段

| 项 | 现状 |
|----|------|
| 标准成功体 | 多数新路由使用 `create_success_response` / `create_list_response` |
| 错误 | 大量 `raise HTTPException(detail=...)`，与 `StandardError` 形状不统一 |
| `normalizeResponse` | `client.ts` 仍含 **legacy** 分支（兼容旧 success/error 嵌套） |
| 字段命名 | ✅ 查询 API 统一 `row_count`；前端历史记录等 UI 字段仍名 `rowCount`（非 HTTP 字段） |
| 列表载荷 | 部分端点 `data.items`，部分 `data.tables[]`（契约表已注明 database_tables） |

---

## 7. 后端实现债（AGENTS 对照）

| 规则 | 现状 |
|------|------|
| `with_duckdb_connection()` | 主查询路由（`join_query` / `duckdb_query` / `pivot_query` / `set_operations`）已迁移；带 `X-Request-ID` 的预览/联邦仍用 `interruptible_connection` |
| 统一响应 | `duckdb_query.py` 部分错误仍 `JSONResponse` |
| 时区 | 新代码多用 `timezone_utils`；旧路由需逐文件核对 |

---

## 8. 前端实现债

| 项 | 说明 |
|----|------|
| `hooks/README.md` | ✅ 示例已改为 `useDuckDBTables` / `/api/duckdb/tables` |
| QueryKey | `['schemas', id]` 等与 kebab 规范混用 |
| 结果表格 | ✅ `ResultPanel` → `DataGridWrapper`（TanStack Table）；AG Grid 已移除 |
| `as any` | `QueryWorkspace`、`ContextMenu` 等仍有 |
| 契约维护 | ✅ 全量表见 `API_CONTRACT_FE_BE.md`；改 API 须先更新该表 |

---

## 9. 文档漂移

| 文档 | 问题 |
|------|------|
| `.kiro/specs/` | ✅ 历史任务 spec 已删除；仅保留 `pivot-table/` |
| `frontend/src/new/` | ✅ 目录已不存在；现用 `frontend/src/` |
| `API_CONTRACT_FE_BE.md` | ✅ 阶段 D 按域扩写 |
| `QUERY_EXECUTION_FLOW.md` | ✅ v2.1：部署表 + 废弃端点 + 异步 ATTACH |

---

## 10. 修复优先级（建议）

### P0 — 影响 Docker 现网功能

1. ~~**URL 导入**~~：✅ 前端 `fileApi.ts` 已使用 `POST /api/read_from_url`、`GET /api/url_info`（见 `fileApi.urlImport.test.ts`）。
2. 自测：`UploadPanel` 提交公网 CSV URL（需 Docker/公网环境人工验证）。

### P1 — 收敛与防再发

1. ~~废弃裸 SQL API~~：✅ 前端已无 `executeExternalSQL` / `performQuery` 等；`tableApi` 走 `/api/duckdb/tables`。
2. `asyncTaskApi`：连接池路径改为 `/api/duckdb/pool/*`（若将来做管理页）。
3. ~~`useDuckDBTables`~~：✅ `tableApi.ts` 已用 `GET /api/duckdb/tables`。
4. ~~异步任务：去掉 `_fetch_external_query_result`~~：✅ 已删除死代码；异步路径仅 ATTACH。
5. ~~REGULAR 生成器拆分~~：✅ 已拆为 `pivot_query_generator` / `table_metadata_service` / `set_operation_generator`；`pivot_query_sql_common.py` 仅 pivot 所需。
5. ~~扩充 `API_CONTRACT_FE_BE.md`~~：✅ 已增 §0.1 模块索引、§9.1 JOIN、`uploadApi` 说明及后端未封装端点表。

### P2 — 架构与体验

1. ~~去掉 `TableSource.external` 兜底~~：✅ 执行路径仅 `federated` + `duckdb`（`SelectedTable.source` 仍为 `external` 表元数据）。
2. ~~Set 运算 / JOIN / 透视后端路径~~：✅ Set `generate`/`preview`；JOIN `performJoinQuery`（含 `attach_databases`）；透视 `pivot-query` + `attach_databases`。
3. ~~Visual 查询支持联邦表~~：✅ 透视 Tab 走后端 `pivot-query` + `attach_databases`；多透视列仍本地 SQL。
4. ~~入湖 router 连接池~~：✅ `chunked_upload` / `server_files` 已迁；`paste_data` 等若仍有直连再查。

---

## 11. Docker 自测清单

```bash
# 启动
docker compose up -d --build

# 后端健康
curl -s http://localhost:8001/health

# 经前端代理（与浏览器一致）
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/duckdb/tables
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/read_from_url \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/x.csv","table_alias":"test"}'
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/url-reader/read \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com/x.csv","table_alias":"test"}'
# 预期：前者 4xx/422/5xx 视实现；后者 404
```

---

## 12. 评估局限

- 未在评估时启动容器做 HTTP 断言（路径结论来自源码对照）。
- 未扫描 `query_proxy` / `enhanced_data_sources` 可选路由（`main.py` 中 try-import，当前仓库无对应文件）。
- 第三方 `fetch`（GitHub stars）不计入本后端契约。

---

## 13. 相关文件

| 用途 | 路径 |
|------|------|
| Compose | `docker-compose.yml` |
| 前端代理 | `frontend/nginx.conf` |
| 契约表 | `docs/API_CONTRACT_FE_BE.md` |
| 查询流程 | `docs/frontend/QUERY_EXECUTION_FLOW.md` |
| 规范 | `AGENTS.md` |
