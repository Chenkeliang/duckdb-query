# Task 08: DuckDB native IO migration

## Objective
Eliminate pandas as the default interchange layer between DuckDB and API responses/importers。基于 DuckDB 1.4.1，将原生 reader (`read_csv_auto`, `read_json_auto`, `read_parquet`, `read_xlsx`)、httpfs 远程读取、`COPY ... FROM/TO` streaming、`PIVOT/UNPIVOT/JSON_TABLE` 等能力整合到上传、查询、透视、JSON 展开、导出等链路，使整个系统在上传/解析/返回阶段都停留在 DuckDB 内部。

## Scope
* CSV/JSON/Parquet/Excel ingestion paths (`file_utils`, `file_datasource_manager`, `routers/url_reader`, `routers/query`) 统一调用 DuckDB `read_*`；pandas 仅在扩展不可用或文件损坏时兜底。
* Query outputs (`/api/duckdb/execute`, `/api/query`, `/api/query_proxy`, etc.) must run through a single `normalize_dataframe_output` helper to guarantee JSON-safe payloads。
* JOIN/type-conversion helpers in `routers/query.py` 以及 `core/visual_query_generator.py` 需使用 SQL (`CAST`, `TRY_CAST`, `REGEXP_EXTRACT`, `PIVOT`, `UNPIVOT`, `JSON_TABLE`)，以替代 pandas 的列处理。
* Clipboard/pasted data may still bootstrap a temporary pandas DataFrame, but it must be immediately loaded into DuckDB via `duckdb.from_df` and never re-exported through pandas once persisted。
* URL/服务器目录/OSS/S3 等远程读取优先使用 httpfs (`read_*('https|s3://…')`)，只有 httpfs 不可用时才落地临时文件。
* Chunked Upload / 导出任务必须使用 `COPY ... FROM STDIN` / `COPY ... TO` streaming，以降低中间文件与内存占用。

## Deliverables
1. `core/utils.normalize_dataframe_output(df: pd.DataFrame) -> List[Dict[str, Any]]` implementing:
   * `df = df.convert_dtypes()` to leverage pandas nullable dtypes。
   * Datetime columns formatted via `.dt.strftime('%Y-%m-%d %H:%M:%S.%f').str.rstrip('0').str.rstrip('.')` (or equivalent) for ISO-friendly strings。
   * `df = df.where(pd.notnull(df), None)` to map `NaN`/`NaT`/`pd.NA` to `None`。
   * Final payload produced through `json.loads(df.to_json(orient='records', date_format='iso'))` (or by applying `handle_non_serializable_data`)。
2. All response builders currently calling `df.to_dict(orient='records')`—notably in `routers/duckdb_query.py`, `routers/query.py`, proxy endpoints—must use `normalize_dataframe_output`。
3. Introduce a DuckDB file-loading helper (`load_file_to_duckdb`) that issues the exact SQL needed for each supported format, for example:
   * CSV: `CREATE TABLE "{table_name}" AS SELECT * FROM read_csv_auto('{path}', HEADER TRUE, SAMPLE_SIZE = -1)`。
   * JSON/JSONL: `CREATE TABLE "{table_name}" AS SELECT * FROM read_json_auto('{path}', format = 'auto', maximum_depth = 10)`。
   * Parquet: `CREATE TABLE "{table_name}" AS SELECT * FROM read_parquet('{path}')`。
   * Excel: `CREATE TABLE "{table_name}" AS SELECT * FROM read_xlsx('{path}')`。
   The helper must pick the correct SQL template, run it against the DuckDB connection, and only fall back to pandas when the native command throws (e.g., malformed file)。
4. Update URL ingestion (`routers/url_reader.py`) and file datasource registration to call the new helper instead of pandas `read_*` routines whenever the source is an on-disk path；remote 使用 httpfs。
5. Rewrite JOIN/type coercion logic in `routers/query.py` and `core/visual_query_generator.py` to rely on SQL (`CAST`, `TRY_CAST`, `REGEXP_EXTRACT`, `PIVOT`, `UNPIVOT`, `JSON_TABLE`) rather than pandas-side conversions；保持透视看板/JSON 面板的 UI，不改变用户体验。
6. Ensure pasted-data ingestion (`routers/paste_data.py`) registers the DataFrame via DuckDB immediately (`duckdb.from_df`) and does not rely on pandas afterwards。
7. Chunked upload (`routers/chunked_upload.py`) uses DuckDB `COPY ... FROM STDIN` streaming；export/cache (`async_tasks`, cache manager) 使用 `COPY ... TO` 输出 Parquet/CSV。
8. Remove unused pandas imports and document the new ingestion/serialisation flow；tests/docs 覆盖 CSV/JSON/Parquet/Excel/httpfs ingestion 以及 streaming COPY。

## Tasks
| ID | Task | Details |
|----|------|---------|
| **T1** | `normalize_dataframe_output` helper | Implement in `core/utils.py`, add tests covering nullable ints, decimals, datetimes. Replace `df.to_dict` usages in `routers/duckdb_query.py`, `routers/query.py`, etc. |
| **T2** | DuckDB native readers | Build a shared loader issuing `CREATE TABLE ... AS SELECT * FROM read_*`. Update `file_utils`, `file_datasource_manager`, `routers/url_reader`, and file branches in `routers/query` to call it. Document fallback rules. |
| **T3** | JOIN/type conversion SQL rewrite + 可视化增强 | Audit `routers/query.py` for pandas conversions (`pd.to_numeric`, `.astype(str)`), replace with SQL expressions；`core/visual_query_generator.py` 引入 DuckDB `PIVOT/UNPIVOT/JSON_TABLE` 生成逻辑，前端复用原透视/JSON 面板。 |
| **T4** | Clipboard ingestion registration | In `routers/paste_data.py`, after creating the pandas DataFrame from pasted rows, immediately register it via DuckDB (`duckdb.from_df` or equivalent). Downstream logic must not export query results via pandas. |
| **T5** | URL/远程整合 | Refactor `routers/url_reader.py` to优先通过 httpfs + DuckDB loader 读取 URL/OSS/S3/服务器目录文件。 |
| **T6** | 上传/导出 streaming | Chunked Upload 接入 `COPY ... FROM STDIN` streaming；异步导出与缓存通过 `COPY ... TO` 写文件。 |
| **T7** | Cleanup & docs | Remove obsolete pandas imports. Update docs describing httpfs/`read_xlsx`/streaming COPY workflows. Add regression tests covering CSV/JSON/Parquet/Excel/httpfs ingestion。 |

## Notes
* Excel ingestion now prefers DuckDB `read_xlsx`; pandas remains as a fallback for edge cases。
* httpfs/S3/OSS 设置建议统一写入 `duckdb_remote_settings`（含 `s3_endpoint`, `s3_region`, `s3_url_style` 等）。
* Once Arrow wrappers / Flight Server are introduced, `normalize_dataframe_output` can dispatch on Arrow tables without changing its call sites；query 结果可进一步改为 Arrow streaming。
