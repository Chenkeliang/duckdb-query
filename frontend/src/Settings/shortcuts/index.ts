/**
 * Keyboard shortcuts module exports
 */

export { ShortcutProvider, useShortcuts, SHORTCUTS_QUERY_KEY } from './ShortcutContext';
export { useKeyboardShortcuts } from './useKeyboardShortcuts';
export { ShortcutRecorder } from './ShortcutRecorder';
export { ShortcutSettings } from './ShortcutSettings';
export {
  DEFAULT_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  parseShortcut,
  formatShortcut,
  matchesShortcut,
  type ShortcutConfig,
} from './defaultShortcuts';
