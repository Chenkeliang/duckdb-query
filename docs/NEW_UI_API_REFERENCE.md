# DuckQ 前端 API 使用文档

本文档梳理了 `frontend/src/new` 新 UI 中实际使用的后端 API 接口，包含问题分析和基于项目架构的最优解决方案。

---

## 查询执行 API

| 接口 | 方法 | 请求参数 | 返回参数 | 问题分析 | 最优解决方案 |
|------|------|---------|---------|---------|---------|
| `/api/duckdb/execute` | POST | `sql`: SQL语句<br>`save_as_table`: 保存表名<br>`is_preview`: 预览模式 | `success`, `data[]`, `columns[]`, `row_count`, `execution_time_ms` | ① `save_as_table` 无格式验证<br>② 保存失败只 warning 不返回前端<br>③ L360 `limit` 变量可能未定义 | ① **复用** `async_tasks.py` 的 `SAFE_ALIAS_PATTERN` 正则到公共模块 `api/core/validators.py`<br>② response 增加 `save_error` 字段<br>③ 将 limit 提取到函数开头 |
| `/api/duckdb/federated-query` | POST | `sql`: SQL语句<br>`attach_databases[]`<br>`is_preview`: 预览模式 | `success`, `data[]`, `columns[]`, `attached_databases[]` | ① L705 DETACH 未用引号包裹<br>② L622 日志泄露密码信息<br>③ 无 ATTACH 超时 | ① **改为** `DETACH "{alias}"`（已在 async_tasks.py 修复，此处同步）<br>② **删除** 该行日志<br>③ 使用 DuckDB `SET statement_timeout` |
| `/api/execute_sql` | POST | `sql`<br>`datasource`: {id, type}<br>`is_preview` | `success`, `data[]`, `columns[]` | ① datasource.id 验证不严格<br>② 错误响应格式不统一 | ① 增加 `if not datasource.get('id'): raise HTTPException(400)`<br>② **使用** `utils.response_helpers.create_error_response` |
| `/api/query` | POST | `sql`, `datasource` | `success`, `data[]` | 代理接口，依赖上游规范 | 保持现状 |

---

## 异步任务 API

| 接口 | 方法 | 请求参数 | 返回参数 | 问题分析 | 最优解决方案 |
|------|------|---------|---------|---------|---------|
| `/api/async_query` | POST | `sql`<br>`task_type`<br>`custom_table_name`<br>`attach_databases[]` | `success`, `task_id`, `message` | ① `custom_table_name` 无长度限制<br>② 缺少任务名称字段 | ① **添加** `if len(name) > 64: raise HTTPException(400, "表名过长")`<br>② **添加** `task_name: Optional[str] = None` 到 AsyncQueryRequest |
| `/api/async_tasks` | GET | `limit`: 默认20<br>`offset`: 偏移量<br>`order_by`: 排序 | `success`, `tasks[]`, `count`, `total`, `limit`, `offset` | ✅ 已修复：支持分页和排序 | - |
| `/api/async_tasks/{id}` | GET | Path: `task_id` | `success`, `task` | ✅ 正常 | - |
| `/api/async_tasks/{id}/cancel` | POST | `reason` | `success`, `message` | ① reason 无长度限制 | **添加** `reason: str = Field(max_length=500)` 到 Pydantic Model |
| `/api/async_tasks/{id}/retry` | POST | `override_sql`, `datasource_override` | `success`, `task_id` | ① 联邦查询参数不可覆盖 | **添加** `attach_databases_override: Optional[List[AttachDatabase]] = None` |
| `/api/async-tasks/{id}/download` | POST | `format`: csv/parquet | Blob | ① 路径不一致 async-tasks vs async_tasks | **添加别名路由** `@router.post("/api/async_tasks/{task_id}/download")` 指向同一函数 |

---

## 数据源管理 API

| 接口 | 方法 | 请求参数 | 返回参数 | 问题分析 | 最优解决方案 |
|------|------|---------|---------|---------|---------|
| `/api/datasources` | GET | `type`, `subtype`, `status`, `search` | `success`, `datasources[]` | ① search 需防注入<br>② 无分页 | ① **确认**已使用参数化查询（代码中使用 `?` 占位符）<br>② **使用** `create_list_response` 并添加 `page`, `page_size` 参数 |
| `/api/datasources/databases/list` | GET | 无 | `success`, `datasources[]` | ✅ 正常 | - |
| `/api/datasources/databases` | POST | `name`, `type`, `params` | `success`, `id` | ① 无连接名重复检查 | **添加**查询 `SELECT 1 FROM ... WHERE name = ?`，存在则返回 409 |
| `/api/datasources/databases/test` | POST | 同上 | `success`, `message` | ① 无超时参数 | **添加** `timeout: int = Field(default=10, le=60)` 并传递给数据库驱动 |
| `/api/datasources/databases/{id}/refresh` | POST | Path: `id` | `success`, `message` | ① ID 格式未统一文档化 | **在 docstring 中说明** "ID 支持 `db_{id}` 或 `{id}` 格式" |
| `/api/datasources/{id}` | DELETE | Path: `id` | `success`, `message` | ✅ 正常 | - |

---

## DuckDB 表管理 API

| 接口 | 方法 | 请求参数 | 返回参数 | 问题分析 | 最优解决方案 |
|------|------|---------|---------|---------|---------|
| `/api/duckdb_tables` | GET | 无 | `success`, `tables[]`, `count` | ① 响应字段名 `count` 已统一 ✅ | - |
| `/api/duckdb/tables/detail/{name}` | GET | Path: `table_name` | `success`, `table` | ① 返回嵌套在 table 里 | **保持现状**，嵌套结构便于扩展 |
| `/api/duckdb/tables/{name}` | DELETE | Path: `table_name` | `success`, `message` | ✅ 已添加系统表保护 | - |
| `/api/save_query_to_duckdb` | POST | `sql`, `table_alias`, `datasource` | `success`, `table_name`, `row_count` | ① 参数名与其他接口不一致 | **添加别名参数** `save_as_table: Optional[str] = Field(alias="table_alias")` 兼容两种写法 |

---

## 外部数据库 API

| 接口 | 方法 | 请求参数 | 返回参数 | 问题分析 | 最优解决方案 |
|------|------|---------|---------|---------|---------|
| `/api/databases/{id}/schemas` | GET | Path: `connection_id` | `success`, `schemas[]` | ① 仅 PostgreSQL 有效 | **在响应中添加** `supported: true/false` 标识 |
| `/api/databases/{id}/schemas/{schema}/tables` | GET | Path: `connection_id`, `schema` | `success`, `tables[]` | ✅ 正常 | - |
| `/api/database_tables/{id}` | GET | Path: `connection_id` | `success`, `tables[]` | ① 路径与其他不一致 | **添加新路由** `/api/databases/{id}/tables` 指向同一函数，废弃旧路由 |
| `/api/database_table_details/{id}/{table}` | GET | Path, Query: `schema` | `success`, `columns[]`, `sample_data[]` | ① 缺 row_count | **添加** `estimated_row_count` 通过 `COUNT(*)` 或 `reltuples` |

---

## 文件上传 API

| 接口 | 方法 | 请求参数 | 返回参数 | 问题分析 | 最优解决方案 |
|------|------|---------|---------|---------|---------|
| `/api/upload` | POST | FormData: `file`, `table_alias` | `success`, `table_name` | ① 文件类型仅检查后缀 | **增加** MIME 类型校验 `if file.content_type not in ALLOWED_MIMES` |
| `/api/duckdb_upload` | POST | FormData: `file`, `table_alias` | `success`, `table_name` | 与 /api/upload 功能重复 | **统一到** `/api/upload` 添加 `target` 参数 |
| `/api/excel/inspect/{id}` | GET | Path: `file_id` | `success`, `sheets[]` | ① file_id 无校验 | **添加** UUID 格式校验 `if not is_valid_uuid(file_id)` |
| `/api/excel/import` | POST | `file_id`, `sheets[]`, `table_prefix` | `success`, `tables[]` | ① sheet 名可能含特殊字符 | **使用** `paste_data.py` 的 `_sanitize_table_name` 处理 |
| `/api/server_files/mounts` | GET | 无 | `success`, `mounts[]` | ✅ 正常 | - |
| `/api/server_files` | GET | `path` | `success`, `files[]` | ① 路径遍历风险 | **添加** `os.path.realpath(path).startswith(allowed_base)` 校验 |
| `/api/server_files/import` | POST | `path`, `table_alias` | `success`, `table_name` | 同上 | 同上 |
| `/api/paste-data` | POST | `table_name`, `column_names[]`, `column_types[]`, `data_rows[][]` | `success`, `table_name`, `rows_saved` | ① 返回有 `created_at` 和 `createdAt` | **删除** L221 的 `createdAt` 重复字段 |

---

## 快捷键设置 API

| 接口 | 方法 | 请求参数 | 返回参数 | 问题分析 | 最优解决方案 |
|------|------|---------|---------|---------|---------|
| `/api/settings/shortcuts` | GET | 无 | `data.shortcuts[]`, `data.defaults` | ✅ 使用了 response_helpers | - |
| `/api/settings/shortcuts/{id}` | PUT | `shortcut` | `success` | ① shortcut 无格式校验 | **添加** `shortcut: str = Field(pattern=r"^(Cmd\|Ctrl\|Alt\|Shift)(\+(Cmd\|Ctrl\|Alt\|Shift\|[A-Z0-9]))+$")` |
| `/api/settings/shortcuts/reset` | POST | `action_id` | `success` | ✅ 正常 | - |

---

## 应用配置 API

| 接口 | 方法 | 请求参数 | 返回参数 | 问题分析 | 最优解决方案 |
|------|------|---------|---------|---------|---------|
| `/api/app-config/features` | GET | 无 | 功能开关对象 | ✅ 正常 | - |

---

## 优先级修复清单

### 🔴 高优先级（安全）

| 问题 | 位置 | 修复方案 |
|------|------|---------|
| ✅ DETACH SQL 注入 | `duckdb_query.py:705` | 已改为 `DETACH "{alias}"` |
| ✅ 路径遍历风险 + 符号链接 | `server_files.py` | 已添加 `realpath` + 白名单校验 + 符号链接检测 |
| ✅ 密码日志泄露 | `duckdb_query.py:622` | 已删除该行日志 |

### 🟡 中优先级（功能）

| 问题 | 位置 | 修复方案 |
|------|------|---------|
| ✅ 异步任务无分页 | `async_tasks.py:list_async_tasks` | 已添加 offset/order_by 参数 |
| ~ 错误响应不统一 | 多处 | 新接口使用 `create_error_response` |
| ✅ 系统表无保护 | `query.py:delete_duckdb_table` | 已添加 validate_table_name 校验 |

### 🟢 低优先级（规范）

| 问题 | 位置 | 修复方案 |
|------|------|---------|
| 路由命名不一致 | async-tasks vs async_tasks | 添加别名路由 |
| 参数命名不一致 | 多处 | 使用 Pydantic Field alias 兼容 |
| 响应字段重复 | paste_data.py:221 | 删除 createdAt |

---

## 公共模块提取建议

建议创建 `api/core/validators.py` 统一校验逻辑（✅ 已创建）：

```python
# api/core/validators.py - 已实现的功能
from core.validators import (
    validate_table_name,   # 表名校验（含 Schema 保护）
    validate_alias,        # 别名校验
    validate_shortcut,     # 快捷键校验
    sanitize_path,         # 路径校验（含符号链接检测）
    validate_pagination,   # 分页校验（limit 枚举 [20,50,100]）
)
```

---

## 设置页面功能使用情况

| 功能 | 状态 | 说明 |
|------|------|------|
| 快捷键设置 | ✅ 使用中 | `ShortcutSettings.tsx` |
| 缓存设置 | ✅ 使用中 | `CacheSettings.tsx` |
| 数据库设置 | ❌ 未使用 | i18n 有定义但无组件 |
| 界面设置 | ❌ 未使用 | 可通过顶栏按钮操作 |
| 语言设置 | ❌ 未使用 | 可通过顶栏按钮操作 |
| 安全设置 | ❌ 未使用 | 无组件实现 |
