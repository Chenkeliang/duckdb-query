/**
 * ShortcutContext - Global keyboard shortcuts state management
 * Provides shortcuts configuration and methods to update/reset shortcuts
 */

import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_SHORTCUTS, ShortcutConfig } from './defaultShortcuts';

// API base URL
const API_BASE = '/api/settings';

// Query key
export const SHORTCUTS_QUERY_KEY = ['shortcuts'] as const;

// Types
interface ShortcutContextValue {
  shortcuts: Record<string, ShortcutConfig>;
  isLoading: boolean;
  isError: boolean;
  updateShortcut: (actionId: string, shortcut: string) => Promise<void>;
  resetShortcut: (actionId: string) => Promise<void>;
  resetAllShortcuts: () => Promise<void>;
  getShortcutForAction: (actionId: string) => string;
  getDefaultShortcut: (actionId: string) => string;
  isCustomized: (actionId: string) => boolean;
}

// API functions
async function fetchShortcuts(): Promise<Record<string, ShortcutConfig>> {
  const response = await fetch(`${API_BASE}/shortcuts`);
  if (!response.ok) {
    throw new Error('Failed to fetch shortcuts');
  }
  const data = await response.json();
  
  // Merge API response with defaults
  const shortcuts: Record<string, ShortcutConfig> = {};
  const apiShortcuts = data.data?.shortcuts || [];
  
  for (const [actionId, defaultConfig] of Object.entries(DEFAULT_SHORTCUTS)) {
    const apiShortcut = apiShortcuts.find((s: { action_id: string }) => s.action_id === actionId);
    shortcuts[actionId] = {
      ...defaultConfig,
      shortcut: apiShortcut?.shortcut || defaultConfig.defaultShortcut,
    };
  }
  
  return shortcuts;
}

async function updateShortcutAPI(actionId: string, shortcut: string): Promise<void> {
  const response = await fetch(`${API_BASE}/shortcuts/${actionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shortcut }),
  });
  if (!response.ok) {
    throw new Error('Failed to update shortcut');
  }
}

async function resetShortcutAPI(actionId?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/shortcuts/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action_id: actionId }),
  });
  if (!response.ok) {
    throw new Error('Failed to reset shortcut');
  }
}

// Context
const ShortcutContext = createContext<ShortcutContextValue | null>(null);

// Provider
export function ShortcutProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  
  // Fetch shortcuts
  const { data: shortcuts, isLoading, isError } = useQuery({
    queryKey: SHORTCUTS_QUERY_KEY,
    queryFn: fetchShortcuts,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
  
  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ actionId, shortcut }: { actionId: string; shortcut: string }) =>
      updateShortcutAPI(actionId, shortcut),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHORTCUTS_QUERY_KEY });
    },
  });
  
  // Reset mutation
  const resetMutation = useMutation({
    mutationFn: (actionId?: string) => resetShortcutAPI(actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHORTCUTS_QUERY_KEY });
    },
  });
  
  // Methods
  const updateShortcut = useCallback(async (actionId: string, shortcut: string) => {
    await updateMutation.mutateAsync({ actionId, shortcut });
  }, [updateMutation]);
  
  const resetShortcut = useCallback(async (actionId: string) => {
    await resetMutation.mutateAsync(actionId);
  }, [resetMutation]);
  
  const resetAllShortcuts = useCallback(async () => {
    await resetMutation.mutateAsync(undefined);
  }, [resetMutation]);
  
  const getShortcutForAction = useCallback((actionId: string): string => {
    return shortcuts?.[actionId]?.shortcut || DEFAULT_SHORTCUTS[actionId]?.defaultShortcut || '';
  }, [shortcuts]);
  
  const getDefaultShortcut = useCallback((actionId: string): string => {
    return DEFAULT_SHORTCUTS[actionId]?.defaultShortcut || '';
  }, []);
  
  const isCustomized = useCallback((actionId: string): boolean => {
    const current = shortcuts?.[actionId]?.shortcut;
    const defaultVal = DEFAULT_SHORTCUTS[actionId]?.defaultShortcut;
    return current !== defaultVal;
  }, [shortcuts]);
  
  // Memoized value
  const value = useMemo<ShortcutContextValue>(() => ({
    shortcuts: shortcuts || DEFAULT_SHORTCUTS,
    isLoading,
    isError,
    updateShortcut,
    resetShortcut,
    resetAllShortcuts,
    getShortcutForAction,
    getDefaultShortcut,
    isCustomized,
  }), [shortcuts, isLoading, isError, updateShortcut, resetShortcut, resetAllShortcuts, getShortcutForAction, getDefaultShortcut, isCustomized]);
  
  return (
    <ShortcutContext.Provider value={value}>
      {children}
    </ShortcutContext.Provider>
  );
}

// Hook
export function useShortcuts(): ShortcutContextValue {
  const context = useContext(ShortcutContext);
  if (!context) {
    throw new Error('useShortcuts must be used within a ShortcutProvider');
  }
  return context;
}

export default ShortcutContext;
