/**
 * Default keyboard shortcuts configuration
 * These are the default shortcuts that can be customized by users
 */

export interface ShortcutConfig {
  actionId: string;
  shortcut: string;
  defaultShortcut: string;
  label: string;
  category: 'navigation' | 'actions' | 'ui';
}

export const DEFAULT_SHORTCUTS: Record<string, ShortcutConfig> = {
  openCommandPalette: {
    actionId: 'openCommandPalette',
    shortcut: 'Cmd+K',
    defaultShortcut: 'Cmd+K',
    label: 'shortcuts.openCommandPalette',
    category: 'navigation',
  },
  navigateDataSource: {
    actionId: 'navigateDataSource',
    shortcut: 'Cmd+D',
    defaultShortcut: 'Cmd+D',
    label: 'shortcuts.navigateDataSource',
    category: 'navigation',
  },
  navigateQueryWorkbench: {
    actionId: 'navigateQueryWorkbench',
    shortcut: 'Cmd+J',
    defaultShortcut: 'Cmd+J',
    label: 'shortcuts.navigateQueryWorkbench',
    category: 'navigation',
  },
  refreshData: {
    actionId: 'refreshData',
    shortcut: 'Cmd+Shift+F',
    defaultShortcut: 'Cmd+Shift+F',
    label: 'shortcuts.refreshData',
    category: 'actions',
  },
  refreshDataSources: {
    actionId: 'refreshDataSources',
    shortcut: 'Cmd+I',
    defaultShortcut: 'Cmd+I',
    label: 'shortcuts.refreshDataSources',
    category: 'actions',
  },
  uploadFile: {
    actionId: 'uploadFile',
    shortcut: 'Cmd+U',
    defaultShortcut: 'Cmd+U',
    label: 'shortcuts.uploadFile',
    category: 'actions',
  },
  toggleTheme: {
    actionId: 'toggleTheme',
    shortcut: 'Cmd+Shift+X',
    defaultShortcut: 'Cmd+Shift+X',
    label: 'shortcuts.toggleTheme',
    category: 'ui',
  },
  toggleLanguage: {
    actionId: 'toggleLanguage',
    shortcut: 'Cmd+Shift+Z',
    defaultShortcut: 'Cmd+Shift+Z',
    label: 'shortcuts.toggleLanguage',
    category: 'ui',
  },
};

export const SHORTCUT_CATEGORIES = {
  navigation: 'shortcuts.category.navigation',
  actions: 'shortcuts.category.actions',
  ui: 'shortcuts.category.ui',
} as const;

/**
 * Parse a shortcut string into its components
 * e.g., "Cmd+Shift+K" -> { meta: true, shift: true, key: 'k' }
 */
export function parseShortcut(shortcut: string): {
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
} {
  const parts = shortcut.split('+');
  const key = parts[parts.length - 1].toLowerCase();
  
  return {
    meta: parts.includes('Cmd'),
    ctrl: parts.includes('Ctrl'),
    alt: parts.includes('Alt'),
    shift: parts.includes('Shift'),
    key,
  };
}

/**
 * Format a keyboard event into a shortcut string
 */
export function formatShortcut(event: KeyboardEvent): string {
  const parts: string[] = [];
  
  // Use Cmd on Mac, Ctrl on Windows/Linux
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  if (event.metaKey && isMac) {
    parts.push('Cmd');
  }
  if (event.ctrlKey && !isMac) {
    parts.push('Ctrl');
  }
  if (event.altKey) {
    parts.push('Alt');
  }
  if (event.shiftKey) {
    parts.push('Shift');
  }
  
  // Get the key
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (!['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) {
    parts.push(key);
  }
  
  return parts.join('+');
}

/**
 * Check if a keyboard event matches a shortcut
 */
export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  // Check modifiers
  const metaMatch = isMac ? event.metaKey === parsed.meta : event.ctrlKey === (parsed.meta || parsed.ctrl);
  const shiftMatch = event.shiftKey === parsed.shift;
  const altMatch = event.altKey === parsed.alt;
  
  // Check key
  const keyMatch = event.key.toLowerCase() === parsed.key;
  
  return metaMatch && shiftMatch && altMatch && keyMatch;
}
