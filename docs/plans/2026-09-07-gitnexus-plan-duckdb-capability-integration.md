# DuckQuery 2.0 前后端能力集成与提前缺陷处理方案

> 日期：2026-09-07；状态：实施完成并通过本地验收。
> Evidence verified at commit 887568b557a3bd4b25b8e3534e60ddad7273fca1。
> GitNexus 图索引与 HEAD 一致；runner_identity=null、scope-extraction-unverified，CLI 1.6.5 / stdio MCP 1.6.11 存在工具版本差异；无 PDG 层。本方案以源码与运行实验为主，不声称图谱完整。
> Evidence provenance schema 2；global dirty digest 0a9c85780067d9afcd0764f307b60891e3cee927ee11eaeb5ec7826d10fd82cd；31 个排序路径；仅排除本计划路径。
> 标签：[verified] 源码/本地实验确认；[graph] 图谱导航结果；[inferred] 由证据作出的设计判断；[assumed] 尚待指定实验验证。
> 用户要求：本版尽早发现并解决问题，每个建议配具体方案；保持用户使用简单。前面的聊天方案以本文件修订为准。

### 实施结果（2026-09-07）

- 当前构建对未验证的 MySQL `remote_pushdown` 采取 fail-closed 策略；正常与连接池后备配置都必须成功执行安全基线。
- JSON 数字词元、重复键和完整复制保持原文；大值渲染有上限，JSON Pointer 路径覆盖空键、`/`、`~`、点号与数组索引。
- 查询租约启用并恢复 `errors_as_json`，错误位置从执行 SQL 映射回原 SQL 的 UTF-16 坐标，并用 SQL 摘要/请求 ID 绑定；编辑后的旧诊断失效。
- MySQL 与 PostgreSQL 取消器按 attempt 注册和释放；PostgreSQL 使用剩余服务端预算及任务专属 `application_name`，真实 `pg_cancel_backend` 用例通过。
- 本地、联邦异步、内联与集合保存使用 staging/事务发布；注册前取消、提交竞态、失败与导出取消均保留旧结果并清理候选产物。
- 验收：后端 **1354 passed / 6 skipped**，前端 **1258 passed / 1 skipped**，MCP **77 passed / 1 skipped**，真实 MySQL 8.4 / PostgreSQL 18.4 矩阵 **3 passed**，pylint **10.00/10**。

## 1. Objective

保持“选数据—写 SQL/AI/可视化构建—运行—查看/保存/导出”的操作流程。先修复本次已复现的数据正确性和生命周期问题，再在同一版本内按验证过的范围启用远端优化。没有执行模式选择器、CONNECT 输入要求或新专用 Tab。

本版交付的单位是“问题—修复—回归证据”，不是“已升级依赖”。本文件没有宣称问题已在业务代码修好。

## 2. Current Behaviour

- [verified] 能力表已有 SQL / Agent / MCP 三个执行面，按固定引擎版本声明；没有覆盖完整自动优化/远端扩展组合。见 api/core/common/duckdb_capabilities.py:47。
- [verified] 应用层 optimize_federated_sql 仅在同步联邦入口调用；异步/保存走 execute_sql_and_persist，导出直接 COPY，AI 有独立 _execute_guarded。
- [verified] 同步联邦已有 MySQL 事务绑定及 KILL QUERY 取消器；不能误称项目完全没有远端取消。见 api/core/database/federated_attach.py:209。
- [verified] 落表已有 staging + 事务替换，空结果可按 reject_empty 决定是否发布；有一次特定连接失效重试。
- [verified] 前端嵌套数据已经有弹窗和复制功能，无需重新做查看器；但格式化存在数字丢失。
- [verified] 新 SQL 的手写/MCP 与 AI 支持不相同；保持原有 AI 表范围审查，不能以原生 Parser 接受语法作为授权依据。
- [verified] 资源预算已有 RAM/临时盘/并发配置和磁盘余量检查；预算不是整个进程 RSS 硬上限。

### 本次最小实验（全部使用临时数据，无业务库访问）

| 编号 | 环境/动作 | 观察结果 | 本版处理 |
|---|---|---|---|
| E1 | 调用实际 toFormattedJson，输入 JSON id=9007199254740993、amount=1234567890.123456789 | id 变为 9007199254740992，小数变为 1234567890.1234567；复制使用 formatted | 必修：文本保真格式化与复制 |
| E2 | 相同输入用 Microsoft jsonc-parser 3.3.1 format + applyEdits | 大整数、小数、1e100 原词元全部保留 | 已验证可行替代 |
| E3 | DuckDB v2.0.0-alpha39998 + mysql_scanner 1b7a31b95b + 临时 MySQL 8.4，ATTACH 后 GROUP BY | EXPLAIN 为 MYSQL_QUERY，原生下推已经发生 | 修正“原生未接入”的旧判断 |
| E4 | DECIMAL(20,4) 的 SUM；含 12.3456、8.0000、9007199254740993.1234 | 原生结果 DOUBLE 9007199254741014.0；禁用 remote_pushdown 后 DECIMAL(38,4) 9007199254741013.4690 | 必修：当前构建精度策略 |
| E5 | 实际 fetch_query_records 执行 E4 | 返回数值 9007199254741014.0，但 cursor_types 声称 DECIMAL(38,4) | 必修：值与类型一致，不能靠元数据遮盖失真 |
| E6 | mysql_query 直接 SUM；再显式 CAST(SUM(amount) AS DECIMAL(38,4)) | 直接 SUM 同样为 DOUBLE；显式 CAST 恢复精确 Decimal | 类型受限适配的可行原语；溢出仍须补测 |
| E7 | 同一 MySQL 的字符串大小写比较、NULL 排序、简单 JOIN，native 与关闭原生/过滤下推对拍 | 这些样例一致 | 仅证明该小样本，不推导普遍语义一致 |
| E8 | postgres_scanner c91ea57793 + 临时 PostgreSQL 18.4，ATTACH GROUP BY | PostgreSQL Scan + 本地 Hash Group By；关闭 remote_pushdown 计划不变 | 不能向 PostgreSQL 宣称与 MySQL 同等原生聚合下推 |
| E9 | CONNECT pg 后 SELECT 与 CTAS | SELECT 远端执行；“本地”CTAS 被送到远端，由 READ_ONLY 拒绝 | 普通产品链路不采用 CONNECT |
| E10 | postgres_query pg_sleep(2)，0.15s 后本地 interrupt | 约 2.029s 才退出；InterruptException | 本地发出中断不等于远端立即停止 |
| E11 | 同一 PG 连接使用 options='-c statement_timeout=250' | 约 0.272s 收到服务端 statement timeout | 服务端截止时间已验证，用户取消另做同会话验证 |
| E12 | errors_as_json=true：Binder/Catalog 错误，含中文/emoji | 有 position 与 location；“SELECT '中文😀', missing”的 position=21 为 UTF-8 字节偏移；SELECT FROM 仍为纯文本 Parser Error | 结构化优先、文本兜底，正确转换坐标 |
| E13 | 7 个能力测试结束后显式 shutdown_all_duckdb_connections + gc | 7 passed，退出无本次 nanobind 警告 | 先修测试资源生命周期，不直接归咎引擎 |

MySQL 官方镜像拉取 digest：sha256:b3b90af2a6552ae30c266fdb7d5dd55f3afb72404bb78d37fe8a23eb857fd3fb。两个测试容器均已停止并自动删除；未修改用户保存的连接、生产配置或数据库。临时 JSON 依赖未写入项目 package/lock。

## 3. Relevant Architecture

执行策略共用，但结果目的地和授权边界分别保留：

1. 原始 SQL + 已解析授权连接 + 行数意图 + query_id。
2. 现有分类/AI scope guard 在原始 SQL 上完成审查。
3. 轻量策略决定允许的原生能力或受限官方远端表函数；不建立一套通用 SQL 编译器。
4. 受控连接内 ATTACH、固定 attempt、设置截止时间、绑定取消器。
5. 执行一次，输出到 preview、local staging 或 local COPY。
6. 实际类型/精度与取消状态检查后才提交或发布；清理回调、事务、附件和临时产物。

[verified] records_from_cursor 将 Decimal 与超 JS 安全整数转成字符串，嵌套对象转成 JSON 文本。前端不应绕回 JS Number。见 api/core/common/utils.py:134。

[verified] fetch_query_records 为纳秒保真预先 DESCRIBE 并改写投影，同时有特定只读失联重试。该机制与“远端表函数在 bind 阶段执行查询”有冲突，不能直接删除所有 DESCRIBE 或统一再执行一次。

[inferred] 最小可维护结构是“共用政策 + 执行上下文 + 保留目的地适配”，不是把同步、异步、AI、导出合并成一个巨大函数。

## 4. GitNexus Findings

以下来源为前置影响审查的 upstream impact；数字是索引中的潜在依赖，不是必然故障或完整性保证。

| 工具 target | 直接调用数 | 风险 | 方案约束 |
|---|---:|---|---|
| with_duckdb_connection | 43 | CRITICAL | 不改变通用连接的会话目的地、返回类型或生命周期 |
| interruptible_connection | 10 | CRITICAL | 所有取消用户共用契约；保持入口参数兼容 |
| ensure_query_has_limit | 6 | CRITICAL | 保持预览/全量保存/FETCH/透视/AI 行数语义 |
| normalizeResponse | 78 | CRITICAL | 本版不修改统一解包行为 |
| fetch_query_records | 4 | CRITICAL | 修精度与实际类型；直接调用方逐个验收 |
| _apply_perf_and_remote_settings | 2 | CRITICAL | 正常/后备配置都应用安全基线，其他设置不丢失 |
| is_read_only_sql | 3 | HIGH | 分类接口、查询写拦截、导出不能分叉 |
| optimize_federated_sql | 1 | LOW | 源码确认仅同步联邦；不能据 LOW 断言全链路安全 |
| mysql_remote_cancellation_scope（context） | 同步联邦 + 测试 | 未作数值风险推断 | 为其他入口复用前先验证事务和本地写入关系 |
| createJsonCellRenderer | 1 | LOW | 真正风险在数值/复制契约而非调用数 |

直接依赖处理：
- fetch_query_records：timed_fetch_query_records、federated_attach 中 _run、duckdb_query 中 _run_query_maybe_save 与 execute_in_connection；都测试值/类型/执行次数。
- 行数限制：_execute_guarded、本地执行、联邦执行、JOIN perform_query、透视 _preview_pivot_query、apply_row_limit_choice；后者继续影响保存/导出/异步。
- 可取消连接：execute_sql_with_attach、execute_sql_and_persist、AI、本地异步、本地同步、同步联邦、JOIN、透视、导出、集合操作，全部列入入口矩阵。
- 通用连接与 normalizeResponse 这两个 hub 不作结构性修改；因此不以改遍所有调用方为目标。若实施中必须改签名或语义，必须回到本节重新审查。
- 配置两条直接路径 _apply_duckdb_configuration / _apply_default_duckdb_config 必须同时覆盖已复现的原生优化精度保护。

## 5. Statement-Level PDG Findings

[graph] stdio MCP 的 pdg_query(controls, execute_sql_and_persist) 返回 no PDG layer。索引 runner_identity 未知且 scope-extraction-unverified，故规划阶段不以未知分析器刷新后假称完整，也未构建分析器输出。本节为源码控制顺序分析，不伪称 PDG 边。

[verified] execute_sql_and_persist：ATTACH → 建 staging → 失败时仅特定只读失联重试 → 读 staging 元数据 → reject_empty 判断 → BEGIN/DROP/RENAME/COMMIT → 失败 ROLLBACK → finally DETACH。改动不得绕过 staging 或在取消后发布。

[verified] mysql_remote_cancellation_scope：BEGIN 固定扩展事务 → 获取 CONNECTION_ID → 注册取消回调 → yield 执行 → COMMIT/失败回滚。捕获会话失败时降为本地 interrupt；必须诚实区分能否真实取消远端。

[verified] register_remote_interrupt 当前 append 回调，interrupt_with_remote 返回值表达中断调用是否成功，不代表服务器查询已停止。重试切换 attempt 时应撤销旧会话回调，并解决注册前取消、完成后迟到取消的竞态。

[verified] 同步联邦还存在“先取预览，再以原 SQL CREATE OR REPLACE”的 save_as_table 分支，保存错误被放到 warnings。普通保存入口却使用 staging。两者必须统一错误/原子性，不能只修对话框保存。

## 6. Proposed Changes

### 6.1 先修本版已复现缺陷

**A. MySQL 聚合精度与类型错报**
- 文件：duckdb_engine.py（fetch_query_records、配置入口）、federated_optimizer.py、duckdb_capabilities.py。
- 对已复现不安全的引擎/扩展组合，将 remote_pushdown 排入默认禁用集合；保留既有禁用项，不能写空字符串覆盖用户原配置。
- 不把安全策略当作可失败忽略的性能选项。安全基线在可配置的性能/remote_settings之后应用，防止后续覆盖。设置无法生效时，受影响的自动远端策略不能继续运行。
- 在每个执行上下文按已验证查询类别选择放行；没有可靠类型证据时保守保留本地计算。普通用户不见开关。
- 优先复用官方原生优化器。当前 DECIMAL 聚合不走无类型约束的 native/mysql_query。
- 受限替代：仅对已确定 DuckDB 目标精度/scale 的可表示聚合，生成 mysql_query 内部显式 DECIMAL CAST；不是取回 DOUBLE 后再 CAST。MySQL 超范围行为可能警告/饱和，未证明与 DuckDB overflow 语义一致的输入必须走本地，不能静默截断。
- 用户显式手写mysql_query/postgres_query属于目标方言查询，不能由自动适配器猜测并重写其内部SQL；返回真实cursor type，提供精确CAST示例。自动生成的远端查询则必须满足本方案精度契约。
- 不能“修 column_types 为 DOUBLE”掩盖自动优化导致的数值损失；同时验证实际 cursor type、值与输出列顺序。原始 logical type 与 wire encoding 可分别记录，前端不猜。
- PostgreSQL 使用官方 postgres_query 的已验证子集或保持 ATTACH；不承诺当前扩展存在完整原生 QueryNode 下推。
- 本版不扩大任意 SQL 转译面，不把 sqlglot 转译成功视为等价证明。

**B. JSON/VARIANT 展示与复制保真**
- 文件：jsonCell.ts 的 toFormattedJson、JsonCellViewerDialog.tsx，以及前端 package/lock。
- 引入已验证的 jsonc-parser 3.3.1 作为直接依赖。使用 format/applyEdits 修改空白；原始数字词元始终来自输入切片，不使用 parse 后数值重新 stringify。
- strict JSON 校验：不接受评论/尾逗号为正常数据；失败显示原文并提示，不“修复”数据。
- 复制默认复制原文；格式化复制若保留则只改变空白。完整复制不使用 200 字符网格预览。
- 树/路径基于 offset/length；保留重复键、精确小数、指数写法、负零。JS 对象输入若已失精度不能恢复，后端继续用原始 JSON 文本契约。
- 超大 JSON 展示限量/按需展开，复制原文不受可见截断影响。长文本解析不得在每个虚拟网格单元格重复进行。
- 字段路径提取：空键、点、斜杠、引号和数组索引都有明确转义；JSON 数组索引与 DuckDB LIST 索引不能混用。
- “生成提取 SQL”只填入编辑器、不自动执行；须保留结果 SQL 来源、列位置及连接权限。来源不明确或已变更时仅提供复制路径，不能猜表名/重复列名。

**C. 官方结构化错误与原 SQL 坐标**
- 文件：sql_error_location.py 的 parse_sql_error_location、执行上下文、SQLEditor.tsx。
- errors_as_json 在查询租约内启用，并恢复原值；内部错误统一适配后再交给现有消息/UI/AI，避免 JSON 原串破坏旧错误检查。
- 解析带前缀的 JSON 错误时只接受有效结构；Binder/Catalog 优先使用 position/location，Parser 纯文本继续兜底。
- 定义坐标契约为原始 SQL 的行和 UTF-16 列（CodeMirror）；先将 DuckDB UTF-8 字节偏移映射到原始文本，再换算 UTF-16。
- 保留 original_sql、execution_sql 与可证明的 source map。简单追加 LIMIT/包裹投影可映射；大幅重写无法准确还原则不标记错误位置。
- 诊断绑定 query_id + 原 SQL 摘要；用户已编辑 SQL 后不把旧位置夹到新文本中。

**D. 取消、重试与发布原子性**
- 文件：federated_attach.py、connection_registry.py、各执行目的地接入点。
- 复用现有 MySQL KILL QUERY 机制，而不是再建取消系统；扩展为每次 attempt 注册/撤销回调，回调只允许命中该查询仍拥有的远端会话。
- PostgreSQL 服务端 statement_timeout 由剩余预算生成，经驱动连接选项传入；参数不可由任意 SQL 片段拼接。用户取消使用可验证同会话取消机制；未证明及时停止时 UI 保持“正在取消”，不立刻显示完成。
- MySQL 截止时间优先使用官方 SELECT 执行时间约束，在被覆盖语句上实测；不把 MySQL 提示适用范围扩展到任意语句。
- 重试仅在同一路径、明确允许重试的执行阶段、未发布结果的情况下发生；未知/易变/UDF/序列/不确定执行状态不能自动重放。禁止超时后换路径再跑。
- query_id 注册前取消、超时与完成同时发生、重试后旧回调、关闭 App 的 interrupt_all，都要保持一致。
- 保存和导出必须在本地；不在 CONNECT 会话中 CTAS/COPY。preview+save_as_table 走本地 staging 一次生成结果，之后从 staging 取预览与发布，避免执行两次且错误仅降成 warning。
- **事务只有一个所有者。** 不能把现有会自行 BEGIN/COMMIT 的 mysql_remote_cancellation_scope 直接套在现有同样 BEGIN 的落表路径外。执行上下文拥有整个 attempt 的事务；会话捕获/取消注册拆成不自行提交的子作用域。staging构建、旧表替换、成功检查使用该事务，不再嵌套BEGIN；只在入口没有活动事务时由上下文开启。失败统一回滚，重试创建新的attempt与staging，取消子作用域无权提交。
- 取消/失败清理 staging/候选文件，事务替换失败保留旧表；只有提交成功才刷新数据缓存和登记表创建。
- 内联preview+save物化后再取预览必须保留用户显式ORDER BY及列顺序；内部排序序号只属于staging/预览，不可泄露到最终表、导出或column_types。无ORDER BY本来就不承诺行序。全量保存和预览上限分别应用，不能把预览LIMIT永久写进保存结果。
- 数据源在预览与之后独立保存之间变化时，两次查询可能本来就不同；不能承诺跨请求快照一致。需要同一结果时保存物化结果，不能静默重查。

**E. 测试与关闭生命周期**
- 文件：tests/conftest.py、相关连接 fixture、TestClient 用例。
- 使用 with/fixture finalizer 关闭临时连接、TestClient 上下文管理和全局池 teardown；reuse 已有 shutdown_all_duckdb_connections，不关闭仍运行的任务。
- E13 只证明该测试集警告可消除；桌面真实启动/退出需验证，不通过环境开关抑制 nanobind 警告。
- 修资源生命周期时保留隔离配置/路径，不能影响用户的 runtime.json 和真实数据库。

### 6.2 各特性本版落地范围

| 能力 | 产品状态 | 本版动作 |
|---|---|---|
| v2 storage/迁移 | 支持 | 保留既有迁移；补足旧库/失败恢复/空间不足与包矩阵验证 |
| Parser | 支持，完善 | C 项结构化与坐标 |
| 聚合溢写、存储优化 | 引擎自动使用 | 保持预算，无新开关；分别验证DB目录/临时目录、fallback配置 |
| 优化器 | 按验证范围使用 | A 项精度门控；未知构建不默认全开 |
| VARIANT/JSON mutation | SQL与展示支持 | B 项保真；SELECT变换与UPDATE写入仍分开 |
| Lambda | 新语法支持 | 示例/补全/AI使用 lambda；保留JSON箭头 |
| APPROX NEAREST/USING KEY/FETCH | 手写SQL/MCP支持 | 已有总行数/保存/导出回归；AI暂不执行这些语法 |
| 异步I/O | 按现有读取路径自动使用 | 不改URL先下载再解析，不新建对象存储产品入口 |
| MySQL远端执行 | 部分支持、受精度策略约束 | native优先验证；不安全聚合本地或受限typed adapter |
| PostgreSQL远端执行 | 受限支持计划 | 官方postgres_query的类型/语义白名单；ATTACH保底 |
| CONNECT/Quack | 普通产品入口不支持 | CONNECT无助于当前统一DuckDB方言和本地落盘目的地；不纳入执行链 |
| Trigger/DML-in-CTE/任意扩展仓库 | 不支持 | 后端继续阻止；兼容性说明写明应用限制 |
| 稳定C API | 不适用 | 保持Python接口 |

### 6.3 轻量前端与能力契约

- 不增加执行方式选择器。设置页只提供版本、Preview 与兼容性说明；详细能力表服务 AI/MCP/诊断。
- /api/capabilities 保持已有字段兼容，新增能力拆分、reason_code、核验身份（engine/extension version/platform/contract revision）与未知状态；不能把“未实测”说成“引擎不支持”。
- 扩展名来自运行时 canonical 名（本机实际是 mysql_scanner/postgres_scanner），不能只查询 mysql/postgres 导致遗漏。
- 查询结果可选增加 execution_info：实际执行位置/采用策略/验证依据；未知时不展示“已下推”。不要为显示详情额外执行用户查询或 EXPLAIN ANALYZE。
- AI继续原授权/grounding/行帽；MCP继续confirm门控。原生json_serialize_sql可作为后续补充证据，不替换本版AI scope guard。
- 中英词条成对，复用shadcn/ui/Tailwind；TanStack Query与@/api；存储设置与缓存刷新按现有契约复用。
- Wasm Demo独立能力，不请求不存在的后端接口；桌面/离线包核验扩展后才声明可用。

## 7. Implementation Sequence

同一版本分成可独立审查的变更，顺序是依赖顺序，不是把缺陷推到以后：

1. 建立真实远端测试 fixture 与 E1/E4/E5/E10/E12 失败回归；固定 engine/extension/server/platform，测试数据全部隔离。
2. 先修 JSON 数字损失与当前构建 MySQL 聚合精度，默认保护覆盖正常/后备配置路径。验证不改变本地/导入/透视/集合及类型契约。
3. 收敛执行上下文：授权先行、元数据不重放、typed adapter与本地目的地分离，逐一接同步/异步/保存/导出/AI。
4. 完成取消/重试/清理/原子发布；接图表重新聚合、MCP、直存分支和关闭流程。
5. 实现官方JSON错误适配、源位置映射、前端旧诊断失效。
6. 补能力契约、简短兼容性说明、SQL提示和JSON路径交互；不增加执行模式。
7. 修fixture teardown，完整回归及真实数据库并发/取消/故障注入；Docker/桌面/Wasm分开验证，完成包内扩展矩阵。
8. 提交前逐symbol impact及detect_changes；实际变更超出§10时回到本计划复审；更新受影响说明文档与双语发布说明。

不得为了“已全面支持”跳过失败用例或把现有数值回归标成可接受差异。

## 8. Test Strategy

### 入口×行为矩阵

| 入口 | 必须验证 |
|---|---|
| SQL本地/同步联邦 | 原值/类型/重复列名、LIMIT/FETCH、取消、失败、执行一次 |
| 异步本地/联邦 | 提交行数选择、取消、重试、任务终态、staging提交 |
| 普通保存/内联save_as_table | 空结果、已有表、overwrite规则、事务失败保留旧表、缓存刷新 |
| 同步COPY/异步已物化结果导出 | 本地路径、精度、文件残留、是否重新读取远端 |
| AI所有profile | 原scope/授权/grounding/行帽，禁止语法不因原生Parser支持而放开 |
| MCP read-only/normal/full | confirm保留，blocked能力不能以full绕过产品限制 |
| JOIN/透视/集合/图表 | 各自生成SQL真实执行，图表重聚合与下钻保留来源和别名 |
| Desktop/Docker/Demo | 实际engine与扩展；关停/WAL；Demo不继承后端能力 |

### 数据与边界

- DECIMAL精度/scale边界、SUM/AVG溢出、负数、NULL、空集；结果值和类型同时断言。
- BIGINT/UBIGINT/超2^53、纳秒时间、时区/DST、重复列和大小写列名。
- MySQL字符collation、NULL排序、COUNT/SUM/AVG、日期运算；Postgres数值/数组/JSONB。不能用字符串相等代替类型和值对拍。
- 一连接内schema、本地与远端同名表/CTE shadowing、本地宏/UDF、相关子查询、window/union/limit。无证明则策略选本地。
- JSON大整数/精确小数/指数/负零/重复键/空键/特殊路径/深嵌套/MB级文本；复制验证原词元。
- 中文/emoji/CRLF/tab/多行SQL错误；追加LIMIT、包裹CTAS/COPY、纳秒改写；错误返回后用户已编辑SQL。
- 真远端执行次数：使用隔离库日志或计数证据核对，覆盖DESCRIBE/EXPLAIN/数据获取/重试，不在生产打开日志。
- 取消发生于绑定、执行、取数、写staging、替换前后；两个同时查询仅取消指定一个，完成后迟到取消不杀后续任务。
- PostgreSQL statement_timeout、MySQL取消权限缺失、网络断开、库端重启、连接池满、资源不足；错误不误报完成，不触碰旧结果。
- 不使用性能硬断言代替正确性；性能记录远端语句、执行位置、传输行/字节、端到端时间和峰值内存。小样本实验未证明生产提速。

真实MySQL/Postgres测试必须作为CI显式job。依赖缺失不能skip后给出“矩阵全通过”；本地单元测试和远端集成报告分开。

已有测试入口包括 test_federated_attach.py、test_query_export.py、test_decimal_fetch_precision.py、test_sql_error_location.py、test_duckdb_v2_features.py、test_duckdb_capability_contract.py、jsonCell.test.ts。实施时在相邻目录增加真实数据库/竞态场景，所有历史回归注明日期。

验证命令见§11；前端npm脚本已检查，后端/MCP命令遵循AGENTS。本轮既有114+50项基线测试通过，另E13的7项在显式teardown下通过；未声称全项目测试或三平台构建已完成。

## 9. Risk and Impact Analysis

- **最高优先级：静默改值。** E4/E5为已复现事实，不是潜在性能问题；先阻止，后放行。仅修标签不能解决。
- **连接上下文。** 普通CONNECT会改变整个会话执行目的地，E9已证明；从方案中移除该路径。
- **共享设置。** memory_limit/temp预算是实例资源概念，不按每条查询随意SET全局值；native策略设置必须核验作用域、保存/恢复、并发互不干扰。
- **双重优化。** native与应用mysql_query包装不可叠加无条件使用；选一种策略，保存原SQL用于审计/错误定位。
- **元数据和实际类型。** E5说明DESCRIBE与执行可能不同；内部source types仅作语义目标，不当实际编码证明。
- **取消不是布尔成功。** 本地interrupt被接受不证明远端停止；不能取消后继续发布staging。
- **调用图盲区。** HTTP边界、闭包、动态回调与版本依赖不由GitNexus穷尽。所有关键顺序以本轮源码与集成测试证据确认。
- **发布物。** 固定Python轮子、扩展artifact与平台；不以开发环境可LOAD等价离线包可LOAD。当前仍为Preview。
- **不扩散改动。** 不重写normalizeResponse、通用连接池结构、UI设计系统、表单体系和AI授权框架；发现与本版目标无关的风格问题单列，不混入实现。

## 10. Files Expected to Change

| 文件/范围 | 责任 |
|---|---|
| docs/API_CONTRACT_FE_BE.md | 首先登记兼容新增字段、坐标/类型/执行信息语义 |
| api/core/common/duckdb_capabilities.py | 验证身份、分能力/分执行面、应用策略与引擎可用性分开 |
| api/core/database/duckdb_engine.py | 安全配置基线、一次执行、精度与类型一致 |
| api/core/database/federated_optimizer.py | 官方能力选择、受限typed adapter、保留半连接建议 |
| api/core/database/federated_attach.py | 共享执行上下文接入、本地staging与取消生命周期 |
| api/core/database/connection_registry.py | attempt远端回调释放与迟到取消处理 |
| api/core/common/sql_error_location.py | JSON/text解析与坐标转换 |
| api/core/services/ai_agent_tools.py | 原guard之后接执行策略，保留AI结果契约 |
| api/routers/duckdb_query.py / query_export.py | 同步、内联保存、COPY接入及元数据重放消除 |
| api/routers/async_tasks.py / join_query.py / pivot_query.py / set_operations.py | 预期接入点；实施前只核查具体分支，不全文件改写 |
| api/core/database/query_execution_policy.py（拟新增） | 小型策略/上下文模块；不可变计划，不是通用SQL编译器 |
| frontend/src/Query/DataGrid/utils/jsonCell.ts / components/JsonCellViewerDialog.tsx | 保真展示、复制、路径 |
| frontend/src/Query/SQLQuery/SQLEditor.tsx / sqlDialect.ts | 诊断版本绑定、提示完善 |
| frontend/src/api/*、hooks、ResultPanel与双语词条 | 兼容新增字段，折叠详情；具体消费点实施前按契约定位 |
| frontend/package.json / package-lock.json | jsonc-parser直接依赖 |
| api/tests/conftest.py / 相关测试与CI | 生命周期、真实远端fixture与门禁 |

[assumed] 仅作为接入范围列出的router/frontend消费者，具体symbol尚未全部source-verified；执行者不得依此批量编辑，须在对应步骤做定点impact和源验证。核心修复symbols已在§11给出。不会在本次规划中创建上述业务文件。

## 11. Reusable Implementation Context

```json
{
  "implementation_context": {
    "task_summary": "在 DuckQuery 2.0 本版完成数据正确性与运行生命周期修复，并按已验证能力集成 DuckDB 2.0；不增加用户执行模式。",
    "acceptance_criteria": [
      "JSON数字词元无损",
      "MySQL Decimal聚合与类型一致",
      "本地保存与导出不变成远端写入",
      "用户查询体不为元数据重放",
      "取消后不能发布结果或覆盖旧表",
      "同步/异步/保存/导出/AI/MCP/图表/透视/集合行为一致",
      "未知引擎与扩展组合不自动启用未验证优化",
      "全部支持项有可重复验收证据"
    ],
    "evidence_provenance": {
      "schema_version": 2,
      "head_commit": "887568b557a3bd4b25b8e3534e60ddad7273fca1",
      "generated_plan_path": "docs/plans/2026-09-07-gitnexus-plan-duckdb-capability-integration.md",
      "global_dirty_digest": {
        "algorithm": "sha256",
        "canonicalization": "gitnexus-evidence-provenance-v2 NUL-framed UTF-8 records",
        "value": "0a9c85780067d9afcd0764f307b60891e3cee927ee11eaeb5ec7826d10fd82cd"
      },
      "cited_path_manifest": [
        {
          "path": "AGENTS.md",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:3b7888a81584155cffd9ec38394a30f93bed63181742972f060c1ddaf4a7a3bd",
          "index_digest": "sha256:3b7888a81584155cffd9ec38394a30f93bed63181742972f060c1ddaf4a7a3bd",
          "worktree_digest": "sha256:3b7888a81584155cffd9ec38394a30f93bed63181742972f060c1ddaf4a7a3bd",
          "untracked_digest": "absent"
        },
        {
          "path": "api/core/common/duckdb_capabilities.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:3054421feaeb0f40873ba5c8ec6dddeac8603d87f070f242c0bea6f3740009f5",
          "index_digest": "sha256:3054421feaeb0f40873ba5c8ec6dddeac8603d87f070f242c0bea6f3740009f5",
          "worktree_digest": "sha256:3054421feaeb0f40873ba5c8ec6dddeac8603d87f070f242c0bea6f3740009f5",
          "untracked_digest": "absent"
        },
        {
          "path": "api/core/common/sql_capabilities.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:a58b67f890b08ccf676847b768ac140a2e9cecd9466c2e4f84855da31071aab3",
          "index_digest": "sha256:a58b67f890b08ccf676847b768ac140a2e9cecd9466c2e4f84855da31071aab3",
          "worktree_digest": "sha256:a58b67f890b08ccf676847b768ac140a2e9cecd9466c2e4f84855da31071aab3",
          "untracked_digest": "absent"
        },
        {
          "path": "api/core/common/sql_error_location.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:fba42dd19845ed2f8e678703c34ac36eed658827ce6ab96e3ddaacd2bc4db939",
          "index_digest": "sha256:fba42dd19845ed2f8e678703c34ac36eed658827ce6ab96e3ddaacd2bc4db939",
          "worktree_digest": "sha256:fba42dd19845ed2f8e678703c34ac36eed658827ce6ab96e3ddaacd2bc4db939",
          "untracked_digest": "absent"
        },
        {
          "path": "api/core/common/utils.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:cd579b39e98e2d08393f80b73b5181497b87a76d826ffa63da37fcef67210dfc",
          "index_digest": "sha256:cd579b39e98e2d08393f80b73b5181497b87a76d826ffa63da37fcef67210dfc",
          "worktree_digest": "sha256:cd579b39e98e2d08393f80b73b5181497b87a76d826ffa63da37fcef67210dfc",
          "untracked_digest": "absent"
        },
        {
          "path": "api/core/database/connection_registry.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:08dc80c56fad09c329bc5f032f7a1ac49ceb2259484a02d22a4ebf4ee61fcb42",
          "index_digest": "sha256:08dc80c56fad09c329bc5f032f7a1ac49ceb2259484a02d22a4ebf4ee61fcb42",
          "worktree_digest": "sha256:08dc80c56fad09c329bc5f032f7a1ac49ceb2259484a02d22a4ebf4ee61fcb42",
          "untracked_digest": "absent"
        },
        {
          "path": "api/core/database/duckdb_engine.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:57926c86a0920386d49ea8e2392ef8482d000ef38b8a763f66f35ae742149921",
          "index_digest": "sha256:57926c86a0920386d49ea8e2392ef8482d000ef38b8a763f66f35ae742149921",
          "worktree_digest": "sha256:57926c86a0920386d49ea8e2392ef8482d000ef38b8a763f66f35ae742149921",
          "untracked_digest": "absent"
        },
        {
          "path": "api/core/database/federated_attach.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:fe51daf16214c9bf217dd3d244131a0783f763a9fabbdb90f81f4e15dcc51a29",
          "index_digest": "sha256:fe51daf16214c9bf217dd3d244131a0783f763a9fabbdb90f81f4e15dcc51a29",
          "worktree_digest": "sha256:fe51daf16214c9bf217dd3d244131a0783f763a9fabbdb90f81f4e15dcc51a29",
          "untracked_digest": "absent"
        },
        {
          "path": "api/core/database/federated_optimizer.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:6a5a31b1ced50e9a70ae51a7e12b7fc7505d9aa0546ed60561127868dff1ca2b",
          "index_digest": "sha256:6a5a31b1ced50e9a70ae51a7e12b7fc7505d9aa0546ed60561127868dff1ca2b",
          "worktree_digest": "sha256:6a5a31b1ced50e9a70ae51a7e12b7fc7505d9aa0546ed60561127868dff1ca2b",
          "untracked_digest": "absent"
        },
        {
          "path": "api/core/database/resource_budget.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:42cfd62556e1c8cd66852bc0593b4ba7ec5be7546d5bd42bf4e82cd43780e0f4",
          "index_digest": "sha256:42cfd62556e1c8cd66852bc0593b4ba7ec5be7546d5bd42bf4e82cd43780e0f4",
          "worktree_digest": "sha256:42cfd62556e1c8cd66852bc0593b4ba7ec5be7546d5bd42bf4e82cd43780e0f4",
          "untracked_digest": "absent"
        },
        {
          "path": "api/core/services/ai_agent_tools.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:e20e24df11be99435a5da195d31b33a2865ecf1e06f51865e378fc9dabcca4c6",
          "index_digest": "sha256:e20e24df11be99435a5da195d31b33a2865ecf1e06f51865e378fc9dabcca4c6",
          "worktree_digest": "sha256:e20e24df11be99435a5da195d31b33a2865ecf1e06f51865e378fc9dabcca4c6",
          "untracked_digest": "absent"
        },
        {
          "path": "api/main.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:00c32e972c97e8163f6ad9078d13b8581cd8bc8d59ab950a9f30bc2089854273",
          "index_digest": "sha256:00c32e972c97e8163f6ad9078d13b8581cd8bc8d59ab950a9f30bc2089854273",
          "worktree_digest": "sha256:00c32e972c97e8163f6ad9078d13b8581cd8bc8d59ab950a9f30bc2089854273",
          "untracked_digest": "absent"
        },
        {
          "path": "api/routers/duckdb_query.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:219fa29775fb84804baefbc435edd3269c79a5661089a69a021155fce7f89768",
          "index_digest": "sha256:219fa29775fb84804baefbc435edd3269c79a5661089a69a021155fce7f89768",
          "worktree_digest": "sha256:219fa29775fb84804baefbc435edd3269c79a5661089a69a021155fce7f89768",
          "untracked_digest": "absent"
        },
        {
          "path": "api/routers/query_export.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:2de9b12c27546d34ccb804e5925f7ef37b4c3606a407f05a367b9a7a189a2d67",
          "index_digest": "sha256:2de9b12c27546d34ccb804e5925f7ef37b4c3606a407f05a367b9a7a189a2d67",
          "worktree_digest": "sha256:2de9b12c27546d34ccb804e5925f7ef37b4c3606a407f05a367b9a7a189a2d67",
          "untracked_digest": "absent"
        },
        {
          "path": "api/tests/conftest.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:de200993feb2ed3744b74a5f58e30f3dbc9d121701c2a3c0c089df35cc102e7b",
          "index_digest": "sha256:de200993feb2ed3744b74a5f58e30f3dbc9d121701c2a3c0c089df35cc102e7b",
          "worktree_digest": "sha256:de200993feb2ed3744b74a5f58e30f3dbc9d121701c2a3c0c089df35cc102e7b",
          "untracked_digest": "absent"
        },
        {
          "path": "api/tests/test_decimal_fetch_precision.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:81a9a842e712c1cfc2cd59493cdccf7c33971f7c38f031a8c5e3a39ea177d8f6",
          "index_digest": "sha256:81a9a842e712c1cfc2cd59493cdccf7c33971f7c38f031a8c5e3a39ea177d8f6",
          "worktree_digest": "sha256:81a9a842e712c1cfc2cd59493cdccf7c33971f7c38f031a8c5e3a39ea177d8f6",
          "untracked_digest": "absent"
        },
        {
          "path": "api/tests/test_duckdb_capability_contract.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:306ba25178e6a29ed0fd8bbf911e5eb01ac7f0aff336de262d7aa41ef685eb76",
          "index_digest": "sha256:306ba25178e6a29ed0fd8bbf911e5eb01ac7f0aff336de262d7aa41ef685eb76",
          "worktree_digest": "sha256:306ba25178e6a29ed0fd8bbf911e5eb01ac7f0aff336de262d7aa41ef685eb76",
          "untracked_digest": "absent"
        },
        {
          "path": "api/tests/test_duckdb_v2_features.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:8835df29f10a95409496c7d8b2fb0e8f6b2816ef0b3aad6e53a806b2f8769eb0",
          "index_digest": "sha256:8835df29f10a95409496c7d8b2fb0e8f6b2816ef0b3aad6e53a806b2f8769eb0",
          "worktree_digest": "sha256:8835df29f10a95409496c7d8b2fb0e8f6b2816ef0b3aad6e53a806b2f8769eb0",
          "untracked_digest": "absent"
        },
        {
          "path": "api/tests/test_federated_attach.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:4a23f9f6ef2e0f3c85d94ec2fbb2f1ec39356177b5c62e5ef252057860d0aca6",
          "index_digest": "sha256:4a23f9f6ef2e0f3c85d94ec2fbb2f1ec39356177b5c62e5ef252057860d0aca6",
          "worktree_digest": "sha256:4a23f9f6ef2e0f3c85d94ec2fbb2f1ec39356177b5c62e5ef252057860d0aca6",
          "untracked_digest": "absent"
        },
        {
          "path": "api/tests/test_query_export.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:a4c5aec7c15029418411b591dcd18bc4d40b658e7981d68f0703f85a20738ed1",
          "index_digest": "sha256:a4c5aec7c15029418411b591dcd18bc4d40b658e7981d68f0703f85a20738ed1",
          "worktree_digest": "sha256:a4c5aec7c15029418411b591dcd18bc4d40b658e7981d68f0703f85a20738ed1",
          "untracked_digest": "absent"
        },
        {
          "path": "api/tests/test_sql_error_location.py",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:d570bdee618a5fb92367724d96f0880b51848a2e899c343f3a61a7050b6ae791",
          "index_digest": "sha256:d570bdee618a5fb92367724d96f0880b51848a2e899c343f3a61a7050b6ae791",
          "worktree_digest": "sha256:d570bdee618a5fb92367724d96f0880b51848a2e899c343f3a61a7050b6ae791",
          "untracked_digest": "absent"
        },
        {
          "path": "docs/API_CONTRACT_FE_BE.md",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:181e79bccb57ab28dbb5e35ecf4dcd041720a961eb2000308fd771f8c3142a93",
          "index_digest": "sha256:181e79bccb57ab28dbb5e35ecf4dcd041720a961eb2000308fd771f8c3142a93",
          "worktree_digest": "sha256:181e79bccb57ab28dbb5e35ecf4dcd041720a961eb2000308fd771f8c3142a93",
          "untracked_digest": "absent"
        },
        {
          "path": "docs/ARCHITECTURE_CALL_MAP.md",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:930b7d587f673695e4ef10f7276075c2e0c10b2fcd5571e305a7f4eab496ed9f",
          "index_digest": "sha256:930b7d587f673695e4ef10f7276075c2e0c10b2fcd5571e305a7f4eab496ed9f",
          "worktree_digest": "sha256:930b7d587f673695e4ef10f7276075c2e0c10b2fcd5571e305a7f4eab496ed9f",
          "untracked_digest": "absent"
        },
        {
          "path": "frontend/package-lock.json",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:021adcd6e90814f223bc99d95e02db56aa3961893460f1970ee4c7a4c9864d67",
          "index_digest": "sha256:021adcd6e90814f223bc99d95e02db56aa3961893460f1970ee4c7a4c9864d67",
          "worktree_digest": "sha256:021adcd6e90814f223bc99d95e02db56aa3961893460f1970ee4c7a4c9864d67",
          "untracked_digest": "absent"
        },
        {
          "path": "frontend/package.json",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:242efe8ccfa7bede736300b5c2f7eaf86e20abd13582c811648585d5156d11b4",
          "index_digest": "sha256:242efe8ccfa7bede736300b5c2f7eaf86e20abd13582c811648585d5156d11b4",
          "worktree_digest": "sha256:242efe8ccfa7bede736300b5c2f7eaf86e20abd13582c811648585d5156d11b4",
          "untracked_digest": "absent"
        },
        {
          "path": "frontend/src/Query/DataGrid/components/JsonCellViewerDialog.tsx",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:e2e909245d82158862645b3e8c49b36d0b2070fa9905aeb96aa6599e286d9142",
          "index_digest": "sha256:e2e909245d82158862645b3e8c49b36d0b2070fa9905aeb96aa6599e286d9142",
          "worktree_digest": "sha256:e2e909245d82158862645b3e8c49b36d0b2070fa9905aeb96aa6599e286d9142",
          "untracked_digest": "absent"
        },
        {
          "path": "frontend/src/Query/DataGrid/utils/__tests__/jsonCell.test.ts",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:6e1949e6d83283ca2df67a96610ef3ede2765c2ea84317438551ea45b4bd9afd",
          "index_digest": "sha256:6e1949e6d83283ca2df67a96610ef3ede2765c2ea84317438551ea45b4bd9afd",
          "worktree_digest": "sha256:6e1949e6d83283ca2df67a96610ef3ede2765c2ea84317438551ea45b4bd9afd",
          "untracked_digest": "absent"
        },
        {
          "path": "frontend/src/Query/DataGrid/utils/jsonCell.ts",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:c5f26ee30b04cb9c2b507a44a44383a934a00ff870738d7b3e6a7ce658bb1bdd",
          "index_digest": "sha256:c5f26ee30b04cb9c2b507a44a44383a934a00ff870738d7b3e6a7ce658bb1bdd",
          "worktree_digest": "sha256:c5f26ee30b04cb9c2b507a44a44383a934a00ff870738d7b3e6a7ce658bb1bdd",
          "untracked_digest": "absent"
        },
        {
          "path": "frontend/src/Query/SQLQuery/SQLEditor.tsx",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:6d2daa18c331f324186f6b0d402e6a2f3b51b7ec1ec53f6c6a820e81dc4a6256",
          "index_digest": "sha256:6d2daa18c331f324186f6b0d402e6a2f3b51b7ec1ec53f6c6a820e81dc4a6256",
          "worktree_digest": "sha256:6d2daa18c331f324186f6b0d402e6a2f3b51b7ec1ec53f6c6a820e81dc4a6256",
          "untracked_digest": "absent"
        },
        {
          "path": "frontend/src/Query/SQLQuery/sqlDialect.ts",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:4ad49324ded16a3972d2159b8a3678e3d33b64263e9c6b386a67b47677f5459c",
          "index_digest": "sha256:4ad49324ded16a3972d2159b8a3678e3d33b64263e9c6b386a67b47677f5459c",
          "worktree_digest": "sha256:4ad49324ded16a3972d2159b8a3678e3d33b64263e9c6b386a67b47677f5459c",
          "untracked_digest": "absent"
        },
        {
          "path": "frontend/src/Settings/StorageUpgradeSettings.tsx",
          "object_kind": {
            "head": "regular",
            "index": "regular",
            "worktree": "regular",
            "untracked": "absent"
          },
          "state": "clean",
          "rename_from": null,
          "rename_to": null,
          "head_digest": "sha256:4f0799c50ad4faa0ca86fec563d38dbba1df100a2efb018d4aab9db3857b2bd7",
          "index_digest": "sha256:4f0799c50ad4faa0ca86fec563d38dbba1df100a2efb018d4aab9db3857b2bd7",
          "worktree_digest": "sha256:4f0799c50ad4faa0ca86fec563d38dbba1df100a2efb018d4aab9db3857b2bd7",
          "untracked_digest": "absent"
        }
      ]
    },
    "primary_symbols": [
      {
        "symbol": "fetch_query_records",
        "file": "api/core/database/duckdb_engine.py",
        "lines": "482-593",
        "role": "单次执行、精度、类型、重试"
      },
      {
        "symbol": "optimize_federated_sql",
        "file": "api/core/database/federated_optimizer.py",
        "lines": "334-384",
        "role": "现有应用下推及建议"
      },
      {
        "symbol": "execute_sql_and_persist",
        "file": "api/core/database/federated_attach.py",
        "lines": "306-400",
        "role": "本地staging和原子替换"
      },
      {
        "symbol": "_execute_guarded",
        "file": "api/core/services/ai_agent_tools.py",
        "lines": "453-530",
        "role": "AI独立授权/查询链路"
      },
      {
        "symbol": "build_capability_contract",
        "file": "api/core/common/duckdb_capabilities.py",
        "lines": "47-175",
        "role": "能力声明与版本门控"
      }
    ],
    "related_symbols": [
      {
        "symbol": "mysql_remote_cancellation_scope",
        "relationship": "called by synchronous federated execution",
        "relevance": "固定远端会话，注册KILL QUERY"
      },
      {
        "symbol": "ConnectionRegistry.register_remote_interrupt",
        "relationship": "CALLS",
        "relevance": "当前只追加回调，需按attempt生命周期清理"
      },
      {
        "symbol": "parse_sql_error_location",
        "relationship": "CALLS",
        "relevance": "当前只从文本caret解析"
      },
      {
        "symbol": "toFormattedJson",
        "relationship": "called by JsonCellViewerDialog",
        "relevance": "已复现JSON数字损失"
      },
      {
        "symbol": "_apply_perf_and_remote_settings",
        "relationship": "called by normal/fallback configuration",
        "relevance": "安全基线需要同时覆盖两种配置路径"
      }
    ],
    "execution_path": [
      "检查原始SQL和授权",
      "应用预览/保存行数选择",
      "选择经验证的运行策略",
      "ATTACH并绑定取消/截止时间",
      "准备结果类型且不重放查询体",
      "执行一次到预览或本地staging/COPY",
      "核验取消状态和类型",
      "提交/发布本地结果",
      "清理远端回调/事务/ATTACH/临时产物并归还或丢弃连接"
    ],
    "pdg_constraints": [],
    "architectural_patterns": [
      {
        "pattern": "后端统一响应，前端barrel+TanStack Query",
        "example_location": "docs/API_CONTRACT_FE_BE.md",
        "usage_guidance": "先契约后实现；不改normalizeResponse语义"
      },
      {
        "pattern": "临时表+事务替换",
        "example_location": "api/core/database/federated_attach.py:306",
        "usage_guidance": "禁止CONNECT包裹本地CTAS/COPY"
      },
      {
        "pattern": "JSON文本传输/Decimal字符串",
        "example_location": "api/core/common/utils.py:134",
        "usage_guidance": "不得转换为JS Number后再格式化"
      }
    ],
    "files_to_modify": [
      {
        "file": "api/core/common/duckdb_capabilities.py",
        "symbols": [
          "build_capability_contract"
        ],
        "intended_change": "拆分能力、扩展build身份、语义验证状态"
      },
      {
        "file": "api/core/database/duckdb_engine.py",
        "symbols": [
          "fetch_query_records",
          "_apply_perf_and_remote_settings"
        ],
        "intended_change": "当前构建安全基线、执行类型一致和非重放元数据"
      },
      {
        "file": "api/core/database/federated_optimizer.py",
        "symbols": [
          "optimize_federated_sql"
        ],
        "intended_change": "复用官方能力、受限typed adapter、保留半连接和建议"
      },
      {
        "file": "api/core/database/federated_attach.py",
        "symbols": [
          "execute_sql_and_persist",
          "mysql_remote_cancellation_scope"
        ],
        "intended_change": "统一策略接入、本地原子性与attempt取消生命周期"
      },
      {
        "file": "api/core/database/connection_registry.py",
        "symbols": [
          "register_remote_interrupt",
          "interrupt_with_remote"
        ],
        "intended_change": "attempt回调释放、区分取消请求与完成"
      },
      {
        "file": "api/core/common/sql_error_location.py",
        "symbols": [
          "parse_sql_error_location"
        ],
        "intended_change": "官方JSON错误解析+UTF8位置换算+旧文本兜底"
      },
      {
        "file": "frontend/src/Query/DataGrid/utils/jsonCell.ts",
        "symbols": [
          "toFormattedJson"
        ],
        "intended_change": "jsonc-parser文本格式化、保真原文"
      },
      {
        "file": "frontend/src/Query/DataGrid/components/JsonCellViewerDialog.tsx",
        "symbols": [
          "JsonCellViewerDialog"
        ],
        "intended_change": "复制原文、路径提取、限制超大展示"
      },
      {
        "file": "frontend/src/Query/SQLQuery/SQLEditor.tsx",
        "symbols": [],
        "intended_change": "仅同一SQL版本应用诊断，UTF16范围"
      },
      {
        "file": "api/core/database/query_execution_policy.py",
        "symbols": [],
        "intended_change": "拟新增：轻量运行策略/执行上下文，名称为方案建议而非已有实现"
      }
    ],
    "tests": [
      {
        "file": "api/tests/test_federated_optimizer_integration.py",
        "scenarios": [
          "改为增加真实MySQL/Postgres矩阵；不能用DuckDB模拟结果冒充远端证据"
        ]
      },
      {
        "file": "api/tests/test_decimal_fetch_precision.py",
        "scenarios": [
          "实测decimal sum失真与类型误报",
          "typed SUM溢出必须报错而非截断",
          "不重复执行查询体"
        ]
      },
      {
        "file": "api/tests/test_federated_attach.py",
        "scenarios": [
          "staging失败/取消/空结果/事务替换保持旧表",
          "重复重试与回调清理"
        ]
      },
      {
        "file": "api/tests/test_query_export.py",
        "scenarios": [
          "本地文件目的地、只执行一次、取消清理"
        ]
      },
      {
        "file": "api/tests/test_sql_error_location.py",
        "scenarios": [
          "JSON/text混合错误、UTF8转UTF16、原SQL重写映射"
        ]
      },
      {
        "file": "frontend/src/Query/DataGrid/utils/__tests__/jsonCell.test.ts",
        "scenarios": [
          "大整数/精确小数/科学记数法/重复键/长文本词元保真"
        ]
      },
      {
        "file": "api/tests/conftest.py",
        "scenarios": [
          "隔离配置和数据；关闭fixture连接及全局池后退出无本次复现警告"
        ]
      }
    ],
    "verification_commands": [
      "cd api && ../.venv/bin/python -m pytest tests -q",
      "cd api && ../.venv/bin/python -m pylint --rcfile=.pylintrc routers/ core/ models/ utils/ services/",
      "cd frontend && npm run lint",
      "cd frontend && npm run typecheck",
      "cd frontend && npm run test",
      "cd frontend && npm run build",
      "cd mcp && ../.venv/bin/python -m pytest tests -q",
      "npx gitnexus detect-changes --help (实施提交前按当前CLI schema选择范围)"
    ],
    "risks": [
      "原生remote_pushdown在当前MySQL构建已激活且存在Decimal损失",
      "图谱同HEAD但provenance未知、scope-extraction-unverified、无PDG",
      "远端取消必须真实命中同一会话",
      "禁止将DESCRIBE元数据当作实际返回值类型保证",
      "JSON格式化不能修改数值"
    ],
    "assumptions": [
      "native mysql_scanner=1b7a31b95b / postgres_scanner=c91ea57793为本次本机加载版本；冻结包必须另核验",
      "jsonc-parser3.3.1只在临时目录实验；实施时添加前端直接依赖和lock",
      "MySQL8.4/Postgres18.4仅代表已测试样本，不代表全部支持版本"
    ],
    "open_questions": [
      "全版本/平台矩阵、压力/断线/多连接取消竞态尚需实施期测试；有具体失败策略见§8/§12",
      "类型受限的远端聚合适配器对溢出/NaN/NULL/排序需全部通过才能纳入自动策略"
    ],
    "avoid": [
      "不要重复全仓探索",
      "不把CONNECT放进普通用户执行链",
      "不把官方主分支源码当作当前二进制能力",
      "不忽略复现精度错误继续启用native aggregate",
      "不全局替换AI AST guard",
      "不改变透视/集合/缓存刷新语义",
      "不新增执行模式UI",
      "不抑制nanobind日志代替关闭连接",
      "不把GitNexus LOW当成无风险保证",
      "不改现有业务数据或真实连接配置"
    ]
  }
}
```

## 12. Assumptions and Open Questions

### 已有明确决策，不交给实施者猜
- 不新增用户执行模式；普通链路不采用CONNECT；Quack等本期不支持。
- 当前MySQL Decimal原生聚合必须修复/阻止，不能沿用未经验证的自动策略。
- 先用官方接口、精度约束和既有生命周期原语；不自建泛用SQL优化器，不对未知SQL做正则重写。
- 官方主分支显示的能力只是选型依据，当前加载扩展实测才决定启用。

### 有验证任务与失败处理的剩余问题
1. typed DECIMAL SUM/AVG溢出：在真实MySQL按边界值对拍；不等价则该类别固定本地计算，本版仍交付精度正确的查询。
2. PostgreSQL全类型自动转译：当前仅允许证明等价子集；其余ATTACH。通用原生下推标记未验证/不支持，不通过CONNECT冒充完成。
3. 并发取消/网络分区：按§8注入，核验服务端会话与本地终态；不确定时不得发布结果，不能只把UI设为已取消。
4. 支持的数据库版本/平台：本轮实测MySQL8.4、PG18.4和本机扩展。最终支持表按产品已声明版本补测，不凭本次样本扩大声明。
5. nanobind：E13消除了能力测试警告；全套测试、桌面启动/退出仍须检查。若最小完全关闭连接程序仍复现，再形成上游报告/固定修复版本；不直接屏蔽警告。
6. GitNexus provenance/PDG：本次无PDG、不具完整证明力。实施环境需要更深图证据时，在确认runner来源后index-only刷新；不阻止已由源码及运行实验确认的修复方案。
7. JSON字段SQL来源：没有可信列来源的结果只提供保真查看和复制路径；不猜原表。无需向普通用户新增配置。

相邻的组件风格存量、前端深路径导入存量、全面AI AST迁移、对象存储产品入口、Trigger/Quack服务管理，不纳入本版，避免借修缺陷扩成全仓重构。

## 13. Definition of Done

- E1、E4、E5对应缺陷有先失败后通过的回归，精确数字逐位相同，实际类型与API一致。
- E9的本地/远端目的地隔离有测试；所有保存/导出失败与取消保留原数据并清理临时产物。
- 每次用户操作的远端查询体执行次数有证据；无元数据重放、无未知状态自动重试。
- 取消与截止时间覆盖所有已启用入口；重试attempt不遗留杀错会话的回调。
- 结构化与文本错误均可读，中文/emoji/改写SQL定位正确或诚实不标记。
- 能力表与实际engine/extension/platform、AI/MCP门控和前端说明一致。
- 用户运行步骤不增加，透视/集合/图表/缓存刷新没有回归。
- 后端、前端、MCP规定检查及真实远端矩阵通过；Docker/冻结包/Demo分别报告实际状态。
- 高风险改动有当前impact，提交前detect_changes无计划外扩散。
- 不能完成语义验证的优化明确保持关闭，但本版基础查询必须可用且正确；不得把已发现缺陷以“后续再看”结案。

### 方案二次复查记录

已将以下容易在实施中才暴露的问题写成约束：MySQL取消scope与落表事务不能嵌套BEGIN；安全基线必须在可配置设置之后应用；原SQL的预览限制不能污染全量保存；用户显式远端方言与应用自动生成SQL分开；内部排序序号不得泄露；精度问题必须在远端转换或保留本地计算，不能取回DOUBLE后补救。

### 官方选型依据（已查阅；不等价于当前二进制保证）

- [DuckDB RemotePushdownOptimizer PR #22914](https://github.com/duckdb/duckdb/pull/22914)：自动下推与CONNECT分开，支持子树/本地函数等边界。
- [MySQL官方扩展源码](https://raw.githubusercontent.com/duckdb/duckdb-mysql/main/src/storage/mysql_catalog.cpp)、[能力声明](https://raw.githubusercontent.com/duckdb/duckdb-mysql/main/src/include/storage/mysql_catalog.hpp)：原生SQL序列化与支持能力。
- [PostgreSQL官方扩展能力声明](https://raw.githubusercontent.com/duckdb/duckdb-postgres/main/src/include/storage/postgres_catalog.hpp)：CONNECT支持不能推导QueryNode下推。
- [MySQL扩展文档](https://duckdb.org/docs/current/core_extensions/mysql)、[Postgres函数文档](https://duckdb.org/docs/current/core_extensions/postgres/functions)：官方query表函数，非泛用语义等价证明。
- [DuckDB errors_as_json](https://duckdb.org/docs/current/configuration/pragmas#returning-errors-as-json)：机器可读错误。
- [Microsoft jsonc-parser](https://github.com/microsoft/node-jsonc-parser)：基于文本edit/offset的格式化与路径；本次3.3.1实测保真。
- [PostgreSQL statement_timeout](https://www.postgresql.org/docs/current/runtime-config-client.html)、[MySQL执行时间提示](https://dev.mysql.com/doc/refman/8.4/en/optimizer-hints.html)：服务端截止时间原语。
- [DuckDB Alpha说明](https://duckdb.org/2026/09/02/try-duckdb-20-alpha)：产品2.0与引擎Preview阶段分开。
