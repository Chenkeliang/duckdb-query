# 阶段 B API 调用关系

> 与 [`FE_BE_OPTIMAL_PLAN.md`](./FE_BE_OPTIMAL_PLAN.md) 阶段 B 对应；改前对照后端路由。

## DuckDB 表列表

| 调用方 | API 函数 | HTTP | 后端 |
|--------|----------|------|------|
| `useDuckDBTables` | `getDuckDBTables` | `GET /api/duckdb/tables` | `duckdb_query.list_duckdb_tables_summary` |
| （无直接 UI） | `fetchDuckDBTableSummaries` | 同上 | 同上，多返回 `messageCode` |

**列表 `data`**：`create_list_response` → `items[]`，元素含 `table_name`, `row_count`, `column_count`, `created_at`。  
前端映射：`table_name` → `TableInfo.name`。

~~`GET /api/duckdb_tables`~~（legacy，阶段 B 移除）

## DuckDB 删表

| 调用方 | API 函数 | HTTP |
|--------|----------|------|
| `QueryWorkspace`, `ContextMenu` | `deleteDuckDBTable` | `DELETE /api/duckdb/tables/{table_name}` |
| `DataSourceExample` | `deleteDuckDBTable` | 同上 |

~~`deleteDuckDBTableEnhanced`~~ → 合并为 `deleteDuckDBTable`  
~~`DELETE /api/duckdb_tables/{name}`~~

## 表元数据刷新

| API | HTTP（修正后） |
|-----|----------------|
| `refreshDuckDBTableMetadata` | `POST /api/duckdb/table/{table_name}/refresh` |

当前无 UI 调用；路径须与后端一致以备后用。

## 连接池 / 错误统计（仅导出，无 UI）

| API | HTTP（修正后） | 后端 `data` 要点 |
|-----|----------------|------------------|
| `getConnectionPoolStatus` | `GET /api/duckdb/pool/status` | `pool_status`, `timestamp` |
| `resetConnectionPool` | `POST /api/duckdb/pool/reset` | 依后端 |
| `getErrorStatistics` | `GET /api/errors/statistics` | `error_statistics`（非 `errors`） |
| `clearOldErrors` | `POST /api/errors/clear?days=` | 原为误用 `DELETE` |

## 删除的死代码（无 `frontend/src` 业务引用）

| 模块 | 符号 |
|------|------|
| `queryApi` | `executeExternalSQL`, `executeSQL`, `performQuery`, `saveQueryResultAsDatasource` |
| `tableApi` | `getAvailableTables`, `getAllTables`, `getColumnStatistics`, `getDistinctValues` |
| `fileApi` | `uploadFileToDuckDB`, `getFilePreview` |
| `visualQueryApi` | `getAppFeatures`（`getAppConfig` 保留，`/api/app-config/features`） |

保留：`saveQueryToDuckDB`（`ImportToDuckDBDialog`）、`executeDuckDBSQL`、`executeFederatedQuery`。
