# Implementation Plan

## 1. Update Default Extension Configuration

- [ ] 1.1 Update default extensions in config_manager.py
  - Modify `AppConfig.__post_init__` to set default `duckdb_extensions` to `["excel", "json", "parquet", "mysql", "postgres"]`
  - _Requirements: 1.4, 4.2_

- [ ] 1.2 Write property test for default extensions
  - **Property 5: Configuration Default Extensions**
  - **Validates: Requirements 1.4, 4.2**

## 2. Update Startup Scripts and Docker

- [ ] 2.1 Update quick-start.sh default configuration
  - Modify the default `duckdb_extensions` in the heredoc to include `mysql` and `postgres`
  - _Requirements: 5.1, 5.2_

- [ ] 2.2 Update Dockerfile to pre-install extensions
  - Add RUN step after pip install to execute: `python -c "import duckdb; c=duckdb.connect(); c.execute('INSTALL mysql'); c.execute('INSTALL postgres'); c.execute('INSTALL excel'); c.execute('INSTALL json'); c.execute('INSTALL parquet')"`
  - _Requirements: 3.1, 3.2_

## 3. Implement ATTACH SQL Builder

- [ ] 3.1 Add build_attach_sql function to duckdb_engine.py
  - Implement function to generate ATTACH SQL for MySQL, PostgreSQL, and SQLite
  - Handle connection string format differences between database types
  - _Requirements: 2.2, 2.3, 2.4_

- [ ] 3.2 Write property tests for ATTACH SQL builder
  - **Property 2: ATTACH SQL Format for MySQL**
  - **Property 3: ATTACH SQL Format for PostgreSQL**
  - **Property 4: ATTACH SQL Format for SQLite**
  - **Validates: Requirements 2.2, 2.3, 2.4**

## 4. Extend Query API for Federated Queries

- [ ] 4.1 Add AttachDatabase model to query models
  - Create Pydantic model with alias and connection_id fields
  - _Requirements: 2.1_

- [ ] 4.2 Extend QueryRequest model with attach_databases parameter
  - Add optional `attach_databases: List[AttachDatabase]` field
  - _Requirements: 2.1_

- [ ] 4.3 Implement federated query execution logic
  - Modify query execution to ATTACH databases before running SQL
  - Handle connection_id lookup and error cases
  - _Requirements: 2.1, 2.5_

- [ ] 4.4 Write unit tests for federated query API
  - Test ATTACH execution flow
  - Test error handling for invalid connection_id
  - _Requirements: 2.1, 2.5_

## 5. Checkpoint - Verify All Tests Pass

- [ ] 5. Ensure all tests pass, ask the user if questions arise.

## 6. Update Configuration Documentation

- [ ] 6.1 Update config/app-config.example.json
  - Add mysql and postgres to the example duckdb_extensions list
  - _Requirements: 4.1_

## 7. Final Checkpoint - Verify All Tests Pass

- [ ] 7. Ensure all tests pass, ask the user if questions arise.
