<p align="center">
  <img src="docs/assets/readme/duckq-logo.svg" alt="DuckQuery" height="80">
</p>

<h1 align="center">DuckQuery</h1>

<p align="center">
  <strong>Query local files and remote databases in a single SQL statement</strong><br>
  Ad-hoc reconciliation, cross-source checks and data exploration — without importing first, and without standing up a warehouse for one analysis.<br>
  <sub>Write SQL directly, or ask in natural language (NL-to-SQL) — the answer is returned together with reusable SQL.</sub>
</p>

<p align="center">
  <a href="https://github.com/Chenkeliang/duckdb-query/releases/latest"><img src="https://img.shields.io/github/v/release/Chenkeliang/duckdb-query?label=Release&color=F97316" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License"></a>
  <a href="https://github.com/Chenkeliang/duckdb-query/stargazers"><img src="https://img.shields.io/github/stars/Chenkeliang/duckdb-query?label=Star&color=F97316" alt="Stars"></a>
</p>

<p align="center">
  <a href="https://github.com/Chenkeliang/duckdb-query/releases/latest"><strong>Download Stable</strong></a>
  · <a href="https://github.com/Chenkeliang/duckdb-query/releases">All releases</a>
  · <a href="#get-started">Docker Self-hosting</a>
  · <a href="README.md">中文</a>
</p>

<p align="center">
  <sub>Your data stays entirely local · AI runs on your own key and model</sub>
</p>

<p align="center">
  <img src="docs/assets/readme/hero-cross-source-en.gif" alt="DuckQuery workbench running a cross-source JOIN between a local DuckDB table and MySQL" width="900">
</p>

## Latest: v2.0.1 (MySQL federation and desktop fixes)

v2.0.1 adds MySQL candidate filtering while preserving exact DuckDB comparisons, JOINs, ordering and LIMIT. It fixes slow typed-NULL queries, standalone `mysql_query` connection detection and multiple aliases for one connection. Queries, persistence, async execution and exports share execution boundaries and retain decimal and nanosecond precision.

Local Docker binds to `127.0.0.1` by default. For shared access, deploy behind an authenticated reverse proxy; `DUCKQUERY_BIND_HOST` changes the bind address, and the app itself does not provide multi-user authentication. URL imports validate each redirect and enforce streaming size limits; configured HTTP(S) proxies are trusted network boundaries.

Default budgets allow up to 4 user-database connections, 4GB spill and a 256MiB disk reserve; engine memory is capped at 75% of detected physical/container memory. Settings → DuckDB database storage shows budgets, checks the latest backup and explains recovery; desktop users can open the validated backup folder. Database restoration is never automatic.

> [!IMPORTANT]
> The v2.0.0 Python backend uses DuckDB `v2.0.0-alpha39998` (Python package `1.6.0.dev379`), and new databases explicitly use `v2.0.0` storage. This is [DuckDB's official 2.0 Alpha](https://duckdb.org/2026/09/02/try-duckdb-20-alpha), which DuckDB does not yet mark as production-ready; treat this as a major-version upgrade.

What this release adds:

- handwritten SQL support for `APPROX NEAREST`, recursive CTE `USING KEY`, `FETCH FIRST/NEXT`, VARIANT, and JSON mutation functions;
- the workbench total-row LIMIT also protects `APPROX NEAREST` across async execution, persistence, export, and MCP;
- a DuckDB 2.0 dynamic-Pivot fix and structured parser locations rendered directly in the SQL editor;
- extension metadata that separates UI, `LOAD`, and artifact names; MySQL/PostgreSQL artifacts are verified with autoinstall disabled;
- healthy bundled Excel is hidden from the optional-extension page, while a missing artifact remains repairable;
- explicit app, Python package, engine, and storage versions in About; the browser demo reports its independent Wasm engine.
- a versioned capability contract shared by Agent and MCP; MCP 0.4.0 uses backend SQL classification and falls back safely with older backends. Version 0.4.0 is available from both PyPI and the v2.0.0 release.
- external DuckDB tables now preserve their catalog in zero/multiple-column pivot modes; storage migration uses durable recovery markers and restores the complete database/WAL set after interruption or any database failure.

Upgrade notes:

1. Back up `data/duckdb/main.db`, `system.db`, and their `.wal` files before upgrading. This release never migrates old files silently at startup.
   When older files are detected, the major-version dialog can be deferred and reopened from Settings → DuckDB database storage; no persistent top banner is shown.
2. DuckDB extension binaries are engine-version-specific. Standard builds may download the matching 2.0 MySQL/PostgreSQL/HTTPFS artifacts on first use; offline builds bundle them.
3. New databases use v2 storage; DuckDB 2.0 can read old files in place. Once explicitly migrated, a v2 file cannot be opened directly by DuckDB 1.5.3—restore the backup or use export/import to downgrade.
4. The browser demo embeds a separate DuckDB-Wasm engine and does not share the desktop/Docker 2.0 capability set; each UI reports its real engine version.
5. Legacy lambda syntax `x -> x + 1` is disabled by default; use `lambda x: x + 1`. `CONNECT`, triggers, DML-in-CTE, custom extension repositories, and arbitrary `INSTALL/LOAD` SQL remain disabled.

Full details: [v2.0.1 Release Notes](docs/releases/v2.0.1_en.md) · [v2.0.0 major-version notes](docs/releases/v2.0.0_en.md) · [DuckDB 2.0 technical design](docs/specs/duckdb-2-compatibility-and-capabilities.md)

## Where It Fits

- **DuckDB without the scripting**: create tables, import, join, pivot and export from the interface — no Python session or command line required.
- **Ad-hoc reconciliation**: compare an Excel / CSV extract against database tables directly, without loading it into a warehouse for a single analysis.
- **Cross-source analysis**: join and aggregate local Parquet / SQLite with a remote MySQL in a single statement to isolate missing, duplicated or mismatched records.
- **Numerically reliable answers**: aggregation is executed as SQL inside DuckDB; the model performs no arithmetic, which rules out hallucinated figures.
- **AI coding tool integration**: expose your connected data sources to Claude Code, Codex or Cursor over MCP, with no intermediate export.

## 30 Seconds to First Result

| Step | What it involves |
|---|---|
| **1. Connect the data** | Drop an Excel / CSV file to create a table, or connect MySQL / PostgreSQL / SQLite / DuckDB |
| **2. Write SQL or ask** | Write the query yourself; or ask in natural language ("paid amount by city last month") and run the drafted SQL once you have reviewed it |
| **3. Review and export** | Switch between grid and charts, drill into details, export to CSV / Excel / JSON / Parquet |

![AI drafts SQL, it runs, the result becomes a chart](docs/assets/readme/workflow-ai-chart-en.gif)

## Core Capabilities

<table>
<tr>
  <th width="13%">Capability</th>
  <th width="30%">Typical problem</th>
  <th width="57%">What it provides</th>
</tr>
<tr>
  <td><strong>Files as tables</strong></td>
  <td>Defining tables or building an ETL step for a one-off analysis</td>
  <td>Drop CSV / Excel / Parquet / JSON / JSONL to create a table; pasting tabular data, URL import and server directory reading are also supported</td>
</tr>
<tr>
  <td><strong>Federated queries</strong></td>
  <td>Database tables have to be reconciled against files on your machine</td>
  <td>Connect MySQL / PostgreSQL / SQLite / DuckDB and join them with local tables in a single SQL statement, with automatic pushdown on large joins</td>
</tr>
<tr>
  <td><strong>Query workflow</strong></td>
  <td>The work is split across Excel, a SQL client and a BI tool</td>
  <td>SQL editor, plus visual builders for joins, set operations and pivot tables; long queries run asynchronously and can be cancelled</td>
</tr>
<tr>
  <td><strong>AI data Q&amp;A</strong></td>
  <td>A figure is needed quickly, without writing the query first</td>
  <td>Ask in natural language: the agent inspects schemas, verifies values and runs read-only queries before answering, and returns reusable SQL; it also repairs failing statements, explains SQL and suggests charts</td>
</tr>
<tr>
  <td><strong>Results and export</strong></td>
  <td>Results have to be presented and handed to someone else</td>
  <td>Virtualized grid, bar / line / area / pie / donut / KPI charts, export to CSV / Excel / JSON / Parquet</td>
</tr>
<tr>
  <td><strong>MCP automation</strong></td>
  <td>AI coding tools such as Claude Code, Codex, Cursor, OpenCode or Pi need direct access to local data sources</td>
  <td>25 tools exposed over MCP, with <code>read-only</code> / <code>normal</code> / <code>full</code> permission modes</td>
</tr>
</table>

## Get Started

**Desktop**: download **one** installer from [Releases](https://github.com/Chenkeliang/duckdb-query/releases/latest) according to the table below (`.sig`, `.app.tar.gz` and `latest.json` are used by the in-app updater and are not needed).

| Your machine | Standard build (recommended) | Offline build (air-gapped) |
|---|---|---|
| **Windows 10 / 11 (64-bit)** | `*_x64-setup.exe` | `*_x64-offline-setup.exe` |
| **Mac · Apple silicon (M1–M4)** | `*_aarch64.dmg` | `*_aarch64-offline.dmg` |
| **Mac · Intel** | `*_x64.dmg` | `*_x64-offline.dmg` |

Use the standard build when online (DuckDB extensions are downloaded on first use of MySQL / PostgreSQL); use the `-offline` build on air-gapped machines, where extensions and WebView2 are bundled. No Linux package is provided yet.

> [!WARNING]
> The installers are **not signed with an Apple or Microsoft certificate**, so the first launch may be blocked. Windows: choose **More info → Run anyway**; macOS: run `xattr -cr /Applications/DuckQuery.app`.
> How to identify your chip and what the offline build contains: [desktop guide (Chinese)](docs/guide/桌面版使用手册.md).

**Docker**:

```bash
git clone https://github.com/Chenkeliang/duckdb-query.git
cd duckdb-query
./quick-start.sh   # Web UI → http://localhost:48000 ; API docs → :48001/docs ; data → ./data
```

Configuration and image mirrors: [configuration reference](docs/CONFIGURATION.md).

## MCP

Start the desktop app or Docker first, then run:

```bash
uvx duckquery-mcp
# or: claude mcp add duckquery -- uvx duckquery-mcp
```

Permission modes (`read-only` / `normal` / `full`), the Cursor configuration and pointing at a specific backend: [mcp/README.md](mcp/README.md).

---

If DuckQuery is useful to you, a ⭐ Star helps others find it. If something is missing or does not fit your workflow, open an [Issue](https://github.com/Chenkeliang/duckdb-query/issues) describing your case.

Community acknowledgement: Thanks to [LINUX DO](https://linux.do/) for supporting open-source projects.

[Docs index](docs/README.md) · [API contract](docs/API_CONTRACT_FE_BE.md) · [Issues](https://github.com/Chenkeliang/duckdb-query/issues) · [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [MIT License](LICENSE)
