/**
 * 数据清理 Hook
 * 
 * 提供数据清理功能：
 * - 去除引号
 * - 去除空格
 * - 清理空值
 * - 格式化数字
 * - 全部清理
 * - 撤销功能
 */

import { useState, useCallback, useMemo } from 'react';

// ============ 类型定义 ============

export type CleanupAction = 'quotes' | 'spaces' | 'nulls' | 'numbers' | 'all';

export interface CleanupResult {
  rows: string[][];
  affected: number;
  details: string;
}

export interface CleanupStats {
  quotes: number;
  spaces: number;
  nulls: number;
  numbers: number;
  total: number;
}

interface UseCleanupReturn {
  // 当前数据
  data: string[][];
  
  // 清理操作
  cleanup: (action: CleanupAction) => CleanupResult;
  
  // 撤销
  undo: () => boolean;
  canUndo: boolean;
  
  // 重置
  reset: (newData: string[][]) => void;
  setData: (newData: string[][]) => void;
  
  // 统计
  stats: CleanupStats;
  
  // 检测
  detectCleanable: () => {
    hasQuotes: boolean;
    hasSpaces: boolean;
    hasNulls: boolean;
    hasFormattedNumbers: boolean;
  };
}

// ============ 清理函数 ============

/**
 * 空值标记列表
 */
const NULL_VALUES = [
  'null', 'NULL', 'Null',
  'nil', 'NIL', 'Nil',
  'N/A', 'n/a', 'NA', 'na',
  'undefined', 'UNDEFINED',
  'NaN', 'nan',
  '-', '--', '---',
  'none', 'None', 'NONE',
  '#N/A', '#NA', '#NULL!',
];

/**
 * 去除引号
 */
const cleanQuotes = (rows: string[][]): CleanupResult => {
  let affected = 0;
  const cleaned = rows.map(row =>
    row.map(cell => {
      if (cell.length >= 2) {
        if ((cell.startsWith('"') && cell.endsWith('"')) ||
            (cell.startsWith("'") && cell.endsWith("'"))) {
          affected++;
          return cell.slice(1, -1);
        }
      }
      return cell;
    })
  );
  return {
    rows: cleaned,
    affected,
    details: affected > 0 ? `去除了 ${affected} 个引号` : '没有需要去除的引号',
  };
};

/**
 * 去除空格
 */
const cleanSpaces = (rows: string[][]): CleanupResult => {
  let affected = 0;
  const cleaned = rows.map(row =>
    row.map(cell => {
      const trimmed = cell.trim();
      if (trimmed !== cell) {
        affected++;
      }
      return trimmed;
    })
  );
  return {
    rows: cleaned,
    affected,
    details: affected > 0 ? `去除了 ${affected} 个单元格的空格` : '没有需要去除的空格',
  };
};

/**
 * 清理空值
 */
const cleanNulls = (rows: string[][]): CleanupResult => {
  let affected = 0;
  const cleaned = rows.map(row =>
    row.map(cell => {
      const trimmed = cell.trim();
      if (NULL_VALUES.includes(trimmed)) {
        affected++;
        return '';
      }
      return cell;
    })
  );
  return {
    rows: cleaned,
    affected,
    details: affected > 0 ? `清理了 ${affected} 个空值` : '没有需要清理的空值',
  };
};

/**
 * 格式化数字（去除千分位和货币符号）
 */
const cleanNumbers = (rows: string[][]): CleanupResult => {
  let affected = 0;
  const currencyPattern = /^[$¥€£₹₽₩]\s*/;
  const thousandPattern = /,(?=\d{3})/g;
  
  const cleaned = rows.map(row =>
    row.map(cell => {
      const original = cell.trim();
      
      // 去除货币符号
      let cleaned = original.replace(currencyPattern, '');
      
      // 去除千分位逗号
      cleaned = cleaned.replace(thousandPattern, '');
      
      // 去除中文逗号
      cleaned = cleaned.replace(/，/g, '');
      
      // 验证是否为有效数字
      if (cleaned !== original && !isNaN(Number(cleaned)) && cleaned !== '') {
        affected++;
        return cleaned;
      }
      
      return cell;
    })
  );
  
  return {
    rows: cleaned,
    affected,
    details: affected > 0 ? `格式化了 ${affected} 个数字` : '没有需要格式化的数字',
  };
};

/**
 * 全部清理
 */
const cleanAll = (rows: string[][]): CleanupResult => {
  let totalAffected = 0;
  let currentRows = rows;
  const details: string[] = [];

  // 依次执行所有清理
  const actions: Array<{ name: string; fn: (r: string[][]) => CleanupResult }> = [
    { name: '引号', fn: cleanQuotes },
    { name: '空格', fn: cleanSpaces },
    { name: '空值', fn: cleanNulls },
    { name: '数字', fn: cleanNumbers },
  ];

  for (const action of actions) {
    const result = action.fn(currentRows);
    if (result.affected > 0) {
      totalAffected += result.affected;
      details.push(`${action.name}: ${result.affected}`);
    }
    currentRows = result.rows;
  }

  return {
    rows: currentRows,
    affected: totalAffected,
    details: totalAffected > 0 
      ? `共清理 ${totalAffected} 个单元格 (${details.join(', ')})` 
      : '数据已经很干净，无需清理',
  };
};

// ============ 主 Hook ============

export const useCleanup = (initialData: string[][] = []): UseCleanupReturn => {
  const [data, setDataState] = useState<string[][]>(initialData);
  const [history, setHistory] = useState<string[][][]>([]);
  const [stats, setStats] = useState<CleanupStats>({
    quotes: 0,
    spaces: 0,
    nulls: 0,
    numbers: 0,
    total: 0,
  });

  /**
   * 执行清理操作
   */
  const cleanup = useCallback((action: CleanupAction): CleanupResult => {
    // 保存当前状态到历史
    setHistory(prev => [...prev, data]);

    let result: CleanupResult;
    
    switch (action) {
      case 'quotes':
        result = cleanQuotes(data);
        setStats(prev => ({ 
          ...prev, 
          quotes: prev.quotes + result.affected,
          total: prev.total + result.affected,
        }));
        break;
      case 'spaces':
        result = cleanSpaces(data);
        setStats(prev => ({ 
          ...prev, 
          spaces: prev.spaces + result.affected,
          total: prev.total + result.affected,
        }));
        break;
      case 'nulls':
        result = cleanNulls(data);
        setStats(prev => ({ 
          ...prev, 
          nulls: prev.nulls + result.affected,
          total: prev.total + result.affected,
        }));
        break;
      case 'numbers':
        result = cleanNumbers(data);
        setStats(prev => ({ 
          ...prev, 
          numbers: prev.numbers + result.affected,
          total: prev.total + result.affected,
        }));
        break;
      case 'all':
        result = cleanAll(data);
        // 全部清理时，统计已包含在 result 中
        setStats(prev => ({ 
          ...prev, 
          total: prev.total + result.affected,
        }));
        break;
      default:
        result = { rows: data, affected: 0, details: '未知操作' };
    }

    setDataState(result.rows);
    return result;
  }, [data]);

  /**
   * 撤销操作
   */
  const undo = useCallback((): boolean => {
    if (history.length === 0) return false;
    
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setDataState(prev);
    return true;
  }, [history]);

  /**
   * 重置数据和历史
   */
  const reset = useCallback((newData: string[][]) => {
    setDataState(newData);
    setHistory([]);
    setStats({ quotes: 0, spaces: 0, nulls: 0, numbers: 0, total: 0 });
  }, []);

  /**
   * 设置数据（不清空历史）
   */
  const setData = useCallback((newData: string[][]) => {
    setDataState(newData);
  }, []);

  /**
   * 检测可清理的内容
   */
  const detectCleanable = useCallback(() => {
    let hasQuotes = false;
    let hasSpaces = false;
    let hasNulls = false;
    let hasFormattedNumbers = false;

    const currencyPattern = /^[$¥€£₹₽₩]/;
    const thousandPattern = /\d{1,3}(,\d{3})+/;

    for (const row of data) {
      for (const cell of row) {
        // 检测引号
        if (cell.length >= 2 && 
            ((cell.startsWith('"') && cell.endsWith('"')) ||
             (cell.startsWith("'") && cell.endsWith("'")))) {
          hasQuotes = true;
        }

        // 检测空格
        if (cell !== cell.trim()) {
          hasSpaces = true;
        }

        // 检测空值
        if (NULL_VALUES.includes(cell.trim())) {
          hasNulls = true;
        }

        // 检测格式化数字
        if (currencyPattern.test(cell) || thousandPattern.test(cell)) {
          hasFormattedNumbers = true;
        }

        // 如果都检测到了，提前退出
        if (hasQuotes && hasSpaces && hasNulls && hasFormattedNumbers) {
          return { hasQuotes, hasSpaces, hasNulls, hasFormattedNumbers };
        }
      }
    }

    return { hasQuotes, hasSpaces, hasNulls, hasFormattedNumbers };
  }, [data]);

  const canUndo = useMemo(() => history.length > 0, [history.length]);

  return {
    data,
    cleanup,
    undo,
    canUndo,
    reset,
    setData,
    stats,
    detectCleanable,
  };
};

export default useCleanup;
