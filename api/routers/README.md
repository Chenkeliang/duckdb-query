# API 路由模块说明

> 前端契约入口：[`docs/API_CONTRACT_FE_BE.md`](../../docs/API_CONTRACT_FE_BE.md)  
> 注册顺序：[`main.py`](../main.py) `app.include_router(...)`

## 命名易混（不是重复实现）

| 文件 | URL 前缀 | 职责 |
|------|----------|------|
| `file_ingestion.py` | `/api/upload`、`/api/data-sources/excel/*` | **文件入湖**（上传、Excel） |
| `datasources.py` | `/api/datasources/*` | **数据源 CRUD**（库连接、统一列表/删除） |

> 曾用名 `data_sources.py`（与 `datasources` 易混），已重命名；**URL 未改**，前端 `fileApi.ts` 无需改动。

## 查询相关

| 文件 | 主要端点 | 前端 API |
|------|----------|----------|
| `duckdb_query.py` | `/api/duckdb/execute`、`/federated-query`、`/tables/*` | `queryApi.ts`、`tableApi.ts` |
| `join_query.py` | `/api/query`（JOIN）、`/api/save_query_to_duckdb` | JOIN 工作台、`saveQueryToDuckDB` |
| `visual_query.py` | `/api/visual-query/*`（`with_duckdb_connection` + 可中断预览） | `visualQueryApi.ts` |
| `set_operations.py` | `/api/set-operations/*`（`with_duckdb_connection`） | `setOperationsApi.ts` |
| `query_cancel.py` | `/api/query/cancel/{id}` | `cancelSyncQuery` |
| `query_sql_utils.py` | （无路由，共享 SQL 工具） | — |

> 曾用名 `query.py`（与 `duckdb_query` 易混），已改为 `join_query.py`；**URL 未改**。

## 外部库元数据

`database_tables.py` 仅注册 canonical：`/api/datasources/databases/{id}/tables|schemas|.../tables/detail`（前端 `databaseSchemasApi` / `tableApi`）。

## 入湖（多入口 → `file_ingestion_service`）

| 文件 | 入口场景 |
|------|----------|
| `file_ingestion.py` | 浏览器上传、Excel inspect/import |
| `chunked_upload.py` | 大文件分块（`with_duckdb_connection`） |
| `url_reader.py` | 远程 URL（`read_from_url` / `url_info`） |
| `server_files.py` | 服务器目录挂载（`with_duckdb_connection`） |
| `paste_data.py` | 粘贴板 |

可合并成一个大 router 文件，但会超过 1500 行且 CI/评审成本高；**共享逻辑已在 `core/services/file_ingestion_service.py`**，多文件只是 HTTP 入口分栏。

## 查询执行（不宜合并单文件）

| 文件 | 职责 |
|------|------|
| `join_query.py` | 多表 JOIN 构建、`/api/query`、`save_query_to_duckdb`（`with_duckdb_connection`） |
| `duckdb_query.py` | DuckDB/联邦执行、表元数据（`with_duckdb_connection` + 可中断连接） |

合并会导致单文件过大；执行与 JOIN 构建分文件便于评审与测试。

## 已移除

- `query_proxy.py`：无端点，已从 `main.py` 注销
- `catalog_service.py`：薄代理已内联至 `database_tables.get_table_details_alias`
