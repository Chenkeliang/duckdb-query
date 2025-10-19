# Task 03 · 可视化分析多指标与类型感知

## 1. Spec

- 背景  
  - 数据分析看板目前仅支持单指标 SUM/AVG，`frontend/src/components/DataVisualization/QuickCharts.jsx` 与 `ModernDataDisplay.jsx` 未渲染多个聚合结果。  
  - Visual Query 构建器虽允许添加多条聚合配置，但结果只在表格中显示，不存在指标卡/图表联动。  
  - Task 01 改造后列会保留原生类型，需让 UI 能识别类型并在冲突时提示转换。  
  - 全局暗色 CSS (`modern.css`) 对 `.MuiChip`, `.MuiCard` 等组件强制样式，导致指标卡在暗色模式下缺乏层次。

- 目标  
  1. 结果面板支持展示多个聚合指标卡（SUM/AVG/COUNT...），并允许用户选择在图表中对比多个指标。  
  2. QuickCharts/Insights 支持多指标序列（多条柱状/折线），并根据列类型自动推荐聚合方式，同时保持数值展示与原始精度一致（不做多余的 `Number()` 转换或四舍五入）。  
  3. Visual Query 面板中，聚合配置要明确输出含别名的指标列表，前端重用 `aggregation.alias`。  
  4. 当检测到 SUM/AVG/COUNT 等聚合列存在类型冲突时，先由前端基于列元数据做一级校验并提示；若仍需执行，再在后端返回 `type_conflicts`，由可视化面板弹窗让用户选择 `TRY_CAST` 目标类型，最终生成 SQL。  
  5. 所有新增组件/面板的视觉需与现有暗夜主题保持一致，可整合样式但不得改变间距、背景、配色。  
  6. 调整暗色 CSS 冲突，确保新组件在深色模式下仍可读、不会被全局样式覆盖。

- 非目标  
  - 不构建完整自定义图表配置，仅在现有 QuickCharts 基础上扩展多指标。  
  - 不实现复杂 KPI 对比（环比/同比）等衍生计算。

- 成功标准  
  - 用户在 Visual Query 中添加 ≥2 个聚合，结果面板出现对应指标卡，QuickCharts 支持多序列切换。  
  - 列类型为数值时自动默认 SUM/AVG 等选项，文本列不再提供这些函数。  
  - 前端一级校验即可提示大部分类型冲突；若进入后端二级校验，弹窗明确显示冲突列、当前类型、可选转换类型，用户选择后成功执行查询。  
  - 数值展示遵守原始精度，不出现明显的浮点误差。  
  - 深色模式下指标卡背景、字体与主题协调，无明显覆盖错乱。

## 2. Design

- 前端结构调整  
  - `ModernDataDisplay.jsx`  
    - 拆分指标卡 UI 为独立组件 `MetricsSummary`（位于 `frontend/src/components/Results` 子目录）。  
    - 从 `visualConfig.aggregations` 中提取 `{alias, function, column}`，使用响应结果中的字段值显示（通过 `data[0][alias]` 等），保持数值原样展示或按类型进行安全格式化（例如使用 `Intl.NumberFormat` 保留小数）。  
    - 支持自定义排序（总和/平均）和单位格式化（根据类型推断）。  
    - 与滤镜区域解耦，减少该文件长度（为 Task 03 做准备也为后续重构铺垫）。  
    - 新增 `MetricCard` 子组件（`frontend/src/components/Results/MetricCard.jsx`），结构包含标题、主值、副值插槽（预留环比/同比）、状态图标以及 tooltip。默认副值留空但保留布局，方便后续扩展。  
    - 在指标卡区域右上角添加帮助按钮（`HelpOutline` 图标），点击弹出 `MetricsHelpPopover`（`frontend/src/components/Results/MetricsHelpPopover.jsx`），内含数值格式说明、常见问题以及链接至 `docs/CHART_GUIDE.md`。  
  - `QuickCharts.jsx`  
    - `yAxis` 改为多选数组 `yAxes`，在柱状/折线图中渲染多条系列；饼图仍限制单指标。  
    - 根据 Task 01 元数据（`column.normalizedType`）推导可选聚合（SUM/AVG 等），默认展示 SUM。  
    - 若前端本地校验发现冲突，立即弹窗提示；用户继续执行后若后台仍返回 `type_conflicts`，在图表区上方弹窗提示，并调用统一的 `CastConflictDialog` 组件处理选择。  
    - 优化颜色分配和图例展示，多指标对应不同颜色，并确保暗夜模式下色彩对比与现有设计一致；使用 `useTheme()` 中的 palette token 而非硬编码色值。  
    - 引入 `decimal.js` 或 `big.js` 作为前端高精度库（新增依赖），在 `frontend/src/utils/numberFormat.ts` 中封装 `formatMetricValue(value, profile)`，根据 `precision/scale` 控制展示，避免浮点误差。  
    - 图表工具栏新增帮助按钮（`HelpOutline`），打开 `ChartHelpPopover` 说明多指标用法、维度限制、Top-N 算法及精度注意事项。  
  - `QueryBuilder/VisualAnalysis/AggregationControls.jsx`  
    - 在列选择时根据 `column.dataType` 限制可选聚合函数（数值列 -> SUM/AVG，文本列 -> COUNT/COUNT_DISTINCT）。  
    - 在用户点击“运行”前，使用本地 `columnProfiles` 做一次类型对比；若不一致立即提示。  
    - 若用户选择忽略提示，提交后仍可能收到后端 `type_conflicts`，需复用同一冲突弹窗流程。  
    - 确保 `alias` 默认值唯一（如 `sum_amount`、`avg_amount_2`），且不会导致数值转换。  
    - 面板底部增加“查看类型说明”链接，复用 Task 01 中的 `TypeHelpPopover`，统一类型教育内容。
- 样式  
  - 由于 `.dark .MuiCard-root` 被全局覆盖，需要给新指标组件加自定义 class，例如 `.dq-metric-card`，并沿用现有暗夜主题的配色/间距。  
  - 在 `modern.css` 中为 `.dq-metric-card` 定制背景/阴影，避免被 `.MuiCard-root` 的 `!important` 覆盖；必要时仅整合不合理的样式，不改变视觉表现。  
  - 新增面板（例如 `TypeConflictDialog`、`ChartHelpPopover`）统一引用暗夜主题变量（`--dq-surface`, `--dq-border` 等），并通过 `dq-dialog` class 控制 padding、圆角和阴影以匹配现有对话框体验。

- 后端/接口依赖  
  - Visual Query 响应中返回 `aggregations_metadata`（函数、别名、数据类型）辅助前端展示。  
  - `generate_visual_query_sql` 在检测到类型冲突时返回 `type_conflicts` 列表；前端解决后重新提交包含选择结果的请求。  
  - 在 `core/visual_query_generator.generate_visual_query_sql` 中收集 `AggregationConfig` 信息并附加到 `metadata`。

- 数据流  
  1. 用户在可视化查询中配置多聚合 -> API 返回 SQL + metadata（若存在冲突则带 `type_conflicts`）。  
  2. 若存在冲突，前端弹窗让用户逐项选择 `TRY_CAST` 目标类型 -> 带选择结果再次请求生成 SQL。  
  3. 执行查询后结果数据带有多个聚合列 -> `ModernDataDisplay` 渲染指标卡。  
  4. 用户打开 QuickCharts -> 选择维度和多个指标 -> 图表多序列展示。  
  5. 若切换滤镜，重新计算指标卡和图表。

- 测试计划  
  - 单元测试：  
    - React Testing Library 检查 `MetricsSummary` 是否根据数据渲染多个指标。  
    - QuickCharts 多指标模式下 legend/series 渲染正确。  
    - `formatMetricValue` 针对 DECIMAL/NUMERIC 精度、千分位、百分比格式的覆盖。  
    - `ChartHelpPopover`、`MetricsHelpPopover` 渲染内容及链接正确。  
  - E2E：生成含两个聚合的查询，检查指标卡和图表 UI。  
  - 后端：验证 metadata 中包含聚合信息。  
  - 视觉自测：暗夜模式下截屏对比指标卡、对话框，确保整合后的 CSS 与现有视觉一致。

- 风险  
  - 多指标图表性能：对大结果集需限制最大展示行数（维度 TOP N）；可沿用 QuickCharts 现有 `slice(0,20)` 逻辑。  
  - 冲突弹窗逻辑需确保与异步查询、SQL 编辑器模式的行为一致。  
  - CSS 冲突：先在 `modern.css` 中收敛 `!important` 使用范围，确保不会误伤其他组件。
