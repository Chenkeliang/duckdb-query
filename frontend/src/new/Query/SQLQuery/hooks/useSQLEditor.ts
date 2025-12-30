/**
 * SQL 编辑器 Hook
 * 管理 SQL 编辑器状态、历史记录和执行
 */

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { executeDuckDBSQL } from '@/api';
import { invalidateAllDataCaches } from '@/new/utils/cacheInvalidation';
import { formatSQLDataGrip } from '@/new/utils/sqlFormatter';

export interface SQLHistoryItem {
  id: string;
  sql: string;
  timestamp: number;
  executionTime?: number;
  rowCount?: number;
  error?: string;
}

export interface UseSQLEditorOptions {
  /** 初始 SQL */
  initialSQL?: string;
  /** 最大历史记录数 */
  maxHistory?: number;
  /** 历史记录存储 key */
  storageKey?: string;
  /** 执行成功回调 */
  onSuccess?: (data: any, sql: string) => void;
  /** 执行失败回调 */
  onError?: (error: Error, sql: string) => void;
}

export interface UseSQLEditorReturn {
  /** 当前 SQL */
  sql: string;
  /** 设置 SQL */
  setSQL: (sql: string) => void;
  /** 执行 SQL */
  execute: (options?: { saveAsTable?: string; isPreview?: boolean }) => void;
  /** 是否正在执行 */
  isExecuting: boolean;
  /** 执行结果 */
  result: any | null;
  /** 执行错误 */
  error: Error | null;
  /** 执行时间 */
  executionTime: number | undefined;
  /** 历史记录 */
  history: SQLHistoryItem[];
  /** 添加到历史 */
  addToHistory: (item: Omit<SQLHistoryItem, 'id' | 'timestamp'>) => void;
  /** 从历史加载 */
  loadFromHistory: (id: string) => void;
  /** 清除历史 */
  clearHistory: () => void;
  /** 删除历史项 */
  removeFromHistory: (id: string) => void;
  /** 格式化 SQL */
  formatSQL: () => void;
  /** 清空编辑器 */
  clear: () => void;
}

// 生成唯一 ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 从 localStorage 加载历史
function loadHistory(key: string): SQLHistoryItem[] {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to load SQL history:', e);
  }
  return [];
}

// 保存历史到 localStorage
function saveHistory(key: string, history: SQLHistoryItem[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save SQL history:', e);
  }
}

/**
 * SQL 编辑器 Hook
 */
export const useSQLEditor = ({
  initialSQL = '',
  maxHistory = 50,
  storageKey = 'duckquery-sql-history',
  onSuccess,
  onError,
}: UseSQLEditorOptions = {}): UseSQLEditorReturn => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('common');

  // SQL 内容
  const [sql, setSQL] = useState(initialSQL);

  // 执行结果
  const [result, setResult] = useState<any | null>(null);
  const [executionTime, setExecutionTime] = useState<number | undefined>(undefined);

  // 历史记录
  const [history, setHistory] = useState<SQLHistoryItem[]>(() => loadHistory(storageKey));

  // 执行 SQL mutation
  const executeMutation = useMutation({
    mutationFn: async ({
      sqlToExecute,
      saveAsTable,
      isPreview
    }: {
      sqlToExecute: string;
      saveAsTable?: string;
      isPreview?: boolean;
    }) => {
      const startTime = Date.now();
      const response = await executeDuckDBSQL({
        sql: sqlToExecute,
        saveAsTable: saveAsTable,
        isPreview: isPreview
      });
      const endTime = Date.now();
      return {
        ...response,
        executionTime: endTime - startTime,
      };
    },
    onSuccess: (data, variables) => {
      setResult(data);
      setExecutionTime(data.executionTime);

      // 添加到历史
      addToHistory({
        sql: variables.sqlToExecute,
        executionTime: data.executionTime,
        rowCount: data.data?.length || data.row_count,
      });

      // 如果保存为表，刷新数据缓存
      if (variables.saveAsTable) {
        invalidateAllDataCaches(queryClient);
        toast.success(t('query.sql.savedToTable', { table: variables.saveAsTable }));
      }

      onSuccess?.(data, variables.sqlToExecute);
    },
    onError: (error: Error, variables) => {
      setResult(null);
      setExecutionTime(undefined);

      // 添加到历史（带错误）
      addToHistory({
        sql: variables.sqlToExecute,
        error: error.message,
      });

      // 如果是取消操作引发的错误，不显示 toast（通常已有 "查询已取消" 的提示）
      if (!error.message?.toLowerCase().includes('canceled')) {
        toast.error(t('query.sql.executionFailed', { message: error.message }));
      }
      onError?.(error, variables.sqlToExecute);
    },
  });

  // 执行 SQL
  const execute = useCallback((options?: { saveAsTable?: string; isPreview?: boolean }) => {
    const trimmedSQL = sql.trim();
    if (!trimmedSQL) {
      toast.error(t('query.sql.emptySQL'));
      return;
    }

    executeMutation.mutate({
      sqlToExecute: trimmedSQL,
      saveAsTable: options?.saveAsTable,
      isPreview: options?.isPreview,
    });
  }, [sql, executeMutation]);

  // 添加到历史
  const addToHistory = useCallback((item: Omit<SQLHistoryItem, 'id' | 'timestamp'>) => {
    setHistory((prev) => {
      // 检查是否已存在相同的 SQL
      const existingIndex = prev.findIndex((h) => h.sql === item.sql);

      let newHistory: SQLHistoryItem[];

      if (existingIndex >= 0) {
        // 更新现有记录并移到最前
        const existing = prev[existingIndex];
        newHistory = [
          { ...existing, ...item, timestamp: Date.now() },
          ...prev.slice(0, existingIndex),
          ...prev.slice(existingIndex + 1),
        ];
      } else {
        // 添加新记录
        newHistory = [
          { ...item, id: generateId(), timestamp: Date.now() },
          ...prev,
        ];
      }

      // 限制历史记录数量
      if (newHistory.length > maxHistory) {
        newHistory = newHistory.slice(0, maxHistory);
      }

      // 保存到 localStorage
      saveHistory(storageKey, newHistory);

      return newHistory;
    });
  }, [maxHistory, storageKey]);

  // 从历史加载
  const loadFromHistory = useCallback((id: string) => {
    const item = history.find((h) => h.id === id);
    if (item) {
      setSQL(item.sql);
    }
  }, [history]);

  // 清除历史
  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  // 删除历史项
  const removeFromHistory = useCallback((id: string) => {
    setHistory((prev) => {
      const newHistory = prev.filter((h) => h.id !== id);
      saveHistory(storageKey, newHistory);
      return newHistory;
    });
  }, [storageKey]);

  // 格式化 SQL（使用 sql-formatter 库，DataGrip 风格）
  const formatSQL = useCallback(() => {
    const formatted = formatSQLDataGrip(sql);
    setSQL(formatted);
  }, [sql]);

  // 清空编辑器
  const clear = useCallback(() => {
    setSQL('');
    setResult(null);
    setExecutionTime(undefined);
  }, []);

  return {
    sql,
    setSQL,
    execute,
    isExecuting: executeMutation.isPending,
    result,
    error: executeMutation.error,
    executionTime,
    history,
    addToHistory,
    loadFromHistory,
    clearHistory,
    removeFromHistory,
    formatSQL,
    clear,
  };
};

export default useSQLEditor;
