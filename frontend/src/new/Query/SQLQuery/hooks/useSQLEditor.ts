/**
 * SQL 编辑器 Hook
 * 管理 SQL 编辑器状态、历史记录和执行
 */

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { executeDuckDBSQL } from '@/services/apiClient';
import { invalidateAllDataCaches } from '@/new/utils/cacheInvalidation';

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

// SQL 关键字集合（用于格式化）
const SQL_FORMAT_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
  'ON', 'GROUP', 'ORDER', 'BY', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'INSERT', 'UPDATE',
  'DELETE', 'CREATE', 'DROP', 'ALTER', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  'INTO', 'VALUES', 'SET', 'TABLE', 'INDEX', 'VIEW', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'NULL', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'TRUE', 'FALSE', 'ALL', 'ANY',
  'CROSS', 'FULL', 'NATURAL', 'USING', 'WITH', 'RECURSIVE', 'OVER', 'PARTITION', 'ROWS',
  'RANGE', 'UNBOUNDED', 'PRECEDING', 'FOLLOWING', 'CURRENT', 'ROW', 'CAST', 'COALESCE',
  'NULLIF', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'DEFAULT', 'CHECK',
  'UNIQUE', 'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST', 'FETCH', 'NEXT', 'ONLY', 'EXCEPT',
  'INTERSECT', 'ATTACH', 'DETACH', 'DATABASE', 'SCHEMA',
]);

// 需要在前面添加换行的关键字
const LINE_BREAK_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'FULL',
  'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'UNION', 'EXCEPT', 'INTERSECT', 'WITH',
]);

/**
 * 智能 SQL 格式化函数
 * 正确处理注释和字符串字面量，不会格式化其中的内容
 */
function formatSQLSmart(sql: string): string {
  const result: string[] = [];
  let pos = 0;
  const length = sql.length;

  while (pos < length) {
    const char = sql[pos];

    // 处理单行注释 --
    if (char === '-' && sql[pos + 1] === '-') {
      const start = pos;
      pos += 2;
      while (pos < length && sql[pos] !== '\n') {
        pos++;
      }
      if (pos < length) {
        pos++; // 包含换行符
      }
      result.push(sql.slice(start, pos));
      continue;
    }

    // 处理多行注释 /* */
    if (char === '/' && sql[pos + 1] === '*') {
      const start = pos;
      pos += 2;
      while (pos < length - 1) {
        if (sql[pos] === '*' && sql[pos + 1] === '/') {
          pos += 2;
          break;
        }
        pos++;
      }
      if (pos >= length - 1 && !(sql[pos - 2] === '*' && sql[pos - 1] === '/')) {
        pos = length; // 未闭合的注释
      }
      result.push(sql.slice(start, pos));
      continue;
    }

    // 处理字符串字面量 '...'
    if (char === "'") {
      const start = pos;
      pos++;
      while (pos < length) {
        if (sql[pos] === "'") {
          if (sql[pos + 1] === "'") {
            pos += 2; // 转义的引号
          } else {
            pos++;
            break;
          }
        } else {
          pos++;
        }
      }
      result.push(sql.slice(start, pos));
      continue;
    }

    // 处理双引号标识符 "..."
    if (char === '"') {
      const start = pos;
      pos++;
      while (pos < length) {
        if (sql[pos] === '"') {
          if (sql[pos + 1] === '"') {
            pos += 2; // 转义的引号
          } else {
            pos++;
            break;
          }
        } else {
          pos++;
        }
      }
      result.push(sql.slice(start, pos));
      continue;
    }

    // 处理反引号标识符 `...`
    if (char === '`') {
      const start = pos;
      pos++;
      while (pos < length && sql[pos] !== '`') {
        pos++;
      }
      if (pos < length) {
        pos++;
      }
      result.push(sql.slice(start, pos));
      continue;
    }

    // 处理方括号标识符 [...]
    if (char === '[') {
      const start = pos;
      pos++;
      while (pos < length && sql[pos] !== ']') {
        pos++;
      }
      if (pos < length) {
        pos++;
      }
      result.push(sql.slice(start, pos));
      continue;
    }

    // 处理标识符或关键字
    if (/[a-zA-Z_]/.test(char)) {
      const start = pos;
      while (pos < length && /[a-zA-Z0-9_]/.test(sql[pos])) {
        pos++;
      }
      const word = sql.slice(start, pos);
      const upperWord = word.toUpperCase();

      if (SQL_FORMAT_KEYWORDS.has(upperWord)) {
        // 检查是否需要在前面添加换行
        if (LINE_BREAK_KEYWORDS.has(upperWord) && result.length > 0) {
          // 检查前面是否已经有换行
          const lastPart = result[result.length - 1];
          if (lastPart && !lastPart.endsWith('\n') && !/^\s*$/.test(lastPart)) {
            // 移除前面的空白，添加换行
            while (result.length > 0 && /^\s+$/.test(result[result.length - 1])) {
              result.pop();
            }
            result.push('\n');
          }
        }
        result.push(upperWord);
      } else {
        result.push(word);
      }
      continue;
    }

    // 其他字符直接保留
    result.push(char);
    pos++;
  }

  // 清理多余的空行
  let formatted = result.join('');
  formatted = formatted.replace(/\n\s*\n\s*\n/g, '\n\n'); // 最多保留一个空行
  formatted = formatted.trim();

  return formatted;
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
      const response = await executeDuckDBSQL(sqlToExecute, saveAsTable, isPreview);
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
        toast.success(`查询结果已保存到表: ${variables.saveAsTable}`);
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
      
      toast.error(`查询执行失败: ${error.message}`);
      onError?.(error, variables.sqlToExecute);
    },
  });

  // 执行 SQL
  const execute = useCallback((options?: { saveAsTable?: string; isPreview?: boolean }) => {
    const trimmedSQL = sql.trim();
    if (!trimmedSQL) {
      toast.error('请输入 SQL 语句');
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

  // 格式化 SQL（智能实现，跳过注释和字符串）
  const formatSQL = useCallback(() => {
    const formatted = formatSQLSmart(sql);
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
