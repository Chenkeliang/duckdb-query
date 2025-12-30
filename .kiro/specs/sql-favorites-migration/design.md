# Technical Design: SQL Favorites Migration

## 1. Database Schema
Table initialization occurs automatically in `MetadataManager` startup.

```sql
CREATE TABLE IF NOT EXISTS system_sql_favorites (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    type VARCHAR NOT NULL,
    sql TEXT NOT NULL,
    description TEXT,
    tags JSON,
    created_at TIMESTAMP,  -- Allow NULL for easier ingestion, default handled by logic
    updated_at TIMESTAMP,
    usage_count INTEGER DEFAULT 0,
    metadata JSON
);
-- Indexes
CREATE INDEX IF NOT EXISTS idx_fav_type ON system_sql_favorites(type);
```

## 2. Migration Strategy (Manual)

### Mechanism
A standalone Python script `scripts/migrate_favorites.py` will be provided. Admin runs this to perform migration.

### Logic Flow (`MetadataManager.import_legacy_sql_favorites`)
1.  **Locate File**: Check `CONFIG_DIR` (env) or default `config/` for `sql-favorites.json`.
2.  **Transaction**:
    ```python
    try:
        con.execute("BEGIN TRANSACTION")
        # Loop through items
        # Parse Dates: dateutil.parser.parse(item['created_at']) or default
        # Insert: INSERT OR IGNORE INTO system_sql_favorites ...
        con.execute("COMMIT")
    except:
        con.execute("ROLLBACK")
        raise
    ```
3.  **Conflict Resolution**: Use `INSERT OR IGNORE`. Existing IDs in DuckDB take precedence.
4.  **File Disposition**:
    -   Success: Rename `sql-favorites.json` -> `sql-favorites.json.migrated`.
    -   If `.migrated` exists: Rename to `sql-favorites.json.migrated.{timestamp}`.

## 3. Component Updates

### `api/core/metadata_manager.py`
-   **`_init_metadata_tables`**: Create table.
-   **`import_legacy_sql_favorites(self) -> Dict`**: Public method for migration script. Returns `{success: bool, imported: int, skipped: int}`.
-   **CRUD Methods**: `save`, `get`, `list`, `delete` (implementing `MetadataManager` generic interface).

### `api/routers/sql_favorites.py`
-   Remove file operations.
-   Inject `metadata_manager`.
-   **Verification**: Ensure `GET /api/sql-favorites` returns data from DuckDB.

### `quick-start.sh`
-   Remove `sql-favorites.json` creation block.
-   (Optional) Print suggestion to run migration script if JSON file exists.

## 4. Rollback Plan
If issues arise after migration:
1.  **Stop Server**.
2.  **Restore File**: Rename `sql-favorites.json.migrated` -> `sql-favorites.json`.
3.  **Revert Code**: Deploy previous version OR (if code is forward compatible) manually export DuckDB data back to JSON (not provided by default).
4.  **Note**: Since new code reads DuckDB, simply restoring the JSON file won't revert the *app behavior* unless the code is also reverted or `MetadataManager` logic is bypassed.

## 5. Verification Checklist
-   [ ] **Clean Install**: Start server with no JSON file -> API works, table exists empty.
-   [ ] **Migration Success**: Place JSON with 5 items -> Run script -> Items in DuckDB -> File renamed.
-   [ ] **Idempotency**: Run script again -> No errors, file already renamed (or manual restore & run -> duplicates skipped).
-   [ ] **Bad Data**: JSON with invalid date -> Import succeeds, date set to Now/Default.
