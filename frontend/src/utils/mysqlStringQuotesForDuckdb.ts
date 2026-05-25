/**
 * 将 MySQL/DataGrip 风格的双引号字符串字面量转为 DuckDB 单引号。
 * DuckDB 中双引号仅用于标识符；联邦查询在 DuckDB 侧解析 SQL。
 */
import { SQLTokenizer, type Token } from './sqlTokenizer';

const COMPARISON_OPS = new Set([
  '=',
  '<>',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  'LIKE',
  'ILIKE',
]);

function isKeyword(token: Token | undefined, word: string): boolean {
  return (
    token?.type === 'keyword' && token.value.toUpperCase() === word.toUpperCase()
  );
}

function isDoubleQuotedToken(token: Token): boolean {
  return token.raw.startsWith('"') && token.raw.endsWith('"') && token.raw.length >= 2;
}

function toSingleQuotedLiteral(content: string): string {
  return `'${content.replace(/'/g, "''")}'`;
}

export interface NormalizeMysqlQuotesOptions {
  /** 为 false 时不改写（默认 true） */
  enabled?: boolean;
}

/**
 * 在 IN (...) 与比较运算右侧，把 `"value"` 改写为 `'value'`。
 * 带点号的 `"schema"."table"` 仍视为标识符，不改动。
 */
export function normalizeMysqlDoubleQuotedStringsForDuckdb(
  sql: string,
  options: NormalizeMysqlQuotesOptions = {}
): string {
  if (options.enabled === false || !sql.includes('"')) {
    return sql;
  }

  const tokens = new SQLTokenizer(sql).tokenize();
  const replacements: { start: number; end: number; text: string }[] = [];

  let inListDepth = 0;
  let expectComparisonRhs = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const prev = tokens[i - 1];
    const next = tokens[i + 1];

    if (isKeyword(token, 'IN')) {
      // 等待紧随其后的 (
      continue;
    }

    if (token.type === 'lparen') {
      if (isKeyword(prev, 'IN')) {
        inListDepth += 1;
      }
      continue;
    }

    if (token.type === 'rparen') {
      if (inListDepth > 0) {
        inListDepth -= 1;
      }
      continue;
    }

    if (
      token.type === 'operator' &&
      COMPARISON_OPS.has(token.value.toUpperCase())
    ) {
      expectComparisonRhs = true;
      continue;
    }

    if (isDoubleQuotedToken(token)) {
      const isQualified =
        prev?.type === 'dot' || next?.type === 'dot';
      const shouldConvert =
        !isQualified && (inListDepth > 0 || expectComparisonRhs);

      if (shouldConvert) {
        const inner = token.raw.slice(1, -1).replace(/""/g, '"');
        replacements.push({
          start: token.position,
          end: token.position + token.raw.length,
          text: toSingleQuotedLiteral(inner),
        });
      }
      expectComparisonRhs = false;
      continue;
    }

    if (expectComparisonRhs && token.type !== 'comma') {
      expectComparisonRhs = false;
    }
  }

  if (replacements.length === 0) {
    return sql;
  }

  replacements.sort((a, b) => b.start - a.start);
  let out = sql;
  for (const r of replacements) {
    out = out.slice(0, r.start) + r.text + out.slice(r.end);
  }
  return out;
}
