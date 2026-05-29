# 查询与集合运算行为说明

本文档描述 JOIN、集合运算、SQL 工作台在**预览**与**执行**、**行数限制**、**展示 SQL 与执行 SQL** 上的固定行为。实现以仓库内 FastAPI 与前端代码为准。

## UNION BY NAME

| 项 | 行为 |
|----|------|
| 适用操作 | 仅 `UNION`、`UNION ALL`；`INTERSECT` / `EXCEPT` 不支持 BY NAME |
| 请求字段 | `use_by_name: true`（[`SetOperationConfig`](api/models/set_operation_models.py)） |
| 生成 SQL | `UNION BY NAME` 或 `UNION ALL BY NAME`（[`set_operation_generator.py`](api/core/services/set_operation_generator.py) 约 51–55 行） |
| 子查询列 | BY NAME 模式下每表子查询为 `SELECT *`（同文件约 94–96 行） |
| 列对齐规则 | 按**列名**对齐，不按位置 |
| `column_mappings` | 模型存在，**当前不参与 SQL 生成** |

## 联邦 LIMIT

| 场景 | 限制方式 | 配置键 |
|------|----------|--------|
| JOIN 预览 | `is_preview=true` → `ensure_query_has_limit(max_query_rows)` | `max_query_rows`（默认 10000） |
| JOIN 联邦执行（非预览） | SQL 无 `LIMIT` 时追加 `max_query_rows` | 同上 |
| 集合：服务端 generate/execute（预览或非 save） | 每表子查询 `LIMIT preview_limit` | `max_query_rows` |
| 集合：工作台「执行」 | `generatedSql + LIMIT maxQueryRows` | 前端 `useAppConfig` |
| 集合：保存为表 | `save_as_table=true` 时**无**子查询 LIMIT，全量 `CREATE TABLE AS` | — |

## 预览 vs 执行

| 功能 | 预览 | 执行（全量/非预览） |
|------|------|---------------------|
| JOIN（服务端 `/api/query`） | `is_preview=true`；响应可含 `preview_limit_applied` | `is_preview=false`；联邦仍可能受 `max_query_rows` 兜底 |
| SQL 工作台 | `isPreview` → 服务端追加 LIMIT | 无预览 LIMIT（用户 SQL 自带 LIMIT 除外） |
| 集合运算 UI | **无**独立预览按钮 | 「执行」= 带 LIMIT 的 SQL；「保存为表」= 全量入湖 |

## 展示 SQL vs 执行 SQL（JOIN 联邦）

| 路径 | 以谁为准 |
|------|----------|
| `canUseServerJoinPath=true` | 服务端返回的 `data.sql`（`POST /api/query`） |
| `canUseServerJoinPath=false` | 前端 `generateSQL()` + `sqlOptimizer` 生成的 SQL，经 `onExecute` 走联邦/本地执行 |

## 相关端点

- JOIN：`POST /api/query` — [`api/routers/join_query.py`](api/routers/join_query.py)
- 集合：`POST /api/set-operations/*` — [`api/routers/set_operations.py`](api/routers/set_operations.py)
- SQL：`POST /api/duckdb/execute`、`POST /api/duckdb/federated-query` — [`api/routers/duckdb_query.py`](api/routers/duckdb_query.py)

契约摘要见 [`API_CONTRACT_FE_BE.md`](API_CONTRACT_FE_BE.md)。
