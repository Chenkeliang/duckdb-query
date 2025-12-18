# Requirements Document

## Introduction

本规范旨在修复外部数据库表在查询工作台中的三个关键问题：
1. 外部数据库表无法获取列信息（显示为空）
2. 执行联邦查询时返回 404 Not Found 错误
3. SQL 查询面板需要支持外部表和内部表的混合查询

## Glossary

- **External Table**: 来自外部数据库（MySQL、PostgreSQL 等）的表，通过数据库连接访问
- **DuckDB Table**: 存储在本地 DuckDB 数据库中的表
- **Federated Query**: 联邦查询，支持跨多个数据源（DuckDB + 外部数据库）的 SQL 查询
- **ATTACH Database**: DuckDB 的功能，允许临时连接外部数据库进行查询
- **JoinQueryPanel**: 关联查询面板，用于可视化构建多表 JOIN 查询
- **SQLQueryPanel**: SQL 查询面板，用于直接编写和执行 SQL 语句

## Requirements

### Requirement 1: 外部表列信息获取

**User Story:** As a user, I want to see column information for external database tables, so that I can select columns and build queries correctly.

#### Acceptance Criteria

1. WHEN a user selects an external table in JoinQueryPanel THEN the system SHALL fetch and display the table's column information using the external table detail API
2. WHEN fetching external table columns fails THEN the system SHALL display a user-friendly error message and allow the user to retry
3. WHEN external table columns are loading THEN the system SHALL display a loading indicator in the table card
4. WHEN external table columns are successfully loaded THEN the system SHALL display column names and types in the same format as DuckDB tables
5. WHEN external table columns array is empty THEN the system SHALL display a message indicating no columns found instead of an empty list
6. WHEN column name or type is null or undefined THEN the system SHALL display a fallback value (e.g., "unknown")

### Requirement 2: 联邦查询 API 端点修复

**User Story:** As a user, I want to execute federated queries without 404 errors, so that I can query data across multiple databases.

#### Acceptance Criteria

1. WHEN a federated query is submitted THEN the system SHALL route the request to the correct API endpoint
2. WHEN the API endpoint receives a federated query request THEN the system SHALL validate the attach_databases parameter
3. WHEN the federated query executes successfully THEN the system SHALL return query results in the standard response format
4. IF the federated query API endpoint does not exist THEN the system SHALL create the endpoint at `/api/duckdb/query` with federated query support

### Requirement 3: SQL 查询面板联邦查询支持

**User Story:** As a user, I want to write SQL queries that combine DuckDB tables and external database tables, so that I can perform cross-database analysis.

#### Acceptance Criteria

1. WHEN a user writes SQL that references external tables THEN the system SHALL automatically detect the need for federated query
2. WHEN executing a mixed query (DuckDB + external) THEN the system SHALL use the federated query API with appropriate attach_databases
3. WHEN the SQL query only references DuckDB tables THEN the system SHALL use the standard DuckDB query API
4. WHEN a federated query fails due to connection issues THEN the system SHALL display a clear error message indicating which database connection failed

### Requirement 4: 外部表列信息 API 集成

**User Story:** As a developer, I want a reliable API to fetch external table column information, so that the frontend can display accurate schema information.

#### Acceptance Criteria

1. WHEN the frontend requests external table details THEN the system SHALL call `/api/database_table_details/{connection_id}/{table_name}` endpoint
2. WHEN the API returns column information THEN the system SHALL transform it to match the DuckDB table detail format
3. WHEN the connection_id is invalid THEN the system SHALL return a 404 error with a descriptive message
4. WHEN the table does not exist in the external database THEN the system SHALL return a 404 error with a descriptive message

### Requirement 5: SetOperationsPanel 外部表支持

**User Story:** As a user, I want to perform set operations (UNION, INTERSECT, EXCEPT) on external database tables, so that I can combine data from different sources.

#### Acceptance Criteria

1. WHEN a user selects external tables in SetOperationsPanel THEN the system SHALL fetch and display column information for those tables
2. WHEN external tables are selected THEN the system SHALL enable execution using federated query
3. WHEN mixing DuckDB and external tables in set operations THEN the system SHALL use federated query to execute
4. WHEN column count validation fails THEN the system SHALL display a clear error message with specific column counts

### Requirement 6: PivotTablePanel 外部表支持

**User Story:** As a user, I want to create pivot tables from external database tables, so that I can analyze external data without importing it first.

#### Acceptance Criteria

1. WHEN a user selects an external table in PivotTablePanel THEN the system SHALL fetch and display column information
2. WHEN fetching distinct values for pivot column from external table THEN the system SHALL use federated query API
3. WHEN external table has no columns THEN the system SHALL display a message indicating the table structure could not be retrieved
4. WHEN pivot query is executed on external table THEN the system SHALL use federated query API
