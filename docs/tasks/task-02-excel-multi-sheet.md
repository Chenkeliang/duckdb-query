# Task 02 · Excel 多 Sheet 支持与导入体验

## 1. Spec

- 背景  
  - 需求指明 Excel 上传缺乏多工作表处理能力，当前 `api/core/file_datasource_manager.py:294-330` 仅读取首个 sheet。  
  - 用户需要在导入阶段选择 Sheet、命名生成的表，并保留各 Sheet 原始类型。  
  - 透视/可视化等功能依赖明确的表命名与元数据，现状不支持。

- 目标  
  1. 支持上传单个 Excel 文件时列出所有工作表，允许选择全部或部分表导入。  
  2. 对每个 Sheet 生成独立 DuckDB 表（命名约定 `文件名__sheet名` 或自定义），并写入元数据（依赖 Task 01）。  
  3. 前端上传界面新增 Sheet 选择 UI，显示列/预览、目标表名和命名规则提示。  
  4. 若同名表存在，提供覆盖/追加选项或提示失败。

- 非目标  
  - 不支持 Excel 多文件批量上传。  
  - 不处理透视表/图形等 Excel 特殊结构。

- 成功标准  
  - 上传包含 ≥3 个 sheet 的 Excel，能选择多张工作表导入，并在 DuckDB 中生成对应表。  
  - 前端 Sheet 选择界面交互流畅，错误提示充分（文件损坏、表名冲突）。  
  - 单元测试覆盖 Sheet 元数据解析、后端 API 行为。

## 2. Design

- 后端实现  
  - 在 `file_datasource_manager` 新增 `inspect_excel_sheets(file_path)`：  
    - 首选 DuckDB `EXCEL_META`/`excel_scan` 获取 Sheet 名、行列数。  
    - 失败时 fallback 到 `pandas.ExcelFile(sheet_name=None)` 提取基本信息。  
  - 上传流程调整：  
    1. 初始上传只缓存文件和 sheet 列表，不立即建表。  
    2. 新增 API `POST /api/data-sources/excel/inspect` 返回 sheet 列表、类型推断预览（前 20 行）。  
    3. 新增 API `POST /api/data-sources/excel/import`，接受 `sheets: [{name, target_table, options}]`，逐张创建 typed 表。  
  - 执行导入时依赖 Task 01 的 typed 建表逻辑。导入多个 sheet 需要在一次事务内执行，若任意失败则回滚。  
  - 元数据写入：在 `config` 中为每个 sheet 保存 `source_file`, `sheet_name`, `target_table`.

- 前端改动  
  - 组件：`frontend/src/components/DataSourceManagement/DataUploadSection.jsx`（或相关上传组件）  
    - 上传 Excel 后调用 `inspect` API，展示 Sheet 列表（名称/预览行数）。  
    - 提供勾选框、自定义目标表名输入、命名冲突校验（可使用已有 `datasources` 列表）。  
    - 若用户选择多 sheet，显示导入进度条，逐个展示成功/失败状态。  
  - 样式注意事项：  
    - 现有全局 `frontend/src/styles/modern.css` 会对 `.MuiPaper-root` 等组件强制背景色，需要在 sheet 预览中避免 `Paper` 嵌套的深色冲突，可自定义 class 并覆盖 `background-color`。  
    - 组件内尽量使用局部样式（`sx` 或 CSS module）避免被 `.dark .MuiBox-root` 覆盖。

- API Schema  
  ```json
  // POST /api/data-sources/excel/inspect
  {
    "file_id": "temporary-upload-uuid",
    "sheets": [
      {
        "name": "Sheet1",
        "rows": 1200,
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
        "mode": "replace" // or "fail", "append" (扩展目标)
      }
    ]
  }
  ```

- 测试  
  - 后端：Pytest 覆盖 sheet 检测、导入成功/失败、事务回滚。  
  - 前端：新增组件单测（Jest/RTL）模拟 inspect/import 流程，验证交互文案。  
  - E2E（可选）：使用 Playwright 跑一次完整导入。

- 风险与缓解  
  - 大文件多 sheet 性能：按需懒加载预览，只在用户展开时读取样本。  
  - Sheet 名含特殊字符：在后端统一做安全转义并建议默认 `snake_case`。
