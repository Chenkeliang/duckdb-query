# Task 04 · 后端基础设施加固（连接池、配置与并发）

## 1. Spec

- 背景  
  - `api/core/duckdb_engine.py:247-319` 使用全局 DuckDB 连接，且对含 JOIN 的查询默认执行 `EXPLAIN ANALYZE`，导致高并发下线程安全隐患与性能翻倍消耗。  
  - `core/duckdb_pool.py` 已存在连接池实现，但未真正被生产路径使用。  
  - 配置、元数据文件散落（`config/` 与 `api/config/`），缺乏原子写入，无法支撑并发上传。  
  - 多处根据 `os.path.exists("/app")` 判断运行环境，缺少统一配置注入机制。

- 目标  
  1. 将所有 DuckDB 操作迁移到连接池，并提供统一的上下文管理 API。  
  2. 将性能诊断（EXPLAIN/SHOW TABLES）改为按需开启（如 DEBUG 模式或请求参数）。  
  3. 引入统一的配置/元数据存储路径管理，通过 `config_manager` 提供加锁写入。  
  4. 抽象运行环境参数（数据目录、扩展目录等），支持通过环境变量或配置文件覆盖。

- 非目标  
  - 不重写外部数据库连接池，仅聚焦 DuckDB。  
  - 不改动业务 API 结构，只调整内部调用方式。

- 成功标准  
  - 主要查询路径（同步/异步/可视化）均使用连接池上下文，不再直接访问全局 `_global_duckdb_connection`。  
  - DEBUG 日志可通过配置开关控制，默认关闭 `EXPLAIN ANALYZE`。  
  - `config/file-datasources.json` 等文件写入具备原子性，压测下不会出现损坏。  
  - 所有路径均支持通过 `AppConfig` 配置数据目录，避免硬编码 `/app`.

## 2. Design

- 连接池整合  
  - 在 `core/duckdb_engine.py` 中新增 `with_duckdb_connection()` 上下文：  
    ```python
    from contextlib import contextmanager
    from core.duckdb_pool import get_connection_pool

    @contextmanager
    def with_duckdb_connection():
        pool = get_connection_pool()
        with pool.get_connection() as con:
            yield con
    ```
  - `execute_query`, `register_dataframe`, `visual_query_generator` 等函数重构为接收连接或使用新上下文，移除 `_global_duckdb_connection`。  
  - 调整连接池配置读取逻辑，完全由 `config_manager.get_app_config()` 提供参数，避免模块导入时就加载配置。

- 调试开关  
  - 在 `AppConfig` 新增字段：`duckdb_debug_logging: bool`，`duckdb_auto_explain_threshold_ms: int`。  
  - `execute_query` 内部记录 `execution_time`，仅在超过阈值或显式开启调试时执行 `EXPLAIN`.  
  - 将 `SHOW TABLES` 调试信息移至 DEBUG 日志级别，默认不执行。

- 配置/元数据写入  
  - 为 `config_manager` 增加 `atomic_write(path, data)` 方法：  
    - 写入临时文件 (`path.tmp`) -> `os.replace`.  
    - 加入 `threading.Lock` 保证同进程串行。  
  - 所有写入元数据的模块（`file_datasource_manager`, `task_manager` 等）通过 `config_manager` 提供的接口写入。  
  - 目录管理：在 `AppConfig` 中新增 `duckdb_data_dir`, `exports_dir`, `config_dir` 可配置项；若为空则按默认路径生成。

- 环境抽象  
  - 封装 `get_base_dirs()` 帮助函数，替代 `if os.path.exists("/app")` 判断。  
  - 允许通过环境变量 `DUCKQUERY_DATA_DIR` 覆盖默认数据目录；配置文件也可设置。

- 测试  
  - 单元测试：  
    - 模拟多个线程同时写入元数据，验证文件未损坏。  
    - 检查 `execute_query` 在 debug on/off 时的行为。  
    - 连接池上下文使用的回归测试。  
  - 性能基准：在测试环境跑基本压力测试，确保连接池不会比单连接慢。

- 风险  
  - 改动范围大，需要逐步迁移每个使用 `get_db_connection()` 的模块，可分阶段提交。  
  - 原子写入在 Windows 上需确认 `os.replace` 行为，测试覆盖。
