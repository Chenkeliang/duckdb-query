# Task 10 · New Layout (datasource-demo parity) — Spec & Design

## Objective
Build a new frontend entry (DuckQueryApp path) that visually matches `datasource-demo.html` (light/dark), using shadcn + Tailwind + `token.css`. Keep the legacy ShadcnApp untouched (modern.css unchanged). UI-only rebuild; reuse existing data/state via `useDuckQuery` adapter.

## Directory & architecture
- New UI lives under `frontend/src/new/` (no changes to legacy components):
  - `PageShell`, `Sidebar`, `Header`.
  - `DataSourcePage`, `DataSourceTabs`, `UploadCard`, `DatabaseForm`, `SavedConnections`, `DrawerAddSource`, shared pieces (Badges, Status pills, Empty states).
  - `Common/`: tokenized primitives (`Card`, `Button`, `Input/Select`, `Tabs`, `Table`, `Badge`), can wrap existing `components/ui/*` if styles align.
  - `Theme/` (optional): `ThemeToggle` / helpers for `data-theme` + `class="dark"`.
- `DuckQueryApp.jsx` should render the new layout components; legacy `ShadcnApp.jsx` remains as-is.
- State layer: keep `useDuckQuery` API `{ state, actions }` as adapter. New components consume props (data, loading, callbacks) only; no direct API calls. Future global store can be swapped inside `useDuckQuery` without touching UI.

## Styling & tokens (token.css + Tailwind)
- Use only `token.css` variables; no `modern.css`. Tailwind colors map to tokens (background/surface/card/border/foreground/muted/primary).
- Required tokens (add if missing): `--dq-background`, `--dq-surface`, `--dq-card`, `--dq-border`, `--dq-foreground`, `--dq-muted`, `--dq-muted-fg`, `--dq-primary`, `--dq-primary-fg`, `--dq-input-bg`, `--dq-nav-active-bg`, `--dq-nav-active-border`, `--dq-nav-active-fg`, `--dq-overlay-strong`, status colors (success/warning/danger) for badges, `--dq-shadow-soft`, `--dq-radius-*`.
- Theme toggle via `data-theme="light|dark"` (+ optional `class="dark"`). No hardcoded colors; no `!important`.
- Components mirror demo states: nav-active (blue in light / orange in dark), hover (muted), focus ring (primary), table row hover (muted), dashed upload border `border-border` with hover `border-primary`, overlay opacity from token.

## Layout parity vs datasource-demo
- Sidebar: fixed width, surface background, 1px divider, nav pills with active border/bg, lucide icons, user block avatar/text.
- Header: background = background token, bottom border, primary/ghost buttons, optional view tabs.
- Data source view: cards/tables on surface with border/shadow tokens; upload drag area with dashed border + hover primary; database form fields tokenized; saved connections list with status badges; drawer/dialog for add-source mirrors demo spacing/typography.
- Tabs: pill-style or minimal underlined matching demo; active uses nav-active tokens; hover uses muted.
- Table: thead background=background, text=muted-fg, border=border, body hover=muted; badges use status tokens.

## Constraints
- Do not touch `ShadcnApp.jsx` or `modern.css`.
- No mixing legacy class names; new layout uses tokens + Tailwind/shadcn classNames.
- Keep routing/logic unchanged; only UI structure/style in new components.
- Avoid duplicated feature code: data flows through `useDuckQuery`; UI components stay dumb/presentational.

## Migration plan (UI only)
1) Add/verify tokens in `token.css`; Tailwind colors already map to tokens.
2) Scaffold `frontend/src/new/*` with props contracts (consume `useDuckQuery` data/actions).
3) Implement Sidebar/Header/DataSource UI to match demo (light/dark).
4) Wire `DuckQueryApp.jsx` to new components; keep ShadcnApp untouched.
5) QA light/dark for nav-active, tabs, upload hover, forms, badges, drawer overlay.
