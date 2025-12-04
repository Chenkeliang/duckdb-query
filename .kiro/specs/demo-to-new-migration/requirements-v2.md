# Requirements Document (Optimized v2)

## Introduction

本需求文档描述将 DuckQuery 从旧 UI 迁移到新布局的功能需求。基于功能覆盖检查和优化建议，按照优先级重新组织需求，确保不遗漏任何功能。

**迁移策略**：
- 保留现有功能逻辑和 API 集成
- 采用 React + TypeScript + TanStack Query + shadcn/ui
- 使用 AG-Grid 作为表格组件
- 集成 Excel 风格过滤和交互优化

**优先级顺序**：
1. ✅ 数据源管理页面（已完成 - `shadcn-integration`）- 上传文件、连接数据库
2. 🔵 主区域布局（查询工作台框架）
3. 🔵 数据源面板（查询工作台左侧）- 显示 DuckDB 表、数据库连接、系统表
4. 🔵 ResultPanel（结果展示 + Excel 风格过滤 + 交互优化）
5. 🔵 SQL 查询（二级 Tab）
6. 🔵 JOIN 查询
7. 🔵 集合操作
8. 🔵 透视表
9. 🔵 异步任务
10. 🔵 可视化查询（最后实现）

## Glossary

- **Query Workbench**: 数据查询工作台，包含数据源面板、查询构建器、结果面板
- **ResultPanel**: 结果展示面板，使用 AG-Grid 实现，支持 Excel 风格过滤和交互
- **Excel-style Filter**: Excel 风格的列筛选，显示 distinct values，支持搜索、全选、反选等
- **AG-Grid**: 企业级表格组件，支持虚拟滚动、排序、筛选、分组等功能
- **useDuckQuery Hook**: 项目的状态管理 Hook，集中管理数据和操作

## Requirements

---

## 🔵 Phase 1: 主区域布局和框架

### Requirement 1: Query Workbench 页面框架

**User Story:** As a developer, I want to create a Query Workbench page with a three-panel layout, so that users can access data sources, build queries, and view results in a unified interface.

#### Acceptance Criteria

1. WHEN a user navigates to the Query Workbench page THEN the System SHALL display a three-panel layout using react-resizable-panels
2. WHEN the page loads THEN the System SHALL render a left datasource panel (default 20% width, min 180px, max 600px)
3. WHEN the page loads THEN the System SHALL render a center query area (default 50% width, min 400px)
4. WHEN the page loads THEN the System SHALL render a bottom result panel (default 40% height, min 200px)
5. WHEN a user drags a panel resizer THEN the System SHALL adjust panel sizes in real-time with smooth transitions
6. WHEN a user double-clicks a resizer THEN the System SHALL reset panels to default sizes
7. WHEN panel sizes change THEN the System SHALL persist sizes to localStorage for the session

### Requirement 2: DataSource Panel 组件（查询工作台左侧）

**User Story:** As a user, I want to see all available data sources in a collapsible tree structure, so that I can quickly find and select tables for querying.

**⚠️ 重要说明**：这是查询工作台左侧的数据源面板，用于选择表进行查询。不同于数据源管理页面（已完成）。

#### Acceptance Criteria - 数据源树结构

1. WHEN the DataSource Panel renders THEN the System SHALL display a tree structure with three sections: DuckDB 表, 数据库连接, 系统表
2. WHEN the DuckDB 表 section renders THEN the System SHALL fetch and display all DuckDB tables using getDuckDBTablesEnhanced()
3. WHEN the 数据库连接 section renders THEN the System SHALL display all saved database connections with their tables
4. WHEN the 系统表 section renders THEN the System SHALL display DuckDB system tables (information_schema, duckdb_tables, etc.)
5. WHEN a section header is clicked THEN the System SHALL toggle the expansion state with smooth animation (duration-normal)
6. WHEN a section is expanded THEN the System SHALL display a ChevronDown icon, when collapsed a ChevronRight icon

#### Acceptance Criteria - 搜索和过滤

7. WHEN the panel renders THEN the System SHALL display a search input at the top with a Search icon
8. WHEN a user types in the search input THEN the System SHALL filter tree items to show only matching table names (case-insensitive, debounced 300ms)
9. WHEN search results are empty THEN the System SHALL display: "未找到匹配的表"
10. WHEN a user clears the search THEN the System SHALL restore the full tree structure

#### Acceptance Criteria - 表选择

11. WHEN a user double-clicks a table item THEN the System SHALL select that table for the current query mode
12. WHEN a table is selected THEN the System SHALL highlight the table item with bg-primary/10 border-l-2 border-primary
13. WHEN in SQL/透视表/可视化查询 mode THEN the System SHALL allow only single table selection
14. WHEN in JOIN/集合操作 mode THEN the System SHALL allow multiple table selection with checkboxes
15. WHEN a table is selected in multi-select mode THEN the System SHALL display a checkbox with checked state

#### Acceptance Criteria - 面板折叠

16. WHEN the panel width is dragged below 50px THEN the System SHALL collapse the panel and show a vertical "数据源" button
17. WHEN a user clicks the expand button THEN the System SHALL restore the panel to its previous width (stored in localStorage)
18. WHEN the panel is collapsed THEN the System SHALL hide all content except the expand button

#### Acceptance Criteria - 右键菜单

19. WHEN a user right-clicks a table THEN the System SHALL show a context menu with options: 预览数据, 查看结构, 删除表
20. WHEN a user selects "预览数据" THEN the System SHALL execute SELECT * FROM {table} LIMIT 100 and display results
21. WHEN a user selects "查看结构" THEN the System SHALL display a dialog showing column names, types, and sample values
22. WHEN a user selects "删除表" THEN the System SHALL show a confirmation dialog and call deleteDuckDBTableEnhanced()

#### Acceptance Criteria - 刷新和添加

23. WHEN the panel footer renders THEN the System SHALL display "刷新" and "添加" buttons
24. WHEN a user clicks "刷新" THEN the System SHALL call triggerRefresh() to reload all data sources
25. WHEN a user clicks "添加" THEN the System SHALL navigate to the 数据源管理 page

### Requirement 3: Query Mode Tabs 组件

**User Story:** As a user, I want to switch between different query modes using tabs, so that I can use the most appropriate method for my data analysis needs.

#### Acceptance Criteria

1. WHEN the Query Workbench loads THEN the System SHALL display query mode tabs in a secondary tab bar: SQL 查询, JOIN 查询, 集合操作, 透视表, 可视化查询
2. WHEN a user clicks a query mode tab THEN the System SHALL switch to that mode's content panel with fade transition
3. WHEN switching query modes THEN the System SHALL preserve the selected tables state for each mode independently
4. WHEN in JOIN 查询 or 集合操作 mode THEN the System SHALL allow multiple table selection
5. WHEN in SQL 查询, 透视表, or 可视化查询 mode THEN the System SHALL allow only single table selection
6. WHEN a tab is active THEN the System SHALL display it with bg-surface and shadow-sm styling

---

## 🔵 Phase 2: ResultPanel（核心功能）

### Requirement 4: ResultPanel 基础功能

**User Story:** As a user, I want to see query results in a high-performance table with sorting and filtering capabilities, so that I can analyze data effectively.

#### Acceptance Criteria

1. WHEN a query executes successfully THEN the System SHALL display results using AG-Grid with custom theme (.ag-theme-duckquery)
2. WHEN the result panel renders THEN the System SHALL display a toolbar showing: row count, column count, execution time, and action buttons
3. WHEN the result panel renders THEN the System SHALL apply sticky headers that remain visible during vertical scrolling
4. WHEN a user drags the vertical resizer THEN the System SHALL adjust the result panel height in real-time
5. WHEN a user clicks the collapse button THEN the System SHALL collapse the result panel to 40px height showing only the toolbar
6. WHEN the result panel is collapsed THEN the System SHALL show an expand button (ChevronUp icon) to restore the panel
7. WHEN data exceeds 10,000 rows THEN the System SHALL use AG-Grid's virtual scrolling for optimal performance

### Requirement 5: Excel 风格列筛选（核心功能）

**User Story:** As a user, I want to filter columns using an Excel-style menu with distinct values, so that I can quickly narrow down data like in a spreadsheet.

**⚠️ 重要说明**：这是 ModernDataDisplay 的核心功能，必须完整实现。

#### Acceptance Criteria - Distinct Values 计算

1. WHEN calculating distinct values THEN the System SHALL sample up to 10,000 rows to optimize performance
2. WHEN calculating distinct values THEN the System SHALL count occurrences for each unique value
3. WHEN calculating distinct values THEN the System SHALL sort values by occurrence count (descending)
4. WHEN displaying distinct values THEN the System SHALL show up to 1,000 values in the filter menu
5. WHEN a column has more than 1,000 distinct values THEN the System SHALL display a message: "显示前 1,000 个值（共 X 个）"

#### Acceptance Criteria - 过滤菜单 UI

6. WHEN a user clicks a column filter button THEN the System SHALL display a popover menu with distinct values list
7. WHEN the filter menu renders THEN the System SHALL display each value with its occurrence count as a badge
8. WHEN the filter menu renders THEN the System SHALL include a search input at the top
9. WHEN a user types in the filter search box THEN the System SHALL filter the distinct values list in real-time
10. WHEN the filter menu renders THEN the System SHALL display action buttons: 全选, 反选, 重复项, 唯一项
11. WHEN a user clicks "全选" THEN the System SHALL select all distinct values in the current filtered list
12. WHEN a user clicks "反选" THEN the System SHALL deselect all currently selected values and select all unselected values
13. WHEN a user clicks "重复项" THEN the System SHALL select only values that appear more than once
14. WHEN a user clicks "唯一项" THEN the System SHALL select only values that appear exactly once

#### Acceptance Criteria - 过滤模式

15. WHEN the filter menu renders THEN the System SHALL display a toggle for "包含" and "排除" modes
16. WHEN a user toggles to "排除" mode THEN the System SHALL invert the filter logic (show rows NOT matching selected values)
17. WHEN a user applies a column filter THEN the System SHALL filter the data and display only matching rows
18. WHEN multiple column filters are active THEN the System SHALL apply all filters with AND logic
19. WHEN a filter is active THEN the System SHALL display the filter button with text-primary color
20. WHEN a filter is active THEN the System SHALL show a chip above the table: "列名: X 个值 (包含/排除)" with a remove button

#### Acceptance Criteria - 性能优化

21. WHEN calculating distinct values THEN the System SHALL use Web Worker for async computation (不阻塞 UI)
22. WHEN filtering data THEN the System SHALL use memoization (useMemo) to avoid unnecessary recalculations
23. WHEN the filter menu has more than 1,000 values THEN the System SHALL use virtual scrolling (react-window) for smooth rendering

### Requirement 6: 自动类型检测和智能排序

**User Story:** As a user, I want columns to be sorted intelligently based on their data type, so that numeric and date columns sort correctly.

#### Acceptance Criteria

1. WHEN the System detects a column contains numeric values THEN the System SHALL sort that column numerically (not as strings)
2. WHEN the System detects a column contains date values THEN the System SHALL sort that column chronologically
3. WHEN the System detects a column contains boolean values THEN the System SHALL sort that column with false before true
4. WHEN a numeric column contains comma-separated numbers (e.g., "1,234.56") THEN the System SHALL normalize and sort them correctly
5. WHEN a date column contains various date formats THEN the System SHALL parse and sort them correctly using Date.parse()
6. WHEN a column type cannot be auto-detected THEN the System SHALL fall back to string sorting with localeCompare

### Requirement 7: 单元格和行选择（交互优化）

**User Story:** As a user, I want to select cells and rows like in Excel, so that I can copy data to the clipboard.

#### Acceptance Criteria

1. WHEN a user clicks a cell THEN the System SHALL select that cell and display a focus ring
2. WHEN a user Shift + clicks another cell THEN the System SHALL select a rectangular range between the first and second cell
3. WHEN a user Ctrl + clicks cells THEN the System SHALL add cells to the selection (multi-select)
4. WHEN a user clicks a row number THEN the System SHALL select the entire row
5. WHEN a user Shift + clicks another row number THEN the System SHALL select all rows in the range
6. WHEN a user presses Ctrl + A THEN the System SHALL select all cells in the table
7. WHEN cells are selected THEN the System SHALL highlight them with bg-primary/10 background

### Requirement 8: 复制功能（交互优化）

**User Story:** As a user, I want to copy selected data to the clipboard, so that I can paste it into Excel or other applications.

#### Acceptance Criteria

1. WHEN a user presses Ctrl + C with cells selected THEN the System SHALL copy the selected data to clipboard in TSV format
2. WHEN a user right-clicks selected cells THEN the System SHALL show a context menu with copy options
3. WHEN a user selects "复制" from context menu THEN the System SHALL copy data in TSV format (Excel-compatible)
4. WHEN a user selects "复制为 CSV" THEN the System SHALL copy data in CSV format
5. WHEN a user selects "复制为 JSON" THEN the System SHALL copy data as a JSON array
6. WHEN data is copied THEN the System SHALL show a toast notification: "已复制 X 行数据到剪贴板"
7. WHEN copying a rectangular selection THEN the System SHALL preserve the table structure (rows and columns)

### Requirement 9: 键盘导航（交互优化）

**User Story:** As a user, I want to navigate the table using keyboard shortcuts like in Excel, so that I can work efficiently without a mouse.

#### Acceptance Criteria

1. WHEN a user presses Arrow keys THEN the System SHALL move focus to the adjacent cell in that direction
2. WHEN a user presses Ctrl + Home THEN the System SHALL jump to the first cell (A1)
3. WHEN a user presses Ctrl + End THEN the System SHALL jump to the last cell
4. WHEN a user presses Home THEN the System SHALL jump to the first column of the current row
5. WHEN a user presses End THEN the System SHALL jump to the last column of the current row
6. WHEN a user presses Page Up/Down THEN the System SHALL scroll up/down by 20 rows
7. WHEN a user presses Enter THEN the System SHALL move focus down one row
8. WHEN a user presses Tab THEN the System SHALL move focus right one column
9. WHEN a user presses Shift + Tab THEN the System SHALL move focus left one column

### Requirement 10: 浮动工具栏（交互优化）

**User Story:** As a user, I want to see a floating toolbar when I select data, so that I can quickly perform actions on the selection.

#### Acceptance Criteria

1. WHEN a user selects cells THEN the System SHALL display a floating toolbar at the bottom center of the screen
2. WHEN the floating toolbar renders THEN the System SHALL show: selection count, 复制, 导出, 创建图表, 统计 buttons
3. WHEN a user clicks "复制" THEN the System SHALL copy the selected data to clipboard
4. WHEN a user clicks "导出" THEN the System SHALL open an export dialog with format options (CSV, JSON, Excel)
5. WHEN a user clicks "统计" THEN the System SHALL calculate and display: count, sum, avg, min, max for numeric columns
6. WHEN a user clicks the close button (X) THEN the System SHALL hide the floating toolbar and clear the selection
7. WHEN the selection changes THEN the System SHALL update the toolbar content (selection count, statistics)

### Requirement 11: 列操作增强（交互优化）

**User Story:** As a user, I want to adjust column widths and reorder columns, so that I can customize the table layout.

#### Acceptance Criteria

1. WHEN a user drags a column border THEN the System SHALL resize the column width in real-time
2. WHEN a user double-clicks a column border THEN the System SHALL auto-fit the column width to content
3. WHEN a user right-clicks a column header THEN the System SHALL show a context menu with options
4. WHEN a user selects "自动调整列宽" THEN the System SHALL fit the column width to the longest content (max 400px)
5. WHEN a user selects "自动调整所有列宽" THEN the System SHALL auto-fit all columns
6. WHEN a user selects "隐藏此列" THEN the System SHALL hide the column (can be restored from column chooser)
7. WHEN a user selects "冻结此列" THEN the System SHALL freeze the column (sticky left position during horizontal scroll)
8. WHEN a user drags a column header THEN the System SHALL reorder the column to the new position

### Requirement 12: 全局搜索（交互优化）

**User Story:** As a user, I want to search for values across all columns, so that I can quickly locate specific data.

#### Acceptance Criteria

1. WHEN a user presses Ctrl + F THEN the System SHALL open a search dialog
2. WHEN the search dialog renders THEN the System SHALL display a search input and navigation buttons
3. WHEN a user types in the search input and presses Enter THEN the System SHALL find all matching cells
4. WHEN search results are found THEN the System SHALL display: "找到 X 个结果" and highlight the first match
5. WHEN a user clicks "下一个" THEN the System SHALL jump to the next search result and highlight it
6. WHEN a user clicks "上一个" THEN the System SHALL jump to the previous search result
7. WHEN a user presses Esc THEN the System SHALL close the search dialog and clear highlights

### Requirement 13: 导出功能

**User Story:** As a user, I want to export query results in various formats, so that I can use the data in other applications.

#### Acceptance Criteria

1. WHEN a user clicks the "导出" button in the toolbar THEN the System SHALL open an export dialog
2. WHEN the export dialog renders THEN the System SHALL display format options: CSV, JSON, Parquet, Excel
3. WHEN a user selects CSV format THEN the System SHALL export data as a CSV file with UTF-8 BOM encoding
4. WHEN a user selects JSON format THEN the System SHALL export data as a JSON array
5. WHEN a user selects Parquet format THEN the System SHALL call the backend API to generate a Parquet file
6. WHEN a user selects Excel format THEN the System SHALL export data as an XLSX file using SheetJS
7. WHEN export completes THEN the System SHALL trigger a file download and show a success toast

---

## 🔵 Phase 3: SQL 查询（二级 Tab）

### Requirement 14: SQL Query Editor 组件

**User Story:** As a user, I want to write and execute raw SQL queries, so that I can have full control over my data queries.

#### Acceptance Criteria

1. WHEN the SQL Query tab is active THEN the System SHALL display a SQL editor with syntax highlighting
2. WHEN the SQL editor renders THEN the System SHALL use Monaco Editor with SQL language support
3. WHEN a user types SQL THEN the System SHALL provide auto-completion for table names and column names
4. WHEN a user double-clicks a table in the DataSource Panel THEN the System SHALL insert the table name at the cursor position
5. WHEN a user clicks the "格式化" button THEN the System SHALL format the SQL code with proper indentation using sql-formatter
6. WHEN a user clicks the "执行" button THEN the System SHALL submit the SQL query to the backend API
7. WHEN the query executes successfully THEN the System SHALL display results in the ResultPanel
8. WHEN the query fails THEN the System SHALL display an error message with line number and error details

### Requirement 15: SQL 模板功能

**User Story:** As a user, I want to use SQL templates for common queries, so that I can save time writing repetitive SQL.

#### Acceptance Criteria

1. WHEN the SQL editor renders THEN the System SHALL display a "模板" dropdown button
2. WHEN a user clicks the "模板" button THEN the System SHALL show a list of SQL templates
3. WHEN the template list renders THEN the System SHALL include templates: SELECT *, WHERE 条件, GROUP BY, JOIN, UNION
4. WHEN a user selects a template THEN the System SHALL insert the template SQL at the cursor position
5. WHEN a template is inserted THEN the System SHALL highlight placeholders (e.g., {table_name}, {column}) for easy replacement

### Requirement 16: SQL 查询历史

**User Story:** As a user, I want to see my recent SQL queries, so that I can reuse or reference previous queries.

#### Acceptance Criteria

1. WHEN the SQL Query tab is active THEN the System SHALL display a "历史记录" panel on the right side
2. WHEN the history panel renders THEN the System SHALL show the 20 most recent queries with timestamp and status
3. WHEN a user clicks a history item THEN the System SHALL load that SQL into the editor
4. WHEN a user hovers over a history item THEN the System SHALL show a tooltip with the full SQL query
5. WHEN a user right-clicks a history item THEN the System SHALL show options: 加载, 复制, 删除
6. WHEN a query executes THEN the System SHALL add it to the history with status (success/failed) and execution time

### Requirement 17: 保存为数据源

**User Story:** As a user, I want to save query results as a new data source, so that I can reuse the results in future queries.

#### Acceptance Criteria

1. WHEN a query executes successfully THEN the System SHALL display a "保存为数据源" button in the ResultPanel toolbar
2. WHEN a user clicks "保存为数据源" THEN the System SHALL open a dialog to input table name and display name
3. WHEN a user submits the dialog THEN the System SHALL call the backend API to save results as a new DuckDB table
4. WHEN the save completes THEN the System SHALL refresh the DataSource Panel to show the new table
5. WHEN the save completes THEN the System SHALL show a success toast: "已保存为数据源: {table_name}"

---

## 🔵 Phase 4: JOIN 查询

### Requirement 18: Join Query Builder 组件

**User Story:** As a user, I want to visually build JOIN queries, so that I can combine data from multiple tables easily.

#### Acceptance Criteria

1. WHEN the JOIN 查询 tab is active AND tables are selected THEN the System SHALL display table cards horizontally
2. WHEN table cards render THEN the System SHALL show: table name, column list with checkboxes, remove button
3. WHEN there are 2+ tables THEN the System SHALL display join connectors between table cards
4. WHEN a join connector renders THEN the System SHALL show a dropdown to select join type: INNER, LEFT, RIGHT, FULL
5. WHEN a user selects a join type THEN the System SHALL update the connector badge to show the selected type
6. WHEN a join connector renders THEN the System SHALL show field selectors for join conditions (left.field = right.field)
7. WHEN a user adds a join condition THEN the System SHALL display a new condition row with field selectors and an equals sign
8. WHEN a user removes a table THEN the System SHALL remove the table card and update join connectors
9. WHEN no tables are selected THEN the System SHALL display an empty state: "双击左侧数据源面板中的表来添加"

### Requirement 19: JOIN 类型冲突检测

**User Story:** As a user, I want to be warned about data type mismatches in join conditions, so that I can avoid query errors.

#### Acceptance Criteria

1. WHEN a user configures a join condition THEN the System SHALL check if the left and right field types are compatible
2. WHEN field types are incompatible (e.g., string vs number) THEN the System SHALL display a warning icon next to the condition
3. WHEN a user hovers over the warning icon THEN the System SHALL show a tooltip: "类型不匹配: {left_type} vs {right_type}"
4. WHEN a user clicks the warning icon THEN the System SHALL open a dialog with type casting options
5. WHEN a user applies type casting THEN the System SHALL update the join condition to include CAST() function

---

## 🔵 Phase 5: 集合操作

### Requirement 20: Set Operations Builder 组件

**User Story:** As a user, I want to perform set operations on multiple tables, so that I can combine or compare datasets.

#### Acceptance Criteria

1. WHEN the 集合操作 tab is active AND tables are selected THEN the System SHALL display table cards vertically
2. WHEN table cards render THEN the System SHALL show: table name, column list with checkboxes, remove button
3. WHEN there are 2+ tables THEN the System SHALL display set operation connectors between table cards
4. WHEN a connector renders THEN the System SHALL show a dropdown to select operation: UNION, UNION ALL, INTERSECT, EXCEPT
5. WHEN a user selects an operation THEN the System SHALL update the connector badge to show the selected operation
6. WHEN a user removes a table THEN the System SHALL remove the table card and update connectors
7. WHEN no tables are selected THEN the System SHALL display an empty state: "双击左侧数据源面板中的表来添加"

### Requirement 21: 列映射配置

**User Story:** As a user, I want to map columns when table schemas differ, so that I can perform set operations on tables with different column names.

#### Acceptance Criteria

1. WHEN tables have different column names THEN the System SHALL display a "列映射" button
2. WHEN a user clicks "列映射" THEN the System SHALL open a dialog showing columns from all tables
3. WHEN the mapping dialog renders THEN the System SHALL display a grid: Table 1 Column → Table 2 Column → Table 3 Column
4. WHEN a user drags a column THEN the System SHALL map it to the corresponding position in other tables
5. WHEN columns are mapped THEN the System SHALL update the generated SQL to use column aliases

---

## 🔵 Phase 6: 透视表

### Requirement 22: Pivot Table Builder 组件

**User Story:** As a user, I want to create pivot tables, so that I can analyze data with row and column dimensions.

#### Acceptance Criteria

1. WHEN the 透视表 tab is active THEN the System SHALL display configuration areas: 行维度, 列维度, 值聚合
2. WHEN a user drags a field to 行维度 THEN the System SHALL add the field as a row dimension
3. WHEN a user drags a field to 列维度 THEN the System SHALL add the field as a column dimension
4. WHEN a user drags a field to 值聚合 THEN the System SHALL add the field with a default aggregation function (SUM)
5. WHEN a user clicks an aggregation function THEN the System SHALL show a dropdown: SUM, AVG, COUNT, MIN, MAX
6. WHEN a user reorders dimensions THEN the System SHALL update the dimension order and regenerate the pivot query
7. WHEN a user clicks "生成透视表" THEN the System SHALL execute the pivot query and display results

---

## 🔵 Phase 7: 异步任务

### Requirement 23: 异步任务列表

**User Story:** As a user, I want to see all my async tasks and their status, so that I can monitor long-running queries.

#### Acceptance Criteria

1. WHEN the 异步任务 tab is active THEN the System SHALL display a table of async tasks
2. WHEN the task list renders THEN the System SHALL show columns: 任务ID, 状态, 查询语句, 创建时间, 执行时间, 操作
3. WHEN the task list renders THEN the System SHALL auto-refresh every 5 seconds to update task status
4. WHEN a task status changes from running to success THEN the System SHALL trigger onTaskCompleted callback to refresh data sources
5. WHEN a user clicks "刷新" THEN the System SHALL manually refresh the task list
6. WHEN a task is running or queued THEN the System SHALL display a "取消" button
7. WHEN a task is failed THEN the System SHALL display a "重试" button
8. WHEN a task is success THEN the System SHALL display a "下载" button

### Requirement 24: 异步任务操作

**User Story:** As a user, I want to preview, download, cancel, and retry async tasks, so that I can manage my long-running queries.

#### Acceptance Criteria

1. WHEN a user clicks "预览结果" THEN the System SHALL execute a SELECT * FROM async_result_{task_id} LIMIT 100 query
2. WHEN a user clicks "下载" THEN the System SHALL open a format selection dialog (CSV, Parquet)
3. WHEN a user selects a format and confirms THEN the System SHALL call the download API and trigger file download
4. WHEN a user clicks "取消" THEN the System SHALL open a confirmation dialog with reason input
5. WHEN a user confirms cancellation THEN the System SHALL call the cancel API and mark the task as failed
6. WHEN a user clicks "重试" THEN the System SHALL open a confirmation dialog
7. WHEN a user confirms retry THEN the System SHALL create a new task with the same SQL and configuration

---

## 🔵 Phase 8: 可视化查询（最后实现）

### Requirement 25: Visual Query Builder 组件

**User Story:** As a user, I want to build SQL queries visually, so that I can create queries without writing SQL code.

#### Acceptance Criteria

1. WHEN the 可视化查询 tab is active THEN the System SHALL display query mode cards: 字段选择, 筛选条件, 分组聚合, 排序, 限制结果
2. WHEN a user clicks a mode card THEN the System SHALL show the configuration panel on the right
3. WHEN a user modifies query parameters THEN the System SHALL update the generated SQL preview in real-time
4. WHEN a user clicks "执行查询" THEN the System SHALL submit the query and display results
5. WHEN a user adds a filter condition THEN the System SHALL render a row with: field selector, operator selector, value input
6. WHEN a user configures grouping THEN the System SHALL display: group-by field list, aggregate function configuration

---

## 📊 功能优先级总结

| Phase | 功能模块 | 优先级 | 预计工作量 |
|-------|---------|-------|-----------|
| 1 | 主区域布局和框架 | 🔴 最高 | 2-3 天 |
| 2 | 数据源面板（左侧） | 🔴 最高 | 3-4 天 |
| 3 | ResultPanel（核心功能） | 🔴 最高 | 5-7 天 |
| 4 | SQL 查询 | 🟡 高 | 3-4 天 |
| 5 | JOIN 查询 | 🟡 高 | 2-3 天 |
| 6 | 集合操作 | 🟡 高 | 2-3 天 |
| 7 | 透视表 | 🟢 中 | 3-4 天 |
| 8 | 异步任务 | 🟢 中 | 2-3 天 |
| 9 | 可视化查询 | 🔵 低 | 4-5 天 |

**总计**: 约 26-36 天（5-7 周）

---

**文档版本**: v2.0  
**创建时间**: 2024-12-04  
**状态**: 📝 待评审
