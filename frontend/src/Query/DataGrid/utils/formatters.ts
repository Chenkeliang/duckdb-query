/**
 * 数据格式化工具函数
 */

/**
 * 格式化单元格值用于显示
 */
export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * 格式化数字（不使用千分位，保持原始值）
 */
export function formatNumber(value: number): string {
  return String(value);
}

/**
 * 格式化日期
 */
export function formatDate(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) {
    return String(value);
  }
  return date.toISOString().split('T')[0];
}

/**
 * 格式化日期时间
 */
export function formatDateTime(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) {
    return String(value);
  }
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * 检测值是否为 NULL
 */
export function isNullValue(value: unknown): boolean {
  return value === null || value === undefined;
}

/**
 * 检测值是否为数字
 */
export function isNumericValue(value: unknown): boolean {
  if (typeof value === 'number') return !isNaN(value);
  if (typeof value === 'string') {
    const num = parseFloat(value);
    return !isNaN(num) && isFinite(num);
  }
  return false;
}
