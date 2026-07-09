/**
 * SQL 字符串字面量转义（DuckDB / 标准 SQL）。
 *
 * 单引号字符串里唯一需要转义的字符就是单引号本身——翻倍即可（`O'Brien` → `O''Brien`）。
 * 历史上 chartSpec / filterUtils / PivotPanel 各写过一份 `replace(/'/g, "''")`，
 * 任何一处漏改都会与其它处漂移；此处统一为单一实现。零依赖叶子模块，可被任意
 * 组件安全导入而不引入循环依赖。
 */

/** 转义内部单引号（翻倍），返回不含外层引号的内容。 */
export function escapeSqlLiteralBody(value: string): string {
  return String(value).replace(/'/g, "''");
}

/** 生成完整的 SQL 字符串字面量（含外层单引号），如 `O'Brien` → `'O''Brien'`。 */
export function sqlStringLiteral(value: string): string {
  return `'${escapeSqlLiteralBody(value)}'`;
}
