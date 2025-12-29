import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

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

export const useGlobalHistory = () => {
    const [history, setHistory] = useState<GlobalHistoryItem[]>([]);

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setHistory(JSON.parse(stored));
            }
        } catch (e) {
            console.error('Failed to load global history:', e);
        }
    }, []);

    const saveHistory = useCallback((newHistory: GlobalHistoryItem[]) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
            setHistory(newHistory);
        } catch (e) {
            console.error('Failed to save global history:', e);
        }
    }, []);

    const addToHistory = useCallback((item: Omit<GlobalHistoryItem, 'id' | 'timestamp'>) => {
        // Generate ID
        const newItem: GlobalHistoryItem = {
            ...item,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
        };

        setHistory((prev) => {
            // Deduplicate: exact SQL match
            const existingDetails = prev.filter(h => h.sql === newItem.sql && h.type === newItem.type);

            let newHistory = prev;
            if (existingDetails.length > 0) {
                // Move to top if exact duplicate exists (ignoring older duplicates)
                newHistory = prev.filter(h => h.id !== existingDetails[0].id);
            }

            newHistory = [newItem, ...newHistory].slice(0, MAX_HISTORY);

            // Async save
            setTimeout(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory)), 0);
            return newHistory;
        });
    }, []);

    const clearHistory = useCallback(() => {
        setHistory([]);
        localStorage.removeItem(STORAGE_KEY);
        toast.success('历史记录已清空');
    }, []);

    const deleteHistoryItem = useCallback((id: string) => {
        setHistory(prev => {
            const newHistory = prev.filter(item => item.id !== id);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
            return newHistory;
        });
    }, []);

    return {
        history,
        addToHistory,
        clearHistory,
        deleteHistoryItem
    };
};
