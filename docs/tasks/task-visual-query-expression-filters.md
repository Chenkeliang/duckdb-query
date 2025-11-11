# Task: Enhance Visual Query Expression Filters

## Background

Visual query users reported two pain points around the WHERE / HAVING “表达式” mode:

1. The UI currently forces a left-hand “列名”, so complex expressions like `(卖家应退金额 + 实际应退金额) > 99` or `DATE_TRUNC('month', "订单日期") = DATE '2025-01-01'` cannot be represented—they must be wrapped as `某列 = (表达式)`.
2. The existing type-conflict workflow (used for aggregations) does not extend to filters. When comparing columns of different types or applying functions, the system neither warns the user nor offers TRY_CAST suggestions, leading to runtime errors.

This task bridges those gaps by extending expression filters to work without a mandatory left column and by reusing the type-checking dialog to guide users through TRY_CAST selections.

## Current Behaviour Summary

* **FilterControls.jsx** — matches all filters into `column/operator/value` patterns. Even when `valueType === 'expression'`, a column is required and the expression is treated as the right-hand operand.
* **transformVisualConfigForApi** — serializes filters to include `column`, `value_type`, `right_column`, `expression`, but assumes `column` is always present.
* **generateSQLPreview / preview payload enrichment** — falls back to `WHERE 列 IS NULL` whenever expression values are absent, because column-free filters are filtered out.
* **Type conflict detection** — only runs for aggregations and pivot flows stored in `useTypeConflictCheck`, not for filters.

## Goals & Requirements

1. **Flexible expression filters**
   * When “表达式”模式保留列名 → interpret as `column <op> (expression)` (current behaviour).
   * When列名留空 → interpret the expression as a standalone condition (e.g. `WHERE (expr)`, or `WHERE (expr) <op> constant/rightColumn`).

2. **Type compatibility before execution**
   * Reuse the type-conflict dialog used for aggregations: detect incompatible numeric/boolean/date casts when comparing expression results to constants or columns.
   * Offer TRY_CAST choices; persist user selection; apply them via `TRY_CAST` in generated SQL.
   * Show toast/warning if user dismisses the dialog but conflict remains.

3. **Generate consistent preview & backend payload**
   * `transformVisualConfigForApi` must serialize:
     ```json
     {
       "column": null,
       "value_type": "expression",
       "expression": "(A + B)",
       "operator": ">",
       "try_cast": "DECIMAL" // optional
     }
     ```
   * Preview SQL (前端)和后端 `generate_visual_query_sql` 都需要识别 `column == null` 的表达式。

4. **UI/UX**
   * 在表达式 tab 中：
     * Column select 控件改成“可选”，默认为空。
     * 如果留空，应显示 placeholder “（可选）选择列以与表达式比较；留空则使用表达式本身”。
     * 对表达式输入做基本校验：至少检测括号配对和空白。
   * 表达式类型无需手动选择，由客户端根据运算符、字面量与列元数据自动推断；冲突时再提示 TRY_CAST。
   * 添加 helper 提示 `表达式会按 DuckDB 语法执行，遮罩符/保留字请遵循 SQL 标准`。

## Detailed Design

### Data Model Extensions

| 字段 | 类型 | 描述 |
| --- | --- | --- |
| `filters[].column` | `string \| null` | 表达式模式允许 `null` |
| `filters[].expression` | `string` | 已存在，表达式正文 |
| `filters[].cast` | `string \| null` | 存储用户选择的 TRY_CAST 目标，例如 `DECIMAL(18,2)` |

The backend payload will carry `column_type` and `cast` fields to guide SQL generation.

### Frontend Workflow Changes

1. **FilterControls.jsx**
   * Column selector shows “（可选）表达式对比列” when `valueType === expression`。
   * `createEmptyFilter` initializes `column: ''` when entering expression mode。
   * `handleValueTypeChange` sets `column` to `''` (not default column) for expression mode。

2. **Type Validation**
   * Extend `useTypeConflictCheck` to analyse表达式结构：根据算术/拼接/比较运算推断结果类型，并提取被引用列元数据。
   * For expression vs column/constant: 使用推断结果与目标列类型比对；若不兼容，弹窗提示 TRY_CAST。
   * 当表达式内部存在与预期类型不符的列时，逐列生成冲突项，让用户为这些列添加 TRY_CAST。
   * On conflict, show same dialog as aggregations with recommended casts—store the user choice (e.g., `cast: DECIMAL`)。

3. **SQL Preview**
   * Update `generateSQLPreview`:
     * If `column` is empty, build condition as `(expression)` (for operators with no RHS) or `(expression) <op> literal`。
     * If `cast` exists，或列在 `resolved_casts` 中，自动在表达式内注入 `TRY_CAST(column AS ...)`。

4. **Backend**
   * Extend `FilterConfig` with optional `cast`。
   * Modify `_build_filter_condition` (`api/core/visual_query_generator.py`) to handle:
     * `column` empty & expression present → use expression directly。
     * Cast when provided: `TRY_CAST((expression) AS cast) {op} ...`，并根据 `resolved_casts` 在表达式、WHERE、HAVING 中自动包裹列引用。
   * Update validation to accept `column == None` when `value_type == expression`.

### Validation & Error Handling

* Expression text is required; if blank→阻止提交。
