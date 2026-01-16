# Pivot Table Implementation Tasks

## Backend Tasks
- [x] **Verify & Optimize API** <!-- id: 100 -->
    - [x] Check `visual_query_generator.py` for current Pivot logic.
    - [x] **Refactor**: Implement `Dynamic PIVOT` logic (remove mandatory `IN` clause constraint).
    - [x] **Security**: Verify `_quote_identifier` usage for all dynamic column paths.
    - [x] **Limits**: Add default `LIMIT 10000` to generated SQL to prevent browser crash.
    - [x] **Test Cases (`tests/test_pivot_queries.py`)**:
        - [x] Dynamic Columns: verify PIVOT generates columns without `manual_column_values`.
        - [x] Aggregation: verify switching SUM/AVG/COUNT.
        - [x] Security: verify handling of column names with quotes/spaces.
        - [x] Limits: verify `LIMIT` is applied.

## Frontend Tasks
- [x] **Infrastructure & Integration** <!-- id: 200 -->
    - [x] Update `src/QueryWorkbenchPage.tsx` to include `PivotWorkbench` tab.
    - [x] Define common i18n keys (`pivot.*`) in `public/locales/common.json`.
    - [x] **Check**: Verify `useAppShell` integration for global state.
- [x] **Pivot Workbench State** <!-- id: 201 -->
    - [x] Implement `PivotWorkbench` container.
    - [x] Create `usePivotQuery` hook using **TanStack Query** (key: `['pivot', 'result', hash]`).
        - [x] Implement `getCacheConfig()` usage if applicable.
        - [x] Handle `isLoading`, `isError`, `data` states.
    - [x] Integrate `useTableColumns` (existing) for field list.
- [x] **UI Components (Shadcn + Tailwind)** <!-- id: 202 -->
    - [x] **FieldsPanel**: Draggable list (using `@dnd-kit`).
    - [x] **DropZones**: Row/Col/Value zones with visual feedback.
    - [x] **ValueConfig**: Popover to change Aggregation Function (Sum/Max/Avg).
    - [x] **Styling**: Strictly use Tailwind semantic classes (`bg-muted`, `border-border`).
- [x] **Data Grid Implementation** <!-- id: 203 -->
    - [x] Setup `AgGridReact` with `theme="legacy"`.
    - [x] **Memoization**: exact wrappers for `gridOptions` and `defaultColDef`.
    - [x] **Dynamic Columns**: Logic to map API result keys to `columnDefs`.
    - [x] **Large Data**: Enable AG Grid virtualization (ensure explicit container height).
    - [x] **UX**: Handle Loading (Skeleton) and Error/Empty states.

## Verification & Testing
- [x] **Backend Tests** <!-- id: 300 -->
    - [x] Unit tests for `generate_visual_query_sql` with Dynamic Pivot mode.
- [ ] **Frontend Tests** <!-- id: 301 -->
    - **Interaction**: Test dragging field to DropZone updates config state.
    - **Integration**: Mock API response and verify Grid renders correct columns.
    - **Edge Cases**: Test empty result, API error, switching tables.
- [ ] **E2E Check** <!-- id: 302 -->
    - Flow: Open Pivot Tab -> Select Table -> Drag 'Year' to Cols -> Run -> Verify '2022' column exists.
    - Check for "Truncated" warning if result exceeds limit.

## Documentation
- [ ] **Update AGENTS Doc** <!-- id: 400 -->
    - Add note in `AGENTS.md` clarifying `src` flat structure compliance.
