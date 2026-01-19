import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { showSuccessToast } from '@/utils/toastHelpers';

export interface GlobalHistoryItem {
    id: string;
    type: 'sql' | 'join' | 'set' | 'pivot';
    sql: string;
    timestamp: number;
    executionTime?: number;
    rowCount?: number;
    error?: string;
    name?: string; // 可选的命名（如 Saved Query 恢复）
}

const STORAGE_KEY = 'duckquery-global-history';
const MAX_HISTORY = 100;
const SYNC_EVENT = 'global-history-updated';

// 从 localStorage 读取历史
const loadHistory = (): GlobalHistoryItem[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.error('Failed to load global history:', e);
        return [];
    }
};

// 保存到 localStorage 并触发同步事件
const saveAndSync = (newHistory: GlobalHistoryItem[]) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
        // 触发自定义事件，通知其他组件实例更新
        window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: newHistory }));
    } catch (e) {
        console.error('Failed to save global history:', e);
    }
};

export const useGlobalHistory = () => {
    const { t } = useTranslation('common');
    const [history, setHistory] = useState<GlobalHistoryItem[]>(loadHistory);

    // 监听同步事件（来自其他组件实例）
    useEffect(() => {
        const handleSync = (event: CustomEvent<GlobalHistoryItem[]>) => {
            setHistory(event.detail);
        };

        window.addEventListener(SYNC_EVENT, handleSync as EventListener);
        return () => {
            window.removeEventListener(SYNC_EVENT, handleSync as EventListener);
        };
    }, []);

    // 监听 storage 事件（跨 tab 同步，可选）
    useEffect(() => {
        const handleStorage = (event: StorageEvent) => {
            if (event.key === STORAGE_KEY && event.newValue) {
                try {
                    setHistory(JSON.parse(event.newValue));
                } catch (e) {
                    console.error('Failed to parse storage event:', e);
                }
            }
        };

        window.addEventListener('storage', handleStorage);
        return () => {
            window.removeEventListener('storage', handleStorage);
        };
    }, []);

    const addToHistory = useCallback((item: Omit<GlobalHistoryItem, 'id' | 'timestamp'>) => {
        const newItem: GlobalHistoryItem = {
            ...item,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
        };

        // 读取最新数据（避免闭包过期问题）
        const currentHistory = loadHistory();

        // 去重：相同 SQL + type 的记录只保留最新
        const existingIdx = currentHistory.findIndex(h => h.sql === newItem.sql && h.type === newItem.type);
        let newHistory = currentHistory;
        if (existingIdx >= 0) {
            newHistory = currentHistory.filter((_, idx) => idx !== existingIdx);
        }

        newHistory = [newItem, ...newHistory].slice(0, MAX_HISTORY);

        // 保存并同步到所有实例
        saveAndSync(newHistory);
        setHistory(newHistory);
    }, []);

    const clearHistory = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        saveAndSync([]);
        setHistory([]);
        showSuccessToast(t, 'HISTORY_CLEARED', t('query.history.cleared', '历史记录已清空'));
    }, [t]);

    const deleteHistoryItem = useCallback((id: string) => {
        const currentHistory = loadHistory();
        const newHistory = currentHistory.filter(item => item.id !== id);
        saveAndSync(newHistory);
        setHistory(newHistory);
    }, []);

    return {
        history,
        addToHistory,
        clearHistory,
        deleteHistoryItem
    };
};
