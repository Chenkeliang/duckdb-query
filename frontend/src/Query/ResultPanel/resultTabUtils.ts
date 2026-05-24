import type { ResultTabEntry } from '@/types/queryWorkspace';
import { parseSQLTableReferences } from '@/utils/sqlUtils';

export const MAX_RESULT_TABS = 20;

export type { ResultTabEntry };

/** 关闭保留模式下单槽标题：单表用表名，多表/联邦用限定名拼接 */
export function deriveSingleResultSlotLabel(sql: string): string {
  const refs = parseSQLTableReferences(sql);
  if (refs.length === 0) {
    return '';
  }
  if (refs.length === 1) {
    return refs[0].tableName;
  }
  return refs.map((r) => r.fullName).join(' + ');
}

export function appendResultTab(
  tabs: ResultTabEntry[],
  entry: ResultTabEntry
): ResultTabEntry[] {
  const next = [...tabs, entry];
  if (next.length <= MAX_RESULT_TABS) {
    return next;
  }
  return next.slice(next.length - MAX_RESULT_TABS);
}

export function closeResultTab(
  tabs: ResultTabEntry[],
  tabId: string
): ResultTabEntry[] {
  return tabs.filter((t) => t.id !== tabId);
}

export function closeOtherResultTabs(
  tabs: ResultTabEntry[],
  tabId: string
): ResultTabEntry[] {
  return tabs.filter((t) => t.id === tabId);
}

export function closeResultTabsToLeft(
  tabs: ResultTabEntry[],
  tabId: string
): ResultTabEntry[] {
  const index = tabs.findIndex((t) => t.id === tabId);
  if (index <= 0) return tabs;
  return tabs.slice(index);
}

export function closeResultTabsToRight(
  tabs: ResultTabEntry[],
  tabId: string
): ResultTabEntry[] {
  const index = tabs.findIndex((t) => t.id === tabId);
  if (index < 0 || index >= tabs.length - 1) return tabs;
  return tabs.slice(0, index + 1);
}

/** 关闭当前 Tab 后应激活的 Tab id（优先右侧，否则左侧） */
export function pickAdjacentActiveTabId(
  tabs: ResultTabEntry[],
  closedId: string
): string | null {
  const index = tabs.findIndex((t) => t.id === closedId);
  if (index < 0) return tabs[tabs.length - 1]?.id ?? null;
  const remaining = tabs.filter((t) => t.id !== closedId);
  if (remaining.length === 0) return null;
  if (index < tabs.length - 1) {
    return tabs[index + 1].id;
  }
  return remaining[remaining.length - 1].id;
}
