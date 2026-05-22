# API 路由模块说明

> 前端契约入口：[`docs/API_CONTRACT_FE_BE.md`](../../docs/API_CONTRACT_FE_BE.md)  
> 注册顺序：[`main.py`](../main.py) `app.include_router(...)`

## 命名易混（不是重复实现）

| 文件 | URL 前缀 | 职责 |
|------|----------|------|
| `data_sources.py` | `/api/upload`、`/api/data-sources/excel/*` | **文件入湖**（上传、Excel） |
| `datasources.py` | `/api/datasources/*` | **数据源 CRUD**（库连接、统一列表/删除） |

## 查询相关

| 文件 | 主要端点 | 前端 API |
|------|----------|----------|
| `duckdb_query.py` | `/api/duckdb/execute`、`/federated-query`、`/tables/*` | `queryApi.ts`、`tableApi.ts` |
| `query.py` | `/api/query`（JOIN）、`/api/save_query_to_duckdb`；**deprecated** `/api/execute_sql` | JOIN 工作台、`saveQueryToDuckDB` |
| `visual_query.py` | `/api/visual-query/*` | `visualQueryApi.ts` |
| `set_operations.py` | `/api/set-operations/*` | `setOperationsApi.ts` |
| `query_cancel.py` | `/api/query/cancel/{id}` | `cancelSyncQuery` |
| `query_sql_utils.py` | （无路由，共享 SQL 工具） | — |

## 外部库元数据（canonical + legacy 别名）

`database_tables.py` 同时注册：

- **推荐**：`/api/datasources/databases/{id}/tables|schemas|tables/detail`
- **兼容**：`/api/database_tables/{id}`、`/api/database_table_details/{id}/{table}` 等（`deprecated=True`）

## 入湖（多入口 → `file_ingestion_service`）

`data_sources.py`、`chunked_upload.py`、`url_reader.py`、`server_files.py`、`paste_data.py`

## 已移除

- `query_proxy.py`：无端点，已从 `main.py` 注销
- `catalog_service.py`：薄代理已内联至 `database_tables.get_table_details_alias`
