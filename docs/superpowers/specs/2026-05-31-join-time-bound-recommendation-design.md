# 设计稿：联邦大表 JOIN 时间边界推荐 + 一键添加

- 日期：2026-05-31
- 范围：`JoinQueryPanel`（结构化 JOIN 构建器）
- 实现路径：**纯前端，零后端改动**
- 状态：待用户评审（已据代码实证 + 用户实测修正：边界必须落 ON 走子查询下推）

## 1. 问题

JOIN 联邦表（ATTACH 的 MySQL/PG）时，若大表没有时间范围约束，DuckDB 通过 ATTACH 抽取的数据量过大、易超时。用户当前手法：手动给大表加一条 `create_time / update_time` 之类时间谓词到 **ON** 上，让它经**联邦源子查询**下推到远端、少抽数据。

> **用户实测结论（关键约束）**：放 **WHERE 不会下推**；时间边界**必须落 ON**，并且必须走**当前的子查询方式**（`placement='on'` → `buildPushdownWhere` → `buildFilteredSubquery`）。本设计据此固定为"一律 ON / 走子查询"。

诉求：**自动识别该加哪一列时间谓词 + 一键加上**，多张表都支持。

## 2. 已确认的设计决策

| 决策点 | 结论 |
|---|---|
| 推荐内容 | 时间列 + **默认 30 天**；多张表各推各自的时间谓词 |
| 推荐入口 | **每个连接卡内联芯片**（缺时间边界的表才显示）；≥2 张表时加"全部添加"快捷 |
| 触发条件 | **联邦表为主**：ATTACH 的 MySQL/PG 表、有 create/update 审计时间列、且尚未加时间边界；本地表跳过；不测行数 |
| 落点 | **一律 `placement='on'`**，走现有联邦子查询下推（用户实测唯一可下推的方式） |
| 实现路径 | 复用 FilterBar，纯前端，可见可改，永不自动执行 |

## 3. 关键机制：固定 `placement='on'`，复用现有子查询下推

代码实证：
- `FilterCondition`（`FilterBar/types.ts:72`）带 `placement?: 'on' | 'where'`。
- `buildPushdownWhere(filterTree, tableName)`（`buildJoinQueryPayload.ts:98,198`）**只挑** `placement==='on' && table===tableName` 的条件（`filterUtils.ts:967`），并入该表的**联邦源子查询** `(SELECT * FROM T WHERE create_time >= x)`（`buildFilteredSubquery`，预览路径 `JoinQueryPanel.tsx:347`；server 路径 `buildJoinQueryPayload.ts:198`）。**这正是用户在用、已验证能下推的路径。**
- 每个联邦表（含最左 t0）都会各自建子查询（`optimizedTableRefs`，`JoinQueryPanel.tsx:288/347/379`），所以无需对 t0 特殊处理。
- `canUseServerJoinPath`（`buildJoinQueryPayload.ts:76`）只看 `joinConfigs` 是否含 expression，**不看 filterTree** → 插 filter 条件不踢出 server 路径；两条执行路径都会建子查询。

**语义**：一键添加 = 把该表**按时间范围预过滤进它的联邦子查询**。这是一次**有意的数据范围收窄**（"只看近 30 天该表的数据"），对任意 JOIN 类型语义都明确——等价于用户手动在 FilterBar 给该表加一条 `placement='on'` 时间过滤。

**为什么不再用 `getDefaultPlacement`**：它对 INNER JOIN 返回 `'where'`，而 WHERE 用户实测不下推 → 不满足核心目标。故本特性**不调用** `getDefaultPlacement`，固定传 `'on'`。

## 4. 检测（哪些表、哪一列）—纯函数

输入：`activeTables`、`attachDatabases`、`tableColumnsMap`、`filterTree`、`joinConfigs`、`duplicateSqlAliases`。

> **字段实证修正**：`tableColumnsMap` 的 **key 是表名**（`getTableName(table)`，`JoinQueryPanel.tsx:1214/1217`），`TableColumn = {name, type}`，`type` 为 **DuckDB 规范类型串**（MySQL/PG 经 ATTACH 已归一化）。用 `tableColumnsMap[tableName]`，**不是** `[sourceId]`。

对每个数据源：

1. **联邦判定**：`isExternalTable(table)`（`JoinQueryPanel.tsx:58` 已导入）为真且存在 attach。本地 DuckDB 表跳过（无抽数超时问题）。
2. **时间型列**：`type`（去括号/大小写不敏感）∈ `{TIMESTAMP, TIMESTAMP WITH TIME ZONE, TIMESTAMP_S, TIMESTAMP_MS, TIMESTAMP_NS, DATE}`（MySQL `DATETIME`→DuckDB `TIMESTAMP`；**排除 `TIME`**）。
3. **候选列（仅审计列，不兜底任意时间列）**：在时间型列中，名字（小写）命中：
   - **create 系**：含 `create` / `created` / `gmt_create` / `ctime` / `add_time` / `insert_time`
   - **update 系**：含 `update` / `updated` / `gmt_modified` / `modify` / `mtime` / `last_modified`
   - 皆不命中的时间型列（`birthday` / `expire_date` / `pay_time` 等）**不进候选**（不误报优先）。
   - 第 2 步类型门槛已把 VARCHAR 的 `create_user` 等排除。
4. **推荐与排序**：候选内 **create 系 > update 系**，同级按列序取第一个；同时命中两类归 create。
5. **抑制（去重）**：该表已存在引用自己某时间型列、运算符 ∈ `{=, >, >=, <, <=, BETWEEN}` 的谓词时不提示。扫描 `filterTree`（`table===该表名` 的 `FilterCondition`，遍历树）+ `joinConfigs`（引用该表时间型列的 expression，兜底手敲）。

产出：`Suggestion[] = { tableName, joinIndex, candidates: string[], recommended: string }`（`candidates` 已排序，`recommended = candidates[0]`）。

## 5. 落点：一律 `placement='on'`

- 每条建议**固定 `placement='on'`**，不分 JOIN 类型、不分左右表、不分 t0。
- 由 §3 机制，该条件被并入**该表的联邦子查询**做预过滤 → 下推到远端 → 限抽数。
- **跳过（边界）**：
  - **自连接 / 表名重复**：`FilterCondition.table` 按表名无法消歧具体实例，子查询过滤会误施加 → 用 `duplicateSqlAliases`（`JoinQueryPanel.tsx:1257`）检测，重复表名时该表**不出建议**。
  - 非联邦表、无候选列、列未加载/加载出错：不出建议（见 §4）。
- 不再跳过 FULL/CROSS：时间边界是"按时间收窄该表"的有意范围过滤，对任意 JOIN 类型语义明确；其落点机制（子查询预过滤）与 JOIN 类型无关。

## 6. 一键插入动作

用既有工厂构造，避免手搓 id/字段：

```ts
import { createCondition } from './FilterBar';
const node = createCondition(
  suggestion.tableName,   // table：填表名（非别名），下游 remapFilterTreeTableNames 处理
  chosenColumn,           // 默认 suggestion.recommended；多候选时为用户所选
  '>=',                   // FilterOperator
  defaultValue,           // §7：裸日期串，无引号
  undefined,
  'on',                   // 固定 ON —— 走子查询下推
);
setFilterTree(tree => insertLeaf(tree, node));   // 用面板既有 filterTree 插入方式
```

- "全部添加"：对所有 `Suggestion` 各插一条（各用各自 `recommended`）。
- 插入后该表被 §4.5 抑制覆盖，芯片消失。

## 7. 默认值（字段实证）

前端算 `now − 30 天`，`value` 传**裸字符串**（JS 串 `2026-05-01 00:00:00`，**不含 SQL 引号**）。

> 生成器 `formatSingleValue` 对 string 走 `escapeSqlString`（`filterUtils.ts:183-184`）**自动加引号并转义**；若 `value` 自带引号 → 双重加引号出错。

- 用字面量而非 `CURRENT_DATE - INTERVAL`：对 MySQL/PG 下推更稳、可复现。
- 字符串 `>=` 比较 TIMESTAMP/DATE 列由 DuckDB 隐式转换。
- 插入后用户可在 FilterBar 改日期/表达式。

## 8. UI —内联芯片

- 缺时间边界的表，在其 JoinConnector（`JoinQueryPanel.tsx:845`）ON 区旁显示轻芯片：**`⏱ 近30天 · create_time`**（透明展示将用的列）。
- **多候选列（candidates>1）**：芯片带小 caret 下拉列出候选时间列，默认 `recommended`，可在添加前改选；单候选无下拉。
- 点击（或选列后点）→ 执行 §6 → 芯片消失。
- ≥2 张表符合 → 面板顶部 **`⏱ 全部限定近30天 (N)`** 快捷。
- tooltip 说明"为何 & 会下推到远端减少抽数"。

## 9. i18n

`common.json` 新增 `query.join.timeBound.*`（chip、全部添加、tooltip、候选列），zh + en，沿用 `query.*` 命名空间。

## 10. 测试（vitest，前端）

纯函数（核心）：
- 时间型列识别：`TIMESTAMP` / `TIMESTAMP WITH TIME ZONE` / 大小写 / `TIMESTAMP_NS` 命中；`TIME`、`VARCHAR` 不命中。
- 候选与排序：`create_time` 优先 `updated_at`；只有 `birthday`/`pay_time` → **0 候选 → 不建议**；`create_user`(VARCHAR) 不入候选。
- 抑制：filterTree 已有该表时间范围谓词 → 不建议；joinConfigs expression 兜底。
- 跳过：非联邦表 / 自连接（表名重复）/ 列加载出错 → 不建议。
- 默认值：`now−30天` 裸串（无引号）。
- 插入：`createCondition` 产出 table=表名 / column / operator='>=' / value=裸串 / **placement='on'**。

集成（确认下推链路）：
- 插入后 `buildPushdownWhere(filterTree, tableName)` 输出含 `… >= '…'`，且进入该表子查询（`buildFilteredSubquery` 结果含该谓词）。**这是验证"走子查询下推"的关键测试。**

组件：
- 符合表渲染芯片 / 不符合不渲染 / 单候选直接点 / 多候选下拉改选 / 点击插入 / "全部添加"。

## 11. 明确不做（YAGNI）

- 不测行数 / 不做大小门槛；不查真实 `MIN/MAX`。
- 不加后端、不加持久化配置。
- 不碰自由 SQL 编辑器；只动 JOIN 构建器。
- 不调用 `getDefaultPlacement`（其 INNER→WHERE 不下推）；固定 ON。
- 不在芯片做列选择以外的配置。

## 12. 边界与风险清单（评审重点）

| 边界 | 处理 |
|---|---|
| 落点（核心） | **一律 `placement='on'` → 子查询下推**（用户实测 WHERE 不下推） |
| 表唯一时间列是 birthday/expire 等语义列 | 不进候选 → 不建议 |
| `create_user` 等同名非时间列 | 类型门槛先排除 |
| 多个审计时间列 | 推 create 优先；芯片下拉可改选 |
| t0 / 各 JOIN 类型 | 统一 ON 子查询预过滤；无需特殊分支 |
| 自连接 / 表名重复 | 跳过（`table` 字段无法消歧实例） |
| 非联邦表 | 跳过（本地无抽数问题） |
| 列加载中 / 出错（`hasColumnErrors`） | 暂不出芯片，加载后重算 |
| value 引号 | 传裸串，生成器 `escapeSqlString` 加引号 |
| 已手动加过时间边界 | 抑制规则覆盖（= / 范围 / BETWEEN） |

## 13. 涉及文件（实现时核准精确锚点）

- `frontend/src/Query/JoinQuery/JoinQueryPanel.tsx` —芯片渲染、检测调用、插入（`tableColumnsMap` 1211、`joinConfigs` 1188、`filterTree` 1194、`duplicateSqlAliases` 1257、`JoinConnector` 845、子查询优化 288/347/379）。
- `frontend/src/Query/JoinQuery/buildJoinQueryPayload.ts` —`buildPushdownWhere`（98/198）、`canUseServerJoinPath`（76）。
- `frontend/src/Query/JoinQuery/FilterBar/types.ts` —`FilterCondition`/`placement`（72-86）、`FilterValue`（125）。
- `frontend/src/Query/JoinQuery/FilterBar/filterUtils.ts` —`createCondition`（682）、`getOnConditionsTreeForTable`（967）、`escapeSqlString`（224）。
- 新增纯函数模块：`frontend/src/Query/JoinQuery/timeBound.ts` —检测 + 候选排序 + 默认值 + 插入构造。
- `frontend/src/i18n/locales/{zh,en}/common.json` —`query.join.timeBound.*`。
- 测试：`timeBound.test.ts` + 芯片组件测试。
