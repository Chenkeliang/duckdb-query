# API 标准化重构任务清单

> **关联文档**: requirements.md, design.md  
> **预计工时**: 6.5 人天  
> **优先级**: P0 安全修复 → P1 基础设施 → P2 功能完善 → P3 规范统一
> **版本**: 1.3 (已补充前端适配详细任务)

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

### 3.5 大数据量处理 (0.25 天)

- [ ] **添加 MAX_DIRECT_RETURN_ROWS 常量**
  - 文件: `api/core/validators.py`
  - 值: `MAX_DIRECT_RETURN_ROWS = 10000`

- [ ] **创建结果集大小检查函数**
  - 文件: `api/core/validators.py`
  - 函数: `check_result_size(row_count: int)`
  - 逻辑: 超过 10000 行抛出 400 错误，提示使用异步任务

- [ ] **execute_duckdb_sql 添加行数检查**
  - 文件: `api/routers/duckdb_query.py`
  - 端点: `POST /api/duckdb/execute`
  - 改动: 执行后调用 `check_result_size(len(result))`

- [ ] **execute_federated_query 添加行数检查**
  - 文件: `api/routers/duckdb_query.py`
  - 端点: `POST /api/duckdb/federated-query`
  - 改动: 执行后调用 `check_result_size(len(result))`

### 3.6 连接测试超时处理 (0.25 天)

- [ ] **创建带超时的连接测试函数**
  - 文件: `api/routers/datasources.py`
  - 函数: `test_connection_with_timeout(params: dict, timeout: int)`
  - 使用: `asyncio.wait_for()` 实现超时
  - 确保: `finally` 块中关闭连接

- [ ] **更新测试连接端点**
  - 端点: `POST /api/datasources/databases/test`
  - 改动: 调用 `test_connection_with_timeout()`
  - 错误处理: 捕获 `asyncio.TimeoutError` 返回 408

### 3.7 paste_data.py 改造 (0.25 天)

- [ ] **删除重复返回字段**
  - 位置: L221
  - 改动: 删除 `"createdAt": created_at_value`

- [ ] **统一响应格式**
  - 改用 `create_success_response()`

### 3.8 settings.py 检查

- [x] **已使用 response_helpers** - 无需改动

---

## 阶段 4: 前端适配 (P2) - 1 天

### 4.1 TypeScript 类型更新

- [ ] **更新 API 响应类型**
  - 文件: `frontend/src/types/api.d.ts`
  - 新增: `ApiError` 类型包含 `code`, `message`, `field`, `details`
  - 新增: `PaginatedResponse` 类型包含 `items`, `total`, `limit`, `offset`

- [ ] **更新异步任务类型**
  - 文件: `frontend/src/new/Query/AsyncTasks/types.ts`
  - 添加 `total`, `offset` 分页字段
  - 添加 `order_by` 参数类型

### 4.2 错误处理增强

- [ ] **apiClient.js 已兼容结构化错误** ✅
  - 文件: `frontend/src/services/apiClient.js`
  - L87-96 已正确提取 `code`, `message`, `details`, `field`
  - 无需修改

- [x] **预览模式默认 LIMIT** ✅
  - 当前代码已实现，无需改动
  - 预览模式自动添加 `LIMIT {max_query_rows}`（取自配置）
  - 用户手动指定 LIMIT 时使用用户值

- [ ] **新增 CONNECTION_TIMEOUT 错误处理**
  - 文件: `frontend/src/services/apiClient.js`
  - 位置: `handleApiError` 函数
  - 改动: 添加 408 状态码处理
  ```javascript
  case 408:
    throwWithMessage('连接超时，请检查网络或数据库状态');
    break;
  ```

### 4.3 异步任务面板改造

- [ ] **添加分页参数支持**
  - 文件: `frontend/src/new/Query/AsyncTasks/AsyncTaskPanel.tsx`
  - 改动: 添加 `offset` 和 `limit` 状态
  - 改动: 添加分页控件（上一页/下一页）

- [ ] **添加每页条数选择器**
  - 组件: `Select` 下拉框
  - 选项: `[20, 50, 100]`
  - 默认: 20

- [ ] **修改任务列表查询**
  - 文件: `frontend/src/new/Query/AsyncTasks/hooks/useAsyncTasks.ts`
  - 改动: 添加 `limit`, `offset`, `order_by` 参数
  ```typescript
  const { data } = useQuery({
    queryKey: ['async-tasks', { limit, offset, orderBy }],
    queryFn: () => apiClient.get(`/api/async_tasks?limit=${limit}&offset=${offset}&order_by=${orderBy}`)
  });
  ```

### 4.4 响应格式兼容性

- [ ] **确认现有调用不受影响**
  - 策略: 后端保持现有成功响应格式，仅错误响应使用 `create_error_response`
  - 验证: 所有 `response.data.xxx` 访问路径仍有效

- [ ] **测试现有页面**
  - 数据源页面
  - 查询工作台
  - 异步任务面板
  - 设置页面


## 阶段 5: 文档更新 (P3) - 0.5 天

### 5.1 API 文档更新

- [ ] **更新 NEW_UI_API_REFERENCE.md**
  - 移除"问题分析"列（已修复）
  - 更新响应格式示例
  - 添加分页参数文档
  - 添加大数据量处理说明
  - 添加连接超时参数说明

### 5.2 代码注释补充

- [ ] **validators.py 添加 docstring**
  - 所有函数添加完整文档
  - 说明参数、返回值、异常

- [ ] **各 router 更新注释**
  - 更新端点 docstring
  - 说明新增参数用途

---

## 阶段 6: 测试验证 (P2) - 0.5 天

### 6.1 安全验证测试

- [ ] **SQL 注入测试 - DETACH**
  - 测试: 使用 `alias="test; DROP TABLE users;--"` 
  - 预期: 被引号包裹，无法注入

- [ ] **SQL 注入测试 - CREATE TABLE**
  - 测试: 使用 `save_as_table="test\"; DROP TABLE users;--"`
  - 预期: 被引号包裹，无法注入

- [ ] **路径遍历测试**
  - 测试: 使用 `path="/../../../etc/passwd"`
  - 预期: 返回 403 PATH_NOT_ALLOWED

- [ ] **符号链接测试**
  - 测试: 创建指向 /etc 的符号链接并尝试访问
  - 预期: 返回 403 SYMLINK_NOT_ALLOWED

- [ ] **敏感日志检查**
  - 测试: 执行 federated query 并检查日志
  - 预期: 无密码解密信息输出

### 6.2 边界情况验证测试

- [ ] **分页功能测试**
  - 测试: `GET /api/async_tasks?limit=20&offset=40`
  - 预期: 返回第 3 页数据（第 41-60 条）

- [ ] **limit 枚举测试**
  - 测试: `GET /api/async_tasks?limit=30`
  - 预期: 返回 400 错误，提示允许值 [20,50,100]，包含 `field: "limit"`

- [ ] **大 offset 性能测试**
  - 测试: `GET /api/async_tasks?offset=10000`
  - 预期: 响应时间 < 1 秒（或返回提示）

- [ ] **系统表保护测试**
  - 测试: `DELETE /api/duckdb/tables/system_metadata`
  - 预期: 返回 403 RESERVED_NAME，包含 `field: "table_name"`

- [ ] **Schema 保护测试**
  - 测试: `DELETE /api/duckdb/tables/information_schema.tables`
  - 预期: 返回 403 PROTECTED_SCHEMA，包含 `field: "table_name"`

- [ ] **表名长度测试**
  - 测试: 创建 65 字符表名
  - 预期: 返回 400 INVALID_TABLE_NAME，包含 `field: "table_name"`

- [ ] **表名特殊字符测试**
  - 测试: 创建表名 `test-table` 或 `test table`
  - 预期: 返回 400 INVALID_TABLE_NAME，包含 pattern 说明

- [ ] **错误响应 field 字段测试**
  - 测试: 所有 400 错误
  - 预期: 响应中包含 `field` 字段指明问题参数

- [ ] **排序参数测试**
  - 测试: `GET /api/async_tasks?order_by=invalid`
  - 预期: 返回 422 错误，提示允许值列表

- [ ] **参数冲突测试**
  - 测试: 同时传 `table_name="a"` 和 `table_alias="b"`
  - 预期: 返回 400 错误，提示参数冲突

- [ ] **预览模式默认 LIMIT 测试**
  - 测试: 预览模式执行无 LIMIT 的查询（大表）
  - 预期: 自动添加 `LIMIT 10000`，返回 10000 行

- [ ] **用户自定义 LIMIT 测试**
  - 测试: 预览模式执行 `SELECT * FROM big_table LIMIT 50000`
  - 预期: 使用用户指定值，返回 50000 行

- [ ] **连接超时测试**
  - 测试: 测试连接到不可达主机，设置 `timeout=5`
  - 预期: 5 秒后返回 408 CONNECTION_TIMEOUT

- [ ] **连接资源清理测试**
  - 测试: 连接超时后检查连接是否关闭
  - 预期: 无连接泄漏

### 6.3 兼容性验证测试

- [ ] **现有前端功能测试**
  - 数据源页面正常工作
  - 查询工作台正常工作
  - 异步任务面板正常工作
  - 设置页面正常工作

- [ ] **旧路由兼容性测试**
  - 测试: `POST /api/async-tasks/{task_id}/download`
  - 预期: 与新路由 `/api/async_tasks/...` 行为一致

- [ ] **错误响应格式测试**
  - 测试: 触发各种错误
  - 预期: 格式符合 `create_error_response()` 标准

### 6.4 性能验证测试

- [ ] **分页性能测试**
  - 测试: 1000 个任务时的分页响应时间
  - 预期: < 100ms

- [ ] **大数据量拒绝测试**
  - 测试: 尝试直接返回 100 万行
  - 预期: 立即返回 400 错误（不执行查询）

---

## 验证清单（快速检查）

### 安全验证 ✓

- [ ] SQL 注入测试通过
- [ ] 路径遍历测试通过
- [ ] 符号链接测试通过
- [ ] 日志无敏感信息

### 边界情况验证 ✓

- [ ] 分页功能正常
- [ ] limit 枚举校验正常
- [ ] 系统表/Schema 保护正常
- [ ] 表名校验正常
- [ ] 错误响应包含 field 字段
- [ ] 参数冲突检测正常
- [ ] 大数据量拒绝正常
- [ ] 连接超时处理正常

### 兼容性验证 ✓

- [ ] 现有前端正常工作
- [ ] 旧路由仍可访问
- [ ] 错误响应格式一致

---

## 回滚方案

如果重构出现问题:

1. **Git 回滚**: `git revert HEAD~N`
2. **配置开关**: 可考虑添加 `USE_NEW_RESPONSE_FORMAT` 环境变量
3. **灰度发布**: 先在测试环境验证 24 小时

---

## 任务统计

### 按阶段统计

| 阶段 | 任务数 | 预计工时 | 优先级 |
|------|--------|---------|--------|
| 阶段 1: 安全修复 | 8 | 0.5 天 | P0 |
| 阶段 2: 基础设施 | 4 | 1 天 | P1 |
| 阶段 3: Router 改造 | 38 | 2.5 天 | P1/P2 |
| 阶段 4: 前端适配 | 12 | 1 天 | P2 |
| 阶段 5: 文档更新 | 4 | 0.5 天 | P3 |
| 阶段 6: 测试验证 | 28 | 1 天 | P2 |
| **总计** | **94** | **6.5 天** | - |

### 按优先级统计

| 优先级 | 任务数 | 说明 |
|--------|--------|------|
| P0 | 8 | 安全修复（必须立即完成） |
| P1 | 30 | 基础设施 + 核心 Router 改造 |
| P2 | 40 | 功能完善 + 测试验证 |
| P3 | 8 | 文档更新 |

### 关键里程碑

1. **Day 1**: 完成安全修复（P0）+ 基础设施（P1）
2. **Day 2-3**: 完成 Router 改造（P1/P2）
3. **Day 4**: 完成前端适配 + 测试验证
4. **Day 5**: 完成文档更新 + 回归测试
5. **Day 6**: 缓冲时间 + 生产部署

---

## 新增功能总结

### 安全增强
- ✅ 修复所有 SQL 注入漏洞（DETACH、CREATE TABLE、自定义表名）
- ✅ 修复路径遍历漏洞（含符号链接检测）
- ✅ 删除敏感日志输出

### 功能完善
- ✅ 异步任务分页（limit + offset + order_by）
- ✅ 大数据量处理（10000 行限制 + 异步任务引导）
- ✅ 连接测试超时（带资源清理）
- ✅ 系统表/Schema 保护
- ✅ 参数命名统一（Field alias）
- ✅ 路由别名兼容

### 规范统一
- ✅ 统一响应格式（所有端点）
- ✅ 统一参数校验（validators.py）
- ✅ 统一错误码（含 field 字段）
- ✅ 统一 MessageCode

### 边界情况处理
- ✅ limit 枚举校验 [20, 50, 100]
- ✅ 表名长度限制（64 字符）
- ✅ 取消原因长度限制（500 字符）
- ✅ 参数冲突检测（table_name vs table_alias）
- ✅ 符号链接检测
- ✅ 大 offset 性能优化建议
