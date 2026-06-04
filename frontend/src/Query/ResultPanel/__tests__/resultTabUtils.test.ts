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
  toggleResultTabPin,
} from '../resultTabUtils';
import type { ResultTabEntry } from '@/types/queryWorkspace';

function makeTab(id: string, label: string, pinned = false): ResultTabEntry {
  return {
    id,
    label,
    pinned,
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

  it('evicts oldest UNPINNED tab when exceeding max', () => {
    const tabs = Array.from({ length: MAX_RESULT_TABS }, (_, i) =>
      makeTab(`id-${i}`, `结果_${i + 1}`, i === 0)
    );
    // id-0 固定，超额时应淘汰最旧的【未固定】id-1
    const next = appendResultTab(tabs, makeTab('new', 'new'));
    expect(next).toHaveLength(MAX_RESULT_TABS);
    expect(next.some((t) => t.id === 'id-0')).toBe(true);
    expect(next.some((t) => t.id === 'id-1')).toBe(false);
    expect(next[next.length - 1].id).toBe('new');
  });

  it('keeps pinned tabs on close-others / left / right', () => {
    const tabs = [
      makeTab('a', '1', true),
      makeTab('b', '2'),
      makeTab('c', '3'),
    ];
    expect(closeOtherResultTabs(tabs, 'c').map((t) => t.id)).toEqual(['a', 'c']);
    expect(closeResultTabsToLeft(tabs, 'c').map((t) => t.id)).toEqual(['a', 'c']);
    expect(closeResultTabsToRight(tabs, 'a').map((t) => t.id)).toEqual(['a']);
  });

  it('toggles pin and moves pinned tabs to front', () => {
    const tabs = [makeTab('a', '1'), makeTab('b', '2'), makeTab('c', '3')];
    const next = toggleResultTabPin(tabs, 'c');
    expect(next.map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(next[0].pinned).toBe(true);
    // 再次切换取消固定，回到未固定组
    const back = toggleResultTabPin(next, 'c');
    expect(back.find((t) => t.id === 'c')?.pinned).toBe(false);
  });
});
