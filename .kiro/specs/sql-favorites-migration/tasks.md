# Migration Tasks: SQL Favorites to DuckDB

## 1. Specification & Design (Phase 1)
- [x] Create `requirements.md`: Robust constraints defined.
- [x] Create `design.md`: Manual migration strategy defined.
- [ ] Create `tasks.md`: Detailed breakdown.

## 2. Backend Implementation (Phase 2)
- [ ] **Data Layer**: Update `MetadataManager`
    - [ ] Add `system_sql_favorites` table creation.
    - [ ] Implement `import_legacy_sql_favorites(self)` with transaction/error handling.
    - [ ] Implement CRUD: `save`, `get`, `list`, `delete`.
- [ ] **Migration Script**: Create `scripts/migrate_favorites.py`
    - [ ] Import `metadata_manager`.
    - [ ] Execute import logic.
    - [ ] Print detailed report (Success/Fail/Skipped).
- [ ] **API Layer**: Refactor `api/routers/sql_favorites.py`
    - [ ] Switch from file I/O to `metadata_manager`.

## 3. Cleanup & Logic (Phase 3)
- [ ] **Verification**: Grep codebase for `config/sql-favorites.json` usage (ensure no residuals).
- [ ] **Script**: Update `quick-start.sh` (remove JSON init).
- [ ] **Git Cleanup**: Remove `config/sql-favorites.json` from repo (or move to `.example`).

## 4. Verification & Docs (Phase 4)
- [ ] **Tests**:
    - [ ] Add backend test `tests/test_migration.py` (Mock JSON -> Run Import -> Assert DB).
    - [ ] Verify API CRUD endpoints.
- [ ] **Documentation**:
    - [ ] Update `README.md` / `docs/configuration.md` (Remove JSON file instructions).
    - [ ] Add migration guide to `docs/migration.md`.
