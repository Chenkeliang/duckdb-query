/**
 * useWelcomeState Hook
 * 
 * 管理欢迎页的显示逻辑，7 天后再次显示。
 * 
 * ⚠️ 注意：此 Hook 只支持 `closeWelcome()`，不支持 `setShowWelcome(true)`。
 * 如需显示欢迎页，应清除 localStorage 或等待 7 天自动触发。
 */

import { useState, useCallback } from 'react';

export const WELCOME_STORAGE_KEY = 'duck-query-welcome-shown';

export interface UseWelcomeStateReturn {
    showWelcome: boolean;
    /** 关闭欢迎页并记录时间戳。注意：不支持重新显示。 */
    closeWelcome: () => void;
}

/**
 * 判断是否应该显示欢迎页
 * 规则：首次访问显示，之后 7 天内不显示，超过 7 天再次显示
 */
function shouldShowWelcome(): boolean {
    if (typeof window === 'undefined') return false;

    try {
        const lastShownTime = localStorage.getItem(WELCOME_STORAGE_KEY);

        // 首次访问
        if (!lastShownTime) return true;

        // 检查是否超过 7 天
        const lastShown = new Date(lastShownTime);
        const now = new Date();
        const daysDiff = (now.getTime() - lastShown.getTime()) / (1000 * 60 * 60 * 24);

        return daysDiff >= 7;
    } catch {
        // 解析失败时显示欢迎页
        return true;
    }
}

/**
 * 欢迎页状态管理 Hook
 * 
 * @example
 * ```tsx
 * const { showWelcome, closeWelcome } = useWelcomeState();
 * 
 * {showWelcome && (
 *   <WelcomeDialog onClose={closeWelcome} />
 * )}
 * ```
 */
export function useWelcomeState(): UseWelcomeStateReturn {
    const [showWelcome, setShowWelcome] = useState(shouldShowWelcome);

    const closeWelcome = useCallback(() => {
        setShowWelcome(false);
        try {
            localStorage.setItem(WELCOME_STORAGE_KEY, new Date().toISOString());
        } catch {
            // 忽略 localStorage 错误
        }
    }, []);

    return { showWelcome, closeWelcome };
}

export default useWelcomeState;
