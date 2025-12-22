# Requirements Document

## Introduction

本需求文档描述了为异步任务系统添加联邦查询支持的功能。当前系统的同步查询已支持联邦查询（通过 ATTACH 外部数据库），但异步任务系统尚不支持此功能。本功能将使用户能够提交涉及多个外部数据库的长时间运行查询作为异步任务执行。

## Glossary

- **Async_Task_System**: 异步任务管理系统，负责创建、执行、监控和管理后台运行的查询任务
- **Federated_Query**: 联邦查询，指跨多个数据库（DuckDB 本地表和外部数据库如 MySQL、PostgreSQL）执行的 SQL 查询
- **ATTACH_Database**: DuckDB 的 ATTACH 命令，用于将外部数据库连接到当前 DuckDB 会话中
- **DETACH_Database**: DuckDB 的 DETACH 命令，用于断开已附加的外部数据库连接
- **Connection_Pool**: DuckDB 连接池，管理数据库连接的复用和生命周期
- **Task_Manager**: 任务管理器，负责任务状态跟踪、持久化和生命周期管理

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
2. WHEN decrypting database passwords THEN the Async_Task_System SHALL use the existing password_encryptor utility
3. WHEN validating connection_id THEN the Async_Task_System SHALL use the existing db_manager to retrieve connection configurations

