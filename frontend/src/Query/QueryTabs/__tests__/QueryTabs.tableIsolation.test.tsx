/** Regression 2026-07-28: changing the query-mode tab cleared the kept-alive JOIN workspace. */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SelectedTable } from '@/types/SelectedTable';
import { QueryTabs } from '../index';

const panelProps = vi.hoisted(() => ({
  joinTables: undefined as SelectedTable[] | undefined,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: 'zh' },
  }),
}));
vi.mock('../../SQLQuery', () => ({ SQLQueryPanel: () => null }));
vi.mock('../../JoinQuery', () => ({
  JoinQueryPanel: ({ selectedTables }: { selectedTables: SelectedTable[] }) => {
    panelProps.joinTables = selectedTables;
    return null;
  },
}));
vi.mock('../../SetOperations', () => ({ SetOperationsPanel: () => null }));
vi.mock('../../PivotTable/PivotPanel', () => ({ PivotPanel: () => null }));
vi.mock('../../History/GlobalHistoryPanel', () => ({ GlobalHistoryPanel: () => null }));
vi.mock('../../Bookmarks/SavedQueriesPanel', () => ({ SavedQueriesPanel: () => null }));
vi.mock('../../components/SQLPreview', () => ({ SQLPreview: () => null }));
vi.mock('../../hooks/useGlobalHistory', () => ({
  useGlobalHistory: () => ({
    history: [],
    addToHistory: vi.fn(),
    deleteHistoryItem: vi.fn(),
    clearHistory: vi.fn(),
  }),
}));
vi.mock('../../hooks/useSavedQueries', () => ({ useSavedQueries: () => ({ favorites: [] }) }));
vi.mock('@/hooks/useDatabaseConnections', () => ({
  useDatabaseConnections: () => ({ connections: [] }),
}));
vi.mock('@/hooks/useAiStatus', () => ({ useAiStatus: () => ({ configured: false }) }));
vi.mock('@/hooks/useFederatedQueryDetection', () => ({
  useFederatedQueryDetection: () => ({ attachDatabases: [] }),
}));

const joinTables: SelectedTable[] = [{ name: 'orders', source: 'duckdb' }];
const sqlTables: SelectedTable[] = [{ name: 'customers', source: 'duckdb' }];
const selectedTablesByTab: Record<string, SelectedTable[]> = {
  sql: sqlTables,
  join: joinTables,
  set: [],
  pivot: [],
};

describe('QueryTabs table isolation', () => {
  it('keeps JOIN tables when another query-mode tab becomes active', () => {
    const commonProps = {
      selectedTablesByTab,
      onTabChange: vi.fn(),
      onExecute: vi.fn(async () => undefined),
    };
    const { rerender } = render(<QueryTabs {...commonProps} activeTab="join" />);

    expect(panelProps.joinTables).toEqual(joinTables);

    rerender(<QueryTabs {...commonProps} activeTab="sql" />);

    expect(panelProps.joinTables).toEqual(joinTables);
  });
});
