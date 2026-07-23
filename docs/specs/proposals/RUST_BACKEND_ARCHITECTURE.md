# Rust 后端迁移架构设计（v1，提案）

> 2026-07-22。基于 8 个子系统深读 + Rust 生态调研 + 5 份独立调查/对抗评审产出。
> 方法论对标前端返工教训：**选型先冻结、风险项过 spike 门禁后才动工、设计阶段完成对抗评审**。
> 本文是提案，未开工。配套评审原始报告见会话产出（reads/ecosystem/critique + 5 份架构评审）。

## 0. 部署形态：一套 workspace，两个产物

- **桌面**：`frontend/src-tauri` 依赖 `dq-server`（lib），axum **进程内嵌**。PyInstaller sidecar 整体退役（130MB → 预计 App 总体积 ~55–70MB）。
- **Docker**：`dq-server`（bin）独立进程，行为对齐今日 `uvicorn main:app`，多阶段 `cargo build` + 扩展预装。
- **不迁**：`mcp/`（纯 httpx HTTP 客户端，855 行）保持 Python；`runtime.json` 发现协议不变。
- **前端零改动**：API 信封逐字节兼容（见 §4 序列化兼容层）。现有 pytest 中 HTTP 层测试保留为 Python 黑盒回归网，直接打向 Rust 服务。

## 1. Workspace：10 crate DAG

```
dq-types      叶 crate：DTO(models/*)、错误码/MessageCode、信封+格式化器(§4)、
              paths(平台目录/runtime.json/secret.key 路径)、Fernet 原语、
              duckdb_types 白名单、sql_identifiers、connection_alias、SSRF 守卫纯逻辑
   ↑
dq-config     config_manager：JSONC 手写注释剥离器 1:1 移植(URL 启发式非标准，任何库不兼容)、
              schema v1→v2 迁移
dq-security   统一的凭据加密(Fernet 包装 + XOR 双密钥回退)、上传校验
dq-sqlrewrite sqlparser-rs(DuckDbDialect)：语句分类/LIMIT 注入(query_sql_utils)、
              联邦半连接下推(owned-tree 递归变换重写，feature flag 可关)、
              federated_time_bound、sql_mysql_quotes、pivot/set-op 生成器(纯 SQL 文本，1061 行)、
              join SQL 构建(从 join_query.py 全新抽取——Python 侧无独立模块)、
              _assert_safe_predicate 单语句解析守卫(安全控制)
   ↑
dq-engine     pool、duckdb_engine、metadata_manager、database_manager、federated_attach、
              connection_registry、table_metadata_cache/service、duckdb_recovery/storage、
              query_metrics、datasource_aggregator、扩展安装器；
              introspection 子模块(database_tables 的 1255 行原生 mysql/pg 内省，feature 隔离重驱动依赖)
   ↑
dq-ingest     file_utils、excel_import_manager、file_datasource_manager、ingestion_precision、
              rows_ingest、import_mode、encoding_utils、file_ingestion_service、resource_manager
dq-tasks      task_manager + task_utils + async_tasks 业务逻辑(状态机/看门狗/写冲突重试/
              cleanup_old_files/_discard_persisted_result)；**统一 set_operations 导出栈**(§6 决策#1)
dq-ai         llm client/providers、nl2sql、catalog builder(从 ai.py router 内抽出)、容错 JSON 提取
   ↑
dq-api        axum handlers(22 routers)、RequestIdMiddleware(tower Layer，三方耦合：header ↔
              handler 可见(request extension) ↔ sync:{id} 取消注册)、异常→信封映射、enhanced_error_handler
   ↑
dq-server     lib+bin：可重入 bootstrap、生命周期编排、cleanup_scheduler 定时器、
              runtime.json 写入、端口预绑定、shutdown 编排(§3)
```

**engine↔ingest 环的解法**（评审确认 Python 现状是真双向依赖，Cargo 无法表达）：
`federated_attach` 只做 ATTACH+CTAS；「把联邦 CTAS 结果登记为 file datasource」上移到调用方
（dq-api 层编排，调 dq-ingest 完成登记）。`federated_attach.py:284-286` 的延迟反向 import 就此消除。
备选（若调用点过多）：dq-types 定义 trait、dq-ingest 实现、dq-api 装配。

**Python 分层规则映射**：`check_layer_constraints.py` 的 foundation<common<{database,security,data}<services
由 crate DAG 在编译期强制（比 pylint 更严）。Python 为绕层规则造的 3 份 Fernet 副本
（security/encryption.py、common/crypto.py、foundation/crypto_utils.py）合并为 1 份：
原语下沉 dq-types，dq-config 与 dq-security 共同依赖。

## 2. 冻结选型清单（2026-07 审计版本，锁定后不换）

| crate | 版本 | 角色 | 关键风险备注 |
|---|---|---|---|
| tokio | 1.53.1 | 运行时 | — |
| axum | 0.8.9 | HTTP | — |
| tower / tower-http | 0.5.3 / 0.7.0 | 中间件 | **默认 body limit 2MB 必须放开**（上传无上限，对齐 Python） |
| serde / serde_json | 1.0.229 / 1.0.151 | DTO/信封 | 浮点/日期时间不能用默认序列化（§4） |
| duckdb (duckdb-rs) | 1.10504.0（内嵌 DuckDB 1.5.4） | 引擎 | bundled 无 ICU（运行时 INSTALL icu）；C++17 工具链进 CI；Interrupt 错误按消息文本匹配 |
| sqlparser | 0.62.0 | SQL 解析 | 仅 parser 非 transpiler；**不赌 polyglot/sqlglot-rust**（太年轻） |
| calamine | 0.36.0 | Excel 读 | 原生 crate 有合并单元格（v0.26+），比 python-calamine 0.6.2 强 |
| zip | 8.6.0（勿用 9.0.0-pre） | xlsx 修复层容器读写 | MSRV 1.88 |
| quick-xml | 0.41.0 | xlsx XML 修复 | 先用真实损坏样本验证该层是否仍需要 |
| chardetng / encoding_rs | 1.0.0 / 0.8.35 | 编码探测/转换 | GBK/BIG5/Shift-JIS 手调覆盖表 1:1 移植在其上 |
| infer | 0.22.0 | 文件类型嗅探 | 覆盖本应用格式面足够 |
| reqwest | 0.13.4 | HTTP 客户端 | 确认默认拾取 HTTP(S)_PROXY/NO_PROXY（下载器 + LLM 调用都依赖） |
| rustls + rustls-platform-verifier | 0.23.42 + 0.7.0 | TLS | **用 OS 信任库**：同时修复 PyInstaller CA 定位 bug 与企业 MITM 盲区（certifi 现状两者都盲） |
| flate2 | 1.1.9 | 扩展下载 gunzip | — |
| nix (feature=fs) | 0.31.3 | mkfifo 流式上传 | Windows 走既有「拼接后整体导入」独立路径（非降级 FIFO） |
| tracing / tracing-appender | 0.1.44 / 0.2.5 | 日志/诊断 | 双 sink：环形缓冲(BackendDiag) + engine-stderr.log(4MB 截断) |
| thiserror / anyhow | 2.0.19 / 1.0.104 | 错误 | 库 crate 用 thiserror，bin/装配用 anyhow |
| sysinfo | 0.39.6 | psutil 替代 | 仅 2 个调用点：75% 内存上限、父进程存活 |
| base64 | 0.22.1 | 加密载荷 | — |
| fernet | 0.2.2 | Fernet 解密兼容 | 2 年未更但规范冻结；**必须过 S2 门禁**（真实 system.db 解密）；可 vendor |
| **已否决** | | | actix-web/poem、r2d2/deadpool（三态机+中断丢弃语义装不进）、figment/config-rs/json5（JSONC 启发式非标准）、rust_xlsxwriter（xlsx 写由 DuckDB excel 扩展 COPY 完成）、native-tls/openssl（回到平台链接地狱）、polyglot（6 个月大单维护者） |

## 3. 运行时设计定案（对抗评审修正后）

1. **线程模型**：tokio Runtime 起在独立 OS 线程；`tauri::Builder::run()` 独占主线程，永不 `block_on`（错则 UI 冻死）。
2. **DuckDB 连接**：每个库文件 `Connection::open` **一次**，池成员一律 `try_clone()`（已证实共享 DatabaseHandle；重复 open(path) 是否共享实例未证实，禁止）。system.db 用单连接+互斥锁（非池），对齐 Python。
3. **所有 duckdb 调用包 `spawn_blocking`**；阻塞并发天然被池上限(默认 10)约束，非 tokio 512 线程池问题。
4. **池**：手写。**单一 RAII guard 同时拥有 semaphore permit 与连接槽**，permit 获取与槽预留在同一临界区完成，Drop 是唯一的 permit 释放点；中断→丢弃不回池、惰性补充；debug 断言 `permits+busy==max`；过 S5 拷打测试。（评审 BLOCKER：双路径改容量必然出双释放或永久泄漏）
5. **锁全用 `parking_lot::Mutex`**（不可毒化）+ spawn_blocking 闭包 `catch_unwind`。（评审 BLOCKER：std Mutex 毒化在进程内嵌模型下无「杀子进程重来」的退路）
6. **错误分类按消息子串**：`_CONNECTION_FATAL_MARKERS` 与 InterruptException 匹配逻辑逐字移植（duckdb-rs 中断错误本就只有消息文本，同一习语）。
7. **connection_registry**：保留 `remote_interrupts` 回调列表（联邦查询取消远端）；`interrupt()` 上抛 / `interrupt_all()` 吞错计数——两种失败语义刻意不同，保持。
8. **关停顺序（进程内嵌重设计，评审 BLOCKER）**：interrupt_all → 停止收新请求 → drain → pool close_all（WAL checkpoint）→ 退出。挂到 `WindowEvent::CloseRequested`（prevent_default + 异步清理后真关）；**硬退出看门狗跑在独立 OS 线程**（3s，不能在可能被卡死的 tokio runtime 里）。这是 WAL .broken 数据丢失事故（memory: duckdb-desktop-failure-forensics）的防线，不是清理项。
9. **restart 语义**：`dq-server::bootstrap` 必须**可重入/幂等**（前端「重试」= 进程内重跑 bootstrap；禁 OnceCell 池单例）。upload_sessions / _install_state / connection_registry 三个内存表在 restart 时**显式清空**（sidecar 时代靠杀进程免费获得，现在要主动做）。
10. **存活探测**：健康 AtomicBool + 任务 panic 钩子；`backend_state()` 汇报内嵌服务健康而非进程存活（否则内嵌 server 静默死掉仍报 alive，比现状还差）。
11. **端口预绑定**：保留「先绑端口再做可能耗时的初始化（WAL 重放）」纪律；PyInstaller 慢启动相关部分（bind-hold-no-listen 全套）有意识简化；parent watchdog 按设计删除。

## 4. 序列化兼容层（dq-types formatters，前端零改动的前提）

评审用真实 DuckDB 会话逐项实证，serde_json 默认行为全部不兼容，必须自建格式化器 + 字节级 golden fixtures：

| # | 项 | Python 实际行为 | 定案 |
|---|---|---|---|
| F1 | float | `json.dumps(1e20)` → `1e+20`（CPython repr 切换规则：<1e-4 / ≥1e16 科学计数） | 自写 f64 格式化器复刻 repr 规则（serde_json 输出全展开小数，**BLOCKER**） |
| F2 | 单元格 datetime | 空格分隔 `%Y-%m-%d %H:%M:%S.%f`，小数尾零逐位剥、无微秒连点删 | 独立 formatter，禁止「顺手改成 ISO」 |
| F3 | 信封 timestamp | `isoformat()+Z`，T 分隔，微秒全 6 位或全无 | **两个** formatter，不合并 |
| F4 | TIMESTAMPTZ | 转 UTC 后**丢弃偏移**（无 Z 无 offset） | 保持；错了不报错只显示错时间，进 S4 |
| F5 | STRUCT/MAP/LIST | 双重编码为**字符串**，内层 `", "/": "` 带空格、外层信封紧凑无空格 | 内外两种分隔符约定分别复刻（前端按 String 处理，裸对象会静默 `[object Object]`） |
| F6 | DECIMAL | 按声明 scale 保尾零（`DECIMAL(10,2)` 的 100 → `"100.00"`） | 从 (mantissa,width,scale) 原始表示携带 scale 格式化 |

信封结构（success/error/messageCode/timestamp、错误体无顶层 detail）、~150 项 MessageCode 枚举、
`column_types[]{name,duckdb_type}` 结果形状等 20+ 项字节级契约清单见评审 mapping 报告 §2，
移植时以 `docs/API_CONTRACT_FE_BE.md` 为准绳、pytest HTTP 黑盒为裁判。

## 5. Spike 门禁（全部绿灯才开始批量移植）

| # | 门禁 | 验证内容 |
|---|---|---|
| S1 | sqlrewrite | sqlparser-rs 重写 1 条下推规则 + 语句分类 + LIMIT 注入 + _assert_safe_predicate，对 pytest fixtures 全绿；失败则当场决策砍优化器（有 bailout 语义，只损性能） |
| S2 | 加密兼容 | Rust fernet 解密**真实 system.db** 凭据；XOR v2 前缀/legacy 默认密钥双回退逐字节对齐 |
| S3 | duckdb-rs 冒烟 | 打开 Python 1.5.3 写的真实 main.db（存储格式 68 同版，低险仍须实测）；try_clone 双连接建表互见；ATTACH mysql；跨线程 interrupt；VARIANT CTAS；read_xlsx；**COPY TO (FORMAT xlsx)**（set_operations 导出路径，评审新发现）；bundled 构建下 INSTALL icu |
| S4 | 序列化字节差 | §4 六项 golden fixtures（1e16/1e-4 边界、微秒剥零、内层空格、scale、TIMESTAMPTZ） |
| S5 | 池拷打 | 并发长查询 × 并发中断，不变量断言全程成立 |
| S6 | TLS/代理 | platform-verifier 在干净 macOS 账户 + 代理环境变量直通验证（可得条件下加企业 MITM 测试） |
| S7 | 生命周期彩排 | 单进程内 bootstrap → serve → 优雅关停 → 再 bootstrap（restart 语义实证） |

## 6. 移植中需拍板的既有行为（评审揪出，保留 or 修复，逐项决策不默认）

1. **set_operations 导出是第二套不兼容任务栈**（自建 ThreadPoolExecutor、不注册 connection_registry）：**取消按钮现在就是假的**（状态翻转但线程跑完）。建议统一进 dq-tasks 状态机（顺手修复），属行为变更需确认。
2. `custom_table_name` 的异步结果表永不被 GC（`LIKE 'async_result_%'` 匹配不到）。
3. 半途而废的分块上传会话无 reaper，chunk 文件永存。
4. `join_query.py:609-619` 硬编码客户特例（uid/0711/0702、iget_uid/buyer_id CAST）——原样移植还是删除？
5. url_reader DNS 重绑定 TOCTOU 存在（校验与请求两次解析）；`get_url_info` 的 HEAD 不走代理（reqwest 会「顺手修好」，需承认这个行为变化）。
6. `/health` 硬编码 `"2025-01-18"` ——顺手修，无兼容价值。
7. **确认死代码不移植**：cache_manager(318 行)、validate_sql_query、SQLAlchemy engines 记账、join_query 死 import、main.py initialize_encryption_key（疑似死，删前 grep 部署路径确认）。
8. 三套独立 GC（resource_manager 堆调度 / cleanup_scheduler 6h 定时 / cleanup_old_files 逻辑）v1 按现状分开移植，合并留待 v2。
9. ATTACH/DETACH 防御模式 5 处近似副本 → dq-engine 统一 RAII guard（join_query 那份结构不同，合并前先验证无隐藏差异）。
10. `system_keyboard_shortcuts` 表 + `DEFAULT_SHORTCUTS` 与前端 `defaultShortcuts.ts` 的跨仓字节一致要求（Codex S-19 回归先例）进兼容契约清单。

## 7. 明确不做 / 后置

- 不赌 polyglot 等年轻 transpiler；不引 DataFusion。
- OpenAPI /docs 替代（utoipa）后置决策。
- 测试策略：pytest HTTP 黑盒保留 Python 作回归网；白盒直连内部模块的部分按 crate 补 Rust 单测，不做 1:1 全量改写。
- 自定义 pylint 插件/层级检查 → crate DAG + clippy + cargo-deny 等价物，随脚手架建立。
