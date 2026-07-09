# 设计稿：查询结果图表(AI 推荐 + 手动 + 全屏预览)

- 日期：2026-06-01
- 范围：查询结果区(SQL/JOIN/集合/透视 的结果展示)新增「图表」视图
- 分支：`feat_result_charts`
- 库:复用已装的 `recharts ^3`
- 状态:待用户评审

## 1. 目标

把查询结果可视化成图表。当前只有表格;新增「图表」视图,**AI 自动推荐一个起手图,用户可手动微调**,支持全屏预览。

## 2. 已确认决策(来自 brainstorming)

| 决策 | 结论 |
|---|---|
| 数据来源 | **混合**:结果未截断→客户端聚合(即时);可能截断→重跑聚合查询(全量、下推) |
| 怎么抉择 | **AI 推荐起手 + 手动微调**;AI 未启用退化为默认猜测 |
| v1 图表类型 | 柱状(分组/堆叠)、折线、面积(堆叠)、饼图、环形图、大数字卡(KPI) |
| 全屏 | 图表可一键**全屏预览** |
| 不做(v2+) | 散点/气泡、混合图、树图、雷达、漏斗、进度/仪表;直方图/箱线/热力/地图(需原始值或额外库) |

## 3. 核心数据结构:ChartSpec

```ts
type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'kpi';
type AggFn = 'sum' | 'count' | 'avg' | 'min' | 'max';
interface ChartSpec {
  type: ChartType;
  x: string | null;        // 维度列;kpi 时为 null
  y: string[];             // 指标列;count(*) 时可空数组
  agg: AggFn;
  xBin?: 'day' | 'month' | null;  // x 为日期时可分桶
  stacked?: boolean;       // bar/area 多指标时堆叠
}
```
- bar/line/area 支持**多指标**(`y` 多列 → 多系列;stacked 控制堆叠)。
- pie/donut 取 `y[0]`。
- kpi 只用 agg(+可选单指标),显示一个大数字。

## 4. 数据来源:混合(答 Q1/Q2/Q3)

执行查询后前端已知:结果行数 `n`、列 `columns`、是否截断 `truncated = (n >= maxQueryRows)`。

- **未截断**(`!truncated`):已取行即全量 → **客户端聚合**纯函数 `aggregateRows(rows, spec)`(按 `x[bin]` 分组,对每个 `y` 算 `agg`),即时,不再查。
- **可能截断**(`truncated`):**重跑聚合查询** `buildChartSql(userSql, spec)`:
  ```sql
  SELECT <x 或 date_trunc(bin,x)> AS dim, <agg>(<y_i>) AS m_i ...
  FROM ( <userSql 去尾部 LIMIT> ) AS _src
  GROUP BY 1 ORDER BY 1
  LIMIT 200
  ```
  - **执行端点必须与原查询一致**:本地查询走 `executeDuckDBSQL`(`/api/duckdb/execute`);**联邦查询走 `executeFederatedQuery`,并带上原查询同一份 `attach_databases`** —— 否则包了子查询的 SQL 里 `mysql_xxx.表` 引用会因没 ATTACH 而报表不存在。复用原查询已有的 `requiresFederatedQuery`/`attachDatabases` 判定。
  - 子查询保留用户原 SQL 的 `mysql_xxx.表` 引用 + WHERE + 时间边界 → **不全量抽数,正好吃到 timeBound**;聚合在联邦源上完成,只回 ≤200 行。
  - `limit 10000` 自然消失(聚合结果远小于 1 万)。

> **联邦明确支持**:客户端聚合路径与数据源无关;重跑聚合路径通过上面的"同端点 + 同 attach_databases"保证 ATTACH 正确,联邦/本地一视同仁。

### 4.1 各 Tab 接入 + "绝不因 limit/配置少数据"保证

图表视图统一从当前结果接收 `{ columns, rows, truncated, source }`,其中 `source = { sql, attachDatabases, requiresFederated }`(用于截断时重跑)。各 Tab 提供:

| Tab | source.sql | 截断时全量重跑 |
|---|---|---|
| **SQL 查询** | 用户原 SQL | wrap 用户 SQL |
| **JOIN 查询** | `buildJoinPreviewSql` 生成的完整 SQL(+ attachDatabases) | wrap 它(联邦) |
| **集合操作** | 生成的 base SQL(+ attach) | wrap 它 |
| **透视表** | —(结果**本身已是服务端全量聚合**,小且通常不截断) | **不需重跑**,客户端直接画 |

**保证**:
- 未截断 → 已取行即全量;透视结果本就是全量聚合 → 都正确。
- 截断 → 重跑聚合在**源头/远端全量**计算,**完全绕过 `maxQueryRows` 显示上限**,系统配置不会让图表少数据。
- 截断且 `source.sql` 不可 wrap(多语句/非 SELECT/取不到 SQL)→ 退化为客户端对已取行聚合,并**显式标注「基于前 N 行(可能不全)」**——绝不静默少算。
- 图表视图始终显示数据基准徽标:「全量(聚合)」/「全量(透视)」/「前 N 行」。
- 视图里标注当前图基于「全量(聚合)」还是「前 N 行」。

## 5. AI 推荐(答 Q4)

- 新端点 `POST /api/ai/suggest-chart`:入参 = `{columns:[{name,type}], sample:[...前若干行], locale}`;出参(**结构化**)= `ChartSpec` + `reason`(一句话)。
- 进图表视图首次自动调一次 → 起手图。失败/未启用 → `defaultSpec(columns)`(首个文本/日期列做 x、首个数值列做 y、无数值则 count;类型按"有日期→line,否则→bar")。
- 复用 `LLMService`;错误码沿用 `ai_disabled`/`ai_not_configured`/502。
- 后端对 AI 返回做**校验**:x/y 必须是真实列名、type/agg 在白名单内,否则回退 defaultSpec(防 LLM 幻觉列)。

## 6. UI

- 结果区顶部视图切换:**表格 | 图表**。
- 图表视图:
  - 顶部一行轴选择器:`[类型▾] [X 维度▾] [Y 指标▾(多选)] [聚合▾] [日期分桶▾(x 为日期时显示)] [✨AI推荐] [⤢ 全屏]`。
  - 下方 `recharts` 画布(`ResponsiveContainer`)。
  - 列下拉自动分类:文本/日期 → 可作 X;数值 → 可作 Y。
- **全屏预览**:点 ⤢ → 打开一个全屏/大尺寸 Dialog,内含同一张图(更大画布),ESC/✕ 关闭。复用项目已有 Dialog 组件。

## 7. 边界

| 边界 | 处理 |
|---|---|
| 无数值列 | 默认 `count(*)`(只需 x) |
| x 为日期 | 可按天/月分桶(date_trunc) |
| 类目过多(>200) | 聚合 SQL `LIMIT 200`;客户端路径取 Top-200 + 其它合并 |
| 用户 SQL 不可包子查询(含 `;`/多语句/非 SELECT) | 不重跑;回退客户端对已取行聚合 + 提示「基于前 N 行」 |
| 结果空 / 无合适列 | 图表视图显示「无可视化数据」空态 |
| AI 返回幻觉列 | §5 校验后回退 defaultSpec |
| pie/donut 指标为负或多指标 | 只取 `y[0]`、负值过滤并提示 |

## 8. 测试(vitest + pytest)

纯函数(前端核心):
- `classifyColumns(columns)` → 可作 X / Y 的分类(文本/日期 vs 数值)。
- `defaultSpec(columns)` → 合理起手 spec。
- `buildChartSql(userSql, spec)` → 去 LIMIT、wrap 子查询、date_trunc 分桶、多指标列、LIMIT 200。
- `aggregateRows(rows, spec)` → 客户端分组聚合(sum/count/avg/min/max、Top-N+其它)。
- `validateSpec(spec, columns)` → 幻觉列/非法 type/agg 回退。

后端:
- `POST /api/ai/suggest-chart` 返回结构化 spec(mock LLM);校验回退;错误码。

组件:
- 图表视图渲染(各类型)、轴切换重画、AI 推荐按钮、全屏 Dialog 打开/关闭、未截断 vs 截断的来源标注。

## 9. 涉及文件(实现时核准精确锚点)

- 后端:`api/core/services/ai_suggest_chart.py`(新)、`api/routers/ai.py`(加 `/api/ai/suggest-chart`)、`api/tests/test_ai_router.py`。
- 前端纯函数:`frontend/src/Query/Charts/chartSpec.ts`(classify/default/buildSql/aggregate/validate)+ 测试。
- 前端 API:`frontend/src/api/aiApi.ts` 加 `suggestChart()`。
- 前端组件:`frontend/src/Query/Charts/ChartView.tsx`(轴选择器 + recharts 画布 + 全屏)、`ChartCanvas.tsx`(纯渲染,按 type 出图)、`ChartFullscreen.tsx`(Dialog)。
- 接入:查询结果区的视图切换(定位现有结果表格组件,加 表格|图表 切换 + 把 columns/rows/userSql/truncated 传入 ChartView)。
- i18n:`query.chart.*`(zh/en)。

## 10. 不做(YAGNI)

- v2/v3 图表类型(见 §2)。
- 保存图表配置、导出 PNG、仪表盘、多图。
- 流式 / 实时刷新。
