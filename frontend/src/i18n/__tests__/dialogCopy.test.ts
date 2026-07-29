/**
 * Regression 2026-07-29: dialog copy must describe actual behavior without
 * repeating visible controls or implying unsupported LIMIT-source detection.
 */
import { describe, expect, it } from 'vitest';

import en from '../locales/en/common.json';
import zh from '../locales/zh/common.json';

describe('dialog copy contract', () => {
  it('uses precise compact Chinese wording', () => {
    expect(zh.query.import).toMatchObject({
      title: '保存为 DuckDB 表',
      tableNameHint: '字母或 _ 开头；仅限字母、数字、_；最多 64 字符',
      rowLimitFull: '不限结果行数：移除 SQL 最外层 LIMIT，保留子查询 LIMIT',
      rowLimitLimited: '限制结果行数：保留 SQL 最外层 LIMIT；未设置时限制为 10,000 行',
      import: '保存',
    });
    expect(zh.async.dialog).toMatchObject({
      description: '后台执行 · 结果保存为 DuckDB 表',
      tableNameHint: '字母或 _ 开头；仅限字母、数字、_；最多 64 字符',
      rowLimitFull: '不限结果行数：移除 SQL 最外层 LIMIT，保留子查询 LIMIT',
      rowLimitLimited: '限制结果行数：保留 SQL 最外层 LIMIT；未设置时限制为 10,000 行',
    });
    expect(zh.query.typeConflict).toMatchObject({
      description: '为左右字段选择同一类型后再关联',
      tryCastWarning: 'TRY_CAST 失败会得到 NULL，该 JOIN 条件不会匹配。',
    });
    expect(zh.page.datasource.excelSheet.conflictModeReplace).toBe(
      '覆盖同名表（原表及数据将被替换）'
    );
    expect(zh.async.download.parquetDescription).toBe('列式格式，适合分析工具');
  });

  it('keeps the English copy behaviorally equivalent', () => {
    expect(en.query.import).toMatchObject({
      title: 'Save as DuckDB table',
      rowLimitFull: 'No result limit: remove the outermost SQL LIMIT; keep subquery LIMITs',
      rowLimitLimited: 'Limit results: keep the outermost SQL LIMIT; use 10,000 rows when absent',
      import: 'Save',
    });
    expect(en.query.typeConflict.tryCastWarning).toBe(
      'A failed TRY_CAST returns NULL, so that JOIN condition will not match.'
    );
  });
});
