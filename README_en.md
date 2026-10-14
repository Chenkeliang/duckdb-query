<p align="center">
  <img src="docs/assets/readme/duckq-logo.svg" alt="DuckQuery" height="80">
</p>

<h1 align="center">DuckQuery</h1>

<p align="center">
  <strong>Files, databases, and AI in one SQL workbench.</strong><br>
  Reconcile Excel with your business database, join data sources in one query, or let an agent query before answering.
</p>

<p align="center">
  <a href="https://github.com/Chenkeliang/duckdb-query/releases/latest"><img src="https://img.shields.io/github/v/release/Chenkeliang/duckdb-query?label=Release&color=F97316" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License"></a>
  <a href="https://github.com/Chenkeliang/duckdb-query/stargazers"><img src="https://img.shields.io/github/stars/Chenkeliang/duckdb-query?label=Star&color=F97316" alt="GitHub Stars"></a>
</p>

<p align="center">
  <a href="https://github.com/Chenkeliang/duckdb-query/releases/latest"><strong>Download desktop</strong></a>
  · <a href="#docker-images-and-data">Self-host with Docker</a>
  · <a href="https://chenkeliang.github.io/duckdb-query/">Browser demo</a>
  · <a href="README.md">简体中文</a>
</p>

DuckQuery is a local-first data workbench powered by DuckDB, built for ad-hoc reconciliation, cross-source checks, and exploration. Import files, connect databases, write SQL, build visual queries, chart results, and export—all in one interface, without setting up a warehouse for a single analysis.

**AI is optional: querying and analysis work without it.** When you enable AI, you choose the model service and supply your own API key.

## From Data to Results

1. **Connect.** Drop CSV, Excel, Parquet, or JSON files; paste a table; or connect MySQL, PostgreSQL, SQLite, or DuckDB.
2. **Query or ask.** Write SQL, use the visual JOIN / set-operation / pivot builders, or open the agent and choose the data sources and tables it can access.
3. **Review and deliver.** Inspect the grid, charts, column origins, and SQL. Export results or save them as local tables. Move a long-running query to the background and retrieve its result from the task panel later.

For example, join local orders with MySQL customer records to inspect completed orders:

```sql
SELECT
  o.order_id,
  c.customer_name,
  c.segment,
  o.amount
FROM readme_demo_orders AS o
JOIN mysql_readme_demo_mysql.customers AS c
  ON o.customer_id = c.customer_id
WHERE o.status = 'completed'
ORDER BY o.amount DESC;
```

These table names and connection aliases come from the [demo dataset](docs/assets/readme/README.md); replace them with your own sources. A query can use local tables and connected external databases together.

<details>
<summary>Watch the cross-source query demo</summary>

![Joining local orders with MySQL customer records](docs/assets/readme/hero-cross-source-en.gif)

Recorded in an earlier release to demonstrate the query flow; the current interface has been updated.

</details>

## What You Can Do

| Your task | DuckQuery provides |
|---|---|
| Turn scattered files into queryable data | CSV / Excel / Parquet / JSON / JSONL import, table pasting, URL import, and server directory access |
| Reconcile files against a business database | Cross-source joins with MySQL / PostgreSQL / SQLite / DuckDB, with eligible remote filters optimized |
| Iterate on a query | SQL tabs, table and column completion, error locations, query history, and SQL bookmarks |
| Analyze without writing every query | Visual JOIN, set-operation, and pivot builders with generated SQL available to inspect |
| Keep long queries running | Async tasks, moving active queries to the background, cancellation, and result recovery; moving a query does not run it again |
| Understand and present results | Virtualized grid, column origins, JSON viewer, bar / line / area / pie / donut / KPI charts, and chart drill-down |
| Deliver the data | CSV / Excel / JSON / Parquet export, or save as a local DuckDB table |
| Get AI assistance | Scoped data questions, schema and value inspection, read-only queries, SQL explanation and optimization, error repair, and chart suggestions |
| Connect AI coding tools | An MCP server for Claude Code, Codex, Cursor, and other clients, with three permission modes |

The workbench supports Chinese / English, dark / light themes, a command palette, and customizable keyboard shortcuts.

## Working with the Agent

Open the AI panel in the query workbench, select the sources and tables it may access, and describe your question. Type `@` to add a table. The input supports multiple lines: `Enter` sends and `Shift+Enter` adds a newline.

- **Ask about data.** The agent inspects schemas, checks real values, and runs row-limited, read-only queries before answering with reusable SQL. The database performs the calculations; you should still review the query's assumptions and results.
- **Explain or optimize SQL.** Quick actions fill an editable question draft for you to review before sending.
- **Use returned SQL.** Review the diff before applying a change. Applying updates the editor and does not execute the SQL. If you edit the SQL while waiting, the preview flags the conflict.

Files and local tables are stored on the computer or server running DuckQuery; external databases remain on their original servers. **When AI is enabled, schemas, questions, and limited query results within the selected scope may be sent to your configured model service.** Choose a local or remote model to suit your data requirements.

## What's New in v2.1.0

This update makes everyday querying more continuous:

- Reorganized workbench, data sources, settings, and results, with consistent light / dark themes and Chinese / English UI.
- Move an active read-only query to the background and restore its result from the task panel. Result columns show origins where they can be resolved.
- SQL completion follows context and prefixes: `FROM so` favors matching tables and avoids unrelated suggestions.
- Multiline AI input with IME support; compact scope controls, an add-source plus button with a tooltip, and Explain / Optimize actions that fill drafts first.
- AI SQL changes show a diff and conflict warning before the user applies them to the editor.

Read the [English release notes](docs/releases/v2.1.0_en.md) or [中文发布说明](docs/releases/v2.1.0.md). The published [v2.0.1 notes](docs/releases/v2.0.1_en.md) remain available.

## Install and Run

### Desktop

Choose the installer for your machine from [GitHub Releases](https://github.com/Chenkeliang/duckdb-query/releases/latest):

| System | Standard build | Offline build |
|---|---|---|
| Windows 10 / 11 · x64 | `*_x64-setup.exe` | `*_x64-offline-setup.exe` |
| macOS · Apple silicon | `*_aarch64.dmg` | `*_aarch64-offline.dmg` |
| macOS · Intel | `*_x64.dmg` | `*_x64-offline.dmg` |

Use the standard build when online; some external database connections download DuckDB extensions on first use. Choose the offline build when extension downloads are unavailable. It bundles the relevant extensions; the Windows offline installer also includes WebView2. Linux desktop installers are not provided; use Docker instead.

`.sig`, `.app.tar.gz`, and `latest.json` are in-app updater assets and do not need a separate download. Installers are not signed with Apple Developer ID or a Microsoft publisher certificate, so your system may show a first-run prompt. See the [desktop guide (Chinese)](docs/guide/桌面版使用手册.md) for details.

### Docker Images and Data

Install Docker and Docker Compose, then run:

```bash
git clone https://github.com/Chenkeliang/duckdb-query.git
cd duckdb-query
./quick-start.sh
```

- Workbench: [http://localhost:48000](http://localhost:48000)
- API docs: [http://localhost:48001/docs](http://localhost:48001/docs)
- Data lives in the host's `./data` directory; rebuilding containers does not remove imported tables.

The script supports configurable build-image mirrors; see the [configuration reference](docs/CONFIGURATION.md). By default, it binds to `127.0.0.1`. For shared access, use an authenticated reverse proxy; the application does not provide multi-user authentication.

### Browser Demo

[Try it online](https://chenkeliang.github.io/duckdb-query/). The demo uses a separate DuckDB-Wasm engine for local file queries. External database connections, AI, and extension management are disabled. Its engine version is displayed separately from the desktop / Docker backend.

## Connect AI Tools through MCP

Start DuckQuery desktop or Docker, then run:

```bash
uvx duckquery-mcp
```

For Claude Code:

```bash
claude mcp add duckquery -- uvx duckquery-mcp
```

| Permission mode | Behavior |
|---|---|
| `read-only` | Hides mutating tools and blocks mutation requests |
| `normal` (default) | Exposes mutating tools; changes require explicit confirmation |
| `full` | Bypasses MCP confirmation gates; backend restrictions still apply |

See the [MCP documentation](mcp/README.md) for client configuration, backend discovery, and tools. The MCP package is versioned separately from the app.

## Engine and Upgrade Notes

DuckQuery **app v2.1.0** and the DuckDB **engine version** are separate. This update keeps `v2.0.0-alpha39998`, Python package `1.6.0.dev379`, and `v2.0.0` storage for new databases. The engine remains a preview; updating the app does not switch it to a stable DuckDB engine.

Upgrading from DuckQuery 2.0.x introduces no new storage migration. Before upgrading from 1.x, back up `main.db`, `system.db`, and their `.wal` files, then read the [2.0 major-version notes](docs/releases/v2.0.0_en.md). Existing databases are not silently migrated at startup. After an explicit migration to the new storage format, restore a pre-upgrade backup to return to an older version.

Settings → DuckDB database storage shows resource budgets, backup checks, and recovery guidance. Extensions are isolated by engine version; see the [engine upgrade specification](docs/specs/duckdb-2-compatibility-and-capabilities.md) for compatibility details.

## Docs and Contributing

[Docs index](docs/README.md) · [Configuration](docs/CONFIGURATION.md) · [Desktop guide](docs/guide/桌面版使用手册.md) · [Contributing](CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md)

Found a problem or have a feature request? Open an [Issue](https://github.com/Chenkeliang/duckdb-query/issues) with your use case, app version, and reproduction steps. A Star helps others discover the project.

Thanks to [LINUX DO](https://linux.do/) for supporting open source. DuckQuery is licensed under the [MIT License](LICENSE).
