/**
 * Regression 2026-07: page queries keep a visible system preview LIMIT while
 * retaining the limit-free business SQL for full async/export/persistence paths.
 */
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: 'zh' },
  }),
}));

vi.mock('@/hooks/useDuckDBTables', () => ({
  useDuckDBTables: () => ({ tables: [] }),
}));
vi.mock('@/hooks/useSchemaTables', () => ({
  useSchemaTables: () => ({ tables: [] }),
}));
vi.mock('@/hooks/useAppConfig', () => ({
  useAppConfig: () => ({ maxQueryRows: 10_000 }),
}));
vi.mock('@/hooks/useSqlColumnAutocomplete', () => ({
  useSqlColumnAutocomplete: () => ({ columnMap: {}, flatColumnNames: [] }),
}));
vi.mock('@/hooks/useEnhancedAutocomplete', () => ({
  useEnhancedAutocomplete: () => ({ tableNames: [] }),
}));
vi.mock('@/hooks/useFederatedQueryDetection', () => ({
  useFederatedQueryDetection: () => ({
    attachDatabases: [],
    unrecognizedPrefixes: [],
    requiresFederatedQuery: false,
    tableSource: { type: 'duckdb' },
    addManualDatabase: vi.fn(),
    removeManualDatabase: vi.fn(),
    availableConnections: [],
  }),
}));
vi.mock('@/Query/hooks/useGlobalHistory', () => ({
  useGlobalHistory: () => ({ addToHistory: vi.fn() }),
}));
vi.mock('@/hooks/useAiStatus', () => ({
  useAiStatus: () => ({ enabled: false, configured: false }),
}));

vi.mock('../SQLToolbar', () => ({
  SQLToolbar: ({
    onExecute,
    onCancel,
    onAsyncExecute,
    onFormat,
    onSave,
    isExecuting,
  }: {
    onExecute: () => void;
    onCancel?: () => void;
    onAsyncExecute: () => void;
    onFormat: () => void;
    onSave: () => void;
    isExecuting?: boolean;
  }) => (
    <>
      <button type="button" onClick={onExecute}>execute</button>
      {isExecuting && onCancel && (
        <button type="button" onClick={onCancel}>cancel</button>
      )}
      <button type="button" onClick={onAsyncExecute}>async</button>
      <button type="button" onClick={onFormat}>format</button>
      <button type="button" onClick={onSave}>save</button>
    </>
  ),
}));
vi.mock('../SQLEditor', () => ({
  SQLEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <>
      <div data-testid="sql-value">{value}</div>
      <textarea
        aria-label="sql-editor"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </>
  ),
}));
vi.mock('../ai/AiChatDrawer', () => ({
  AiChatDrawer: () => null,
  ChatToggleButton: () => null,
}));
vi.mock('@/Query/components/AttachedDatabasesIndicator', () => ({
  AttachedDatabasesIndicator: () => null,
}));
vi.mock('@/Query/components/FederatedQueryStatusBar', () => ({
  FederatedQueryStatusBar: () => null,
}));
vi.mock('@/Query/components/UnrecognizedPrefixWarning', () => ({
  UnrecognizedPrefixWarning: () => null,
}));
vi.mock('@/Query/AsyncTasks/AsyncTaskDialog', () => ({
  AsyncTaskDialog: ({ open, sql }: { open: boolean; sql: string }) =>
    open ? <div data-testid="async-sql">{sql}</div> : null,
}));
vi.mock('@/Query/Bookmarks/SaveQueryDialog', () => ({
  SaveQueryDialog: ({ open, sql }: { open: boolean; sql: string }) =>
    open ? <div data-testid="save-sql">{sql}</div> : null,
}));

import { SQLQueryPanel } from '../SQLQueryPanel';

type ExecuteArgs = Parameters<NonNullable<React.ComponentProps<typeof SQLQueryPanel>['onExecute']>>;

function createExecuteMock() {
  return vi.fn(async (..._args: ExecuteArgs): Promise<void> => undefined);
}

function renderPanel(props: React.ComponentProps<typeof SQLQueryPanel>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SQLQueryPanel {...props} />
    </QueryClientProvider>
  );
}

describe('SQLQueryPanel page limit semantics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes the workspace cancel action while a query is running', async () => {
    let finishExecute: (() => void) | undefined;
    const onExecute = vi.fn(
      () => new Promise<void>((resolve) => { finishExecute = resolve; })
    );
    const onCancel = vi.fn();
    renderPanel({ initialSQL: 'SELECT * FROM orders', onExecute, onCancel });

    fireEvent.click(screen.getByRole('button', { name: 'execute' }));
    fireEvent.click(await screen.findByRole('button', { name: 'cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
    finishExecute?.();
  });

  it.each([5_000, 12_000])('preserves a user LIMIT %i', async (limit) => {
    const onExecute = createExecuteMock();
    renderPanel({ initialSQL: `SELECT * FROM orders LIMIT ${limit}`, onExecute });

    fireEvent.click(screen.getByRole('button', { name: 'execute' }));

    await waitFor(() => expect(onExecute).toHaveBeenCalled());
    expect(onExecute.mock.calls[0][0]).toBe(`SELECT * FROM orders LIMIT ${limit}`);
    expect(onExecute.mock.calls[0][2]).toEqual({
      baseSql: `SELECT * FROM orders LIMIT ${limit}`,
    });
  });

  it('adds a visible preview LIMIT but retains limit-free baseSql', async () => {
    const onExecute = createExecuteMock();
    renderPanel({ initialSQL: 'SELECT * FROM orders', onExecute });

    fireEvent.click(screen.getByRole('button', { name: 'execute' }));

    await waitFor(() => expect(onExecute).toHaveBeenCalled());
    expect(onExecute.mock.calls[0][0]).toBe('SELECT * FROM orders LIMIT 10000');
    expect(onExecute.mock.calls[0][2]).toEqual({ baseSql: 'SELECT * FROM orders' });
    expect(screen.getByTestId('sql-value')).toHaveTextContent(
      'SELECT * FROM orders LIMIT 10000'
    );

    fireEvent.click(screen.getByRole('button', { name: 'execute' }));
    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(2));
    expect(onExecute.mock.calls[1][2]).toEqual({ baseSql: 'SELECT * FROM orders' });
  });

  /** Regression 2026-07-28: editing filters after a preview made the system LIMIT permanent. */
  it('retains system LIMIT provenance while editing the business SQL', async () => {
    const onExecute = createExecuteMock();
    renderPanel({ initialSQL: 'SELECT * FROM orders', onExecute });

    fireEvent.click(screen.getByRole('button', { name: 'execute' }));
    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByRole('textbox', { name: 'sql-editor' }), {
      target: {
        value: "SELECT * FROM orders WHERE status = 'paid' LIMIT 10000",
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'execute' }));

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(2));
    expect(onExecute.mock.calls[1][0]).toBe(
      "SELECT * FROM orders WHERE status = 'paid' LIMIT 10000"
    );
    expect(onExecute.mock.calls[1][2]).toEqual({
      baseSql: "SELECT * FROM orders WHERE status = 'paid'",
    });
  });

  it('keeps selected-table LIMIT visible and sends the unbounded baseSql', async () => {
    const onExecute = createExecuteMock();
    renderPanel({
      selectedTables: [{ name: 'orders', source: 'duckdb' } as never],
      onExecute,
    });

    await waitFor(() => expect(screen.getByTestId('sql-value')).toHaveTextContent('orders'));
    expect(screen.getByTestId('sql-value')).toHaveTextContent('LIMIT 10000');

    fireEvent.click(screen.getByRole('button', { name: 'execute' }));
    await waitFor(() => expect(onExecute).toHaveBeenCalled());
    expect(onExecute.mock.calls[0][2]).toEqual({ baseSql: 'SELECT * FROM orders' });
  });

  it('treats an edited system LIMIT as a user LIMIT', async () => {
    const onExecute = createExecuteMock();
    renderPanel({ initialSQL: 'SELECT * FROM orders', onExecute });

    fireEvent.click(screen.getByRole('button', { name: 'execute' }));
    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByRole('textbox', { name: 'sql-editor' }), {
      target: { value: 'SELECT * FROM orders LIMIT 12000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'execute' }));

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(2));
    expect(onExecute.mock.calls[1][0]).toBe('SELECT * FROM orders LIMIT 12000');
    expect(onExecute.mock.calls[1][2]).toEqual({
      baseSql: 'SELECT * FROM orders LIMIT 12000',
    });
  });

  it('adds the system LIMIT outside a subquery and before trailing comments', async () => {
    const onExecute = createExecuteMock();
    const baseSql = 'SELECT * FROM (SELECT * FROM orders LIMIT 5); -- note';
    renderPanel({ initialSQL: baseSql, onExecute });

    fireEvent.click(screen.getByRole('button', { name: 'execute' }));

    await waitFor(() => expect(onExecute).toHaveBeenCalled());
    expect(onExecute.mock.calls[0][0]).toBe(
      'SELECT * FROM (SELECT * FROM orders LIMIT 5) LIMIT 10000; -- note'
    );
    expect(onExecute.mock.calls[0][2]).toEqual({ baseSql });
  });

  it('does not append a LIMIT to a data-changing WITH statement', async () => {
    const onExecute = createExecuteMock();
    const sql = 'WITH doomed AS (SELECT id FROM orders) DELETE FROM orders USING doomed WHERE orders.id = doomed.id';
    renderPanel({ initialSQL: sql, onExecute });

    fireEvent.click(screen.getByRole('button', { name: 'execute' }));

    await waitFor(() => expect(onExecute).toHaveBeenCalled());
    expect(onExecute.mock.calls[0][0]).toBe(sql);
    expect(onExecute.mock.calls[0][2]).toEqual({ baseSql: sql });
  });

  it('uses limit-free SQL for async execution and bookmarks', async () => {
    renderPanel({
      selectedTables: [{ name: 'orders', source: 'duckdb' } as never],
      onExecute: createExecuteMock(),
    });
    await waitFor(() => expect(screen.getByTestId('sql-value')).toHaveTextContent('LIMIT 10000'));

    fireEvent.click(screen.getByRole('button', { name: 'async' }));
    expect(screen.getByTestId('async-sql')).toHaveTextContent('SELECT * FROM orders');
    expect(screen.getByTestId('async-sql')).not.toHaveTextContent('LIMIT 10000');

    fireEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(screen.getByTestId('save-sql')).toHaveTextContent('SELECT * FROM orders');
    expect(screen.getByTestId('save-sql')).not.toHaveTextContent('LIMIT 10000');
  });

  it('keeps the system LIMIT out of business SQL after formatting', async () => {
    renderPanel({
      selectedTables: [{ name: 'orders', source: 'duckdb' } as never],
      onExecute: createExecuteMock(),
    });
    await waitFor(() => expect(screen.getByTestId('sql-value')).toHaveTextContent('LIMIT 10000'));

    fireEvent.click(screen.getByRole('button', { name: 'format' }));
    fireEvent.click(screen.getByRole('button', { name: 'async' }));

    expect(screen.getByTestId('async-sql')).not.toHaveTextContent('LIMIT');
    expect(screen.getByTestId('async-sql')).toHaveTextContent('orders');
  });
});
