# Requirements Document

## Introduction

本功能允许用户自定义应用程序的键盘快捷键，并将配置持久化到 DuckDB 系统表中。用户可以在设置页面查看、修改和重置快捷键，解决不同操作系统和浏览器环境下快捷键冲突的问题。

## Glossary

- **Shortcut**: 键盘快捷键，由修饰键（Cmd/Ctrl/Alt/Shift）和主键组成的组合
- **Action**: 快捷键触发的操作，如导航、刷新、切换主题等
- **System Table**: DuckDB 中以 `system_` 前缀命名的内部配置表
- **Modifier Key**: 修饰键，包括 Cmd（Mac）/Ctrl（Windows/Linux）、Alt、Shift
- **Conflict**: 快捷键与浏览器或操作系统默认快捷键冲突

## Requirements

### Requirement 1

**User Story:** As a user, I want to view all available keyboard shortcuts, so that I can learn and use them efficiently.

#### Acceptance Criteria

1. WHEN a user opens the Settings page THEN the System SHALL display a "Keyboard Shortcuts" section with all available shortcuts
2. WHEN displaying shortcuts THEN the System SHALL show the action name, current shortcut, and default shortcut for each action
3. WHEN the current shortcut differs from the default THEN the System SHALL visually indicate the customization

### Requirement 2

**User Story:** As a user, I want to customize keyboard shortcuts, so that I can avoid conflicts with my system or browser shortcuts.

#### Acceptance Criteria

1. WHEN a user clicks on a shortcut to edit THEN the System SHALL enter recording mode and capture the next key combination
2. WHEN recording a new shortcut THEN the System SHALL display the captured key combination in real-time
3. WHEN the captured shortcut conflicts with another action THEN the System SHALL warn the user and prevent the duplicate assignment
4. WHEN the user confirms a new shortcut THEN the System SHALL save the configuration to the DuckDB system table
5. WHEN the user presses Escape during recording THEN the System SHALL cancel the recording and keep the original shortcut

### Requirement 3

**User Story:** As a user, I want to reset shortcuts to defaults, so that I can recover from misconfiguration.

#### Acceptance Criteria

1. WHEN a user clicks "Reset to Default" on a single shortcut THEN the System SHALL restore that shortcut to its default value
2. WHEN a user clicks "Reset All to Defaults" THEN the System SHALL restore all shortcuts to their default values
3. WHEN resetting shortcuts THEN the System SHALL update the DuckDB system table immediately

### Requirement 4

**User Story:** As a developer, I want shortcuts persisted in DuckDB, so that they survive application restarts and can be queried.

#### Acceptance Criteria

1. WHEN the application starts THEN the System SHALL create the `system_keyboard_shortcuts` table if it does not exist
2. WHEN loading shortcuts THEN the System SHALL read from the `system_keyboard_shortcuts` table and merge with defaults
3. WHEN saving shortcuts THEN the System SHALL upsert the configuration to the `system_keyboard_shortcuts` table
4. THE `system_keyboard_shortcuts` table SHALL have columns: `action_id` (PRIMARY KEY), `shortcut`, `updated_at`

### Requirement 5

**User Story:** As a user, I want shortcuts to work immediately after customization, so that I don't need to refresh the page.

#### Acceptance Criteria

1. WHEN a shortcut is saved THEN the System SHALL immediately update the active keyboard event listeners
2. WHEN the application loads THEN the System SHALL apply custom shortcuts before rendering the main UI

### Requirement 6

**User Story:** As a user, I want to see shortcut hints in the UI, so that I can discover shortcuts contextually.

#### Acceptance Criteria

1. WHEN displaying menu items or buttons with shortcuts THEN the System SHALL show the current (possibly customized) shortcut hint
2. WHEN the Command Palette displays actions THEN the System SHALL show the current shortcut for each action
