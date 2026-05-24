import { describe, expect, it } from 'vitest';
import {
  appendJoinWorkspaceToSql,
  buildJoinWorkspaceSnapshot,
  decodeJoinWorkspaceSnapshot,
  encodeJoinWorkspaceSnapshot,
  extractJoinWorkspaceFromSql,
} from '../joinWorkspaceSnapshot';
import { createEmptyGroup } from '../FilterBar';

describe('joinWorkspaceSnapshot', () => {
  const sampleSnapshot = buildJoinWorkspaceSnapshot({
    activeTables: [{ name: 'orders', source: 'duckdb' }],
    tableOrder: ['orders'],
    tableAliasOverrides: { orders: 'o' },
    joinConfigs: [],
    selectedColumns: { orders: ['id'] },
    filterTree: createEmptyGroup(),
  });

  it('round-trips encode/decode', () => {
    const encoded = encodeJoinWorkspaceSnapshot(sampleSnapshot);
    const decoded = decodeJoinWorkspaceSnapshot(encoded);
    expect(decoded?.tableAliasOverrides).toEqual({ orders: 'o' });
    expect(decoded?.tables[0]?.name).toBe('orders');
  });

  it('embeds and extracts from SQL', () => {
    const sql = 'SELECT * FROM "t1"';
    const withMeta = appendJoinWorkspaceToSql(sql, sampleSnapshot);
    const { sql: clean, snapshot } = extractJoinWorkspaceFromSql(withMeta);
    expect(clean).toBe(sql);
    expect(snapshot?.tableAliasOverrides.orders).toBe('o');
  });
});
