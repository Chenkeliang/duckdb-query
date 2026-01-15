/**
 * 列类型检测工具函数
 */

export type ColumnType = 'string' | 'number' | 'date' | 'boolean' | 'object';

/**
 * 检测单个值的类型
 */
export function detectValueType(value: unknown): ColumnType {
  if (value === null || value === undefined) {
    return 'string'; // NULL 值默认为 string
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (typeof value === 'number') {
    return 'number';
  }

  if (value instanceof Date) {
    return 'date';
  }

  if (typeof value === 'object') {
    return 'object';
  }

  // 尝试检测字符串是否为日期
  if (typeof value === 'string') {
    // ISO 日期格式
    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(value)) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return 'date';
      }
    }

    // 尝试检测是否为数字
    const num = parseFloat(value);
    if (!isNaN(num) && isFinite(num) && String(num) === value.trim()) {
      return 'number';
    }
  }

  return 'string';
}

/**
 * 检测列的类型（基于采样数据）
 */
export function detectColumnType(
  data: Record<string, unknown>[],
  column: string,
  sampleSize = 100
): ColumnType {
  const sample = data.slice(0, sampleSize);
  const typeCounts: Record<ColumnType, number> = {
    string: 0,
    number: 0,
    date: 0,
    boolean: 0,
    object: 0,
  };

  for (const row of sample) {
    const value = row[column];
    if (value !== null && value !== undefined) {
      const type = detectValueType(value);
      typeCounts[type]++;
    }
  }

  // 返回出现次数最多的类型
  let maxType: ColumnType = 'string';
  let maxCount = 0;

  for (const [type, count] of Object.entries(typeCounts)) {
    if (count > maxCount) {
      maxCount = count;
      maxType = type as ColumnType;
    }
  }

  return maxType;
}

/**
 * 检测所有列的类型
 */
export function detectAllColumnTypes(
  data: Record<string, unknown>[],
  columns: string[]
): Record<string, ColumnType> {
  const result: Record<string, ColumnType> = {};

  for (const column of columns) {
    result[column] = detectColumnType(data, column);
  }

  return result;
}
