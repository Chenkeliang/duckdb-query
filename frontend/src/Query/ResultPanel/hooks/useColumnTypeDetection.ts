/**
 * 列类型检测 Hook
 * 自动检测数据列的类型（数值、日期、布尔、字符串）
 */

import { useMemo, useCallback } from 'react';

export type ColumnType = 'number' | 'date' | 'boolean' | 'string';

export interface ColumnTypeInfo {
  type: ColumnType;
  confidence: number; // 0-1 之间的置信度
  nullable: boolean;
  sampleSize: number;
}

export interface ColumnTypeMap {
  [columnName: string]: ColumnTypeInfo;
}

// 日期格式正则表达式
const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
  /^\d{4}\/\d{2}\/\d{2}$/, // YYYY/MM/DD
  /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
  /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY or MM/DD/YYYY
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO 8601
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/, // YYYY-MM-DD HH:MM:SS
];

// 数值格式正则表达式（支持逗号分隔）
const NUMBER_PATTERNS = [
  /^-?\d+$/, // 整数
  /^-?\d+\.\d+$/, // 小数
  /^-?\d{1,3}(,\d{3})*(\.\d+)?$/, // 逗号分隔的数字 (1,234.56)
  /^-?\d{1,3}(\.\d{3})*(,\d+)?$/, // 欧洲格式 (1.234,56)
];

// 布尔值模式
const BOOLEAN_VALUES = new Set([
  'true', 'false',
  'yes', 'no',
  '1', '0',
  't', 'f',
  'y', 'n',
  '是', '否',
]);

/**
 * 检测单个值的类型
 */
function detectValueType(value: unknown): ColumnType | null {
  // 处理 null/undefined
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const strValue = String(value).trim();

  // 检测布尔值
  if (BOOLEAN_VALUES.has(strValue.toLowerCase())) {
    return 'boolean';
  }

  // 检测数值
  for (const pattern of NUMBER_PATTERNS) {
    if (pattern.test(strValue)) {
      return 'number';
    }
  }

  // 检测日期
  for (const pattern of DATE_PATTERNS) {
    if (pattern.test(strValue)) {
      // 额外验证：尝试解析日期
      const parsed = new Date(strValue);
      if (!isNaN(parsed.getTime())) {
        return 'date';
      }
    }
  }

  // 默认为字符串
  return 'string';
}

/**
 * 列类型检测 Hook
 */
export const useColumnTypeDetection = () => {
  /**
   * 检测所有列的类型
   * @param data 数据数组
   * @param sampleSize 采样大小（默认 100 行）
   */
  const detectColumnTypes = useCallback((
    data: Record<string, unknown>[],
    sampleSize: number = 100
  ): ColumnTypeMap => {
    if (!data || data.length === 0) {
      return {};
    }

    // 获取所有列名
    const columns = Object.keys(data[0]);
    const result: ColumnTypeMap = {};

    // 采样数据
    const sample = data.slice(0, sampleSize);
    const actualSampleSize = sample.length;

    for (const column of columns) {
      const typeCounts: Record<ColumnType, number> = {
        number: 0,
        date: 0,
        boolean: 0,
        string: 0,
      };
      let nullCount = 0;

      // 统计每种类型的出现次数
      for (const row of sample) {
        const value = row[column];
        const type = detectValueType(value);

        if (type === null) {
          nullCount++;
        } else {
          typeCounts[type]++;
        }
      }

      // 计算非空值数量
      const nonNullCount = actualSampleSize - nullCount;

      // 确定主要类型
      let dominantType: ColumnType = 'string';
      let maxCount = 0;

      for (const [type, count] of Object.entries(typeCounts)) {
        if (count > maxCount) {
          maxCount = count;
          dominantType = type as ColumnType;
        }
      }

      // 计算置信度
      const confidence = nonNullCount > 0 ? maxCount / nonNullCount : 0;

      result[column] = {
        type: dominantType,
        confidence,
        nullable: nullCount > 0,
        sampleSize: actualSampleSize,
      };
    }

    return result;
  }, []);

  /**
   * 解析数值（支持逗号分隔格式）
   */
  const parseNumber = useCallback((value: unknown): number | null => {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const strValue = String(value).trim();

    // 移除逗号（千分位分隔符）
    const normalized = strValue.replace(/,/g, '');

    const num = parseFloat(normalized);
    return isNaN(num) ? null : num;
  }, []);

  /**
   * 解析日期
   */
  const parseDate = useCallback((value: unknown): Date | null => {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const strValue = String(value).trim();
    const parsed = new Date(strValue);

    return isNaN(parsed.getTime()) ? null : parsed;
  }, []);

  /**
   * 解析布尔值
   */
  const parseBoolean = useCallback((value: unknown): boolean | null => {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const strValue = String(value).trim().toLowerCase();

    if (['true', 'yes', '1', 't', 'y', '是'].includes(strValue)) {
      return true;
    }
    if (['false', 'no', '0', 'f', 'n', '否'].includes(strValue)) {
      return false;
    }

    return null;
  }, []);

  return {
    detectColumnTypes,
    parseNumber,
    parseDate,
    parseBoolean,
  };
};

export default useColumnTypeDetection;
