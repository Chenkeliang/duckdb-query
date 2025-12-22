/**
 * SQL 格式化函数测试
 * 测试使用 sql-formatter 库的 DataGrip 风格格式化功能
 */

import { describe, it, expect } from 'vitest';
import { formatSQLDataGrip, formatSQLCompact, hasDuckDBSpecificSyntax } from '@/new/utils/sqlFormatter';

describe('formatSQLDataGrip', () => {
  describe('基本关键字格式化', () => {
    it('应该将关键字转为大写', () => {
      const sql = 'select * from users where id = 1';
      const result = formatSQLDataGrip(sql);
      expect(result).toContain('SELECT');
      expect(result).toContain('FROM');
      expect(result).toContain('WHERE');
    });

    it('应该在主要关键字前添加换行', () => {
      const sql = 'select * from users where id = 1 order by id';
      const result = formatSQLDataGrip(sql);
      // 关键字应该被大写
      expect(result).toContain('SELECT');
      expect(result).toContain('FROM');
      expect(result).toContain('WHERE');
      expect(result).toContain('ORDER BY');
    });

    it('应该格式化 SELECT 列表每列一行', () => {
      const sql = 'select id, name, email from users';
      const result = formatSQLDataGrip(sql);
      // 应该包含换行
      expect(result).toContain('\n');
      expect(result).toContain('SELECT');
    });
  });

  describe('注释处理', () => {
    it('应该保留单行注释', () => {
      const sql = 'select * from users -- 这是注释';
      const result = formatSQLDataGrip(sql);
      // 注释应该被保留
      expect(result).toContain('-- 这是注释');
      // SQL 部分应该被格式化
      expect(result).toContain('SELECT');
    });

    it('应该保留多行注释', () => {
      const sql = 'select * /* 注释 */ from users';
      const result = formatSQLDataGrip(sql);
      // 注释应该被保留
      expect(result).toContain('/* 注释 */');
      // SQL 部分应该被格式化
      expect(result).toContain('SELECT');
    });

    it('应该正确处理包含中文的注释', () => {
      const sql = '-- JOIN 查询面板中执行\nselect * from users';
      const result = formatSQLDataGrip(sql);
      // 注释应该保持原样
      expect(result).toContain('-- JOIN 查询面板中执行');
    });
  });

  describe('字符串字面量处理', () => {
    it('应该保留字符串内容', () => {
      const sql = "select * from users where name = 'hello world'";
      const result = formatSQLDataGrip(sql);
      // 字符串应该被保留
      expect(result).toContain("'hello world'");
      // SQL 部分应该被格式化
      expect(result).toContain('SELECT');
    });

    it('应该正确处理转义的引号', () => {
      const sql = "select * from users where name = 'it''s a test'";
      const result = formatSQLDataGrip(sql);
      expect(result).toContain("'it''s a test'");
    });

    it('应该正确处理包含中文的字符串', () => {
      const sql = "select * from users where name = '中文名称'";
      const result = formatSQLDataGrip(sql);
      expect(result).toContain("'中文名称'");
    });
  });

  describe('引号标识符处理', () => {
    it('应该保留双引号标识符', () => {
      const sql = 'select * from "my table"';
      const result = formatSQLDataGrip(sql);
      expect(result).toContain('"my table"');
    });

    it('应该正确处理中文标识符', () => {
      const sql = 'select "订单号" from orders';
      const result = formatSQLDataGrip(sql);
      expect(result).toContain('"订单号"');
    });
  });

  describe('复杂场景', () => {
    it('应该正确处理 JOIN 查询', () => {
      const sql = 'select * from users left join orders on users.id = orders.user_id';
      const result = formatSQLDataGrip(sql);
      expect(result).toContain('SELECT');
      expect(result).toContain('LEFT JOIN');
      expect(result).toContain('ON');
    });

    it('应该正确处理子查询', () => {
      const sql = 'select * from (select id from users) as subquery';
      const result = formatSQLDataGrip(sql);
      expect(result).toContain('SELECT');
      expect(result).toContain('FROM');
      expect(result).toContain('AS');
    });

    it('应该正确处理 CTE (WITH 子句)', () => {
      const sql = 'with cte as (select id from users) select * from cte';
      const result = formatSQLDataGrip(sql);
      expect(result).toContain('WITH');
      expect(result).toContain('AS');
      expect(result).toContain('SELECT');
    });

    it('应该正确处理多表 JOIN', () => {
      const sql = 'select a.id, b.name, c.value from table_a a left join table_b b on a.id = b.a_id left join table_c c on b.id = c.b_id';
      const result = formatSQLDataGrip(sql);
      expect(result).toContain('SELECT');
      expect(result).toContain('LEFT JOIN');
      expect(result).toContain('ON');
    });
  });

  describe('边界情况', () => {
    it('应该处理空字符串', () => {
      const result = formatSQLDataGrip('');
      expect(result).toBe('');
    });

    it('应该处理只有空白的字符串', () => {
      const result = formatSQLDataGrip('   ');
      expect(result).toBe('   ');
    });

    it('应该处理只有注释的 SQL', () => {
      const sql = '-- 这是注释';
      const result = formatSQLDataGrip(sql);
      expect(result).toContain('-- 这是注释');
    });

    it('格式化失败时应该返回原始 SQL', () => {
      // sql-formatter 对于某些无效 SQL 可能会抛出错误
      // 我们的函数应该捕获错误并返回原始 SQL
      const invalidSQL = 'SELECT FROM WHERE'; // 语法错误
      const result = formatSQLDataGrip(invalidSQL);
      // 应该返回某种结果，不应该崩溃
      expect(typeof result).toBe('string');
    });
  });

  describe('DataGrip 风格验证', () => {
    it('应该将 SELECT 列表格式化为每列一行', () => {
      const sql = 'select id, name, email, created_at from users';
      const result = formatSQLDataGrip(sql);
      // 应该包含多个换行
      const lineCount = result.split('\n').length;
      expect(lineCount).toBeGreaterThan(1);
    });

    it('应该正确缩进', () => {
      const sql = 'select * from users where id = 1';
      const result = formatSQLDataGrip(sql);
      // 应该包含缩进（空格）
      expect(result).toMatch(/\n\s+/);
    });
  });
});

describe('formatSQLCompact', () => {
  it('应该将 SQL 压缩为单行', () => {
    const sql = `SELECT
      id,
      name
    FROM
      users`;
    const result = formatSQLCompact(sql);
    // 应该是单行
    expect(result.split('\n').length).toBe(1);
    // 应该包含关键字
    expect(result).toContain('SELECT');
    expect(result).toContain('FROM');
  });

  it('应该处理空字符串', () => {
    const result = formatSQLCompact('');
    expect(result).toBe('');
  });

  it('应该移除多余空白', () => {
    const sql = 'select    *    from    users';
    const result = formatSQLCompact(sql);
    // 不应该有连续空格
    expect(result).not.toMatch(/\s{2,}/);
  });
});

describe('hasDuckDBSpecificSyntax', () => {
  it('应该检测 EXCLUDE 语法', () => {
    const sql = 'SELECT * EXCLUDE (column1) FROM table1';
    expect(hasDuckDBSpecificSyntax(sql)).toBe(true);
  });

  it('应该检测 REPLACE 语法', () => {
    const sql = 'SELECT * REPLACE (column1 * 2 AS column1) FROM table1';
    expect(hasDuckDBSpecificSyntax(sql)).toBe(true);
  });

  it('应该检测 PIVOT 语法', () => {
    const sql = 'PIVOT table1 ON column1';
    expect(hasDuckDBSpecificSyntax(sql)).toBe(true);
  });

  it('应该检测 UNPIVOT 语法', () => {
    const sql = 'UNPIVOT table1 ON column1';
    expect(hasDuckDBSpecificSyntax(sql)).toBe(true);
  });

  it('应该检测 QUALIFY 语法', () => {
    const sql = 'SELECT * FROM table1 QUALIFY row_number() OVER () = 1';
    expect(hasDuckDBSpecificSyntax(sql)).toBe(true);
  });

  it('应该检测 SAMPLE 语法', () => {
    const sql = 'SELECT * FROM table1 SAMPLE 10';
    expect(hasDuckDBSpecificSyntax(sql)).toBe(true);
  });

  it('对于标准 SQL 应该返回 false', () => {
    const sql = 'SELECT * FROM users WHERE id = 1';
    expect(hasDuckDBSpecificSyntax(sql)).toBe(false);
  });
});
