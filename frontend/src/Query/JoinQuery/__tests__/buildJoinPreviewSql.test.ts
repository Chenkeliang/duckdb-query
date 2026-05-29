import { describe, it, expect } from 'vitest';

import { buildJoinPreviewSql, isJoinConditionValid } from '../JoinQueryPanel';
import { createEmptyGroup } from '../FilterBar';
import type { SelectedTable } from '@/types/SelectedTable';

const table = (name: string): SelectedTable =>
  ({ name, source: 'duckdb' }) as SelectedTable;

const baseParams = () => ({
  attachDatabases: [],
  joinTableAliasMap: {},
  selectedColumns: {} as Record<string, string[]>,
  joinConfigs: [],
  tableColumnsMap: {} as Record<string, { name: string; type: string }[]>,
  resolvedTypes: {} as Record<string, string>,
  filterTree: createEmptyGroup(),
  maxQueryRows: 1000,
  selectConditionComment: '请选择关联条件',
});

describe('isJoinConditionValid', () => {
  it('column mode requires both column names', () => {
    expect(isJoinConditionValid({ leftColumn: 'a', rightColumn: 'b', operator: '=' })).toBe(true);
    expect(isJoinConditionValid({ leftColumn: '', rightColumn: 'b', operator: '=' })).toBe(false);
  });

  it('expression mode requires trimmed expressions', () => {
    expect(
      isJoinConditionValid({
        leftColumn: '', rightColumn: '', operator: '=',
        leftMode: 'expression', leftExpression: 'a+1',
        rightMode: 'expression', rightExpression: 'b',
      })
    ).toBe(true);
    expect(
      isJoinConditionValid({
        leftColumn: '', rightColumn: '', operator: '=',
        leftMode: 'expression', leftExpression: '   ',
        rightMode: 'expression', rightExpression: 'b',
      })
    ).toBe(false);
  });
});

describe('buildJoinPreviewSql (characterization)', () => {
  it('returns null when no tables', () => {
    expect(buildJoinPreviewSql({ ...baseParams(), activeTables: [] })).toBeNull();
  });

  it('single table with selected columns', () => {
    const sql = buildJoinPreviewSql({
      ...baseParams(),
      activeTables: [table('users')],
      selectedColumns: { users: ['id', 'name'] },
    });
    expect(sql).toMatchInlineSnapshot(`
      "SELECT t1.id, t1.name
      FROM users AS t1
      LIMIT 1000"
    `);
  });

  it('two-table LEFT JOIN with a valid column condition', () => {
    const sql = buildJoinPreviewSql({
      ...baseParams(),
      activeTables: [table('users'), table('orders')],
      selectedColumns: { users: ['id'], orders: ['user_id'] },
      joinConfigs: [
        {
          joinType: 'LEFT JOIN',
          conditions: [
            { leftColumn: 'id', rightColumn: 'user_id', operator: '=', leftMode: 'column', rightMode: 'column' },
          ],
        },
      ],
    });
    expect(sql).toMatchInlineSnapshot(`
      "SELECT t1.id, t2.user_id
      FROM users AS t1
      LEFT JOIN orders AS t2 ON t1.id = t2.user_id
      LIMIT 1000"
    `);
  });

  it('two-table JOIN with no valid condition falls back to ON 1=1 + comment', () => {
    const sql = buildJoinPreviewSql({
      ...baseParams(),
      activeTables: [table('users'), table('orders')],
      joinConfigs: [
        {
          joinType: 'INNER JOIN',
          conditions: [
            { leftColumn: '', rightColumn: '', operator: '=', leftMode: 'column', rightMode: 'column' },
          ],
        },
      ],
    });
    expect(sql).toMatchInlineSnapshot(`
      "SELECT *
      FROM users AS t1
      INNER JOIN orders AS t2 ON 1=1 /* 请选择关联条件 */
      LIMIT 1000"
    `);
  });
});
