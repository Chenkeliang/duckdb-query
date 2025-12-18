# Requirements Document

## Introduction

统一管理 DuckDB 扩展的安装、加载和配置，支持跨数据库联邦查询功能。将扩展管理收拢到配置系统中，在启动时自动安装和加载，简化运行时逻辑。

## Glossary

- **DuckDB Extension**: DuckDB 的扩展模块，提供额外功能如连接外部数据库、处理特定文件格式等
- **Federated Query**: 联邦查询，在单个 SQL 中查询多个不同数据库的数据
- **ATTACH**: DuckDB 命令，用于连接外部数据库并将其作为虚拟数据库使用
- **Extension Manager**: 扩展管理器，负责扩展的安装、加载和状态管理
- **Connection Pool**: 连接池，管理 DuckDB 连接的复用和生命周期
- **quick-start.sh**: 快速启动脚本，用于初始化配置和启动 Docker 服务
- **app-config.json**: 应用配置文件，包含 DuckDB 扩展列表等配置

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want DuckDB extensions to be automatically installed and loaded at startup, so that I don't need to manually manage extensions.

#### Acceptance Criteria

1. WHEN the application starts THEN the Extension_Manager SHALL install and load all configured extensions from the duckdb_extensions list
2. WHEN an extension installation fails THEN the Extension_Manager SHALL log a warning and continue with other extensions
3. WHEN the duckdb_extensions configuration is updated THEN the Extension_Manager SHALL apply the new extension list on next connection creation
4. THE Extension_Manager SHALL support the following default extensions: excel, json, parquet, mysql, postgres

### Requirement 2

**User Story:** As a data analyst, I want to execute federated queries across multiple databases, so that I can join data from different sources in a single query.

#### Acceptance Criteria

1. WHEN a query request includes attach_databases parameter THEN the Query_API SHALL ATTACH each specified database before executing the query
2. WHEN building ATTACH SQL for MySQL THEN the Query_API SHALL use the format: ATTACH 'host=X user=X password=X database=X port=X' AS alias (TYPE mysql)
3. WHEN building ATTACH SQL for PostgreSQL THEN the Query_API SHALL use the format: ATTACH 'host=X dbname=X user=X password=X port=X' AS alias (TYPE postgres)
4. WHEN building ATTACH SQL for SQLite THEN the Query_API SHALL use the format: ATTACH 'filepath' AS alias (TYPE sqlite)
5. WHEN a database connection_id is not found THEN the Query_API SHALL return a 404 error with clear message

### Requirement 3

**User Story:** As a DevOps engineer, I want extensions to be pre-downloaded during Docker build, so that container startup is faster.

#### Acceptance Criteria

1. WHEN building the Docker image THEN the Dockerfile SHALL run a setup script to pre-install default extensions
2. THE Dockerfile SHALL add a RUN step after pip install to execute: python -c "import duckdb; c=duckdb.connect(); c.execute('INSTALL mysql'); c.execute('INSTALL postgres'); c.execute('INSTALL excel'); c.execute('INSTALL json'); c.execute('INSTALL parquet')"
3. WHEN the container starts THEN the Extension_Manager SHALL load pre-installed extensions without additional network access

### Requirement 4

**User Story:** As a user, I want to configure which extensions to load, so that I can customize the system for my needs.

#### Acceptance Criteria

1. THE Configuration_System SHALL support duckdb_extensions as a list of extension names in app-config.json
2. WHEN duckdb_extensions is not specified THEN the Configuration_System SHALL use default extensions: excel, json, parquet, mysql, postgres
3. THE Configuration_System SHALL support environment variable DUCKDB_EXTENSIONS to override the extension list

### Requirement 5

**User Story:** As a DevOps engineer, I want the quick-start.sh script to include mysql and postgres extensions in the default configuration, so that federated query is enabled out of the box.

#### Acceptance Criteria

1. WHEN quick-start.sh creates a new app-config.json THEN the script SHALL include mysql and postgres in the duckdb_extensions list
2. THE quick-start.sh default duckdb_extensions SHALL be: ["excel", "json", "parquet", "mysql", "postgres"]
3. WHEN the configuration file already exists THEN quick-start.sh SHALL preserve the existing duckdb_extensions configuration
