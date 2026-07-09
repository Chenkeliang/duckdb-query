# 全栈第一性原理审查报告（第二轮·串行独立复核版）

- **日期**: 2026-07-08
- **分支 / commit**: `feat_chart_drilldown` @ `dd7b98e`
- **范围**: 后端 (`api/`)、前端 (`frontend/src/`)、MCP 服务 (`mcp/duckquery_mcp/`)
- **方法**: 与第一版不同——本轮按用户明确要求**串行执行、不派生子 agent**，由我本人直接读源码逐条核验，
  不复用第一版 6-agent 输出的结论本身（只把它当"待验证的假设列表"）。核验方式：对第一版全部 24 条
  发现重新定位到当前 HEAD 的真实代码行，确认是否仍然成立、是否已被本会话另外两个提交
  （`27c362b` 转义修复、`dd7b98e` 一致性收尾）影响；随后换一个新的审查维度——不是"这段代码有没有
  bug"，而是"这个设计本身对不对、能不能长期承受扩展"——找第一版完全没有覆盖的**过度实现 / 不可扩展 /
  错误设计**类问题；最后对本轮新发现逐条做对抗性反驳（能不能被推翻、有没有被我自己的假设误导），
  过程记录见下文"对抗性核验记录"一节。
- **结论**：第一版 10 条 HIGH + 5 条 MEDIUM/LOW 全部独立重新确认，其中 1 条（#1 密码加密）核实后发现
  比原描述更严重。新增 7 条设计类发现（不可扩展 / 过度实现 / 错误设计），其中 1 条（NEW-B）在核验
  过程中被我自己的检查从"可能有真实密码泄露"修正为"机制真实存在但当前实例为空"——过程见对抗性核验
  记录第 3 条，保留是为了如实展示核验怎么收窄了结论，而不是隐藏这次修正。

---

## 摘要表

### 第一版发现（本轮独立复核结果）

| # | 级别 | 子系统 | 标题 | 本轮复核 |
|---|------|--------|------|----------|
| 1 | HIGH | 后端·安全 | 数据库连接密码用硬编码 XOR key 加密存储 | ✅ 确认，且实际情况比原描述更严重（见下）|
| 2 | HIGH | 后端·安全 | JOIN 查询构造器里列名未转义，可注入 SQL | ✅ 确认，未受本会话另两个提交影响 |
| 3 | HIGH | MCP | `run_sql`/`federated_query` 默认模式下可执行任意 DDL/DML | ✅ 确认，逐行追踪到 `tools/__init__.py` 注册闭包 |
| 4 | HIGH | MCP | `add_local_file_source` 绕过桌面文件对话框 | ✅ 确认，`_resolve_path` 注释本身即是证据 |
| 5 | HIGH | MCP | `read-only` 白名单可被 `EXPLAIN ANALYZE` 绕过 | ✅ 确认，正则逐字核对 |
| 6 | HIGH | 后端·数据完整性 | `load_file_to_duckdb` 重新导入失败可能永久丢表 | ✅ 确认，未受 `27c362b` 影响（该提交未碰这个文件）|
| 7 | HIGH | 后端·数据完整性 | JOIN 里 Excel 摄取失败静默销毁已持久化源表 | ✅ 确认，未受 `27c362b` 影响 |
| 8 | HIGH | 后端·并发 | 异步任务取消/落盘竞态产生孤儿表 | ✅ 确认，`complete_task` 拒绝时无补偿清理 |
| 9 | HIGH | 后端·并发 | DuckDB 连接池懒加载单例无锁 | ✅ 确认；同仓库 `crypto_utils.py` 里有对照的正确写法（见 #1）|
| 10 | HIGH | 前端·状态 | 多 Tab 结果页共用全局 request-id | ✅ 确认，逐行追踪到具体的提前 return |
| 12 | MEDIUM | 后端·并发 | `DatabaseManager.connections`/`.engines` 无锁 | ✅ 确认，全类无 `_lock` |
| 14 | MEDIUM | 后端·安全 | "直连参数"模式绕过凭据库 | ✅ 确认，且 query 本身也是调用方可控（比原描述更宽）|
| 15 | MEDIUM | 后端·并发 | `fail_task` 缺终态保护 | ✅ 确认，`WHERE` 子句里连 status 谓词都没有 |
| 16 | MEDIUM | 后端·并发 | 同类错误在不同 router 映射到不同状态码 | ✅ 确认，`analyze_error_type` 全仓库只有 1 处调用 |
| 18 | MEDIUM | 前端·安全 | 图表下钻 SQL 转义只处理单引号 | ✅ 确认，且是重复实现的 2 份之一（见 NEW-E 类比）|
| 19 | MEDIUM | MCP | ATTACH 失败信息可能带回明文密码 | ⚠️ 代码支持这个结论，未用真实故障连接复现，维持原报告的"可能"措辞 |
| 11,13,17,20-24 | — | — | 本轮未重新核验 | 保留第一版结论，未独立复查 |

### 本轮新增发现（不可扩展 / 过度实现 / 错误设计）

| # | 级别 | 子系统 | 标题 |
|---|------|--------|------|
| NEW-META | HIGH | 全栈 | 同一个横切关注点被独立重新实现 N 次，每次核实到的重复都有真实后果，不是理论风险 |
| NEW-A | HIGH | 后端·架构 | `join_query.py` 把 HTTP 路由和 550 行纯查询编译逻辑混在一起，与同仓库另外两个兄弟功能的既有约定不一致 |
| NEW-B | HIGH | 后端·架构+安全 | `/api/query` 执行端点里有一套独立于本会话已修复路径之外、更陈旧也更糟的三模式数据源解析逻辑 |
| NEW-C | MEDIUM | 前端·架构 | `JoinQueryPanel.tsx` 2197 行的上帝组件，同仓库已有更小规模问题的修复先例 |
| NEW-D | MEDIUM | 前端·架构 | 请求时效性判断被独立发明了 2 次，2 次都错 |
| NEW-E | MEDIUM | 前端·类型 | `AttachDatabase` 接口被独立声明 4 次，其中 1 份已经在字段必填性上实质性漂移 |
| NEW-F | — (对照组) | MCP | 专门检查是否有同类问题，结论是没有——原因写在下面，用于校准整份报告不是无差别扣分 |

---

## 一、本轮独立复核：HIGH 级别发现

以下 10 条与第一版编号一致；"实际情况"只写本轮新增或修正的信息，未重复贴第一版已经写清楚的内容
（完整背景仍以第一版描述为准，此处补充精度和现状）。

### #1 数据库连接密码加密——核实后发现比原描述更严重

原报告说 `PasswordEncryptor` "只在 database_manager.py 里被当作冗余校验调用"——**这个具体表述是错的**，
本轮用 `grep` 精确统计了 `password_encryptor.is_encrypted`/`decrypt_password` 的真实调用点，实际分布在
**6 个文件**（`async_tasks.py`、`duckdb_query.py`、`database_tables.py` 6 处、`database_manager.py` 4
处、`federated_attach.py`）。修正后的完整图景：

全仓库存在 **4 套独立的加密实现**，服务同一个概念（落盘前保护一个 secret）：

| 实现 | 机制 | 密钥来源 | 是否真的被写入路径使用 | 保护对象 |
|---|---|---|---|---|
| A. `utils/encryption_utils.py` | 逐字节 XOR | 环境变量 `DUCKQUERY_ENCRYPTION_KEY`，硬编码兜底 `"duckquery_default_key_2024"`，**全仓库任何地方都没设置过这个环境变量** | ✅ 是——`metadata_manager.py:227` 的 `encrypt_json` 就是它，这是数据库连接密码的真实落盘路径 | DB 连接密码 |
| B. `core/security/encryption.py`（`PasswordEncryptor`） | Fernet | 随机生成的 32 字节 key，持久化到 `secret.key` 文件 | 写路径 `encrypt_config_passwords` **零调用**（死代码）；读路径 `is_encrypted`/`decrypt_password` 在 6 个文件里被当"万一是 Fernet 加密的就解一下"防御性调用，但因为从来没人写入过，这个分支在真实数据上永远走不到 | 本该是同一个对象，实际上从未生效 |
| C. `core/foundation/crypto_utils.py`（`CryptoManager`） | Fernet，与 B **共用同一个** `secret.key` 文件 | 同上 | 全仓库唯一引用点是 `config_manager.py:30` 的 `import`，**从未被调用**（连 import 都是死的）| 无——纯死代码，约 140 行 |
| D. `core/common/crypto.py` | Fernet | 环境变量 `LLM_KEY_SECRET`，硬编码兜底，但**未设置时会在运行时打一条 warning 日志** | ✅ 是——`ai_config.py`/`llm_service.py` 用它保护 AI 供应商 `api_key` | AI 供应商 API key |

**这不是"重复代码"这么简单的问题，是风险分配反了**：最敏感的资产（外部数据库密码，拿到手就能读写
整个 MySQL/PostgreSQL 实例）用的是最弱、连"未设置警告"都没有的方案 A；相对没那么敏感的资产（AI
API key）反而用了方案 D——Fernet + 显式警告。B、C 两套本该更安全的基础设施完整存在（B 甚至有正确
生成、正确持久化的随机密钥），却因为写入路径从未接上而形同虚设。下一个要加密第五类 secret 的人，
面对 4 个候选实现、其中调用点最多的（B，6 处）恰好是唯一"写了也没用"的那个，选错的概率不低。

**结论**：不只是"用弱加密"，而是"团队已经三次尝试解决这个问题却互相没接上"——这是本轮从第一性原理
重新审视后，比原报告更准确的刻画。

### #2-#10

逐条核验过程见本会话内部记录，结论：**全部 9 条原样成立**，具体验证方式包括直接读取
`join_query.py:198/210`（#2 列名未转义）、`mcp/duckquery_mcp/safety.py`+`tools/__init__.py`+
`tools/query.py`（#3/#5 的完整调用链，包括确认 `passthrough.py` 已经有正确的 `confirm=True` 模式，
只是没被用在真正危险的两个工具上）、`api/run.py:57`+`server_files.py:115-128`（#4，注释原文就是"假设
走过原生对话框"）、`file_utils.py:482-523`（#6）、`join_query.py:694-733`（#7）、
`duckdb_pool.py:403-418`（#9，对照 `crypto_utils.py` 的正确加锁写法）、
`useQueryWorkspace.ts:342-437`（#10，逐行确认 `currentRequestIdRef` 覆盖时机）、
`task_manager.py:521-643`（#8/#15，含一个额外发现：`fail_task` 的日志说"状态不允许标记失败"，但实际
SQL 里根本没有 status 谓词，日志在撒谎，这个 WHERE 子句只会因为 task_id 不存在才失败）。

---

## 二、本轮新增：不可扩展 / 过度实现 / 错误设计

这是本轮真正的新工作——原报告几乎全部是"这段代码有 bug"，完全没有回答用户这次明确问的"设计对不对、
能不能撑住扩展"。以下每条都是本轮独立发现，附带对抗性核验后的定论。

### NEW-META. 同一个横切关注点被独立重新实现 N 次

这是贯穿全栈的一个模式，本轮在核验具体 bug 的过程中意外反复撞见，值得单独列出来，因为它比任何单个
实例都更能说明"为什么这类 bug 会一直出现"：

| 关注点 | 独立实现数 | 已证实的后果 |
|---|---|---|
| SQL 标识符转义（`_quote_identifier`） | **8 处**（7 处字节级相同的私有函数分散在 7 个文件；1 处 `database_tables.py` 的 `_quote_mysql_identifier` 是合理的方言差异，命名也做了区分，不算重复）| `#2` 的注入漏洞本质就是"转义逻辑存在但没被同文件里的另一处复用"——同一种病灶的最严重表现 |
| 密码/secret 加密 | 4 套（见 #1）| 最敏感数据用了最弱方案 |
| "哪些类型支持外部 ATTACH" 类型清单 | 3 处独立硬编码 | 2 处一致（4 类型），1 处（`join_query.py:771`）少了 `duckdb`，且是本轮才发现的 NEW-B 的入口条件 |
| 错误码分类（`analyze_error_type`） | 全仓库仅 1 处调用（`join_query.py`） | 另外 2 个结构相同的兄弟 router（`set_operations.py`/`pivot_query.py`）遇到同一种错误会返回不同的 HTTP 状态码 |
| 前端请求时效性判断 | 2 处独立 ref | 2 处**都**有确认的"过期响应覆盖新响应"bug（#10、NEW-D）|
| `AttachDatabase` 接口 | 4 处独立声明 | 1 处已经在字段必填性上漂移（NEW-E）|
| 前端 SQL 字符串转义（`escapeSqlString`） | 2 处独立实现 | 2 处都只转义单引号、都没处理反斜杠（#18）|

**为什么这是一条独立的、比每个子项都更高优先级的发现**：这 7 个子项覆盖了后端 3 个、前端 3 个、
横跨两端 1 个，且检查到的每一处重复都能举出具体后果，不是"重复代码不美观"这种美学判断——本轮核验时
特意验证过 MCP 的 `client.py` 里也有一处表面相似的重复（`runtime_file()` 路径拼接逻辑镜像了
`api/core/common/paths.py`），但那处**排除在外**，因为它的 docstring 明确写了"Mirror
api/core/common/paths..."，且 `mcp/` 是独立可安装的 pip 包、无法直接 import `api/` 的代码，重复是
跨包边界的合理代价，作者也确实意识到了并写了注释。这个对照组证明这份清单不是见到重复就无差别打勾，
而是每条都验证过"这个重复有没有被承认、有没有已经造成偏差"。

**建议**：不是逐个修复 7 个子项，而是承认这是一类问题——建一个 `core/common/` 下的共享 SQL 原语模块
（标识符转义、字符串转义）、一个统一的 secret 加密入口（挑 D 的模式：Fernet + 环境变量 + 未设置警告，
淘汰 A/B/C）、一个共享的类型清单常量、一个可复用的 `useLatestRequest` 前端 hook。每一类只需要建一次，
之后新功能天然继承正确行为，而不是每次都要重新做对。

### NEW-A. `join_query.py` 把 HTTP 路由和查询编译逻辑混在一起，与同仓库既有约定不一致

`routers/join_query.py`（1198 行）里，`safe_alias`、`load_federated_table_columns`、
`build_multi_table_join_query`、`_assert_safe_predicate`、`_source_pushdown_where`、
`_source_ids_match`、`_federated_subquery_select_list`、`_source_table_sql`、`_join_column_ref`、
`build_join_chain` 这 10 个函数横跨 78-628 行（约 550 行），**没有一处依赖 FastAPI**（不引用
`Request`/`Body`/`HTTPException`/依赖注入），是纯粹的、可独立单测的 SQL 编译逻辑，而这个文件真正的
HTTP 端点只有 2 个（`perform_query`、`save_query_to_duckdb`）。

这不是主观的"文件太长"判断——本轮直接对比了同一个仓库里另外两个结构完全类似的兄弟功能：
- `routers/pivot_query.py` 只有 237 行，真正的查询生成逻辑在 `core/services/pivot_query_generator.py`
  （507 行）+ `pivot_query_sql_common.py`，以 import 方式引入，router 文件里只留了 3 个和 HTTP 请求
  形状相关的小胶水函数。
- `routers/set_operations.py` 同样把生成逻辑委托给 `core/services/set_operation_generator.py`。

三个"结构化请求 → 编译 SQL"的兄弟功能里，2 个都做了 router/service 分离，只有 JOIN（也是三者中最
复杂、历史最久的一个）没有。`_join_column_ref`（正确转义）和被 `#2` 指出未转义的那处内联代码相距
约 280 行，都在同一个 1198 行的文件里——文件体量本身很可能是这处漏洞没被发现"同文件里已经有正确写法"
的一个促成因素（这是合理推测，不是已证实的因果关系，本轮没有也无法确认原作者当时的真实思路）。

**建议**：把 78-628 行整体搬到 `core/services/join_query_compiler.py`，与 pivot/set-operations 的既有
模式对齐，router 文件只保留 2 个端点函数和请求形状相关的小胶水代码。低风险——目标模式已经在同仓库
被验证过两次。

### NEW-B. `/api/query` 执行端点里还有一套本会话未触及、比已修复路径更陈旧的三模式数据源解析逻辑

这是本轮最重要的新发现：**我在本会话早些时候统一过 `save_query_to_duckdb` 的三分支持久化逻辑（这是
被批准执行的技术方案的 Part 1），但 `join_query.py` 里另一个端点 `perform_query`（`/api/query`，
即真正执行 JOIN 的那个端点，不是保存结果的那个）有一套结构几乎相同、但从未被本会话触及、问题更严重
的独立三模式逻辑**——说明我自己那次"统一"工作的范围小于问题实际覆盖的范围。

位置：`join_query.py:771-905`，`elif source.type in ["mysql", "postgresql", "sqlite"]:`（注意这个
类型清单本身缺了 `duckdb`，与 `async_tasks.py`/`connection_alias.py` 里一致的 4 类型清单不同——这是
NEW-META 表格里"类型清单"那一行的具体实例）。

- **模式 1**（`connection_id`，776-804 行）：不使用当前 JOIN 请求真正需要的查询，而是执行这个连接
  自己存储的 `query` 参数，兜底默认值是硬编码字面量 `"SELECT * FROM dy_order LIMIT 1000"`——`dy_order`
  明显是某个具体演示/客户数据集里的表名，被当作生产代码里的静默兜底值提交进了仓库。落盘方式是
  `create_varchar_table_from_dataframe`——正是本会话专门为消除的 pandas 双重序列化问题，在这个兄弟
  端点里原样健在。
- **模式 2**（`datasource_name`，"安全模式"，806-858 行）：读取 `config/mysql-configs.json`——**一套
  完全独立于 `db_manager`/`metadata_manager.py` 的第三套连接存储机制**，本轮核实过这个文件**当前
  真实存在**于仓库根目录（`.gitignore` 第 122、141 行专门排除了它，说明写这条 gitignore 规则的人
  知道这文件可能装真实密钥），内容是明文 JSON（`mysql_config['user']`/`['password']` 直接来自
  `json.load(f)`，这条代码路径里**完全没有调用任何加密函数**——比 #1 里最弱的方案 A 还弱，A 好歹还
  异或一下）。本轮实际读取了这个文件：当前内容是空数组 `[]`，未被 git 追踪过，最后修改时间
  2026-01-07（约 6 个月前）——**当前没有真实密钥泄露**，但这套机制是完整可用、随时可能被重新填入
  内容的活代码，"现在安全"纯粹是因为这个文件碰巧是空的，不是因为有任何机制阻止别人往里面写真实
  密码。同一个兜底字面量 `"SELECT * FROM dy_order LIMIT 1000"` 在这里又出现了一次（838 行）。落盘
  方式是 `con.register(source.id, df)`——只注册会话级视图，不建真实表，与模式 1 的持久化语义不一致，
  这两个模式连"这次操作算不算真的存下来了"都没有共识。
- **模式 3** 就是原报告已有的 `#14`（直连参数），是这个 `elif` 块的 `else` 分支——模式 1/2 是本轮
  新发现的、位于同一段代码里的两个姊妹问题。

已核实当前打包的前端 UI 不会触发这整个分支（`buildJoinQueryPayload.ts:208,216` 和
`JoinQueryPanel.tsx:1197,1707,1776` 一律硬编码 `type: 'duckdb'`），校准方式与原报告处理 `#7` 时一致：
"打包 UI 不触发，但没有鉴权的情况下任何直接调 API 的调用方都能触发"。

**建议**：删除模式 1/2（`config/mysql-configs.json` 整套机制应该被视为废弃原型代码，不是需要保留兼容
的功能），`perform_query` 的数据源解析应该复用本会话已经建好的 `resolve_attach_databases_for_async`
+ `execute_sql_and_persist` 路径——这正是 `save_query_to_duckdb` 已经在用的机制，`perform_query` 没有
理由用一套更老、更弱的平行实现。

### NEW-C. `JoinQueryPanel.tsx`：2197 行的上帝组件，同仓库已有更小规模问题的修复先例

主组件函数体内直接调用 7 次 `useState`、14 次 `useCallback`、5 次 `useEffect`、19 次 `useMemo`——
45 次 hook 调用集中在一个函数里。文件内联了另外 3 个组件（`TableCard`、`JoinConnector`、
`MemoizedJoinConnector`，接口定义在 540/569/846/1064 行），而不是拆成独立文件。

这不是孤立判断——同一个分支的 git 历史里已经有一条 `refactor(datasource): split UploadPanel (770
lines) into four ownership-scoped hooks` 的提交，说明团队已经在 770 行（约为 `JoinQueryPanel.tsx`
三分之一体量）就认定"太大、需要按职责拆分",并且真的做了。`JoinQueryPanel.tsx` 目前是前端第二大文件
（`filterUtils.ts`，1053 行）体量的两倍以上，是这条已验证过的团队共识里唯一的例外。

**建议**：按 `UploadPanel` 的先例，把 `TableCard`/`JoinConnector` 拆到独立文件，把 `runServerJoin`
等纯逻辑函数拆到独立 hook——降低单文件复杂度，同时也是修复 NEW-D（请求时效性）和 `#17`
（服务端执行路径未做时效校验）时顺带能做的结构性改善，而不是三个独立任务。

### NEW-D. 前端请求时效性判断被独立发明 2 次，2 次都错

`frontend/src/hooks/useQueryWorkspace.ts` 的 `currentRequestIdRef`（已确认的 `#10`）和
`frontend/src/Query/JoinQuery/JoinQueryPanel.tsx` 的 `joinRequestIdRef`（已确认的 `#17`，本轮重新
逐行核验：`runServerJoin` 在 1714 行设置该 ref，在 1722 行的 `finally` 块里无条件清空，**清空发生
在 1725-1746 行调用 `previewHandler`/`onExecute` 之前**——整个函数里没有任何一处比较"本地闭包变量
`requestId` 是否仍等于 ref 当前值"，意味着两个重叠请求会按谁先 resolve 谁生效，不是按谁后发起谁生效）
是全仓库仅有的 2 处独立请求时效性追踪实现（`grep` 过
`RequestIdRef|requestIdRef|latestRequestId|currentRequestId`，确认只有这 2 个文件命中，不是"至少 2
处但可能更多"）。**2 处全部被本轮或原报告证实存在"过期响应覆盖新响应"的 bug**——这不是"某个开发者
不小心"，是这类模式在这个代码库里第一次和第二次尝试都没做对，因为没有一个共享的原语可以直接复用。

**建议**：抽一个 `useLatestRequest` 之类的共享 hook（生成 id、追踪最新、提供"这个响应还作数吗"的
判断），迁移这 2 处使用；任何未来新增的异步功能天然获得正确行为，不需要重新推导一遍这个极其常见的
竞态处理逻辑。

### NEW-E. `AttachDatabase` 接口被独立声明 4 次，其中 1 份已经漂移

本会话早些时候的技术方案里，`sqlUtils.ts`/`queryWorkspace.ts`/`AsyncTaskDialog.tsx` 被认为是 3 份
独立声明，且因为 TypeScript 结构类型系统，判断为"低风险、无需统一"。本轮重新 `grep` 发现**实际是 4
处**（另有 `frontend/src/Query/JoinQuery/sqlOptimizer.ts:87`），并且直接比对了全部 4 份的字段：

- `types/queryWorkspace.ts:3` — `{connectionId, alias}`，都必填
- `utils/sqlUtils.ts:164` — `{alias, connectionId}`，都必填（字段顺序不同，语义相同）
- `Query/AsyncTasks/AsyncTaskDialog.tsx:34` — 多一个可选的 `connectionName`
- `Query/JoinQuery/sqlOptimizer.ts:87` — **不同**：多一个必填的 `type: string`，且
  `connectionId?: string` 在这里是**可选**的，其余 3 处都是必填——这是实质性的行为漂移，不是命名
  风格差异。

这是本会话早些时候"低风险、不需要统一"这个判断的一处修正：那次判断没有真正比对全部声明的字段形状就
下了结论，本轮比对后发现"低风险"的前提（4 份声明结构一致）并不成立，其中一份已经不一致了。

**建议**：不必强行合并成一个类型（结构类型系统下确实不是必须），但至少需要把 `sqlOptimizer.ts` 那份
的 `connectionId` 必填性和其余 3 处对齐，避免继续漂移；长期看应该有一个权威定义、其余通过 `import
type` 引用，而不是继续独立声明。

### NEW-F（对照组）. MCP 包本身在"设计质量"这个维度上是干净的

专门检查了 `mcp/duckquery_mcp/client.py`、`util.py`、`config.py`——都很小（108/16/26 行）、职责单一、
没有内部重复。`client.py` 的 `runtime_file()` 表面上和 `api/core/common/paths.py` 的用户数据目录解析
逻辑重复，但这处重复有 docstring 明确说明原因（跨包边界，`mcp/` 是独立 pip 包无法直接 import `api/`
代码），判定为合理重复，不计入 NEW-META。MCP 现有的问题（`#3`/`#4`/`#5`）都是安全**策略**缺口
（该拦的地方没拦），不是架构/设计质量问题——这个区分值得明确写出来，避免整份报告显得是无差别扣分。

---

## 三、对抗性核验记录（节选，完整过程见工作笔记）

用户明确要求"对抗性审核核验"，以下是本轮对新发现做的自我反驳尝试，每条都记录了反驳理由和最终为什么
保留（或修正）：

1. **NEW-META 是否只是"重复代码不好看"的空泛判断？** 反驳角度：8 处 `_quote_identifier` 都是 2 行的
   纯函数，重复成本接近零。最终保留的理由：清单里每一条都要求有"已证实的后果"才收录（注入漏洞、
   风险分配反转、接口真实漂移、2/2 的时效性 bug），并且用 `client.py` 的合理重复作对照组，证明筛选
   标准不是"grep 命中 >1 次就算数"。

2. **NEW-A 是否只是"文件长"这种主观感受？** 反驳角度：JOIN 本来就比 pivot/set-operations 复杂，长
   是合理的。最终保留的理由：不是以长度本身为证据，而是"550 行零 FastAPI 依赖的纯函数混在 router
   文件里"，且同仓库另外 2 个结构相同的兄弟功能都做了分离——这是和自己的既有约定不一致，不是抽象
   的行业最佳实践说教。同时**主动降低**了因果关系的确定性措辞（"合理推测"而非"已证实的原因"），
   因为无法证明原作者当时为什么没复用 `_join_column_ref`。

3. **NEW-B 最关键的一次修正——核验过程改变了结论**：最初读到 `config/mysql-configs.json` 被
   `.gitignore` 排除、且代码里明文读取密码时，第一反应是"这是一处真实的密钥泄露"。但按"先查真实状态
   再下结论"的原则，实际读取了这个文件——发现是空数组、从未被 git 追踪、6 个月没改过。于是把结论从
   "存在真实泄露"改成了更精确也更诚实的"机制真实存在、被 gitignore 说明有人知道它敏感、当前恰好是
   空的、'安全'纯属运气不是设计"。这是本轮唯一一处对抗性检查真正推翻了初始判断的地方，记录下来是
   为了如实反映核验过程，而不是只展示"核验通过"的结果。

4. **NEW-C 是否只是"大文件"焦虑？** 反驳角度：有些领域本来就需要大组件，行数不是万能指标。最终
   保留的理由：用了两个更硬的信号（单组件 45 次 hook 调用；同分支 git 历史里已有的 `UploadPanel`
   拆分先例，证明这不是我个人的偏好，是这个项目自己已经验证过的判断标准），而不是单纯因为行数最大。

5. **NEW-D 的"2 处"是不是低估了，会不会漏了第三处？** 在写结论前先做了一次全仓库 `grep`（覆盖
   `RequestIdRef`/`requestIdRef`/`latestRequestId`/`currentRequestId` 四种命名变体）确认只有 2 个
   文件命中，避免"目测差不多有好几处"这种不精确表述。

6. **NEW-E 是否可以照抄本会话早前"结构类型系统足够、无需统一"的判断？** 这正是需要反驳的对象——早前
   的判断没有逐字段比对过全部声明就下了"低风险"的结论。本轮实际比对后发现第 4 份声明（当时甚至没有
   被发现存在）已经漂移，直接推翻了"低风险"这个前提，是本轮对自己此前工作的一次修正，不是对第一版
   报告的修正。

---

## 优先级建议（合并两轮）

1. **立即处理（数据安全，攻击面已确认可达）**：`#1`（密码加密，本轮发现范围更大）、`#2`（JOIN 列名
   注入）、`#3`/`#4`/`#5`（MCP 三连）、**NEW-B 模式 2**（`config/mysql-configs.json` 明文凭据机制——
   建议直接删除这套模式 1/2，不是缝缝补补，理由见 NEW-B）。
2. **尽快处理（数据丢失风险）**：`#6`、`#7`、`#11`（同一类无事务 DROP+CREATE，`27c362b` 已经示范了
   正确的 staging+事务模式，照搬即可）。
3. **架构性处理（一次投入、消除一整类未来 bug，而不是修一个算一个）**：NEW-META 列出的 7 个横切
   关注点各建一个共享实现；NEW-A（JOIN 编译逻辑搬到 `core/services/`）；NEW-B 模式 1（`perform_query`
   改接 `execute_sql_and_persist`）；NEW-D（`useLatestRequest` 共享 hook，一次性同时修 `#10` 和
   `#17`）。这一组的共同点是：修复成本不比逐点打补丁高多少，但能连带消除同类问题在未来复发的可能性，
   投入产出比最高。
4. **计划内处理（正确性/一致性）**：`#8`/`#9`/`#12`/`#15`（并发/状态机）、`#16`（错误码不一致）、
   NEW-C（`JoinQueryPanel.tsx` 拆分）、NEW-E（`AttachDatabase` 对齐必填性）。
5. **低优先级 / 视部署形态而定**：`#13`/`#14`/`#18`/`#19`/`#20`（原报告已有说明，本轮未改变结论）。
