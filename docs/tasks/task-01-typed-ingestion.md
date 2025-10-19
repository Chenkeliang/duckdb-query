# Task 01 · Typed Ingestion & Metadata Overhaul

## 1. Spec

- 背景  
  - 当前 `api/core/file_datasource_manager.py:285-369` 强制将上传数据全部转为 `VARCHAR`，导致关联、聚合失真，并触发大量前端数值转型逻辑。  
  - 元数据仅存储列名称（`api/core/file_datasource_manager.py:410-418`），没有类型、样本、统计信息，无法驱动可视化和类型敏感功能。  
  - 现阶段可以重新上传文件并删除旧表，因此无需为历史数据保留兼容或迁移路径。

- 目标  
  1. 上传 CSV/Parquet/Excel 时保留 DuckDB 推断的原生类型，并在必要时支持自定义 schema，同时保证数值精度不低于原始文件（例如保留 DECIMAL 精度、避免无意义的 double 转换）。  
  2. 在配置存储中记录列的 DuckDB 类型、推断统计（null/distinct/min/max/示例值），对 `config_manager` 获取的路径保持兼容。  
  3. 前端在接收表结构时先根据列类型做一级校验；若用户配置的 JOIN/聚合存在潜在冲突，在提交前弹出类型提示；后端再进行二级验证，如仍存在冲突则返回 `type_conflicts` 供选择 `TRY_CAST`。  
  4. 新数据文件直接按原生类型落库，无需考虑旧数据迁移。

- 非目标  
  - 不重写前端所有数值处理，仅确保新的类型信息可用，并渐进式调整组件。  
  - 不构建完整的 schema 管理 UI。  
  - 不对既有 DuckDB 表执行自动迁移或兼容逻辑。

- 成功标准  
  - 上传后在 DuckDB 中 `PRAGMA table_info` 返回的类型匹配原始数据类型 >90% 用例（文件样本）。  
  - 元数据文件/表包含 `name`, `duckdb_type`, `statistics` 字段，并能经由 API 返回给前端。  
  - 当列类型冲突时，前端弹窗提示并允许选择 `TRY_CAST` 目标类型；用户确认后生成的 SQL 含所选转换，相关单元测试覆盖。

## 2. Design

- 数据流 & 模块改动  
  - `file_datasource_manager`  
    - 新增 `create_table_from_file_path_typed(...)`：去除 `ALL_VARCHAR`，使用 DuckDB 原生读取（`read_csv_auto` 默认类型）或 pandas dtype 推断。  
    - 对于 Excel，通过 `EXCEL_SCAN` 直接读取 typed 结果；若回退到 pandas，使用 pandas dtype -> DuckDB 类型映射。  
    - 引入 `ColumnProfile` 数据类（字段：`name`, `duckdb_type`, `nullable`, `precision`, `scale`, `sample`, `null_count`, `distinct_count`, `min`, `max`）并保存到统一元数据存储（参考 Task 04）。  
    - 上传任务中在 `duckdb_con` 层启用高精度推断：`SET decimal_infer_max_length=38; SET decimal_infer_max_scale=18;`；CSV 路径增加 `read_csv_auto(..., decimal_handling_mode='strict')`。  
    - 增加事务式写入：采用临时文件 + 原子 rename，避免并发覆盖。  
  - `core/visual_query_generator.py` & `routers/query.py`  
    - 新增 `POST /api/visual-query/validate`，接收 `VisualQueryConfig`、前端记录的 `columnProfiles` 以及用户首选转换。返回结构含 `{ conflicts: [...], suggested_casts: [...] }`。  
    - 在 SQL 生成前读取元数据，并与前端提交的类型（`columnProfiles`）进行逐列比对；若发现后端检测类型有差异或用户未选转换，则在 `conflicts` 中写明：`{ left: {table,column,type}, right: {...}, operation: 'join'|'aggregation', recommended: ['DECIMAL(18,4)', 'VARCHAR'] }`。  
    - 当用户在前端确认选择后，生成接口携带 `resolved_casts`（如 `{column: 'orders.amount', cast: 'DECIMAL(18,2)'}`），后端在 `_build_join_clause`/`_build_select_clause` 中将目标列替换为 `TRY_CAST(column AS cast)`。  
    - 无需处理旧表兼容或迁移分支。  
  - 前端交互协定（由 Task 03 实现 UI）：  
    - 更新 `ShadcnApp.buildColumnTypeMap`：在构建 `columnProfiles` 时保留 `rawType`、`normalizedType`、`precision`、`scale` 并缓存于 `queryContext`; `ColumnSelector` 和 `AggregationControls` 直接读取 `columnProfiles` 展示类型徽标。  
    - 在 `VisualAnalysisPanel` 内添加 `useTypeConflictCheck` hook（新建 `frontend/src/hooks/useTypeConflictCheck.js`），负责：  
      1. 根据前端已有 `columnProfiles` 对 JOIN 条件和聚合进行即时校验。  
      2. 若本地检测到冲突，向用户弹出 `TypeConflictDialog`（见下文）提供转换选项。  
      3. 在用户点击“运行分析”时，先调用 `POST /api/visual-query/validate`，若返回 `conflicts`，再次弹窗并根据用户选择发送 `resolved_casts`。  
    - `TypeConflictDialog`（新增文件 `frontend/src/components/QueryBuilder/VisualAnalysis/TypeConflictDialog.jsx`）呈现冲突列表表格（列名、当前类型、对端类型、推荐转换），支持批量选择转换并显示将插入的 SQL 片段。  
    - 为了保持体验连贯，新增 `数据类型说明` 帮助入口：`TypeConflictDialog` 顶部提供 `?` 图标，打开 `frontend/src/components/QueryBuilder/VisualAnalysis/TypeHelpPopover.jsx`，内置简短说明并链接到 `docs/TYPE_GUIDE.md`。

- 数据存储  
  - 将原 `config/file-datasources.json` 挪到 `config/` 根目录或统一通过 `config_manager` 访问。  
  - 元数据结构示例（JSON 或 DuckDB 表均可）：  
    ```json
    {
      "source_id": "uploaded_sales",
      "schema_version": 2,
      "columns": [
        {
          "name": "amount",
          "duckdb_type": "DOUBLE",
          "null_count": 0,
          "distinct_count": 120,
          "min": 1.5,
          "max": 9200.0,
          "sample_values": ["12.5", "88.0"]
        }
      ]
    }
    ```

- API 变更  
  - `GET /api/database_table_details` & Visual Query 元数据响应新增列类型字段。  
  - 如需向前兼容，在响应中保留 `columns: ["col1", ...]`，并新增 `column_profiles`.

- 测试计划  
  - 新增 Pytest 覆盖：CSV/Excel/JSON 上传后校验 DuckDB 类型、元数据内容；JOIN 场景下验证自动 `TRY_CAST` 行为。  
  - 集成测试：通过 `client.post("/api/visual-query/generate")` 验证 typed metadata 的使用。  
  - 前端单测：  
    - `useTypeConflictCheck` 针对 JOIN、SUM、AVG 情形的本地校验。  
    - `TypeConflictDialog` 渲染冲突表、默认推荐、SQL 提示信息。  
  - 端到端验证：模拟上传 → 添加 JOIN → 触发冲突 → 选择转换 → 成功生成 SQL。

- 风险 & 缓解  
  - 类型推断错误：允许用户在上传接口中传入类型覆盖或在弹窗中选择 `TRY_CAST` 到 `VARCHAR`/`DECIMAL` 等以规避。  
  - 数值精度：在 CSV/Excel 读取阶段启用 DuckDB 的 `decimal_infer_max_length` 等设置，必要时允许用户指定保留的小数位。
  - 用户忽略弹窗：在执行 SQL 前再度校验，若出现未解决的冲突则阻止执行并提示。
