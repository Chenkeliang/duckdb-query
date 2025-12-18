# Requirements Document

## Introduction

本规范针对外部数据源集成中的关键阻塞问题进行修复。根据详细的 code review，当前实现存在多个导致功能"不通/通了但不对"的问题，包括：source 参数在数据流中丢失、SQL 方言不兼容、右键菜单功能缺失、导入能力未按后端实际支持进行限制等。本规范旨在以最小改动打通完整链路。

## Glossary

- **SelectedTable**: 统一的表选择数据结构，包含表名、来源类型、连接信息等
- **TableSource**: 表来源信息，区分 DuckDB 本地表和外部数据库表
- **SQL Dialect**: SQL 方言，不同数据库（DuckDB、MySQL、PostgreSQL）的语法差异
- **Quote Identifier**: 标识符引用方式，DuckDB 用双引号，MySQL 用反引号
- **External Table**: 来自外部数据库连接的表，非 DuckDB 本地表

## Requirements

### Requirement 1: 统一表选择契约

**User Story:** As a developer, I want a unified table selection contract throughout the data flow, so that external table source information is never lost.

#### Acceptance Criteria

1. WHEN DataSourcePanel emits a table selection event THEN the system SHALL emit a complete SelectedTable object containing name, source type, connection info, and schema
2. WHEN useQueryWorkspace receives a table selection THEN the system SHALL store the complete SelectedTable object without losing any source information
3. WHEN QueryWorkspace passes table selection to child components THEN the system SHALL preserve the complete SelectedTable object
4. WHEN QueryTabs receives selected tables THEN the system SHALL have access to full source information for SQL generation and execution routing

### Requirement 2: 外部查询执行链路修复

**User Story:** As a user, I want to preview and execute queries on external tables, so that the queries run on the correct database.

#### Acceptance Criteria

1. WHEN handlePreview is called for an external table THEN the system SHALL pass the source information to handleQueryExecute
2. WHEN handleQueryExecute receives a query with external source THEN the system SHALL route the query to the external database API
3. WHEN Visual Query Builder executes a query THEN the system SHALL include source information in the onExecute callback
4. WHEN SQL Query Panel executes a query THEN the system SHALL determine the target database from the selected table's source

### Requirement 3: SQL 方言适配

**User Story:** As a user, I want SQL queries to use correct syntax for the target database, so that queries execute without syntax errors.

#### Acceptance Criteria

1. WHEN generating SQL for DuckDB THEN the system SHALL use double quotes for identifier quoting
2. WHEN generating SQL for MySQL THEN the system SHALL use backticks for identifier quoting
3. WHEN generating SQL for PostgreSQL THEN the system SHALL use double quotes for identifier quoting
4. WHEN generating SQL for external tables THEN the system SHALL include schema qualification when available
5. WHEN generating Join SQL THEN the system SHALL use the correct quoting style based on target database
6. WHEN generating Set Operations SQL THEN the system SHALL use the correct quoting style based on target database

### Requirement 4: 外部表右键菜单修复

**User Story:** As a user, I want the context menu for external tables to show appropriate options, so that I can preview data and import to DuckDB.

#### Acceptance Criteria

1. WHEN right-clicking an external table THEN the system SHALL show Preview and Import options
2. WHEN right-clicking an external table THEN the system SHALL hide DuckDB-specific options like DESCRIBE and DROP
3. WHEN TableItem renders an external table THEN the system SHALL pass isExternal and onImport props to ContextMenu
4. WHEN Import option is clicked THEN the system SHALL trigger the import workflow

### Requirement 5: 导入功能能力限制

**User Story:** As a user, I want the import button to only appear when the backend supports importing from my database type, so that I don't encounter unsupported operation errors.

#### Acceptance Criteria

1. WHEN displaying import button THEN the system SHALL check if the source database type is supported by the backend
2. WHEN source database type is MySQL THEN the system SHALL enable the import button
3. WHEN source database type is not MySQL THEN the system SHALL disable or hide the import button with a tooltip explaining the limitation
4. IF the backend adds support for more database types THEN the system SHALL be easily configurable to enable import for those types

### Requirement 6: Join 条件完整性校验

**User Story:** As a user, I want the system to prevent executing joins without valid conditions, so that I don't get SQL errors.

#### Acceptance Criteria

1. WHEN a join has no valid ON conditions THEN the system SHALL disable the execute button
2. WHEN a join references columns from a table without a valid join condition THEN the system SHALL show a warning
3. WHEN all join conditions are complete THEN the system SHALL enable the execute button

### Requirement 7: Set 操作空选择处理

**User Story:** As a user, I want the system to handle empty column selections correctly in Set operations, so that I get predictable results.

#### Acceptance Criteria

1. WHEN all columns are deselected for a table THEN the system SHALL treat it as "select all columns"
2. WHEN validating column consistency THEN the system SHALL use actual column counts, not selected column counts
3. WHEN column counts don't match between tables THEN the system SHALL disable execute and show a warning

### Requirement 8: 右键删除异步处理

**User Story:** As a user, I want delete operations to complete properly before UI updates, so that I see correct feedback.

#### Acceptance Criteria

1. WHEN confirmDelete calls onDelete THEN the system SHALL await the async operation
2. WHEN delete operation completes THEN the system SHALL show success toast
3. WHEN delete operation fails THEN the system SHALL show error toast with details

### Requirement 9: AG Grid Community 兼容性

**User Story:** As a user, I want copy functionality to work without Enterprise features, so that I can copy data from the grid.

#### Acceptance Criteria

1. WHEN useGridCopy calls getCellRanges THEN the system SHALL use defensive API calls with fallback
2. IF getCellRanges is not available THEN the system SHALL fall back to copySelectedRows
3. WHEN copying data THEN the system SHALL not throw errors in Community edition

### Requirement 10: 数据源连接 ID 一致性

**User Story:** As a developer, I want connection IDs to be consistent between frontend and backend, so that refresh and test operations work correctly.

#### Acceptance Criteria

1. WHEN DatabaseForm normalizes parameters THEN the system SHALL use the actual connection ID, not the display name
2. WHEN DuckQueryApp calls refresh THEN the system SHALL use the correct connection ID
3. WHEN SavedConnectionsList displays connections THEN the system SHALL handle both user and username fields

### Requirement 11: Toast 通知类型正确性

**User Story:** As a user, I want toast notifications to show the correct color/style based on the operation result, so that I can quickly understand whether an operation succeeded or failed.

#### Acceptance Criteria

1. WHEN a database connection test succeeds THEN the system SHALL show a success toast (green style)
2. WHEN a database connection test fails THEN the system SHALL show an error toast (red style)
3. WHEN an operation completes successfully THEN the system SHALL use toast.success() not toast.error()
4. WHEN an operation fails THEN the system SHALL use toast.error() with appropriate error message

