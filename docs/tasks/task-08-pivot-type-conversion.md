# Task 08 · 透视指标类型转换与精度控制

## 1. Spec

- 背景  
  - `PivotConfigurator` 新增 “转换类型” 下拉框（`frontend/src/components/QueryBuilder/PivotConfigurator.jsx#L338-L370`），当前仅提供基础选项（`decimal`、`integer`、`double` 等）。  
  - 后端在 `_build_pivot_value_expression` 中直接拼接 `TRY_CAST(column AS {typeConversion.upper()})`（`api/core/visual_query_generator.py#L269-L289`），当用户选择 `decimal` 时生成 `TRY_CAST(col AS DECIMAL)`，DuckDB 需要精度与刻度（例如 `DECIMAL(38, 6)`），导致 SQL 语法错误。  
  - 缺少针对列类型的推荐提示，也无法让用户自定义精度/刻度，易出现聚合精度丢失或类型不匹配。

- 目标  
  1. 提供可配置的类型转换面板，根据列原始类型推荐合适的转换（含精度/刻度），并允许自定义。  
  2. 后端对 `typeConversion` 字段做严格校验，支持 `DECIMAL(p,s)`/`NUMERIC(p,s)` 等格式，默认给出安全的精度。  
  3. 聚合 SQL 中使用统一的转换语法，确保 DuckDB 无报错并保留用户指定精度。  
  4. 更新前端提示与文档，帮助用户理解转换影响。  
  5. 补充自动化测试覆盖（前后端）。

- 非目标  
  - 不实现自动分析所有样本确定最优精度；先按列元数据给出建议（如字段 metadata 中的 `type`, `precision`, `scale`）。

- 成功标准  
  - 用户为指标列选择 `DECIMAL(18,2)` 后生成的 SQL 语句合法执行。  
  - UI 提供原始类型/推荐转换信息，并在暗夜模式下视觉一致。  
  - 相关单测验证通过，避免回归。

## 2. Design

- 前端实现  
  - 新建组件 `ValueTypeConversionPicker`（路径：`frontend/src/components/QueryBuilder/ValueTypeConversionPicker.jsx`），在 `PivotConfigurator` 中替换现有 `Select`：  
    * 展示列原始类型（从 `selectedTable.columns` 或 Task 01 的 `columnProfiles` 获取 `normalizedType/precision/scale`）；  
    * 提供常用模板：`保持原类型`、`DECIMAL(18,2)`、`DECIMAL(18,4)`、`NUMERIC(38,6)`、`DOUBLE` 等；  
    * 支持“自定义”模式，允许输入 `DECIMAL(precision, scale)`（输入框做正则校验）；  
    * 显示说明 tooltip：“转换用于在透视前统一类型，避免字符串/数字混合导致计算错误”。  
  - `handleValueChange` 存储结构调整：  
    ```js
    handleValueChange(index, 'typeConversion', {
      key: 'decimal',
      expression: 'DECIMAL(18,2)',
    });
    ```  
    `transformPivotConfigForApi` 更新取 `typeConversion.expression`，并仅传递字符串（或 `undefined`）。  
  - 文案与帮助  
    - `ValueTypeConversionPicker` 内置 “了解更多” 链接，指向新文档章节 `docs/CHART_GUIDE.md#pivot-type-conversion`，解释常见场景。  
    - 在 Dark 模式下使用 `.dq-dialog`, `.dq-form-field` 等现有 class，避免改变视觉风格。

- 后端实现  
  - 更新 `PivotValueConfig`（`api/models/visual_query_models.py`）：  
    * 将 `typeConversion: Optional[str]` 改为 `Optional[StrictStr]`;  
    * 添加 validator：  
      ```python
      @field_validator("typeConversion")
      def validate_type_conversion(cls, value):
          allowed_simple = {"DOUBLE", "FLOAT", "REAL", "INTEGER", "BIGINT", "SMALLINT", "TINYINT"}
          decimal_pattern = re.compile(r"^(DECIMAL|NUMERIC)\(\d{1,2},\d{1,2}\)$", re.I)
          ...
      ```  
      允许 `None`、简单类型或 `DECIMAL/NUMERIC` 带精度刻度；超出范围抛出 `ValueError("不支持的类型转换格式")`。  
    * 默认策略：若前端传 `decimal` 的 `key`，但无具体表达式，后端补全 `DECIMAL(38,6)`。
  - `_build_pivot_value_expression` 中使用 `value.typeConversion_expression`（新的字段）来拼接 SQL，保证大写并保留括号。  
  - 更新 `transformPivotConfigForApi`：  
    ```js
    typeConversion: item.typeConversion?.expression || undefined
    ```  
    同时保留 `typeConversionDisplay` 信息供前端使用（无需发给后端）。

- 测试  
  - Pytest 新增场景：  
    * `typeConversion='DECIMAL(18,2)'` → SQL 包含 `TRY_CAST(... AS DECIMAL(18,2))`;  
    * 非法字符串（如 `DROP TABLE`）→ `HTTP 422`。  
  - 前端 Jest：  
    * `ValueTypeConversionPicker` 输入 `18,2` 后触发 `handleValueChange`，断言传参。  
    * Dark 模式快照，确保样式未变化。  
  - 手工 / E2E：用户设置 `DECIMAL(18,2)` 并执行透视，验证结果与原生查询一致。
