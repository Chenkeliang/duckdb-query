# Requirements Document

## Introduction

本功能为 DuckQuery 前端添加联邦查询支持，使用户能够在可视化查询界面中跨数据库进行关联查询。后端已经实现了联邦查询基础设施（通过 DuckDB 的 ATTACH 机制），前端需要相应地支持跨数据源的表选择、SQL 生成和查询执行。

联邦查询允许用户将 DuckDB 本地表与外部数据库（MySQL、PostgreSQL）的表进行 JOIN 操作，无需先将外部数据导入到 DuckDB。

## Glossary

- **Federated Query（联邦查询）**: 跨多个数据库执行的查询，通过 DuckDB 的 ATTACH 机制实现
- **ATTACH Database**: DuckDB 的功能，允许将外部数据库挂载为虚拟数据库，数据实时从外部读取，不复制到本地
- **attach_databases**: 后端 API 参数，指定需要 ATTACH 的外部数据库列表
- **TableSource**: 表来源信息，包含连接 ID、数据库类型等
- **Cross-Database Join**: 跨数据库的表关联操作
- **Connection ID**: 数据库连接的唯一标识符
- **Virtual Mount（虚拟挂载）**: ATTACH 创建的外部数据库连接，数据保留在源数据库，查询时实时读取
- **Import（导入）**: 将外部数据复制到 DuckDB 本地存储，成为永久表（与 ATTACH 不同）

## Technical Notes

### ATTACH vs Import

| 特性 | ATTACH（联邦查询） | Import（导入） |
|------|-------------------|----------------|
| 数据位置 | 保留在外部数据库 | 复制到 DuckDB 本地 |
| 数据实时性 | 实时读取最新数据 | 导入时的快照 |
| 连接生命周期 | 查询会话期间有效 | 永久存储 |
| 性能 | 受网络和外部数据库影响 | 本地查询速度快 |
| 适用场景 | 临时查询、数据探索 | 频繁查询、数据分析 |

本功能实现的是 ATTACH 方式的联邦查询，适合：
- 临时的跨数据库数据探索
- 不需要持久化的一次性查询
- 需要访问外部数据库最新数据的场景

如果用户需要频繁查询外部数据，建议使用"导入到 DuckDB"功能将数据复制到本地。

## Requirements

### Requirement 1

**User Story:** As a data analyst, I want to select tables from different database connections in the Join Query panel, so that I can perform cross-database joins without manually writing SQL.

#### Acceptance Criteria

1. WHEN a user opens the Join Query panel THEN the System SHALL allow selecting tables from both DuckDB and external database connections
2. WHEN a user selects tables from different database connections THEN the System SHALL display a visual indicator showing which connection each table belongs to
3. WHEN a user adds tables from multiple connections THEN the System SHALL automatically track the required ATTACH databases for query execution
4. WHEN a user removes a table from the join THEN the System SHALL update the attach_databases list accordingly

### Requirement 2

**User Story:** As a data analyst, I want the system to automatically generate correct federated query SQL, so that I can execute cross-database joins seamlessly.

#### Acceptance Criteria

1. WHEN generating SQL for cross-database joins THEN the System SHALL use the correct database alias prefix for external tables (e.g., `mysql_db.schema.table`)
2. WHEN the query involves external databases THEN the System SHALL include the attach_databases parameter in the API request
3. WHEN generating SQL THEN the System SHALL use the appropriate SQL dialect for identifier quoting based on the target database type
4. WHEN a user executes a federated query THEN the System SHALL pass the attach_databases array to the backend API

### Requirement 3

**User Story:** As a data analyst, I want to see clear feedback when federated queries fail, so that I can understand and fix connection or query issues.

#### Acceptance Criteria

1. WHEN an external database connection fails during query execution THEN the System SHALL display a specific error message indicating which connection failed
2. WHEN the ATTACH operation fails THEN the System SHALL suggest checking the database connection credentials
3. WHEN a federated query times out THEN the System SHALL display a timeout message with the affected database connection name
4. IF the external database is unreachable THEN the System SHALL display a connection error with retry option

### Requirement 4

**User Story:** As a data analyst, I want to use the Visual Query Builder with external database tables, so that I can build complex queries without writing SQL.

#### Acceptance Criteria

1. WHEN a user selects an external table in the Visual Query Builder THEN the System SHALL fetch and display the table's columns
2. WHEN building a query with external tables THEN the System SHALL generate SQL with proper database alias prefixes
3. WHEN the user adds filters on external table columns THEN the System SHALL include the correct table alias in the WHERE clause
4. WHEN the user selects columns from multiple tables THEN the System SHALL prefix each column with its source table alias

### Requirement 5

**User Story:** As a data analyst, I want the SQL Editor to support auto-completion for external database tables, so that I can write federated queries more efficiently.

#### Acceptance Criteria

1. WHEN typing in the SQL Editor with external connections available THEN the System SHALL suggest external table names with their database prefix
2. WHEN a user types a database alias followed by a dot THEN the System SHALL suggest tables from that attached database
3. WHEN a user types a table name followed by a dot THEN the System SHALL suggest columns from that table
4. WHEN external tables are used in the SQL THEN the System SHALL automatically detect and populate the attach_databases parameter

### Requirement 6

**User Story:** As a developer, I want the API client to support the attach_databases parameter, so that federated queries can be executed correctly.

#### Acceptance Criteria

1. WHEN calling the query execution API THEN the System SHALL accept an optional attach_databases parameter
2. WHEN attach_databases is provided THEN the System SHALL include it in the POST request body
3. WHEN the API returns an ATTACH error THEN the System SHALL parse and display the specific database that failed
4. WHEN executing a query THEN the System SHALL serialize the attach_databases array correctly as JSON

### Requirement 7

**User Story:** As a data analyst, I want to see which databases are being attached before executing a query, so that I can verify the query will access the correct data sources.

#### Acceptance Criteria

1. WHEN a federated query is ready to execute THEN the System SHALL display a list of databases that will be attached
2. WHEN hovering over an attached database indicator THEN the System SHALL show the connection details (type, host, database name)
3. WHEN the attach_databases list changes THEN the System SHALL update the UI indicator immediately
4. WHEN no external databases are needed THEN the System SHALL hide the attached databases indicator

### Requirement 8

**User Story:** As a data analyst, I want to join DuckDB local tables with external database tables, so that I can combine local data with remote data in a single query.

#### Acceptance Criteria

1. WHEN a user selects both DuckDB tables and external tables THEN the System SHALL allow the join operation
2. WHEN generating SQL for mixed-source joins THEN the System SHALL use unqualified names for DuckDB tables and qualified names (alias.schema.table) for external tables
3. WHEN executing a mixed-source query THEN the System SHALL only include external connections in the attach_databases parameter
4. WHEN displaying mixed-source joins THEN the System SHALL visually distinguish DuckDB tables from external tables using different icons or badges
5. WHEN a user hovers over a table in a mixed-source join THEN the System SHALL show the data source type (DuckDB or external connection name)

### Requirement 9

**User Story:** As a data analyst, I want to join tables from multiple different external databases, so that I can combine data from MySQL and PostgreSQL in a single query.

#### Acceptance Criteria

1. WHEN a user selects tables from multiple external connections THEN the System SHALL allow the join operation
2. WHEN generating SQL for multi-external joins THEN the System SHALL use unique aliases for each external database
3. WHEN executing a multi-external query THEN the System SHALL include all required connections in the attach_databases parameter
4. WHEN displaying multi-external joins THEN the System SHALL show the database type icon for each external table
5. IF two external connections have the same alias THEN the System SHALL generate unique aliases to avoid conflicts

### Requirement 10

**User Story:** As a data analyst, I want the system to automatically handle database connections when executing federated queries, so that I don't need to manually connect to each database before querying.

#### Acceptance Criteria

1. WHEN a user executes a federated query THEN the System SHALL automatically use the saved connection credentials to establish ATTACH connections
2. WHEN an ATTACH connection fails due to authentication THEN the System SHALL display a specific error message suggesting to verify the connection credentials in Data Source settings
3. WHEN an ATTACH connection attempt exceeds 2 seconds THEN the System SHALL timeout and display a connection timeout error with the database host information
4. WHEN a connection is successfully established THEN the System SHALL proceed with query execution without additional user interaction
5. IF the saved connection credentials are invalid THEN the System SHALL provide a link to the Data Source settings page for the user to update credentials
6. THE System SHALL use a 2-second timeout for automatic ATTACH connection attempts to ensure responsive user experience

### Requirement 11

**User Story:** As a data analyst, I want to see the connection status of external databases before executing a query, so that I can identify potential issues early.

#### Acceptance Criteria

1. WHEN external tables are selected for a query THEN the System SHALL display a connection status indicator for each external database
2. WHEN the user hovers over a connection status indicator THEN the System SHALL show the last successful connection time or error message
3. WHEN a connection is known to be unavailable THEN the System SHALL display a warning icon and disable the execute button with an explanation
4. WHEN the user clicks on a failed connection indicator THEN the System SHALL offer options to retry connection or go to Data Source settings

