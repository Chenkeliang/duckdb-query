/**
 * 智能解析 Hook
 * 
 * 支持多种数据格式的自动检测和解析：
 * - CSV (逗号分隔)
 * - TSV (Tab 分隔)
 * - 管道符分隔
 * - 分号分隔
 * - 多空格分隔
 * - JSON
 * - 键值对
 * - 固定宽度
 */

import { useState, useCallback, useMemo } from 'react';

// ============ 类型定义 ============

export interface ParseResult {
  strategy: string;        // 策略名称
  confidence: number;      // 置信度 0-100
  rows: string[][];        // 解析后的数据
  columns: number;         // 列数
  preview: string[][];     // 预览数据（前5行）
  hasHeader: boolean;      // 是否有表头
  delimiter?: string;      // 使用的分隔符
}

export interface ParseConfig {
  format: 'auto' | 'csv' | 'tsv' | 'json' | 'keyvalue' | 'fixedwidth' | 'custom';
  delimiter: string;
  hasHeader: boolean;
}

interface UseSmartParseReturn {
  // 解析结果
  results: ParseResult[];
  selectedIndex: number;
  currentResult: ParseResult | null;
  
  // 操作
  parse: (text: string, config?: Partial<ParseConfig>) => void;
  selectResult: (index: number) => void;
  
  // 状态
  isLoading: boolean;
  error: string | null;
}

// ============ 工具函数 ============

/**
 * 计算数组中出现最多的值
 */
const mode = (arr: number[]): number => {
  const freq: Record<number, number> = {};
  arr.forEach(n => { freq[n] = (freq[n] || 0) + 1; });
  return Number(Object.keys(freq).reduce((a, b) => freq[Number(a)] > freq[Number(b)] ? a : b, '0'));
};

/**
 * 清理单元格内容（去除首尾引号和空格）
 */
const cleanCell = (cell: string): string => {
  if (!cell) return '';
  let s = cell.trim();
  if (s.length >= 2) {
    if ((s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1);
    }
  }
  return s.trim();
};

// ============ 解析策略 ============

/**
 * 分隔符解析策略
 */
const parseWithDelimiter = (text: string, delimiter: string, name: string): ParseResult => {
  const lines = text.trim().split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { strategy: name, confidence: 0, rows: [], columns: 0, preview: [], hasHeader: false };
  }

  const rows = lines.map(line => {
    // 处理引号包裹的字段
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (!inQuotes && (char === '"' || char === "'")) {
        inQuotes = true;
        quoteChar = char;
        current += char;
      } else if (inQuotes && char === quoteChar) {
        inQuotes = false;
        current += char;
      } else if (!inQuotes && char === delimiter) {
        cells.push(cleanCell(current));
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(cleanCell(current));
    
    return cells;
  });

  // 计算置信度
  const colCounts = rows.map(r => r.length);
  const mostCommon = mode(colCounts);
  const consistency = colCounts.filter(c => c === mostCommon).length / colCounts.length;
  
  // 过滤掉列数不一致的行
  const filteredRows = rows.filter(r => r.length === mostCommon);
  
  // 置信度 = 一致性 × 基础分 × 列数合理性
  const baseScore = delimiter === '\t' ? 100 : delimiter === ',' ? 95 : 90;
  const confidence = consistency * baseScore * (mostCommon > 1 ? 1 : 0.3);

  return {
    strategy: name,
    confidence: Math.round(confidence),
    rows: filteredRows,
    columns: mostCommon,
    preview: filteredRows.slice(0, 5),
    hasHeader: false,
    delimiter,
  };
};

/**
 * 多空格分隔解析策略
 */
const parseWithMultiSpace = (text: string): ParseResult => {
  const lines = text.trim().split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { strategy: '多空格分隔', confidence: 0, rows: [], columns: 0, preview: [], hasHeader: false };
  }

  const rows = lines.map(line => 
    line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean)
  );

  const colCounts = rows.map(r => r.length);
  const mostCommon = mode(colCounts);
  const consistency = colCounts.filter(c => c === mostCommon).length / colCounts.length;
  
  const filteredRows = rows.filter(r => r.length === mostCommon);
  const confidence = consistency * 80 * (mostCommon > 1 ? 1 : 0);

  return {
    strategy: '多空格分隔',
    confidence: Math.round(confidence),
    rows: filteredRows,
    columns: mostCommon,
    preview: filteredRows.slice(0, 5),
    hasHeader: false,
  };
};

/**
 * JSON 解析策略
 */
const parseJson = (text: string): ParseResult => {
  try {
    const trimmed = text.trim();
    const json = JSON.parse(trimmed);
    
    let arr: Record<string, unknown>[];
    if (Array.isArray(json)) {
      arr = json;
    } else if (json && typeof json === 'object' && Array.isArray(json.data)) {
      arr = json.data;
    } else if (json && typeof json === 'object') {
      arr = [json];
    } else {
      return { strategy: 'JSON', confidence: 0, rows: [], columns: 0, preview: [], hasHeader: false };
    }

    if (arr.length === 0 || typeof arr[0] !== 'object') {
      return { strategy: 'JSON', confidence: 0, rows: [], columns: 0, preview: [], hasHeader: false };
    }

    // 收集所有键
    const keySet = new Set<string>();
    arr.forEach(obj => {
      if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach(k => keySet.add(k));
      }
    });
    const keys = Array.from(keySet);

    if (keys.length === 0) {
      return { strategy: 'JSON', confidence: 0, rows: [], columns: 0, preview: [], hasHeader: false };
    }

    // 转换为行数据
    const rows = arr.map(obj => 
      keys.map(k => String((obj as Record<string, unknown>)[k] ?? ''))
    );

    return {
      strategy: 'JSON',
      confidence: 95,
      rows: [keys, ...rows],  // 第一行是列名
      columns: keys.length,
      preview: [keys, ...rows.slice(0, 4)],
      hasHeader: true,
    };
  } catch {
    return { strategy: 'JSON', confidence: 0, rows: [], columns: 0, preview: [], hasHeader: false };
  }
};

/**
 * 键值对解析策略
 */
const parseKeyValue = (text: string): ParseResult => {
  const lines = text.trim().split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { strategy: '键值对', confidence: 0, rows: [], columns: 0, preview: [], hasHeader: false };
  }

  const kvPattern = /^([^:：=]+)[：:=]\s*(.*)$/;
  const pairs: [string, string][] = [];

  for (const line of lines) {
    const match = line.match(kvPattern);
    if (match) {
      pairs.push([match[1].trim(), match[2].trim()]);
    }
  }

  const matchRate = pairs.length / lines.length;
  if (matchRate < 0.8) {
    return { strategy: '键值对', confidence: 0, rows: [], columns: 0, preview: [], hasHeader: false };
  }

  // 转换为表格格式（键作为列名，值作为数据）
  const keys = pairs.map(p => p[0]);
  const values = pairs.map(p => p[1]);

  return {
    strategy: '键值对',
    confidence: Math.round(matchRate * 90),
    rows: [keys, values],
    columns: pairs.length,
    preview: [keys, values],
    hasHeader: true,
  };
};

/**
 * 固定宽度解析策略
 */
const parseFixedWidth = (text: string): ParseResult => {
  const lines = text.trim().split('\n').filter(line => line.trim());
  if (lines.length < 2) {
    return { strategy: '固定宽度', confidence: 0, rows: [], columns: 0, preview: [], hasHeader: false };
  }

  // 找到所有行中连续空格的位置
  const findSpaceRanges = (line: string): number[] => {
    const positions: number[] = [];
    let inSpace = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === ' ') {
        if (!inSpace) {
          positions.push(i);
          inSpace = true;
        }
      } else {
        inSpace = false;
      }
    }
    return positions;
  };

  // 找到所有行共同的分割位置
  const allPositions = lines.map(findSpaceRanges);
  if (allPositions.length === 0 || allPositions[0].length === 0) {
    return { strategy: '固定宽度', confidence: 0, rows: [], columns: 0, preview: [], hasHeader: false };
  }

  // 找交集（允许 ±2 的误差）
  const commonPositions = allPositions[0].filter(pos =>
    allPositions.every(positions =>
      positions.some(p => Math.abs(p - pos) <= 2)
    )
  );

  if (commonPositions.length === 0) {
    return { strategy: '固定宽度', confidence: 0, rows: [], columns: 0, preview: [], hasHeader: false };
  }

  // 按位置分割
  const splitPositions = [0, ...commonPositions];
  const rows = lines.map(line => {
    const cells: string[] = [];
    for (let i = 0; i < splitPositions.length; i++) {
      const start = splitPositions[i];
      const end = splitPositions[i + 1] ?? line.length;
      cells.push(line.substring(start, end).trim());
    }
    return cells;
  });

  const colCount = splitPositions.length;
  const confidence = Math.min(70, 50 + commonPositions.length * 5);

  return {
    strategy: '固定宽度',
    confidence,
    rows,
    columns: colCount,
    preview: rows.slice(0, 5),
    hasHeader: false,
  };
};

// ============ 主 Hook ============

export const useSmartParse = (): UseSmartParseReturn => {
  const [results, setResults] = useState<ParseResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parse = useCallback((text: string, config?: Partial<ParseConfig>) => {
    if (!text.trim()) {
      setError('请输入数据');
      setResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const allResults: ParseResult[] = [];

      // 如果指定了格式，只使用该格式
      if (config?.format && config.format !== 'auto') {
        switch (config.format) {
          case 'csv':
            allResults.push(parseWithDelimiter(text, ',', '逗号分隔 (CSV)'));
            break;
          case 'tsv':
            allResults.push(parseWithDelimiter(text, '\t', 'Tab 分隔 (TSV)'));
            break;
          case 'json':
            allResults.push(parseJson(text));
            break;
          case 'keyvalue':
            allResults.push(parseKeyValue(text));
            break;
          case 'fixedwidth':
            allResults.push(parseFixedWidth(text));
            break;
          case 'custom':
            if (config.delimiter) {
              allResults.push(parseWithDelimiter(text, config.delimiter, `自定义分隔符 (${config.delimiter})`));
            }
            break;
        }
      } else {
        // 自动检测：尝试所有策略
        allResults.push(parseWithDelimiter(text, '\t', 'Tab 分隔'));
        allResults.push(parseWithDelimiter(text, ',', '逗号分隔'));
        allResults.push(parseWithDelimiter(text, '|', '管道符分隔'));
        allResults.push(parseWithDelimiter(text, ';', '分号分隔'));
        allResults.push(parseWithMultiSpace(text));
        allResults.push(parseJson(text));
        allResults.push(parseKeyValue(text));
        allResults.push(parseFixedWidth(text));
      }

      // 过滤有效结果并按置信度排序
      const validResults = allResults
        .filter(r => r.confidence > 0 && r.rows.length > 0)
        .sort((a, b) => b.confidence - a.confidence);

      if (validResults.length === 0) {
        setError('无法识别数据格式，请尝试手动配置');
        setResults([]);
      } else {
        setResults(validResults);
        setSelectedIndex(0);
      }
    } catch (e) {
      setError(`解析失败: ${(e as Error).message}`);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectResult = useCallback((index: number) => {
    if (index >= 0 && index < results.length) {
      setSelectedIndex(index);
    }
  }, [results.length]);

  const currentResult = useMemo(() => {
    return results[selectedIndex] ?? null;
  }, [results, selectedIndex]);

  return {
    results,
    selectedIndex,
    currentResult,
    parse,
    selectResult,
    isLoading,
    error,
  };
};

export default useSmartParse;
