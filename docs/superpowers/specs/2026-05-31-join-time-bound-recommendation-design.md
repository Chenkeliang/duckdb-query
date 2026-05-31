# 设计稿：联邦大表 JOIN 时间边界推荐 + 一键添加

- 日期：2026-05-31
- 范围：`JoinQueryPanel`（结构化 JOIN 构建器）
- 实现路径：**纯前端，零后端改动**
- 状态：待用户评审（已据代码实证修正字段用法与边界）

## 1. 问题

JOIN 联邦表（ATTACH 的 MySQL/PG）时，若大表没有时间范围约束，DuckDB 通过 ATTACH 抽取的数据量过大、易超时。用户当前手法：手动给大表加一条 `create_time / update_time` 之类时间谓词到 **ON** 上（放 ON 而非 WHERE，为不破坏外连接语义），让 DuckDB 把这个单表过滤下推到远端、少抽数据。

诉求：**自动识别该加哪一列时间谓词 + 一键加上**，多张表都支持。

## 2. 已确认的设计决策（来自 brainstorming）

| 决策点 | 结论 |
|---|---|
| 推荐内容 | 时间列 + **默认 30 天**范围；多张表各推各自的时间谓词 |
| 推荐入口 | **每个连接卡内联芯片**（缺时间边界的表才显示）；≥2 张表时加一个"全部添加"快捷 |
| 触发条件 | **联邦表为主**：只在 ATTACH 的 MySQL/PG 表上、有 create/update 审计时间列且尚未加时间边界时显示；本地表跳过；不测行数 |
| 实现路径 | 复用现有 FilterBar 能力，纯前端，可见可改，永不自动执行 |

## 3. 关键机制：复用 FilterBar 的 `placement` + 既有放置逻辑

> 相对 brainstorming 初稿的升级：不往 `joinConfigs` 插 expression-mode `JoinCondition`（那会令 `canUseServerJoinPath` 返回 false、强制走客户端 SQL 路径），改往 `filterTree` 插一个**原生 `FilterCondition`**，由现有机器接管。

代码实证：
- `FilterCondition`（`FilterBar/types.ts:72`）自带 `placement?: 'on' | 'where'`；`'on'` = "在 JOIN 时过滤，保留 NULL 行"。
- `buildPushdownWhere(filterTree, tableName)`（`buildJoinQueryPayload.ts:98,198`）**只挑** `placement==='on' && table===tableName` 的条件（`filterUtils.ts:967`），喂进**联邦源子查询下推**（server 路径）。
- `JoinQueryPanel.tsx:457-460` 把 `placement:'on'` 的过滤条件追加进 JOIN ON；`516` 处 `cloneTreeWithoutOnConditions` 把它们从 WHERE 剥离。
- `canUseServerJoinPath`（`buildJoinQueryPayload.ts:76`）只看 `joinConfigs` 是否含 expression，**不看 filterTree** → 插 filter 条件不会踢出 server 路径。

**结论**：一键添加 = 用 `createCondition(...)` 构造一个 `FilterCondition`、用 `getDefaultPlacement(context)` 决定 placement、`setFilterTree` 插入。**行为与用户在 FilterBar 里手动加一条时间过滤完全一致**——继承其已验证的放置/下推语义，不发明新语义。

## 4. 检测（哪些表、哪一列）—纯函数

输入：`activeTables`、`attachDatabases`、`tableColumnsMap`、`filterTree`、`joinConfigs`、`joinTableAliasMap`/`duplicateSqlAliases`。

> **字段实证修正**：`tableColumnsMap` 的 **key 是表名**（`getTableName(table)`，`JoinQueryPanel.tsx:1214/1217`），`TableColumn = {name, type}`，`type` 为 **DuckDB 规范类型串**（MySQL/PG 类型经 ATTACH 已归一化为 DuckDB 类型）。读取用 `tableColumnsMap[tableName]`，**不是** `[sourceId]`。

对每个数据源：

1. **联邦判定**：`isExternalTable(table)`（`JoinQueryPanel.tsx:58` 已导入）为真且存在 attach。本地 DuckDB 表跳过。
2. **时间型列**：`type`（去括号/大小写不敏感）∈ DuckDB 规范集 `{TIMESTAMP, TIMESTAMP WITH TIME ZONE, TIMESTAMP_S, TIMESTAMP_MS, TIMESTAMP_NS, DATE}`（MySQL `DATETIME` → DuckDB `TIMESTAMP`，故无需单列 DATETIME；**排除 `TIME`**，时分秒不适合做边界）。
3. **候选列（仅审计列，不兜底任意时间列）**：在时间型列中，名字（小写）命中：
   - **create 系**：含 `create` / `created` / `gmt_create` / `ctime` / `add_time` / `insert_time`
   - **update 系**：含 `update` / `updated` / `gmt_modified` / `modify` / `mtime` / `last_modified`
   - 二者皆不命中的时间型列（如 `birthday` / `expire_date` / `pay_time`）**不进候选**——避免推荐荒谬边界（**不误报优先**）。
   - 因第 2 步已按类型过滤，VARCHAR 的 `create_user` 等不可能进来。
4. **推荐列与排序**：候选内优先级 **create 系 > update 系**；同级按列序取第一个。同时命中两类的列归为 create。
5. **抑制（去重）**：该表已存在引用自己某时间型列、运算符 ∈ `{=, >, >=, <, <=, BETWEEN}` 的谓词时不提示。扫描两处：
   - `filterTree` 中 `table===该表名` 的 `FilterCondition`（遍历树）；
   - `joinConfigs` 中引用该表时间型列的 expression 条件（兜底用户手敲）。

产出：`Suggestion[] = { tableName, side: 'left'|'right', joinIndex, candidates: string[], recommended: string }`（`candidates` 已按优先级排序，`recommended = candidates[0]`）。

## 5. 落点（placement）—复用 `getDefaultPlacement`，跳过不安全 JOIN

每条建议构造 `PlacementContext { isRightTable, joinType }`，调用既有 `getDefaultPlacement`（`filterUtils.ts:1014`）：

- 现有逻辑：`右表 && (LEFT JOIN | FULL JOIN)` → `'on'`；其余 → `'where'`。
- 含义：
  - **INNER JOIN** → `'where'`：ON/WHERE 结果等价；DuckDB 对附加表的简单比较 WHERE 谓词会下推到远端，仍能限抽数。
  - **LEFT JOIN 右表** → `'on'`：保住左表 NULL 行 + 进显式子查询下推。
  - 其余（含 t0 驱动表、RIGHT JOIN 各侧）→ `'where'`：语义正确的过滤位。
- **不发明新规则**——与手动加 filter 完全同款，继承其已验证语义。

**跳过（边界）**：
- **FULL JOIN** 参与的表：两侧都保留，无干净边界打法（`'on'` 子查询预过滤会丢被保留行，`'where'` 会丢 NULL 扩展行）→ **不出建议**。
- **CROSS JOIN**（无 ON）→ 不出建议（罕见）。
- **自连接 / 表名重复**：`table` 字段按表名无法消歧，下游 remap 会歧义 → 用 `duplicateSqlAliases`（`JoinQueryPanel.tsx:1257`）检测，重复表名时该表**不出建议**。

## 6. 一键插入动作

用既有工厂构造，避免手搓 id/字段：

```ts
import { createCondition } from './FilterBar';
const node = createCondition(
  suggestion.tableName,   // table：填表名（非别名），下游 remapFilterTreeTableNames 处理
  chosenColumn,           // 默认 = suggestion.recommended，多候选时为用户所选
  '>=',                   // FilterOperator，含 >=
  defaultValue,           // 见 §7：裸日期串，无引号
  undefined,
  getDefaultPlacement({ isRightTable: suggestion.side === 'right', joinType }),
);
setFilterTree(tree => insertLeaf(tree, node));   // 用面板既有的 filterTree 插入方式
```

- "全部添加"：对所有 `Suggestion` 各插一条（各用各自 `recommended`）。
- 插入后该表被 §4.5 抑制覆盖，芯片消失。

## 7. 默认值（含字段实证修正）

前端计算 `now − 30 天`，格式化为 **裸字符串** `'YYYY-MM-DD 00:00:00'` 的**内容**（即 JS 字符串 `2026-05-01 00:00:00`，**不含 SQL 引号**）。

> **字段实证**：生成器 `formatSingleValue` 对 string 走 `escapeSqlString`（`filterUtils.ts:183-184`），**会自动加引号并转义**。所以 `value` 必须传裸串；若自带引号 → 双重加引号出错。

- 用字面量而非 `CURRENT_DATE - INTERVAL '30 days'`：对 MySQL/PG 下推更稳、可复现。
- 字符串 `>=` 比较 TIMESTAMP/DATE 列由 DuckDB 隐式转换，正确。
- 插入后用户可在 FilterBar 改日期/改表达式。

## 8. UI —内联芯片

- 缺时间边界的表，在其参与的 JoinConnector（`JoinQueryPanel.tsx:845`）上、ON 区旁显示轻芯片：**`⏱ 近30天 · create_time`**（透明展示将用的列）。
- **多候选列（§4.4 candidates>1）**：芯片带一个小 caret 下拉，列出候选时间列；默认选 `recommended`，用户可在添加前改选。单候选 → 无下拉，直接点。
- 点击（或选列后点）→ 执行 §6 → 芯片消失。
- ≥2 张表符合 → 面板顶部出现 **`⏱ 全部限定近30天 (N)`** 快捷（各表用各自 recommended）。
- tooltip 说明"为何 & 会下推到远端减少抽数"。

## 9. i18n

`common.json` 新增 `query.join.timeBound.*`（chip、全部添加、tooltip、候选列选择），zh + en，沿用 `query.*` 命名空间。

## 10. 测试（vitest，前端）

纯函数（核心）：
- 时间型列识别：`TIMESTAMP` / `TIMESTAMP WITH TIME ZONE` / 大小写 / `TIMESTAMP_NS` 命中；`TIME`、`VARCHAR` 不命中。
- 候选与排序：`create_time` 优先于 `updated_at`；只有 `birthday`/`pay_time` 时 **0 候选 → 不建议**；`create_user`(VARCHAR) 不入候选。
- 抑制：filterTree 已有该表时间范围谓词 → 不建议；joinConfigs expression 兜底。
- 落点：INNER→`where`、LEFT 右表→`on`、t0→`where`；FULL/CROSS/自连接 → 不建议。
- 默认值：`now−30天` 的裸串格式（无引号）。
- 插入：`createCondition` 产出 table=表名 / column / operator='>=' / value=裸串 / placement 正确。

组件：
- 符合表渲染芯片 / 不符合不渲染 / 单候选直接点 / 多候选下拉改选 / 点击插入 / "全部添加"。

集成（择一确认链路）：
- 插入 placement=on 后，`buildPushdownWhere(filterTree, tableName)` 含 `>= '…'`；插入 placement=where 后进 WHERE。

## 11. 明确不做（YAGNI）

- 不测行数 / 不做"大小门槛"；不查真实 `MIN/MAX`。
- 不加后端、不加持久化配置。
- 不碰自由 SQL 编辑器；只动 JOIN 构建器。
- 不为 FULL/CROSS/自连接做特殊边界打法（直接不建议）。
- 不发明 placement 规则（复用 `getDefaultPlacement`）。

## 12. 边界与风险清单（评审重点）

| 边界 | 处理 |
|---|---|
| 表唯一时间列是 birthday/expire 等语义列 | 不进候选 → 不建议（不误报） |
| `create_user` 等同名非时间列 | 类型门槛先排除（非 TIMESTAMP/DATE） |
| 多个审计时间列 | 推 create 优先；芯片下拉可改选 |
| INNER JOIN | placement=`where`，靠 DuckDB 通用下推（简单比较可靠下推） |
| LEFT JOIN 右表 | placement=`on`，保 NULL + 显式子查询下推 |
| RIGHT JOIN | 复用 getDefaultPlacement（→where），不自造规则 |
| FULL JOIN | 跳过（无干净边界） |
| CROSS JOIN（无 ON） | 跳过 |
| 自连接 / 表名重复 | 跳过（table 字段无法消歧） |
| 列仍在加载 / 加载出错（`hasColumnErrors`） | 无类型信息 → 暂不出芯片，加载后重算 |
| value 引号 | 传裸串，生成器 `escapeSqlString` 加引号 |
| 已手动加过时间边界 | 抑制规则覆盖（含 = / BETWEEN / 范围运算符） |

**唯一"绕"点**：placement 因 JOIN 类型而异，但完全委托给已验证的 `getDefaultPlacement`，并对它处理不干净的 FULL/CROSS/自连接显式跳过。

## 13. 涉及文件（实现时核准精确锚点）

- `frontend/src/Query/JoinQuery/JoinQueryPanel.tsx` —芯片渲染、检测调用、插入（`tableColumnsMap` 1211、`joinConfigs` 1188、`filterTree` 1194、`duplicateSqlAliases` 1257、`JoinConnector` 845、`joinTableAliasMap` 1252）。
- `frontend/src/Query/JoinQuery/FilterBar/types.ts` —`FilterCondition`/`placement`（72-86）、`PlacementContext`（62）、`FilterValue`（125）。
- `frontend/src/Query/JoinQuery/FilterBar/filterUtils.ts` —`createCondition`（682）、`getDefaultPlacement`（1014）、`getOnConditionsTreeForTable`（967）、`escapeSqlString`（224）。
- 新增纯函数模块：`frontend/src/Query/JoinQuery/timeBound.ts` —检测 + 候选排序 + 默认值 + 插入构造（便于单测）。
- `frontend/src/i18n/locales/{zh,en}/common.json` —`query.join.timeBound.*`。
- 测试：`timeBound.test.ts` + 芯片组件测试。
