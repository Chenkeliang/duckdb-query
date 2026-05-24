import { describe, expect, it } from 'vitest';
import {
  buildJoinTableAliasMap,
  collectDuplicateAliases,
  defaultJoinTableAlias,
  isValidSqlTableAlias,
  joinQueryUsesDistinctSqlAliases,
  remapFilterTreeTableNames,
} from '../joinTableAliasUtils';
import type { FilterGroup } from '../FilterBar/types';

describe('joinTableAliasUtils', () => {
  it('defaultJoinTableAlias', () => {
    expect(defaultJoinTableAlias(0)).toBe('t1');
    expect(defaultJoinTableAlias(1)).toBe('t2');
  });

  it('isValidSqlTableAlias', () => {
    expect(isValidSqlTableAlias('t1')).toBe(true);
    expect(isValidSqlTableAlias('主表')).toBe(false);
    expect(isValidSqlTableAlias('1bad')).toBe(false);
  });

  it('buildJoinTableAliasMap applies overrides', () => {
    const map = buildJoinTableAliasMap(['orders', 'users'], { orders: 'o' });
    expect(map.orders).toBe('o');
    expect(map.users).toBe('t2');
  });

  it('joinQueryUsesDistinctSqlAliases', () => {
    const names = ['拼多多官旗qq_Sheet1', '视频号订单'];
    const map = buildJoinTableAliasMap(names, {});
    expect(joinQueryUsesDistinctSqlAliases(names, map)).toBe(true);
    expect(
      joinQueryUsesDistinctSqlAliases(['t1', 't2'], { t1: 't1', t2: 't2' })
    ).toBe(false);
  });

  it('remapFilterTreeTableNames', () => {
    const tree: FilterGroup = {
      id: 'g1',
      type: 'group',
      logic: 'AND',
      children: [
        {
          id: 'c1',
          type: 'condition',
          table: '长表名',
          column: 'status',
          operator: '=',
          value: 'ok',
          placement: 'where',
        },
      ],
    };
    const remapped = remapFilterTreeTableNames(tree, { 长表名: 't1' });
    expect(remapped.children[0]).toMatchObject({ table: 't1' });
  });

  it('collectDuplicateAliases', () => {
    expect(
      collectDuplicateAliases(['a', 'b'], { a: 'x', b: 'x' })
    ).toEqual(['x']);
  });
});
