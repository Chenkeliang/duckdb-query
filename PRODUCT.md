# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Also shipped as a Tauri desktop shell for Windows/macOS and as a DuckDB-Wasm browser demo; the design language is the same web UI in all three.)

## Users

Two primary audiences, confirmed as equally important:

- **Analysts doing reconciliation and cross-source checks.** They work in the desktop app or a Docker deployment during long office sessions, comparing Excel/CSV extracts against MySQL/PostgreSQL tables to find missing, duplicated or mismatched records. They need high density and comfort over hours of use.
- **Developers working alongside AI coding tools.** They keep DuckQuery open next to an IDE and expose their data sources to Claude Code, Codex or Cursor over MCP. They lean on the keyboard and often use a dark theme.

## Product Purpose

DuckQuery lets people query local files and remote databases in a single SQL statement. It covers ad-hoc reconciliation, cross-source checks and exploration without importing data first or standing up a warehouse. Users write SQL or ask in natural language, and get the answer together with reusable SQL. Success means going from dropping a file or connecting a database to a trustworthy, exportable result in minutes.

## Positioning

- It is a local-first DuckDB workbench with federated queries and pushdown across local tables, MySQL, PostgreSQL, SQLite and DuckDB.
- Aggregation always runs as SQL inside DuckDB. The model does no arithmetic, so its figures cannot be hallucinated.
- The same capability contract is exposed to AI coding tools over MCP.
- Data stays local, and AI runs on the user's own key and model.

## Operating Context

The core flow runs: connect data, write SQL or ask, look at the result, export or save it.

- **Data:** drop CSV/Excel/Parquet/JSON files, paste data, import from a URL, or save connections to MySQL/PostgreSQL/SQLite/DuckDB.
- **Query:** a workbench with a data-source tree and tabs for SQL, visual JOIN, set operations and pivot.
- **Results:** a grid or charts, with export to CSV/Excel/JSON/Parquet.
- **Long work:** async tasks for long queries, plus history, bookmarks and saved queries.
- **Other surfaces:** an AI assistant, a DuckDB extensions page, a settings page covering storage, budgets and backups, and an MCP server.

## Capabilities and Constraints

- **Frontend:** React 18, TypeScript, Vite, Tailwind v4 and shadcn/ui on Radix.
  - MUI is banned.
  - Theming goes through CSS variable tokens in `frontend/src/styles/tailwind.css`.
  - Other libraries: CodeMirror 6, TanStack Table/Virtual and recharts.
- **Binding constraints for redesign work:**
  - keep the shadcn/Radix/Tailwind v4 stack;
  - keep zh/en i18n, with zh as the fallback;
  - keep both light and dark themes complete;
  - keep every existing feature and flow.
- **Change proposals:** merging features or making interactions more precise is welcome as a proposal, but not as a silent removal.
- **Demo mode:** the browser demo locks database connections, AI and extensions.
- **Security boundaries:** the app has no multi-user authentication, and arbitrary `INSTALL/LOAD` SQL is disabled.

## Brand Commitments

- Name: **DuckQuery**.
- Keep the orange brand colour, #F97316 (`hsl(24.6 95% 53.1%)`).
- Keep the duck/bar logo (`frontend/src/assets/duckq-logo.svg`, `docs/assets/readme/duckq-logo.svg`).
- Visual standing preference (confirmed 2026-10-10): the category standard, a dark-first SQL client played straight with an equal light theme, at the craft level of TablePlus, Supabase Studio and Linear/Raycast. No irony and no smuggled quirk.
- Voice: factual and precise. In reliability statements, keep "your data stays local" and "AI runs on your own key and model".

## Evidence on Hand

- Demo dataset used in the README: `readme_demo_orders` plus MySQL `customers`, with columns order_id, customer_name, segment, region and amount.
- Screenshots and animations: `docs/assets/readme/` (hero-cross-source GIF, workflow-ai-chart GIF, sources webp) and `docs/assets/og-cover.*`.
- There are no customer testimonials, usage metrics or benchmarks on hand. Do not invent any.

## Product Principles

1. Trust is the product. Every number traces back to visible SQL, and where data lives (local or remote) is always legible.
2. Federation should feel like one place. Local files and remote databases appear in one vocabulary, not as separate silos.
3. The workbench is home. Other pages support getting data in and settings right, then return the user to the query.
4. Respect long sessions and the keyboard. Keep density high without fatigue, and make every primary action reachable without the mouse.
5. Both audiences, both themes, both languages are first-class.

## Accessibility & Inclusion

- Text and controls must stay legible in both themes, at least WCAG 2.2 AA.
- Interactive elements must be fully keyboard-operable.
- Chinese and English copy lengths must both fit without truncating meaning.
