# Requirements Document

## Introduction

本功能旨在增强 DuckQuery 的缓存管理能力，包括：
1. 提供统一的查询缓存有效期配置（默认 30 分钟）
2. 在表右键菜单中增加刷新表信息、获取表信息、查看表信息的操作
3. 提供设置页面让用户可以自定义缓存有效期

## Glossary

- **Cache_Settings_System**: 缓存设置系统，负责管理和持久化缓存时间配置
- **Table_Context_Menu**: 表右键菜单，提供对表的各种操作入口
- **Query_Cache**: 查询缓存，统一管理所有 TanStack Query 的缓存配置，包括：
  - 表列表缓存（DuckDB tables list）
  - 列信息缓存（Table column info）
  - 数据源列表缓存（Data sources list）
  - 数据库连接缓存（Database connections）
- **staleTime**: TanStack Query 中数据被认为"新鲜"的时间
- **gcTime**: TanStack Query 中缓存被清理的时间（通常为 staleTime 的 2 倍）

## Requirements

### Requirement 1

**User Story:** As a user, I want to configure a unified cache duration in the settings page, so that I can optimize performance based on my data update frequency.

#### Acceptance Criteria

1. WHEN a user opens the settings page THEN the Cache_Settings_System SHALL display a cache configuration section showing the current cache duration value
2. WHEN a user modifies the cache duration THEN the Cache_Settings_System SHALL validate the input is a positive number within allowed range (1-120 minutes)
3. WHEN a user saves cache settings THEN the Cache_Settings_System SHALL persist the configuration to localStorage
4. WHEN the application loads THEN the Cache_Settings_System SHALL read saved cache settings and apply them to all TanStack Query configurations
5. WHEN a user resets cache settings THEN the Cache_Settings_System SHALL restore the default value (30 minutes)

### Requirement 2

**User Story:** As a user, I want to refresh table information via right-click menu, so that I can get the latest table structure without refreshing the entire page.

#### Acceptance Criteria

1. WHEN a user right-clicks on a table THEN the Table_Context_Menu SHALL display a "Refresh Table Info" option
2. WHEN a user clicks "Refresh Table Info" THEN the Cache_Settings_System SHALL invalidate the cache for that specific table
3. WHEN a user clicks "Refresh Table Info" THEN the Cache_Settings_System SHALL fetch fresh table information from the server
4. WHEN the refresh operation completes successfully THEN the Cache_Settings_System SHALL display a success toast notification
5. IF the refresh operation fails THEN the Cache_Settings_System SHALL display an error toast with the failure reason

### Requirement 3

**User Story:** As a user, I want to view table details including row count and column info, so that I can understand the table structure quickly.

#### Acceptance Criteria

1. WHEN a user right-clicks on a table THEN the Table_Context_Menu SHALL display a "View Table Info" option
2. WHEN a user clicks "View Table Info" THEN the Cache_Settings_System SHALL display a dialog with table name, row count, and column list
3. WHEN displaying table info THEN the Cache_Settings_System SHALL use cached column data if available within staleTime
4. WHEN displaying external table info THEN the Cache_Settings_System SHALL fetch column info from the external database connection

### Requirement 4

**User Story:** As a user, I want longer default cache times for query data, so that I can reduce unnecessary API calls for stable data.

#### Acceptance Criteria

1. WHEN query data is fetched THEN the Query_Cache SHALL use the configured cache duration as both staleTime and gcTime (default: 30 minutes)
2. WHEN the same data is requested within cache duration THEN the Query_Cache SHALL return cached data without API call
3. WHEN cache is manually invalidated THEN the Query_Cache SHALL fetch fresh data on next request
4. WHEN cache duration expires THEN the Query_Cache SHALL automatically fetch fresh data on next request

### Requirement 5

**User Story:** As a user, I want to clear all query caches at once, so that I can force refresh all data when needed.

#### Acceptance Criteria

1. WHEN a user opens the settings page cache section THEN the Cache_Settings_System SHALL display a "Clear All Cache" button
2. WHEN a user clicks "Clear All Cache" THEN the Cache_Settings_System SHALL invalidate all TanStack Query caches
3. WHEN all caches are cleared THEN the Cache_Settings_System SHALL display a success toast notification
4. WHEN caches are cleared THEN the Cache_Settings_System SHALL trigger automatic refetch for active queries

### Requirement 6

**User Story:** As a developer, I want cache settings to be serialized and deserialized correctly, so that user preferences persist across sessions.

#### Acceptance Criteria

1. WHEN cache settings are saved THEN the Cache_Settings_System SHALL serialize settings to JSON format
2. WHEN cache settings are loaded THEN the Cache_Settings_System SHALL deserialize JSON and validate all required fields
3. WHEN serialized settings contain invalid values THEN the Cache_Settings_System SHALL use default values for invalid fields
4. WHEN localStorage is unavailable THEN the Cache_Settings_System SHALL use in-memory defaults without errors
