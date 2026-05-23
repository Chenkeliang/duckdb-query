# Pivot Table Implementation Tasks

> **2026-05**：现行路径 `PivotPanel` → `pivotQueryApi` → `POST /api/pivot-query/*`；结果区为 TanStack `DataGrid`（非 AG Grid）。

## Backend Tasks
- [x] **Verify & Optimize API** <!-- id: 100 -->
    - [x] `pivot_query_generator.py` + `pivot_query_sql_common.py`
    - [x] Dynamic `PIVOT`（无强制 `IN` 列表）
    - [x] `_quote_identifier` 用于动态列路径
    - [x] 生成 SQL 默认 `LIMIT` 防浏览器过载
    - [x] 测试：`tests/test_pivot_query_generator.py`、`tests/test_pivot_query_api.py`

## Frontend Tasks
- [x] **Integration** <!-- id: 200 -->
    - [x] `QueryWorkbenchPage` 透视 Tab → `PivotPanel`
    - [x] i18n `pivot.*`（`frontend/src/i18n`）
    - [x] `buildPivotQueryPayload` + `usePivotQuery` / `useGeneratePivotSQL`
- [x] **UI** <!-- id: 202 -->
    - [x] `PivotTableDesigner`、`PivotFilters`、字段拖拽
    - [x] shadcn/ui + Tailwind（无自定义 CSS）
- [x] **Results** <!-- id: 203 -->
    - [x] 查询结果经 `ResultPanel` → `DataGridWrapper`（TanStack DataGrid）
    - [x] Loading / Error / Empty 状态

## Verification & Testing
- [x] **Backend Tests** <!-- id: 300 -->
    - [x] `generate_pivot_query_sql`、API smoke、路由注册
- [x] **Frontend Tests** <!-- id: 301 -->
    - [x] `buildPivotQueryPayload.test.ts`
    - [x] `pivotQueryApi.test.ts`（generate / preview 路径与解包）
    - [ ] 拖拽交互 E2E（可选）
- [ ] **E2E** <!-- id: 302 -->
    - Docker 下：选表 → 配置透视 → 生成/预览 → 结果列正确

## Documentation
- [x] **AGENTS / 契约** <!-- id: 400 -->
    - `AGENTS.md`、`docs/API_CONTRACT_FE_BE.md` §7
