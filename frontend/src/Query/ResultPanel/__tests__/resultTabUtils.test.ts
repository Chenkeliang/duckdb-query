import { describe, expect, it } from 'vitest';
import {
  appendResultTab,
  closeOtherResultTabs,
  closeResultTab,
  closeResultTabsToLeft,
  closeResultTabsToRight,
  deriveSingleResultSlotLabel,
  MAX_RESULT_TABS,
  pickAdjacentActiveTabId,
} from '../resultTabUtils';
import type { ResultTabEntry } from '@/types/queryWorkspace';

function makeTab(id: string, label: string): ResultTabEntry {
  return {
    id,
    label,
    query: { sql: 'SELECT 1', source: { type: 'duckdb' } },
    result: {
      data: [],
      columns: [],
      loading: false,
      error: null,
    },
  };
}

describe('resultTabUtils', () => {
  it('derives single slot label from SQL', () => {
    expect(deriveSingleResultSlotLabel('SELECT * FROM orders')).toBe('orders');
    expect(
      deriveSingleResultSlotLabel('SELECT * FROM mysql_db.users JOIN local_t')
    ).toContain('+');
  });

  it('evicts oldest tab when exceeding max', () => {
    const tabs = Array.from({ length: MAX_RESULT_TABS }, (_, i) =>
      makeTab(`id-${i}`, `结果_${i + 1}`)
    );
    const next = appendResultTab(tabs, makeTab('new', '结果_21'));
    expect(next).toHaveLength(MAX_RESULT_TABS);
    expect(next[0].id).toBe('id-1');
    expect(next[next.length - 1].id).toBe('new');
  });

  it('closes tabs to the right', () => {
    const tabs = [makeTab('a', '1'), makeTab('b', '2'), makeTab('c', '3')];
    const next = closeResultTabsToRight(tabs, 'b');
    expect(next.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('picks right neighbor when closing active tab', () => {
    const tabs = [makeTab('a', '1'), makeTab('b', '2'), makeTab('c', '3')];
    expect(pickAdjacentActiveTabId(tabs, 'b')).toBe('c');
    expect(pickAdjacentActiveTabId(tabs, 'c')).toBe('b');
  });

  it('close other keeps only one', () => {
    const tabs = [makeTab('a', '1'), makeTab('b', '2')];
    expect(closeOtherResultTabs(tabs, 'b').map((t) => t.id)).toEqual(['b']);
    expect(closeResultTab(tabs, 'a').map((t) => t.id)).toEqual(['b']);
    expect(closeResultTabsToLeft(tabs, 'b').map((t) => t.id)).toEqual(['b']);
  });
});
