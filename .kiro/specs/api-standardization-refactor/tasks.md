# API 标准化重构任务清单

> **关联文档**: requirements.md, design.md  
> **预计工时**: 5 人天  
> **优先级**: P0 安全修复 → P1 基础设施 → P2 功能完善 → P3 规范统一
> **版本**: 1.1 (已补充边界情况)

---

## 阶段 1: 安全修复 (P0) - 0.5 天

### 1.1 SQL 注入修复（全面覆盖）

- [ ] **修复 DETACH SQL 注入**
  - 文件: `api/routers/duckdb_query.py`
  - 位置: L705
  - 改动: `DETACH {alias}` → `DETACH "{alias}"`

- [ ] **修复 save_as_table SQL 注入**
  - 文件: `api/routers/duckdb_query.py`
  - 位置: L360
  - 改动: 所有 CREATE TABLE 语句使用 `"{table_name}"`

- [ ] **修复 custom_table_name SQL 注入**
  - 文件: `api/routers/async_tasks.py`
  - 改动: 所有 SQL 拼接使用引号包裹表名

### 1.2 敏感日志删除

- [ ] **删除密码解密日志**
  - 文件: `api/routers/duckdb_query.py`
  - 位置: L622
  - 改动: 删除 `logger.info(f"已解密连接 {attach_db.connection_id} 的密码")`

### 1.3 路径遍历修复（含符号链接）

- [ ] **添加浏览目录路径校验**
  - 文件: `api/routers/server_files.py`
  - 端点: `GET /api/server_files`
  - 改动: 调用 `sanitize_path()` 校验路径

- [ ] **添加导入文件路径校验**
  - 文件: `api/routers/server_files.py`
  - 端点: `POST /api/server_files/import`
  - 改动: 调用 `sanitize_path()` 校验路径

- [ ] **新增符号链接检测**
  - 位置: `sanitize_path()` 函数
  - 改动: 添加 `os.path.islink()` 检测并禁止

---

## 阶段 2: 基础设施 (P1) - 1 天

### 2.1 创建公共校验模块

- [ ] **新建 validators.py**
  - 路径: `api/core/validators.py`
  - 内容:
    - `SAFE_TABLE_NAME_PATTERN` 正则
    - `SAFE_ALIAS_PATTERN` 正则
    - `SAFE_SHORTCUT_PATTERN` 正则
    - `PROTECTED_SCHEMAS` 列表 (information_schema, pg_catalog, duckdb_)
    - `PROTECTED_PREFIX` 常量 (system_)
    - `validate_pagination()` - limit 枚举 [20,50,100]
    - `validate_table_name()` - 含 Schema 保护
    - `validate_alias()` 函数
    - `validate_shortcut()` 函数
    - `sanitize_path()` - 含符号链接检测

- [ ] **所有错误响应必须包含 field 字段**
  - 规范: `{"code": "...", "message": "...", "field": "table_name"}`

- [ ] **更新导出**
  - 文件: `api/core/__init__.py`
  - 改动: 导出 validators 模块

### 2.2 扩展响应工具

- [ ] **添加新 MessageCode**
  - 文件: `api/utils/response_helpers.py`
  - 新增枚举值:
    - `QUERY_SUCCESS`
    - `TABLE_CREATED`
    - `TABLE_DELETED`
    - `TASK_SUBMITTED`
    - `TASK_CANCELLED`
    - `FILE_UPLOADED`
    - `EXPORT_SUCCESS`
    - `VALIDATION_ERROR`

- [ ] **添加默认消息映射**
  - 文件: `api/utils/response_helpers.py`
  - 为新 MessageCode 添加中文默认消息

---

## 阶段 3: Router 改造 (P1/P2) - 2.5 天

### 3.1 duckdb_query.py 改造 (0.5 天)

- [ ] **添加系统表保护**
  - 端点: `DELETE /api/duckdb/tables/{table_name}`
  - 改动: 添加 `validate_table_name()` 调用

- [ ] **统一响应格式 - list_duckdb_tables_summary**
  - 端点: `GET /api/duckdb/tables`
  - 改动: 使用 `create_success_response()`

- [ ] **统一响应格式 - get_duckdb_table_detail**
  - 端点: `GET /api/duckdb/tables/detail/{table_name}`
  - 改动: 使用 `create_success_response()`

- [ ] **统一响应格式 - execute_duckdb_sql**
  - 端点: `POST /api/duckdb/execute`
  - 改动: 使用 `create_success_response()`

- [ ] **统一响应格式 - delete_duckdb_table**
  - 端点: `DELETE /api/duckdb/tables/{table_name}`
  - 改动: 使用 `create_success_response()`

- [ ] **统一响应格式 - execute_federated_query**
  - 端点: `POST /api/duckdb/federated-query`
  - 改动: 使用 `create_success_response()`

### 3.2 async_tasks.py 改造 (1 天)

- [ ] **添加分页参数**
  - 端点: `GET /api/async_tasks`
  - 新增参数: `offset: int = Query(default=0, ge=0)`
  - 新增参数: `order_by: str = Query(default="created_at_desc")`

- [ ] **添加表名长度限制**
  - 位置: `AsyncQueryRequest` 模型
  - 改动: 添加 `custom_table_name` 长度限制 ≤64

- [ ] **添加取消原因长度限制**
  - 位置: `CancelTaskRequest` 模型
  - 改动: `reason: str = Field(max_length=500)`

- [ ] **添加 attach_databases 覆盖参数**
  - 位置: `RetryTaskRequest` 模型
  - 新增: `attach_databases_override: Optional[List[AttachDatabase]]`

- [ ] **添加路由别名**
  - 当前: `/api/async-tasks/{task_id}/download`
  - 新增: `/api/async_tasks/{task_id}/download` (指向同一函数)

- [ ] **统一响应格式 - submit_async_query**
  - 改动: 使用 `create_success_response()`

- [ ] **统一响应格式 - list_async_tasks**
  - 改动: 使用 `create_list_response()`

- [ ] **统一响应格式 - get_async_task**
  - 改动: 使用 `create_success_response()`

- [ ] **统一响应格式 - cancel_async_task**
  - 改动: 使用 `create_success_response()`

- [ ] **统一响应格式 - retry_async_task**
  - 改动: 使用 `create_success_response()`

### 3.3 datasources.py 改造 (0.5 天)

- [ ] **添加连接名重复检查**
  - 端点: `POST /api/datasources/databases`
  - 改动: 创建前检查 name 是否已存在

- [ ] **添加连接测试超时参数**
  - 端点: `POST /api/datasources/databases/test`
  - 新增参数: `timeout: int = Field(default=10, ge=1, le=60)`

- [ ] **统一响应格式**
  - 所有端点改用 `create_success_response()` / `create_error_response()`

- [ ] **更新 docstring**
  - 说明 ID 格式支持 `db_{id}` 和 `{id}` 两种

### 3.4 server_files.py 改造 (0.25 天)

- [ ] **集成路径校验**
  - 在 `browse_directory` 中调用 `sanitize_path()`
  - 在 `import_server_file` 中调用 `sanitize_path()`

- [ ] **统一响应格式**
  - 所有端点改用 `create_success_response()`

### 3.5 paste_data.py 改造 (0.25 天)

- [ ] **删除重复返回字段**
  - 位置: L221
  - 改动: 删除 `"createdAt": created_at_value`

- [ ] **统一响应格式**
  - 改用 `create_success_response()`

### 3.6 settings.py 检查

- [x] **已使用 response_helpers** - 无需改动

---

## 阶段 4: 前端适配 (P2) - 0.5 天

### 4.1 TypeScript 类型更新

- [ ] **更新 API 响应类型**
  - 文件: `frontend/src/types/api.d.ts`
  - 内容: 添加新的响应字段类型

- [ ] **更新异步任务类型**
  - 添加 `total`, `offset` 分页字段

### 4.2 前端兼容性适配

- [ ] **测试现有页面**
  - 数据源页面
  - 查询工作台
  - 异步任务面板
  - 设置页面

- [ ] **修复响应格式变更导致的问题**
  - 新响应嵌套在 `data` 字段中
  - 确保 `.data` 访问路径正确

---

## 阶段 5: 文档更新 (P3) - 0.5 天

### 5.1 API 文档更新

- [ ] **更新 NEW_UI_API_REFERENCE.md**
  - 移除"问题分析"列（已修复）
  - 更新响应格式示例
  - 添加分页参数文档

### 5.2 代码注释补充

- [ ] **validators.py 添加docstring**
- [ ] **各 router 更新注释**

---

## 验证清单

### 安全验证

- [ ] SQL 注入测试: 使用 `alias="test; DROP TABLE users;--"` 测试
- [ ] SQL 注入测试: 使用 `save_as_table="test\"; DROP TABLE users;--"` 测试
- [ ] 路径遍历测试: 使用 `path="/../../../etc/passwd"` 测试
- [ ] 符号链接测试: 创建指向 /etc 的符号链接并尝试访问
- [ ] 日志检查: 确认无敏感信息输出

### 边界情况验证

- [ ] 分页测试: `limit=20&offset=40` 返回正确数据
- [ ] limit 枚举测试: `limit=30` 返回 400 错误，提示允许值 [20,50,100]
- [ ] 系统表保护: 删除 `system_*` 表返回 403
- [ ] Schema 保护: 删除 `information_schema.*` 表返回 403
- [ ] 表名校验: 超长/特殊字符表名返回 400
- [ ] 表名校验: 验证错误响应包含 `field` 字段
- [ ] 排序参数测试: 无效 `order_by` 返回允许值列表
- [ ] 参数冲突测试: 同时传 `table_name` 和 `table_alias` 不同值返回错误

### 兼容性验证

- [ ] 现有前端正常工作
- [ ] 旧路由 `/api/async-tasks/` 仍可访问
- [ ] 错误响应格式保持一致

---

## 回滚方案

如果重构出现问题:

1. **Git 回滚**: `git revert HEAD~N`
2. **配置开关**: 可考虑添加 `USE_NEW_RESPONSE_FORMAT` 环境变量
3. **灰度发布**: 先在测试环境验证 24 小时
