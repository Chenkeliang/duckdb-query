# Task 11 · External DB → DuckDB Import + Workbench Enhancements

## 背景与目标
新入口（`DuckQueryApp` + `frontend/src/new/`）需要支持外部数据库（MySQL / PostgreSQL / SQLite）作为数据源，但**不直接让外部库“挂载/连接到 DuckDB 查询”**。  
期望交互是：

1. 左侧数据源树可浏览外部连接及其表。
2. 当用户选择外部表或输入外部 SQL 时，前端通过外部 SQL 查询从外部库拉取数据（预览）。
3. 用户可一键将外部查询结果 **导入成 DuckDB 表**（`CREATE TABLE AS SELECT` 语义），之后所有 Join / Union / Pivot / Visual 等多表计算**只在 DuckDB 内进行**。

同时，查询工作台的 Join / Set(Union) / Pivot 等模式需要补齐正确性与能力边界。

## 约束（必须遵守）
- 新 UI 只在 `frontend/src/new/` 开发，完全使用 shadcn/ui + Tailwind；禁止引入 legacy MUI/modern.css。
- 不修改旧入口/旧组件，除非明确指示迁移。
- 新入口数据获取必须走 TanStack Query + 新统一接口。

---

## 当前问题清单（按优先级）

### P0 · 外部数据库链路
1. **外部连接列表解析错误，导致连接/外部查询列表为空**
   - `frontend/src/hooks/useDuckQuery.js` 仍按旧格式读取 `/api/datasources?type=database`，应读 `data.items` 并映射成旧结构。
2. **PG/SQLite 连接“假成功”**
   - `handleDatabaseConnect/handleDatabaseSaveConfig` 仅对 mysql 真正 test+create。
3. **连接测试结果判断错误**
   - `/api/datasources/databases/test` 顶层 `success` 仅表示接口成功，真实测试结果在 `data.connection_test.success`。
4. **新工作台外部连接树类型映射错**
   - `useDatabaseConnections` 直接返回 DataSourceResponse，`connection.type` 变成 `"database"`，导致 schemas/tables 懒加载判断全失效。
5. **导入 DuckDB 的后端仅支持 mysql**
   - `/api/save_query_to_duckdb` 只处理 `datasource_type in ["mysql"]`，需要扩展到 `postgresql/sqlite`，并 strip `db_` 前缀。

### P1 · QueryWorkbench Tab 正确性
1. **Join 模式删除表后 joinConfigs 不缩减**
   - 删除中间表会保留旧 join 配置，可能生成无效 SQL。
2. **Set/Union 模式缺列一致性校验**
   - UI 允许每表选不同列，DuckDB 执行会 Binder Error。
3. **Pivot 模式未真正实现 pivot**
   - `columnField` 必填但 SQL 未使用，当前只是 `GROUP BY rowFields` 的聚合。

### P2 · 功能增强/UX
- 外部表在 Join/Set/Pivot/Visual 中需要“先导入再使用”的引导/禁用策略。
- i18n 仍有硬编码文案（DataSourcePanel/Join/Set/Pivot 的 toast/placeholder）。

---

## 最优实现方案（推荐分阶段）

### Phase 0 · 修通外部连接基础链路（P0）
**前端**
1. `useDuckQuery` 解析新格式：
   - `/api/datasources?type=database` → `items = res.data.items`
   - 映射为：
     - `id = item.id.replace(/^db_/, "")`
     - `name = item.name`
     - `type = item.subtype`（mysql/postgresql/sqlite）
     - `params = { ...item.connection_info, ...item.metadata }`
2. `handleDatabaseConnect/handleDatabaseSaveConfig` 支持 mysql/pg/sqlite：
   - 测试：
     - 若 `params.password === "***ENCRYPTED***"`（历史连接）→ 调 `/api/datasources/databases/{id}/refresh`  
     - 否则 → 调 `/api/datasources/databases/test`
     - 成功判断看 `payload.data.connection_test.success`
   - 保存：`createDatabaseConnection({id,name,type,params})`
3. `frontend/src/new/hooks/useDatabaseConnections.ts`：
   - 把 `DataSourceResponse` 映射为 `{ id,name,type:subtype,status,params }`
   - 这样外部连接树能展开加载 schemas/tables。

**后端**
1. `/api/save_query_to_duckdb`：
   - 支持 `datasource_type in ["mysql","postgresql","sqlite"]`
   - datasource_id 允许 `db_` 前缀并 strip。

### Phase 1 · 新工作台外部 SQL 预览 + 导入 DuckDB（核心需求）
**设计原则**
- **预览走外部查询**，结果展示在 AG Grid。
- **一键导入**把外部结果落到 DuckDB，之后当作内部表使用。

**前端改造点**
1. `SelectedTable` 结构从 string 升级为 `{ name, source }`：
   - `source.type: "duckdb" | "external"`
   - external 需带 `connectionId` + `schema?`。
2. SQLQuery tab：
   - 若当前选中 external 表 → 自动填充外部 SQL：  
     `SELECT * FROM "<schema>"."<table>" LIMIT 100`
   - 执行按钮：
     - external：调用 `executeSQL(sql, {type: externalType, id: connectionId})`（/api/execute_sql，预览）  
     - duckdb：维持 `executeDuckDBSQL`。
3. 结果面板增加“导入 DuckDB”按钮：
   - 调 `saveQueryToDuckDB(sql, {type: externalType, id: connectionId}, alias)`
   - 成功后：invalidate DuckDB tables cache，左侧树出现新表。

**后端复用**
- 预览：`/api/execute_sql`（已支持 mysql/pg/sqlite）。
- 导入：`/api/save_query_to_duckdb`（Phase 0 扩展后复用）。

### Phase 2 · 外部表在多表模式的策略
**推荐策略**
- Join / Set / Pivot / Visual **仅允许 DuckDB 表参与计算**。
- 数据源树对 external 表提供：
  - “预览”（外部预览 SQL）
  - “导入 DuckDB”（一键）
  - 但在多表模式选择时 disable external。

这样避免把 external 表当 DuckDB 标识符导致失败，同时符合“外部先导入再用”的产品逻辑。

### Phase 3 · Join Builder 能力升级
**目标能力**
- 支持任意两表 JOIN（非链式）
- 每条 join 支持多条件（AND）
- 支持左右方向 / 变更主表

**数据结构**
```ts
type JoinEdge = {
  leftTable: string;
  rightTable: string;
  joinType: 'INNER'|'LEFT'|'RIGHT'|'FULL';
  conditions: Array<{ leftCol: string; op: '='|'<'|'>'|...; rightCol: string }>;
};
```

**UI/交互**
1. 表卡片区域可拖拽重排（决定 base table）。
2. “添加 JOIN”：
   - 选 leftTable/rightTable、joinType
   - conditions 列表支持 Add/Remove
3. 删除表时自动删除相关 edge。

**SQL 生成**
1. 以 base table 为 FROM
2. 按 edge 顺序把未加入的表 JOIN 进来
3. 每个 edge 条件用 `AND` 拼接
4. 为每表分配 alias，避免同名冲突。

**短期先修**
- 修 `joinConfigs` 缩减/重建逻辑（P1）。
- 在链式 join 内先支持“多条件”。

### Phase 4 · Set/Union 正确性增强
**最小正确性**
- 所有表共享列选择（只允许在第一表选列，其它表自动同步）。
- 或执行前校验：列数一致 + 类型可兼容（不满足 disable 执行 + 提示原因）。

### Phase 5 · Pivot 真正实现
**两种实现路线**
1. DuckDB PIVOT：
   - 先 query distinct `columnField`（限制 topN）
   - 生成  
     `PIVOT (SUM(v) FOR columnField IN ('a','b',...))`
2. CASE WHEN：
   - 对每个 distinct 值生成  
     `SUM(CASE WHEN columnField='a' THEN v END) AS "a"`

必须把 `columnField` 真正落到 SQL 中，并提供“distinct 值过多”的保护（例如只取前 20）。

---

## 风险与建议
- **大数据外部导入**：同步接口可能超时；可在 Phase 1.5 引入异步任务（/api/async_query + 导入完成回写 DuckDB）。
- **类型映射**：外部库字段类型 → DuckDB 类型需要后端统一转换（已有 `create_table_from_dataframe` 可复用）。
- **权限/密码**：历史连接测试必须走 refresh 端点，否则占位符无法测试（已在 Phase 0 处理）。

---

## 验收标准
1. 新入口能显示外部连接及表树；外部 SQL 可预览并导入 DuckDB。
2. 导入后的表在 DuckDB 表树可见，并可参与 Join/Union/Pivot/Visual。
3. Join 支持多条件、可调整左右方向/主表，删除表不会生成坏 SQL。
4. Set/Union 有列一致性策略，不再让用户直接踩 binder error。
5. Pivot 真正按透视列生成结果。

---

## UI/UX 详细规格（新 QueryWorkbench）

> 本节是 Phase 1~5 的落地界面规格。所有新 UI 必须只使用 `frontend/src/new/components/ui/*` 的 shadcn 组件 + Tailwind 类名；不写自定义 CSS、不直接使用 CSS 变量、不用 legacy class。

### 0. 术语与状态
- **DuckDB 表**：`source.type="duckdb"`，可参与所有查询模式。
- **External 表/连接**：`source.type="external"`，仅可预览/导入，不可直接参与 Join/Set/Pivot/Visual。
- **预览(Preview)**：只拉取外部/内部查询的前 N 行用于展示（N 默认 100 或 10000）。
- **导入(Import)**：把某次查询/某张外部表的完整结果保存为 DuckDB 表（`save_query_to_duckdb`）。

所有用户可见文案必须走 i18n（`common` namespace），默认中文回退。

### 1. 左侧数据源树（DataSourcePanel）

#### 1.1 结构
左侧树分两段（`TreeSection`）：
1) **数据库连接（External Connections）**
   - Node 层级：Connection → Schema（仅 PG）→ Table
2) **DuckDB 表（DuckDB Tables）**
   - Node 层级：Table

#### 1.2 节点样式
- Connection 节点：`TreeNode` + `Database` icon。
  - `statusIndicator`: active=success/inactive=muted/error=error（使用已有语义类）。
  - 右键菜单（`ContextMenu`）：
    - `Refresh connection`：invalidate schemas + tables cache。
- Schema 节点（PG）：展示 schema 名 + `Badge` 表数。
- Table 节点：
  - DuckDB 表：显示行数 badge（未知显示 `—`）。
  - External 表：显示来源 tag（MySQL/PG/SQLite），不显示行数（或 lazy fetch 后显示）。

#### 1.3 交互与限制
- **单击选择**
  - 当前模式 `sql` / `pivot` / `visual`：单选替换。
  - 当前模式 `join` / `set`：多选追加/取消。
- **双击**
  - DuckDB 表：同单击选择，并自动填充 SQL。
  - External 表：同单击选择并自动填充 External SQL，同时右侧提示“外部表需先导入 DuckDB 再参与多表计算”。
- **多表模式禁用 External 选择**
  - `currentTab` 为 `join` / `set` / `pivot` / `visual` 时：
    - External TableItem disabled：`opacity-50 cursor-not-allowed`
    - Hover tooltip：`t("workspace.externalDisabledHint")`（“请先导入 DuckDB 再使用”）
    - 仍允许右键 `Preview` / `Import to DuckDB`。
- **External 表右键菜单**
  - `Preview`：切到 SQL tab + 填充外部 SQL + 自动执行预览。
  - `Import to DuckDB`：打开导入对话框（见 3.2）。

#### 1.4 搜索
- placeholder：`t("workspace.searchTables")`
- 搜索时自动展开 Connection/Schema，仅显示命中表。

### 2. SQL 查询 Tab（SQLQueryPanel）

#### 2.1 顶部工具栏
- 左侧：
  - 数据源 Chip：
    - DuckDB：`Badge variant="secondary"` → `DuckDB`
    - External：`Badge variant="outline"` → `MySQL/PG/SQLite` + 连接名
  - External 时显示提示：`t("workspace.externalPreviewHint")`
- 右侧按钮（`Button size="sm"`）：
  1) `Execute/Preview`
     - DuckDB：`t("query.execute")`
     - External：`t("query.preview")`
  2) `Import to DuckDB`（仅 External 且已有结果）
  3) `Format SQL`
  4) `History`

#### 2.2 自动填充 SQL
- DuckDB 表：`SELECT * FROM "<table>" LIMIT 100`
- External 表：
  - MySQL/SQLite：`SELECT * FROM "<table>" LIMIT 100`
  - PG：`SELECT * FROM "<schema>"."<table>" LIMIT 100`

#### 2.3 执行行为
- DuckDB：`executeDuckDBSQL(sql)`
- External：
  - `datasource={ type: externalType, id: connectionId }`
  - 调 `executeSQL(sql, datasource, true)` 预览
  - 成功后 `queryResults.canImport=true`

#### 2.4 错误与空结果
- 空结果：toast warning `t("query.externalEmpty")`
- 执行错误：toast error（后端 message），编辑器保留输入。

### 3. 结果面板（ResultPanel + AGGrid）

#### 3.1 面板结构
- stats bar：行数/耗时/列数
- 右侧按钮区：
  - `Import to DuckDB`（仅 External 且可导入）

#### 3.2 External 导入对话框（ImportDialog）
触发：
- SQL tab 的 `Import to DuckDB`
- External 表右键 `Import to DuckDB`

结构（`Dialog`）：
1) Title：`t("workspace.importDialog.title")`
2) 描述：来源（连接名/表名或 SQL 摘要）
3) 表别名输入 `Input`
   - placeholder：`t("workspace.importDialog.aliasPlaceholder")`
   - 默认值：
     - 表导入：表名
     - SQL 导入：`external_<timestamp>`
4) 冲突策略（可选 `RadioGroup`）：
   - `fail`（默认）
   - `replace`
5) Actions：Cancel / Import（loading）

校验：
- alias 非空且匹配 `[A-Za-z0-9_]+`。

成功：
- toast success `t("workspace.importDialog.success", {table})`
- invalidate DuckDB tables cache，树中选中新表。

失败：
- toast error（后端 message），Dialog 保持打开。

### 4. Join Tab（JoinQueryPanel v2）

#### 4.1 入口限制
- 仅 DuckDB 表可选入。

#### 4.2 布局
- 顶部工具栏：`Clear` / `Add Join` / `Execute`
- 主区：
  1) 表卡片区（横向滚动）
  2) Join Edges 列表区（纵向）
  3) SQL 预览（折叠）

#### 4.3 表卡片区
- 每表 `Card`：
  - 表名 + 主表标记（第一个）
  - 列 checkbox（默认全选）
- 支持拖拽重排，重排后第一个表为 base table。

#### 4.4 Join Edges 编辑器
- 每条 edge 一个 `Card`：
  - leftTable Select
  - joinType Select
  - rightTable Select
  - conditions 列表：
    - leftCol Select + op Select + rightCol Select + Remove
    - `Add condition` 按钮
  - Remove edge（trash）

默认：
- 新 edge leftTable=base table，rightTable=最近新增表；
- 第一条 condition 自动匹配 `id` 或首列。

#### 4.5 SQL 生成与校验
- FROM baseTable AS t0
- 每 edge 右表 alias=tN，ON 条件用 `AND`
- SELECT 默认选中列，输出 `"tX"."col" AS "table.col"`

校验：
- 至少 2 表
- 每 edge 至少 1 条条件且列不空  
不满足 disable Execute，并在 edge 下显示 error。

### 5. Set/Union Tab（SetOperationsPanel v2）

#### 5.1 入口限制
- 仅 DuckDB 表。

#### 5.2 列选择策略（同步列）
- 只允许在第一表选择列；其它表只读跟随。

#### 5.3 执行校验
- 校验列数一致 + 类型兼容（数值互转允许，文本/JSON 需显式 cast）。
- 不兼容时：
  - 顶部 `Alert destructive` + 提示
  - Execute disabled。

### 6. Pivot Tab（PivotTablePanel v2）

#### 6.1 入口限制
- 仅 DuckDB 表。

#### 6.2 布局
- 头部：表选择 + Execute
- 内容三卡：Row fields / Pivot column / Value fields
- SQL 预览折叠卡。

#### 6.3 Pivot column 交互
- 选 `columnField` 后自动拉取 distinct Top20（按频次降序）。
- 候选值 checkbox 列表：
  - 默认全选 Top10
  - 允许增删
  - 超过 20 显示 warning：`t("query.pivot.tooManyDistinct")`。

#### 6.4 SQL 生成（CASE WHEN）
- 每个 pivotValue 生成：  
  `SUM(CASE WHEN columnField='<v>' THEN valueCol END) AS "<v>"`
- SELECT rowFields + pivotAggs  
  FROM table  
  GROUP BY rowFields  
  ORDER BY rowFields  
  LIMIT 1000

无 pivotValues 时 disable Execute。

### 7. Visual Tab（VisualQuery）

#### 7.1 入口限制
- TableSelector 仅展示 DuckDB 表；External 表隐藏或禁用并提示需先导入。

---

## 附录 A · i18n Key 清单（需新增/确认）

> 以下 key 在本任务中被 UI/UX 规格引用；若已有则仅确认含义，否则需要补到 `frontend/src/i18n/locales/zh/common.json` 与 `en/common.json`。

| Key | 中文默认文案 | English default |
|---|---|---|
| `workspace.externalDisabledHint` | 请先导入 DuckDB 再使用该外部表 | Import into DuckDB before using this external table |
| `workspace.searchTables` | 搜索表/连接... | Search tables/connections... |
| `workspace.externalPreviewHint` | 正在预览外部数据，执行后可导入 DuckDB | Previewing external data. You can import into DuckDB after preview |
| `query.preview` | 预览 | Preview |
| `query.externalEmpty` | 外部查询返回空结果 | External query returned no rows |
| `workspace.importDialog.title` | 导入到 DuckDB | Import into DuckDB |
| `workspace.importDialog.aliasPlaceholder` | 输入 DuckDB 表名（仅字母/数字/下划线） | Enter DuckDB table name (letters/numbers/underscore only) |
| `workspace.importDialog.conflictTitle` | 同名表处理 | Handle name conflict |
| `workspace.importDialog.conflict.fail` | 表已存在时阻止导入 | Fail if table exists |
| `workspace.importDialog.conflict.replace` | 覆盖已有同名表 | Replace existing table |
| `workspace.importDialog.success` | 已导入为 DuckDB 表：{{table}} | Imported as DuckDB table: {{table}} |
| `workspace.importDialog.fail` | 导入失败：{{message}} | Import failed: {{message}} |
| `query.pivot.tooManyDistinct` | 透视值过多，仅展示 Top 20 | Too many pivot values, showing top 20 only |

> 备注：`query.execute`/`query.sqlPreview`/`query.join.*`/`query.set.*`/`query.pivot.*` 多数已存在于前序任务，如缺失再补齐即可。

---

## 附录 B · 组件结构与线框（实现参考）

### B1. 总体布局（QueryWorkspace）

```
QueryWorkbenchPage
└─ QueryWorkspace
   ├─ PanelGroup(H)
   │  ├─ Panel(L) DataSourcePanel
   │  ├─ ResizeHandle
   │  └─ Panel(R)
   │     └─ PanelGroup(V)
   │        ├─ Panel(Top) QueryTabs
   │        ├─ ResizeHandle
   │        └─ Panel(Bottom) ResultPanel
```

**线框**
```
┌───────────────┬──────────────────────────────┐
│ DataSource    │ QueryTabs (SQL/Join/Set/...) │
│ Panel         │                              │
│               ├───────────────┬──────────────┤
│               │  ResultPanel  │  (collapsed) │
└───────────────┴───────────────┴──────────────┘
```

### B2. DataSourcePanel（左侧树）
```
DataSourcePanel
├─ SearchInput
├─ TreeSection: External Connections
│  └─ DatabaseConnectionNode (ContextMenu)
│     ├─ SchemaNode (PG only)
│     │  └─ TableItem (external, disabled in multi-tabs)
│     └─ TableItem (mysql/sqlite)
├─ TreeSection: DuckDB Tables
│  └─ TableItem (duckdb)
└─ FooterActions (Refresh/Add)
```

**线框**
```
Search: [___________]

▾ 数据库连接 (3)
  ▾ MyPGConn
    ▾ public (12)
      • orders     (external)
      • users      (external)
  ▾ MyMySQLConn
      • products   (external)

▾ DuckDB 表 (5)
  • orders_duckdb
  • users_duckdb
```

### B3. SQL Tab
```
SQLQueryPanel
├─ SQLToolbar
│  ├─ SourceBadge (DuckDB / External)
│  ├─ HintText (External only)
│  └─ Actions: Preview/Execute, Import, Format, History
├─ SQLEditor
└─ SQLHistoryDrawer
```

**线框**
```
[External: MyPGConn]  正在预览外部数据...
┌──────────────────────────────────────────────┐
│  SQL 编辑器                                   │
└──────────────────────────────────────────────┘
Actions: [预览] [导入 DuckDB] [格式化] [历史]
```

### B4. ResultPanel + ImportDialog
```
ResultPanel
├─ StatsBar (rows/cols/time)
├─ ActionBar (Import to DuckDB if external)
└─ AGGridWrapper

ImportDialog (Dialog)
├─ SourceSummary
├─ AliasInput
├─ ConflictRadioGroup
└─ Actions (Cancel/Import)
```

### B5. Join Tab v2
```
JoinQueryPanelV2
├─ Toolbar (Clear/AddJoin/Execute)
├─ TableCardsRow (draggable)
└─ JoinEdgesList
   └─ JoinEdgeCard*
      ├─ LeftTableSelect
      ├─ JoinTypeSelect
      ├─ RightTableSelect
      ├─ ConditionsList
      │  └─ ConditionRow* (leftCol/op/rightCol/remove)
      └─ RemoveEdgeButton
```

**线框**
```
Tables: [A]* [B] [C]  (drag to reorder, A is base)

Edge 1:  A  [LEFT]  B
  ON: [A.id]  =  [B.id]   (+ Add condition)

Edge 2:  A  [INNER] C
  ON: [A.user_id] = [C.user_id]

[执行]
SQL Preview ▼
```

### B6. Set/Union Tab v2
```
SetOperationsPanelV2
├─ Toolbar (OperationToggle/Clear/Execute)
├─ TableCardsRow
│  ├─ PrimaryTableCard (select columns)
│  └─ SecondaryTableCard (readonly columns)
└─ CompatibilityAlert (if invalid)
```

### B7. Pivot Tab v2
```
PivotTablePanelV2
├─ Toolbar (TableSelect/Execute)
├─ Card: RowFields
├─ Card: PivotColumn
│  ├─ ColumnSelect
│  └─ PivotValuesChecklist (Top20)
├─ Card: ValueFields
│  └─ ValueFieldRow* (aggFn + col select + remove)
└─ SQLPreview
```
