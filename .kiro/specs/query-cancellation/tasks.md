# 查询取消机制 - 任务清单

> **版本**: 1.2  
> **创建时间**: 2024-12-25  
> **更新时间**: 2024-12-25  
> **状态**: 🟢 设计完成，反馈已处理

---

## ✅ 审查反馈处理

| 反馈 | 处理方式 |
|------|----------|
| 1. TaskStatus 命名 | 保留现有 QUEUED/RUNNING/SUCCESS/FAILED/CANCELLING，仅新增 CANCELLED |
| 2. 实际执行链路 | 在 `execute_async_query` / `execute_async_federated_query` 中集成 |
| 3. 新旧取消协调 | CANCELLING + interrupt() 双重机制 |
| 4. 连接池改造 | 添加 discard_connection 方法 |
| 5. 同步查询范围 | 明确短期不支持 |
| 6. 任务清理监控 | 添加后台巡检守护线程 |

---

## 📋 任务总览

| 阶段 | 任务 | 状态 | 预估 | 实际 |
|------|------|------|------|------|
| 0 | 前置调研 | ✅ | 1h | 0.5h |
| 1 | ConnectionRegistry 模块 | ⬜ | 2h | - |
| 2 | DuckDBPool 改造 | ⬜ | 2h | - |
| 3 | TaskManager 集成 | ⬜ | 2h | - |
| 4 | async_tasks.py 集成 | ⬜ | 2h | - |
| 5 | 后台巡检任务 | ⬜ | 1h | - |
| 6 | 测试 | ⬜ | 3h | - |
| 7 | 文档更新 | ⬜ | 1h | - |

**图例**: ⬜ 待开始 | 🔄 进行中 | ✅ 已完成 | ❌ 已取消

---

## Phase 0: 前置调研 ✅

### Task 0.1: 验证 DuckDB 中断异常类型
**优先级**: P0 | **状态**: ✅ 已完成

- [x] 确认异常类型: `duckdb.InterruptException`（继承自 `DatabaseError`）
- [x] 确认 API 方法: `connection.interrupt()`
- [x] 确认中断时机: 非立即，依赖 DuckDB 内部检查点

**验证代码**:
```python
import duckdb
import threading
import time

conn = duckdb.connect()

def run_query():
    try:
        conn.execute("SELECT * FROM range(1000000000)")
    except duckdb.InterruptException as e:
        print(f"✅ 捕获到 InterruptException: {e}")

thread = threading.Thread(target=run_query)
thread.start()
time.sleep(0.5)
conn.interrupt()
thread.join()
```

### Task 0.2: 分析现有代码
**优先级**: P0 | **状态**: ✅ 已完成

**TaskManager 分析** (`api/core/task_manager.py`):
- [x] 已有 `TaskStatus.CANCELLING` 状态 (Line 70)
- [x] 已有 `request_cancellation()` 方法 (Line 643-677)
- [x] 已有 `is_cancellation_requested()` (Line 679-686)
- [ ] 缺少 `CANCELLED` 最终状态
- [ ] 缺少实际调用 `connection.interrupt()`

**DuckDBPool 分析** (`api/core/duckdb_pool.py`):
- [x] 完整的连接池管理
- [x] 连接上下文管理器 `get_connection()`
- [x] `_close_connection()` 可用于销毁连接
- [ ] 缺少 `discard_connection()` 方法
- [ ] 缺少连接注册表

---

## Phase 1: ConnectionRegistry 模块

### Task 1.1: 创建 ConnectionRegistry 类
**文件**: `api/core/connection_registry.py`

- [ ] 创建 `ConnectionRecord` dataclass
  - connection: DuckDBPyConnection
  - task_id: str
  - thread_id: int
  - start_time: float
  - sql_preview: str

- [ ] 实现 `ConnectionRegistry` 类
  - `__init__`: 初始化 RLock 和字典
  - `register(task_id, connection, sql)`: 注册连接
  - `unregister(task_id)`: 注销连接
  - `get(task_id)`: 获取记录
  - `interrupt(task_id)`: 中断查询
  - `cleanup_stale(max_age)`: 清理过期条目
  - `get_active_count()`: 获取活跃数量
  - `get_all_tasks()`: 调试用

### Task 1.2: 创建单例实例
- [ ] 模块级别创建 `connection_registry = ConnectionRegistry()`
- [ ] 导出以供其他模块使用

### Task 1.3: 添加日志
- [ ] 所有关键操作添加 INFO 日志
- [ ] 异常情况添加 WARNING/ERROR 日志

---

## Phase 2: DuckDB 连接池改造

### Task 2.1: 添加 discard_connection 方法
**文件**: `api/core/duckdb_pool.py`

- [ ] 在 `DuckDBConnectionPool` 类中添加 `discard_connection()` 方法
- [ ] 使用 RLock 保护线程安全
- [ ] 查找连接 ID，关闭并从池中移除
- [ ] 如果低于最小连接数，触发补充
- [ ] 通知等待的线程

---

## Phase 3: TaskManager 集成

### Task 3.1: 新增 CANCELLED 状态
**文件**: `api/core/task_manager.py`

- [ ] 在 `TaskStatus` 枚举中添加 `CANCELLED = "cancelled"`
- [ ] 更新 `_coerce_status()` 支持 cancelled 状态
- [ ] 更新 `to_dict()` status_mapping 添加 cancelled 映射

### Task 3.2: 新增 mark_cancelled 方法
- [ ] 实现 `mark_cancelled(task_id, reason)` 方法
- [ ] 更新状态为 CANCELLED，设置 error_message 和 completed_at

### Task 3.3: 修改 request_cancellation 方法
- [ ] 在设置 CANCELLING 后调用 `connection_registry.interrupt()`
- [ ] 捕获中断失败异常，依赖轮询检查兆底

---

## Phase 4: async_tasks.py 集成

### Task 4.1: 修改 execute_async_query
**文件**: `api/routers/async_tasks.py`

- [ ] 导入 `interruptible_connection` 函数
- [ ] 将所有 DuckDB 执行语句放在 `interruptible_connection` context 内
- [ ] 捕获 `duckdb.InterruptException`，调用 `mark_cancelled`
- [ ] 在查询完成后检查取消请求，清理已创建的表
- [ ] ✅ 外部数据源流程也需套用 `interruptible_connection`

### Task 4.2: 修改 execute_async_federated_query
- [ ] 类似修改应用到联邦查询执行函数
- [ ] 确保 ATTACH/DETACH 和查询都在 `interruptible_connection` 内

> [!NOTE]
> **开发注意事项**：
> 1. `discarded` 标记可用于异常路径判断（如 `except` 分支中检查是否需要额外处理），如不需要可删除
> 2. 外部数据源的所有 DuckDB 执行语句必须在 `interruptible_connection` context 内
> 3. 注意娀套使用：如果已在 `interruptible_connection` 内，不要再嵌套一层

---

## Phase 5: 后台巡检任务

### Task 5.1: 实现守护线程
**文件**: `api/core/task_manager.py`

- [ ] 实现 `start_cancellation_watchdog()` 函数
- [ ] 实现 `cleanup_cancelling_timeout()` 清理超时任务
- [ ] 实现 `cleanup_stale_registry()` 清理注册表残留
- [ ] 在 TaskManager `__init__` 中启动守护线程

---

## Phase 6: 测试

### Task 6.1: ConnectionRegistry 单元测试
**文件**: `api/core/tests/test_connection_registry.py`

- [ ] **注册/获取/注销**：register → get → unregister，确保计数变化正确
- [ ] **interrupt 功能**：注册假连接（`duckdb.connect(':memory:')`），调用 interrupt 返回 True
- [ ] **线程安全**：多线程并发注册/注销不抛异常，最终计数为 0
- [ ] **cleanup_stale**：构造超龄条目，`ignore_suffix='_cleanup'` 时应被忽略

### Task 6.2: DuckDBPool 单元测试
**文件**: `api/core/tests/test_duckdb_pool.py`

- [ ] **discard_connection**：添加假连接条目 → discard → 连接数减少，补充连接（若低于最小数）被触发
- [ ] **get_connection 与 discard 配合**：模拟 InterruptException，确保 release 分支跳过已 discard 的连接

### Task 6.3: Cancel API 集成测试
**文件**: `api/tests/test_async_tasks.py`

- [ ] **运行中取消**：启动长查询（`SELECT * FROM range(1000000000)`），调用取消 API，状态变为 CANCELLED，注册表清空
- [ ] **取消已完成任务**：执行完成后再取消，返回 400
- [ ] **取消不存在任务**：返回 404
- [ ] **取消后清理**：确认结果表被 DROP（可查询 `information_schema.tables`）

### Task 6.4: 集成/端到端测试（手动或 e2e）

- [ ] 提交异步任务 → 立即取消 → 状态 1-2s 内变 CANCELLED；CPU/IO 不再持续
- [ ] 联邦查询（含 ATTACH）路径同上
- [ ] **Watchdog 验证**：人为将任务置为 CANCELLING 且超时，守护线程应强制标记 CANCELLED

### Task 6.5: 前端测试（后续落地时补充）

- [ ] 任务列表展示 CANCELLED；取消按钮禁用或隐藏
- [ ] 取消请求的错误提示（已完成、404）能正常呈现

---

## Phase 6: 文档与清理

### Task 6.1: API 文档更新
- [ ] 更新 API 文档，添加取消接口说明
- [ ] 添加请求/响应示例

### Task 6.2: 代码清理
- [ ] 移除调试代码
- [ ] 添加必要注释
- [ ] 代码格式化

### Task 6.3: 后台清理任务（可选）
- [ ] 实现定期清理 CANCELLING 超时任务
- [ ] 实现定期清理 Registry 过期条目

---

## 🚨 实施注意事项

> [!CAUTION]
> **请在实现时特别注意以下几点**

### 1. 全量替换执行入口
`execute_async_query` / `execute_async_federated_query` 必须全量替换成 `with interruptible_connection(task_id, clean_sql) as conn:`，避免出现旧的 `with pool.get_connection()` 块与 wrapper 并存的情况。

### 2. 状态转换严格执行
`duckdb.InterruptException` 抛出后调用 `task_manager.mark_cancelled(...)`，请确认所有“后续代码”都尊重该状态（例如不要再调用 `complete_task` 或 `fail_task`），并补充单元/集成测试验证状态转换。

### 3. 守护线程单例控制
`start_cancellation_watchdog` 在实际实现时要确保 **TaskManager 初始化只会触发一次**，否则会启动多个后台线程。常见策略是在模块级用 flag 或 `threading.Event` 控制。

### 4. 清理残留表
如果任务被取消时已经创建了持久表，现在的设计是在“取消检查点 2”里清理该表。可以考虑在 `mark_cancelled` 内或者单独函数里再做一层保险，用当前 `task.result_info`/`table_name` 清理残留表，避免漏掉意外流程。

### 5. 前端状态枚举
前端目前的状态枚举里是否有 `"cancelled"` 这一分支，需要在实现后确认。设计中已有 `status_mapping` 对应值，但前端要能正确识别。

---

## 🎯 验收标准

### 核心功能
- [ ] 取消 API 调用成功
- [ ] 任务状态在 2 秒内更新为 CANCELLED
- [ ] 被取消的查询停止执行
- [ ] 无连接泄露

### 错误处理
- [ ] 不存在任务返回 404
- [ ] 已完成任务返回 400
- [ ] 取消失败有明确错误信息

### 性能指标
- [ ] 取消接口响应 < 100ms
- [ ] 中断生效 < 2s

---

## 📝 备注

### 前端集成（后续迭代）
- 异步任务面板添加取消按钮
- 状态轮询或 WebSocket 更新
- 取消中状态显示

### 监控增强（后续迭代）
- 取消操作日志审计
- 活跃连接数监控
- 长时间运行任务告警

---

## 🔗 相关文件

| 文件 | 描述 |
|------|------|
| `api/core/task_manager.py` | 现有任务管理器 |
| `api/core/duckdb_pool.py` | 现有连接池 |
| `api/routers/async_tasks.py` | 异步任务路由 |
| `api/models/task.py` | 任务模型定义 |
