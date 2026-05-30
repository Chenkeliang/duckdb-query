import { describe, it, expect } from 'vitest';

import {
  buildJoinPreviewSql,
  collectJoinKeyColumnsByTable,
} from '../JoinQueryPanel';
import { createEmptyGroup } from '../FilterBar';
import { extractAttachDatabases } from '@/utils/sqlUtils';
import type { SelectedTable } from '@/types/SelectedTable';
import type { FilterCondition, FilterGroup } from '../FilterBar/types';

const local = (name: string): SelectedTable =>
  ({ name, source: 'duckdb' }) as SelectedTable;

const remote = (name: string): SelectedTable =>
  ({
    name,
    source: 'external',
    connection: { id: 'sorder', name: 'sorder', type: 'mysql' },
  }) as unknown as SelectedTable;

describe('collectJoinKeyColumnsByTable', () => {
  it('collects the left-side join key for the first table', () => {
    const keys = collectJoinKeyColumnsByTable(
      [local('a'), local('b')],
      [
        {
          joinType: 'LEFT JOIN',
          conditions: [
            { leftColumn: 'order_id', rightColumn: 'order_id', operator: '=', leftMode: 'column', rightMode: 'column' },
          ],
        },
      ],
    );
    expect(keys.get('a')).toEqual(['order_id']);
    expect(keys.get('b')).toEqual(['order_id']);
  });

  it('skips expression-mode and invalid conditions', () => {
    const keys = collectJoinKeyColumnsByTable(
      [local('a'), local('b')],
      [
        {
          joinType: 'LEFT JOIN',
          conditions: [
            { leftColumn: '', rightColumn: 'x', operator: '=', leftMode: 'expression', leftExpression: 'a.id+1', rightMode: 'column' },
            { leftColumn: '', rightColumn: '', operator: '=', leftMode: 'column', rightMode: 'column' },
          ],
        },
      ],
    );
    expect(keys.get('a')).toBeUndefined();
    // 右侧 'x' 是表达式条件的右列（column 模式），应被收集
    expect(keys.get('b')).toEqual(['x']);
  });

  it('middle table in a chain collects keys from both joins', () => {
    const keys = collectJoinKeyColumnsByTable(
      [local('a'), local('b'), local('c')],
      [
        { joinType: 'LEFT JOIN', conditions: [{ leftColumn: 'ka', rightColumn: 'kb1', operator: '=', leftMode: 'column', rightMode: 'column' }] },
        { joinType: 'LEFT JOIN', conditions: [{ leftColumn: 'kb2', rightColumn: 'kc', operator: '=', leftMode: 'column', rightMode: 'column' }] },
      ],
    );
    expect(keys.get('b')).toEqual(['kb1', 'kb2']);
  });
});

describe('buildJoinPreviewSql federated pushdown keeps join keys', () => {
  it('includes the left-side join key in the first remote table subquery', () => {
    const tables = [remote('note_order_detail'), remote('note_order')];
    const attachDatabases = extractAttachDatabases(tables);

    // 仅给第一张表加 ON 过滤，触发其下推子查询（列裁剪）
    const filterTree: FilterGroup = {
      ...createEmptyGroup(),
      children: [
        {
          id: 'c1',
          type: 'condition',
          table: 'note_order_detail',
          column: 'update_time',
          operator: '>=',
          value: '2026-05-26 00:00:00',
          placement: 'on',
        } as FilterCondition,
      ],
    };

    const sql = buildJoinPreviewSql({
      activeTables: tables,
      attachDatabases,
      joinTableAliasMap: {},
      // note_order_detail 的输出列里没有 order_id（join 键）
      selectedColumns: {
        note_order_detail: ['outer_sku_id', 'title', 'num'],
        note_order: ['order_id', 'buyer_id'],
      },
      joinConfigs: [
        {
          joinType: 'LEFT JOIN',
          conditions: [
            { leftColumn: 'order_id', rightColumn: 'order_id', operator: '=', leftMode: 'column', rightMode: 'column' },
          ],
        },
      ],
      tableColumnsMap: {},
      resolvedTypes: {},
      filterTree,
      maxQueryRows: 10000,
      selectConditionComment: '请选择关联条件',
    });

    expect(sql).not.toBeNull();
    // 第一张表的下推子查询 SELECT 列表里必须含 order_id，否则外层 ON 报 Binder Error
    expect(sql!).toMatch(
      /SELECT[^()]*\border_id\b[^()]*FROM[^()]*note_order_detail/,
    );
  });
});
