# Requirements Document

## Introduction

本需求文档描述了前端数据源集成修复功能。该功能旨在修复前端与后端统一数据源 API 的集成问题，包括数据解析、连接测试、异步任务预览跳转等多个方面的问题。这些问题影响了用户正常使用外部数据库连接（MySQL、PostgreSQL、SQLite）和异步任务功能。

## Glossary

- **DuckQuery**: 本项目的名称，一个基于 DuckDB 的数据查询和分析工具
- **数据源（DataSource）**: 包括 DuckDB 本地表、上传文件、外部数据库连接等数据来源
- **外部数据库连接**: MySQL、PostgreSQL、SQLite 等外部数据库的连接配置
- **统一 API**: 后端提供的 `/api/datasources/databases` 系列端点
- **TanStack Query**: 前端使用的数据获取和缓存库
- **加密密码占位符**: `***ENCRYPTED***`，表示密码已加密存储，不应直接显示或发送

## Requirements

### Requirement 1

**User Story:** As a user, I want to see my saved database connections in the data source list, so that I can manage and use them for queries.

#### Acceptance Criteria

1. WHEN the frontend fetches database connections from `/api/datasources/databases` THEN the system SHALL correctly parse the response structure `data.items` to extract connection list
2. WHEN displaying database connections THEN the system SHALL map `item.subtype` to connection type (mysql/postgresql/sqlite)
3. WHEN displaying database connections THEN the system SHALL correctly map connection parameters from `item.connection_info` and `item.metadata`
4. WHEN a connection has an encrypted password THEN the system SHALL display an empty password field instead of the encrypted placeholder

### Requirement 2

**User Story:** As a user, I want to test my database connections reliably, so that I can verify connectivity before using them.

#### Acceptance Criteria

1. WHEN testing a new connection with user-provided password THEN the system SHALL use the `/api/datasources/databases/test` endpoint
2. WHEN testing a saved connection with encrypted password (`***ENCRYPTED***`) THEN the system SHALL use the `/api/datasources/databases/{id}/refresh` endpoint to test with stored credentials
3. WHEN receiving test results THEN the system SHALL correctly read `result.data.connection_test.success` to determine test outcome
4. WHEN test succeeds THEN the system SHALL display a success toast with the connection message
5. WHEN test fails THEN the system SHALL display an error toast with the failure reason

### Requirement 3

**User Story:** As a user, I want to save database connections for all supported types, so that I can reuse them without re-entering credentials.

#### Acceptance Criteria

1. WHEN saving a new connection THEN the system SHALL first test the connection if a new password is provided
2. WHEN saving a connection THEN the system SHALL use the unified `createDatabaseConnection` API for all database types (MySQL, PostgreSQL, SQLite)
3. WHEN saving a connection with encrypted password placeholder THEN the system SHALL preserve the existing stored password
4. WHEN save succeeds THEN the system SHALL refresh the connections list to show the new/updated connection

### Requirement 4

**User Story:** As a user, I want to preview async task results in the query workbench, so that I can analyze the data using SQL.

#### Acceptance Criteria

1. WHEN clicking preview on a completed async task THEN the system SHALL navigate to the query workbench tab (not the legacy SQL tab)
2. WHEN navigating to query workbench for preview THEN the system SHALL pre-fill the SQL editor with the preview query
3. WHEN pre-filling the SQL editor THEN the system SHALL NOT auto-execute the query (user must click execute)

### Requirement 5

**User Story:** As a user, I want to access the settings page, so that I can configure application preferences.

#### Acceptance Criteria

1. WHEN clicking the Settings navigation item THEN the system SHALL display the settings page
2. WHEN displaying the settings page THEN the system SHALL show organized setting categories (Database, UI, Language, Security)
3. WHEN the settings page loads THEN the system SHALL use lazy loading to optimize initial bundle size

### Requirement 6

**User Story:** As a user, I want to see correct database type icons in the sidebar tree, so that I can easily identify different data sources.

#### Acceptance Criteria

1. WHEN displaying external database nodes in the sidebar THEN the system SHALL correctly map `item.subtype` to the database type
2. WHEN displaying database connection details THEN the system SHALL correctly parse `connection_info` fields (host, port, database, username)
3. WHEN a connection has encrypted password THEN the system SHALL NOT display the encrypted placeholder in the UI

### Requirement 7

**User Story:** As a user, I want password fields to be handled securely when editing saved connections, so that I don't accidentally expose or corrupt stored credentials.

#### Acceptance Criteria

1. WHEN editing a saved connection THEN the system SHALL display an empty password field (not the encrypted placeholder)
2. WHEN submitting a connection form with empty password THEN the system SHALL preserve the existing stored password
3. WHEN submitting a connection form with new password THEN the system SHALL update the stored password

### Requirement 8

**User Story:** As a user, I want the DataPasteCard to handle save operations robustly, so that my pasted data is reliably stored.

#### Acceptance Criteria

1. WHEN saving pasted data THEN the system SHALL validate the data before attempting to save
2. WHEN save fails THEN the system SHALL display a clear error message with the failure reason
3. WHEN save succeeds THEN the system SHALL refresh the data source list and clear the paste input

### Requirement 9

**User Story:** As a user, I want the DataSourcePanel to display localized text, so that I can use the application in my preferred language.

#### Acceptance Criteria

1. WHEN displaying DataSourcePanel labels THEN the system SHALL use i18n keys for all user-facing text
2. WHEN displaying error messages THEN the system SHALL use localized error messages
3. WHEN displaying empty states THEN the system SHALL use localized placeholder text
