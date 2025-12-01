# Requirements Document

## Introduction

本需求文档描述将 DuckQuery Demo（`docs/demo/`）的 UI 样式和交互模式迁移到真实项目 `/new` 目录的功能需求。Demo 使用原生 HTML + Tailwind CSS CDN + Lucide Icons + 原生 JavaScript 实现，目标是将其转换为 React + Tailwind CSS + shadcn/ui 风格组件，同时保留现有项目的功能逻辑和 API 集成。

## Key Technical Decisions

### 0. 技术栈前置条件

**本 spec 依赖 `shadcn-integration` 已完成**，包括：
- ✅ TypeScript 已配置（支持 `.tsx` 文件）
- ✅ TanStack Query 已配置（统一数据管理）
- ✅ shadcn/ui 组件已创建（所有基础 UI 组件）
- ✅ 所有新组件必须使用 TypeScript（`.tsx`）
- ✅ 所有数据获取必须使用 TanStack Query（`useQuery/useMutation`）

### 1. shadcn/ui 的作用

shadcn/ui 在本项目中的作用是**设计系统参考**，而非直接使用其组件库：

- **设计理念采用**: 采用 shadcn/ui 的设计理念（CSS 变量 + Tailwind 语义化类名）
- **组件模式参考**: 参考 shadcn/ui 的组件结构和交互模式
- **直接使用**: 使用 `shadcn-integration` 中创建的 shadcn/ui 组件（`.tsx` 格式）
- **原因**: 项目已有完整的设计系统（tailwind.css + tailwind.config.js），统一使用 shadcn/ui 组件

### 1.1 可调整大小面板的实现

**使用 react-resizable-panels 库**：

项目使用 `react-resizable-panels` 实现可调整大小的面板布局，而非手写拖拽逻辑：

- **库选择**: react-resizable-panels (shadcn/ui 生态推荐)
- **优势**: 
  - 声明式 API，易于使用
  - 自动处理拖拽、折叠、展开逻辑
  - 支持键盘导航和可访问性
  - 性能优化（使用 ResizeObserver）
  - 支持持久化面板大小
- **应用场景**:
  - 数据源面板的水平调整大小和折叠
  - 结果面板的垂直调整大小和折叠
  - 查询工作台的三栏布局

**实际应用方式**:
```jsx
// 不使用 shadcn/ui 的 Button 组件
// import { Button } from "@/components/ui/button"

// 而是使用项目设计系统的语义化类名
<button className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
  执行
</button>
```

### 2. Demo JS 交互逻辑的迁移策略

Demo 中的原生 JS 交互逻辑将按以下方式迁移到 React：

| Demo JS 功能 | React 实现方式 |
|-------------|---------------|
| `AppState` 全局状态 | `useDuckQuery` Hook 扩展 |
| `selectTable()` 函数 | `onTableSelect` 回调 prop |
| `switchThirdTab()` 函数 | `useState` + `onTabChange` 回调 |
| `toggleDataSourcePanel()` 函数 | `useState` + `onToggleCollapse` 回调 |
| `initUnifiedResizer()` 拖拽 | 自定义 `useResizer` Hook |
| `initHorizontalResizer()` 拖拽 | 自定义 `useResizer` Hook |
| `updateJoinContent()` 动态渲染 | React 组件条件渲染 |
| `createTableCard()` DOM 操作 | React 组件 `<TableCard />` |
| `lucide.createIcons()` 图标初始化 | `lucide-react` 组件直接使用 |

**示例迁移**:
```javascript
// Demo 原生 JS
function selectTable(tableName, evt) {
  const currentTab = AppState.currentTab;
  const tables = AppState.selectedTables[currentTab];
  // ... 状态更新逻辑
  updateTreeSelection();
  updateContentArea();
}
```

```jsx
// React 实现
const DataSourcePanel = ({ selectedTables, onTableSelect, currentTab }) => {
  const handleTableDoubleClick = (tableName) => {
    onTableSelect(tableName, currentTab);
  };
  
  return (
    <div className="tree-item" onDoubleClick={() => handleTableDoubleClick(tableName)}>
      {/* ... */}
    </div>
  );
};
```

### 3. AG-Grid 与新 UI 样式的兼容

老功能使用 AG-Grid 显示数据表格，新 UI 需要保持功能同时应用新样式：

**方案**: 使用 AG-Grid 的主题定制功能，创建符合项目设计系统的自定义主题

```css
/* 在 tailwind.css 中添加 AG-Grid 主题覆盖 */
.ag-theme-duckquery {
  --ag-background-color: var(--dq-surface);
  --ag-header-background-color: var(--dq-muted);
  --ag-odd-row-background-color: var(--dq-surface);
  --ag-row-hover-color: var(--dq-surface-hover);
  --ag-border-color: var(--dq-border);
  --ag-header-foreground-color: var(--dq-muted-fg);
  --ag-foreground-color: var(--dq-foreground);
  --ag-font-family: var(--dq-font-sans);
  --ag-font-size: 13px;
}
```

**或者**: 对于简单表格场景，使用 Demo 中的 `ide-table` 样式（已在 tailwind.css 中定义）

### 4. 项目架构设计

#### 4.1 目录结构

```
frontend/src/new/
├── Layout/                    # 布局组件（已有）
│   ├── Sidebar.jsx
│   ├── Header.jsx
│   └── PageShell.jsx
├── DataSource/                # 数据源管理（已有）
│   ├── DataSourcePage.jsx
│   ├── UploadPanel.jsx
│   ├── DatabaseForm.jsx
│   └── ...
├── QueryWorkbench/            # 查询工作台（新增）
│   ├── index.jsx              # 主入口，组合所有子组件
│   ├── DataSourcePanel/       # 数据源面板
│   │   ├── index.jsx
│   │   ├── TableTree.jsx
│   │   └── SearchInput.jsx
│   ├── QueryTabs/             # 查询模式 Tab
│   │   └── index.jsx
│   ├── VisualQuery/           # 可视化查询
│   │   ├── index.jsx
│   │   ├── ModeCards.jsx
│   │   ├── FieldSelector.jsx
│   │   ├── FilterBuilder.jsx
│   │   ├── GroupByBuilder.jsx
│   │   ├── SortBuilder.jsx
│   │   └── LimitConfig.jsx
│   ├── SQLQuery/              # SQL 查询
│   │   ├── index.jsx
│   │   ├── SQLEditor.jsx
│   │   └── QueryHistory.jsx
│   ├── JoinQuery/             # 关联查询
│   │   ├── index.jsx
│   │   ├── TableCard.jsx
│   │   └── JoinConnector.jsx
│   ├── SetOperations/         # 集合操作
│   │   ├── index.jsx
│   │   └── SetConnector.jsx
│   ├── PivotTable/            # 透视表
│   │   ├── index.jsx
│   │   ├── DimensionZone.jsx
│   │   └── ValueConfig.jsx
│   ├── ResultPanel/           # 结果面板
│   │   ├── index.jsx
│   │   ├── ResultToolbar.jsx
│   │   └── DataTable.jsx
│   └── shared/                # 共享组件
│       ├── Resizer.jsx
│       └── TableCard.jsx
├── AsyncTasks/                # 异步任务（新增）
│   └── index.jsx
└── hooks/                     # 自定义 Hooks
    ├── useQueryWorkbench.js   # 查询工作台状态
    └── useResizer.js          # 拖拽调整大小
```

#### 4.2 状态管理架构

```jsx
// hooks/useQueryWorkbench.js
const useQueryWorkbench = () => {
  // 从 useDuckQuery 获取全局状态
  const { state: globalState, actions: globalActions } = useDuckQuery();
  
  // 查询工作台本地状态
  const [localState, setLocalState] = useState({
    currentTab: 'visual',           // 当前查询模式
    selectedTables: {               // 每个模式的选中表
      visual: [],
      sql: [],
      join: [],
      set: [],
      pivot: []
    },
    panelWidths: {                  // 面板宽度
      datasource: 256,
      result: 400
    },
    panelCollapsed: {               // 面板折叠状态
      datasource: false,
      result: false
    },
    // 各模式的配置
    visualConfig: null,
    joinConfig: { joins: [] },
    setConfig: { operation: 'UNION' },
    pivotConfig: { rows: [], cols: [], values: [] }
  });
  
  // 返回状态和操作
  return {
    state: { ...globalState, ...localState },
    actions: {
      ...globalActions,
      setCurrentTab: (tab) => setLocalState(s => ({ ...s, currentTab: tab })),
      selectTable: (table, tab) => { /* ... */ },
      // ... 其他操作
    }
  };
};
```

#### 4.3 页面融合策略

新 UI 将三个页面融合为一个统一的查询工作台：

| 老 UI 页面 | 新 UI 位置 | 融合方式 |
|-----------|-----------|---------|
| 数据源管理 | 侧边栏导航项 | 保持独立页面 |
| 统一查询 | 查询工作台主体 | 核心功能区 |
| 表管理 | 数据源面板右键菜单 | 集成到数据源面板 |
| 异步任务 | Header 二级 Tab | 作为查询模式的子 Tab |

### 5. 后端 API 分析

#### 5.1 现有 API 评估

| API 端点 | 当前状态 | 是否需要改动 |
|---------|---------|-------------|
| `/api/duckdb/tables` | ✅ 稳定 | 不需要 |
| `/api/duckdb/tables/{name}` | ✅ 稳定 | 不需要 |
| `/api/duckdb/query` | ✅ 稳定 | 不需要 |
| `/api/async_query` | ✅ 稳定 | 不需要 |
| `/api/query` (performQuery) | ✅ 稳定 | 不需要 |
| `/api/visual-query/preview` | ✅ 稳定 | 不需要 |
| `/api/set-operations/execute` | ✅ 稳定 | 不需要 |

#### 5.2 结论

**后端 API 不需要改动**。原因：
1. 现有 API 已经满足所有功能需求
2. API 设计合理，职责清晰
3. 前端迁移只涉及 UI 层，不涉及数据层
4. 保持 API 稳定可以降低迁移风险

#### 5.3 未来优化建议（非本次范围）

如果未来需要重构 API，可以考虑：
1. 统一查询接口：将 `/api/duckdb/query`、`/api/query`、`/api/visual-query/preview` 合并
2. GraphQL 支持：对于复杂查询场景
3. WebSocket 支持：对于实时查询结果推送

### 6. 迁移注意事项

#### 6.1 功能完整性检查清单

- [ ] 可视化查询的所有配置项（字段选择、筛选、分组、排序、限制）
- [ ] SQL 查询的格式化、模板、历史记录功能
- [ ] JOIN 查询的类型选择、条件配置、类型冲突处理
- [ ] 集合操作的 UNION/INTERSECT/EXCEPT 支持
- [ ] 透视表的行/列维度、聚合函数配置
- [ ] 结果面板的分页、排序、导出功能
- [ ] 异步任务的状态轮询、结果预览

#### 6.2 样式一致性检查清单

- [ ] 所有颜色使用语义化类名（bg-surface, text-foreground）
- [ ] 所有圆角使用设计系统值（rounded-md, rounded-xl）
- [ ] 所有阴影使用设计系统值（shadow-sm, shadow-lg）
- [ ] 所有动画使用设计系统时长（duration-fast, duration-normal）
- [ ] 深色模式自动适配

#### 6.3 性能注意事项

- [ ] 大数据量表格使用虚拟滚动（AG-Grid 或 react-window）
- [ ] 避免不必要的重渲染（useMemo, useCallback）
- [ ] 拖拽调整大小使用 requestAnimationFrame
- [ ] 搜索输入使用防抖（debounce）

#### 6.4 兼容性注意事项

- [ ] 保持与老 UI 的 URL 兼容（支持 ?layout=new 参数）
- [ ] 保持与 useDuckQuery Hook 的接口兼容
- [ ] 保持与现有 API 的调用方式兼容

## Glossary

- **Demo**: 位于 `docs/demo/` 的静态 HTML 原型，展示 DuckQuery 的 UI 设计和交互模式
- **New Layout**: 位于 `frontend/src/new/` 的 React 组件，使用 Tailwind CSS 和项目设计系统
- **Query Workbench**: 数据查询工作台，包含可视化查询、SQL 查询、关联查询、集合操作、透视表等功能
- **DataSource Panel**: 数据源面板，显示可用的数据表和外部数据库连接
- **Visual Query Builder**: 可视化查询构建器，通过 UI 组件构建 SQL 查询
- **Design System**: 项目的设计系统，定义在 `tailwind.css` 和 `tailwind.config.js` 中的 CSS 变量和语义化类名
- **useDuckQuery Hook**: 项目的状态管理 Hook，集中管理数据和操作

## Requirements

### Requirement 1: Query Workbench 页面框架

**User Story:** As a developer, I want to create a Query Workbench page in the new layout, so that users can access all query features in a unified interface.

#### Acceptance Criteria

1. WHEN a user navigates to the Query Workbench page THEN the System SHALL display a three-column layout with sidebar, datasource panel, and main query area
2. WHEN the Query Workbench page loads THEN the System SHALL render a horizontal resizable datasource panel on the left side with a minimum width of 180px and maximum width of 600px
3. WHEN a user drags the horizontal resizer THEN the System SHALL adjust the datasource panel width in real-time without page refresh
4. WHEN the datasource panel width is dragged below 50px THEN the System SHALL collapse the panel and show an expand button
5. WHEN a user clicks the expand button THEN the System SHALL restore the datasource panel to its previous width

### Requirement 2: DataSource Panel 组件

**User Story:** As a user, I want to see all available data sources in a tree structure, so that I can quickly find and select tables for querying.

#### Acceptance Criteria

1. WHEN the DataSource Panel renders THEN the System SHALL display a searchable tree structure with DuckDB tables and external database connections
2. WHEN a user types in the search input THEN the System SHALL filter the tree items to show only matching table names
3. WHEN a user double-clicks a table item THEN the System SHALL select that table for the current query mode
4. WHEN a table is selected THEN the System SHALL highlight the table item with the primary color and update the selected state
5. WHEN a user clicks a database connection header THEN the System SHALL toggle the expansion state of that connection's table list
6. WHEN the DataSource Panel is in collapsed state THEN the System SHALL hide all content except the expand button with a vertical "数据源" label

### Requirement 3: Query Mode Tabs 组件

**User Story:** As a user, I want to switch between different query modes, so that I can use the most appropriate method for my data analysis needs.

#### Acceptance Criteria

1. WHEN the Query Workbench loads THEN the System SHALL display five query mode tabs: 可视化查询, SQL 查询, 关联查询, 集合操作, 透视表
2. WHEN a user clicks a query mode tab THEN the System SHALL switch to that mode's content panel and update the tab's active state
3. WHEN switching query modes THEN the System SHALL preserve the selected tables state for each mode independently
4. WHEN in 关联查询 or 集合操作 mode THEN the System SHALL allow multiple table selection
5. WHEN in 可视化查询, SQL 查询, or 透视表 mode THEN the System SHALL allow only single table selection

### Requirement 4: Visual Query Builder 组件

**User Story:** As a user, I want to build SQL queries visually, so that I can create complex queries without writing SQL code.

#### Acceptance Criteria

1. WHEN the Visual Query Builder renders THEN the System SHALL display a left sidebar with query mode cards (字段选择, 筛选条件, 分组聚合, 排序, 限制结果)
2. WHEN a user clicks a query mode card THEN the System SHALL show the corresponding configuration panel on the right side
3. WHEN a user modifies query parameters THEN the System SHALL update the generated SQL preview in real-time
4. WHEN a user clicks the Execute button THEN the System SHALL submit the query and display results in the result panel
5. WHEN a user adds a filter condition THEN the System SHALL render a row with field selector, operator selector, and value input
6. WHEN a user configures grouping THEN the System SHALL display group-by field list and aggregate function configuration

### Requirement 5: SQL Query Editor 组件

**User Story:** As a user, I want to write and execute raw SQL queries, so that I can have full control over my data queries.

#### Acceptance Criteria

1. WHEN the SQL Query Editor renders THEN the System SHALL display a resizable textarea with monospace font for SQL input
2. WHEN a user double-clicks a table in the DataSource Panel THEN the System SHALL insert the table name at the cursor position in the SQL editor
3. WHEN a user clicks the Format button THEN the System SHALL format the SQL code with proper indentation
4. WHEN a user clicks the Execute button THEN the System SHALL submit the SQL query and display results
5. WHEN the SQL Query Editor renders THEN the System SHALL display a query history section showing recent queries with status and execution time

### Requirement 6: Join Query Builder 组件

**User Story:** As a user, I want to visually build JOIN queries, so that I can combine data from multiple tables easily.

#### Acceptance Criteria

1. WHEN the Join Query Builder renders with selected tables THEN the System SHALL display table cards horizontally with join connectors between them
2. WHEN a user selects a join type THEN the System SHALL update the connector to show the selected join type (INNER, LEFT, RIGHT, FULL)
3. WHEN a user configures join conditions THEN the System SHALL display field selectors for both tables with an equals sign between them
4. WHEN a user removes a table from selection THEN the System SHALL remove the table card and update the join connectors
5. WHEN no tables are selected THEN the System SHALL display an empty state with instructions to double-click tables

### Requirement 7: Set Operations Builder 组件

**User Story:** As a user, I want to perform set operations on multiple tables, so that I can combine or compare datasets.

#### Acceptance Criteria

1. WHEN the Set Operations Builder renders with selected tables THEN the System SHALL display table cards with set operation connectors (UNION, INTERSECT, EXCEPT)
2. WHEN a user changes the set operation type THEN the System SHALL update the connector badge to show the selected operation
3. WHEN a user removes a table THEN the System SHALL remove the table card and update the connectors
4. WHEN no tables are selected THEN the System SHALL display an empty state with instructions

### Requirement 8: Pivot Table Builder 组件

**User Story:** As a user, I want to create pivot tables, so that I can analyze data with row and column dimensions.

#### Acceptance Criteria

1. WHEN the Pivot Table Builder renders THEN the System SHALL display configuration areas for row dimensions, column dimensions, and value aggregations
2. WHEN a user drags a field to the row dimensions area THEN the System SHALL add the field as a row dimension
3. WHEN a user drags a field to the column dimensions area THEN the System SHALL add the field as a column dimension
4. WHEN a user configures a value aggregation THEN the System SHALL display field selector and aggregation function selector
5. WHEN a user reorders dimensions THEN the System SHALL update the dimension order and regenerate the pivot query

### Requirement 9: Unified Result Panel 组件

**User Story:** As a user, I want to see query results in a unified panel with advanced filtering and sorting capabilities, so that I can analyze data effectively regardless of query mode.

**⚠️ 重要说明**：
现有的 `ModernDataDisplay.jsx` 是一个 **2400+ 行**的复杂组件，包含了很多高级功能。新的 Result Panel 必须保留这些功能，不能简化。详细迁移方案请参考：[RESULT_PANEL_MIGRATION.md](./RESULT_PANEL_MIGRATION.md)

#### Acceptance Criteria - 基础功能

1. WHEN a query executes successfully THEN the System SHALL display results in an IDE-style table with sticky headers
2. WHEN the result panel renders THEN the System SHALL display a toolbar showing row count, column count, and execution time
3. WHEN a user drags the vertical resizer THEN the System SHALL adjust the result panel height in real-time
4. WHEN a user clicks the collapse button THEN the System SHALL collapse the result panel to a minimal height
5. WHEN the result panel is collapsed THEN the System SHALL show an expand button to restore the panel

#### Acceptance Criteria - Excel 风格列筛选（必须保留）

6. WHEN a user clicks a column filter button THEN the System SHALL display an Excel-style filter menu with distinct values
7. WHEN the filter menu renders THEN the System SHALL show up to 1000 distinct values sorted by occurrence count
8. WHEN the filter menu renders THEN the System SHALL display the occurrence count for each distinct value
9. WHEN a user types in the filter search box THEN the System SHALL filter the distinct values list in real-time
10. WHEN a user clicks "全选" THEN the System SHALL select all distinct values in the current filter
11. WHEN a user clicks "反选" THEN the System SHALL deselect all currently selected values
12. WHEN a user clicks "重复项" THEN the System SHALL select only values that appear more than once
13. WHEN a user clicks "唯一项" THEN the System SHALL select only values that appear exactly once
14. WHEN a user toggles between "包含" and "排除" modes THEN the System SHALL update the filter logic accordingly
15. WHEN a user applies a column filter THEN the System SHALL filter the data and display only matching rows
16. WHEN multiple column filters are active THEN the System SHALL apply all filters with AND logic

#### Acceptance Criteria - 自动类型检测和智能排序（必须保留）

17. WHEN the System detects a column contains numeric values THEN the System SHALL sort that column numerically (not as strings)
18. WHEN the System detects a column contains date values THEN the System SHALL sort that column chronologically
19. WHEN the System detects a column contains boolean values THEN the System SHALL sort that column with false before true
20. WHEN a numeric column contains comma-separated numbers (e.g., "1,234.56") THEN the System SHALL normalize and sort them correctly
21. WHEN a date column contains various date formats THEN the System SHALL parse and sort them correctly
22. WHEN a column type cannot be auto-detected THEN the System SHALL fall back to string sorting

#### Acceptance Criteria - 性能优化（必须保留）

23. WHEN calculating distinct values THEN the System SHALL sample up to 10,000 rows to optimize performance
24. WHEN displaying distinct values THEN the System SHALL limit the preview to 1,000 items
25. WHEN filtering data THEN the System SHALL use memoization to avoid unnecessary recalculations
26. WHEN sorting data THEN the System SHALL use the appropriate comparator based on detected column type

### Requirement 10: State Management Integration

**User Story:** As a developer, I want to integrate the new components with the existing state management, so that data flows correctly between components.

#### Acceptance Criteria

1. WHEN the Query Workbench initializes THEN the System SHALL fetch available tables from the API using the existing getDuckDBTablesEnhanced function
2. WHEN a user executes a query THEN the System SHALL use the existing async query API endpoint
3. WHEN query results are received THEN the System SHALL update the result panel through the useDuckQuery hook
4. WHEN a user switches between pages THEN the System SHALL preserve the query state in the useDuckQuery hook
5. WHEN the data source list changes THEN the System SHALL trigger a refresh using the existing triggerRefresh mechanism

### Requirement 11: Design System Compliance

**User Story:** As a developer, I want all new components to follow the project's design system, so that the UI is consistent and maintainable.

#### Acceptance Criteria

1. WHEN rendering any component THEN the System SHALL use only semantic Tailwind classes defined in tailwind.config.js (e.g., bg-surface, text-foreground)
2. WHEN rendering any component THEN the System SHALL NOT use hardcoded color values or direct CSS variable references
3. WHEN rendering interactive elements THEN the System SHALL include proper hover, focus, and disabled states using design system tokens
4. WHEN rendering in dark mode THEN the System SHALL automatically apply dark mode styles through the .dark class
5. WHEN rendering animations THEN the System SHALL use semantic duration classes (duration-fast, duration-normal, duration-slow)

### Requirement 12: Resizable Panel System

**User Story:** As a user, I want to resize panels to customize my workspace, so that I can optimize the layout for my workflow.

#### Acceptance Criteria

1. WHEN a user hovers over a resizer THEN the System SHALL highlight the resizer with the primary color
2. WHEN a user drags a resizer THEN the System SHALL update panel sizes in real-time with smooth transitions
3. WHEN a user releases the resizer THEN the System SHALL persist the panel size for the session
4. WHEN panel size reaches minimum threshold THEN the System SHALL prevent further resizing in that direction
5. WHEN a user double-clicks a resizer THEN the System SHALL reset the panel to its default size

### Requirement 13: Feature Parity Verification

**User Story:** As a developer, I want to ensure all Demo features are migrated to the new layout, so that no functionality is lost during migration.

#### Acceptance Criteria

1. WHEN comparing Demo and New Layout THEN the System SHALL support all five query modes: 可视化查询, SQL 查询, 关联查询, 集合操作, 透视表
2. WHEN comparing Demo and New Layout THEN the System SHALL support the same table selection behavior (single-select for visual/sql/pivot, multi-select for join/set)
3. WHEN comparing Demo and New Layout THEN the System SHALL support the same panel collapse/expand functionality for datasource panel
4. WHEN comparing Demo and New Layout THEN the System SHALL support the same resizer drag behavior for both horizontal and vertical resizers
5. WHEN comparing Demo and New Layout THEN the System SHALL support the same tree expand/collapse behavior for database connections

### Requirement 14: Visual Consistency with Demo

**User Story:** As a designer, I want the new layout to match the Demo's visual design, so that the UI looks consistent and professional.

#### Acceptance Criteria

1. WHEN rendering the sidebar THEN the System SHALL match the Demo's sidebar width (64px collapsed, 256px expanded), logo placement, and navigation item styling
2. WHEN rendering the datasource panel THEN the System SHALL match the Demo's tree item styling including 0.25rem padding, 0.8125rem font size, and hover/selected states
3. WHEN rendering query mode tabs THEN the System SHALL match the Demo's tab styling with 0.75rem padding, 6px border-radius, and active state background
4. WHEN rendering table cards in join/set modes THEN the System SHALL match the Demo's card styling with 0.75rem border-radius, border, and column checkbox layout
5. WHEN rendering the result panel THEN the System SHALL match the Demo's IDE-style table with sticky headers, JetBrains Mono font, and alternating row colors

### Requirement 15: Component Architecture and Usage

**User Story:** As a developer, I want clear component architecture documentation, so that I can understand how to use and extend the components.

#### Acceptance Criteria

1. WHEN creating the QueryWorkbench component THEN the System SHALL accept props for: onQueryExecute, onTableSelect, initialTab, and resultData
2. WHEN creating the DataSourcePanel component THEN the System SHALL accept props for: tables, selectedTables, onTableSelect, onSearch, collapsed, onToggleCollapse
3. WHEN creating the QueryModeTabs component THEN the System SHALL accept props for: activeTab, onTabChange, and tabs configuration array
4. WHEN creating query builder components THEN the System SHALL accept props for: selectedTable, queryConfig, onConfigChange, and onExecute
5. WHEN creating the ResultPanel component THEN the System SHALL accept props for: data, columns, loading, error, rowCount, execTime, collapsed, onToggleCollapse

### Requirement 16: Integration with Existing Project Structure

**User Story:** As a developer, I want the new components to integrate seamlessly with the existing project, so that the migration does not break existing functionality.

#### Acceptance Criteria

1. WHEN adding new components THEN the System SHALL place them in frontend/src/new/QueryWorkbench/ directory following the existing directory structure pattern
2. WHEN integrating with state management THEN the System SHALL extend the useDuckQuery hook to include query workbench state without modifying existing state shape
3. WHEN integrating with API calls THEN the System SHALL reuse existing apiClient functions (getDuckDBTablesEnhanced, submitAsyncQuery) without creating duplicate endpoints
4. WHEN integrating with routing THEN the System SHALL add a new navigation item in the Sidebar component that links to the Query Workbench page
5. WHEN integrating with the design system THEN the System SHALL NOT modify existing tailwind.css or tailwind.config.js unless adding new tokens that are missing

## Old UI (ShadcnApp) vs Demo vs New Layout Feature Alignment

This table maps features from the old UI to the Demo and defines how they will be implemented in the new layout.

### Page Structure Alignment

| Old UI (ShadcnApp) | Demo | New Layout | Notes |
|-------------------|------|------------|-------|
| Top header with logo | Sidebar with logo | Sidebar with logo | Demo style preferred |
| MUI Tabs for main navigation | Sidebar navigation | Sidebar navigation | Demo style preferred |
| 4 main tabs: 数据源/统一查询/表管理/异步任务 | 2 sidebar items: 数据源管理/数据查询 | 2+ sidebar items | Consolidate into fewer pages |
| Page intro text | No intro text | No intro text | Cleaner design |
| dq-shell card containers | bg-surface containers | bg-surface containers | Consistent |

### Data Source Page Alignment

| Old UI Feature | Demo Feature | New Layout Implementation |
|---------------|--------------|---------------------------|
| DataUploadSection | Not in demo | Keep existing UploadPanel in /new |
| DatabaseConnector | Not in demo | Keep existing DatabaseForm in /new |
| DataPasteBoard | Not in demo | Keep existing DataPasteCard in /new |
| DataSourceList | DataSource tree panel | Integrate into Query Workbench |
| 4-grid layout | Tab-based layout | Keep existing DataSourcePage in /new |

### Query Interface Alignment

| Old UI Feature | Demo Feature | New Layout Implementation |
|---------------|--------------|---------------------------|
| UnifiedQueryInterface | Query Workbench | New QueryWorkbench component |
| 3 tabs: 图形化查询/SQL内部/SQL外部 | 5 tabs: 可视化/SQL/关联/集合/透视 | 5 tabs as in Demo |
| QueryBuilder (visual) | Visual Query Builder | New VisualQueryBuilder component |
| EnhancedSQLExecutor | SQL Query Editor | New SQLQueryEditor component |
| SqlExecutor (external) | Not in demo | Integrate into SQL Query Editor |
| JoinCondition | Join Query Builder | New JoinQueryBuilder component |
| SetOperationBuilder | Set Operations Builder | New SetOperationsBuilder component |
| VisualAnalysisPanel (pivot) | Pivot Table Builder | New PivotTableBuilder component |
| SourceSelector | DataSource Panel | New DataSourcePanel component |
| ModernDataDisplay | Unified Result Panel | New ResultPanel component |

### State Management Alignment

| Old UI State | Demo State | New Layout State |
|-------------|------------|------------------|
| useDuckQuery hook | AppState object | Extend useDuckQuery hook |
| selectedSources | selectedTables per tab | Add to useDuckQuery |
| queryResults | Result panel data | Keep in useDuckQuery |
| joins array | Dynamic join connectors | Add to useDuckQuery |
| setOperationConfig | Set operation config | Add to useDuckQuery |
| visualQueryConfig | Visual query config | Add to useDuckQuery |

### API Integration Alignment

| Old UI API | Demo API | New Layout API |
|-----------|----------|----------------|
| getDuckDBTableDetail | Mock data | Keep getDuckDBTableDetail |
| executeDuckDBSQL | Mock execution | Keep executeDuckDBSQL |
| performQuery | Mock execution | Keep performQuery |
| previewVisualQuery | Mock execution | Keep previewVisualQuery |
| /api/set-operations/execute | Mock execution | Keep existing endpoint |

### Components to Create

Based on the alignment above, these new components need to be created:

1. **QueryWorkbench** - Main container for query functionality
2. **DataSourcePanel** - Left panel with table tree (replaces SourceSelector UI)
3. **QueryModeTabs** - Tab bar for 5 query modes
4. **VisualQueryBuilder** - Visual query builder (wraps existing QueryBuilder logic)
5. **SQLQueryEditor** - SQL editor (wraps existing EnhancedSQLExecutor logic)
6. **JoinQueryBuilder** - Join query builder (wraps existing JoinCondition logic)
7. **SetOperationsBuilder** - Set operations builder (wraps existing SetOperationBuilder logic)
8. **PivotTableBuilder** - Pivot table builder (wraps existing VisualAnalysisPanel pivot logic)
9. **ResultPanel** - Unified result panel (wraps existing ModernDataDisplay logic)
10. **HorizontalResizer** - Horizontal panel resizer
11. **VerticalResizer** - Vertical panel resizer

### Components to Reuse (Logic Only)

These existing components contain business logic that should be reused:

1. **QueryBuilder** - Visual query generation logic
2. **JoinCondition** - Join configuration logic
3. **SetOperationBuilder** - Set operation configuration logic
4. **VisualAnalysisPanel** - Pivot table configuration logic
5. **EnhancedSQLExecutor** - SQL execution logic
6. **ModernDataDisplay** - Result display logic

## Feature Migration Checklist

This checklist ensures no features are lost during migration:

### Layout Features
- [ ] Three-column layout (sidebar, datasource panel, main area)
- [ ] Horizontal resizer for datasource panel (drag to resize, collapse at 50px)
- [ ] Vertical resizer for result panel (drag to resize, collapse button)
- [ ] Expand button when datasource panel is collapsed
- [ ] Sidebar navigation with active state

### DataSource Panel Features
- [ ] Search input with icon
- [ ] DuckDB tables section (expandable)
- [ ] External databases section (expandable)
- [ ] Database connection items with status indicator (green/gray dot)
- [ ] Table items with double-click to select
- [ ] Selected table highlighting (primary color icon)
- [ ] Refresh and Add buttons in footer

### Query Mode Features
- [ ] Five query mode tabs with icons
- [ ] Tab active state styling
- [ ] Secondary tabs (查询模式/异步任务)
- [ ] Tab content switching without page reload

### Visual Query Builder Features
- [ ] Query mode cards (字段选择, 筛选条件, 分组聚合, 排序, 限制结果)
- [ ] Card active state with "启用" badge
- [ ] Field selection with checkboxes and type labels
- [ ] Filter conditions with field/operator/value inputs
- [ ] Group by field list with drag handle
- [ ] Aggregate function configuration
- [ ] Sort field list with ASC/DESC selector
- [ ] Limit input with preset buttons
- [ ] Generated SQL preview

### SQL Query Editor Features
- [ ] Monospace textarea for SQL input
- [ ] Format button
- [ ] Template button
- [ ] Execute button
- [ ] Query history list with status and timing

### Join Query Builder Features
- [ ] Table cards with column checkboxes
- [ ] Join type selector (INNER, LEFT, RIGHT, FULL)
- [ ] Join condition field selectors
- [ ] Remove table button
- [ ] Empty state message

### Set Operations Builder Features
- [ ] Table cards with column checkboxes
- [ ] Set operation badge (UNION, INTERSECT, EXCEPT)
- [ ] Remove table button
- [ ] Empty state message

### Pivot Table Builder Features
- [ ] Row dimensions drop zone
- [ ] Column dimensions drop zone
- [ ] Value aggregations configuration
- [ ] Dimension reordering (drag and drop)

### Result Panel Features
- [ ] IDE-style table with sticky headers
- [ ] Row count, column count, execution time display
- [ ] Collapse/expand button
- [ ] Vertical resizer

## Component Usage Examples

### QueryWorkbench Usage
```jsx
import QueryWorkbench from './new/QueryWorkbench/QueryWorkbench';

// In DuckQueryApp.jsx
<QueryWorkbench
  tables={tables}
  onQueryExecute={handleQueryExecute}
  onTableSelect={handleTableSelect}
  initialTab="visual"
  resultData={queryResult}
/>
```

### DataSourcePanel Usage
```jsx
import DataSourcePanel from './new/QueryWorkbench/DataSourcePanel';

<DataSourcePanel
  tables={tables}
  externalDatabases={externalDatabases}
  selectedTables={selectedTables}
  onTableSelect={handleTableSelect}
  onSearch={handleSearch}
  collapsed={isPanelCollapsed}
  onToggleCollapse={handleToggleCollapse}
  width={panelWidth}
  onWidthChange={handleWidthChange}
/>
```

### VisualQueryBuilder Usage
```jsx
import VisualQueryBuilder from './new/QueryWorkbench/VisualQueryBuilder';

<VisualQueryBuilder
  selectedTable={selectedTable}
  columns={tableColumns}
  queryConfig={visualQueryConfig}
  onConfigChange={handleConfigChange}
  onExecute={handleExecute}
/>
```
