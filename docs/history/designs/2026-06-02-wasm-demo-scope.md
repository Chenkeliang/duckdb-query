# Scope — Browser Demo via DuckDB-Wasm (gh-pages)

**Status:** proposed (awaiting go/no-go) · **Date:** 2026-06-02 · **Owner:** Chen

Turn the currently-dead gh-pages page (a backend-less UI shell) into a **real, in-browser
trial** that runs actual SQL via DuckDB-Wasm — so visitors from HN/Reddit can touch the
product in one click, then install the self-hosted version for the full feature set.

---

## 1. Goals / Non-goals

**Goals**
- Visitor opens the gh-pages URL → sample tables preloaded → a real `file ↔ file` JOIN
  already runs, in-browser, no backend.
- They can drag a CSV/Parquet/JSON and query it with real SQL; charts work.
- Locked features (DB connect, AI) are **visible but gated**, each with a one-click
  "install self-hosted" upsell.

**Non-goals (explicitly out)**
- MySQL/Postgres connectivity in the browser — **impossible** (no TCP in the sandbox).
- AI (text-to-SQL / error doctor) in the demo — needs a backend + model key.
- Excel (.xlsx) parsing in wasm (needs spatial/GDAL, not in wasm).
- Large data / persistence — small samples, ephemeral in-memory.

---

## 2. ⭐ Constraint #0 — ZERO impact on the normal (self-hosted) flow

This is the top constraint. Guaranteed by:

1. **Build flag, default off.** New `VITE_DEMO`. Docker/self-host build never sets it →
   Vite dead-strips every `if (IS_DEMO)` branch at compile time. The production bundle
   does **not** contain the wasm/demo code, and never downloads the `.wasm`.
2. **Separate deploy targets.** gh-pages = demo build (`VITE_DEMO=true`); the Docker image
   = normal build. They never cross.
3. **`<DemoLock>` is pass-through when off.** In normal mode it is literally
   `return <>{children}</>` — identical UI/behavior.
4. **The "normal" branch of the query router is today's code, verbatim.** We only wrap it:
   `execute(sql) → IS_DEMO ? wasm(sql) : <existing code unchanged>`.

**Only real risk:** the refactor touches the shared query-execute boundary. Contained by:
keeping the normal branch byte-identical, the existing **602 tests** staying green, and a
Docker smoke (connect DB, federated JOIN, AI chat) confirming no behavior change.

---

## 3. Architecture — route at the `queryApi` layer (not per-caller)

All SQL execution funnels through **two functions**:
`frontend/src/api/queryApi.ts` → `executeDuckDBSQL()` (L53) and `executeFederatedQuery()` (L103).
Callers today: `hooks/useQueryRunner.ts`, `hooks/useQueryWorkspace.ts`, `Query/Charts/ChartView.tsx`,
`Query/SQLQuery/hooks/useSQLEditor.ts`, `Query/DataSourcePanel/ContextMenu.tsx`.

→ Inject the branch **inside those two functions only**; every caller is untouched.

```
executeDuckDBSQL(sql):
  if (IS_DEMO) return wasmEngine.run(sql)      // NEW, lazy-imported
  ...existing HTTP-to-FastAPI code, unchanged...

executeFederatedQuery(opts):
  if (IS_DEMO) throw DemoUnsupported('federated')  // no MySQL/PG in browser
  ...existing code, unchanged...
```

`wasmEngine.run()` must return the **same `QueryResponse` shape** (`.data`, columns) the app
already consumes, so grids/charts/pivot work with no downstream changes. (The main
integration gotcha: adapting the Arrow result from duckdb-wasm into `QueryResponse.data`.)

**New module** `frontend/src/demo/wasmEngine.ts`:
- lazy-init `@duckdb/duckdb-wasm` AsyncDuckDB (dynamic `import()` so normal build never bundles it),
- on first use: register sample files + run schema setup,
- `run(sql)` → execute, map Arrow → `QueryResponse`.

---

## 4. Capability matrix (what the demo honestly shows)

| | Demo (wasm/gh-pages) | Self-hosted |
|---|:---:|:---:|
| Real SQL on dropped CSV/Parquet/JSON | ✅ | ✅ |
| file ↔ file JOIN / pivot / set ops | ✅ | ✅ |
| Import from public URL (httpfs) | ✅ (CORS-permitting) | ✅ |
| Charts | ✅ | ✅ |
| Excel (.xlsx) | ❌ hint→CSV/PQ | ✅ |
| Connect MySQL/Postgres + cross-source JOIN | 🔒 upsell | ✅ |
| AI (text-to-SQL / doctor / chart suggest) | 🔒 upsell | ✅ |
| Data size / persistence | small / ephemeral | full / persistent |
| Threads | single (no COOP/COEP on gh-pages)* | n/a |

\* optional `coi-serviceworker` shim can enable multi-thread on gh-pages later; not needed for v1.

---

## 5. DemoLock UX — "visible but locked + upsell"

Philosophy: **surface, don't hide.** Locked features advertise the self-hosted upgrade;
hiding them would hide the differentiators. Each lock click = a conversion moment.

| Entry point | File | Demo treatment |
|---|---|---|
| Top banner | `App.tsx` (NEW `DemoBanner`) | `🧪 Demo · runs in your browser (DuckDB-Wasm). DB connections & AI need self-hosting → [Install]` (dismissible) |
| New DB connection | `DataSource/DatabaseForm.tsx` | wrap submit/entry in `<DemoLock>` → 🔒 + click opens upsell popover |
| AI tab | `App.tsx` (TabId `'ai'`) | tab shown with 🔒 → upsell instead of mounting AiModelPanel |
| Chat toggle (4 panels) | `ChatToggleButton` usage | `<DemoLock>` wrap → upsell |
| Error doctor button | `Query/ResultPanel/ResultPanel.tsx` | `<DemoLock>` wrap → upsell |
| Excel upload | `DataSource/UploadPanel.tsx` | keep accept; if `.xlsx` chosen → inline "Demo doesn't support Excel, use CSV/Parquet/JSON" |
| Large file (> ~100 MB) | `UploadPanel.tsx` | soft, non-blocking notice |
| Save connection / async tasks / export-to-DB | respective components | `<DemoLock>` |

**New shared components** (`frontend/src/demo/`):
- `isDemo.ts` → `export const IS_DEMO = import.meta.env.VITE_DEMO === 'true'`
- `DemoLock.tsx` → off: `return children`; on: disabled+lock+`DemoUpsellPopover`
- `DemoUpsellPopover.tsx` → one place for the copy + `./quick-start.sh` (copy button) + repo link
- `DemoBanner.tsx`

---

## 6. Sample data

Ship 3 tiny files in `frontend/public/demo/` (a few KB–MB): `orders.parquet`, `users.csv`,
`products.csv`. On wasm init, register them and run a default `orders ⋈ users` query so the
result grid + a chart are populated on first paint (zero clicks to "wow").

---

## 7. Build & deploy

- `.github/workflows/deploy-pages.yml` → add `env: VITE_DEMO: 'true'` to the build step.
  (Normal `npm run build` / Docker stays unset.)
- That same workflow already deploys to gh-pages — we're upgrading the existing dead deploy,
  not adding infra.
- Re-point repo homepage to the gh-pages URL **after** v1 ships and is verified working.

---

## 8. Change list

**New** (all under `frontend/src/demo/` + assets): `isDemo.ts`, `wasmEngine.ts`,
`DemoLock.tsx`, `DemoUpsellPopover.tsx`, `DemoBanner.tsx`; `frontend/public/demo/*` sample files.
Dependency: `@duckdb/duckdb-wasm` (dynamically imported only).

**Modified** (small, surgical): `api/queryApi.ts` (2 functions branch), `App.tsx`
(banner + AI-tab lock), `DataSource/DatabaseForm.tsx`, `DataSource/UploadPanel.tsx`,
`Query/ResultPanel/ResultPanel.tsx`, the 4 panels' `ChatToggleButton` wrap,
`.github/workflows/deploy-pages.yml`, i18n (`demo.*` keys zh/en).

---

## 9. Verification

**Normal flow (must prove unchanged):**
- [ ] `IS_DEMO=false` by default; `npx vitest run` → 602 green.
- [ ] `npm run build` → bundle does **not** include duckdb-wasm (grep the dist).
- [ ] Docker smoke: connect MySQL, run a cross-source JOIN, AI chat — identical to today.

**Demo flow:**
- [ ] Build with `VITE_DEMO=true` → load → sample tables + default JOIN run in-browser.
- [ ] Drag a CSV → query works; chart renders.
- [ ] DB-connect / AI / chat / doctor show 🔒 + upsell (no errors thrown).
- [ ] `.xlsx` upload → friendly hint; >100 MB → soft notice.

---

## 10. Effort & phasing (~2–4 focused days)

- **P1 (core, ~1–1.5d):** `@duckdb/duckdb-wasm` integration + `wasmEngine` + queryApi routing
  + sample data + default query. Milestone: *real SQL runs in the browser*.
- **P2 (gating, ~1d):** `DemoLock`/`DemoBanner`/upsell + wrap the entry points + xlsx/size
  hints + i18n.
- **P3 (ship, ~0.5d):** deploy workflow flag, verify both flows, re-point homepage.

Each phase is independently shippable; P1 can be validated before committing to P2/P3.

---

## 11. Open questions

1. Sample dataset theme — generic (orders/users/products) or something on-brand?
2. Locked-feature copy tone — playful ("🔒 unlock by self-hosting") vs plain?
3. Do we want the URL-import feature on in the demo, or also locked (CORS surprises)?
