# 方案：结果集下钻 + MCP write-back + 固定报表页 + schema 感知 + 图表补类型 + DuckDB 扩展

> 状态（2026-07-09 更新）：**部分已落地**——一·结果集下钻（`40d1dcf`）、二·MCP write-back（transform 工具 `4f83a32`）、六·DuckDB 扩展管理（`c1553b6`）、七·上传入口重构（回归测试引用本节）已实现；其余各节以代码为准。原提案 2026-07-02 与产品负责人逐条对齐。

---

## 一、结果集下钻（Drill-down）

### 目标

图表上点击一个图形元素（柱 / 折线点 / 饼块），自动生成带 WHERE 过滤的明细 SQL，填入编辑器（不自动执行，与问数同一原则）。

### 用户故事

- 柱状图按 `region` 汇总销售额 → 点击"华东"这根柱子 → 编辑器出现
  `SELECT * FROM demo_sales WHERE region = '华东' LIMIT 500` → 用户回车执行看明细。
- 折线图按月汇总 → 点击 3 月的点 → 生成 `WHERE order_date >= '2026-03-01' AND order_date < '2026-04-01'`。

### 技术方案

现状盘点（已确认）：

- 图表用 recharts 3.x（`frontend/src/Query/Charts/ChartCanvas.tsx`），类型 `bar|line|area|pie|donut|kpi`（`chartSpec.ts`）。
- ChartSpec 已经持有 `x` / `y` / `agg` / 时间 bin 信息 —— **下钻所需的元数据已经齐了**，只缺"点击 → SQL"的映射。
- `ChartView` 的 props 里已有 `source: ChartSource { sql, attachDatabases, requiresFederated }`
  （由 `ResultPanel.tsx:175` 构造，`requiresFederated = source?.type === 'federated'`）。
  注意图表有**两条聚合路径**：默认客户端聚合（`aggregateRows`）；仅 `truncated && source.sql`
  时才服务端重跑（`buildChartSql` → `executeDuckDBSQL / executeFederatedQuery`）。
  下钻**始终**需要发 SQL（明细不在前端），按 `source.requiresFederated` 选执行 API，
  无需新判定逻辑；`source.sql === null` 时隐藏下钻入口。

改动点（全部前端，后端零改动）：

1. **`chartSpec.ts` 新增纯函数** `buildDrilldownSql(spec, clickedDim, sourceSql): string | null`
   - 包裹方式照抄 `buildChartSql` 的既有模式（子查询，非 CTE）：
     `SELECT * FROM (${stripTrailingLimit(sourceSql)}) AS _src WHERE ... LIMIT 500`，
     复用现成的 `stripTrailingLimit` 和标识符转义 `q()`。
   - 分类维度：`q(x) = '<值>'`（字符串单引号翻倍转义）。
   - 时间 bin：**只有 `day | month` 两档**（`ChartSpec.xBin`，无周）。还原为半开区间：
     `q(x) >= DATE 'bin起点' AND q(x) < DATE 'bin终点'`。注意 dim 值有两种形态——
     服务端聚合路径是 `date_trunc` 结果（`2026-03-01 00:00:00`），客户端路径是字符串截断
     （`binDim`：day 取前 10 位、month 取前 7 位）——统一先归一化再拼区间。
   - **特殊桶处理**（客户端聚合的产物，必须处理否则出错误 SQL）：
     `'∅'`（null 的展示值，`binDim`）→ 生成 `q(x) IS NULL`；
     `'其它'`（`capCategories` 合并桶）和 `'全部'`（无维度常量桶）→ **返回 null，不可下钻**。
   - KPI 类型不支持下钻（无维度）。
2. **recharts 接线**（recharts 3.8.1）：`ChartCanvas.tsx` 给 `<Bar>` / `<Pie>` 加 `onClick`，
   折线/面积图用图表级 onClick 取 `activeLabel`。
3. **交互**：点击后弹一个小 popover（`@/components/ui/popover` + `Button`，图标用
   lucide `Rows3`/`Table2`）：「查看 "华东" 的明细」→ 点击把 SQL 送进编辑器并聚焦。
   通道已定位：编辑器回填的 setter 是 `QueryTabs/index.tsx:265` 的 `handleLoadSQL(sql, type)`
   （SavedQueriesPanel / GlobalHistoryPanel 都走它）。需要把回调沿
   `QueryTabs → SQLQuery → ResultPanel → ChartView` 穿一个 `onDrilldown?: (sql) => void` prop
   （或提到共享 store，但穿 prop 改动最小）。悬停时鼠标变 pointer 提示可点。
4. 可选 P2：popover 里第二个动作「按此值过滤当前图表」（改聚合 SQL 而非出明细）。

### 验证标准

- 单测：`buildDrilldownSql` 覆盖 分类值 / 含引号的值 / 月 bin / 日 bin（两种 dim 形态各一）/
  `'∅'`→IS NULL / `'其它'`与`'全部'`→null / KPI→null / 尾部带 LIMIT 的原 SQL。
- 手测：demo_sales 上 柱/饼/折线 各点一次（截断与未截断两种状态），出的 SQL 可直接执行且行数正确。

### 工作量估计

前端 1~2 天（含测试）。风险低 —— 纯增量，不碰现有渲染路径。

---

## 二、MCP 双向工作流（write-back）

### 目标

让 Claude（经 MCP）产出的分析结果**落成 DuckDB 表并在 App 里立刻可见、可继续下钻**，形成
「App 里选数据 → Claude 分析 → 结果回到 App」 的闭环。这是纯查询型 SQL 工具没有的卖点。

### 现状盘点

- MCP 已有写路径：`save_as_table`（SQL 物化成表）、`paste_data`（Claude 生成的行直接建表）——
  **写能力本身已存在**，缺的是"App 侧感知"和"来源标识"。
- 痛点：MCP 建了表，App 的表列表不会自动刷新；用户不知道哪些表是 AI 产出的。

### 技术方案

1. **表来源标记（后端，小改，已定位到具体端点与写入点）**
   - MCP 的建表实际打的是 `POST /api/save_query_to_duckdb`（`join_query.py:1025`，内部已调
     `file_datasource_manager.save_file_datasource` 注册数据源记录）和 `POST /api/paste-data`
     （`paste_data.py:138`，同样已持久化 metadata 快照）——给这两个端点加可选 `origin` / `note` 字段。
   - 存储零 DDL 变更：`system_file_datasources` 表已有 `metadata JSON` 列，origin/note 写进去即可。
   - MCP 侧改动极小：`transform.py` 的 `save_as_table` 现在 body 是 `{sql, table_alias}`，
     加 `origin: "mcp"` 和可选 `note` 两个键即可，发版 0.1.3。
2. **App 侧感知（前端，已对齐 react-query 现状）**
   - 现状：表列表走 `useDuckDBTables` → `GET /api/duckdb/tables`
     （`duckdb_query.py:157`，**已经**逐表 join `get_file_datasource` 并返回 `created_at`——
     响应里把 `metadata.origin/note` 一并带出即可，前端 `Table` 接口本来就有 `source_type` 先例）。
   - react-query 的 `refetchOnWindowFocus` 被**刻意关闭**以避免重复请求——不要推翻这个决定。
   - 方案：新增超轻量端点 `GET /api/duckdb/tables/version`（`duckdb_tables()` 的 count +
     `system_file_datasources` 的 max(updated_at)），前端 30s 轮询它，值变了才调既有的
     `invalidateDuckDBTables(queryClient)` 触发真正刷新。轮询成本≈一次 COUNT，不破坏现有缓存策略。
   - MCP 产出的表在侧栏带角标（lucide `Sparkles` + `@/components/ui/tooltip` 显示 `note`），
     新表出现时用 sonner toast（`showSuccessToast`）：「Claude 创建了表 xxx，点击查看」。
3. **反向入口（前端）**
   - 结果表格工具栏加「用 Claude 分析」按钮：把当前 SQL + 表名复制成一段提示词
     （`请用 duckquery MCP 分析表 xxx：...`）到剪贴板。P1 只做复制提示词，不做进程级联动，成本极低。
4. **文档/演示**：README 加一节"和 Claude 协作"，录一个 gif：App 里传 CSV → Claude 清洗建表 → App 里出现 ✨ 新表 → 下钻。

### 验证标准

- MCP 调 `save_as_table` 后 30s 内（或切回窗口时）App 侧栏出现带 ✨ 的新表。
- 元数据在重启后保留（system.db）。

### 工作量估计

后端 0.5 天（origin/note 字段 + 列表端点），前端 1 天（轮询 + 角标 + toast + 分析按钮），MCP 0.5 天（传 origin/note，发版 0.1.3）。

---

## 三、固定报表页（Pinned Dashboard）

> 交互 mockup 见同目录 `pinned-dashboard-demo.html`。

### 交互设计（已确认）

> UI 规范：图标一律 lucide-react，组件一律 `@/components/ui`（shadcn），toast 用 sonner
> （`showSuccessToast/showErrorToast`）。mockup 里的 emoji 仅为示意。

- **新增顶层 tab「报表」**（图标 lucide `LayoutDashboard`），与 datasource / queryworkbench /
  ai / settings 平级（`App.tsx:55` 的 `type TabId` 加 `"reports"`，`App.tsx:207` 的 `allowedTabs` 同步）。
- 钉住入口：查询工作台结果图表工具栏加钉住按钮（lucide `Pin`）→ 小对话框
  （`@/components/ui/dialog` + `input`）改标题 →
  存 `{标题, source(ChartSource 原样序列化), chart_spec}` 进 system.db。
  存储机制对齐：`MetadataManager._init_metadata_tables` 是**固定 DDL 清单**（非动态建表），
  需在其中加一张 `system_pinned_cards` 表 + 对应 accessor
  （照抄 `system_sql_favorites` 的模式，DDL 在 `metadata_manager.py:99`）。
- 卡片刷新/渲染完全复用图表的**服务端聚合路径**：`buildChartSql(source.sql, spec)`
  （自带 LIMIT 200，天然轻量）→ 按 `source.requiresFederated` 选执行 API →
  `ChartCanvas({spec, data, metricKeys, kpi})`（props 独立，可脱离 ChartView 单用）。
  不写第二套聚合或渲染。
- 注意 `GET /api/duckdb/tables` 会跳过 `system_` 前缀的表——`system_pinned_cards`
  放 system.db（走 MetadataManager），本来就不会漏进业务表列表。
- 卡片：固定两列、上限 8 张、无拖拽。容器用 `@/components/ui/card`；
  每卡右上角菜单用 `dropdown-menu`：单独刷新（`RefreshCw`）/ 在工作台打开该 SQL（`SquarePen`）/
  取消钉住（`PinOff`）；页面顶部「全部刷新」按钮同用 `RefreshCw`。
  「在工作台打开」跳回 queryworkbench 并填入 SQL，与下钻特性形成闭环。

### 刷新模型（源码对齐：并发能力已存在，无需新基建）

后端已有 `DuckDBConnectionPool`（`duckdb_pool.py`，2~10 连接；`duckdb==1.5.3`，
同进程同路径经实例缓存共享同一数据库实例，等价 cursor 并发读）——
本地表查询天然可并发，**不需要**再造 cursor 池。

1. 每次刷新成功把**结果集（聚合后仅几十行）+ 时间戳**缓存进 system.db（走 MetadataManager）；
   打开页面先渲染缓存（秒开，标注"数据截至 HH:MM"）。
2. **本地表卡片**：直接并发发请求，走现有池，前端 `Promise.all` 即可。
   **联邦卡片**：串行逐张刷（ATTACH 状态 per-connection，依赖现有 `_is_federated_connection_lost` 重连兜底）。
   判定方式：**不需要正则**——钉住时原样保存的 `ChartSource.requiresFederated` 字段就是答案。
3. 单卡 30s 超时，失败标红不阻塞其他卡。
4. 刷新时机：切入该 tab 时自动全刷一次 + 手动「全部刷新」按钮；不做定时任务。

工作量：后端（pinned_cards 表 + 结果缓存）1 天，前端 2 天。

---

## 四、Schema 变化感知（混合策略，已确认）

不做后台自动轮询远程库（information_schema 查询不便宜，对生产库不礼貌）。

源码对齐：后端**没有** schema 长缓存——`ai.py` 每次请求用前端传来的
`payload.tables / attach_databases` 现拼 `schema_text`。过期问题出在**前端缓存的外部连接列信息**
（react-query，queryKey `['schemas', connectionId]` / `['schema-tables', connectionId]`）。

进一步核验后再缩水：**手动刷新已经存在**——`DatabaseConnectionNode.tsx` 的
`handleRefreshConnection`（invalidate 上述两个 queryKey + 成功 toast）。所以只剩一件事：

1. **出错自愈（前端）**：查询或 AI SQL 报「列不存在 / 表不存在」→ 调用与
   `handleRefreshConnection` 相同的 invalidate，更新缓存后重试问数一次（仅一次，防循环）。

工作量：前端 0.5 天，后端无改动。

---

## 五、图表补类型（已确认方向）

现状：recharts，仅 `bar | line | area | pie | donut | kpi`（`chartSpec.ts:3`）。

- **P1（recharts 内补齐，覆盖 80% 场景）**：横向条形图（分类名长必备）、堆叠柱、散点图、双轴组合图（柱+线）。
  需同步修改的位置（已确认）：`chartSpec.ts` 的 `ChartType` 联合类型 + `CHART_TYPES` + `validateSpec`、
  `ChartView.tsx` 的 `TYPES` 选择器数组、`ChartCanvas.tsx` 渲染分支、
  后端 `ai_suggest_chart` 模块的 prompt 与类型白名单（`/api/ai/suggest-chart`）。
- **P2（按需）**：热力图/漏斗/地图等 → 引入 ECharts 作第二渲染器（桌面版不在乎 ~1MB），
  AI 推荐升级为输出 ECharts option。P2 暂不排期。

工作量（P1）：前端 2~3 天（含 AI 推荐联动与校验）。

---

## 六、DuckDB 扩展支持（httpfs / spatial / iceberg，已对齐约束）

事实：扩展不打进安装包，运行时 `INSTALL` 时从官方源 `extensions.duckdb.org`（Cloudflare CDN）
按需下载，每个几 MB，缓存在 `extension_directory`，**下载一次永久复用**。

源码对齐：安装/加载机制**已存在**——`duckdb_engine.py` 的 `_install_duckdb_extensions`
（先 LOAD、失败则 INSTALL+LOAD），扩展列表来自 `config/app-config.json` 的
`duckdb_extensions`（默认值**已含** excel/json/parquet/httpfs/mysql/postgres——
即联邦查询和 httpfs 所需扩展开箱就装，"支持扩展"对多数用户已成立）。
`extension_directory` 也已统一设置；`settings.py` 目前**没有**暴露扩展配置（UI 上不可改）。
缺的只有四件事：

1. **失败可见**：现在安装失败只 `logger.warning` 静默吞掉——改为把失败信息带到 API/前端，
   给中文提示（"下载扩展超时，请配置镜像或从文件安装"）。
2. **用户自配镜像**：设置页「扩展下载源」→ 在 `_apply_duckdb_configuration`（连接初始化阶段，
   INSTALL 之前）执行 `SET custom_extension_repository`（目前代码没有这项，需新增配置项 +
   `settings.py` 暴露）。项目方不自建镜像、零维护。
3. **从文件安装（最终兜底）**：UI 文件选择框 → `INSTALL '<本地路径>'`。
   文件由用户自行获取（官网/内网/拷贝），**不进 release**。
4. **扩展开关 UI（顺手）**：`duckdb_extensions` 列表在 settings 页可增删（spatial/iceberg
   这类非默认扩展目前只能改 `config/app-config.json` 文件）。

Docker 镜像构建时预装 httpfs（命中缓存零下载）；桌面版不预装，靠 1~3 兜底。

工作量：后端 0.5 天，前端（设置页开关 + 文件安装）1 天。

---

## 七、桌面端上传入口重构（修设计错位）

### 问题（源码已核实）

桌面端把 Web 的三分段「本地 / URL / 服务器」原样保留，造成三个问题：

1. **路径错位**：「本地」= HTTP multipart 上传文件内容到 localhost（受 `maxFileSize` 限制、
   大文件分块、后端再复制一份落盘）；而零拷贝路径导入（原生选择器 →
   `POST /api/server-files/import`，`server_files.py:256` 就地读取、无大小限制）却藏在
   「服务器」分段里——桌面端没有"服务器"概念，标签语义是反的。
2. **拖拽死区**：`tauri.conf.json` 未设 `dragDropEnabled`（Tauri v2 默认 true），
   OS 文件拖放被 Tauri 拦截，HTML5 `onDrop` 拿不到 `dataTransfer.files`；
   前端也没有任何 `onDragDropEvent` 监听——`LocalUploadCard` 的拖拽区在桌面端不工作。
3. **Excel 多 sheet 丢失**：Web 服务器浏览路径有 sheet 选择（`UploadPanel.tsx:384` →
   `ExcelSheetSelector` → `/api/server-files/excel/inspect|import`），但桌面端
   `handlePickFiles`（`UploadPanel.tsx:501`）不分类型直接 `importServerFile`，
   xlsx/xls 跳过了 sheet 选择。
4. **上传 vs 路径导入的成本澄清**：两条路径最终**解析层相同**——都走 DuckDB 原生
   reader（`read_csv_auto / read_json_auto / read_parquet / read_xlsx`，
   `file_utils.py:422`、`file_datasource_manager.py:460`）。差别在解析之前：
   HTTP 上传多了「浏览器读文件 → multipart/分块传输 → 后端落临时盘」一跳；
   Docker 挂载目录 / 桌面路径导入则让 DuckDB 直接读原文件。桌面端应一律走路径导入。

### 附带发现：Excel 表名唯一性缺陷（与入口无关，Web 也存在）

- `derive_default_table_name`（`excel_import_manager.py:125`）对 sheet 名做
  `sanitize_identifier`，不同 sheet 可产生**相同默认表名**（`Sheet 1`/`Sheet-1`/`Sheet_1`
  都归一成 `prefix__Sheet_1`），且 inspect 阶段没有跨 sheet 去重。
- 前端 `ExcelSheetSelector.tsx:241` 写死 `mode: "replace"`——同批两个 sheet 目标名撞车时，
  后导的**静默覆盖**先导的（表现为"只导进来一个 sheet"）；重复导同一工作簿也会无提示覆盖旧表。
- `resolve_unique_table_name`（`file_ingestion_service.py:77`）的去重有 bug：冲突时拼
  `_%Y%m%d%H%M`（分钟精度）后**直接 break，不再复查**——同一分钟内第二次同名导入依然撞名。
  （该函数只被普通上传使用；Excel sheet 导入压根没调它。）

修法（已拍板，2026-07-02）：
- **命名规则**：默认表名 = `前缀__sheet原名`（现状保留）；批内/库内撞名时追加递增后缀
  `_1 / _2 / _3`（不用分钟时间戳）。sheet 原名归一化后为空或不可用时同样退到数字后缀。
- inspect 返回默认名前先做批内去重；`import_pending_excel_sheets` 对每个 target 过一遍
  修好的 `resolve_unique_table_name`（改为 while 循环复查 + `_1/_2/_3` 递增后缀）。
- 前端 mode 默认改 `fail` 并在 UI 上标红提示重名，`replace` 让用户显式选择。

### 方案

桌面端（isTauri）收敛为两分段「本地文件 / URL」，隐藏「服务器」（已拍板，2026-07-02）：

1. **「本地文件」= 路径导入，HTTP 上传在桌面端整体移除**：原生选择器（现 `handlePickFiles`）
   + 新增 Tauri `onDragDropEvent` 监听（拿真实路径），统一走 `/api/server-files/import`
   （DuckDB 原生 reader 直读原文件，零传输零拷贝）。
   HTTP 内容上传（`LocalUploadCard` 的 multipart/分块逻辑）仅保留给 Web/Docker 构建。
2. **Excel 分类队列**：选中/拖入的路径按扩展名分组——非 Excel 直接循环导入；
   Excel 进队列逐个弹 `ExcelSheetSelector`（复用现成的 `serverExcelPending` serverPath 模式，
   `UploadPanel.tsx:668`），选完 sheet 导入后自动弹下一个。
3. **顺手清理**：`ServerBrowseCard.tsx:109` 的 `isTauri` 死分支（位于外层 `!isTauri` 内，
   永不可达）；`handlePickFiles` 多选文件共用 `serverAlias` 的隐患（改为始终按文件名取 stem）。

### 验证标准

- 桌面端拖一个 30MB parquet 进窗口 → 秒级出表，无"上传中 %"。
- 桌面端选一个 3-sheet xlsx → 弹 sheet 选择器，勾 2 个 → 出 2 张表。
- 含 `Sheet 1` 和 `Sheet_1` 两个 sheet 的工作簿 → 默认名不撞车，两张表都在。
- 同一分钟内连传两个同名 CSV → 第二张表自动加后缀，不报错不覆盖。
- Web/Docker 构建行为不变（三分段照旧）。

工作量：前端 1~1.5 天（含 Tauri 事件接线），后端 0.5 天（Excel/上传命名唯一性修复）。

---

## 建议排期

1. **下钻**（纯前端、独立、对所有用户可见）。
2. **图表补类型 P1**（与下钻同属图表区，联调顺手）。
3. **固定报表页**（依赖已有保存查询 + ChartSpec）。
4. **Schema 感知**（仅前端出错自愈，0.5 天，独立）。
5. **MCP write-back**（跨端，但每块都小）。
6. **DuckDB 扩展**（独立，随时可插队）。
7. **桌面端上传重构**（独立、纯前端；因为是修现存缺陷而非新特性，也可以提到最前面先做）。

下钻 + write-back 叠加后构成 README 新故事线：「Claude 建的表，在 App 里点一下就能下钻」。
