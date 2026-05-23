# Pivot Table Technical Design

> **2026-05**：现行实现 `QueryTabs` → `PivotPanel` → `pivotQueryApi` → `POST /api/pivot-query/*`；结果区为 TanStack `DataGrid`（`ResultPanel` → `DataGridWrapper`）。

## Architecture Overview

```mermaid
graph TD
    User[User] -->|Drag and drop| PivotPanel[PivotPanel UI]
    PivotPanel -->|preview / generate| API[pivot_query router]
    API -->|SQL| Generator[pivot_query_generator]
    Generator -->|execute| DuckDB[DuckDB Engine]
    DuckDB -->|rows| API
    API -->|JSON| PivotPanel
    PivotPanel -->|shared result| ResultPanel[ResultPanel / DataGridWrapper]
```

## Backend Design

### API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/pivot-query/generate` | 生成透视 SQL |
| `POST` | `/api/pivot-query/preview` | 预览透视结果 |

Models: `api/models/pivot_query_models.py`；SQL：`pivot_query_generator.py` + `pivot_query_sql_common.py`。

### SQL generation

- 优先 DuckDB 动态 `PIVOT`（无强制 `IN` 列表）；可选 `manual_column_values`。
- 标识符经 `_quote_identifier` 转义；默认 `LIMIT` 防止浏览器过载。
- 联邦表：请求体 `attach_databases`（与 `federated_attach.execute_sql_with_attach` 一致）。

## Frontend Design

### Entry and component tree

```text
QueryWorkbenchPage
└── QueryTabs (tab: pivot)
    └── PivotPanel
        ├── PivotSidebar          # 字段列表（useTableColumns）
        ├── PivotTableDesigner    # 行/列/值拖拽区
        ├── PivotFilters          # 可选 WHERE（PivotFilters）
        ├── PivotConfigArea       # 运行 / 生成 SQL
        └── buildPivotQueryPayload → pivotQueryApi
```

查询结果与 SQL/JOIN 共用 **`ResultPanel`**，不单独嵌网格。

### State and data fetching

| Hook / API | Role |
|------------|------|
| `useGeneratePivotSQL` | `generatePivotQuery` → 展示 `final_sql` |
| `usePivotQuery` | `previewPivotQuery`；`queryKey: ['pivot-preview', config, pivotConfig, limit]` |
| `buildPivotQueryPayload` | 组装 `PivotQueryConfig` + `PivotConfig` |

TanStack Query：`staleTime` 5 分钟；表数据变更后由 `invalidateAfterTableCreate` 等统一失效。

### Results grid (TanStack DataGrid)

- **禁止** AG Grid；使用 `frontend/src/Query/DataGrid/DataGrid.tsx`（经 `DataGridWrapper`）。
- 动态列：由预览响应 `columns` / `data` 驱动；`columns` 引用须 `useMemo` 稳定化。
- 虚拟滚动：`@tanstack/react-virtual`；大结果受后端 `limit` 与 `max_query_rows` 约束。

### Styling and i18n

- shadcn/ui + Tailwind only；文案 `t('query.pivot.*')` / `t('pivot.*')`（`common` namespace）。

## Security and limits

- 注入防护：后端 quote 所有动态标识符。
- 行/列上限：后端 `warnings`；前端 `useAppConfig().maxQueryRows` 对齐预览 limit。
