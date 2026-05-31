# 设计稿：联邦大表 JOIN 时间边界推荐 + 一键添加

- 日期：2026-05-31
- 范围：`JoinQueryPanel`（结构化 JOIN 构建器）
- 实现路径：**纯前端，零后端改动**
- 状态：待用户评审

## 1. 问题

JOIN 联邦表（ATTACH 的 MySQL/PG）时，若大表没有时间范围约束，DuckDB 通过 ATTACH 抽取的数据量过大、易超时。用户当前的手法：手动给大表加一条 `create_time / update_time` 之类的时间谓词到 **ON** 上（放 ON 而非 WHERE，是为了不破坏 LEFT JOIN 语义），让 DuckDB 把这个单表过滤下推到远端、少抽数据。

诉求：**自动识别该加哪一列时间谓词 + 一键加上**，多张表都支持。

## 2. 已确认的设计决策（来自 brainstorming）

| 决策点 | 结论 |
|---|---|
| 推荐内容 | 时间列 + **默认 30 天**范围；多张表各推各自的 ON 时间谓词 |
| 推荐入口 | **每个连接卡内联芯片**（缺时间边界的表才显示）；≥2 张表时加一个"全部添加"快捷 |
| 触发条件 | **联邦表为主**：只在 ATTACH 的 MySQL/PG 表上、有时间型列且尚未加时间边界时显示；本地 DuckDB 表跳过；不测行数（`row_count` 不可靠） |
| 实现路径 | 复用现有 ON 能力，纯前端，可见可改，永不自动执行 |

## 3. 关键机制：复用 FilterBar 的原生 `placement`

> 这是相对 brainstorming 初稿的一处**升级**。初稿打算往 `joinConfigs` 插一条 expression-mode 的 `JoinCondition`——但那会让 `canUseServerJoinPath` 返回 false、强制走客户端 SQL 构建路径。改用下面的方案后去掉了这个副作用，且更"复用"。

代码勘察确认：`FilterBar/types.ts` 的 `FilterCondition` 自带 `placement?: 'on' | 'where'` 字段，注释明确 `'on'` = "应用于 JOIN ON 子句（在连接时过滤，保留 NULL 值）"，并有 `PlacementContext.isRightTable`。现有机器已经完整支持 ON 放置：

- `buildJoinQueryPayload.ts:98,198` —`buildPushdownWhere(filterTree, tableName)` 把 `placement:'on'` 的条件喂进**联邦源子查询下推**（server 路径）。
- `JoinQueryPanel.tsx:457-460` —预览/客户端构建把 `placement:'on'` 的过滤条件**追加进 JOIN ON**；`516` 处 `cloneTreeWithoutOnConditions` 把它们从 WHERE 剥离。
- `canUseServerJoinPath`（`buildJoinQueryPayload.ts:76`）只检查 `joinConfigs` 是否含 expression，**不检查 filterTree**——所以往 filterTree 插条件**不会**踢出 server 路径。

**结论**：一键添加 = 往 `filterTree`（`setFilterTree`）插入一个原生 `FilterCondition`，由现有机器自动完成 ON 下推 / ON 追加 / LEFT JOIN 保 NULL。等价于"用户在 FilterBar 里手动加了一条 placement=on 的时间过滤"，只是程序化、带智能默认。

## 4. 检测（哪些表、哪一列）—纯函数

输入：`activeTables`、`attachDatabases`、`tableColumnsMap`（`Record<string, TableColumn[]>`，`TableColumn = {name, type}`，见 `JoinQueryPanel.tsx:210,1211`）、`filterTree`、`joinConfigs`。

对每个数据源：

1. **联邦判定**：`isExternalTable(table)`（`JoinQueryPanel.tsx:58` 已导入）为真且存在 attach。本地 DuckDB 表跳过。
2. **时间型列**：`type`（大小写/括号不敏感）∈ `{TIMESTAMP, TIMESTAMPTZ, TIMESTAMP WITH TIME ZONE, DATETIME, DATE}`。
3. **列优先级**：create 系（`create_time / created_at / gmt_create / create_at / ctime`）> update 系（`update_time / updated_at / gmt_modified / mtime`）> 其它任意时间型列；同级取列序第一个。
   - *create 优先：通常不可变、有索引，范围下推最稳。*
4. **抑制（去重）**：该表已存在引用自己某时间型列的范围谓词时不提示。扫描两处：
   - `filterTree` 中 `table` 命中该表、`column` 是其时间型列、`operator` 属范围类（`>= > <= < BETWEEN`）的 `FilterCondition`；
   - `joinConfigs` 中引用该表时间型列的 expression 条件（兜底用户手敲的情形）。

产出：`Suggestion[] = { sourceId, tableName, isRightTable, column, joinIndex }`。

## 5. 落点（placement）

- 表作为**右表被引入**（`isRightTable = true`，即 `activeTables[i]`，i≥1）→ `placement: 'on'`。保住 LEFT JOIN 语义 + 下推抽数边界。
- **最左驱动表 t0**（`activeTables[0]`，从不作右表）→ `placement: 'where'`。
  - *理由：LEFT JOIN 的 ON 谓词过滤不掉被保留的左表，所以 t0 必须 WHERE；t0 用 WHERE 在 INNER/LEFT 下都正确。*
- `isRightTable` 复用面板已为 `FilterPopover` 计算的同一判定（`PlacementContext.isRightTable`），不重复造逻辑。

## 6. 一键插入动作

往 `filterTree` 追加（`setFilterTree`，新建 leaf）：

```ts
{
  id: <new id>,            // 用面板既有的 id 生成方式
  type: 'condition',
  table: <suggestion.tableName>,
  column: <suggestion.column>,
  operator: '>=',
  value: '<30天前字面量>',  // 见 §7
  placement: suggestion.isRightTable ? 'on' : 'where',
}
```

- "全部添加"：对所有 `Suggestion` 各插一条。
- 插入后该表被 §4.4 抑制规则覆盖，芯片消失。

## 7. 默认值

前端计算 `now − 30 天`，格式化为字面量 `'YYYY-MM-DD 00:00:00'`（取 30 天前那天的零点）。

- 用字面量而非 `CURRENT_DATE - INTERVAL '30 days'`：对 MySQL/PG 下推更稳、结果可复现。
- 插入后用户可在 FilterBar 里直接改日期或改成滚动表达式。

## 8. UI —内联芯片

- 缺时间边界的表，在其参与的 JoinConnector（`JoinQueryPanel.tsx:845`）上、ON 区域旁显示轻芯片：**`⏱ 近30天 · create_time`**。
  - 右表（t1..tn）：芯片在引入它的那条 connector 上。
  - t0：芯片在 connector[0] 左侧（仍是"连接卡内联"，但插入用 `placement:'where'`）。
- 点击 → 执行 §6 → 芯片消失。
- ≥2 张表符合 → 面板顶部出现 **`⏱ 全部限定近30天 (N)`** 快捷。
- 多候选列：插入后用户可在 FilterBar 里改列；不在芯片上做列选择 UI（YAGNI）。
- tooltip 说明"为何 & 会下推到远端减少抽数"。

## 9. i18n

`common.json` 新增 `query.join.timeBound.*`（chip 文案、全部添加、tooltip），zh + en，沿用既有 `query.*` 命名空间风格。

## 10. 测试（vitest，前端）

纯函数与动作（核心）：
- 检测：时间型列类型识别（含 `TIMESTAMP WITH TIME ZONE`、大小写）、列优先级（create > update > 其它）、本地表跳过、联邦表命中。
- 抑制：filterTree 已有该表时间范围谓词时不再建议；joinConfigs expression 兜底。
- 落点：右表 → `placement:'on'`；t0 → `placement:'where'`。
- 默认值：`now−30天` 格式化为 `'YYYY-MM-DD 00:00:00'`。
- 插入动作：产出正确的 `FilterCondition`（table/column/operator/value/placement）。

组件：
- 符合表渲染芯片 / 不符合不渲染 / 点击触发插入 / "全部添加"。

集成（择一即可，确认链路通）：
- 插入 placement=on 后，`buildPushdownWhere(filterTree, tableName)` / 预览 SQL 含 `… >= '…'` 进入 ON / 子查询。

## 11. 明确不做（YAGNI）

- 不测行数 / 不做"大小门槛"。
- 不查真实 `MIN/MAX`（数据感知范围）。
- 不加后端、不加持久化配置。
- 不碰自由 SQL 编辑器，只动 JOIN 构建器。
- 不在芯片内做列选择器（交给现有 FilterBar）。

## 12. 风险

- **唯一"绕"点**：落点 t0→WHERE / t1..tn→ON。这是 LEFT JOIN 正确性的必需品，已由 `placement` 字段 + 测试覆盖。
- 罕见：被 CROSS JOIN 引入（无 ON）的表 → 退化用 `placement:'where'`。
- 时间列名启发式可能漏判非常规命名（如纯 `dt`）；此时不报建议（不误报优先），用户仍可手动加。

## 13. 涉及文件（实现时核准精确锚点）

- `frontend/src/Query/JoinQuery/JoinQueryPanel.tsx` —芯片渲染、检测调用、插入动作（`tableColumnsMap` 1211、`joinConfigs` 1188、`filterTree` 1194、`JoinConnector` 845）。
- `frontend/src/Query/JoinQuery/FilterBar/types.ts` —`FilterCondition`/`placement`（72-86）、`PlacementContext`（62）。
- 新增纯函数模块（建议）：`frontend/src/Query/JoinQuery/timeBound.ts` —检测 + 默认值 + 插入构造（便于单测）。
- `frontend/src/i18n/locales/{zh,en}/common.json` —`query.join.timeBound.*`。
- 测试：`timeBound.test.ts` + 芯片组件测试。
