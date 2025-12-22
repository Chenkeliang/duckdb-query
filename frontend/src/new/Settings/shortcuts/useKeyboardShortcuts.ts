/**
 * useKeyboardShortcuts - Hook for registering keyboard shortcut handlers
 * Uses the ShortcutContext to get current shortcut configurations
 */

import { useEffect, useCallback, useRef } from 'react';
import { useShortcuts } from './ShortcutContext';
import { matchesShortcut } from './defaultShortcuts';

export type ShortcutHandlers = Record<string, () => void>;

export interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
}

/**
 * Hook to register keyboard shortcut handlers
 * 
 * @param handlers - Object mapping action IDs to handler functions
 * @param options - Configuration options
 * 
 * @example
 * ```tsx
 * useKeyboardShortcuts({
 *   openCommandPalette: () => setCommandPaletteOpen(true),
 *   navigateDataSource: () => setCurrentTab('datasource'),
 *   refreshData: () => triggerRefresh(),
 * });
 * ```
 */
export function useKeyboardShortcuts(
  handlers: ShortcutHandlers,
  options: UseKeyboardShortcutsOptions = {}
): void {
  const { enabled = true } = options;
  const { shortcuts, isLoading } = useShortcuts();
  
  // Use ref to avoid stale closures
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Skip if disabled or still loading
    if (!enabled || isLoading) return;
    
    // Skip if user is actively typing in an input (must be focused)
    const target = event.target as HTMLElement;
    const isInputFocused = (
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) &&
      document.activeElement === target
    );
    
    if (isInputFocused) {
      return;
    }
    
    // Check each shortcut
    for (const [actionId, config] of Object.entries(shortcuts)) {
      if (matchesShortcut(event, config.shortcut)) {
        const handler = handlersRef.current[actionId];
        if (handler) {
          // Prevent default browser behavior (e.g., Cmd+R page reload)
          event.preventDefault();
          // Stop propagation to prevent other handlers
          event.stopPropagation();
          handler();
          return;
        }
      }
    }
  }, [shortcuts, enabled, isLoading]);
  
  useEffect(() => {
    if (!enabled) return;
    
    // Use capture phase to intercept events before they reach the target
    // This ensures we can prevent default browser shortcuts like Cmd+R
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleKeyDown, enabled]);
}

export default useKeyboardShortcuts;
