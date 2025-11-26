# Task 10 · Sidebar/Header/Data Source theming alignment

## Objective
Bring the new shadcn + Tailwind + token-based entry to visual parity with `light.html`/`datasource-demo.html` for the sidebar, header, and data source area, with full light/dark support via CSS variables and no hardcoded colors.

## Scope
- Tokenize all colors/hover/active/overlay states needed by sidebar/header/data source views; map Tailwind and shadcn components to these tokens.
- Align sidebar layout (logo, nav states, separators, user info) and header buttons/tabs with the demo states and interactions.
- Align data source area (upload cards, forms, tables, drawers/dialogs) hover/focus/active visuals with the demo.
- Do not alter routing, data/state logic, or component structure; style-only changes.

## Token requirements
- Core colors: `--dq-background`, `--dq-surface`, `--dq-card`, `--dq-border`, `--dq-foreground`, `--dq-muted`, `--dq-muted-fg`, `--dq-primary`, `--dq-primary-fg`, `--dq-input-bg`.
- Nav active: `--dq-nav-active-bg`, `--dq-nav-active-border` (light: blue 50/100; dark: `primary/10` + `primary/20`).
- Optional: `--dq-success/warning/danger` for badges; `--dq-shadow-soft`, `--dq-radius-*` for corners/shadows; overlay/hover tokens if available.
- Light theme values match `light.html` (absolute white + blue primary); dark matches demo (zinc dark + orange primary).

## Tailwind & shadcn mapping
- Tailwind `darkMode: ["class", '[data-theme="dark"]']`; `extend.colors` read HSL from tokens (`background: 'hsl(var(--dq-background))'`, etc.).
- shadcn components:
  - Button: `default` uses `--dq-primary`; `outline/ghost` use `--dq-border`/`--dq-muted`; hover/disabled rings map to tokens.
  - Input/Select/Textarea: `bg-input-bg`, `border-border`, `text-foreground`, focus ring `primary`.
  - Card/Dialog/Drawer: `bg-surface`, `border-border`, overlay from token; keep corner/shadow tokens.
  - Tabs/Pills: active `bg-background` or `primary/10` with `border-border`; inactive `text-muted-fg`.
  - Table: thead `bg-background text-muted-fg border-b border-border`; tbody hover `bg-muted`; `divide-border`.

## Sidebar spec (highest priority)
- Container: `w-64 bg-surface border-r border-border flex flex-col`; logo row `h-14 border-b border-border`.
- Logo: square `bg-primary text-primary-fg shadow-sm rounded-lg`; title `text-foreground font-bold text-sm`; subtitle `text-[10px] text-muted-fg font-mono`.
- Nav item base: `w-full px-3 py-2.5 text-sm font-medium rounded-lg border border-transparent text-muted-fg hover:text-foreground hover:bg-muted transition flex items-center gap-3`.
- Active (`.dq-nav-active`): light `bg-[--dq-nav-active-bg] text-primary border-[--dq-nav-active-border]`; dark `bg-primary/10 text-primary border-primary/20`. Icons follow text color.
- User block: avatar `rounded-full bg-muted border border-border`; text `foreground` / `muted-fg`.
- Focus: `focus-visible:ring-2 ring-primary/60 ring-offset-2 ring-offset-surface`.

## Header spec
- Container: `h-14 bg-background border-b border-border flex items-center justify-between px-4`.
- Title: `text-foreground font-semibold`.
- Buttons: primary (`bg-primary text-primary-fg hover:opacity-90 shadow-soft`), secondary (`ghost/outline` with `text-muted-fg hover:text-foreground hover:bg-muted border-border`).
- Tabs (if present): wrapper `border border-border rounded-lg bg-background p-1`; active tab `bg-background text-foreground shadow-sm border border-border/50`; inactive `text-muted-fg hover:text-foreground`.

## Data source area spec
- Cards/tables: `bg-surface border border-border rounded-xl shadow-soft`.
- Upload drag area: `border border-dashed border-border bg-surface rounded-xl p-10 cursor-pointer hover:border-primary transition-colors`; icon `text-muted-fg`; text `text-foreground`; helper `text-muted-fg`.
- Forms: shadcn Input/Select with token mapping; focus ring `primary`.
- Buttons: primary `bg-primary text-primary-fg`; secondary `text-muted-fg hover:text-foreground hover:bg-muted`; “测试连接” may use `bg-background border border-border hover:bg-muted hover:border-primary/40`.
- Table: thead `bg-background text-muted-fg border-b border-border`; body `text-foreground divide-border`; row hover `bg-muted`; status badges use success/warning tokens.
- Drawer/Dialog: `bg-surface border border-border`; overlay `bg-black/60` or token equivalent; internal tabs/segments reuse upload/tab styles.

## Theme toggle
- Use `data-theme="light|dark"` + optional `class="dark"`; switching only changes theme attributes, not component logic.
- No hardcoded `bg-black/20`, `text-zinc-*`, etc.; replace with token classes (`bg-surface`, `text-muted-fg`, `bg-muted`).

## Implementation order
1) Add/verify tokens and Tailwind color mapping; enable `data-theme` dark mode.
2) Sidebar: apply `.dq-nav-active`, replace zinc/black/white hardcodes with token classes.
3) Header: align buttons/tabs to tokenized shadcn variants.
4) Data source area: upload cards, forms, tables, drawer/dialog to tokenized styles and hover/focus states.
5) Clean residual hardcoded classes; manual QA in light/dark for hover/active/focus against demo.
