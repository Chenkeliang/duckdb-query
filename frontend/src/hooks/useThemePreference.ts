/**
 * useThemePreference Hook
 * 
 * 管理主题状态（深色/浅色），持久化到 localStorage，同步到 DOM。
 * 
 * ⚠️ 关键兼容性要求：
 * 1. 给 `html` 添加/移除 `dark` 类
 * 2. 给 `body` 添加 `dq-theme` 基类
 * 3. 给 `body` 切换 `dq-theme--dark` / `dq-theme--light`
 * 4. 派发 `duckquery-theme-change` 自定义事件
 */

import { useState, useEffect, useCallback } from 'react';

export const THEME_STORAGE_KEY = 'duck-query-theme';

export interface UseThemePreferenceReturn {
    isDarkMode: boolean;
    setIsDarkMode: (value: boolean | ((prev: boolean) => boolean)) => void;
    toggleTheme: () => void;
}

/**
 * 获取初始主题
 * 优先级：localStorage > 系统偏好 > 默认 light
 */
function getInitialTheme(): boolean {
    if (typeof window === 'undefined') return false;

    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'dark') return true;
        if (stored === 'light') return false;
    } catch {
        // localStorage 不可用
    }

    // 跟随系统偏好
    if (typeof window.matchMedia === 'function') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    return false;
}

/**
 * 主题偏好管理 Hook
 * 
 * @example
 * ```tsx
 * const { isDarkMode, setIsDarkMode, toggleTheme } = useThemePreference();
 * 
 * <Button onClick={toggleTheme}>
 *   {isDarkMode ? '切换到浅色' : '切换到深色'}
 * </Button>
 * ```
 */
export function useThemePreference(): UseThemePreferenceReturn {
    const [isDarkMode, setIsDarkModeState] = useState(getInitialTheme);

    // 同步到 DOM 和 localStorage
    useEffect(() => {
        if (typeof document === 'undefined') return;

        const root = document.documentElement;
        const body = document.body;

        // 1. html 的 dark 类（Tailwind 标准）
        if (isDarkMode) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }

        // 2. 持久化到 localStorage
        try {
            localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? 'dark' : 'light');
        } catch {
            // 忽略
        }

        // 3. body 的 dq-theme 类（兼容 modern.css 遗留样式）
        if (body) {
            body.classList.add('dq-theme');
            body.classList.remove('dq-theme--dark', 'dq-theme--light');
            body.classList.add(isDarkMode ? 'dq-theme--dark' : 'dq-theme--light');
        }

        // 4. 派发自定义事件（兼容可能的外部监听）
        if (typeof window !== 'undefined') {
            window.dispatchEvent(
                new CustomEvent('duckquery-theme-change', {
                    detail: { isDark: isDarkMode }
                })
            );
        }

        // 注意：不需要清理函数移除 body 类，因为主题是持久状态
    }, [isDarkMode]);

    const setIsDarkMode = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
        setIsDarkModeState(value);
    }, []);

    const toggleTheme = useCallback(() => {
        setIsDarkModeState(prev => !prev);
    }, []);

    return { isDarkMode, setIsDarkMode, toggleTheme };
}

export default useThemePreference;
