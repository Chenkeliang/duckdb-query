# Task 09 · File datasource metadata migration

## Objective
Retire `config/file-datasources.json` and store all file datasource metadata inside DuckDB itself so concurrent uploads/URL imports no longer rely on JSON locking. The new flow should let every file-based ingestion route read/write a single DuckDB system table, with a one-time migration that loads existing JSON entries into that table.

## Scope
* Replace `FileDatasourceManager`’s JSON read/write logic with SQL against a DuckDB-side metadata table (`__duckquery_file_sources` or similar).
* Ensure all routes that currently call `save_file_datasource()/list_file_datasources()/reload_all_file_datasources_to_duckdb()` transparently use the new storage:
  - `api/routers/data_sources.py`
  - `api/routers/server_files.py`
  - `api/routers/url_reader.py`
  - `api/routers/paste_data.py`
  - `api/routers/chunked_upload.py`
  - `api/routers/async_tasks.py`
* Apply the same migration pattern to SQL favorites (and any other per-user metadata stored under `config/`):
  - Move `config/sql-favorites.json` into a DuckDB system table (prefix `system_`) and update `/api/sql-favorites`.
  - Migrate `config/datasources.json` (database connection definitions) into a system table so `ConfigManager` and `/api/data-sources` read/write DuckDB instead of files.
* Provide a migration routine that ingests `config/file-datasources.json` (if present) into the DuckDB table during startup or via a CLI script, and back up the JSON afterwards.
* Update docs (`README.md`, `docs/CONFIGURATION.md`) and quick-start instructions to note that file datasource metadata now lives in DuckDB. Mention that the JSON file is legacy/optional.

## Deliverables
1. **System table definitions**  
   - Create a DuckDB table (e.g. `__duckquery_file_sources`) with columns mirroring the JSON schema: `source_id`, `filename`, `file_path`, `file_type`, `row_count`, `column_count`, `columns` (JSON/text), `column_profiles` (JSON/text), `schema_version`, `created_at`, `updated_at`.  
   - Table should be created automatically during DuckDB engine initialization (`CREATE TABLE IF NOT EXISTS ...`), and indexed by `source_id`.
   - Create additional system tables:
     * `system_sql_favorites` for `sql-favorites.json` (`id`, `name`, `sql`, `type`, `description`, `tags`, `created_at`, `updated_at`, `usage_count`).
     * `system_datasources` for `datasources.json` (connection metadata, include type, params, created/updated timestamps, optional secrets).

2. **Migration tools**  
   - At startup (or via `scripts/migrate_file_sources.py`), detect `config/file-datasources.json`; if it exists, load its entries into the system table (insert/update).  
   - After successful import, rename or back up the JSON (e.g. `file-datasources.json.bak`) to avoid double-loading.  
   - Do the same for `config/sql-favorites.json` → `system_sql_favorites` and `config/datasources.json` → `system_datasources`.  
   - Provide a way to re-run each migration manually if needed.

3. **Manager refactors**  
   - `save_file_datasource` → `INSERT ... ON CONFLICT UPDATE` into DuckDB instead of rewriting JSON.  
   - `list_file_datasources`, `get_file_datasource`, `delete_file_datasource`, `reload_all_file_datasources_to_duckdb` now query the system table.  
   - Remove JSON file locking; rely on DuckDB transactions.  
   - Keep an escape hatch (env var or config flag) to fall back to JSON for debugging if absolutely necessary.
   - `api/routers/sql_favorites.py` should call a new persistence layer that reads/writes `system_sql_favorites`; front-end components keep the same API.
   - `ConfigManager` / `api/routers/data_sources.py` should load and persist datasource definitions via `system_datasources`, including encryption/secret handling.

4. **API compatibility**  
   - All callers (data sources, server files, URL reader, chunked upload, paste data, async tasks) should continue to call the same manager methods without behavioral changes.  
   - `/api/sql-favorites` endpoints remain stable for the frontend.  
   - Responses remain identical; only the persistence layer changes.

5. **Tests & docs**  
   - Add unit tests for the new manager (CRUD, migration import, reload).  
   - Integration tests for one ingestion route (e.g. upload) to ensure metadata lands in DuckDB.  
   - Update `README.md`, `docs/CONFIGURATION.md`, quick-start notes to explain the new storage and mention the legacy JSON file is optional.  
   - Document the migration steps and fallback flag (if any) in this task file and/or a dedicated docs section.

## Notes & Risks
* Ensure DuckDB connection used for metadata writes is thread-safe; wrap writes in `with_duckdb_connection()` to reuse existing pooling logic.
* Large `column_profiles` payloads should be stored as JSON strings; read/write with `json.dumps/json.loads`.
* Provide a guard (e.g. `USE_FILE_DATASOURCE_JSON=true`) to switch back to JSON if something breaks in production.
* Clean up quick-start script references once migration is default; optionally keep generating an empty JSON file for older versions but state it is unused.
* Verify `reload_all_file_datasources_to_duckdb()` iterates over the DuckDB table and gracefully skips missing files/URLs.
