# Requirements Document

## Introduction

本规范旨在修复外部数据库表（MySQL/PostgreSQL/SQLite）在新工作台中的集成问题。当前实现存在数据结构不贯通、API 契约不匹配、执行链路断裂等 P0 级别问题，导致外部表的选择、查询、导入功能完全无法使用。

本规范聚焦于 P0 问题的修复，确保外部表的完整工作流程能够端到端运行。

## Glossary

- **SelectedTable**: 统一的表选择数据结构，包含表名、来源类型（duckdb/external）、连接信息等
- **External Table**: 来自外部数据库（MySQL/PostgreSQL/SQLite）的表，需要通过数据源连接访问
- **DuckDB Table**: 本地 DuckDB 数据库中的表，可直接查询
- **db_ prefix**: 后端为数据库类型数据源 ID 添加的前缀，前端调用 API 时需要去除
- **subtype**: 后端 API 返回的数据源真实类型字段（mysql/postgresql/sqlite），区别于 type="database"
- **QueryWorkspace**: 查询工作台的核心状态管理 Hook
- **DataSourcePanel**: 左侧数据源树形面板组件

## Requirements

### Requirement 1: SelectedTable 数据结构贯通

**User Story:** As a developer, I want the SelectedTable data structure to flow consistently through all components, so that external table information (connection, schema, table name) is preserved throughout the query workflow.

#### Acceptance Criteria

1. WHEN a user selects an external table in DataSourcePanel, THEN the QueryWorkspace SHALL store a SelectedTable object containing connection ID, schema name, table name, and source type.
2. WHEN QueryWorkspace passes selected tables to QueryTabs, THEN the QueryTabs component SHALL receive SelectedTable[] instead of string[].
3. WHEN any query panel (Visual/SQL/Join/Set/Pivot) receives selected tables, THEN the panel SHALL have access to the full SelectedTable object with source information.
4. WHEN the user deselects a table, THEN the QueryWorkspace SHALL remove the corresponding SelectedTable object from state.

### Requirement 2: 数据源 Hook API 契约修复

**User Story:** As a developer, I want the data source hooks to correctly parse backend API responses, so that external database connections are properly displayed and usable.

#### Acceptance Criteria

1. WHEN useDatabaseConnections fetches from /api/datasources, THEN the hook SHALL map item.subtype to connection.type (mysql/postgresql/sqlite).
2. WHEN useDatabaseConnections processes API response, THEN the hook SHALL strip the "db_" prefix from item.id to get the raw connection ID.
3. WHEN useDataSources fetches data sources, THEN the hook SHALL read from response.data.items (not response.datasources).
4. WHEN useDataSources returns database connections, THEN each connection SHALL include the correct dbType from subtype field.

### Requirement 3: 外部表查询执行链路

**User Story:** As a user, I want to execute SQL queries against external database tables, so that I can preview and analyze data from MySQL/PostgreSQL/SQLite sources.

#### Acceptance Criteria

1. WHEN a user executes a query with external table selected, THEN the QueryWorkspace SHALL call POST /api/execute_sql with the correct datasource.id (without db_ prefix).
2. WHEN handleQueryExecute receives a source parameter with type="external", THEN the system SHALL route the query to the external database instead of DuckDB.
3. WHEN the external query completes, THEN the QueryWorkspace SHALL store both the SQL and source information for potential import operations.
4. WHEN the external query fails, THEN the system SHALL display a user-friendly error message with the actual database error.

### Requirement 4: 外部查询结果导入 DuckDB

**User Story:** As a user, I want to import external query results into DuckDB, so that I can perform further analysis using DuckDB's capabilities.

#### Acceptance Criteria

1. WHEN ResultPanel displays external query results, THEN the panel SHALL show an "Import to DuckDB" button.
2. WHEN the user clicks import, THEN the ImportToDuckDBDialog SHALL receive the current SQL and source information from QueryWorkspace.
3. WHEN ImportToDuckDBDialog calls POST /api/save_query_to_duckdb, THEN the request SHALL include datasource.id without the "db_" prefix.
4. WHEN ImportToDuckDBDialog calls the import API, THEN the request SHALL include datasource.type as the actual database type (mysql/postgresql/sqlite).
5. IF the import succeeds, THEN the system SHALL refresh the DuckDB tables list and display a success message.

### Requirement 5: DataSourcePanel 外部表选中状态

**User Story:** As a user, I want to see which external tables are selected in the DataSourcePanel, so that I have clear visual feedback of my current selection.

#### Acceptance Criteria

1. WHEN an external table is selected, THEN the DataSourcePanel SHALL highlight the table row with the selected style.
2. WHEN checking if an external table is selected, THEN the system SHALL compare using the full identifier (connection.id + schema + table.name) or SelectedTable object matching.
3. WHEN the user clicks a selected external table again, THEN the system SHALL deselect it and remove the highlight.
4. WHEN multiple external tables from the same connection are selected, THEN all selected tables SHALL show the selected highlight.

### Requirement 6: 连接测试与密码处理

**User Story:** As a user, I want to test database connections correctly, so that I can verify my connection settings before using them.

#### Acceptance Criteria

1. WHEN testing a new connection (not yet saved), THEN the system SHALL call POST /api/datasources/databases/test and check data.connection_test.success for the result.
2. WHEN testing an existing saved connection, THEN the system SHALL call POST /api/datasources/databases/{id}/refresh to use the stored password.
3. WHEN displaying a saved connection's password field, THEN the system SHALL show "***ENCRYPTED***" as placeholder.
4. WHEN saving a connection with password still showing "***ENCRYPTED***", THEN the backend SHALL preserve the original password.

### Requirement 7: Join Tab 配置收缩与多条件支持

**User Story:** As a user, I want the Join configuration to properly handle table removal and support multiple join conditions, so that I can build complex join queries correctly.

#### Acceptance Criteria

1. WHEN a user removes a table from the join, THEN the JoinQueryPanel SHALL shrink joinConfigs array to match the remaining tables.
2. WHEN a table is removed from the middle of the join chain, THEN the system SHALL remove the corresponding joinConfig and update selectedColumns accordingly.
3. WHEN configuring a join, THEN the user SHALL be able to add multiple join conditions (e.g., ON a.col1 = b.col1 AND a.col2 = b.col2).
4. WHEN multiple join conditions exist, THEN the generated SQL SHALL combine them with AND operator.

### Requirement 8: Set Operations 列一致性校验

**User Story:** As a user, I want the Set Operations panel to validate column consistency, so that I don't get SQL errors from mismatched column selections.

#### Acceptance Criteria

1. WHEN the first table's columns are selected in Set Operations, THEN the system SHALL use these as the "baseline column set".
2. WHEN selecting columns for subsequent tables, THEN the system SHALL only allow columns with matching names from the baseline set.
3. IF column selections across tables are inconsistent, THEN the system SHALL display a warning and disable the execute button.
4. WHEN all tables have consistent column selections, THEN the execute button SHALL be enabled.

### Requirement 9: Pivot Table 真正实现

**User Story:** As a user, I want the Pivot Table to actually pivot data using the column field, so that I can create cross-tabulation reports.

#### Acceptance Criteria

1. WHEN a user configures a pivot with rowFields, columnField, and valueField, THEN the generated SQL SHALL create actual pivot columns.
2. WHEN generating pivot SQL, THEN the system SHALL first query distinct values of columnField (limited to top N, e.g., 20).
3. WHEN generating pivot SQL, THEN the system SHALL use CASE WHEN expressions to create columns for each distinct value.
4. IF the distinct values of columnField exceed the threshold, THEN the system SHALL display a warning suggesting to import to DuckDB first.

### Requirement 10: 外部表列信息获取

**User Story:** As a user, I want to see column information for external tables in Join/Set/Pivot panels, so that I can build queries using external data sources.

#### Acceptance Criteria

1. WHEN an external table is selected in Join/Set/Pivot panels, THEN the system SHALL fetch column information from the external database.
2. IF external column fetching is not supported, THEN the panel SHALL display a message prompting the user to import to DuckDB first.
3. WHEN external tables are used in multi-table operations, THEN the system SHALL clearly indicate which tables are external vs DuckDB.

### Requirement 11: TableContextMenu 外部表处理

**User Story:** As a user, I want the right-click context menu to show appropriate options for external tables, so that I don't see irrelevant DuckDB-specific options.

#### Acceptance Criteria

1. WHEN right-clicking an external table, THEN the context menu SHALL show Preview and Import options.
2. WHEN right-clicking an external table, THEN the context menu SHALL NOT show DuckDB-specific options like DESCRIBE.
3. WHEN selecting "Structure" for an external table, THEN the system SHALL call the external columns API or hide the option.

### Requirement 12: AG Grid Community 版本兼容

**User Story:** As a developer, I want the AG Grid configuration to be compatible with Community edition, so that enterprise-only features don't cause errors.

#### Acceptance Criteria

1. WHEN configuring AG Grid, THEN the system SHALL NOT enable enableRangeSelection (enterprise-only feature).
2. WHEN calling grid API methods, THEN the system SHALL use defensive checks like gridApi?.getCellRanges?.() to handle undefined methods.
3. WHEN handling Escape key, THEN the system SHALL gracefully handle missing range selection API.

### Requirement 13: UI Token 类规范化

**User Story:** As a developer, I want all new UI components to use standard shadcn/ui tokens, so that the codebase follows consistent styling conventions.

#### Acceptance Criteria

1. WHEN styling components in new/ directory, THEN the system SHALL use bg-card or bg-background instead of bg-surface.
2. WHEN styling hover states, THEN the system SHALL use bg-accent instead of bg-surface-hover.
3. WHEN styling warning states, THEN the system SHALL use text-muted-foreground with icons or approved warning variants.
4. WHEN setting z-index, THEN the system SHALL NOT use arbitrary values like z-[1050], instead using shadcn Dialog/Sheet built-in layering.

### Requirement 14: 国际化文案统一

**User Story:** As a user, I want all UI text to be properly internationalized, so that the application can support multiple languages.

#### Acceptance Criteria

1. WHEN displaying text in new/ components, THEN the system SHALL use t() function with i18n keys instead of hardcoded Chinese text.
2. WHEN adding new UI text, THEN the developer SHALL add corresponding keys to both zh/common.json and en/common.json.
3. WHEN displaying context menu items, THEN all menu text SHALL use i18n keys.
4. WHEN displaying empty states and toast messages, THEN all text SHALL use i18n keys.

### Requirement 15: 外部表图标统一

**User Story:** As a user, I want external tables to have consistent and clear visual indicators, so that I can easily distinguish them from DuckDB tables.

#### Acceptance Criteria

1. WHEN displaying external tables in DataSourcePanel, THEN the system SHALL use lucide-react icons instead of text emoji.
2. WHEN displaying external tables, THEN the system SHALL show a Badge or icon indicating the source type (MySQL/PostgreSQL/SQLite).
3. WHEN displaying table icons, THEN the styling SHALL be consistent across all panels (DataSourcePanel, TableSelector, etc.).

