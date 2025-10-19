# Task 05 · 异步任务持久化与导出治理

## 1. Spec

- 背景  
  - `api/core/task_manager.py` 将任务信息保存在进程内存中，服务重启后任务历史和导出记录全部丢失。  
  - 导出的文件存放在 `exports/`，缺乏生命周期管理，长期运行可能堆积大量临时文件。  
  - 前端 `AsyncTaskList` 依赖轮询内存状态，无法展示重启前的任务；用户体验下降。

- 目标  
  1. 将异步任务信息持久化（DuckDB 表或独立 SQLite），支持恢复历史、查询状态。  
  2. 为导出文件提供元数据记录（生成时间、任务关联、过期策略），按计划清理。  
  3. 调整 API：支持分页、过滤历史任务，返回文件下载链接存在性。  
  4. 前端展示在刷新/重启后仍能加载历史任务，并提示导出文件是否已被清理。

- 非目标  
  - 不实现分布式任务队列，本任务仍基于单进程执行。  
  - 不引入复杂的权限控制，只确保持久化和清理。

- 成功标准  
  - 服务重启后仍可通过 API 查询到历史任务及其状态。  
  - 导出目录保持可控大小（例如 7 天到期自动删除）。  
  - 前端任务列表显示“文件已清理/仍可下载”状态。

## 2. Design

- 数据持久化  
  - 选用 SQLite 或 DuckDB 内部表（建议 DuckDB，减少依赖）。  
  - 创建 `async_tasks` 表结构：  
    ```sql
    CREATE TABLE async_tasks (
      task_id TEXT PRIMARY KEY,
      status TEXT,
      query TEXT,
      task_type TEXT,
      datasource JSON,
      result_file_path TEXT,
      error_message TEXT,
      created_at TIMESTAMP,
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      execution_time DOUBLE,
      metadata JSON
    );
    ```
  - 创建 `task_exports` 表记录导出文件（文件名、大小、expires_at、task_id）。

- TaskManager 改造  
  - 将 `TaskManager` 方法改为读写上述表：  
    - `create_task`/`start_task`/`complete_task`/`fail_task` → 执行 SQL 更新。  
    - 新增 `cleanup_expired_exports()`，定期扫描 `task_exports`，删除过期文件并更新状态。  
  - 使用连接池上下文（依赖 Task 04）。  
  - 对于并发访问，确保利用事务或锁避免同一任务被重复更新。

- API 变化  
  - `GET /api/async_tasks?status=running&limit=50&offset=0` 分页返回。  
  - `GET /api/async_tasks/{task_id}` 直接从持久化表查询。  
  - 在返回数据中增加 `export_status`: `"available" | "expired" | "not_applicable"`.  
  - 后端在启动时初始化数据库表，如不存在则创建。

- 前端调整  
  - `frontend/src/components/AsyncTasks/AsyncTaskList.jsx`  
    - 支持分页和筛选（状态筛选器）。  
    - 显示导出状态 badge；若下载链接已失效，禁用下载按钮并提示重新生成。  
    - 轮询间隔可以加倍（因持久化后可靠性提升），减少请求压力。

- 清理策略  
  - 在 `AppConfig` 增加 `export_retention_hours`。  
  - 启动时或定时任务中调用 `cleanup_expired_exports`。  
  - 删除文件时需捕获异常（文件可能已被外部删除），并更新数据库状态。

- 测试  
  - 单元测试：创建/完成任务后重建 TaskManager，验证能加载历史。  
  - 集成测试：模拟任务创建 -> 生成导出 -> 标记过期 -> 清理 -> 前端状态正确。  
  - 需覆盖异常路径（文件不存在、数据库锁超时）。

- 风险  
  - 持久化操作增加 IO，需确保在高频任务下性能可接受；如必要可批量写或使用 WAL 模式。  
  - 清理任务与上传/导出同时进行时需处理文件正在被使用的情况，可在删除前检查文件锁或采用重命名+延迟删除策略。
