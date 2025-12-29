# 通用查询取消机制 - 需求文档

> **版本**: 1.2  
> **创建时间**: 2024-12-25  
> **更新时间**: 2024-12-25  
> **状态**: 🟢 设计完成

---

## 1. 背景与目标

### 1.1 问题陈述

当前系统中存在多种查询入口，用户在执行长时间查询时无法中途取消：

| 查询类型 | 入口 | 当前状态 |
|---------|------|----------|
| SQL 查询 | `/api/duckdb/query` | ❌ 不可取消 |
| JOIN 查询 | `/api/query` | ❌ 不可取消 |
| 聚合/可视化查询 | `/api/visual-query/preview` | ❌ 不可取消 |
| 联邦查询 | `/api/federated-query` | ❌ 不可取消 |
| 异步任务 | `/api/async_tasks` | ✅ 已支持取消 |

### 1.2 目标

为**所有同步查询**提供取消能力：
- 用户在前端点击"取消"按钮
- 后端中断正在执行的 DuckDB 查询
- 前端显示取消状态

---

## 2. 核心需求

### 2.1 功能需求

| ID | 需求 | 优先级 |
|----|------|--------|
| FR-1 | SQL 查询可取消 | P0 |
| FR-2 | JOIN 查询可取消 | P0 |
| FR-3 | 聚合查询可取消 | P0 |
| FR-4 | 联邦查询可取消 | P1 |
| FR-5 | 前端显示"运行中"状态 | P0 |
| FR-6 | 前端显示取消按钮 | P0 |
| FR-7 | 取消后 UI 恢复可用 | P0 |

### 2.2 非功能需求

| ID | 需求 | 指标 |
|----|------|------|
| NFR-1 | 取消响应时间 | < 2s |
| NFR-2 | 无连接泄露 | 0 |
| NFR-3 | 不影响正常查询 | 100% |

---

## 3. 范围说明

### 3.1 本期覆盖

| 端点 | 描述 |
|------|------|
| `/api/duckdb/query` | SQL 查询 |
| `/api/query` | JOIN 查询 |
| `/api/visual-query/preview` | 聚合查询预览 |
| `/api/federated-query` | 联邦查询 |
| `/api/distinct-values` | 唯一值查询 |

### 3.2 不在本期范围

- 导出操作 (`/api/export/*`)
- Schema 刷新
- 数据预览
- 批量操作

---

## 4. 设计约束

### 4.1 标识符隔离

- 同步查询使用 `sync:` 前缀
- 异步任务使用 `task:` 前缀（或保持现状）
- 避免命名空间冲突

### 4.2 单查询假设

- 每个面板同时只运行一条查询
- 不支持并发场景

### 4.3 复用原则

- 复用现有 `ConnectionRegistry`
- 复用现有 `interruptible_connection`
- 不新建重复包装器

### 4.4 方案 B（最小改动）

- 本期仅新增取消 API 响应符合规范：
  - `POST /api/query/cancel/{request_id}` 返回：
    ```json
    {
      "success": true,
      "data": { "request_id": "xxx" },
      "messageCode": "QUERY_CANCELLED",
      "message": "取消请求已提交",
      "timestamp": "2024-12-25T..."
    }
    ```
- 现有查询端点（`/api/duckdb/query`、`/api/query`、`/api/visual-query/preview`、`/api/federated-query`、`/api/distinct-values`）保持原有返回格式，后续再统一改造。
- 前端 Hook 兼容判定取消：
  ```ts
  const isCancelled =
    response.status === 499 ||
    data?.messageCode === 'QUERY_CANCELLED' ||
    data?.cancelled === true;
  ```
- 目标：影响范围最小，预估增加 ~1h 工作量

### 4.5 i18n 映射要求

- 后端返回的 `message`/`error.message` 为默认中文，仅提供 `messageCode` 作为国际化键；前端必须根据当前语言用 `messageCode` 做本地化渲染，`message` 仅作 fallback。
- 取消 API 同样遵循上述规则，前端在多语言切换时不可直接使用后端 `message` 展示。

### 4.6 非标准错误响应梳理（需标准化为 messageCode + timestamp，前端用 messageCode 做 i18n）

> **要求**：保持现有功能不变，仅将直接 `HTTPException(detail=\"中文文案\")` 的返回改为规范错误体（success=false + error{code,message,details} + messageCode + message + timestamp）。

| 文件 | 位置/函数 | 当前文案示例 |
|------|-----------|-------------|
| `api/routers/async_tasks.py` | get_async_task/cancel_async_task/retry_async_task/generate_and_download_file | “任务不存在”“原任务缺少SQL，无法重试”“生成的文件不存在” |
| `api/routers/chunked_upload.py` | process_streaming_upload/upload_chunk/complete_upload/cancel_upload | “无法创建流式上传通道”“文件哈希验证失败，文件可能已损坏”“上传会话不存在” |
| `api/routers/data_sources.py` | refresh/create/update/delete/get/connect/import_excel/inspect_excel | “未找到数据库连接”“数据库连接创建/更新失败”“未找到对应的Excel缓存文件，请重新上传。” |
| `api/routers/duckdb_query.py` | execute_duckdb_query | “SQL查询不能为空” |
| `api/routers/paste_data.py` | save_paste_data | “表名/列名/数据不能为空”“列名和列类型数量不匹配”“列配置不能为空” |
| `api/routers/query.py` | get_distinct_values/execute_sql/save_query_to_duckdb | “不支持的聚合函数”“缺少数据源ID”“请提供DuckDB表别名/SQL查询语句”“查询结果为空，无法保存” |
| `api/routers/server_files.py` | 路径/文件检查 | “缺少路径参数”“路径不在允许的挂载目录内”“路径不存在/不是目录/不是文件”“没有权限读取该目录” |
| `api/routers/sql_favorites.py` | create/update/delete/use_sql_favorite | “收藏名称已存在”“SQL收藏不存在” |

---

## 5. 验收标准

### 5.1 功能验收

- [ ] SQL 查询面板：点击执行 → 显示取消按钮 → 点击取消 → 查询中断
- [ ] JOIN 查询面板：同上
- [ ] 聚合查询面板：同上
- [ ] 联邦查询面板：同上
- [ ] 取消后 2 秒内 CPU 使用率下降

### 5.2 边界情况

- [ ] 取消已完成的查询 → 无操作
- [ ] 取消不存在的请求 → 返回 404
- [ ] 连续快速点击 → 防抖/禁用处理

### 5.3 UI/UX 验收

- [ ] 运行中显示 Spinner + "运行中..."
- [ ] 运行中显示取消按钮，执行按钮禁用
- [ ] 取消后显示黄色提示 + 重试按钮
- [ ] 错误后显示红色提示 + 重试按钮

---

## 6. 运维影响

- 499 状态码不计入错误率统计
- 取消操作记录为 INFO 级别日志
- 更新告警规则排除取消场景
