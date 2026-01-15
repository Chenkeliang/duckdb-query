# Pivot Table Implementation Tasks

## Backend Tasks
- [ ] **Verify Existing API** <!-- id: 100 -->
    - Check `visual_query_generator.py` for current Pivot logic.
    - Create a test case in `tests/test_pivot_queries.py` to assert current behavior.
- [ ] **Implement Dynamic PIVOT Optimization** <!-- id: 101 -->
    - Refactor `_try_generate_native_pivot` to support dynamic column generation (remove `IN` clause requirement).
    - Update `generate_visual_query_sql` to bypass auto-sampling when dynamic pivot is applicable.
    - Verify with unit tests.

## Frontend Tasks
- [ ] **Create Pivot Workbench Skeleton** <!-- id: 200 -->
    - Create `src/Query/PivotWorkbench.tsx`.
    - Implement basic layout (Sidebar, Config Panel, Results).
    - Add route/tab integration in `App.tsx` or `QueryWorkbenchPage.tsx`.
- [ ] **Implement Drag-and-Drop Logic** <!-- id: 201 -->
    - Setup `@dnd-kit` contexts (DndContext, DragOverlay).
    - Create Draggable `FieldItem` components.
    - Create Droppable `DropZone` components for Rows, Columns, Values.
    - Implement `onDragEnd` logic to update state.
- [ ] **Implement Value Configuration** <!-- id: 202 -->
    - Add UI to change aggregation function (SUM -> AVG, etc.) on dropped value items.
    - (Optional) Add alias editing.
- [ ] **Integrate Backend API** <!-- id: 203 -->
    - Create `usePivotQuery` hook using `useAppShell` or `react-query`.
    - Connect "Run Analysis" button to `generate_visual_query` API.
    - Handle loading states and errors.
- [ ] **Render Results** <!-- id: 204 -->
    - customized `AgGrid` or `DataGrid` to display dynamic columns.
    - Verify column headers match the pivoted values.

## Verification
- [ ] **End-to-End Test** <!-- id: 300 -->
    - Select table -> Drag Fields -> Run -> Verify Grid.
    - Verify dynamic columns appear without manual configuration.
