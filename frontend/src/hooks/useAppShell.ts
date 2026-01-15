/**
 * useAppShell Hook
 * 
 * 应用状态管理的组合入口，整合主题、欢迎页、预览状态、GitHub Stars 等 Hooks。
 * 
 * @example
 * ```tsx
 * const { state, actions } = useAppShell();
 * const { isDarkMode, currentTab, githubStars } = state;
 * const { setDarkMode, refreshData, connectDatabase } = actions;
 * ```
 */

import { useState, useCallback } from 'react';
import { useThemePreference } from './useThemePreference';
import { useWelcomeState } from './useWelcomeState';
import { usePreviewState } from './usePreviewState';
import { useGithubStars } from './useGithubStars';
import { useAppActions, type DatabaseConnectParams, type DatabaseConnectResult } from './useAppActions';

export interface AppState {
    isDarkMode: boolean;
    showWelcome: boolean;
    previewQuery: string;
    currentTab: string;
    githubStars: number | null;
}

export interface AppActions {
    setDarkMode: (value: boolean | ((prev: boolean) => boolean)) => void;
    setCurrentTab: (tab: string) => void;
    setPreviewQuery: (sql: string) => void;
    closeWelcome: () => void;
    refreshData: () => void;
    connectDatabase: (params: DatabaseConnectParams) => Promise<DatabaseConnectResult>;
    saveDatabase: (params: DatabaseConnectParams) => Promise<DatabaseConnectResult>;
}

export interface UseAppShellReturn {
    state: AppState;
    actions: AppActions;
}

export function useAppShell(): UseAppShellReturn {
    const { isDarkMode, setIsDarkMode } = useThemePreference();
    const { showWelcome, closeWelcome } = useWelcomeState();
    const { previewQuery, setPreviewQuery } = usePreviewState();
    const { githubStars } = useGithubStars();
    const { refreshAllData, handleDatabaseConnect, handleDatabaseSaveConfig } = useAppActions();

    const [currentTab, setCurrentTab] = useState('datasource');

    const refreshData = useCallback(() => {
        refreshAllData();
    }, [refreshAllData]);

    return {
        state: {
            isDarkMode,
            showWelcome,
            previewQuery,
            currentTab,
            githubStars,
        },
        actions: {
            setDarkMode: setIsDarkMode,
            setCurrentTab,
            setPreviewQuery,
            closeWelcome,
            refreshData,
            connectDatabase: handleDatabaseConnect,
            saveDatabase: handleDatabaseSaveConfig,
        },
    };
}

export default useAppShell;

// 重新导出类型
export type { DatabaseConnectParams, DatabaseConnectResult };
