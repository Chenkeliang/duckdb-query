/** Regression 2026-07-28: changing the query-mode tab cleared the kept-alive JOIN workspace. */
import { useState } from 'react';
import { act, fireEvent, render, screen, within, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SelectedTable } from '@/types/SelectedTable';
import { QueryTabs } from '../index';
import { queueWorkbenchCommand, __resetWorkbenchCommands } from '../../workbenchCommands';
afterEach(() => { cleanup(); __resetWorkbenchCommands(); });

const panelProps = vi.hoisted(() => ({
  joinTables: undefined as SelectedTable[] | undefined,
  activeSqlTables: [] as SelectedTable[],
  previewNonce: undefined as number | undefined,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: 'zh' },
  }),
}));
vi.mock('../../SQLQuery', () => ({ SQLQueryPanel: ({ isActive, selectedTables, previewNonce }: { isActive: boolean; selectedTables: SelectedTable[]; previewNonce?: number }) => {
  if (isActive) panelProps.previewNonce = previewNonce;
  if (isActive) panelProps.activeSqlTables = selectedTables;
  const [draft, setDraft] = useState('');
  return <input aria-label={isActive ? 'active editor' : 'inactive editor'} value={draft} onChange={(event) => setDraft(event.target.value)} />;
} }));
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


describe('QueryTabs editor lifecycle', () => {
  const props = { selectedTablesByTab, onTabChange: vi.fn(), onExecute: vi.fn(async () => undefined) };
  it('keeps independent SQL drafts through activation and closing a sibling', () => {
    render(<QueryTabs {...props} activeTab="sql" />);
    fireEvent.change(screen.getByLabelText('active editor'), { target: { value: 'SELECT 1' } });
    act(() => queueWorkbenchCommand('newTab', 'sql'));
    expect(screen.getByLabelText('active editor')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('active editor'), { target: { value: 'SELECT 2' } });
    fireEvent.click(screen.getByRole('tab', { name: 'SQL 1' }));
    expect(screen.getByLabelText('active editor')).toHaveValue('SELECT 1');
    fireEvent.click(screen.getByRole('tab', { name: 'SQL 2' }));
    expect(screen.getByLabelText('active editor')).toHaveValue('SELECT 2');
    fireEvent.click(screen.getByRole('button', { name: '关闭 SQL 1' }));
    expect(screen.getByLabelText('active editor')).toHaveValue('SELECT 2');
  });
  it('deactivates the editor when the workspace is hidden without losing its draft', () => {
    const { rerender } = render(<QueryTabs {...props} activeTab="sql" />);
    fireEvent.change(screen.getByLabelText('active editor'), { target: { value: 'SELECT 42' } });
    rerender(<QueryTabs {...props} activeTab="sql" isWorkspaceActive={false} />);
    expect(screen.queryByLabelText('active editor')).not.toBeInTheDocument();
    expect(screen.getByLabelText('inactive editor')).toHaveValue('SELECT 42');
    rerender(<QueryTabs {...props} activeTab="sql" isWorkspaceActive />);
    expect(screen.getByLabelText('active editor')).toHaveValue('SELECT 42');
  });
  it('supports keyboard tab navigation with one active tab stop', () => {
    render(<QueryTabs {...props} activeTab="sql" />);
    act(() => queueWorkbenchCommand('newTab', 'sql'));
    fireEvent.keyDown(screen.getByRole('tab', { name: 'SQL 2' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'SQL 1' })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tablist')).getAllByRole('tab').filter(tab => tab.tabIndex === 0)).toHaveLength(1);
  });
});


it('restores per-SQL datasource context when returning from an external-table tab', () => {
  const local: SelectedTable[] = [{ name: 'local_orders', source: 'duckdb' }];
  const external: SelectedTable[] = [{ name: 'customers', source: 'external', connection: { id: 'remote-crm', name: 'CRM', type: 'postgresql' } }];
  function Workspace() {
    const [tables, setTables] = useState(local);
    return <>
      <button onClick={() => setTables(external)}>Choose remote table</button>
      <QueryTabs activeTab="sql" onTabChange={() => {}} selectedTablesByTab={{ sql: tables }} onRestoreSqlTables={setTables} onExecute={async () => {}} />
    </>;
  }
  render(<Workspace />);
  expect(panelProps.activeSqlTables).toEqual(local);
  act(() => queueWorkbenchCommand('newTab', 'sql'));
  expect(panelProps.activeSqlTables).toEqual([]);
  fireEvent.click(screen.getByText('Choose remote table'));
  expect(panelProps.activeSqlTables).toEqual(external);
  fireEvent.click(screen.getByRole('tab', { name: 'SQL 1' }));
  expect(panelProps.activeSqlTables).toEqual(local);
  fireEvent.click(screen.getByRole('tab', { name: 'SQL 2' }));
  expect(panelProps.activeSqlTables).toEqual(external);
});


it('2026-10-10: repeating an identical external preview delivers a new editor refill', () => {
  const props = { activeTab: 'sql', selectedTablesByTab, onTabChange: vi.fn(), onExecute: vi.fn(async () => undefined), previewSQL: 'SELECT 42' };
  const { rerender } = render(<QueryTabs {...props} previewNonce={1} />);
  const firstRequest = panelProps.previewNonce;
  rerender(<QueryTabs {...props} previewNonce={2} />);
  expect(panelProps.previewNonce).toBeGreaterThan(firstRequest!);
});
