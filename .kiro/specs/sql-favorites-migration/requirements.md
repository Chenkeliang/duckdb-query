# Requirements: SQL Favorites Migration

## 1. Overview
Migrate "SQL Favorites" (saved queries) storage from `config/sql-favorites.json` to the internal DuckDB `system_sql_favorites` table.

## 2. Goals
-   **Unified Storage**: Store favorites in DuckDB alongside other metadata.
-   **Reliability**: Eliminate file contention and write permission issues.
-   **Robust Migration**: Provide a safe, manual mechanism to transition existing data.

## 3. Migration Requirements
-   **Execution Mode**: Migration must be triggered **manually** (via script/CLI), NOT automatically on server startup.
-   **Idempotency**: Running migration multiple times should be safe.
-   **Atomicity**: Import should happen in a single transaction; partial failures result in rollback.
-   **Data Integrity**:
    -   **IDs**: Preserve existing UUIDs from JSON.
    -   **Conflicts**: Skip records if ID already exists in DB (`INSERT OR IGNORE` strategy).
    -   **Timestamps**: Parse string dates to `TIMESTAMP`. Fallback to `CURRENT_TIMESTAMP` on parse failure.
-   **File Handling**:
    -   On success: Rename source file to `.migrated` (e.g., `sql-favorites.json.migrated`).
    -   On failure: Do NOT touch the source file.
    -   Backup: If `.migrated` exists, append timestamp (e.g., `.migrated.20250101`).

## 4. Operational Requirements
-   **Environment Variables**: Must respect `CONFIG_DIR` if set.
-   **Documentation**: Update README/Deployment docs to remove references to manual JSON creation.
-   **Cleanliness**: Remove `config/sql-favorites.json` from the repository (add to `.gitignore` or use `.example`).

## 5. Non-Goals
-   **API Changes**: Public API contracts must remain unchanged.
