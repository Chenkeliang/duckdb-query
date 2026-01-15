# Pivot Table Requirements

## Overview
Implement a fully functional **Pivot Table** feature powered by DuckDB's `PIVOT` statement. This feature will allow users to perform multidimensional data analysis by interactively dragging and dropping columns to configure Rows, Columns, and Values, providing a familiar and intuitive experience similar to Excel or BI tools.

## User Persona
- **Data Analyst**: Needs to quickly summarize large datasets to find trends.
- **Business User**: Wants an easy-to-use interface to slice and dice data without writing complex SQL.

## User Stories
1.  **As a user**, I want to select a table from my data sources and see a list of available fields so that I can start my analysis.
2.  **As a user**, I want to drag fields into "Rows", "Columns", and "Values" areas to dynamically construct a pivot table.
3.  **As a user**, I want to change the aggregation function (SUM, AVG, COUNT, etc.) for value fields to answer specific questions.
4.  **As a user**, I want to see a live preview (or click "Run") to view the pivoted results in a data grid.
5.  **As a user**, I want the system to handle dynamic columns automatically, without me needing to manually specify every possible column value.

## Functional Requirements
### 1. Data Selection
- [ ] Users must be able to select a data source (table) from the existing global sidebar or a dedicated dropdown.
- [ ] Upon selection, the "Fields" panel must populate with all columns from the table.

### 2. Configuration Interface
- [ ] **Drag and Drop**: Support standard drag-and-drop interaction for moving fields from the list to configuration zones.
- [ ] **Drop Zones**:
    - **Rows**: Fields to group by (Vertical axis).
    - **Columns**: Fields to pivot on (Horizontal axis).
    - **Values**: Fields to aggregate (Cells).
- [ ] **Aggregation Selection**: Users can click/context-click on a Value field to select functions: `SUM`, `COUNT`, `AVG`, `MIN`, `MAX`, `COUNT_DISTINCT`.

### 3. Query Generation & Execution
- [ ] **Dynamic PIVOT**: The backend must use DuckDB's dynamic `PIVOT` syntax (or equivalent optimized method) to handle varying column values automatically.
- [ ] **Performance**: Avoid multi-step "sampling + explicit IN clause" generation if possible; rely on DuckDB's engine for efficiency.
- [ ] **Filtering**: (Phase 2) Support pre-aggregation filters.

### 4. Result Display
- [ ] Render results in a high-performance data grid (e.g., Ag-Grid).
- [ ] Handle potential null values gracefully.
- [ ] Support large number of columns if the pivot results in many distinct values (with pagination or virtual scrolling).

## Non-Functional Requirements
- **Performance**: Query generation should be near-instant; execution depends on dataset size but should be optimized.
- **Usability**: The drag-and-drop feel must be smooth and intuitive (using `@dnd-kit`).
- **Consistency**: The UI must match the application's dark theme and design language.

## Technical Constraints (Strict)
### Frontend Stack
- **State/Data**: Must use **TanStack Query (v5)** for all async data.
    - Query Keys must be structured and descriptive (e.g., `['pivot', 'result', hash]`).
- **UI Components**:
    - Build with **Shadcn UI** + **Tailwind CSS**.
    - **Prohibited**: Custom CSS files, hardcoded hex colors (use semantic `bg-background`, `text-primary`), old MUI components.
    - Icons: **Lucide React** only.
- **Data Grid**:
    - Library: **AG Grid React**.
    - Theme: Must use `theme: 'legacy'` to match existing project style.
    - Performance: `gridOptions` and `defaultColDef` must be memoized (`useMemo`) to prevent render loops.
- **i18n**: All UI text must use `useTranslation('common')`. Hardcoded strings are forbidden.

### Integration
- **Entry Point**: Must integrate into `QueryWorkbenchPage` as a sub-view or parallel tab, reusing `useAppShell` context.
- **Data Source**: Re-use existing hooks (e.g., `useDuckDBTables` or `useTableColumns`) for fetching fields; do not create redundant APIs.

### Safety & Limits
- **Sanitization**: All identifiers (table/column names) passed to backend must be properly quoted/escaped.
- **Result Limits**: Backend should enforce a row/column limit (e.g., 10k rows) to prevent browser crashes, with clear UI truncation indicators.
