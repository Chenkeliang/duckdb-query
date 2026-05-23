# Pivot Table Requirements

> **状态（2026-05）**：核心功能已上线；Docker E2E 仍为可选验收项（见 `tasks.md`）。

## Overview

透视表：用户通过拖拽配置行、列、聚合值，由 DuckDB `PIVOT` 生成结果；入口为查询工作台 **「透视表」** Tab。

## User stories

1. 从数据源选择表并查看字段列表。
2. 将字段拖入 Rows / Columns / Values 并选择聚合函数（SUM、COUNT、AVG 等）。
3. 生成 SQL 或预览结果，在结果区 DataGrid 中查看。
4. 动态列由引擎生成，无需手写 `IN (...)` 列表（可选 `manual_column_values`）。

## Functional requirements

### 1. Data selection

- [x] 从全局数据源侧栏或工作台上下文选择表。
- [x] 字段列表随表切换刷新（`useTableColumns` 等）。

### 2. Configuration UI

- [x] 拖拽：行 / 列 / 值区域（`PivotTableDesigner`）。
- [x] 聚合：`COUNT`、`SUM`、`AVG`、`MIN`、`MAX`、`COUNT_DISTINCT`。
- [x] 可选筛选：`PivotFilters`（WHERE 条件）。

### 3. Query generation and execution

- [x] 后端动态 `PIVOT`（`pivot_query_generator`）。
- [x] `POST /api/pivot-query/generate` 与 `/preview`。
- [x] 外部库：`attach_databases` 联邦预览。

### 4. Result display

- [x] TanStack DataGrid（`DataGridWrapper`），虚拟滚动。
- [x] Loading / error / empty 经 `ResultPanel` 统一展示。
- [ ] Docker E2E：选表 → 配置 → 预览 → 列正确（可选，见 `tasks.md`）。

## Non-functional requirements

- **Performance**：生成 SQL 应即时；执行取决于数据量，服务端默认 LIMIT。
- **Usability**：`@dnd-kit` 拖拽；与暗色主题一致。
- **Consistency**：仅 shadcn/ui + Tailwind；图标 lucide-react。

## Technical constraints

### Frontend

- **数据**：TanStack Query v5；透视预览 key `['pivot-preview', …]`。
- **UI**：shadcn/ui + Tailwind；禁止自定义 CSS 文件、硬编码 hex、`ag-grid-*`。
- **结果网格**：**TanStack DataGrid**（`Query/DataGrid`），`columns` / 配置对象 `useMemo` 稳定化。
- **i18n**：`useTranslation('common')`；禁止硬编码 UI 文案。
- **API**：仅经 `@/api` 的 `pivotQueryApi`（`apiClient` + `normalizeResponse`）。

### Integration

- [x] `QueryWorkbenchPage` / `QueryTabs` 透视 Tab → `PivotPanel`。
- [x] 复用 `useDuckDBTables`、`useTableColumns`；不重复造表元数据 API。

### Safety

- [x] 后端标识符转义/引用。
- [x] 行数上限与 `warnings`（与 `max_query_rows` 对齐）。

## Acceptance criteria

### Functional

- [x] 选表 → 拖入行/列/值 → 预览 → 结果列与配置一致。
- [x] 切换聚合函数后预览数值更新。
- [x] 切换基表后配置可重置/清空。

### Technical

- [x] 后端单测：`test_pivot_query_generator.py`、`test_pivot_query_api.py`。
- [x] 前端：`buildPivotQueryPayload.test.ts`、`pivotQueryApi.test.ts`。
- [x] 无 AG Grid 依赖；无 `frontend/src/new/` 路径。
