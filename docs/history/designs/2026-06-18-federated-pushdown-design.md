# 联邦查询智能下推 — 设计 Spec

- **日期**: 2026-06-18
- **分支**: `feat_federated_pushdown`(从 `origin/main` 切出)
- **状态**: 设计已与用户逐项确认,待 spec 评审 → writing-plans
- **作用面**: 后端 `api/`,仅 raw 端点 `/api/duckdb/federated-query`

---

## 1. 问题与动机

联邦查询(DuckDB `ATTACH` MySQL/PostgreSQL + 跨源 JOIN)在 **raw 端点** `POST /api/duckdb/federated-query`(`api/routers/duckdb_query.py:746` `execute_federated_query`)上**完全不做 SQL 改写**:拿到用户 SQL → `ATTACH` → `conn.execute(sql).fetchdf()` 原样执行 → `DETACH`。它 100% 依赖 DuckDB mysql/postgres scanner 的自动下推 —— 而 scanner **只下推作用于远端表的简单 WHERE/投影,不下推 JOIN 谓词**。

后果:`SELECT ... FROM mysql_db.orders o JOIN local l ON o.id = l.id` 这类跨源 JOIN 会对远端大表做**全表扫描**(把整张表拉进 DuckDB 再 join),配合下面这条,直接表现为"连接超时":

- 配置项 `federated_query_timeout: 300`(`api/core/common/config_manager.py:183`)**从未被强制执行** —— handler 同步执行,无 `asyncio.wait_for`/watchdog。大查询会**一直挂到 OS 断连**,而非超时失败。

**前端已有一套智能优化,但 raw 路绕开了它**(见 §3),所以从 SQL 编辑器、图表、以及新接入的 **MCP** 发起的联邦查询都享受不到。本设计把这套能力**下沉到后端 raw 路**,并补上前端都还没有的能力。

## 2. 目标 / 非目标

**目标**
- raw 端点的联邦 JOIN 不再对远端大表裸全表扫(在保持查询结果的前提下)。
- 即便优化未命中,也能在 `federated_query_timeout` 内 **fail-fast**,而非挂死。
- 不破坏前端现有可视化 JOIN 逻辑(§3 的幂等保证)。
- MCP / SQL 编辑器 / 图表三类今天零优化的调用方直接受益。

**非目标(明确不做,YAGNI)**
- 不改动前端任何代码。
- 不把前端优化器统一进后端(两层暂时并存)。
- 不做基于行数估计的"大表门控"。
- 时间界建议不从 JOIN 对侧真实数据反推窗口(只给定性建议)。

## 3. 背景:前后端现状(已落到代码)

### 3.1 前端的联邦优化(三层,均在 `frontend/src/Query/JoinQuery/`)
- **`timeBound.ts`** — "检查 schema 时间字段":`isTimeType()` 认 `DATE/DATETIME/TIMESTAMP*`(覆盖源库原生类型);`classifyAuditColumn()` 按词干认审计列(create 系 `creat/ctime/add_time/insert_time`,update 系 `updat/modif/mtime`);`defaultTimeBoundValue(days=30)` 给"近 30 天";`buildTimeBoundSuggestions()` 对**外部大表**、且用户**尚未对该审计列设界**时,推一条 `placement='on'` 的 `col >= 近30天`。**经 `TimeBoundChip` 由用户显式点选才生效。**
- **`sqlOptimizer.ts`** — "改写联邦查询为 ON 查询":把 `placement='on'`、**只引用单张远端表**的过滤条件,包成 `(SELECT * FROM remote WHERE <pred>) AS alias` 下推。Bailout:本地表 / 无过滤 / OR 逻辑 / 多表引用 / 复杂表达式 → 不优化。
- **`buildJoinQueryPayload.ts`** — 把 ON 条件落成 `source.params.pushdown_where`(供结构化 `/api/query` 路使用)。

### 3.2 两条后端路
- **结构化** `/api/query`(`api/routers/join_query.py`):`_source_table_sql`(`:434`)读 `params.pushdown_where` → 把远端表包成 `(SELECT 选中列 FROM remote WHERE pushdown_where) AS alias`,并有投影裁剪(`_federated_subquery_select_list`)。**有下推设施,但 WHERE 来自前端显式传入。**
- **raw** `/api/duckdb/federated-query`(`api/routers/duckdb_query.py:746`):**零改写**(本设计的作用面)。

### 3.3 raw 端点的四类前端/外部调用方
| 调用方 | 入口 | 现状 |
|---|---|---|
| SQL 编辑器/工作台 | `frontend/src/hooks/useQueryWorkspace.ts:219` | 用户原始 SQL,**无优化** |
| 图表 | `frontend/src/Query/Charts/ChartView.tsx:65` | chartSql,**无优化** |
| **可视化 JOIN(联邦)** | `frontend/src/Query/JoinQuery/JoinQueryPanel.tsx:1664 generateSQL → :1746 onExecute` | **前端已把 sqlOptimizer 的子查询烤进 SQL 串**(`optimizedTableRefs` → `(SELECT … WHERE …) AS alias`)再发出 |
| MCP | `mcp/duckquery_mcp/tools/query.py federated_query` | 原始 SQL,**无优化** |

### 3.4 关键幂等洞察
可视化 JOIN 联邦路发到 raw 端点的 SQL,**远端表已经是子查询**。因此后端改写只要**严格只针对"裸远端表引用"**(如 `mysql_db.orders`、`"pg"."public"."t"`),就会**原样穿过**前端已包好的子查询 → **可视化 JOIN 行为零变化**。受影响的只有 SQL 编辑器 / 图表 / MCP —— 它们今天零优化,属净增益。

## 4. 核心原则:保持结果 vs 改变结果

这条决定了每个组件能否"静默自动":

- **保持结果**(可默认常开、静默):半连接键下推、ON 过滤下推、投影裁剪 —— 改写后**最终结果集与原查询逐行一致**。
- **改变结果**(不可静默):时间界默认窗口会**悄悄丢老数据**。前端靠用户点 chip 同意;后端/MCP 无 UI 确认,**只检测、只建议、不改 SQL**(用户决策)。

## 5. 设计:四个组件

所有改写组件共同的不变量:**只改裸远端表引用、幂等、bailout 保底放行**(解析或改写抛错 → 原样执行原 SQL)。

### 5.1 半连接键下推(常开 · 保持结果 · 硬核)

对等值 JOIN `remote.k = other.k`,把远端裸表重写为:
```sql
(SELECT * FROM remote WHERE k IN (<other 侧 DISTINCT 键字面量>)) AS alias
```
- **资格(保结果的关键)**:
  - INNER JOIN:两侧均可缩。
  - LEFT/RIGHT JOIN:只缩**非保留侧**(被 LEFT/RIGHT 保留的那侧不能缩,否则丢行)。
  - FULL OUTER:两侧都不缩。
- **键来源(v1)**:只物化 **本地 DuckDB 侧**的键(`SELECT DISTINCT other_col FROM local [WHERE 本地谓词] LIMIT 阈值+1`),廉价。两侧皆远端 → 本组件跳过,交给时间界建议 + 护栏。
- **基数守卫**:若 distinct 键数 > 阈值(默认 10000,配置项),跳过(灌超大 IN 反而更慢)。
- **类型处理**:字符串/日期加引号转义,数值裸出;含 NULL 键时 `IN` 语义需保证不漏(必要时 `OR k IS NULL` 视 join 语义,v1 仅对非保留侧、INNER 安全场景启用)。

### 5.2 ON 过滤下推(常开 · 保持结果)

移植 `sqlOptimizer.ts` 的逻辑到后端:把"只引用单张远端表"的 WHERE/ON 谓词,合并进该远端表的子查询 `WHERE`。Bailout 与前端一致:OR 逻辑、跨多表引用、复杂表达式 → 该表跳过(其余表照常)。与 §5.1 共用同一个"远端表 → 子查询"重写出口(同一张表的键 IN 与过滤谓词 `AND` 合并)。

### 5.3 时间界建议(只检测 · 不改写 · 改结果故不自动)

移植 `timeBound.ts` 的检测纯函数到后端(`is_time_type` / `classify_audit_column` / `detect_time_bound_candidates` / `default_time_bound_value`)。流程:`ATTACH` 后 `DESCRIBE alias.table` 取列+类型 → 若远端表有审计时间列**且原 SQL 未对它写任何时间谓词** → 在响应 `suggestions` 里追加一条:
```json
{"type":"time_bound","table":"mysql_db.orders","column":"created_at",
 "hint":"该表有审计列 created_at 且无时间过滤;加 WHERE created_at >= '<近30天>' 可大幅减少远端扫描"}
```
**不修改 SQL**。由 AI/调用方决定是否带界重跑。镜像前端 chip 的"用户同意"语义。

### 5.4 护栏(独立 · 高价值)

- **超时强制**:联邦查询**总是**走 `interruptible_connection`(无 `X-Request-ID` 时合成 `fed:<uuid>` task_id),执行前起 `threading.Timer(federated_query_timeout, → connection_registry.interrupt(task_id))`,`finally` 中 `timer.cancel()`。定时器触发置 `timed_out` 标志 → 把 `duckdb.InterruptException` 映射为新 `MessageCode.QUERY_TIMEOUT`(504,"查询超过 Ns 被中止"),与客户端主动取消(`QUERY_CANCELLED`)区分。**复用现有 `connection_registry.interrupt` 中断机制,零新机制。**
- **connection_id 归一**:attach 配置循环(`duckdb_query.py:772`)用现有 `api/core/common/connection_alias.py:normalize_connection_id` strip `db_`(后端根因修复;MCP 侧已先行修过)。

## 6. 架构与模块

| 模块 | 职责 |
|---|---|
| `api/core/database/federated_time_bound.py` (新) | 移植自 `timeBound.ts` 的纯函数:`is_time_type` / `classify_audit_column` / `detect_time_bound_candidates` / `default_time_bound_value` |
| `api/core/database/federated_optimizer.py` (新) | 核心:`optimize_federated_sql(conn, sql, attach_aliases, cfg) -> OptimizeResult{sql, suggestions, warnings, reports}`。内部用 sqlglot 解析、分类远端/本地表、§5.1/§5.2 重写、§5.3 检测。纯逻辑尽量与"取键/取 schema"的副作用解耦(传入回调或已物化的数据),便于单测 |
| `api/routers/duckdb_query.py:execute_federated_query` (改) | 在 `execute_in_connection` 内、`ATTACH` 之后、执行用户 SQL 之前调用 `optimize_federated_sql`;§5.4 护栏包裹执行;attach 循环加 `normalize_connection_id` |

`reports`(每表 optimized/skip 原因)进响应 `warnings`,对 AI/用户透明。

## 7. 数据流(连接内两阶段)

```
execute_federated_query
  ├─ 归一 connection_id、预备 attach_configs
  ├─ interruptible_connection(query_id) + watchdog Timer(timeout)
  └─ execute_in_connection(conn):
       1. ATTACH 外部库
       2. optimize_federated_sql(conn, sql, aliases, cfg):
            a. sqlglot 解析;按 attach 别名分类远端/本地表引用
            b. 对每个等值 JOIN:判资格 → 物化本地侧 DISTINCT 键(基数守卫)
            c. 重写裸远端表 → (SELECT * FROM remote WHERE k IN(…) [AND 单表过滤]) AS alias
            d. DESCRIBE 远端表检测审计列 → 生成 time_bound suggestions(不改 SQL)
            e. 任意步骤抛错 → 返回原 SQL(bailout)
       3. conn.execute(优化后 SQL).fetchdf()
       4. DETACH
  └─ 响应附带 optimized_sql / suggestions / warnings
```

## 8. 资格与安全规则(汇总)

- 半连接键缩:INNER 两侧 / OUTER 仅非保留侧 / FULL 都不缩。
- 键来源 v1 仅本地表;两侧皆远端 → 跳过该 JOIN 的键下推。
- 基数守卫:键 distinct > 阈值 → 跳过。
- ON 过滤下推:OR / 跨多表 / 复杂表达式 → 该表跳过。
- 幂等:只改裸远端表引用;已是子查询/CTE 的引用不动。
- 时间界:只建议,绝不自动改 SQL。

## 9. 错误处理 / Bailout / 幂等

- `optimize_federated_sql` 内部全程 try/except:**任何**解析/改写/取键失败 → 返回**原始 SQL** + 一条 `fallback` warning,执行不受影响。
- 物化键的探测查询自身也受 watchdog 超时保护(避免"为优化而先卡住")。
- 优化只增不改语义:产出 SQL 与原 SQL 结果集逐行一致(时间界除外,而它不自动用)。

## 10. 新依赖

- **`sqlglot`**(纯 Python,DuckDB 方言)—— 用于健壮的 AST 改写(把表引用替换为子查询节点)。前端那套字符串级 tokenizer 不适合做"包子查询"重写。加入 **`api/requirements.txt`**(`api/Dockerfile` 的唯一依赖来源:`COPY api/requirements.txt → pip wheel → pip install`,docker 重 build 自动收录,**无需改任何 Docker 逻辑**);PyInstaller 桌面打包确认收录(必要时加 hidden import)。

**部署无关性**:改动的 `duckdb_query.py` / `duckdb_engine.py` / `duckdb_pool.py` / `connection_registry.py` 均无 docker/部署特判,联邦执行路在 docker / 桌面 / 手动三种部署下逐行一致;本期不触碰端口 / `runtime.json` / 持久化目录。

## 11. 测试策略(TDD)

- **移植**:`frontend/.../timeBound.test.ts`、`sqlOptimizer` 用例 → pytest(同词干、近30天、bailout 断言)。
- **新增**:
  - 半连接保结果:INNER/LEFT/RIGHT/FULL 各 join 类型下,优化前后结果集逐行一致(用本地 DuckDB 表 + sqlite ATTACH 模拟远端)。
  - 幂等:已含 `(SELECT … WHERE …) AS a` 子查询的 SQL(前端形状)→ 原样穿过,不二次包裹。
  - Bailout 穿透:OR / 多表 ON / 解析失败 → 返回原 SQL。
  - 基数守卫:键超阈值 → 不下推。
  - 时间界:有审计列且无时间谓词 → 出 suggestion 且 **SQL 不变**;已有时间谓词 → 不建议。
  - 护栏:慢查询触发 watchdog → `QUERY_TIMEOUT`(504)且连接被回收;`connection_id` 带 `db_` 前缀 → 归一后能命中。
- **集成**:用 sqlite 作为"远端"ATTACH 跑端到端(CI 无需真 MySQL)。

## 12. Open Questions / 未来

- 两侧皆远端的 JOIN:v1 不做键下推(仅时间界建议 + 护栏)。未来可物化较小一侧。
- 时间界建议未来可升级为"从 JOIN 对侧真实 min/max 反推窗口"。
- 后续可考虑让前端可视化 JOIN 也改为发裸 SQL、由后端统一优化(消除前后端两份逻辑),但本期不动。
