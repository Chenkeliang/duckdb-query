/**
 * DuckDB 类型工具模块
 * 
 * 提供 DuckDB 原生类型的处理工具函数，用于类型冲突检测和 TRY_CAST 生成。
 * 
 * 设计原则：
 * - 使用 DuckDB 原生类型，不引入自定义类型分类
 * - 类型名称标准化（去除精度/长度参数）
 * - 类型兼容性检查基于 DuckDB 的隐式转换规则
 */

/**
 * 可用于 TRY_CAST 的 DuckDB 类型
 * 这些是最常用的转换目标类型
 */
export const DUCKDB_CAST_TYPES = [
  'VARCHAR',           // 最通用，任何类型都可以转为字符串
  'BIGINT',            // 64位整数
  'INTEGER',           // 32位整数
  'DOUBLE',            // 双精度浮点
  'DECIMAL(18,4)',     // 高精度小数
  'TIMESTAMP',         // 时间戳
  'DATE',              // 日期
  'BOOLEAN',           // 布尔
] as const;

export type DuckDBCastType = typeof DUCKDB_CAST_TYPES[number];

/**
 * 整数类型家族（可以互相兼容）
 */
const INTEGER_TYPES = new Set([
  'TINYINT', 'SMALLINT', 'INTEGER', 'INT', 'BIGINT', 'HUGEINT',
  'UTINYINT', 'USMALLINT', 'UINTEGER', 'UBIGINT', 'INT8', 'INT16',
  'INT32', 'INT64', 'INT128', 'UINT8', 'UINT16', 'UINT32', 'UINT64',
]);

/**
 * 浮点类型家族
 */
const FLOAT_TYPES = new Set(['FLOAT', 'REAL', 'DOUBLE', 'FLOAT4', 'FLOAT8']);

/**
 * 字符串类型家族
 */
const STRING_TYPES = new Set(['VARCHAR', 'TEXT', 'CHAR', 'STRING', 'BPCHAR', 'NAME']);

/**
 * 日期时间类型家族
 */
const DATETIME_TYPES = new Set([
  'DATE', 'TIME', 'TIMESTAMP', 'TIMESTAMPTZ', 'TIMESTAMP WITH TIME ZONE',
  'INTERVAL', 'TIMETZ', 'TIME WITH TIME ZONE',
]);

/**
 * 复杂类型（需要精确匹配）
 */
const COMPLEX_TYPES = new Set([
  'ENUM', 'LIST', 'ARRAY', 'MAP', 'STRUCT', 'UNION', 'JSON', 'BLOB', 'BYTEA', 'UUID',
]);

/**
 * 标准化类型名（去除精度/长度参数）
 * 
 * @example
 * normalizeTypeName('DECIMAL(18,4)') // => 'DECIMAL'
 * normalizeTypeName('VARCHAR(255)') // => 'VARCHAR'
 * normalizeTypeName('TIMESTAMP WITH TIME ZONE') // => 'TIMESTAMP WITH TIME ZONE'
 * normalizeTypeName(null) // => 'UNKNOWN'
 */
export function normalizeTypeName(type: string | null | undefined): string {
  if (!type) return 'UNKNOWN';
  
  const trimmed = type.trim();
  if (!trimmed) return 'UNKNOWN';
  
  const upper = trimmed.toUpperCase();
  
  // 处理带括号的类型（如 DECIMAL(18,4), VARCHAR(255)）
  const parenIndex = upper.indexOf('(');
  if (parenIndex > 0) {
    return upper.substring(0, parenIndex).trim();
  }
  
  // 处理数组类型（如 INTEGER[]）
  const bracketIndex = upper.indexOf('[');
  if (bracketIndex > 0) {
    return 'ARRAY';
  }
  
  return upper;
}

/**
 * 检查两个类型是否兼容（可以直接比较，无需 TRY_CAST）
 * 
 * 兼容规则：
 * 1. 完全相同的类型
 * 2. 同一类型家族内的类型（如 INTEGER 和 BIGINT）
 * 3. 整数和浮点类型（DuckDB 会自动提升）
 * 4. DECIMAL 与数值类型
 * 
 * @example
 * areTypesCompatible('INTEGER', 'BIGINT') // => true
 * areTypesCompatible('VARCHAR', 'INTEGER') // => false
 */
export function areTypesCompatible(leftType: string, rightType: string): boolean {
  const left = normalizeTypeName(leftType);
  const right = normalizeTypeName(rightType);
  
  // 完全相同
  if (left === right) return true;
  
  // UNKNOWN 类型与其他类型都不兼容（但与自己兼容，已在上面处理）
  if (left === 'UNKNOWN' || right === 'UNKNOWN') return false;
  
  // 复杂类型需要精确匹配（已经在上面检查过）
  if (COMPLEX_TYPES.has(left) || COMPLEX_TYPES.has(right)) {
    return false;
  }
  
  // 同一类型家族内兼容
  if (INTEGER_TYPES.has(left) && INTEGER_TYPES.has(right)) return true;
  if (FLOAT_TYPES.has(left) && FLOAT_TYPES.has(right)) return true;
  if (STRING_TYPES.has(left) && STRING_TYPES.has(right)) return true;
  if (DATETIME_TYPES.has(left) && DATETIME_TYPES.has(right)) return true;
  
  // DECIMAL 类型之间兼容（DuckDB 会自动处理精度差异）
  if (left === 'DECIMAL' && right === 'DECIMAL') return true;
  
  // 整数和浮点可以兼容（DuckDB 会自动提升）
  if ((INTEGER_TYPES.has(left) && FLOAT_TYPES.has(right)) ||
      (FLOAT_TYPES.has(left) && INTEGER_TYPES.has(right))) return true;
  
  // 整数/浮点和 DECIMAL 兼容
  if ((INTEGER_TYPES.has(left) || FLOAT_TYPES.has(left)) && right === 'DECIMAL') return true;
  if (left === 'DECIMAL' && (INTEGER_TYPES.has(right) || FLOAT_TYPES.has(right))) return true;
  
  return false;
}

/**
 * 获取推荐的 TRY_CAST 目标类型
 * 
 * 推荐规则：
 * 1. 字符串 + 任意类型 → VARCHAR
 * 2. 数值类型组合 → DOUBLE（最大兼容性）
 * 3. 日期时间类型 → TIMESTAMP
 * 4. 复杂类型 → VARCHAR
 * 5. 默认 → VARCHAR
 * 
 * @example
 * getRecommendedCastType('INTEGER', 'VARCHAR') // => 'VARCHAR'
 * getRecommendedCastType('INTEGER', 'DOUBLE') // => 'DOUBLE'
 */
export function getRecommendedCastType(leftType: string, rightType: string): string {
  const left = normalizeTypeName(leftType);
  const right = normalizeTypeName(rightType);
  
  // 如果其中一个是字符串类型，推荐 VARCHAR
  if (STRING_TYPES.has(left) || STRING_TYPES.has(right)) {
    return 'VARCHAR';
  }
  
  // 如果都是数值类型，推荐 DOUBLE（最大兼容性）
  const leftIsNumeric = INTEGER_TYPES.has(left) || FLOAT_TYPES.has(left) || left === 'DECIMAL';
  const rightIsNumeric = INTEGER_TYPES.has(right) || FLOAT_TYPES.has(right) || right === 'DECIMAL';
  if (leftIsNumeric && rightIsNumeric) {
    return 'DOUBLE';
  }
  
  // 如果涉及日期时间，推荐 TIMESTAMP
  if (DATETIME_TYPES.has(left) || DATETIME_TYPES.has(right)) {
    return 'TIMESTAMP';
  }
  
  // 复杂类型推荐 VARCHAR（作为字符串比较）
  if (COMPLEX_TYPES.has(left) || COMPLEX_TYPES.has(right)) {
    return 'VARCHAR';
  }
  
  // 默认推荐 VARCHAR（最通用）
  return 'VARCHAR';
}

/**
 * 生成冲突的唯一 key（基于内容而非索引）
 * 这样即使 JOIN 配置顺序变化，已解决的冲突仍然有效
 * 
 * @example
 * generateConflictKey('orders', 'id', 'users', 'order_id')
 * // => 'orders.id::users.order_id'
 */
export function generateConflictKey(
  leftLabel: string,
  leftColumn: string,
  rightLabel: string,
  rightColumn: string
): string {
  return `${leftLabel}.${leftColumn}::${rightLabel}.${rightColumn}`.toLowerCase();
}

/**
 * 检查是否为同一列（同表同列名）
 * 用于跳过自连接中同一列的比较
 */
export function isSameColumn(
  leftLabel: string,
  leftColumn: string,
  rightLabel: string,
  rightColumn: string
): boolean {
  return leftLabel.toLowerCase() === rightLabel.toLowerCase() &&
         leftColumn.toLowerCase() === rightColumn.toLowerCase();
}

/**
 * 获取类型的显示名称（用于 UI 展示）
 * 保留原始类型名，包括精度参数
 */
export function getTypeDisplayName(type: string | null | undefined): string {
  if (!type) return 'UNKNOWN';
  return type.toUpperCase().trim();
}

/**
 * 检查类型是否为数值类型
 */
export function isNumericType(type: string): boolean {
  const normalized = normalizeTypeName(type);
  return INTEGER_TYPES.has(normalized) || 
         FLOAT_TYPES.has(normalized) || 
         normalized === 'DECIMAL';
}

/**
 * 检查类型是否为字符串类型
 */
export function isStringType(type: string): boolean {
  return STRING_TYPES.has(normalizeTypeName(type));
}

/**
 * 检查类型是否为日期时间类型
 */
export function isDateTimeType(type: string): boolean {
  return DATETIME_TYPES.has(normalizeTypeName(type));
}

/**
 * 检查类型是否为复杂类型
 */
export function isComplexType(type: string): boolean {
  return COMPLEX_TYPES.has(normalizeTypeName(type));
}
