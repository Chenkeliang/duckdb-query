---
name: DuckQuery
description: A dark-first SQL workbench on graphite with one orange signal, built to the category standard.
colors:
  accent: "#F97316"
  accent-ink: "#FB923C"
  accent-on: "#140B03"
  ground: "#0F1115"
  panel: "#16191F"
  elevated: "#1E222A"
  hover: "#232832"
  active: "#2A303B"
  rule: "#262B34"
  rule-strong: "#333A46"
  ink: "#E6E8EB"
  ink-2: "#C4CAD3"
  muted: "#8A93A0"
  faint: "#5E6877"
  success: "#3FB950"
  warning: "#D29922"
  error: "#F85149"
  chart-series: "#4F80E8"
  light-ground: "#FBFBFC"
  light-panel: "#F3F4F6"
  light-elevated: "#E9ECF0"
  light-rule: "#E1E4E9"
  light-ink: "#16181D"
  light-muted: "#5A6270"
  light-accent-ink: "#C2410C"
  light-success: "#1A7F37"
  light-warning: "#9A6700"
  light-error: "#CF222E"
typography:
  headline:
    fontFamily: "Inter, PingFang SC, Noto Sans SC, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Inter, PingFang SC, Noto Sans SC, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "20px"
  body:
    fontFamily: "Inter, PingFang SC, Noto Sans SC, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
  code:
    fontFamily: "JetBrains Mono, SF Mono, ui-monospace, PingFang SC, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "22px"
  data:
    fontFamily: "JetBrains Mono, SF Mono, ui-monospace, PingFang SC, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "Inter, PingFang SC, Noto Sans SC, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "20px"
  caption:
    fontFamily: "Inter, PingFang SC, Noto Sans SC, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: "16px"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  xl: "12px"
  full: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-run:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-on}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px 0 11px"
    height: "30px"
  button-default:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 11px"
    height: "30px"
  button-default-hover:
    backgroundColor: "{colors.hover}"
  button-inverse:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    rounded: "{rounded.md}"
    padding: "0 11px"
    height: "30px"
  tab-editor:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.muted}"
    padding: "0 10px 0 12px"
    height: "40px"
  tab-editor-active:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
  chip-federation:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "28px"
  input-search:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 8px"
    height: "30px"
  input-field:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  grid-header:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.ink}"
    typography: "{typography.data}"
    padding: "0 12px"
    height: "44px"
  grid-cell:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.data}"
    padding: "0 12px"
    height: "32px"
  list-card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.lg}"
  tag:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-2}"
    typography: "{typography.caption}"
    rounded: "9px"
    padding: "0 7px"
    height: "18px"
  palette:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.xl}"
    width: "640px"
  palette-item-active:
    backgroundColor: "{colors.elevated}"
    textColor: "{colors.ink}"
    height: "36px"
---

# Design System: DuckQuery

> **Status: React graphite migration implemented in the current working tree.** The approved design remains `docs/design/redesign-prototype/`; the running React implementation is defined by `frontend/src/styles/tailwind.css`, `frontend/src/App.tsx`, `frontend/src/Layout/` and `frontend/src/Query/`. The frontmatter and visual specification below preserve the approved prototype tokens and intent. They are not a claim of exact runtime or behavioral parity: the implementation record under Components states current mappings, adaptations and verification limits. This is not a deployment or full acceptance sign-off.

## Overview

**Creative North Star: "The Category Standard"**

DuckQuery is a dark-first SQL client played straight: a 56px icon rail, a source explorer, editor tabs, a toolbar, a SQL editor and a dense result grid, finished to the standard of TablePlus, Supabase Studio and Linear/Raycast. It stands on a graphite ground in three steps separated by 1px rules. The light theme is the same structure on cool paper, equal in rank, not an afterthought. The system refuses the incumbent's soft orange-pill SaaS look: large orange fills, rounded navigation pills and loose spacing.

It serves two long sessions of equal weight: an analyst reconciling extracts for hours, and a developer with the app open beside an IDE. Density is high, type is small and exact, every primary action is reachable from the keyboard, and the command palette (Cmd+K) is the signature interaction. Orange is a signal, not a surface.

Trust is shown rather than claimed. A result always carries where its columns came from, how many rows returned, how long it took and which sources answered.

**Key Characteristics:**
- Graphite ground in three steps with 1px rules; light theme on cool paper with the same structure.
- One accent, #F97316, used as signal: Run, active underline, focus, caret, selection, progress.
- Inter for the interface; JetBrains Mono for anything that could be pasted into SQL.
- 6px radius on controls, 10px on containers, 12px on floating overlays.
- Border-led depth; shadows only for things that float.
- Provenance everywhere: health dots, a type and source line under each result column, a federation chip, a results footer.

## Colors

A restrained graphite palette with a single hot signal: neutral steps carry the structure, orange carries the intent. Values below are the dark theme (the normative frontmatter set); light counterparts are listed beside them and are keyed `light-*` in the frontmatter.

### Primary
- **Duck Orange** (#F97316, `accent`): the brand colour, identical in both themes. Fills the Run button, underlines the active editor tab and active result tab, draws the 2px focus ring, colours the editor caret, outlines the selected grid cell, and fills in-flight progress. It is also the logo's accent.
- **Orange Ink** (#FB923C dark, `accent-ink`; #C2410C light, `light-accent-ink`): orange when it must be read as text or icon on a surface: the running spinner, the highlighted palette row's icon, the numbered proposal markers. The darker burnt orange keeps text legible on cool paper.
- **Ink On Orange** (#140B03, `accent-on`): the text and icon colour on an orange fill (about 6.9:1 on #F97316).

### Neutral
- **Graphite Ground** (#0F1115, `ground`; light #FBFBFC `light-ground`, "Cool Paper"): page, rail, SQL editor, grid cells, inputs.
- **Graphite Panel** (#16191F, `panel`; light #F3F4F6): explorer, tab strip, results panel, list cards, drawers.
- **Graphite Raised** (#1E222A, `elevated`; light #E9ECF0): grid header, selected segment, menus, tooltips, toasts.
- **Hover** (#232832) and **Selected** (#2A303B): the next steps up for hover and selected rows (light #E4E7EB and #DCE0E6).
- **Hairline** (#262B34, `rule`; light #E1E4E9): the 1px structural rule between every region and every grid cell. **Hairline Strong** (#333A46, `rule-strong`; light #D0D5DC) marks overlay borders, control hover borders, switch tracks and scrollbar thumbs.
- **Ink** (#E6E8EB, `ink`; light #16181D): primary text, and the fill of the inverse button and active switch. **Ink Soft** (#C4CAD3; light #3A404B) is secondary text and tree labels.
- **Muted Slate** (#8A93A0, `muted`; light #5A6270): labels, metadata, inactive tabs, placeholders.
- **Faint Slate** (#5E6877, `faint`; light #8A919C): decorative only; see the rule below.

### Semantic
- **Health Green** (#3FB950; light #1A7F37), **Caution Amber** (#D29922; light #9A6700), **Error Red** (#F85149; light #CF222E): connection dots, status text, the error card and the parse-error squiggle. Each has a 10 to 12% tint of itself for fills (`--ok-soft`, `--err-soft`).
- **Chart Blue** (#4F80E8; light #3B6FD8, `chart-series`): the chart series fill. Deliberately not orange.
- **Syntax:** keywords #8FA8FF, strings #8FD694, numbers #F0B37E, functions #7DCFFF, comments #6B7585 (light #3451C7, #2F7D32, #B45309, #0B7285, #6B7280).

### Named Rules
**The One Fill Rule.** The Run button is the only orange-filled control in the workbench. Everything else is graphite, ink or an outline, so "what does this screen want me to do" has one answer.

**The Orange Is Signal Rule.** Orange appears where the system is acting or the user is pointing: Run, underlines, focus, caret, selected cell, in-flight progress, drag handles and drop targets. It is never a card, panel, section or navigation-pill background.

**The Faint Is Decoration Rule.** `faint` measures about 3.3:1 on the dark ground and 3.1:1 on the light ground, below AA for text. It is for chevrons and off-state dots, not for content a user must read: row numbers, NULL cells, gutters and off-state labels use `mute`. Focus rings use `acc-ink` (#FB923C dark, #C2410C light) so they clear 3:1 on both grounds.

## Typography

**UI Font:** Inter (with PingFang SC, Noto Sans SC, system-ui, sans-serif), weights 400, 500, 600; OpenType `cv11` and `ss03` on.
**Code/Data Font:** JetBrains Mono (with SF Mono, ui-monospace, PingFang SC, monospace), weights 400, 500, 600.

**Character:** A quiet, neutral humanist sans carries the interface so a precise monospace can carry the data. The pairing is a contrast of role, not of style: if a string could be copied into a query, it is mono. Chinese falls back through PingFang SC and Noto Sans SC at the same sizes; comments use italics in English only.

### Hierarchy
- **Headline** (600, 20px, 28px line, -0.015em): page titles on Sources, Extensions and Settings.
- **Title** (600, 15px): drawer, dialog and settings-section headings. 14px for empty-state headings, 13px for in-page section headings.
- **Body** (400 / 500 for controls, 13px, 20px line): all interface text. Run is 600.
- **Code** (400, 13px, 22px line, JetBrains Mono): the SQL editor, with a 52px right-aligned line-number gutter in muted slate.
- **Data** (400, 12.5px, JetBrains Mono, tabular figures): result cells, table and column names in the tree, counts, timings. Numbers are right-aligned.
- **Label** (500, 12px): segmented controls, chips, result tabs and toolbar secondary buttons.
- **Caption** (500, 10.5 to 11.5px, muted slate): metadata, group labels in sentence case, and the type and source line under each column name.

### Named Rules
**The Mono-For-Data Rule.** JetBrains Mono carries SQL, identifiers, grid cells, counts, timings and shortcut keys. Inter carries every other word. Never set prose or button labels in mono.

**The Sentence-Case Labels Rule.** Group, section and column labels are sentence case at 11 to 12px in muted slate. There are no uppercase or letter-spaced eyebrow labels.

## Layout

A fixed desktop-IDE frame on a CSS grid: 56px rail, a 264px explorer (drag-resizable 200 to 460px; double-click resets), a flexible main column and an optional AI panel, above a 28px status bar. Main stacks a 40px editor-tab strip, a 46px toolbar, a 2px progress line, the SQL editor (300px by default, drag-resizable, 96px minimum), a splitter and the results region (40px tab bar, the grid, a 30px footer).

Density is the rule: tree rows 28px, grid rows 32px, grid header 44px (name over type), buttons 30px, chips and icon buttons 28px, fields 32px. Spacing steps are 4, 8, 12, 16, 24, 32; page content sits in a centred column of at most 1080px (settings 1040px) with 28px/32px padding. List-style pages (connections, tables, extensions) use a CSS-grid row with 52px minimum height and a 34px header row.

Responsive behaviour follows the container, not just the viewport: the federation chip drops its source pills below 980px of main width, and Format and Save fold into a more menu with shortcut hints hidden below 820px. Under 900px the explorer and AI panel become overlays on the rail; under 640px the rail becomes a 52px bottom bar and the status bar hides. Reduced-motion collapses animation and transition durations to near zero.

## Elevation & Depth

Depth at rest is tonal and ruled, never shadowed. Regions separate by a 1px hairline and a one-step change of graphite (ground, panel, raised). Hover steps to the next surface colour; selection steps one further.

Shadows exist for exactly one job: things that float over the workbench.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 12px 32px -8px rgba(0,0,0,.6), 0 2px 6px rgba(0,0,0,.35)` dark; `0 12px 32px -8px rgba(16,24,40,.18), 0 2px 6px rgba(16,24,40,.08)` light): command palette, drawer, dialog, menus, toasts, tooltips and the proposals popover. Over a scrim (rgba(5,6,8,.6) dark, rgba(16,18,22,.28) light) for modal surfaces.
- **Focus halo** (`box-shadow: 0 0 0 3px` soft orange, 12% dark / 10% light): a focused form field, paired with an orange border.
- **Selected cell** (`inset 0 0 0 1.5px` orange over a soft orange wash): the selected grid cell.

### Named Rules
**The Border-Not-Shadow Rule.** If a surface does not float, it gets a border or a surface step, never a shadow. A bordered ghost card is not elevation either.

## Shapes

A tight, engineered radius vocabulary: 6px for every control (buttons, fields, chips, segmented groups), 10px for containers (list cards, builder cards, error card, SQL blocks), 12px for floating overlays (palette, dialog, props popover), 4px for nested keys and small tags (`kbd`, source pills, type badges), and full circles for dots and the switch. Tags and status pills are rounded capsules (9 to 11px at 18 to 22px height). Borders are always 1px; 1.5px dashed marks a drop zone. The editor tab is square-cornered; its active state is a 2px bottom bar, not a shape.

Icons are 16px (14px small, 18px in the rail) line glyphs, 1.6px stroke, round caps and joins, inherited colour. The logo is the supplied duck/bar mark in its amber ramp and is the only multi-colour element.

## Components

Every component is flat, bordered or tinted, 28 to 32px tall, and answers hover with the next surface step and focus with a 2px orange ring (`outline: 2px solid` accent, 1px offset).

### Buttons
- **Run:** the signature control. Orange fill, ink-on-orange text, 30px, 6px radius, 600 weight, a play glyph and a ⌘↵ key hint. Hover brightens by 7%. While a query runs it becomes a raised-graphite Stop button with a 1px strong-rule inset, never orange.
- **Default:** transparent with no border at rest, hover tints to the hover step. `.line` adds a 1px rule that strengthens on hover. Used for Async, Format, Save, Ask AI, export and row actions.
- **Inverse:** ink fill with ground-coloured text. The primary action in dialogs, drawers and the AI composer (send). Hover drops opacity to 90%.
- **Icon button:** 28px square, 6px radius, muted, hover tint.

### Tabs and Segmented Controls
- **Editor tabs:** a 40px panel-coloured strip; the active tab takes the ground colour of the editor and a 2px orange underline, with a dirty-dot and a close key that appear on hover or active.
- **Result tabs:** Results / Chart / Messages with a mono count; the active tab has a 2px orange underline inset 10px.
- **Segmented control:** a ground-coloured 1px-ruled group with 24px segments; the active segment is raised graphite with ink text.

### Chips and Tags
- **Federation chip:** 28px, 1px rule, label plus one mono pill per source (`local`, `prod_crm`); sits at the right of the toolbar and opens a menu.
- **Tag:** capsule, 1px strong rule, panel fill, ink-soft 11px text, for categorical cell values.
- **Status pill:** 22px outlined capsule; the OK variant tints with green. State is always paired with a word, never colour alone.

### Inputs / Fields
- **Search:** 30px, ground fill, 1px rule, a leading search glyph and a trailing `/` key hint; the border brightens on focus-within.
- **Field:** 32px, ground fill, 1px rule. Focus turns the border soft orange and adds a 3px soft-orange halo. Selects use a drawn chevron; textareas switch to mono.
- **Switch:** 34 by 20px; off is a strong-rule track, on is an ink track with a ground-coloured knob.

### Navigation
- **Icon rail:** 56px, ground fill, 1px right rule, a 40px button per destination (Workbench, Sources, AI, Extensions; Settings pinned to the bottom). The active button gets the raised fill and a 2px ink bar on the outer edge; a small orange dot marks unread AI. Tooltips on hover. On mobile the rail is a bottom bar with a 2px ink bar on top.
- **Explorer tree:** panel background; connection groups in 600 weight with a health dot (green, amber, hollow for offline) and a kind tag; tables in mono with row counts; columns in muted mono with their type, right-aligned.
- **Status bar:** 28px, ground fill, 11.5px muted, engine and connection health at left, cursor, language, theme and the Cmd+K key at right.

### Result Grid (signature)
A dense mono grid: sticky raised header showing the column name over its type and source (`VARCHAR · prod_crm`), a sticky row-number column, 1px rules on every cell, 32px rows, tabular right-aligned numbers, NULL in muted italic. Sort glyph on the header; hover tints the row; a clicked cell takes the orange selection outline. Range selection matches the incumbent DataGrid: drag, Shift-click, row-number and corner select, arrows / Shift+arrows / Home / End / PageUp / PageDown, ⌘A, ⌘C (TSV without header) and Esc. The range fills with `acc-soft` and the cursor cell keeps the orange outline. Right-click offers copy as TSV / CSV / JSON, copy column name, filter by value, exclude value and clear filter. Each header has a filter menu (condition plus value list with select all / clear / invert) and a drag-to-resize edge. The footer shows the selected cell count, plus sum and average for a single numeric column, and filter chips with a clear button. The footer states rows, columns, duration and sources in one line.

### Command Palette (signature)
A 640px panel at 14vh from the top: a 52px query row with an esc key hint, grouped results at 36px rows, and a footer of key hints. The highlighted row rises to the raised graphite and its icon turns orange ink. It opens on a scrim with a 140ms ease-out-expo scale-in and is the fastest path to every action, source and saved query.

### Overlays
- **Drawer:** 520px from the right, panel fill, strong-rule left border, overlay shadow; used for adding data, connections and detail forms.
- **Dialog:** 440px centred, 12px radius; **Menu:** 200px minimum, raised graphite, 30px items, 9px radius; **Toast:** raised graphite, bottom right above the status bar, status icon in semantic colour.
- **Error card:** a red 1px border and 10% red tint with the parse-error location, a caret line and a fix hint, never a modal.

### Motion
One easing, `cubic-bezier(.16, 1, .3, 1)`, for entrances and layout. Hover and filter changes take 120ms; overlay fades 140 to 180ms; panel widths and the drawer 220 to 260ms; result rows fade in at 220ms. In-flight work shows a 2px orange sweep under the toolbar and a spinner in orange ink. Motion never carries meaning alone and collapses under `prefers-reduced-motion`.

### React implementation record (2026-10-10)

The graphite shell and theme migration is present in the existing `feat_ui_redesign_prototype` working tree. `tailwind.css` exposes Tailwind v4 `--color-*` utilities over space-separated HSL channels on `:root` (light) and `.dark`; the prototype's `data-theme` switch is not used. The approved frontmatter remains unchanged. Runtime values and differences below take precedence when describing what the React app currently renders.

#### Current token mapping

| Approved role | React runtime role | Current detail |
| --- | --- | --- |
| Ground / ink | `--background` / `--foreground` | Graphite / cool-paper palette in both themes; exact HSL channels are in `tailwind.css`. |
| Panel | `--surface`, `--card`, `--secondary` | Explorer, panel and card surfaces. |
| Raised / hover / selected | `--surface-elevated`, `--muted` / `--surface-hover` / `--surface-active`, `--accent` | `--accent` is a neutral shadcn selection role, not brand orange. |
| Rule / strong rule | `--border` / `--border-strong` | `--border-subtle` remains a separate softer value; `--input` is ground, not the strong border. Bare borders inherit the semantic border in the base layer. |
| Muted / secondary text | `--muted-foreground` / `--secondary-foreground`, `--accent-foreground` | The latter two alias foreground in both themes, not the prototype's softer `ink-2`. |
| Orange / on-orange | `--primary` / `--primary-foreground` | Primary is `24.6 95% 53.1%`; dark on-orange is `28.2 73.9% 4.5%`, light is `28.6 67.7% 6.1%`. |
| Orange ink / focus | `--primary-ink`, `--ring` | Dark `27 96% 61%`; light `17.5 88.3% 40.4%`. Focus uses orange ink, not the fill-orange token. |
| Decorative faint / semantic state | `--faint`; `--success`, `--warning`, `--error` | Theme-specific values and separate foreground, background and border roles exist. |
| Selection tint | `hsl(var(--primary) / 0.12)` | Grid range/row selection; browser text selection uses 28%. No separate prototype `--acc-soft` variable is required. |
| Chart series | `--chart-1` through `--chart-7` | First series is `#3987e5` dark / `#2a78d6` light, not the approved single-series blue; React retains a seven-color categorical palette. |
| SQL syntax | `--syn-keyword`, `--syn-string`, `--syn-number`, `--syn-function`, `--syn-comment`, `--syn-punct` | CodeMirror consumes the theme roles; no pending syntax-token migration. |
| Font families | `--font-sans`, `--font-mono`; `--font-ds-sans`, `--font-ds-mono` aliases | Inter / JetBrains Mono with OS and CJK fallbacks. `text-sm` is 13px / 20px. |
| Radius | `--radius: 0.5rem` | At the default root size: `rounded-sm` 4px, `rounded-md` 6px, `rounded-lg` 8px, `rounded-xl` 10px, `rounded-2xl` 12px. Do not set the base to 6px: that would shrink derived controls. |
| Depth | `--shadow-xs`, `--shadow-sm` are transparent | `--shadow-lg`/`--shadow-xl` use the approved overlay shadow; medium, 2xl and inner shadows retain distinct values. |
| Data-source kind | `--ds-mysql`, `--ds-pg`, `--ds-sqlite`, `--ds-live` | Retained in both themes; these were not removed in favor of the prototype's text-only kind badges. |

#### Current components and prototype adaptations

- **Shell:** `App.tsx` composes `PageShell`, `AppRail` and `StatusBar`. The desktop rail is 56px with 40px destination buttons and an ink active marker; the desktop status bar is 28px. Below the 640px `sm` breakpoint, the rail becomes a 52px bottom navigation bar and the status bar is hidden (at 640px, `sm` restores desktop chrome). The old global header/sidebar composition has been replaced. Settings stays at the desktop rail bottom; the workbench dot represents running async tasks, not unread AI. Engine version and connection counts come from hooks; the browser demo explicitly identifies DuckDB-Wasm. The prototype's cursor-position and memory readouts are not part of `StatusBar`.
- **Workspace:** The new-tab control stays outside the horizontally scrolling tab list, so it remains reachable with many tabs or on narrow screens. `QueryWorkspace` uses resizable React panel groups rather than the prototype CSS grid. The explorer converts desktop pixel bounds (220px minimum, 420px maximum and approximately 36px collapsed) to the panel library’s percentages using the outer workspace width. The desktop tree stays mounted while collapsed, preserving search and expansion state; returning from the narrow layout restores its prior expanded state. The footer does not shrink, and batch actions use two rows at compact widths. The narrow layout disables divider dragging. The desktop AI dock defaults to 30%, minimum 20%, with `AiDockContext` and `AiChatDrawer` rendering the existing chat UI into it; at widths up to 900px, explorer and AI use Sheet overlays instead. SQL, JOIN, set operations and pivot remain represented in `QueryTabs`; history, saved queries and async tasks use existing panels/sheets. `QueryTabs` keeps selected tables per SQL tab ID in `sqlTablesById`, restores the active SQL tab through `onRestoreSqlTables` wired to the `useQueryWorkspace` hook's `restoreSqlTables`, and gives newly created SQL tabs an empty selected-table context rather than inheriting another tab's selection.
- **Toolbar and buttons:** Query action toolbars use a 44px minimum height, 28px controls, and wrapping status groups. Secondary labels use the panel container width (`@md`); execution uses a linear Play icon. `Button` default size is 32px (small 28px, large 36px), with 6px corners. Run uses `variant="run"` and 5% hover brightening; cancellable execution uses the neutral secondary button. Default buttons use inverse ink. Workbench actions use three levels: Run/confirmation stays solid; Edit, Export and Load use `subtle` with a light border and muted text; format, bookmark, AI, copy, clear and view tools use transparent `quiet` controls. Hover restores full foreground contrast, and pressed/open states use the active surface without competing with Run. Existing default/outline/ghost variants retain their behavior outside these selected surfaces. Thus the prototype's 30px Run and 46px toolbar are approved reference dimensions, not current React measurements. Toolbars, execution menus and execution tooltips show action labels without shortcut hints; the actual editor and global key bindings, including custom AI shortcuts, remain available through the shortcut settings. The global input guard permits only the configured AI action with Cmd/Ctrl/Alt inside the editable SQL CodeMirror context; ordinary form input and other input shortcuts remain protected. Connection form Test/Cancel/Save buttons use shared 32px controls, grouped at the end of a footer matching the Sheet surface.
- **Federation:** `FederationChip` is a 28px bordered label with attachment aliases and a tooltip describing the query type and connections. It is not the prototype's source-switching menu. Do not infer per-column lineage from its presence.
- **Results and provenance:** Real `DuckdbColumnType` metadata flows through `useDataGridColumns` → `DataGrid` → `GridHeader` → `ColumnHeader`. Headers show the returned type and origin, with full source identifiers in the detail tooltip. `api/core/services/query_lineage.py` resolves the original SQL against schemas read from named relations while the query connection and its attachments remain available; output positions, not matching output names, bind lineage. Local/federated SQL and JOIN response metadata can carry `column_types[].lineage` with `direct`, `derived`, `constant` or `unresolved`. Direct fields name their origin; derived expressions retain resolved input sources; only literal, boolean and NULL expressions are constants. A source-free expression is not automatically a constant. Unsupported or unresolvable metadata remains unknown (`unresolved`), never guessed from query-level attachments or optimizer temporary tables. This is not an arbitrary-SQL parser guarantee or validation of every external database engine. Desktop export and async-result download save dialogs start in the system Downloads directory resolved by Tauri `downloadDir`, with filenames joined by the platform path API; the existing save dialog, user-selected destination, cancellation and web download branches remain available.
- **Running query adoption:** After three seconds, the workspace offers a user-triggered move to Runs. `foreground_queries.py` tracks eligible read-only synchronous local/federated queries by `X-Request-ID`; save-as-table and write operations are excluded. `POST /api/query/background/{request_id}` assigns the running execution to a task under a lock, without cancelling or replaying SQL; an already-finished execution returns 409. The original HTTP worker continues and writes its response as a durable JSON snapshot, retaining values, decimal strings, row-range semantics and column metadata. The frontend stops only its HTTP wait after successful adoption. `GET /api/async-tasks/{task_id}/result` restores that snapshot through the existing result grid, with a `TableSource` reconstructed from retained attachments. Ordinary async tasks retain their result-table preview/download flow. Cancellation targets the original synchronous query; retry deliberately starts a new ordinary task, preserves the row-range choice and attachments, and removes the original `request_id`, snapshot kind and original-start metadata.
- **Bookmarks:** Saved queries use a neutral title and outline star, localized neutral query-type labels and a compact divided list. SQL previews retain the original SQL and workspace payload, with the existing 9rem limit; usage counts, descriptions and locale-aware dates remain visible. Use is a quiet outline action and deletion remains explicitly confirmed. Both the full-width narrow Sheet and bounded desktop Sheet reuse the existing tokens.
- **Sources:** `DataSourcePage` provides an overview of local tables and saved connections. `DataSourceActions` exposes direct Import data and New connection actions in both the manager and workbench explorer, with file import as the default and paste/URL/server methods in the split-button menu. Import methods remain visible as tabs in the shared Sheet; connection creation/editing uses a separate title and Save connection/Save changes action, with Enter saving via the existing validated connection flow. Connection testing retains inline feedback only for the tested parameters. Explorer connection rows expose an edit button and context-menu action; closing editing returns to the existing workspace. Manager Browse tables reveals the exact connection, expands collapsed groups and clears search without loading or executing SQL. Successful imports return to the existing workbench and reveal the new local table; new connections reveal their tree node, while edits retain their original page. Existing query, grid, delete and advanced import behavior and desktop/demo gates are preserved.
- **Extensions:** Extension names, descriptions, statuses and 28px actions share the desktop row centerline, with usage text below. On narrow screens, name and actions share a row and the description follows. `ExtensionsPage` groups compact, divided rows by data-source and capability categories. `ExtensionCard` retains install progress/actions and SQL copying. Installed and bundled labels use backend state: a bundled label requires both bundled and installed; bundled availability alone is not installation evidence.
- **Settings:** All eight sections use `SettingsSectionHeader`: a shared 32px title/action row followed by a separate description, with no inherited card padding on the body. Inactive sections stay mounted. Narrow navigation scrolls horizontally; provider actions move together below provider metadata when its container is too narrow. The root layout has a full-width page title, followed by section navigation alongside the selected content. Sources, Extensions and Settings share 20px page titles, 28px top spacing, responsive 16px/32px side padding and a max-w-6xl content width. AI configuration, shortcuts, query results, grid display, engine compatibility, storage and cache remain represented; About follows the desktop gate and AI follows the demo gate. Sections stay mounted and hidden when inactive to preserve form state while switching sections. This is not a promise of persistence across app reloads.
- **Runs:** Header title/refresh/close share a 32px row; filters and search share another 32px row when space allows. Search/status filtering updates both the empty state and footer count. Download format indicators and labels share a 20px line box. The rail opens the existing async-task panel. All / Running / Completed / Failed filters operate on task state; Running includes pending and cancelling tasks. Snapshot preview restores the existing result surface, while ordinary task actions keep their established paths.
- **Command palette:** Search includes the displayed localized label via cmdk keywords, while keeping stable English identifiers and SQL/table values. Normal cmdk items carry `data-disabled="false"`; disabled styling must match `[data-disabled=true]`, never attribute presence. A mobile-only rail entry keeps the palette, theme and language actions reachable when the desktop status bar is hidden. `CommandPalette` uses Radix/cmdk via `CommandDialog`, with a 52px input, 36px items, `top-24` (96px) and `max-w-2xl` (672px). The prototype's 14vh placement and 640px width remain design reference values. Current results include operations, tables and recent SQL; do not describe universal coverage of every action or saved query as verified.
- **Responsive behavior:** `AppRail` / `PageShell` use the 640px `sm` breakpoint: below it, navigation sits at the bottom (52px) and status is hidden; at and above it, the left rail and status bar return. At viewport widths up to and including 900px, `QueryWorkspace` collapses the explorer and opens it in a left Sheet (320px, capped at 88vw); AI uses a right Sheet (full width, capped at 448px) instead of the desktop dock. The refreshed mobile capture shows bottom navigation; the mobile-explorer capture shows the source overlay; the 768px tablet capture shows left navigation with the explorer collapsed. Query tabs and result data retain horizontal overflow on narrow screens; action toolbars wrap and use container-based label visibility. The prototype's 980px/820px container-menu transformations are not claimed.
- **Motion:** React's shared duration tokens remain 150/200/300/500ms, with component-specific transitions. The prototype's single easing and 120–260ms timing vocabulary is design intent, not a verified global runtime contract.

#### Evidence and remaining gaps

Documentation refreshed from current source, `PRODUCT.md`, `/tmp/duckquery-round2-review.txt`, and the parent task's latest completion report. The review packet predates the final cancellation, retry and page refinements; current source and the later report supply those updates. This documenter performed local source and document consistency checks only, without a browser, external API call or functional-test rerun. The parent task owns full tests and functional review; prior test totals in the packet are not presented as fresh results for the final tree.

Parent-reported runtime evidence: the original configured AI provider was used only in an isolated backend, with the synthetic `redesign_clipboard_acceptance` table as scope. Its real query result was East 2700.00 and North 1280.50; inserting and rerunning the returned SQL matched. No provider credentials are recorded here. A generated billion-row sum moved while still executing, the original SQL appeared once in the query log, the task completed and its snapshot restored. A separate real cancellation interrupted the original synchronous query and reached cancelled status. These observations support the exercised paths; screenshots alone do not prove concurrency correctness.

Available parent-supplied captures in `.impeccable/review/`: `sources.jpg`, `sources-mobile.jpg`, `extensions.jpg`, `settings.jpg`, `settings-mobile.jpg`, `runs.jpg`, `ai-real-result.jpg`, `background-result.jpg` and `lineage-federated.jpg`. They document the named surfaces and results, not untested interactions. Earlier `desktop.jpg`, `desktop-light.jpg`, `mobile.jpg`, `mobile-explorer.jpg` and `tablet.jpg` remain historical shell/responsive evidence. The AI mobile recapture is pending parent confirmation and is excluded from accepted evidence even if an older file exists.

The prototype's timer-driven slow-query scene remains a simulation; current React adoption has separate source and parent-reported runtime evidence. No arbitrary SQL lineage coverage, untested external-engine compatibility, complete accessibility conformance, pixel-identical prototype parity, release or deployment is claimed. Contract and call-chain details are maintained in `docs/API_CONTRACT_FE_BE.md` and `docs/ARCHITECTURE_CALL_MAP.md`.

## Do's and Don'ts

### Do:
- Keep controls on a shared horizontal centerline. Use the same height within an action row (28px compact, 32px with form fields). Measure bounding boxes in the browser; do not compensate with per-control translations or margins. This is an explicit user preference from 2026-10-12.
- **Do** build every surface from the three-step ground (#0F1115 / #16191F / #1E222A) separated by 1px rules (#262B34); in light, #FBFBFC / #F3F4F6 / #E9ECF0 with #E1E4E9 rules.
- **Do** keep Run as the only orange-filled control: 30px high, 6px radius, with its ⌘↵ hint.
- **Do** set SQL, identifiers, grid data, counts, durations and shortcuts in JetBrains Mono, and every other word in Inter at 13px / 20px.
- **Do** right-align numeric grid columns with tabular figures and show type and source under each column name.
- **Do** give every interactive element a visible 2px orange focus ring (offset 1px) and a hover tint of the next surface step.
- **Do** show state with a dot, an outlined pill or a semantic tint of the ground, always paired with a word.
- **Do** keep controls at 6px radius, containers at 10px and floating overlays at 12px, with keyboard hints as small mono `kbd` keys.
- **Do** design both themes and both languages (zh and en) together.

### Don't:
- **Don't** use large orange fills, orange navigation pills, orange cards or orange section backgrounds.
- **Don't** add drop shadows to cards, list rows or panels; depth at rest is a border or a surface step.
- **Don't** use Inter for data or JetBrains Mono for prose, labels or buttons.
- **Don't** use uppercase, letter-spaced eyebrow labels; labels are sentence case in muted slate.
- **Don't** use `faint` for text a user must read.
- **Don't** colour a chart series orange; the accent belongs to the chrome.
- **Don't** introduce a new radius, a new neutral or a second accent hue to solve one screen's problem.

### Native macOS verification (2026-10-12)

The current source was packaged as an isolated Tauri macOS app with its own frozen backend. Actual native file selection imported CSV and both Excel sheets; native save dialogs wrote CSV and asynchronous Parquet, with values verified from the files. Eight settings sections, sixteen extension rows and the Runs header/filter rows were measured in the native WebKit inspector: shared row center deltas were 0 CSS px. Real windows at 1280×800 and 900×800 were checked; the narrower Runs table retains horizontal scrolling to its action column. SQLite installation, About/update checking, task submission, and a 2×2 grid clipboard round trip were exercised. A localized command-search defect found during the native pass was fixed, rebuilt and replayed in the desktop app.

- **Secondary surface parity (2026-10-13):** Settings, data-source pages and modal footers use the same primary/subtle/quiet action levels. Save/confirm/import/download keep solid primary controls; test/cancel/back/add/apply keep subtle borders; reset/clear/view/copy/refresh helpers use quiet text. Quiet hover changes the foreground without a separate filled tile; pressed/open backgrounds and keyboard focus rings remain. Connection Pencil icons use a 1.5px stroke with their existing hit areas. The duplicate AI rail destination is removed on desktop and mobile; workbench AI and command palette remain. Execution/AI shortcut hints are removed from toolbars, execution menus and tooltips while all real key bindings and shortcut settings remain intact.

  Connection-row hover is also suppressed while the pointer is inside its trailing action area (`data-tree-actions`). This applies only to unselected rows that have actions; ordinary row hover and selected-row emphasis remain unchanged.

- **SQL completion and AI review (2026-10-13):** Automatic completion waits 180 ms and requires a name prefix or qualifier dot outside literals and comments. Metadata only refreshes an existing completion. FROM/JOIN prioritize relations; expression clauses prioritize fields; qualified names use the SQL language alias resolver. AI SQL actions open a read-only CodeMirror merge preview with original/suggestion labels, semantic removal/addition highlights and the established Cancel/Apply controls. Narrow windows stack both panes. Cancel preserves the target draft; Apply validates the concrete SQL tab and unchanged draft before using the existing inserter, without executing.

  Relation-name completion uses CodeMirror CompletionResult.filter=false with its update/getMatch hooks to supply exact prefixes. Only schema relations/namespaces and prefixed built-ins are shown; keyword/type vocabulary and global fields are excluded there. After a completed relation, clause keyword completion remains available.

- **AI panel refinement (2026-10-13):** The shared textarea, more-actions control and Send/Stop button sit in one focused composer. It grows from two to five visible lines, preserving Enter send, Shift+Enter newline, IME composition and @ selection. Empty-state Explain/Optimize actions fill an editable draft without sending. The current scope strip shows the source, first table and additional count, with separate edit/remove controls and full names in accessible labels/titles. History scope labels and request permissions remain unchanged. Existing detailed instructions live in an expandable usage guide.
- **AI scope row density (2026-10-14):** Each scope control keeps its source and table summary on one 28px line, separated by a quiet dot. Long names truncate within that line; edit/remove controls, full-name titles and scope behavior are unchanged.
  Add-source is a 28px square plus button with the existing localized action name in its accessible label and shared hover/focus tooltip. The strip uses 4px gaps and vertical padding, with 8px horizontal padding.

  Desktop and mobile AI slots keep separate DOM references so a closing sheet cannot clear the active desktop dock; conversations and drafts stay with the existing singleton.
