# DuckQuery 2.0 / DuckDB 2.0 全面升级技术方案

> 状态：DuckQuery v2.0.0 全面启用 DuckDB 2.0 Preview 与 v2 storage；GA wheel 发布后复验  
> 日期：2026-09-04  
> 范围：Python 后端、React 前端、MCP、Docker、桌面 sidecar、浏览器 Demo  
> 基线：默认依赖 `duckdb 1.6.0.dev379` / engine `v2.0.0-alpha39998` / storage `v2.0.0`

发布策略：DuckQuery 自身升级为 2.0.0；新库只输出 v2.0.0 storage。旧库作为兼容输入由
DuckDB 2.0 原样读取，不在启动时静默改写。显式迁移后不支持直接降级到 DuckDB 1.5，
降级路径是恢复备份或导出/导入。GA wheel 发布后更新默认 pin并重跑三平台冻结包矩阵。

## 1. 目标

本次升级不以“识别一个新关键字就加一个正则”为实现方式，而是收敛三个长期稳定的边界：

1. **SQL 能力判定**：统一识别语句类型、只读性、副作用和顶层行数限制。
2. **扩展元数据**：分离 UI 名、`LOAD` 名、CDN/磁盘 artifact 名和安装来源。
3. **引擎兼容边界**：区分 Python 包版本、DuckDB 内核版本、存储版本和 Wasm 引擎版本。

后续新增 DuckDB 语法或扩展时，应通过这些边界接入，不能在同步、联邦、异步、导出、保存、AI、MCP 各写一套判断。

## 2. 非目标

本次不开放以下能力，但设计不得阻塞后续独立接入：

- Quack / `CONNECT`；
- Triggers；
- DML-in-CTE；
- `$variable` 会话变量；
- 嵌套 Schema；
- 自定义扩展仓库和任意运行时扩展语法；
- 原生 C API 模块。

`USING KEY` 不做产品入口；统一 SQL 分类完成后，手写只读查询可以安全受总 LIMIT 保护。

### 2.1 新特性决策

| 能力 | 决策 | 本次边界 |
|---|---|---|
| `APPROX NEAREST` | ✅ 做 | 支持高级用户手写 SQL；同步、联邦、异步、保存、导出和 MCP 复用统一总 LIMIT；VSS 不是依赖 |
| `FETCH FIRST/NEXT` | ✅ 做 | 识别为用户显式外层限制，前后端不再追加第二个 LIMIT |
| VARIANT + `variant_*` | ✅ 做 | 延续入湖、序列化、DataGrid JSON 查看器，并补齐编辑器词表与 2.0 回归 |
| JSON mutation | ✅ 做 | 手写 SQL 与编辑器词表支持；不新增专用 UI |
| 递归 CTE `USING KEY` | 🟡 部分做 | 手写只读 SQL 纳入统一安全/总 LIMIT；不做可视化构造器，AI 保持 fail-closed 直到 sqlglot 支持 |
| 新扩展语法能力 | ❌ 不做 | 普通查询端点禁止 INSTALL/LOAD/CALL 等副作用；扩展只能走受控目录 |
| 自定义扩展仓库 | ❌ 不做 | 当前没有可信源、签名/哈希、权限与升级回滚模型；ExtensionSpec 已预留 `source` |
| 稳定 C API | ❌ 不做 | 项目运行时只使用 Python API/Wasm；没有原生插件 ABI 消费者，新增 C 层会扩大三平台发布面而无现有收益 |
| Quack `CONNECT` | ❌ 不做 | 会话会残留在连接池并引入远端副作用，普通查询端点显式封禁 |
| MySQL/PostgreSQL 远端执行 | 🟡 按验证范围 | 不使用 `CONNECT` 切换会话；当前 MySQL 原生聚合下推存在 DECIMAL 精度回归，默认禁用并保留应用层已验证下推；真实数据库矩阵通过后才按引擎/扩展/平台放行 |
| Triggers / DML-in-CTE | ❌ 不做 | 产品查询面保持只读；无写入授权、审计和事务 UX |

## 3. 已验证事实

### 3.1 兼容矩阵

| 验证项 | 结果 |
|---|---|
| 2.0 alpha / Python 3.13（默认依赖） | 1328 passed，5 skipped |
| 2.0 alpha / Python 3.11 | CI 默认任务（待远端运行） |
| 前端全量（改造后） | 1252 passed，1 skipped |
| MCP 全量 | 77 passed，1 skipped |
| MySQL 8.4 / PostgreSQL 18.4 隔离语义矩阵 | 2 passed |
| macOS ARM64 Tauri Rust | 9 passed；`.app` 构建与深度签名校验通过 |
| Docker Python 3.12 ARM64 | 镜像构建、独立 API 启动、离线 MySQL LOAD 通过 |
| Linux ARM64 PyInstaller / Python 3.12 | 2.0 冻结包保真冒烟全部通过 |

原六个 2.0 失败均已修复：动态 Pivot 2 个、旧 JSON `->>` 错误假设 2 个、存储版本断言 1 个、无序 JSON 导出断言 1 个。连接池关停现会停止维护线程并释放共享连接，全量 pytest 退出不再打印 nanobind reference-leak warning；GA wheel 发布后仍需复跑矩阵。

### 3.2 SQL

- `APPROX NEAREST` 在 DuckDB 2.0 和 `/api/duckdb/execute` 可执行。
- SQL 工作台前端会为手写 `SELECT ... APPROX NEAREST` 增加可见总 LIMIT。
- sqlglot 30.x 不能解析 `APPROX NEAREST` 和 `USING KEY`；公共 tokenizer fallback 已让直接 API、异步、导出、保存与 MCP 统一处理外层 LIMIT。
- sqlglot 能解析 VARIANT 函数、JSON mutation 和 `FETCH FIRST`。
- 前端已同时识别 `LIMIT` 与 `FETCH FIRST/NEXT`，不会生成双重限制。
- 普通执行端点已封禁 `CONNECT`、`DISCONNECT`、`CALL`、`INSTALL`、`LOAD`、`SET`、DML-in-CTE 等副作用；仅保留本地 `main` catalog 的直接 `CREATE TABLE`。

### 3.2.1 官方大版本兼容性结论

- 2.0 默认 storage 为 `v2.0.0`；新引擎承诺向后读取旧文件，旧引擎读取新格式仅 best effort，本项目按不可降级处理。
- 旧 lambda `x -> ...` 默认禁用，统一迁移为 `lambda x: ...`；JSON `->` 运算符不受影响。
- 新 PEG parser 以兼容为目标，但错误文本与位置表达可能变化；产品只消费结构化 `sql_location`。
- 扩展二进制仍绑定 DuckDB version + platform，旧 artifact 必须拒绝并下载 v2 对应文件。
- 时区、calendar、地区 collation 由 `icu` 扩展提供；相关验证纳入扩展矩阵。
- 官方明确 alpha client 尚未 production-ready，因此 Release 必须展示 Preview 风险，GA 前不得省略完整回归。

### 3.3 扩展

- 1.5.3 扩展二进制不能被 2.0 加载。
- `LOAD mysql/postgres` 查找的文件名是 `mysql_scanner/postgres_scanner`；下载与打包已统一使用 canonical artifact 名。
- 扩展先写候选文件，以精确路径在 autoinstall=false 下 LOAD 验证，成功后才原子替换；失败不会覆盖旧文件。
- Docker 与桌面均把只读包内扩展播种到实际可写 runtime 目录，真实离线 LOAD 已验证。
- API 的 installed/loaded/version/source 全部来自 `duckdb_extensions()`；bundled 不再伪造 installed。

### 3.4 存储

- 现有 `main.db`、`system.db` 均为 `v1.5.0+`，可被 2.0 读取。
- 2.0 打开并写入现有 v1.5 文件不会自动升级格式，仍可回滚到 1.5.3。
- 2.0 以 `latest` 新建的 v2 文件不能被 1.5.3 打开。
- 2.0 以 `v1.5.0` 新建文件仍支持 VARIANT，且可被 1.5.3 打开。
- 当前迁移脚本逐表 CTAS，会丢失约束、索引、视图、序列和宏；`COPY FROM DATABASE` 可完整保留。

### 3.5 浏览器 Demo

- 当前 `@duckdb/duckdb-wasm 1.29.0` 实际内核为 `v1.1.1`。
- Demo 与 Python 后端不能共享 DuckDB 2.0 能力声明。
- Wasm 的 ARRAY/STRUCT/MAP/BLOB 已按 Arrow 顶层类型映射；其 v1.1.1 内核本身不提供后端 2.0 的 VARIANT 能力。

## 4. 架构设计

### 4.1 后端 SQL 能力判定

`GET /api/capabilities` 是唯一能力契约，当前 `contract_version=1`。每项能力分别声明
engine、direct SQL、Agent、MCP 状态及扩展依赖；调用方不得从 engine 版本号直接推断
其他执行面。Agent 将同一契约渲染进系统提示，MCP 0.4.0 暴露 `get_capabilities`。

`POST /api/sql/classify` 是远程安全分类入口。MCP 的 `run_sql` 与 `federated_query`
优先采用该结果进行确认门控；连接旧后端遇到 404 时才回退到包内保守分类。后端查询
端点仍独立执行自己的安全校验，MCP 的分类不是绕过授权的凭据。

当前能力边界：

| 能力 | 手写 SQL | Agent | MCP |
|---|---|---|---|
| `APPROX NEAREST` / `USING KEY` / `FETCH` | 支持 | 暂时阻止 | 支持 |
| VARIANT / JSON mutation / `lambda x:` | 支持 | 支持 | 支持 |
| DML-in-CTE / Triggers / `CONNECT` / 自定义扩展仓库 | 阻止 | 阻止 | 阻止 |

Agent 暂时阻止前三种新语法，是因为 sqlglot 尚不能为它们提供可靠的物理表与作用域
审计；DuckDB parser 能执行不等于可以安全放入 Agent 自动探查。这里采用显式能力降级，
不以字符串扫描替代授权检查。

新增纯后端公共模块，提供：

- 单语句解析；
- statement type；
- 只读/写入/会话变更/外部副作用分类；
- 顶层 `LIMIT` 与 `FETCH FIRST/NEXT` 探测；
- 对支持的只读查询追加默认 LIMIT；
- 移除顶层系统 LIMIT；
- sqlglot 解析失败时使用 DuckDB parser 做只读分类，使用 tokenizer 做顶层行数子句探测。

约束：

- 真正执行时 DuckDB parser 是语法权威；执行前安全门使用 fail-closed tokenizer，避免调用 `extract_statements`（部分管理语句解析阶段会触发 I/O）；
- sqlglot 仅负责其能理解的 AST 改写；
- 无法确认的顶层语句 fail-closed；
- `CONNECT`、`DISCONNECT`、`CALL` 等不进入普通查询端点；
- 前端 LIMIT 仅负责可见 UX，后端所有入口仍独立保护。

### 4.2 行数语义

保持现有契约：

- 页面无用户限制：追加 `max_query_rows`；
- 用户显式 `LIMIT` 或 `FETCH`：尊重用户值；
- `apply_row_limit=false`：移除页面外层限制，执行全量；
- `apply_row_limit=true`：保留用户限制；无用户限制时追加默认值；
- 子查询限制不等于外层限制；
- 注释、字符串、分号和多语句必须正确处理。

上述语义覆盖同步、联邦、异步、导出、保存、AI 和 MCP。

### 4.3 扩展规范

扩展定义至少包含：

- `name`：API/UI 稳定名；
- `load_name`：DuckDB `LOAD` 使用名；
- `artifact_name`：CDN 与磁盘文件名；
- `category`；
- `source`；
- `bundled`；
- `installable`；
- 中英文说明和用法。

列表状态必须来自 `duckdb_extensions()`：`installed`、`loaded`、`extension_version`、`installed_from`。`bundled` 只表示发行包声明，不能覆盖真实 `installed`。

扩展页只显示可选扩展；健康的 bundled 扩展不显示。VSS 明确为可选 HNSW 索引，不是 `APPROX NEAREST` 前置依赖。

### 4.4 存储发布

1. 新建数据库固定 storage compatibility `v2.0.0`，不用 `latest`，避免未来 2.1 静默漂移。
2. 旧文件不自动迁移；通过 `--target-storage v2.0.0` 显式选择。
3. 迁移使用 `COPY FROM DATABASE`、成套备份、验证、原子替换；备份完成后空间检查不再重复计算备份容量。
4. 第一次替换前为完整数据库集合写入并 fsync 持久化恢复标记，整套迁移成功后才清除。可捕获失败与下次启动都会从同一备份恢复数据库和 WAL；恢复失败时阻止启动。
5. dry-run 与正式执行共用文件集合预检；全部已达目标格式时不创建冗余备份。CLI 重跑会先恢复上次中断，`--only` 标记可作为应用完整配置集合的安全子集恢复。

### 4.5 前端能力

- `APPROX NEAREST`：支持高级用户手写 SQL；同步、异步、导出、保存均受现有行数语义保护。
- `FETCH FIRST/NEXT`：视为用户显式外层限制，不再追加 `LIMIT`。
- CodeMirror 补充 2.0 只读语法和 VARIANT/JSON 函数词表。
- 新 parser 错误位置通过标准错误 `details.sql_location` 传递到 Workspace，并显示为 CodeMirror diagnostic。
- Demo 独立显示 Wasm engine version；没有能力时不宣传或开放 2.0 语法。
- 检测到旧 storage 时首次启动弹出大版本提示；“暂不升级”只在当前启动生效，仅保留设置页再次升级入口，不常驻顶部横幅。
- 页面双重确认后只登记迁移标记；迁移在重启且连接池建立前执行，完成后设置页保留报告与备份位置。

## 5. 实施批次

### 批次 A：SQL 安全与行数统一

- 新增后端 SQL capability 模块；
- 同步/联邦/异步/导出/保存接入；
- 封禁会话与副作用语句；
- APPROX NEAREST 全路径行数语义；
- FETCH FIRST 前端防双 LIMIT；
- 新增跨入口测试。

状态：✅ 完成。

### 批次 B：DuckDB 2.0 兼容

- 修复动态 Pivot；
- 修正旧 JSON 错误测试和无序导出测试；
- storage compatibility 固定 v1.5；
- 重构迁移脚本为 target-aware + native database copy。

状态：✅ 新库 v2 输出与显式迁移链路完成；未迁移任何用户数据库。

### 批次 C：扩展与发布

- 通用 ExtensionSpec；
- canonical artifact 名；
- 下载后的离线验证；
- Docker seed；
- 扩展页真实状态、隐藏 bundled、TanStack Query；
- 补 API 契约和冻结包冒烟。

状态：✅ 代码、API 契约、Docker 构建与离线 LOAD 验证完成；发布工作流已切换默认 2.0 artifact，正式三平台任务在打 tag 后执行。

### 批次 D：新特性体验

- VARIANT/JSON/NEAREST 编辑器词表；
- parser 错误位置；
- Demo engine version 与能力提示；
- 中英文文档。

状态：✅ 完成。桌面 About 与浏览器 Demo 分别展示自身 engine version。

## 6. 测试矩阵

### 6.1 SQL 分类与 LIMIT

- SELECT / WITH SELECT / PIVOT / UNPIVOT / TABLE / VALUES；
- APPROX NEAREST；
- USING KEY；
- LIMIT / OFFSET / FETCH FIRST / FETCH NEXT / OFFSET FETCH；
- 子查询限制；
- 尾分号、行注释、块注释、字符串中的 `LIMIT`；
- 多语句；
- WITH DML；
- CONNECT / DISCONNECT / CALL / SET / LOAD / INSTALL / ATTACH；
- 未识别扩展语法。

### 6.2 APPROX NEAREST

- 正常结果、空表、NULL、维度不一致、非法 K；
- N×K 超过默认限制；
- 用户显式限制；
- 同步、异步、导出、保存、MCP、取消；
- AI 当前 fail-closed。

### 6.3 VARIANT

- OBJECT/ARRAY/scalar/NULL/混合结构/中文键；
- `variant_type/keys/contains`；
- JSON→VARIANT、Parquet 往返；
- malformed JSON 原子失败；
- 与 DECIMAL/HUGEINT/TIMESTAMPTZ 同结果；
- DataGrid Viewer。

### 6.4 扩展

- core/bundled/optional 分类；
- bundled 与 installed 真值分离；
- mysql/postgres canonical artifact；
- autoinstall=false 离线 LOAD；
- 下载失败、重试、并发安装；
- Docker、PyInstaller、macOS ARM/Intel、Windows。

### 6.5 存储

- v1.5 文件由 2.0 原样读取；
- v2.0.0 storage 新库；
- v2 文件拒绝 1.5；
- native copy 保留表、约束、索引、视图、序列、宏；
- 低磁盘、WAL、失败回滚和原子替换。

## 7. 验收门槛

- DuckDB 2.0 全量测试通过，且真实 v1.5 输入文件可读；
- 后端 pytest、pylint；
- 前端 lint、tsc、vitest、build；
- MCP pytest；
- Docker 与冻结包冒烟；
- 扩展在关闭 autoinstall 时可离线加载；
- GitNexus detect-changes 仅包含预期符号和执行路径；
- 未验证平台和环境必须明确列出，不能推断为通过。

## 8. 回滚

- 未迁移的旧文件仍可用原版本应用打开。
- 新建或已迁移的 v2 文件不能依赖 1.5 直接读取；回滚必须恢复升级前备份，或在 2.0 中导出后由旧版导入。
- 扩展按内核版本分目录，旧 artifact 不覆盖、不复用。
