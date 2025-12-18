# Requirements Document

## Introduction

本需求文档描述了外部数据库工作台导入功能。该功能允许用户在查询工作台中直接查询外部数据库（MySQL、PostgreSQL、SQLite）的表，预览查询结果，并将结果导入到 DuckDB 中进行进一步分析。这是一个"外部先导入再使用"的策略，避免了跨库查询的复杂性。

## Glossary

- **外部数据库 (External Database)**: MySQL、PostgreSQL、SQLite 等非 DuckDB 数据库
- **外部表 (External Table)**: 存储在外部数据库中的表
- **导入 (Import)**: 将外部数据库查询结果保存到 DuckDB 中作为新表
- **预览 (Preview)**: 在不导入的情况下查看外部表的数据和结构
- **SelectedTable**: 表示选中表的数据结构，包含表名、来源、连接信息等
- **QueryWorkbench**: 新版查询工作台，支持 SQL、可视化查询、Join、Set 操作等

## Requirements

### Requirement 1: External Table Selection Enhancement

**User Story:** As a user, I want to select external database tables in the data source panel, so that I can query them in the workbench.

#### Acceptance Criteria

1. WHEN I expand an external database connection in the data source panel THEN THE system SHALL display all available tables with proper database type icons
2. WHEN I click on an external table THEN THE system SHALL add it to the selected tables list with source information preserved
3. WHEN I view selected tables THEN THE system SHALL display both DuckDB tables and external tables with different visual indicators
4. WHEN I remove an external table from selection THEN THE system SHALL remove it from the workbench context

### Requirement 2: SelectedTable Data Structure Upgrade

**User Story:** As a developer, I want an enhanced SelectedTable structure, so that the system can handle both DuckDB and external tables uniformly.

#### Acceptance Criteria

1. WHEN representing a DuckDB table THEN THE SelectedTable SHALL use format `{ name: "table_name", source: "duckdb" }`
2. WHEN representing an external table THEN THE SelectedTable SHALL use format `{ name: "table_name", source: "external", connection: { id, name, type }, schema?: "schema_name" }`
3. WHEN legacy code accesses SelectedTable THEN THE system SHALL maintain backward compatibility through string conversion
4. WHEN new code processes SelectedTable THEN THE system SHALL handle both formats correctly

### Requirement 3: External SQL Preview

**User Story:** As a user, I want to preview external table data without importing, so that I can understand the data structure before making decisions.

#### Acceptance Criteria

1. WHEN I select external tables in SQL Query panel THEN THE system SHALL generate a preview query automatically
2. WHEN I execute a preview query THEN THE system SHALL query the external database directly
3. WHEN preview results are displayed THEN THE system SHALL show data with proper column types and formatting
4. WHEN preview query fails THEN THE system SHALL display clear error messages with connection diagnostics

### Requirement 4: Import to DuckDB Functionality

**User Story:** As a user, I want to import external query results to DuckDB, so that I can perform complex analysis using DuckDB's capabilities.

#### Acceptance Criteria

1. WHEN I execute an external query THEN THE system SHALL display an "Import to DuckDB" button in the result panel
2. WHEN I click "Import to DuckDB" THEN THE system SHALL show a dialog to specify the target table name
3. WHEN I confirm the import THEN THE system SHALL save the query results as a new DuckDB table
4. WHEN import completes THEN THE system SHALL refresh the DuckDB tables list and show the new table
5. WHEN import fails THEN THE system SHALL display clear error messages with retry options

### Requirement 5: Visual Query Builder Compatibility

**User Story:** As a user, I want to use external tables in the visual query builder, so that I can create queries without writing SQL.

#### Acceptance Criteria

1. WHEN I select external tables in Table Selector THEN THE system SHALL display them with external database indicators
2. WHEN I build a query with external tables THEN THE system SHALL generate appropriate SQL for the external database
3. WHEN I preview a visual query with external tables THEN THE system SHALL execute against the external database
4. WHEN external tables are mixed with DuckDB tables THEN THE system SHALL show a warning about cross-database limitations

### Requirement 6: Join Query Enhancement

**User Story:** As a user, I want to create joins between external tables, so that I can analyze related data across tables.

#### Acceptance Criteria

1. WHEN I add external tables to Join Query THEN THE system SHALL display them with source indicators
2. WHEN I configure joins between external tables from the same connection THEN THE system SHALL generate valid SQL
3. WHEN I try to join tables from different connections THEN THE system SHALL show a warning and suggest importing first
4. WHEN I execute a join query with external tables THEN THE system SHALL run against the appropriate external database

### Requirement 7: Set Operations Support

**User Story:** As a user, I want to perform UNION/INTERSECT/EXCEPT operations on external tables, so that I can combine datasets.

#### Acceptance Criteria

1. WHEN I add external tables to Set Operations THEN THE system SHALL validate column compatibility
2. WHEN columns do not match THEN THE system SHALL display clear error messages with column mapping suggestions
3. WHEN I execute set operations on external tables THEN THE system SHALL run against the external database
4. WHEN mixing external and DuckDB tables THEN THE system SHALL suggest importing external tables first

### Requirement 8: Pivot Table Integration

**User Story:** As a user, I want to create pivot tables from external data, so that I can analyze data in different dimensions.

#### Acceptance Criteria

1. WHEN I select an external table for pivot THEN THE system SHALL fetch column information from the external database
2. WHEN I configure pivot dimensions THEN THE system SHALL validate column types and suggest appropriate aggregations
3. WHEN I execute a pivot query THEN THE system SHALL generate and run SQL against the external database
4. WHEN pivot results are large THEN THE system SHALL offer the option to import results to DuckDB for better performance

### Requirement 9: Error Handling and User Feedback

**User Story:** As a user, I want clear feedback when working with external databases, so that I can troubleshoot issues effectively.

#### Acceptance Criteria

1. WHEN external database connection fails THEN THE system SHALL display specific error messages with troubleshooting tips
2. WHEN external queries timeout THEN THE system SHALL display timeout warnings with options to adjust settings
3. WHEN external table schema changes THEN THE system SHALL display warnings about potential query failures
4. WHEN import operations fail THEN THE system SHALL display detailed error logs with retry options

### Requirement 10: Performance Optimization

**User Story:** As a user, I want external database operations to be performant, so that I can work efficiently with large datasets.

#### Acceptance Criteria

1. WHEN querying external tables THEN THE system SHALL use connection pooling to minimize overhead
2. WHEN previewing large tables THEN THE system SHALL automatically add LIMIT clauses
3. WHEN importing large datasets THEN THE system SHALL display progress indicators and provide cancellation options
4. WHEN external operations are slow THEN THE system SHALL display performance tips and optimization suggestions

### Requirement 11: Internationalization Support

**User Story:** As a user, I want the external database features to support multiple languages, so that I can use the application in my preferred language.

#### Acceptance Criteria

1. WHEN displaying external database UI elements THEN THE system SHALL use i18n keys for all text
2. WHEN showing error messages THEN THE system SHALL localize them appropriately
3. WHEN displaying tooltips and help text THEN THE system SHALL support multiple languages
4. WHEN external database types are shown THEN THE system SHALL use consistent terminology across languages
