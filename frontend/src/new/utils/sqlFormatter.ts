/**
 * SQL 格式化工具
 * 使用 sql-formatter 库实现 DataGrip 风格的专业 SQL 格式化
 * 
 * @module sqlFormatter
 */

import { format, type FormatOptionsWithLanguage } from 'sql-formatter';

/**
 * DataGrip 风格 SQL 格式化配置
 * - 使用 DuckDB 方言（sql-formatter 原生支持）
 * - SELECT 列表每列一行
 * - JOIN 条件正确对齐
 * - 关键字大写
 */
const DATAGRIP_FORMAT_OPTIONS: FormatOptionsWithLanguage = {
  language: 'duckdb',  // sql-formatter 原生支持 DuckDB
  tabWidth: 4,
  useTabs: false,
  keywordCase: 'upper',
  identifierCase: 'preserve',
  dataTypeCase: 'upper',
  functionCase: 'upper',
  linesBetweenQueries: 2,
  denseOperators: false,
  newlineBeforeSemicolon: false,
  indentStyle: 'standard',
  logicalOperatorNewline: 'before',
  expressionWidth: 50,
};

/**
 * 紧凑格式化配置（单行）
 */
const COMPACT_FORMAT_OPTIONS: FormatOptionsWithLanguage = {
  language: 'duckdb',
  keywordCase: 'upper',
  identifierCase: 'preserve',
};

/**
 * 格式化 SQL（DataGrip 风格）
 * 
 * 特性：
 * - SELECT 列表每列一行
 * - JOIN 条件正确对齐
 * - 关键字大写
 * - 保留注释和字符串字面量
 * 
 * 降级策略：
 * - 格式化失败时返回原始 SQL
 * - 格式化结果异常时返回原始 SQL
 * 
 * @param sql - 要格式化的 SQL 语句
 * @returns 格式化后的 SQL，失败时返回原始 SQL
 * 
 * @example
 * ```ts
 * const formatted = formatSQLDataGrip('select a,b from t where x=1');
 * // 返回:
 * // SELECT
 * //     a,
 * //     b
 * // FROM
 * //     t
 * // WHERE
 * //     x = 1
 * ```
 */
export function formatSQLDataGrip(sql: string): string {
  if (!sql.trim()) return sql;
  
  try {
    const formatted = format(sql, DATAGRIP_FORMAT_OPTIONS);
    
    // 降级检查：格式化结果异常时返回原始 SQL
    // 如果格式化后长度比原始短超过 50%，认为格式化异常
    if (formatted.length < sql.length * 0.5) {
      console.warn('[sqlFormatter] 格式化结果异常，返回原始 SQL');
      return sql;
    }
    
    return formatted;
  } catch (error) {
    console.error('[sqlFormatter] SQL 格式化失败:', error);
    // 格式化失败时返回原始 SQL
    return sql;
  }
}

/**
 * 紧凑格式化 SQL（单行）
 * 
 * 将 SQL 压缩为单行，移除多余空白，保留关键字大写
 * 
 * @param sql - 要格式化的 SQL 语句
 * @returns 紧凑格式化后的 SQL
 * 
 * @example
 * ```ts
 * const compact = formatSQLCompact('SELECT\n  a,\n  b\nFROM t');
 * // 返回: "SELECT a, b FROM t"
 * ```
 */
export function formatSQLCompact(sql: string): string {
  if (!sql.trim()) return sql;
  
  try {
    // 先用 sql-formatter 处理关键字大写
    const formatted = format(sql, COMPACT_FORMAT_OPTIONS);
    // 然后压缩为单行
    return formatted.replace(/\s+/g, ' ').trim();
  } catch {
    // 格式化失败时简单压缩
    return sql.replace(/\s+/g, ' ').trim();
  }
}

/**
 * 检查 SQL 是否包含 DuckDB 特有语法
 * 
 * sql-formatter 使用 PostgreSQL 方言，部分 DuckDB 特有语法可能不支持：
 * - EXCLUDE/REPLACE 列
 * - PIVOT/UNPIVOT
 * - QUALIFY 子句
 * - SAMPLE 子句
 * 
 * @param sql - 要检查的 SQL 语句
 * @returns 是否包含 DuckDB 特有语法
 */
export function hasDuckDBSpecificSyntax(sql: string): boolean {
  const upperSQL = sql.toUpperCase();
  const duckdbKeywords = [
    /\bEXCLUDE\s*\(/,
    /\bREPLACE\s*\(/,
    /\bPIVOT\b/,
    /\bUNPIVOT\b/,
    /\bQUALIFY\b/,
    /\bSAMPLE\b/,
  ];
  
  return duckdbKeywords.some(pattern => pattern.test(upperSQL));
}
