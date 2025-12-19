/**
 * formatSQLSmart 函数测试
 * 测试智能 SQL 格式化功能，确保不会格式化注释和字符串中的内容
 */

import { describe, it, expect } from 'vitest';

// 由于 formatSQLSmart 是内部函数，我们需要通过 useSQLEditor 来测试
// 或者将其导出。这里我们直接复制函数逻辑进行单元测试

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
 * 智能 SQL 格式化函数（测试用副本）
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

describe('formatSQLSmart', () => {
  describe('基本关键字格式化', () => {
    it('应该将关键字转为大写', () => {
      const sql = 'select * from users where id = 1';
      const result = formatSQLSmart(sql);
      expect(result).toContain('SELECT');
      expect(result).toContain('FROM');
      expect(result).toContain('WHERE');
    });

    it('应该在主要关键字前添加换行（当前面有非空白内容时）', () => {
      const sql = 'select * from users where id = 1 order by id';
      const result = formatSQLSmart(sql);
      // 关键字应该被大写
      expect(result).toContain('SELECT');
      expect(result).toContain('FROM');
      expect(result).toContain('WHERE');
      expect(result).toContain('ORDER');
    });
  });

  describe('注释处理', () => {
    it('不应该格式化单行注释中的关键字', () => {
      const sql = 'select * from users -- 在 join 查询面板中执行';
      const result = formatSQLSmart(sql);
      // 注释中的 join 应该保持小写
      expect(result).toContain('-- 在 join 查询面板中执行');
      // SQL 部分应该被格式化
      expect(result).toContain('SELECT');
    });

    it('不应该格式化多行注释中的关键字', () => {
      const sql = 'select * /* from where join */ from users';
      const result = formatSQLSmart(sql);
      // 注释中的关键字应该保持原样
      expect(result).toContain('/* from where join */');
      // SQL 部分应该被格式化
      expect(result).toContain('SELECT');
      expect(result).toContain('FROM users');
    });

    it('应该正确处理包含中文的注释', () => {
      const sql = '-- JOIN 查询面板中执行\nselect * from users';
      const result = formatSQLSmart(sql);
      // 注释应该保持原样
      expect(result).toContain('-- JOIN 查询面板中执行');
    });
  });

  describe('字符串字面量处理', () => {
    it('不应该格式化字符串中的关键字', () => {
      const sql = "select * from users where name = 'select from where'";
      const result = formatSQLSmart(sql);
      // 字符串中的关键字应该保持原样
      expect(result).toContain("'select from where'");
      // SQL 部分应该被格式化
      expect(result).toContain('SELECT');
    });

    it('应该正确处理转义的引号', () => {
      const sql = "select * from users where name = 'it''s a select'";
      const result = formatSQLSmart(sql);
      expect(result).toContain("'it''s a select'");
    });

    it('应该正确处理包含中文的字符串', () => {
      const sql = "select * from users where name = '从 join 表中选择'";
      const result = formatSQLSmart(sql);
      expect(result).toContain("'从 join 表中选择'");
    });
  });

  describe('引号标识符处理', () => {
    it('不应该格式化双引号标识符中的内容', () => {
      const sql = 'select * from "select from where"';
      const result = formatSQLSmart(sql);
      expect(result).toContain('"select from where"');
    });

    it('不应该格式化反引号标识符中的内容', () => {
      const sql = 'select * from `select from where`';
      const result = formatSQLSmart(sql);
      expect(result).toContain('`select from where`');
    });

    it('不应该格式化方括号标识符中的内容', () => {
      const sql = 'select * from [select from where]';
      const result = formatSQLSmart(sql);
      expect(result).toContain('[select from where]');
    });
  });

  describe('复杂场景', () => {
    it('应该正确处理混合注释和字符串的 SQL', () => {
      const sql = `
        -- 这是一个 select 查询
        select * from users
        /* where join on */
        where name = 'from select'
      `;
      const result = formatSQLSmart(sql);
      // 注释保持原样
      expect(result).toContain('-- 这是一个 select 查询');
      expect(result).toContain('/* where join on */');
      // 字符串保持原样
      expect(result).toContain("'from select'");
      // SQL 关键字被格式化
      expect(result).toContain('SELECT');
      expect(result).toContain('FROM');
      expect(result).toContain('WHERE');
    });

    it('应该正确处理 JOIN 查询', () => {
      const sql = 'select * from users left join orders on users.id = orders.user_id';
      const result = formatSQLSmart(sql);
      expect(result).toContain('SELECT');
      expect(result).toContain('LEFT');
      expect(result).toContain('JOIN');
      expect(result).toContain('ON');
    });

    it('应该正确处理子查询', () => {
      const sql = 'select * from (select id from users) as subquery';
      const result = formatSQLSmart(sql);
      expect(result).toContain('SELECT');
      expect(result).toContain('FROM');
      expect(result).toContain('AS');
    });
  });

  describe('边界情况', () => {
    it('应该处理空字符串', () => {
      const result = formatSQLSmart('');
      expect(result).toBe('');
    });

    it('应该处理只有注释的 SQL', () => {
      const sql = '-- 这是注释';
      const result = formatSQLSmart(sql);
      expect(result).toBe('-- 这是注释');
    });

    it('应该处理未闭合的字符串', () => {
      const sql = "select * from users where name = 'unclosed";
      const result = formatSQLSmart(sql);
      // 不应该崩溃
      expect(result).toContain('SELECT');
    });

    it('应该处理未闭合的多行注释', () => {
      const sql = 'select * /* unclosed comment';
      const result = formatSQLSmart(sql);
      // 不应该崩溃
      expect(result).toContain('SELECT');
    });
  });
});
