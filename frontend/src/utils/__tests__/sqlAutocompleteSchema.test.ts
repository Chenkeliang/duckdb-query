import { describe, expect, it } from 'vitest';
import {
  matchesColumnNamePrefix,
  resolveParsedTableReference,
} from '@/utils/sqlAutocompleteSchema';
import type { ParsedTableReference } from '@/utils/sqlUtils';

describe('matchesColumnNamePrefix', () => {
  it('matches Chinese column prefix with startsWith', () => {
    expect(matchesColumnNamePrefix('产品编号', '产品')).toBe(true);
    expect(matchesColumnNamePrefix('产品名称', '产品')).toBe(true);
    expect(matchesColumnNamePrefix('订单号', '产品')).toBe(false);
  });

  it('matches ASCII case-insensitively', () => {
    expect(matchesColumnNamePrefix('UserId', 'user')).toBe(true);
  });
});

describe('resolveParsedTableReference', () => {
  const duckdb = new Set(['qqq2_Sheet1']);

  it('resolves DuckDB table from SQL when listed locally', () => {
    const ref: ParsedTableReference = {
      fullName: 'qqq2_Sheet1',
      prefix: null,
      tableName: 'qqq2_Sheet1',
      isQuoted: true,
    };
    const resolved = resolveParsedTableReference(ref, duckdb, []);
    expect(resolved).toEqual({ name: 'qqq2_Sheet1', source: 'duckdb' });
  });
});
