# DuckDB 原生 IO 迁移摘要

## 目的
Task 08 要求在非 Excel 的导入与查询响应链路中淘汰 pandas 往返，转而使用 DuckDB 原生读取器（`read_csv_auto`、`read_json_auto`、`read_parquet`）与集中式的 DataFrame→JSON 归一化逻辑，确保所有 API 均能输出一致、可序列化的 JSON 数据。

## 关键目标
1. 在 `core/utils.normalize_dataframe_output` 中统一 `/api/duckdb/execute`、`/api/query`、`/api/query_proxy` 等端点的序列化行为。
2. 通过 DuckDB SQL 加载器接管 CSV/JSON/Parquet 导入，仅在 DuckDB 无法解析时回退 pandas。
3. 将 JOIN/类型转换逻辑留在 DuckDB SQL 层（`CAST`、`TRY_CAST`、`REGEXP_EXTRACT`），避免 pandas 参与。
4. 剪贴板、URL 与文件导入在进入系统后立即注册到 DuckDB，后续流程不得再绕回 pandas。
5. 同步更新文档/测试并清理无用的 pandas 引用，反映新的数据流。

## 需修改的功能区域
| 层级 | 文件 | 修改要点 |
| --- | --- | --- |
| 序列化 | `api/core/utils.py`、`api/routers/duckdb_query.py`、`api/routers/query.py`、`api/routers/query_proxy.py` 以及所有调用 `df.to_dict` 的端点 | 实现并调用 `normalize_dataframe_output`，统一查询结果输出。 |
| 文件导入 | `api/core/file_utils.py`、`api/core/file_datasource_manager.py`、`api/routers/url_reader.py`、`api/routers/query.py` | 通过共享 DuckDB loader (`read_csv_auto`/`read_json_auto`/`read_parquet`/`read_xlsx`) 导入文件，失败时才回退 pandas。 |
| 查询处理/可视化 | `api/routers/query.py`、`core/visual_query_generator.py` | 用 SQL (`CAST`、`TRY_CAST`、`REGEXP_EXTRACT`) 重写 JOIN，与 `PIVOT/UNPIVOT/JSON_TABLE` 联动，保持透视看板 UI。 |
| 剪贴板导入 | `api/routers/paste_data.py` | 构建 pandas DataFrame 后立即 `duckdb.from_df` 注册，后续不再依赖 pandas。 |
| URL/远程链路 | `api/routers/url_reader.py`、`api/core/file_datasource_manager.py` | 优先使用 httpfs (`read_*('https|s3://')`)，仅在 httpfs 不可用时下载到本地。 |
| 服务器上传/导出 | `api/routers/chunked_upload.py`、异步任务导出模块 | 上传使用 `COPY ... FROM STDIN` 流式写入，导出使用 `COPY ... TO` 写文件。 |
| 清理与文档 | `docs/AGENTS.md` 及相关 README/测试 | 记录新流程、移除废弃 pandas 引用、补充原生导入与 streaming COPY 的回归测试。 |

## 任务拆解
| ID | 描述 | 验收要点 |
| --- | --- | --- |
| T1 | 实现 `normalize_dataframe_output` | 处理 Nullable 类型、日期格式与 `NaN`→`None`，替换全部 `df.to_dict`。 |
| T2 | 构建 DuckDB 原生读取器 | 提供 CSV/JSON/Parquet 通用加载器；`file_utils`、`file_datasource_manager`、`routers/url_reader`、`routers/query` 文件分支共用，并记录回退策略。 |
| T3 | SQL 化 JOIN / PIVOT/JSON_TABLE | 用 SQL 表达式取代 pandas 转换，并在 `visual_query_generator` 中加入 DuckDB `PIVOT/UNPIVOT/JSON_TABLE` 支持。 |
| T4 | 剪贴板注册流程 | 粘贴数据经 `duckdb.from_df` 立即入库，后续阶段不再序列化 pandas DataFrame。 |
| T5 | URL/远程整合 | URL、S3/OSS、Docker 挂载文件统一调用 DuckDB loader 或 httpfs，保留回退策略。 |
| T6 | 上传 / 导出 streaming 化 | Chunked Upload 接入 `COPY ... FROM STDIN`，异步导出与缓存通过 `COPY ... TO` 写 Parquet/CSV。 |
| T7 | 清理与文档 | 移除冗余 pandas 引用、更新文档，新增涉及 httpfs、`read_xlsx`、streaming COPY 的回归测试。 |

## 注意事项与边界
- Excel 导入默认使用 DuckDB `read_xlsx`，只有扩展不可用时才 fallback pandas。
- 推荐在配置中启用 httpfs/`duckdb_remote_settings`，以便直接读取 HTTP/S3/OSS 文件。
- 原生路径稳定后可探索 Arrow Flight/`fetch_arrow_table` 等流式返回方案。
- 新增 UI/UX 说明若涉及导入流程，需强调集中归一化与 DuckDB-first 的策略。
