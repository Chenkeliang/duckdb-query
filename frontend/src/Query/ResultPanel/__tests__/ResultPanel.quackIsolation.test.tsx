/** Regression 2026-11-03: remote result actions must retain their source and avoid local-schema AI repair. */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResultPanelProps } from '../ResultPanel';
import { ResultPanel } from '../ResultPanel';

const api = vi.hoisted(() => ({ runAgent: vi.fn() }));
vi.mock('@/api', async importOriginal => ({ ...await importOriginal<typeof import('@/api')>(), runAgent: api.runAgent }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | { name?: string }) => typeof options === 'string' ? options : options?.name ? `${key} ${options.name}` : key,
    i18n: { language: 'zh' },
  }),
}));
vi.mock('@/hooks/useAiEnabled', () => ({ useAiEnabled: () => true }));
vi.mock('@/demo/isDemo', () => ({ IS_DEMO: false }));
vi.mock('@/Query/components/EngineCompatSelfHealBanner', () => ({ EngineCompatSelfHealBanner: () => <button>repair local engine</button> }));
vi.mock('../DataGridWrapper', () => ({ DataGridWrapper: React.forwardRef(() => <div />) }));
vi.mock('../ResultTabGridPane', () => ({ ResultTabGridPane: () => <div /> }));
vi.mock('../hooks/useDataGridColumns', () => ({ useDataGridColumns: () => ({ columns: [] }) }));
vi.mock('../ResultToolbar', () => ({ ResultToolbar: ({ onImportToDuckDB }: { onImportToDuckDB?: () => void }) => <button onClick={onImportToDuckDB}>save result</button> }));
vi.mock('@/Query/AsyncTasks/AsyncTaskDialog', () => ({ AsyncTaskDialog: ({ open, sql, quackServiceId }: { open: boolean; sql: string; quackServiceId?: string }) => open ? <output data-testid="save-target" data-service={quackServiceId}>{sql}</output> : null }));

function mount(initial: ResultPanelProps) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (props: ResultPanelProps) => <QueryClientProvider client={client}><ResultPanel {...props} /></QueryClientProvider>;
  const result = render(view(initial));
  return { ...result, replace: (props: ResultPanelProps) => result.rerender(view(props)) };
}

const remote = (id: string) => ({ type: 'quack' as const, connectionId: id, connectionName: `Remote ${id}` });
const failure = new Error('Column not found');

beforeEach(() => {
  vi.clearAllMocks();
  api.runAgent.mockResolvedValue({ result: { explanation: 'Local repair explanation', fixed_sql: null, safe: true } });
});

describe('Quack result source isolation', () => {
  it('never offers local engine repair for remote failures', () => {
    mount({ data: null, error: failure, currentSQL: 'SELECT 1', source: remote('a'), selfHealErrorMessage: 'engine error', onSelfHealRerun: vi.fn() });
    expect(screen.queryByRole('button', { name: 'repair local engine' })).not.toBeInTheDocument();
  });
  it('hides local-schema AI repair for remote errors even when AI is enabled', () => {
    mount({ data: null, error: failure, currentSQL: 'SELECT missing FROM orders', source: remote('a') });
    expect(screen.queryByRole('button', { name: 'AI 解释并修复' })).not.toBeInTheDocument();
    expect(api.runAgent).not.toHaveBeenCalled();
    expect(screen.queryByText('quack.executionTarget Remote a')).not.toBeInTheDocument();
  });

  it('preserves local AI repair but hides its stale details when showing a remote error', async () => {
    const props = { data: null, error: failure, currentSQL: 'SELECT missing FROM orders', source: { type: 'duckdb' as const } };
    const view = mount(props);
    fireEvent.click(screen.getByRole('button', { name: 'AI 解释并修复' }));
    await screen.findByText('Local repair explanation');
    expect(api.runAgent).toHaveBeenCalledWith(expect.objectContaining({ mode: 'repair_sql' }));
    view.replace({ ...props, source: remote('a') });
    expect(screen.queryByRole('button', { name: 'AI 解释并修复' })).not.toBeInTheDocument();
    expect(screen.queryByText('Local repair explanation')).not.toBeInTheDocument();
    expect(api.runAgent).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('captures save SQL and service across incoming results (retain=%s)', async retainQueryResults => {
    const panel = (id: string): ResultPanelProps => {
      const sql = `SELECT * FROM orders_${id} LIMIT 10`;
      const baseSql = `SELECT * FROM orders_${id}`;
      const source = remote(id);
      return {
        data: [{ amount: 1 }], columns: ['amount'], currentSQL: sql, currentBaseSQL: baseSql, source,
        retainQueryResults, activeResultTabId: id,
        resultTabs: [{ id, label: id, query: { sql, baseSql, source }, result: { data: [{ amount: 1 }], columns: ['amount'], loading: false, error: null } }],
      };
    };
    const view = mount(panel('a'));
    fireEvent.click(screen.getByRole('button', { name: 'save result' }));
    expect(screen.getByTestId('save-target')).toHaveAttribute('data-service', 'a');
    view.replace(panel('b'));
    await waitFor(() => expect(screen.getByTestId('save-target')).toHaveAttribute('data-service', 'a'));
    expect(screen.getByTestId('save-target')).toHaveTextContent('SELECT * FROM orders_a');
    expect(screen.getByTestId('save-target')).not.toHaveTextContent('LIMIT');
    expect(screen.queryByText('quack.executionTarget Remote b')).not.toBeInTheDocument();
  });
});
