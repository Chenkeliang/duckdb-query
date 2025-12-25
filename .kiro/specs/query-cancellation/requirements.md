# 查询取消机制需求文档 (Query Cancellation)

> **版本**: 1.2  
> **创建时间**: 2024-12-25  
> **更新时间**: 2024-12-25  
> **状态**: 🟢 需求确认

---

## 📋 需求概述

为 DuckQuery 项目实现**连接注册表 + 异步中断机制**，使用户能够取消正在执行的长时间查询，避免资源浪费和用户等待。

### 背景问题

1. **DuckDB 缺乏 SQL 级超时控制**：不像 MySQL 有 `SET max_execution_time`
2. **现有异步任务无法中断**：一旦运行，除非进程级别终止，否则无法提前停止
3. **前端取消按钮未生效**：UI 有取消按钮，但后端实际未实现中断逻辑

### 目标能力

| 目标 | 描述 |
|------|------|
| 异步任务可取消 | 支持取消正在执行的异步 DuckDB 查询 |
| 状态一致 | 取消后及时更新任务状态，反馈至 UI |
| 侵入最小 | 复用现有 `task_manager`、`duckdb_pool` 结构，渐进式改造 |
| 安全可靠 | 避免连接泄露，提供清理机制，确保线程安全 |

> [!IMPORTANT]
> **当前范围**: 仅异步任务支持取消，同步查询暂不在本期范围内

---

## 🔬 技术调研结果

### DuckDB 中断机制

| 项目 | 详情 |
|------|------|
| **API 方法** | `connection.interrupt()` |
| **异常类型** | `duckdb.InterruptException`（继承自 `DatabaseError`） |
| **中断时机** | 非立即，依赖 DuckDB 内部检查点，复杂查询可能延迟 |
| **连接复用** | 中断后连接建议销毁重建，避免状态污染 |

**验证代码**：

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
    except Exception as e:
        print(f"其他异常: {type(e).__name__}: {e}")

thread = threading.Thread(target=run_query)
thread.start()
time.sleep(0.5)
conn.interrupt()
thread.join()
```

### 现有代码分析

#### TaskManager (`api/core/task_manager.py`)

**已有能力**：
- ✅ `TaskStatus.CANCELLING` 状态已定义（Line 70）
- ✅ `request_cancellation()` 方法已实现（Line 643-677）
- ✅ `is_cancellation_requested()` 检查已实现（Line 679-686）
- ⚠️ 缺少 `CANCELLED` 最终状态
- ❌ 缺少实际调用 `connection.interrupt()` 的逻辑

**现有取消流程**：
```
request_cancellation() → 设置状态为 CANCELLING
                       → 记录 cancellation_requested 元数据
                       → 但没有实际中断查询执行！
```

#### DuckDBPool (`api/core/duckdb_pool.py`)

**已有能力**：
- ✅ 完整的连接池管理（创建、释放、错误处理）
- ✅ 连接上下文管理器 `get_connection()`
- ✅ `_close_connection()` 可用于销毁连接
- ❌ 缺少连接注册表
- ❌ 缺少可中断连接包装器

### 差距分析

| 组件 | 现有状态 | 需要添加 |
|------|---------|---------|
| ConnectionRegistry | ❌ 不存在 | 新增模块 |
| interruptible_connection | ❌ 不存在 | 在 duckdb_pool.py 中添加函数型包装器 |
| TaskManager 集成 | ⚠️ 部分存在 | 添加 CANCELLED 状态 + interrupt 调用 |
| Cancel API | ⚠️ 状态更新存在 | 添加 interrupt 调用 |
| 前端集成 | ✅ 已有 UI | 验证状态刷新 |

---

## 🛡️ 范围约束

> [!CAUTION]
> **本期仅支持异步任务取消，同步查询暂不支持**

**原因**：
1. 同步查询无任务 ID，无法通过 API 取消
2. 需要为每个请求生成唯一 token 并传递给前端
3. 复杂度较高，收益不明显（同步查询通常较快）

**本期范围**：
- ✅ 异步任务 (`/api/async_query`) 可取消
- ✅ 联邦异步查询可取消
- ❌ 同步查询 (`/api/query`) 暂不支持

**后续可能方案**（P2）：
- 为同步查询生成 request-scoped token
- 前端通过 WebSocket 或 token 取消
- 同步查询超时自动取消（配置化）

---

## ✅ 支持的查询类型

查询取消机制工作在 **DuckDB 连接层**，通过 `connection.interrupt()` 中断正在执行的查询。这意味着所有通过异步任务执行的查询都可以被取消：

| 查询类型 | 执行入口 | 是否支持取消 |
|---------|---------|-------------|
| 单表查询 | `execute_async_query` | ✅ 支持 |
| JOIN 查询 | `execute_async_query` | ✅ 支持 |
| 聚合查询 | `execute_async_query` | ✅ 支持 |
| 联邦查询 | `execute_async_federated_query` | ✅ 支持 |

**核心原理**：无论是 `SELECT * FROM table`、`JOIN`、`GROUP BY` 还是跨库联邦查询，只要通过 `interruptible_connection` 包装执行，都可以被中断。

---

## 🎯 用户故事

### 故事 1: 取消长时间查询
> 作为数据分析师，我执行了一个复杂的联邦查询，发现时间过长想要取消，以便修改查询条件重新执行。

**验收标准**:
- [ ] 异步任务面板显示"取消"按钮
- [ ] 点击取消后，任务状态变为"取消中"
- [ ] 1-2 秒内任务状态变为"已取消"
- [ ] 查询不再消耗 CPU/IO 资源

### 故事 2: 取消后重新执行
> 作为用户，我取消了一个查询后，希望能立即用同样的连接执行新查询。

**验收标准**:
- [ ] 取消后连接能正常复用或重建
- [ ] 不影响后续查询的正确性
- [ ] 无残留状态污染

### 故事 3: 批量任务管理
> 作为用户，我有多个异步任务在运行，希望能批量查看和管理它们。

**验收标准**:
- [ ] 任务列表实时更新状态
- [ ] 可以逐个取消或批量取消
- [ ] 取消后的任务从"运行中"移除

---

## 🔒 边界条件与约束

### 状态机定义

```
PENDING → RUNNING → COMPLETED
                  ↘ FAILED
                  ↘ CANCELLING → CANCELLED
```

| 当前状态 | 允许取消 | 取消后状态 |
|---------|---------|-----------|
| PENDING | ✅ | CANCELLED（直接取消，无需中断） |
| RUNNING | ✅ | CANCELLING → CANCELLED |
| CANCELLING | ❌ | - |
| COMPLETED | ❌ | - |
| FAILED | ❌ | - |
| CANCELLED | ❌ | - |

### 异常处理

| 场景 | 处理方式 |
|------|---------|
| 任务不存在 | 返回 404 错误 |
| 任务已完成 | 返回 400，提示"任务已完成" |
| 中断超时 | 5秒后强制标记为 CANCELLED |
| 连接已释放 | 直接标记为 CANCELLED |
| 注册表条目泄露 | 定期清理超过 30 分钟的条目 |

### 线程安全要求

- `ConnectionRegistry` 使用 `threading.RLock` 保护共享数据
- 注销操作放在 `finally` 块确保执行
- 避免竞态条件：取消与完成同时发生时，以先到者为准

---

## 🚨 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 注册表泄露 | 内存增长、状态不一致 | `finally` 中必须 unregister；定期清理任务 |
| 中断后连接状态不确定 | 后续查询可能失败 | 中断后销毁连接，从池中移除 |
| 取消延迟 | 用户体验不佳 | UI 显示"取消中"状态；设置超时机制 |
| 异常类型不确定 | 捕获失败 | 预先测试 DuckDB 中断异常类型 |

---

## ✅ 验收标准

### 功能验收
- [ ] 取消接口返回成功，任务状态在 1-2 秒内更新为 CANCELLED
- [ ] 被取消的查询不再消耗 CPU/IO 资源
- [ ] ConnectionRegistry 无残留条目
- [ ] 前端任务列表状态正确更新

### 性能验收
- [ ] 取消操作响应时间 < 100ms
- [ ] 中断生效时间 < 2s（依赖 DuckDB 检查点）
- [ ] 注册表操作 O(1) 复杂度

### 兼容性验收
- [ ] 不影响现有同步查询接口
- [ ] 与现有任务管理逻辑兼容
- [ ] 前端无需大幅修改

---

## 🌐 API 规范

### 取消任务

```
POST /api/async-tasks/{task_id}/cancel
```

**请求参数**：
- `task_id` (path): 任务 ID

**成功响应** (200):
```json
{
  "success": true,
  "data": {
    "taskId": "abc123",
    "status": "CANCELLING"
  },
  "messageCode": "TASK_CANCEL_REQUESTED"
}
```

**错误响应** (400/404):
```json
{
  "success": false,
  "error": {
    "code": "TASK_NOT_CANCELLABLE",
    "message": "Task has already completed"
  }
}
```

---

## 📋 实现优先级

### P0 - 核心功能
1. ConnectionRegistry 模块
2. InterruptibleConnection 上下文管理器
3. Cancel API 路由

### P1 - 集成与稳定性
4. TaskManager 集成
5. 异常处理与状态同步
6. 定期清理机制

### P2 - 前端与监控
7. 前端取消按钮集成
8. 任务状态实时刷新
9. 监控与告警
