# Requirements Document

## Introduction

本需求文档描述了为异步任务系统添加联邦查询支持的功能。当前系统的同步查询已支持联邦查询（通过 ATTACH 外部数据库），但异步任务系统尚不支持此功能。本功能将使用户能够提交涉及多个外部数据库的长时间运行查询作为异步任务执行。

## Glossary

- **Async_Task_System**: 异步任务管理系统，负责创建、执行、监控和管理后台运行的查询任务
- **Federated_Query**: 联邦查询，指跨多个数据库（DuckDB 本地表和外部数据库如 MySQL、PostgreSQL、SQLite）执行的 SQL 查询
- **ATTACH_Database**: DuckDB 的 ATTACH 命令，用于将外部数据库连接到当前 DuckDB 会话中
- **DETACH_Database**: DuckDB 的 DETACH 命令，用于断开已附加的外部数据库连接
- **Connection_Pool**: DuckDB 连接池，管理数据库连接的复用和生命周期
- **Task_Manager**: 任务管理器，负责任务状态跟踪、持久化和生命周期管理
- **Supported_External_Types**: 支持的外部数据库类型，包括 mysql、postgresql、sqlite
- **Password_Encryptor**: 密码加密器，用于加密存储和解密使用数据库连接密码
- **Database_Manager**: 数据库连接管理器，负责管理已保存的数据库连接配置

## Requirements

### Requirement 1

**User Story:** As a data analyst, I want to submit federated queries as async tasks, so that I can run long-running cross-database queries without blocking the UI.

#### Acceptance Criteria

1. WHEN a user submits an async query with attach_databases parameter THEN the Async_Task_System SHALL accept the request and create a task with federated query metadata
2. WHEN the Async_Task_System executes a federated query task THEN the system SHALL ATTACH all specified external databases before executing the SQL
3. WHEN the federated query execution completes (success or failure) THEN the Async_Task_System SHALL DETACH all attached databases to release resources
4. IF the ATTACH operation fails for any database THEN the Async_Task_System SHALL fail the task with a descriptive error message including the failed database alias
5. WHEN displaying task details THEN the Async_Task_System SHALL show the list of attached databases used in the query

### Requirement 2

**User Story:** As a developer, I want the async federated query API to be consistent with the sync federated query API, so that I can easily integrate both in the frontend.

#### Acceptance Criteria

1. WHEN the async query API receives attach_databases parameter THEN the Async_Task_System SHALL validate the format matches the sync federated query API (alias and connection_id fields)
2. WHEN storing task metadata THEN the Async_Task_System SHALL persist the attach_databases configuration for retry and audit purposes
3. WHEN a user retries a failed federated query task THEN the Async_Task_System SHALL use the original attach_databases configuration unless overridden

### Requirement 3

**User Story:** As a frontend developer, I want the AsyncTaskDialog to support federated queries, so that users can submit async tasks from the SQL panel when using external databases.

#### Acceptance Criteria

1. WHEN the AsyncTaskDialog receives attachDatabases prop THEN the dialog SHALL include this information in the async task submission
2. WHEN displaying task submission confirmation THEN the dialog SHALL show the list of external databases that will be attached
3. WHEN the SQL panel detects a federated query THEN the async execute button SHALL pass the detected attach_databases to the AsyncTaskDialog

### Requirement 4

**User Story:** As a system administrator, I want federated async tasks to handle connection failures gracefully, so that partial failures don't leave resources in an inconsistent state.

#### Acceptance Criteria

1. IF any ATTACH operation fails THEN the Async_Task_System SHALL DETACH all previously attached databases before failing the task
2. IF the query execution fails THEN the Async_Task_System SHALL still execute DETACH for all attached databases
3. IF a DETACH operation fails THEN the Async_Task_System SHALL log the error but continue detaching remaining databases
4. WHEN a federated task is cancelled THEN the Async_Task_System SHALL DETACH all attached databases before marking the task as cancelled

### Requirement 5

**User Story:** As a user, I want to see the federated query status in the async task list, so that I can identify which tasks involve external databases.

#### Acceptance Criteria

1. WHEN listing async tasks THEN the Async_Task_System SHALL include a flag indicating whether the task is a federated query
2. WHEN displaying task details THEN the Async_Task_System SHALL show the attached database aliases and their connection status during execution
3. WHEN a federated task completes THEN the result_info SHALL include the list of databases that were successfully attached

### Requirement 6

**User Story:** As a developer, I want the federated async query to reuse existing connection management infrastructure, so that password decryption and connection validation are consistent.

#### Acceptance Criteria

1. WHEN executing a federated async task THEN the Async_Task_System SHALL use the same build_attach_sql function as the sync federated query
2. WHEN decrypting database passwords THEN the Async_Task_System SHALL use the existing Password_Encryptor utility
3. WHEN validating connection_id THEN the Async_Task_System SHALL use the existing Database_Manager to retrieve connection configurations

### Requirement 7

**User Story:** As a system operator, I want the async federated query to respect DuckDB's single-writer constraint, so that concurrent operations don't cause database corruption.

#### Acceptance Criteria

1. WHEN executing ATTACH operations THEN the Async_Task_System SHALL perform all ATTACH commands within the same Connection_Pool connection context
2. WHEN executing the federated SQL query THEN the Async_Task_System SHALL use the same connection that performed the ATTACH operations
3. WHEN executing DETACH operations THEN the Async_Task_System SHALL perform all DETACH commands within the same connection context before releasing the connection
4. IF the connection is released before DETACH THEN the Async_Task_System SHALL acquire a new connection and attempt DETACH with appropriate error handling

### Requirement 8

**User Story:** As a user, I want to understand why my federated async task failed, so that I can fix the issue and retry.

#### Acceptance Criteria

1. IF the connection_id does not exist THEN the Async_Task_System SHALL fail with error message "数据库连接 '{connection_id}' 不存在"
2. IF the database type is not in Supported_External_Types THEN the Async_Task_System SHALL fail with error message "不支持的数据源类型: {type}"
3. IF the ATTACH operation fails due to authentication THEN the Async_Task_System SHALL include "认证失败" or "Access denied" in the error message
4. IF the ATTACH operation fails due to network timeout THEN the Async_Task_System SHALL include "连接超时" in the error message
5. IF the SQL query fails after successful ATTACH THEN the Async_Task_System SHALL include the original SQL error message and still perform DETACH cleanup

### Requirement 9

**User Story:** As a developer, I want the async federated query API to validate input parameters strictly, so that invalid requests fail fast with clear error messages.

#### Acceptance Criteria

1. WHEN attach_databases contains an entry with empty alias THEN the Async_Task_System SHALL reject the request with validation error
2. WHEN attach_databases contains an entry with empty connection_id THEN the Async_Task_System SHALL reject the request with validation error
3. WHEN attach_databases contains duplicate aliases THEN the Async_Task_System SHALL reject the request with error "重复的数据库别名: {alias}"
4. WHEN the SQL is empty or whitespace-only THEN the Async_Task_System SHALL reject the request with error "SQL查询不能为空"

### Requirement 10

**User Story:** As a user, I want to retry a failed federated async task with modified parameters, so that I can fix configuration issues without re-entering all information.

#### Acceptance Criteria

1. WHEN retrying a federated task THEN the Async_Task_System SHALL preserve the original attach_databases configuration by default
2. WHEN retrying with datasource_override parameter THEN the Async_Task_System SHALL merge the override with original attach_databases
3. WHEN the retry request includes new attach_databases THEN the Async_Task_System SHALL use the new configuration instead of the original




### Requirement 11

**User Story:** As a developer, I want clear handling of edge cases for attach_databases parameter, so that the API behavior is predictable.

#### Acceptance Criteria

1. WHEN attach_databases is an empty array THEN the Async_Task_System SHALL treat the request as a regular DuckDB query (not federated)
2. WHEN the Connection_Pool has no available connections THEN the Async_Task_System SHALL retry with exponential backoff up to 3 times before failing with "连接池繁忙，请稍后重试"
3. WHEN an external database ATTACH operation exceeds 30 seconds THEN the Async_Task_System SHALL timeout and fail with "ATTACH 操作超时: {alias}"

### Requirement 12

**User Story:** As a developer, I want standardized error responses, so that frontend can handle errors consistently.

#### Acceptance Criteria

1. WHEN any validation error occurs THEN the Async_Task_System SHALL return HTTP 400 with error structure { "detail": { "code": "VALIDATION_ERROR", "message": "...", "field": "..." } }
2. WHEN a connection is not found THEN the Async_Task_System SHALL return HTTP 404 with error structure { "detail": { "code": "CONNECTION_NOT_FOUND", "message": "...", "connection_id": "..." } }
3. WHEN an ATTACH operation fails THEN the Async_Task_System SHALL return HTTP 500 with error structure { "detail": { "code": "ATTACH_FAILED", "message": "...", "alias": "...", "original_error": "..." } }
4. WHEN a task fails THEN the result_info SHALL include both error_message and error_code fields

