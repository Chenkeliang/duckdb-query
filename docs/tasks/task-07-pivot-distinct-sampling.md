# Task 07 · 透视列采样链路一致化

## 1. Spec

- 背景  
  - 新增的 `PivotConfigurator` 支持“预览采样值”，通过 `getDistinctValues` 接口查询列的 Top-N 内容（`frontend/src/components/QueryBuilder/PivotConfigurator.jsx#L120-L198`）。  
  - 当前请求仅发送 `{table_name, filters}` 的简化配置，未复用 `transformVisualConfigForApi`，导致后端在 `validate_query_config`（`api/routers/query.py#L378`）阶段缺少 `calculated_fields`、`conditional_fields`、`selected_columns` 等上下文。  
  - 若用户把 “列维度” 设为计算字段或条件字段，采样 SQL 会失败；排序指标（`order_by === 'metric'`）也无法引用这些表达式。  
  - 现有实现直接手写 `WITH base AS (SELECT * FROM table …)`，逻辑与 `_generate_pivot_base_sql` 不一致，后续维护和调试困难。

- 目标  
  1. 采样请求与正式预览共用同一套配置转换逻辑，支持过滤、计算字段、条件字段、排序等特性。  
  2. 后端生成采样 SQL 时复用 `visual_query_generator` 中的基础构建逻辑，确保列别名与表达式一致。  
  3. 新接口支持 `base_limit`（采样上限）和可选的 `manual_column_values` 预设，避免大表性能问题。  
  4. 补充自动化测试覆盖：计算字段、指标排序、空结果、错误提示。

- 非目标  
  - 不改变已经发布的预览 UI 交互，只补齐请求链路与 SQL 生成。  
  - 不扩展后端为多列维度采样（仍按原生 pivot 要求单列）。

- 成功标准  
  - 在前端选择 CASE/条件生成的列作为透视列时，“预览采样值”能返回正确顺序和数量。  
  - 指定指标排序时，后端会自动将指标转换成对应表达式/聚合并返回 `topN.metric`。  
  - 覆盖率：新增 Pytest/E2E 触发采样成功、失败、limit 控制等场景。

## 2. Design

- 前端改造  
  - 在 `PivotConfigurator` 中引入 `transformVisualConfigForApi`：  
    ```jsx
    import { transformVisualConfigForApi } from '../../utils/visualQueryUtils';
    const configPayload = transformVisualConfigForApi(analysisConfig, selectedTableId);
    ```  
    仅保留 `table_name`、`filters`、`calculated_fields`、`conditional_fields`，其他字段可置空，避免冗余。  
  - 新增 `baseLimit` 参数：默认 `previewLimit * 20`（可根据列数量大小再调），并允许在弹窗中预留输入框（可选）。  
  - 请求体示例（`getDistinctValues` 调用处 `frontend/.../PivotConfigurator.jsx#L143-L154`）：  
    ```js
    const payload = {
      config: {
        table_name: configPayload.table_name,
        filters: configPayload.filters,
        calculated_fields: configPayload.calculated_fields,
        conditional_fields: configPayload.conditional_fields,
      },
      column: pivotColumnId,
      limit: previewLimit,
      order_by: previewOrderBy,
      metric: previewMetricPayload,
      base_limit: baseLimitValue,
      manual_values: pivotConfig.manualColumnValues,
    };
    ```  
    发送前需校验 `metric.column` 在 `configPayload` 中存在（包括计算字段）。

- 后端实现  
  - 新增辅助函数 `_build_sampling_cte(config: VisualQueryConfig, base_limit: Optional[int]) -> str` 于 `core.visual_query_generator`：  
    * 复用 `_generate_pivot_base_sql` 的计算列拼接逻辑，将 `calculated_fields`、`conditional_fields` 注入 SELECT。  
    * 应用 `_build_where_clause` 和 `base_limit`（使用 `LIMIT` 或子查询 `WHERE`).  
    * 返回 `WITH base AS (...)` 字符串和列别名映射。  
  - `get_distinct_values` 中改为：  
    1. 调 `validate_query_config`；  
    2. 调 `_build_sampling_cte` 获取 `base_sql` 与别名映射；  
    3. 通过别名映射解析 `req.column`、`req.metric.column`，若为计算字段则使用表达式；  
    4. 组装 `SELECT ... FROM base GROUP BY` SQL，并确保 `_quote_identifier` 只用于真实标识符，表达式用括号包装。  
  - 扩充 `DistinctValuesRequest`：允许 `calculated_fields`, `conditional_fields`, `manual_values`，通过 Pydantic 模型自动校验。  
  - 增加错误信息：当列名无法匹配时，返回友好提示（包含用户选择的列名）。  
  - 在 `core/visual_query_generator.py` 内提供可复用的 `resolve_expression_for_column(config, column_id)`，用于在采样和 pivot SQL 中一致地找到表达式。

- 测试  
  - Pytest：  
    * 计算字段采样：传入 `calculated_fields=[{name:'quarter', expression:'strftime(%Y-Q%q, order_date)'}]`，验证返回值。  
    * 指标排序：`metric={"agg":"SUM","column":"amount"}`，验证 `topN[i]["metric"]`。  
    * base_limit：设置较小值，确保生成 SQL 包含 `LIMIT`.  
  - 前端 Jest/RTL：模拟调用 `getDistinctValues`，断言请求体包含 `calculated_fields`、`base_limit`。  
  - 手动 / Playwright：在 UI 中创建计算列 → 透视 → 预览采样 → “使用这些值” 应成功填充。
