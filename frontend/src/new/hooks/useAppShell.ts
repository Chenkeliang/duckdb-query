/**
 * useAppShell Hook
 * 
 * 过渡壳：组合所有新 Hooks，提供与原 useDuckQuery 兼容的接口。
 * 
 * ⚠️ 关键兼容性要求：
 * 1. currentTab 默认值必须是 'datasource'（与原实现一致）
 * 2. state 必须包含 githubStars
 * 3. setShowWelcome(false) 调用 closeWelcome()，setShowWelcome(true) 无效果
 */

import { useState, useCallback } from 'react';
import { useThemePreference } from './useThemePreference';
import { useWelcomeState } from './useWelcomeState';
import { usePreviewState } from './usePreviewState';
import { useGithubStars } from './useGithubStars';
import { useAppActions, type DatabaseConnectParams, type DatabaseConnectResult } from './useAppActions';

export interface UseAppShellReturn {
    state: {
        isDarkMode: boolean;
        showWelcome: boolean;
        previewQuery: string;
        currentTab: string;
        githubStars: number | null;
    };
    actions: {
        setIsDarkMode: (value: boolean | ((prev: boolean) => boolean)) => void;
        /** @deprecated 只支持 setShowWelcome(false)，建议使用 handleCloseWelcome */
        setShowWelcome: (value: boolean) => void;
        setCurrentTab: (tab: string) => void;
        setPreviewQuery: (sql: string) => void;
        handleCloseWelcome: () => void;
        triggerRefresh: () => void;
        handleDatabaseConnect: (params: DatabaseConnectParams) => Promise<DatabaseConnectResult>;
        handleDatabaseSaveConfig: (params: DatabaseConnectParams) => Promise<DatabaseConnectResult>;
    };
}

/**
 * 应用壳层 Hook - 组合所有状态管理
 * 
 * 提供与原 useDuckQuery 兼容的 { state, actions } 接口，
 * 便于渐进式迁移。
 * 
 * @example
 * ```tsx
 * // 替换原来的 useDuckQuery
 * // const { state, actions } = useDuckQuery();
 * const { state, actions } = useAppShell();
 * 
 * // 使用方式完全相同
 * const { isDarkMode, showWelcome, currentTab, githubStars } = state;
 * const { setIsDarkMode, triggerRefresh, handleDatabaseConnect } = actions;
 * ```
 */
export function useAppShell(): UseAppShellReturn {
    const { isDarkMode, setIsDarkMode } = useThemePreference();
    const { showWelcome, closeWelcome } = useWelcomeState();
    const { previewQuery, setPreviewQuery } = usePreviewState();
    const { githubStars } = useGithubStars();
    const { refreshAllData, handleDatabaseConnect, handleDatabaseSaveConfig } = useAppActions();

    // 默认 Tab 为 'datasource'（与原 useDuckQuery 一致）
    const [currentTab, setCurrentTab] = useState('datasource');

    // 兼容接口：setShowWelcome(false) => closeWelcome()
    // 注意：setShowWelcome(true) 不会有效果，这是预期行为
    const setShowWelcome = useCallback((value: boolean) => {
        if (!value) {
            closeWelcome();
        }
        // value === true 时不做任何操作
        // 如需显示欢迎页，应清除 localStorage 或等待 7 天
    }, [closeWelcome]);

    const triggerRefresh = useCallback(() => {
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
            setIsDarkMode,
            setShowWelcome,
            setCurrentTab,
            setPreviewQuery,
            handleCloseWelcome: closeWelcome,
            triggerRefresh,
            handleDatabaseConnect,
            handleDatabaseSaveConfig,
        },
    };
}

export default useAppShell;

// 重新导出类型
export type { DatabaseConnectParams, DatabaseConnectResult };
