/**
 * JOIN 工作台状态快照：收藏 / 历史恢复（含表 AS 别名）
 */

import type { SelectedTable, SelectedTableObject } from '@/types/SelectedTable';
import { normalizeSelectedTable } from '@/utils/tableUtils';
import type { FilterGroup } from './FilterBar/types';
import type { JoinPanelJoinConfig } from './buildJoinQueryPayload';
import { createEmptyGroup } from './FilterBar';

export const JOIN_WORKSPACE_MARKER = '-- duckquery-join-workspace:v1:';

export interface JoinWorkspaceSnapshot {
  version: 1;
  tables: SelectedTableObject[];
  tableOrder: string[];
  tableAliasOverrides: Record<string, string>;
  joinConfigs: JoinPanelJoinConfig[];
  selectedColumns: Record<string, string[]>;
  filterTree: FilterGroup;
}

export interface JoinWorkspacePersistence {
  getSnapshot: () => JoinWorkspaceSnapshot;
}

export function buildJoinWorkspaceSnapshot(params: {
  activeTables: SelectedTable[];
  tableOrder: string[];
  tableAliasOverrides: Record<string, string>;
  joinConfigs: JoinPanelJoinConfig[];
  selectedColumns: Record<string, string[]>;
  filterTree: FilterGroup;
}): JoinWorkspaceSnapshot {
  const tables = params.activeTables.map((t) => normalizeSelectedTable(t));
  return {
    version: 1,
    tables,
    tableOrder: [...params.tableOrder],
    tableAliasOverrides: { ...params.tableAliasOverrides },
    joinConfigs: params.joinConfigs.map((c) => ({
      joinType: c.joinType,
      conditions: c.conditions.map((cond) => ({ ...cond })),
    })),
    selectedColumns: { ...params.selectedColumns },
    filterTree: params.filterTree,
  };
}

export function encodeJoinWorkspaceSnapshot(snapshot: JoinWorkspaceSnapshot): string {
  const json = JSON.stringify(snapshot);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeJoinWorkspaceSnapshot(encoded: string): JoinWorkspaceSnapshot | null {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const base64 = padded + '='.repeat(padLen);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as JoinWorkspaceSnapshot;
    if (parsed?.version !== 1 || !Array.isArray(parsed.tables)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function appendJoinWorkspaceToSql(sql: string, snapshot: JoinWorkspaceSnapshot): string {
  const trimmed = sql.trimEnd();
  const payload = encodeJoinWorkspaceSnapshot(snapshot);
  const line = `${JOIN_WORKSPACE_MARKER}${payload}`;
  return trimmed ? `${trimmed}\n${line}` : line;
}

export function extractJoinWorkspaceFromSql(sql: string): {
  sql: string;
  snapshot: JoinWorkspaceSnapshot | null;
} {
  const lines = sql.split('\n');
  let snapshot: JoinWorkspaceSnapshot | null = null;
  const kept: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(JOIN_WORKSPACE_MARKER)) {
      const encoded = trimmed.slice(JOIN_WORKSPACE_MARKER.length);
      snapshot = decodeJoinWorkspaceSnapshot(encoded);
      continue;
    }
    kept.push(line);
  }

  return {
    sql: kept.join('\n').trimEnd(),
    snapshot,
  };
}

export function applyJoinWorkspaceSnapshot(
  snapshot: JoinWorkspaceSnapshot,
  setters: {
    setTableOrder: (order: string[]) => void;
    setTableAliasOverrides: (v: Record<string, string>) => void;
    setJoinConfigs: (configs: JoinPanelJoinConfig[]) => void;
    setSelectedColumns: (cols: Record<string, string[]>) => void;
    setFilterTree: (tree: FilterGroup) => void;
  }
): void {
  setters.setTableOrder(snapshot.tableOrder ?? []);
  setters.setTableAliasOverrides({ ...snapshot.tableAliasOverrides });
  setters.setJoinConfigs(snapshot.joinConfigs ?? []);
  setters.setSelectedColumns({ ...snapshot.selectedColumns });
  setters.setFilterTree(snapshot.filterTree ?? createEmptyGroup());
}
