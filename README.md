<p align="center">
  <img src="docs/assets/readme/duckq-logo.svg" alt="DuckQuery" height="80">
</p>

<h1 align="center">DuckQuery</h1>

<p align="center">
  <strong>本地文件与远程数据库，在同一条 SQL 中查询</strong><br>
  临时对账、跨源核查、数据探查——无需预先导入建表，也无需为单次分析搭建数仓。<br>
  <sub>支持直接编写 SQL，或以自然语言提问（NL-to-SQL）——结论与可复用 SQL 一并返回。</sub>
</p>

<p align="center">
  <a href="https://github.com/Chenkeliang/duckdb-query/releases/latest"><img src="https://img.shields.io/github/v/release/Chenkeliang/duckdb-query?label=Release&color=F97316" alt="最新版本"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License"></a>
  <a href="https://github.com/Chenkeliang/duckdb-query/stargazers"><img src="https://img.shields.io/github/stars/Chenkeliang/duckdb-query?label=Star&color=F97316" alt="Star 数"></a>
</p>

<p align="center">
  <a href="https://github.com/Chenkeliang/duckdb-query/releases/latest"><strong>下载稳定版</strong></a>
  · <a href="https://github.com/Chenkeliang/duckdb-query/releases">2.0 Preview 发布列表（发布后可下载）</a>
  · <a href="#立即开始">Docker 自托管</a>
  · <a href="README_en.md">English</a>
</p>

<p align="center">
  <sub>数据完全本地 · AI 使用你自己的 Key 与模型</sub>
</p>

<p align="center">
  <img src="docs/assets/readme/hero-cross-source-zh.gif" alt="DuckQuery 查询工作台执行 DuckDB 本地表与 MySQL 表的跨源 JOIN" width="900">
</p>

## 最新版：v2.0.0（全面支持 DuckDB 2.0）

本地 Docker 默认仅监听 `127.0.0.1`。需要共享访问时，在带认证的反向代理后部署；设置 `DUCKQUERY_BIND_HOST` 会改变监听范围，应用本身不提供多用户鉴权。URL 导入经过逐跳地址校验和流式大小限制；配置的 HTTP(S) 代理属于可信网络边界。

资源预算默认最多 4 个用户库连接、4GB 溢写、256MiB 磁盘余量；引擎内存最多为检测到的物理/容器内存的 75%。设置 → DuckDB 数据库存储可查看预算、检查最近备份并打开恢复指引；桌面版可打开通过检查的备份目录。不会自动恢复数据库。

> [!IMPORTANT]
> v2.0.0 的 Python 后端使用 DuckDB `v2.0.0-alpha39998`（Python 包 `1.6.0.dev379`），新数据库明确采用 `v2.0.0` storage。这是 [DuckDB 官方 2.0 Alpha](https://duckdb.org/2026/09/02/try-duckdb-20-alpha)，官方尚未将其标记为 production-ready；本版本必须按大版本升级处理。

本版新增与改进：

- 手写 SQL 支持 `APPROX NEAREST`、递归 CTE `USING KEY`、`FETCH FIRST/NEXT`、VARIANT 与 JSON mutation 函数；
- `APPROX NEAREST` 沿用工作台总 LIMIT，异步执行、保存、导出和 MCP 不会绕过行数选择；
- 修复 DuckDB 2.0 动态 Pivot 绑定错误，并将解析错误位置直接标记到 SQL 编辑器；
- 扩展管理区分 UI 名、`LOAD` 名与实际 artifact；MySQL / PostgreSQL 扩展可在关闭 autoinstall 后离线加载；
- 内置且正常的 Excel 扩展不再重复展示，缺失时仍可从扩展页修复；
- About 页分别展示应用版本、Python DuckDB 包、实际 engine 和 storage compatibility；浏览器 Demo 单独展示自己的 Wasm engine。
- Agent 与 MCP 读取同一份版本化能力契约；MCP 0.4.0 使用后端安全分类并兼容缺少该接口的旧后端。0.4.0 wheel 已附在 v2.0.0 Pre-release，PyPI 当前仍为 0.3.1。

升级注意事项：

1. 升级前必须备份 `data/duckdb/main.db`、`system.db` 与对应 `.wal`；本版不会在启动时静默迁移旧文件。
   检测到旧库时页面会显示大版本提示；可暂缓，并从“设置 → DuckDB 数据库存储”再次进入（不常驻顶部提示）。
2. DuckDB 扩展二进制按 engine 版本隔离。标准包首次使用 MySQL / PostgreSQL / HTTPFS 时可能重新下载 2.0 对应扩展；离线包已内置对应版本。
3. 新库直接使用 v2 storage；旧库可由 2.0 原样读取。显式迁移到 v2 后，DuckDB 1.5.3 不能直接打开，只能恢复升级前备份或导出/导入。
4. 浏览器 Demo 使用独立 DuckDB-Wasm，并不等同于桌面版 / Docker 的 DuckDB 2.0 后端；界面会显示各自真实版本。
5. 旧 lambda `x -> x + 1` 在 2.0 默认禁用，请改成 `lambda x: x + 1`。`CONNECT`、Triggers、DML-in-CTE、自定义扩展仓库和任意 `INSTALL/LOAD` SQL 仍未开放。

完整说明：[v2.0.0 发布说明](docs/releases/v2.0.0.md) · [DuckDB 2.0 技术方案](docs/specs/duckdb-2-compatibility-and-capabilities.md)

## 适用场景

- **可视化使用 DuckDB**：建表、导入、关联、透视、导出均在界面完成，无需编写脚本或使用命令行。
- **临时对账与数据核对**：Excel / CSV 与数据库中的业务表直接比对，无需为单次分析导入数仓。
- **跨源关联分析**：本地 Parquet / SQLite 与远端 MySQL 在同一条 SQL 中关联、聚合，定位缺失、重复与金额差异记录。
- **数值结果可信**：聚合与统计由 SQL 在 DuckDB 中执行，模型不参与数值计算，规避大模型的算术幻觉。
- **AI 编程工具接入**：以 MCP 协议向 Claude Code、Codex、Cursor 等客户端开放本机已连接的数据源，无需导出中间文件。

## 30 秒上手

| 步骤 | 说明 |
|---|---|
| **1. 接入数据** | 拖入 Excel / CSV 即生成表，或连接 MySQL / PostgreSQL / SQLite / DuckDB |
| **2. 编写 SQL 或提问** | 直接编写查询；或以自然语言提问（如「上月各城市实付金额」），确认 AI 起草的 SQL 后执行 |
| **3. 查看与导出结果** | 表格与图表切换、下钻查看明细，导出为 CSV / Excel / JSON / Parquet |

![AI 起草 SQL → 执行 → 切换为图表](docs/assets/readme/workflow-ai-chart-zh.gif)

## 核心能力

<table>
<tr>
  <th width="13%">能力</th>
  <th width="30%">典型问题</th>
  <th width="57%">功能说明</th>
</tr>
<tr>
  <td><strong>文件即表</strong></td>
  <td>单次分析不希望预先建表或搭建 ETL 流程</td>
  <td>CSV / Excel / Parquet / JSON / JSONL 拖入即建表，并支持粘贴表格、URL 导入与服务器目录读取</td>
</tr>
<tr>
  <td><strong>跨源查询</strong></td>
  <td>数据库中的业务表需要与本地文件核对</td>
  <td>MySQL / PostgreSQL / SQLite / DuckDB 连接后即可与本地表在同一条 SQL 中关联查询，大表自动下推优化</td>
</tr>
<tr>
  <td><strong>查询工作流</strong></td>
  <td>分析过程分散在 Excel、SQL 客户端与 BI 工具之间</td>
  <td>SQL 编辑器，并提供关联查询、集合运算与透视表的可视化构建；长查询异步执行、可随时取消</td>
</tr>
<tr>
  <td><strong>AI 智能问数</strong></td>
  <td>需要尽快得到结论，不希望先编写查询</td>
  <td>自然语言问数：智能体自主查看表结构、核对取值、执行只读查询后给出结论，并附可复用 SQL；同时提供报错修复、语句解释与图表推荐</td>
</tr>
<tr>
  <td><strong>结果与导出</strong></td>
  <td>查询结果需要可视化呈现并交付他人</td>
  <td>虚拟滚动表格，柱状 / 折线 / 面积 / 饼图 / 环形 / KPI 图表，导出 CSV / Excel / JSON / Parquet</td>
</tr>
<tr>
  <td><strong>MCP 自动化</strong></td>
  <td>希望 Claude Code、Codex、Cursor、OpenCode、Pi 等 AI 编程工具直接访问本机数据源</td>
  <td>以 MCP 协议开放 25 个工具，提供 <code>read-only</code> / <code>normal</code> / <code>full</code> 三种权限模式</td>
</tr>
</table>

## 立即开始

**桌面版**：从 [Releases](https://github.com/Chenkeliang/duckdb-query/releases/latest) 按下表选择**一个**安装包下载（`.sig`、`.app.tar.gz`、`latest.json` 用于应用内自动更新，无需下载）。

| 你的电脑 | 标准包（推荐，体积小） | 离线全量包（内网 / 无外网） |
|---|---|---|
| **Windows 10 / 11（64 位）** | `*_x64-setup.exe` | `*_x64-offline-setup.exe` |
| **Mac · Apple 芯片（M1–M4）** | `*_aarch64.dmg` | `*_aarch64-offline.dmg` |
| **Mac · Intel 处理器** | `*_x64.dmg` | `*_x64-offline.dmg` |

联网环境建议使用标准包（首次连接 MySQL / PostgreSQL 时自动下载对应 DuckDB 扩展）；内网环境使用 `-offline` 包，扩展与 WebView2 已全部内置。暂不提供 Linux 安装包。

> [!WARNING]
> 安装包**未经 Apple / Microsoft 证书签名**，首次启动可能被系统拦截。Windows：选择「更多信息」→「仍要运行」；macOS：执行 `xattr -cr /Applications/DuckQuery.app`。
> 芯片型号的识别方式与离线包内容见[桌面版使用手册](docs/guide/桌面版使用手册.md)。

**Docker**：

```bash
git clone https://github.com/Chenkeliang/duckdb-query.git
cd duckdb-query
./quick-start.sh   # Web UI → http://localhost:48000 ; API 文档 → :48001/docs ; 数据 → ./data
```

配置项与镜像源见[配置参考](docs/CONFIGURATION_ZH.md)。

## MCP

先启动桌面版或 Docker，再执行：

```bash
uvx duckquery-mcp
# 或：claude mcp add duckquery -- uvx duckquery-mcp
```

权限模式（`read-only` / `normal` / `full`）、Cursor 配置与多后端指定见 [mcp/README.md](mcp/README.md)。

---

如果 DuckQuery 对你有帮助，欢迎点亮 ⭐ Star；使用中遇到问题或有功能需求，欢迎提交 [Issue](https://github.com/Chenkeliang/duckdb-query/issues) 描述你的场景。

社区致谢：感谢 [LINUX DO](https://linux.do/) 对开源项目的支持。

[文档索引](docs/README.md) · [API 契约](docs/API_CONTRACT_FE_BE.md) · [Issues](https://github.com/Chenkeliang/duckdb-query/issues) · [参与贡献](CONTRIBUTING.md) · [行为准则](CODE_OF_CONDUCT.md) · [MIT License](LICENSE)
