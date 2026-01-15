/**
 * usePreviewState Hook
 * 
 * 管理异步任务预览 SQL 的传递状态。
 * 用于从异步任务面板点击预览时，将 SQL 传递到查询工作台。
 */

import { useState, useCallback } from 'react';

export interface UsePreviewStateReturn {
    /** 当前预览的 SQL 查询 */
    previewQuery: string;
    /** 设置预览 SQL */
    setPreviewQuery: (sql: string) => void;
    /** 清除预览 SQL */
    clearPreviewQuery: () => void;
}

/**
 * 预览状态管理 Hook
 * 
 * @example
 * ```tsx
 * const { previewQuery, setPreviewQuery, clearPreviewQuery } = usePreviewState();
 * 
 * // 异步任务面板点击预览
 * const handlePreview = (sql: string) => {
 *   setPreviewQuery(sql);
 *   setCurrentTab('queryworkbench');
 * };
 * 
 * // 查询工作台
 * <QueryWorkbench 
 *   previewSQL={previewQuery} 
 *   onPreviewComplete={clearPreviewQuery}
 * />
 * ```
 */
export function usePreviewState(): UsePreviewStateReturn {
    const [previewQuery, setPreviewQueryState] = useState('');

    const setPreviewQuery = useCallback((sql: string) => {
        setPreviewQueryState(sql);
    }, []);

    const clearPreviewQuery = useCallback(() => {
        setPreviewQueryState('');
    }, []);

    return { previewQuery, setPreviewQuery, clearPreviewQuery };
}

export default usePreviewState;
