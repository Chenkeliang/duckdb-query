# Design Document: Custom Keyboard Shortcuts

## Overview

本功能实现用户自定义键盘快捷键，支持在设置页面查看、编辑、重置快捷键，并将配置持久化到 DuckDB 系统表。系统采用前后端分离架构，前端负责 UI 交互和快捷键监听，后端负责数据持久化。

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ useKeyboardShortcuts │  │ ShortcutSettings │  │ ShortcutRecorder │  │
│  │     (Hook)      │  │   (Component)   │  │   (Component)   │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                │                                │
│                    ┌───────────▼───────────┐                    │
│                    │  ShortcutContext      │                    │
│                    │  (State Management)   │                    │
│                    └───────────┬───────────┘                    │
└────────────────────────────────┼────────────────────────────────┘
                                 │ API Calls
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (FastAPI)                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                  /api/settings/shortcuts                    ││
│  │  GET  - Load all shortcuts                                  ││
│  │  PUT  - Update single shortcut                              ││
│  │  POST - Reset to defaults                                   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                │                                │
│                    ┌───────────▼───────────┐                    │
│                    │  system_keyboard_     │                    │
│                    │  shortcuts (DuckDB)   │                    │
│                    └───────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Frontend Components

#### 1. ShortcutContext (Context Provider)
```typescript
interface ShortcutConfig {
  actionId: string;
  shortcut: string;        // e.g., "Cmd+K", "Ctrl+Shift+F"
  defaultShortcut: string;
  label: string;           // i18n key
  category: string;        // "navigation" | "actions" | "ui"
}

interface ShortcutContextValue {
  shortcuts: Record<string, ShortcutConfig>;
  isLoading: boolean;
  updateShortcut: (actionId: string, shortcut: string) => Promise<void>;
  resetShortcut: (actionId: string) => Promise<void>;
  resetAllShortcuts: () => Promise<void>;
  getShortcutForAction: (actionId: string) => string;
}
```

#### 2. useKeyboardShortcuts (Hook)
```typescript
interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
}

function useKeyboardShortcuts(
  handlers: Record<string, () => void>,
  options?: UseKeyboardShortcutsOptions
): void;
```

#### 3. ShortcutSettings (Component)
```typescript
interface ShortcutSettingsProps {
  // No props - uses context
}
```

#### 4. ShortcutRecorder (Component)
```typescript
interface ShortcutRecorderProps {
  value: string;
  onChange: (shortcut: string) => void;
  onCancel: () => void;
  existingShortcuts: string[];
}
```

### Backend API

#### GET /api/settings/shortcuts
```typescript
// Response
{
  success: true,
  data: {
    shortcuts: [
      {
        action_id: "openCommandPalette",
        shortcut: "Cmd+K",
        updated_at: "2024-12-18T10:00:00Z"
      }
    ]
  }
}
```

#### PUT /api/settings/shortcuts/{action_id}
```typescript
// Request
{ shortcut: "Cmd+Shift+K" }

// Response
{
  success: true,
  data: { action_id: "openCommandPalette", shortcut: "Cmd+Shift+K" }
}
```

#### POST /api/settings/shortcuts/reset
```typescript
// Request
{ action_id?: string }  // If omitted, reset all

// Response
{ success: true }
```

## Data Models

### DuckDB Table Schema
```sql
CREATE TABLE IF NOT EXISTS system_keyboard_shortcuts (
  action_id VARCHAR PRIMARY KEY,
  shortcut VARCHAR NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Default Shortcuts Configuration
```typescript
const DEFAULT_SHORTCUTS: Record<string, ShortcutConfig> = {
  openCommandPalette: {
    actionId: "openCommandPalette",
    shortcut: "Cmd+K",
    defaultShortcut: "Cmd+K",
    label: "shortcuts.openCommandPalette",
    category: "navigation"
  },
  navigateDataSource: {
    actionId: "navigateDataSource",
    shortcut: "Cmd+D",
    defaultShortcut: "Cmd+D",
    label: "shortcuts.navigateDataSource",
    category: "navigation"
  },
  navigateQueryWorkbench: {
    actionId: "navigateQueryWorkbench",
    shortcut: "Cmd+J",
    defaultShortcut: "Cmd+J",
    label: "shortcuts.navigateQueryWorkbench",
    category: "navigation"
  },
  refreshData: {
    actionId: "refreshData",
    shortcut: "Cmd+Shift+F",
    defaultShortcut: "Cmd+Shift+F",
    label: "shortcuts.refreshData",
    category: "actions"
  },
  uploadFile: {
    actionId: "uploadFile",
    shortcut: "Cmd+U",
    defaultShortcut: "Cmd+U",
    label: "shortcuts.uploadFile",
    category: "actions"
  },
  toggleTheme: {
    actionId: "toggleTheme",
    shortcut: "Cmd+Shift+T",
    defaultShortcut: "Cmd+Shift+T",
    label: "shortcuts.toggleTheme",
    category: "ui"
  },
  toggleLanguage: {
    actionId: "toggleLanguage",
    shortcut: "Cmd+Shift+L",
    defaultShortcut: "Cmd+Shift+L",
    label: "shortcuts.toggleLanguage",
    category: "ui"
  }
};
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Shortcut Display Completeness
*For any* shortcut configuration, when rendered in the settings UI, the display SHALL include the action name, current shortcut value, and default shortcut value.
**Validates: Requirements 1.2**

### Property 2: Customization Indicator Consistency
*For any* shortcut where current value differs from default value, the UI SHALL display a visual indicator marking it as customized.
**Validates: Requirements 1.3**

### Property 3: Conflict Detection
*For any* set of shortcuts, attempting to assign a shortcut that is already used by another action SHALL be rejected with a warning.
**Validates: Requirements 2.3**

### Property 4: Persistence Round-Trip
*For any* shortcut update, saving to DuckDB and then loading SHALL return the same shortcut value.
**Validates: Requirements 2.4, 4.2, 4.3**

### Property 5: Reset Restores Defaults
*For any* customized shortcut, after reset operation, the shortcut value SHALL equal its default value.
**Validates: Requirements 3.1, 3.2**

### Property 6: Immediate Effect
*For any* saved shortcut change, the keyboard event listener SHALL immediately respond to the new shortcut without page refresh.
**Validates: Requirements 5.1**

### Property 7: UI Hint Consistency
*For any* customized shortcut, all UI components (Command Palette, menus, tooltips) SHALL display the current (customized) shortcut value.
**Validates: Requirements 6.1, 6.2**

## Error Handling

### Frontend Errors
- **Recording Conflict**: Display inline warning, prevent save
- **API Failure**: Show toast error, keep previous value
- **Invalid Key Combination**: Ignore and continue recording

### Backend Errors
- **Table Creation Failure**: Log error, return 500
- **Invalid Action ID**: Return 400 with error message
- **Database Write Failure**: Return 500, rollback transaction

## Testing Strategy

### Unit Tests
- ShortcutRecorder key capture logic
- Conflict detection algorithm
- Shortcut string parsing/formatting

### Property-Based Tests (using fast-check)
- Property 1: Display completeness
- Property 3: Conflict detection
- Property 4: Persistence round-trip
- Property 5: Reset restores defaults
- Property 7: UI hint consistency

Each property-based test SHALL run a minimum of 100 iterations.

### Integration Tests
- Full flow: customize → save → reload → verify
- Reset single shortcut
- Reset all shortcuts
