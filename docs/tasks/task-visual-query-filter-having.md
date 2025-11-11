# Task: Align Visual Query Filters, HAVING, and Calculated Fields

## Background

Recent testing highlighted gaps between the React visual query builder (WHERE / HAVING / 计算字段卡片)
and the FastAPI visual-query endpoints.  
Symptoms observed in the UI/SQL preview include:

- 默认生成 `WHERE 列 IS NULL`，即使 UI 里选择了 “列对列” 并已指定右侧列。
- HAVING 中的字段下拉在没有别名时展示 `COUNT(入库仓库)`，生成的 SQL 会缺失必要的双引号。
- 数值型列在 WHERE/HAVING 中输入 `5` 会被当成 `'5'` 发送，导致比较逻辑错误。
- 计算字段卡片虽然产出表达式，但缺乏统一的数据约束，部分模式（例如 CASE）容易生成空表达式。

本任务旨在梳理三块卡片的字段/选项/数值合同，并补齐前后端逻辑。

## Current Issues

| 模块 | 问题描述 | 影响 | 参考代码 |
| --- | --- | --- | --- |
| WHERE/HAVING | 新建面板时直接插入默认筛选项，导致未配置时就参与 SQL 生成。 | 误生成 `IS NULL` 条件。 | `frontend/src/components/QueryBuilder/VisualAnalysis/FilterControls.jsx` |
| WHERE/HAVING | 数值/布尔列的输入值始终以字符串形式下发。 | DuckDB 比较失败 (`'5' > 列`). | `transformVisualConfigForApi → sanitizeFilter` |
| HAVING | 当聚合没有别名时，`havingColumns` 构造 `COUNT(入库仓库)`（无引号）。 | SQL 解析失败。 | `VisualAnalysisPanel.jsx` (havingColumns) |
| WHERE/HAVING | SQL 预览仍按字符串拼接，缺乏列类型信息。 | 预览与后端不一致。 | `visualQueryGenerator.js` |
| 计算字段 | 三种模式缺少统一的校验 & 结构化输出。 | 空名称/空表达式仍可提交。 | `CalculatedFieldsControls.jsx` |
| 计算字段 | 前端只保留 `type`/`operation` 字段，缺少模式参数的合同说明。 | 难以扩展/测试。 | 同上 |

## Goals

1. WHERE、HAVING 卡片默认保持空；需点击 “添加筛选条件” 才出现卡片。
2. 每组筛选在进入 `analysisConfig` 和发送 API 前都携带该列的 `dataType` 信息，并据此序列化 `value/value2/rightColumn`。
3. HAVING 的列下拉在无别名时输出合法表达式（`COUNT("列名")`）。
4. SQL 预览的生成逻辑与后端 `generate_visual_query_sql` 对齐：根据数据类型选择是否加引号、是否转为数字/布尔/日期。
5. 计算字段卡片对 “组合运算 / CASE / 窗口函数” 三种模式提供数据结构契约 + 前端约束，保证表达式非空且列名带引号。

## Non-Goals

- 不修改现有后端 `FilterConfig` / `CalculatedFieldConfig` 数据模型。
- 不引入新的 SQL 安全策略（沿用 `_format_literal` 等现有实现）。

## Detailed Spec

### WHERE Card

| 字段 | UI 输入 | 前端状态 (`analysisConfig.filters[]`) | API Payload | 说明 |
| --- | --- | --- | --- | --- |
| `column` | 下拉 `ColumnSelect` | 字符串 | 同步字段，保持未修剪的列名 | 选择原始列；对保留字由后端 `_format_identifier` 处理。 |
| `operator` | 下拉 | 字符串 (`=`, `!=`, `LIKE`, …) | 同步字段 | 仅提供后端支持的操作符。 |
| `valueType` | Tab 按钮 | `'constant' | 'column' | 'expression'` | 转成 `value_type` | 默认为 `'constant'`。 |
| `value` | 文本框 | 原生输入；同时保存 `dataType` | 常量模式 => 根据 `dataType` 转为 `number`、`boolean`、`Date ISO`；若为空则阻止提交 | `FilterControls` 负责即时校验与转换。 |
| `value2` | `BETWEEN` 第二个值 | 同上 | 仅在 `BETWEEN` 且常量模式下送出；类型同 `value` | |
| `rightColumn` | 列对列 Tab 下拉 | 列名 | 下发 `right_column` | 只能从同表且不等于左列的列中选。 |
| `expression` | 表达式 Tab 文本域 | 字符串 | 下发 `expression`，trim 后必须非空 | 禁止与 NULL 操作符同时使用。 |
| `logicOperator` | `AND/OR` | 大写字符串 | 下发 `logic_operator` | 第一条不显示 UI 但默认为 `AND`。 |
| `dataType` | 派生 | `'string' | 'number' | 'date' | 'boolean'` | 用于 `sanitizeFilter` 及 SQL 预览 | 基于 `tableColumns` 元数据。 |

前端禁止在 `value` 为空时生成 SQL / 发送请求；弹出提示与聚合卡片一致。

### HAVING Card

除 `columns` 源不同，其余字段与 WHERE 一致。`columns` 来自：

1. 聚合：若有别名 => 使用别名；无别名 => 展示 `COUNT("列名")` 的完整表达式（内部调用 `escapeIdentifier`）。
2. 计算字段：直接使用字段名称。

`dataType` 获取顺序：计算字段 → `field.type` 推导；聚合 → 默认为 `'number'`。

### Calculated Fields Card

输出对象结构：

```ts
interface CalculatedField {
  id: string;
  name: string;        // 必填，非空字符串
  expression: string;  // 必填，已包裹列名 / 字面量
  type: 'mathematical' | 'string' | 'date';
  operation: 'combine' | 'case' | 'window';
  params?: Record<string, any>; // 各模式附带元数据（如窗口分区列）
}
```

- **组合运算 (combine)**  
  - 行列表 `combinationRows[]` 至少 1 项。  
  - `operandType === 'column'` 时输出 `TRY_CAST("列" AS DECIMAL)`（若有必要）。  
  - `constant` 必须为数字。  
  - `expression` 模式直接包裹 `(...)`。  
  - `params` 追加 `{ rows: CombinationRow[] }` 便于调试。

- **条件 CASE (case)**  
  - 每行需指定 `leftColumn` 与合法操作符。  
  - `valueMode === 'column'` → `"列名"`；`constant` → 转义字面量；`expression` → `(...)`。  
  - `result` 同样根据 `resultMode` 产出。  
  - 允许配置 `else`，写入 `params.caseElse`。

- **窗口函数 (window)**  
  - `functionName` 从白名单选择。  
  - 若函数要求列，需填写 `targetColumn`。  
  - `partitionColumns`/`orderings` 以 `"` 包裹。  
  - `offset` 仅适用于 LEAD/LAG，默认为 1。  
  - `params.windowConfig` 保存原始结构。

空名称/表达式按钮置灰；删除已有字段时直接更新 `analysisConfig.calculatedFields`。

### SQL 预览对齐

- 扩展 `buildFilterCondition`，根据 `filter.dataType` 选择 `formatSQLValue` 的 `dataType`（`NUMERIC`, `BOOLEAN`, `DATE` 等）。
- 对列对列比较，沿用 `escapeIdentifier(rightColumn)`。
- HAVING 中 `column` 字符串若已包含 `(`，仍需保证内部列名含 `"`。
- 预览失败时返回用户友好的错误提示（与后端校验保持一致）。

## Design Notes

- 交互：WHERE/HAVING 默认展示空态提示，操作流程与聚合卡片相同（点击添加 → 配置 → 校验）。
- 输入控件：根据列类型自动切换组件（`type="number"`/`date`/`text`）。
- 校验：即时提示必填项缺失（例如常量模式下 `value` 为空、列对列缺少比较列）。
- 可访问性：保留 `aria-label` 与 `helperText`。

## Implementation Tasks

### Frontend

1. **Filter state refactor**
   - Extend filter objects with `dataType`（左列、右列分别记录）。
   - Update `FilterControls` to populate `dataType` on column/rightColumn change.
   - Prevent `handleAddFilter` 在未填写时触发 SQL 生成（触发 toast 或 `FormHelperText`）。
2. **Normalization & API payload**
   - Update `normalizeFilterForPayload` / `sanitizeFilter` to coerce values by `dataType`.
   - Ensure `value2`、`expression`、`rightColumn` 均按合同映射。
3. **HAVING column list**
   - Fix `havingColumns` builder to emit alias or `FUNC("col")`.
4. **SQL Preview**
   - Pass `dataType` into preview generator; update `buildFilterCondition` to call `formatSQLValue(value, dataType)`.
   - Add regression tests under `frontend/src/utils/__tests__/visualQueryGenerator.test.js`.
5. **Calculated Fields**
   - Enforce non-empty name/expression; disable按钮直至满足条件。
   - Populate `params` per mode；确保表达式列名始终加引号。
   - Produce unit tests for `buildCombinationExpression`/`buildCaseExpression`/`buildWindowExpression`.

### Backend

*若前端完成类型转换，则无需修改。若仍以字符串形式传值，可考虑在 `FilterConfig` 入模后转换，但优先在前端处理。*

### QA & Validation

- 新增 Jest 用例覆盖 WHERE/HAVING（常量、列对列、表达式、BETWEEN）与计算字段（各模式）生成的 SQL。
- 手动验证：
  - 常量：数值/日期/布尔列可正确比较。
  - 列对列：生成 SQL 如 `"列A" = "列B"`。
  - HAVING：无别名时预览 `COUNT("列") > 5`。
  - 计算字段：三模式分别生成预期表达式。
- 运行 `npm run lint` & 主要 E2E 场景点击回归。

## Deliverables

- 更新后的 React 组件与工具函数。
- 补充的 Jest 单元测试。
- 手动测试记录（README 或 PR 描述）。
- 本文档链接在 PR 描述中引用。

