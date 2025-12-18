# External Workbench (Task 11) Phase 2–3 Code Review

> Scope: `frontend/src/new/Query/**` external-workbench import + Join/Set/Pivot/Visual tabs integration  
> Note: This is a **review + fix plan** only (no legacy UI changes).

## 0) Constraints (must hold)

1. **Legacy UI stays untouched**  
   - Old UI uses `modern.css` + old token system; do not change old files.
2. **New UI is fully under `frontend/src/new/`** and must use **shadcn/ui + Tailwind CSS only**  
   - No custom CSS, no `!important`  
   - No project-specific token classes (e.g. `bg-surface`, `text-warning`, `border-warning`, `bg-surface-hover`, `bg-surface-elevated`, `bg-error`, `z-modal`, `z-dropdown`, etc.) unless you explicitly decide to keep the existing token system.
3. **Product intent: external DB is NOT “attached to DuckDB”**  
   - External selection → run SQL **on external** (`/api/execute_sql`) → show results → optionally **import to DuckDB** (`/api/save_query_to_duckdb`)  
   - Multi-table operations (Join/Set/Pivot/Visual) should run on **DuckDB tables**. External tables should be **disabled** there, with a clear “Import first” flow.

## 1) What looks already good

- `SelectedTable` model exists: `frontend/src/new/types/SelectedTable.ts`
- Compatibility helpers exist: `frontend/src/new/utils/tableUtils.ts`
- Workbench state supports external execution + “lastQuery” for import:
  - `frontend/src/new/hooks/useQueryWorkspace.ts`
- Result import dialog exists and is already wired from `QueryWorkspace`:
  - `frontend/src/new/Query/QueryWorkspace.tsx:192`
  - `frontend/src/new/Query/ResultPanel/ImportToDuckDBDialog.tsx`
- AG Grid theme is loaded via CSS imports and uses `theme: 'legacy'` (fixes “theme only works with !important” in AG Grid v34 CSS-theme mode):
  - `frontend/src/new/Query/ResultPanel/AGGridWrapper.tsx:128`

## 2) P0 (blockers) — must fix first

### P0.1 External table selection loses source info (SelectedTable not propagated)

- `DataSourcePanel` still uses the old callback shape `(tableName, source)` and `selectedTables: string[]`.
- In runtime, because JS ignores extra args, `useQueryWorkspace.handleTableSelect(table)` receives only a **string**, so it normalizes into **DuckDB** table → external metadata is dropped.

References:
- `frontend/src/new/Query/DataSourcePanel/index.tsx:25` (`selectedTables: string[]`, `onTableSelect(tableName, source?)`)
- `frontend/src/new/hooks/useQueryWorkspace.ts:41` (`handleTableSelect(table: SelectedTable)`)

**Fix direction**
- Update DataSourcePanel API to:
  - `selectedTables: SelectedTable[]`
  - `onTableSelect(table: SelectedTable)`
  - `onPreview(table: SelectedTable)` (or `onPreview(sql, source)` but must preserve source)
- Update `TableItem` + external nodes to construct `SelectedTableObject` directly (connection id/name/type + schema).

### P0.2 External “Preview” still executes against DuckDB

`QueryWorkspace.handlePreview` builds SQL and calls `handleQueryExecute(sql)` without passing `source`.

Reference:
- `frontend/src/new/Query/QueryWorkspace.tsx:41`

**Fix direction**
- `await handleQueryExecute(sql, source)` and make SQL generation dialect-aware:
  - DuckDB/Postgres: `"table"` or `"schema"."table"`
  - MySQL: backticks or unquoted identifiers (safe default: unquoted unless special chars)
  - Or: do not auto-quote in preview for external.

### P0.3 Execution routing drops `source` in `QueryTabs`

`wrapExecute()` strips the `source` argument, so even if a panel passes `{type:'external'}`, it is lost and the query runs on DuckDB.

References:
- `frontend/src/new/Query/QueryTabs/index.tsx:53` (`wrapExecute`)
- Used by Join/Set/Pivot/SQL: `frontend/src/new/Query/QueryTabs/index.tsx:140`

**Fix direction**
- Remove `wrapExecute` and pass `onExecute` through.
- Update panels that still have the “old signature” to accept `(sql, source?)` (or adapt at call site without losing `source`).

### P0.4 VisualQuery is currently “DuckDB-only” because the selected table is passed as string

In the Visual tab, `QueryBuilder` gets `selectedTable` as a string derived by `getTableName(...)`, so source metadata is dropped (external table becomes DuckDB table).

Reference:
- `frontend/src/new/Query/QueryTabs/index.tsx:170`

**Fix direction**
- Pass the actual `SelectedTable` object: `selectedTables[0] ?? null`.
- Update `handleVisualQueryExecute` and `handlePreview` to accept and forward `source`.

### P0.5 Backend contract limitation: Import only supports MySQL as “external”

`/api/save_query_to_duckdb` currently only treats `datasource.type in ["mysql"]` as external, otherwise it executes SQL in DuckDB.

Reference:
- `api/routers/query.py:1744` (condition: `if datasource_type in ["mysql"] and datasource_id != "duckdb_internal":`)

**Fix direction**
- Frontend: disable “Import to DuckDB” for `postgresql/sqlite/sqlserver` until backend supports them.
- Or backend: extend import support to `postgresql/sqlite` and make config source unified.

### P0.6 Password placeholder `***ENCRYPTED***` is NOT valid for connection tests

Backend only uses `***ENCRYPTED***` to preserve stored password **on save**; it does not auto-substitute for `/api/datasources/databases/test`.

References:
- Preserve-on-save: `api/core/metadata_manager.py:154`
- Connection test uses provided params: `api/routers/datasources.py:27`

**Fix direction**
- When selecting saved connection:
  - Keep UI password input **empty** and set `requiresPassword=true` (your earlier suggestion) OR
  - Use “test existing connection by id” endpoint (refresh) instead of “test arbitrary params”.

## 3) P1 (major functional gaps / correctness)

### P1.1 Join tab limitations (does not match desired capabilities)

Current Join builder is a **linear chain** (A JOIN B JOIN C), and each join has **only one condition**.

References:
- `frontend/src/new/Query/JoinQuery/JoinQueryPanel.tsx:165` (single `leftColumn/rightColumn`)
- `frontend/src/new/Query/JoinQuery/JoinQueryPanel.tsx:470` (joinConfigs indexed by adjacency)

Missing (requested):
- Multiple join conditions (AND across many columns)
- Ability to swap left/right or reorder join graph (not only adjacent chaining)
- Support for aliasing to avoid ambiguity

Also:
- External columns are TODO (currently empty), so external join UX is incomplete:
  - `frontend/src/new/Query/JoinQuery/JoinQueryPanel.tsx:338`

### P1.2 Set operations do not validate column compatibility

Even though `.kiro/specs/external-workbench-import/tasks.md` claims “implemented”, current code does not enforce:
- same number of selected columns
- compatible types
- consistent column order across tables

References:
- `frontend/src/new/Query/SetOperations/SetOperationsPanel.tsx:348` (direct SQL concat, no validation)

### P1.3 Pivot tab is not a real pivot (columnField unused)

`columnField` exists but the generated SQL only does GROUP BY rows + aggregations; it never pivots columns.

References:
- `frontend/src/new/Query/PivotTable/PivotTablePanel.tsx:154` (`columnField` state)
- `frontend/src/new/Query/PivotTable/PivotTablePanel.tsx:241` (SQL generation lacks pivot)

Also:
- External table listing uses `useDataSources()` expecting `ds.tables`, which is not part of the unified list shape.
- External columns fetch is TODO, so external pivot cannot work anyway.

### P1.4 DataSourcePanel “查看结构” uses DuckDB DESCRIBE for external tables

References:
- `frontend/src/new/Query/DataSourcePanel/ContextMenu.tsx:62`

**Fix direction**
- Disable “查看结构” for external tables OR implement external column fetch via `useSchemaTables` and show a schema dialog.

### P1.5 AG Grid Community API misuse

- `enableRangeSelection: true` is Enterprise-only (or at least not guaranteed in Community).
- `gridApi?.getCellRanges()` and `gridApi?.clearRangeSelection()` are called without guarding the method existence (optional chaining only guards `gridApi`, not the method).

References:
- `frontend/src/new/Query/ResultPanel/AGGridWrapper.tsx:140`
- `frontend/src/new/Query/ResultPanel/AGGridWrapper.tsx:232`

**Fix direction**
- Remove `enableRangeSelection` in Community build, or guard with `gridApi?.getCellRanges?.()` + `gridApi?.clearRangeSelection?.()`.
- If you still see `Maximum update depth exceeded` pointing at `useGridStats.ts`, treat it as a **render-loop**: something is causing the grid to repeatedly fire updates which trigger `setState`. Typical triggers are **unstable props** (`columnDefs` / `gridOptions` recreated every render) + listening to very chatty grid events (`modelUpdated`). Stabilize inputs and debounce stats updates if needed.

## 4) P2 (UX/Polish / maintainability)

### P2.1 shadcn/ui is currently customized with project tokens

Even “core” shadcn components under `frontend/src/new/components/ui/` use project token classes:
- `bg-surface`, `bg-surface-hover`, `bg-surface-elevated`
- `bg-error`, `text-warning`, `border-warning`
- custom z-index tokens `z-modal`, `z-dropdown`, etc.

References:
- `frontend/src/new/components/ui/button.tsx:7`
- `frontend/src/new/components/ui/card.tsx:7`
- `frontend/src/new/components/ui/dialog.tsx:39`

**Decision needed**
1. If you truly want “pure shadcn + tailwind”, revert these to upstream shadcn defaults (e.g. `bg-background`, `bg-card`, `text-destructive`, Tailwind `z-50`, etc.) and update new UI usage accordingly.
2. If you keep the token system, then update the constraint statement: “no custom CSS / no !important; project token classes are allowed.”

### P2.2 i18n coverage is inconsistent

There are still hard-coded Chinese strings in toasts and UI text.

Example references:
- `frontend/src/new/Query/DataSourcePanel/index.tsx:74`
- `frontend/src/new/Query/DataSourcePanel/ContextMenu.tsx:114`

### P2.3 Dialect-aware quoting

Many generated SQL snippets always use double-quoted identifiers, which is not safe for MySQL defaults.

Examples:
- `frontend/src/new/Query/SQLQuery/SQLQueryPanel.tsx:157`
- `frontend/src/new/Query/JoinQuery/JoinQueryPanel.tsx:465`
- `frontend/src/new/Query/SetOperations/SetOperationsPanel.tsx:347`

## 5) Recommended “best” architecture (aligned with your product intent)

### Rule: External DB is a *source*, DuckDB is the *workspace*

- **SQL tab**: can target either DuckDB or a single external connection.
- **Join/Set/Pivot/Visual tabs**: only operate on DuckDB tables.
- External selection in those tabs should:
  - show a blocking `Alert` (“Import first”), and/or
  - offer a one-click “Go to SQL tab” + prefill `SELECT * FROM ...` + show “Import to DuckDB”.

### Single source-of-truth data model

- Use `SelectedTable` everywhere (no `string + TableSource` split).
- Derive `TableSource` from `SelectedTableObject` via `normalizeSelectedTable(...)`.
- Keep one shared `TableSource` type (export from `useQueryWorkspace` or `types/SelectedTable`).

## 6) Concrete fix plan (smallest steps that unlock functionality)

### Step 1 — Unify selection + routing (P0)

1. Update `DataSourcePanel` + tree nodes to operate on `SelectedTable`:
   - selection comparisons must include `(connectionId, schema, name)` to avoid collisions
2. Update `QueryWorkspace.handlePreview` to pass `source`
3. Remove `wrapExecute` in `QueryTabs` and pass `source` through
4. Update Visual tab to pass `SelectedTable` object, and wire `source` into execute/preview

### Step 2 — Enforce “external import first” policy (product intent)

1. Detect `hasExternalTables(selectedTables)` in Join/Set/Pivot/Visual
2. Disable execute buttons and show a single consistent CTA:
   - “Switch to SQL tab” (and prefill SQL if possible)
3. Keep import button only for external query results; auto-refresh DuckDB tables on success

### Step 3 — Feature completeness (P1)

- Join: multi-condition joins, join reordering / direction, aliasing, better column discovery
- Set: column compatibility validation + mapping UI
- Pivot: implement actual pivot (DuckDB PIVOT or conditional aggregation with distinct values)

### Step 4 — Styling alignment (P2)

Decide and execute one path:
- **Path A (recommended)**: revert `frontend/src/new/components/ui/*` to upstream shadcn defaults; remove project tokens and custom z-index classes.
- Path B: keep token system (then update constraint statement to match reality).

### Step 5 — Backend alignment

- Extend `/api/save_query_to_duckdb` to support `postgresql/sqlite` external import (or explicitly restrict UI to MySQL).
- Make `/api/execute_sql` read the unified data source config (it still references `config/mysql-configs.json` in parts of the code).

## 7) Quick sanity checklist (manual)

1. SQL tab:
   - Selecting external table shows “Target DB: <external>”
   - Executing runs on `/api/execute_sql` (not DuckDB)
   - Result panel shows “Import to DuckDB”
2. After import:
   - DuckDB tables list refreshes
   - Imported table can be used in Join/Set/Pivot/Visual
3. Join/Set/Pivot/Visual:
   - External selection is blocked with clear import-first guidance
4. AG Grid:
   - No console errors on Esc key / range selection
