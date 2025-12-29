# 通用查询取消机制 - 任务清单

> **版本**: 1.2  
> **创建时间**: 2024-12-25  
> **更新时间**: 2024-12-25  
> **状态**: 🟢 设计完成

---

## 📋 任务总览

| 阶段 | 任务 | 预估 | 状态 |
|------|------|------|------|
| 1 | 后端基础设施 | 2h | ⬜ |
| 2 | 后端端点改造 | 3h | ⬜ |
| 3 | 前端 Hook | 3h | ⬜ |
| 4 | 前端组件改造 | 4h | ⬜ |
| 5 | 国际化与视觉 | 1h | ⬜ |
| 6 | 测试验证 | 2h | ⬜ |
| **合计** | | **15h** | |

---

## Phase 1: 后端基础设施

### Task 1.1: RequestId 中间件
**文件**: `api/middleware/request_id.py` [NEW]

- [ ] 创建 `RequestIdMiddleware` 类
- [ ] 实现 `current_request_id` ContextVar
- [ ] 从 `X-Request-ID` header 提取或生成 UUID
- [ ] 响应写回 `X-Request-ID` header

### Task 1.2: 取消 API 端点
**文件**: `api/routers/query_cancel.py` [NEW]

- [ ] `POST /api/query/cancel/{request_id}`
- [ ] 添加 `sync:` 前缀调用 `connection_registry.interrupt()`
- [ ] 响应采用方案 B：`success`/`data.request_id`/`messageCode=QUERY_CANCELLED`/`message`/`timestamp`；现有查询端点保持原格式（仅取消 API 符合规范）
- [ ] 处理 404（不存在/已完成）

### Task 1.3: 注册中间件和路由
**文件**: `api/main.py` [MODIFY]

- [ ] 添加 `RequestIdMiddleware`
- [ ] 注册 query_cancel 路由

### Task 1.4: 标准化错误响应（不改业务逻辑）
**文件**: `api/routers/*.py` [MODIFY]

- [ ] 将直接 `HTTPException(detail="中文文案")` 改为规范错误体（success=false + error{code,message,details} + messageCode + message + timestamp）
- [ ] 覆盖范围：async_tasks.py（任务不存在等）、chunked_upload.py（上传会话/哈希等）、data_sources.py（连接/Excel 等）、duckdb_query.py（SQL 为空）、paste_data.py（表名/列名/数据校验）、query.py（聚合/保存查询校验）、server_files.py（路径/权限校验）、sql_favorites.py（收藏不存在/重名）
- [ ] messageCode 供前端 i18n，message 仅作 fallback，保持功能逻辑不变

---

## Phase 2: 后端端点改造

### Task 2.1: SQL 查询端点
**文件**: `api/routers/duckdb_query.py`

- [ ] `execute_duckdb_query`: 添加 `X-Request-ID` header
- [ ] 使用 `interruptible_connection("sync:{request_id}")`
- [ ] 捕获 `InterruptException` → 返回 499

### Task 2.2: JOIN 查询端点
**文件**: `api/routers/query.py`

- [ ] `perform_query`: 同上改造

### Task 2.3: 聚合查询端点
**文件**: `api/routers/query.py`

- [ ] `preview_visual_query`: 同上改造
- [ ] `get_distinct_values`: 同上改造

### Task 2.4: 联邦查询端点
**文件**: `api/routers/duckdb_query.py`

- [ ] `execute_federated_query`: ATTACH/DETACH/查询在同一上下文

---

## Phase 3: 前端 Hook

### Task 3.1: 创建 useQueryExecution
**文件**: `frontend/src/new/hooks/useQueryExecution.ts` [NEW]

- [ ] 状态机: idle/running/success/error/cancelled
- [ ] `execute(endpoint, payload)` 方法
- [ ] `cancel()` 方法 + 防抖
- [ ] `reset()` 方法
- [ ] `lastSuccessData` 保留上次成功结果
- [ ] 节流：300ms 内重复执行先取消

### Task 3.2: 错误处理
- [ ] 499 → cancelled
- [ ] data.messageCode === 'QUERY_CANCELLED' 或 data.cancelled === true → cancelled（方案 B 兼容 200 返回）
- [ ] !ok && !499 → error + 详情
- [ ] 404 取消 → 提示"已结束"
- [ ] 网络失败 → 仍 abort + 黄色提示

---

## Phase 4: 前端组件改造

### Task 4.1: SqlQueryPanel
- [ ] 集成 `useQueryExecution`
- [ ] 运行区: Spinner + 取消按钮
- [ ] 执行按钮禁用态
- [ ] 结果区: 取消/错误提示 + 重试按钮

### Task 4.2: JoinQueryPanel
- [ ] 同上改造
- [ ] 确保 join 编辑不被阻塞

### Task 4.3: AggregationConfig / VisualQuery
- [ ] 同上改造
- [ ] 单次执行单请求

### Task 4.4: FederatedQuery
- [ ] 同上改造

### Task 4.5: DistinctValues
- [ ] 走 useQueryExecution 保持一致

---

## Phase 5: 国际化与视觉

### Task 5.1: 国际化文案
**文件**: `frontend/src/i18n/locales/*/common.json`

- [ ] `query.run` / `query.cancel` / `query.running`
- [ ] `query.cancelled` / `query.cancelFailed`
- [ ] `query.error` / `query.retry` / `query.notFound`
- [ ] 取消/错误场景使用 `messageCode` 做多语言映射，后端 `message` 仅作 fallback，不直接展示

### Task 5.2: 视觉样式
- [ ] 使用 shadcn/ui 语义类
- [ ] 无硬编码颜色

---

## Phase 6: 测试验证

### Task 6.1: 后端单元测试
- [ ] interruptible_connection 正常/中断流程
- [ ] 取消 API 200/404

### Task 6.2: 端到端测试
- [ ] 正常执行→取消 (2s 内 cancelled)
- [ ] 取消已完成 (404)
- [ ] 网络异常取消 (本地中止)
- [ ] 快速重复取消 (防抖)
- [ ] 联邦查询取消 (ATTACH/DETACH)
- [ ] 长查询清理 (无残留)

---

## 🎯 验收标准

- [ ] 所有查询类型可取消
- [ ] 取消响应 < 2s
- [ ] UI 状态正确更新
- [ ] 无连接泄露
- [ ] 499 不计入错误统计
