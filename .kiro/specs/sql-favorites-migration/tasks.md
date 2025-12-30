# Migration Tasks: SQL Favorites to DuckDB

## 1. Specification & Design (Phase 1)
- [x] Create `requirements.md`: Robust constraints defined.
- [x] Create `design.md`: Manual migration strategy defined.
- [x] Create `tasks.md`: Detailed breakdown.

## 2. Backend Implementation (Phase 2)
- [x] **Data Layer**: Update `MetadataManager`
    - [x] Add `system_sql_favorites` table creation.
    - [x] Implement `import_legacy_sql_favorites(self)` with transaction/error handling.
    - [x] Implement CRUD: `save`, `get`, `list`, `delete`.
- [x] **Migration Script**: Create `scripts/migrate_favorites.py`
    - [x] Import `metadata_manager`.
    - [x] Execute import logic.
    - [x] Print detailed report (Success/Fail/Skipped).
- [x] **API Layer**: Refactor `api/routers/sql_favorites.py`
    - [x] Switch from file I/O to `metadata_manager`.

## 3. Cleanup & Logic (Phase 3)
- [x] **Verification**: Grep codebase for `config/sql-favorites.json` usage (ensure no residuals).
- [x] **Script**: Update `quick-start.sh` (remove JSON init).
- [x] **Git Cleanup**: Remove `config/sql-favorites.json` (User action recommended).

## 4. Verification & Docs (Phase 4)
- [x] **Tests**:
    - [x] Add backend test `api/tests/test_favorites_migration.py`.
    - [ ] Verify API CRUD endpoints (Manual verification needed).
- [x] **Documentation**:
    - [x] Verified `README.md` / `docs/configuration.md` (No explicit JSON instructions found to remove).
    - [ ] Add migration guide (Included in Walkthrough).
