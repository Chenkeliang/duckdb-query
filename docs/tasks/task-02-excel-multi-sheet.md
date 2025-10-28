# Task 02 · Excel 多 Sheet 支持与导入体验

## 1. Spec

- 背景
  - 需求指明 Excel 上传缺乏多工作表处理能力，当前 `api/core/file_datasource_manager.py:294-330` 仅读取首个 sheet。
  - 实际代码中 `create_table_from_file_path_typed()` 的 Excel 分支直接执行 `EXCEL_SCAN(?)`，上传路由（标准上传 `api/routers/data_sources.py:320`、分块上传 `api/routers/chunked_upload.py:302`）在文件落盘后即刻建表，没有“检查→选择”流程。
  - 合并单元格与多行表头沿用 DuckDB / pandas 默认行为：除左上角外的合并值被读为 `NULL`，多表头除首行外记为数据行，当前没有修正策略。
  - 用户需要在导入阶段选择 Sheet、命名生成的表，并保留各 Sheet 原始类型。
  - 透视/可视化等功能依赖明确的表命名与元数据，现状不支持。

- 目标
  1. 支持上传单个 Excel 文件时列出所有工作表，允许选择全部或部分表导入。
  2. 对每个 Sheet 生成独立 DuckDB 表（命名约定 `文件名__sheet名` 或自定义），并写入元数据（依赖 Task 01）。
  3. 前端上传界面新增 Sheet 选择 UI，显示列/预览、目标表名和命名规则提示。
  4. 若同名表存在，提供覆盖/追加选项或提示失败。
  5. 在检查阶段提示合并单元格、多行表头风险，并提供可选处理策略（表头行数、向下填充等）。

- 非目标
  - 不支持 Excel 多文件批量上传。
  - 不处理透视表/图形等 Excel 特殊结构。

- 成功标准
  - 上传包含 ≥3 个 sheet 的 Excel，能选择多张工作表导入，并在 DuckDB 中生成对应表。
  - 前端 Sheet 选择界面交互流畅，错误提示充分（文件损坏、表名冲突）。
  - 单元测试覆盖 Sheet 元数据解析、后端 API 行为。

## 2. Design

- 后端实现
  - 上传阶段（标准与分块）统一改为“落盘但不建表”，返回 `file_id`；仅当扩展名为 Excel 时进入 Task02 流程，其它格式仍调用 `create_table_from_file_path_typed()`。
  - 在 `file_datasource_manager` 新增 `inspect_excel_sheets(file_path)`：
    - 优先通过 DuckDB `EXCEL_META`/`excel_scan` 获取 Sheet 名称、行列统计。
    - 失败时 fallback 到 `pandas.ExcelFile(sheet_name=None, engine='openpyxl')`，并记录 `merge_cells` 等信息。
    - 输出中标记潜在风险（合并单元格、多行表头），并可选返回前 N 行样本。
  - 新增 API：
    1. `POST /api/data-sources/excel/inspect`：传入 `file_id`，返回所有 sheet 元数据、列推断及风险提示。
    2. `POST /api/data-sources/excel/import`：传入 `file_id` 与 `sheets: [{name, target_table, mode, header_rows, fill_merged}]`，在单事务中逐张建表，任意 sheet 失败则回滚。
  - 导入阶段根据用户配置生成 `EXCEL_SCAN(file, sheet='...')` 或 `pd.read_excel(sheet_name=..., header=header_rows-1, merge_cells=fill_merged)` 结果，再调用 `create_typed_table_from_dataframe()` 写入 DuckDB。
  - 保存配置时记录 `source_file`, `sheet_name`, `target_table`, `ingest_mode`, `header_rows`, `header_row_index`, `fill_merged` 等字段，保持 `column_profiles` 输出兼容。

- 前端改动
  - `DataUploadSection.jsx`：标准/分块上传完成后仅拿到 `file_id`，若文件类型为 Excel 则进入 sheet 选择流程（模态或抽屉）。
  - Sheet 选择界面展示名称、行列数、列概要、预览数据及风险提示，支持勾选、目标表名输入、覆盖/追加模式选择、表头起始行/行数、合并单元格填充开关，并实时校验与现有数据源的命名冲突。
  - 用户确认后调用新 `excel/import` API；显示 per-sheet 进度与结果，成功后刷新数据源列表并清理状态，失败时保留可重试入口。
  - 文案提示更新为“勾选工作表并设置目标表名，即可导入 Excel 多 Sheet 数据”，替换原“先选字段再拖拽”的描述。
  - 样式注意事项：避免深色背景与 `.MuiPaper-root` 冲突（必要时自定义 class 覆盖），组件内尽量使用 `sx` 或 CSS module 以规避 `.dark .MuiBox-root` 全局样式。

- API Schema
  ```json
  // POST /api/data-sources/excel/inspect
  {
    "file_id": "temporary-upload-uuid",
    "sheets": [
      {
        "name": "Sheet1",
        "rows": 1200,
        "header_rows": 1,
        "suggested_header_row_index": 1,
        "has_merged_cells": true,
        "columns": [
          {"name": "order_id", "duckdb_type": "VARCHAR"},
          {"name": "amount", "duckdb_type": "DOUBLE"}
        ],
        "preview": [
          {"order_id": "A001", "amount": 12.5}
        ]
      }
    ]
  }
  ```
  ```json
  // POST /api/data-sources/excel/import
  {
    "file_id": "temporary-upload-uuid",
    "sheets": [
      {
        "name": "Sheet1",
        "target_table": "orders_2024",
        "mode": "replace", // or "fail", "append"
        "header_rows": 1,
        "header_row_index": 1,
        "fill_merged": true
      }
    ]
  }
  ```

- 测试
  - 后端：Pytest 覆盖 sheet 列表检测、合并单元格/多表头参数处理、导入成功、任一 sheet 失败时的事务回滚、命名冲突反馈。
  - 前端：新增组件单测（Jest/RTL）模拟 inspect→导入流程，验证风险提示、命名冲突、错误处理。
  - E2E（可选）：使用 Playwright 跑一次完整导入。

- 风险与缓解
  - 大文件多 sheet 性能：按需懒加载预览，只在用户展开时读取样本；必要时限制预览行数。
  - Sheet 名含特殊字符：后端统一做安全转义并建议默认 `snake_case`，前端实时展示最终表名。
  - 合并单元格、表头错位：在 inspect 阶段提示风险并提供 forward-fill、表头行数等修正参数。
  - 临时文件堆积：利用 `schedule_cleanup` 或定时任务清理缓存。

- 兼容性说明
  - CSV / Parquet / JSON 仍沿用现有上传→建表流程，不进入 inspect/import 逻辑。
  - `/api/upload` 与 `/api/upload/complete` 需在识别文件类型后决定是否走 Excel 新流程，确保其它格式的行为、性能不受影响。
