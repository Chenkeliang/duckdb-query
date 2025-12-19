# Requirements Document

## Introduction

本功能为查询面板（SQL 查询、透视表、集合操作等）添加统一的联邦查询支持层，使用户能够在各类查询面板中执行包含外部表（如 MySQL、PostgreSQL 等）的查询。系统将提供统一的外部表检测、attachDatabases 构建、以及错误处理机制。

## 技术方案调研结论

### SQL 解析方案选择：简化 Tokenizer + 状态机

经过技术调研，确定使用**手写 Tokenizer + 状态机**方案实现 SQL 表引用解析：

| 方案             | 包大小   | 适用性                   | 结论          |
| ---------------- | -------- | ------------------------ | ------------- |
| 正则表达式       | 0        | 边界情况多，难维护       | ❌ 已验证不可行 |
| node-sql-parser  | ~500KB   | 功能过度，包太大         | ❌ 不推荐       |
| 手写 Tokenizer   | ~3KB     | 可控、够用               | ✅ 推荐         |

**选择理由**：
1. 零依赖，不增加包大小
2. 代码量小（~150 行），易于维护
3. 逻辑清晰，完美处理边界情况
4. 符合项目"组件选择原则"

## Glossary

- **Query_Panel**: 查询面板组件的统称，包括 SQL 查询面板、透视表面板、集合操作面板等
- **Federated_Query**: 联邦查询，指同时查询 DuckDB 本地表和外部数据库表的查询
- **External_Table**: 外部表，指存储在外部数据库（MySQL、PostgreSQL 等）中的表
- **DuckDB_Table**: DuckDB 本地表，指存储在 DuckDB 中的表
- **Attach_Database**: ATTACH 数据库操作，DuckDB 用于连接外部数据库的机制
- **Table_Prefix**: 表名前缀，如 `mysql_sorder.bschool_order` 中的 `mysql_sorder`
- **Database_Connection**: 数据库连接配置，包含连接外部数据库所需的信息
- **Selected_Tables**: 用户从数据源面板选择的表列表
- **Federated_Query_Service**: 联邦查询服务层，提供统一的外部表检测和 attachDatabases 构建逻辑
- **Unrecognized_Prefix**: 未识别的前缀，指 SQL 中出现但未匹配到任何已配置数据库连接的表名前缀

## Requirements

### Requirement 1

**User Story:** As a user, I want the SQL Query Panel to automatically detect external table references in my SQL, so that I can execute federated queries without manual configuration.

#### Acceptance Criteria

1. WHEN a user enters SQL containing table references with prefixes (e.g., `mysql_sorder.bschool_order`) THEN the SQL_Query_Panel SHALL parse and extract all table prefixes from the SQL
2. WHEN table prefixes are extracted THEN the SQL_Query_Panel SHALL match each prefix against configured Database_Connections
3. WHEN a prefix matches a configured Database_Connection THEN the SQL_Query_Panel SHALL add that connection to the attachDatabases list
4. WHEN the SQL contains only DuckDB_Table references THEN the SQL_Query_Panel SHALL execute the query using the standard query API
5. WHEN the SQL contains External_Table references THEN the SQL_Query_Panel SHALL execute the query using the federated query API

### Requirement 2

**User Story:** As a user, I want the system to combine external tables from both my SQL and my selected tables, so that I have a complete federated query context.

#### Acceptance Criteria

1. WHEN a user has Selected_Tables from the data source panel THEN the SQL_Query_Panel SHALL include those tables' database connections in attachDatabases
2. WHEN both Selected_Tables and SQL parsing identify the same database connection THEN the SQL_Query_Panel SHALL deduplicate the attachDatabases list
3. WHEN Selected_Tables contain external tables THEN the SQL_Query_Panel SHALL prioritize Selected_Tables connection information over SQL parsing results
4. WHEN SQL contains external tables not in Selected_Tables THEN the SQL_Query_Panel SHALL add those connections to attachDatabases as supplementary

### Requirement 3

**User Story:** As a user, I want to see which databases will be attached before executing my query, so that I can verify the federated query configuration.

#### Acceptance Criteria

1. WHEN attachDatabases list is non-empty THEN the SQL_Query_Panel SHALL display an indicator showing the databases to be attached
2. WHEN the user hovers over the indicator THEN the SQL_Query_Panel SHALL show a tooltip listing all database connections
3. WHEN no external tables are detected THEN the SQL_Query_Panel SHALL hide the attached databases indicator

### Requirement 4

**User Story:** As a user, I want the SQL parsing to handle various SQL syntax patterns, so that external table detection works reliably.

#### Acceptance Criteria

1. WHEN SQL contains table references in FROM clause THEN the SQL_Query_Panel SHALL detect those table prefixes
2. WHEN SQL contains table references in JOIN clauses THEN the SQL_Query_Panel SHALL detect those table prefixes
3. WHEN SQL contains table references with aliases (e.g., `mysql_db.table AS t`) THEN the SQL_Query_Panel SHALL correctly extract the prefix
4. WHEN SQL contains subqueries with external tables THEN the SQL_Query_Panel SHALL detect table prefixes in subqueries
5. WHEN SQL contains quoted identifiers (e.g., `"mysql_db"."table"`) THEN the SQL_Query_Panel SHALL correctly parse the prefix

### Requirement 5

**User Story:** As a user, I want clear error messages when federated query configuration fails, so that I can troubleshoot issues.

#### Acceptance Criteria

1. WHEN a table prefix does not match any configured Database_Connection THEN the Query_Panel SHALL display a warning indicating the unrecognized prefix
2. WHEN a matched Database_Connection is not properly configured THEN the Query_Panel SHALL display an error with the connection name
3. WHEN federated query execution fails due to connection issues THEN the Query_Panel SHALL display the specific connection error

### Requirement 6

**User Story:** As a user, I want to resolve unrecognized table prefix warnings, so that I can successfully execute my federated query.

#### Acceptance Criteria

1. WHEN an Unrecognized_Prefix warning is displayed THEN the Query_Panel SHALL provide an action button to configure a new database connection
2. WHEN the user clicks the configure action THEN the Query_Panel SHALL open the database connection configuration dialog with the prefix pre-filled as suggested connection name
3. WHEN a new Database_Connection is successfully configured THEN the Query_Panel SHALL automatically re-detect external tables and update the attachDatabases list
4. WHEN the user dismisses the warning without configuring THEN the Query_Panel SHALL allow query execution but exclude the unrecognized tables from federated query
5. WHEN multiple Unrecognized_Prefixes exist THEN the Query_Panel SHALL list all of them with individual configure actions

### Requirement 7

**User Story:** As a developer, I want a unified federated query service layer, so that all query panels can share the same external table detection and attachDatabases building logic.

#### Acceptance Criteria

1. THE Federated_Query_Service SHALL provide a function to extract table prefixes from SQL strings
2. THE Federated_Query_Service SHALL provide a function to match prefixes against configured Database_Connections
3. THE Federated_Query_Service SHALL provide a function to build attachDatabases list from Selected_Tables
4. THE Federated_Query_Service SHALL provide a function to merge and deduplicate attachDatabases from multiple sources
5. THE Federated_Query_Service SHALL be usable by SQL_Query_Panel, PivotTable_Panel, SetOperations_Panel, and JoinQuery_Panel

### Requirement 8

**User Story:** As a user, I want the federated query detection to work consistently across all query panels, so that I have a unified experience.

#### Acceptance Criteria

1. WHEN using PivotTable_Panel with external tables THEN the panel SHALL use Federated_Query_Service to detect and build attachDatabases
2. WHEN using SetOperations_Panel with external tables THEN the panel SHALL use Federated_Query_Service to detect and build attachDatabases
3. WHEN using JoinQuery_Panel with external tables THEN the panel SHALL continue to use Federated_Query_Service (already implemented)
4. WHEN using SQL_Query_Panel with external tables THEN the panel SHALL use Federated_Query_Service to detect and build attachDatabases
5. WHEN any Query_Panel detects external tables THEN the panel SHALL display the same AttachedDatabasesIndicator component

### Requirement 9

**User Story:** As a user, I want to manually override the auto-detected attachDatabases list, so that I have full control over federated query configuration.

#### Acceptance Criteria

1. WHEN attachDatabases is auto-detected THEN the Query_Panel SHALL allow the user to manually add additional database connections
2. WHEN attachDatabases is auto-detected THEN the Query_Panel SHALL allow the user to remove auto-detected connections
3. WHEN the user manually modifies attachDatabases THEN the Query_Panel SHALL persist the manual override for the current query session
4. WHEN the SQL or Selected_Tables change THEN the Query_Panel SHALL re-run auto-detection but preserve manual additions

### Requirement 10

**User Story:** As a user, I want to write complex SQL queries that JOIN DuckDB tables with external tables, so that I can perform cross-database analysis.

#### Acceptance Criteria

1. WHEN a user writes SQL with multiple table references THEN the SQL_Query_Panel SHALL allow execution without single-table restriction
2. WHEN SQL contains both DuckDB_Table and External_Table references THEN the SQL_Query_Panel SHALL execute as a federated query (not show mixed source warning)
3. WHEN SQL contains JOINs between DuckDB and external tables THEN the SQL_Query_Panel SHALL automatically detect and ATTACH required external databases
4. WHEN SQL contains subqueries referencing external tables THEN the SQL_Query_Panel SHALL include those databases in attachDatabases
5. WHEN executing federated query THEN the SQL_Query_Panel SHALL use the federated query API endpoint

### Requirement 11

**User Story:** As a user, I want the SQL Query Panel to support free-form SQL input without requiring table selection, so that I can write any SQL query directly.

#### Acceptance Criteria

1. WHEN no tables are selected from the data source panel THEN the SQL_Query_Panel SHALL still allow SQL input and execution
2. WHEN SQL is entered manually without table selection THEN the SQL_Query_Panel SHALL parse the SQL to detect table references
3. WHEN parsed table references include external tables THEN the SQL_Query_Panel SHALL automatically build attachDatabases from SQL parsing
4. WHEN SQL references tables that exist in DuckDB THEN the SQL_Query_Panel SHALL execute using standard query API
5. WHEN SQL references tables with prefixes matching configured connections THEN the SQL_Query_Panel SHALL execute using federated query API

### Requirement 12

**User Story:** As a user, I want the SQL editor to provide autocomplete suggestions for both DuckDB tables and external database tables, so that I can write queries more efficiently.

#### Acceptance Criteria

1. WHEN typing in the SQL editor THEN the editor SHALL suggest DuckDB table names
2. WHEN typing in the SQL editor THEN the editor SHALL suggest external table names with their database prefix (e.g., `mysql_orders.users`)
3. WHEN a table name is selected from autocomplete THEN the editor SHALL insert the fully qualified name for external tables
4. WHEN typing after a database prefix (e.g., `mysql_orders.`) THEN the editor SHALL suggest tables from that specific connection
5. WHEN typing column names after a table reference THEN the editor SHALL suggest columns from that table (both DuckDB and external)

### Requirement 13

**User Story:** As a developer, I want the system to handle edge cases gracefully, so that users have a robust experience.

#### Acceptance Criteria

1. WHEN SQL contains a table prefix that matches multiple database connections THEN the Federated_Query_Service SHALL use the first matching connection and log a warning
2. WHEN SQL contains quoted identifiers (e.g., `"mysql_db"."table"`) THEN the parser SHALL correctly extract the prefix
3. WHEN SQL contains table aliases (e.g., `mysql_db.users AS u`) THEN the parser SHALL extract the original table reference
4. WHEN SQL contains CTEs (Common Table Expressions) THEN the parser SHALL not treat CTE names as external tables
5. WHEN SQL contains function calls that look like table references (e.g., `read_csv('file.csv')`) THEN the parser SHALL not treat them as external tables
6. WHEN a database connection is deleted while SQL references it THEN the Query_Panel SHALL show an error indicating the connection no longer exists
7. WHEN SQL parsing fails due to syntax errors THEN the Query_Panel SHALL fall back to standard query execution and let the database report the error

### Requirement 14

**User Story:** As a user, I want the system to handle the transition from current behavior smoothly, so that my existing workflows are not disrupted.

#### Acceptance Criteria

1. WHEN upgrading from the current version THEN existing SQL queries without external table references SHALL continue to work unchanged
2. WHEN the "mixed source warning" is removed THEN queries that previously showed the warning SHALL now execute as federated queries
3. WHEN selectedTables contains external tables THEN the system SHALL use both selectedTables and SQL parsing to build attachDatabases (merged and deduplicated)
4. WHEN SQL contains table references that conflict with selectedTables THEN the system SHALL prioritize selectedTables connection information

