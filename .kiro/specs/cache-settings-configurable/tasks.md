# Implementation Plan

- [x] 1. Create cache configuration utilities and hook
  - [x] 1.1 Create cache config utilities
    - Create `frontend/src/new/utils/cacheConfig.ts`
    - Implement `validateCacheDuration()` function for input validation (1-120 range)
    - Implement `getCacheConfig()` function to read settings from localStorage
    - Implement `saveCacheConfig()` function to persist settings
    - Export `DEFAULT_CACHE_DURATION = 30` constant
    - _Requirements: 1.2, 6.1, 6.2, 6.3, 6.4_

  - [x] 1.2 Write property tests for cache config utilities
    - **Property 1: Cache duration validation**
    - **Validates: Requirements 1.2**
    - Test that only values 1-120 are accepted
    - Test that invalid values return default

  - [x] 1.3 Write property tests for settings persistence
    - **Property 2: Settings round-trip persistence**
    - **Validates: Requirements 1.3, 6.1, 6.2**
    - Test save then load returns same value

  - [x] 1.4 Write property tests for invalid data fallback
    - **Property 3: Invalid settings fallback to defaults**
    - **Validates: Requirements 6.3**
    - Test malformed data returns defaults

  - [x] 1.5 Create useCacheSettings hook
    - Create `frontend/src/new/hooks/useCacheSettings.ts`
    - Implement `useCacheSettings()` hook with settings state
    - Implement `updateSettings()` to save and apply new settings
    - Implement `resetToDefaults()` to restore default value
    - Implement `clearAllCache()` to invalidate all TanStack Query caches
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 5.2_

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Create CacheSettings UI component
  - [x] 3.1 Create CacheSettings component
    - Create `frontend/src/new/Settings/CacheSettings.tsx`
    - Add Card with Clock icon and title "缓存设置"
    - Add cache duration input field (number, 1-120)
    - Add "重置为默认值" button
    - Add "清除所有缓存" button with destructive variant
    - Add toast notifications for actions
    - _Requirements: 1.1, 1.5, 5.1, 5.3_

  - [x] 3.2 Integrate CacheSettings into SettingsPage
    - Import CacheSettings component in `frontend/src/new/Settings/SettingsPage.tsx`
    - Add CacheSettings after ShortcutSettings section
    - Add i18n keys for cache settings labels
    - _Requirements: 1.1_

- [x] 4. Update TanStack Query hooks to use dynamic cache config
  - [x] 4.1 Update useDuckDBTables hook
    - Modify `frontend/src/new/hooks/useDuckDBTables.ts`
    - Import `getCacheConfig()` from utils
    - Replace hardcoded staleTime/gcTime with dynamic values
    - _Requirements: 4.1_

  - [x] 4.2 Update useDataSources hook
    - Modify `frontend/src/new/hooks/useDataSources.ts`
    - Import `getCacheConfig()` from utils
    - Replace hardcoded staleTime/gcTime with dynamic values
    - _Requirements: 4.1_

  - [x] 4.3 Update useDatabaseConnections hook
    - Modify `frontend/src/new/hooks/useDatabaseConnections.ts`
    - Import `getCacheConfig()` from utils
    - Replace hardcoded staleTime/gcTime with dynamic values
    - _Requirements: 4.1_

  - [x] 4.4 Write property test for cache config application
    - **Property 4: Cache duration applies to all queries**
    - **Validates: Requirements 4.1**
    - Test that all hooks use the configured duration

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Enhance table context menu
  - [x] 6.1 Add "Refresh Table Info" menu item
    - Modify `frontend/src/new/Query/DataSourcePanel/ContextMenu.tsx`
    - Add "刷新表信息" menu item for all tables
    - Implement cache invalidation for specific table
    - Add success/error toast notifications
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 6.2 Add i18n keys for new menu items
    - Add keys to `frontend/src/i18n/locales/zh/common.json`
    - Add keys to `frontend/src/i18n/locales/en/common.json`
    - Keys: `dataSource.refreshTableInfo`, `dataSource.refreshSuccess`, `dataSource.refreshFailed`
    - _Requirements: 2.1_

- [x] 7. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
