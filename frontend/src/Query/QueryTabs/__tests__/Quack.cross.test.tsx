/** Independent cross-tests 2026-11-03: real QueryTabs → SQLQueryPanel → workspace/history. */
import { createRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryTabs, type QueryTabsHandle } from '../index';
import { useQueryWorkspace, type UseQueryWorkspaceReturn } from '@/hooks/useQueryWorkspace';
import { useQueryRunner } from '@/hooks/useQueryRunner';
import { useGlobalHistory, type GlobalHistoryItem } from '@/Query/hooks/useGlobalHistory';
import { __resetWorkbenchCommands, queueWorkbenchCommand } from '@/Query/workbenchCommands';
import { AsyncTaskPanel, type AsyncTask } from '@/Query/AsyncTasks/AsyncTaskPanel';

const api = vi.hoisted(() => ({ executeDuckDBSQL: vi.fn(), executeFederatedQuery: vi.fn(), executeQuackQuery: vi.fn(), cancelSyncQuery: vi.fn(), moveQueryToBackground: vi.fn(), listAsyncTasks: vi.fn(), getBackgroundQueryResult: vi.fn(), submitAsyncQuery: vi.fn() }));
vi.mock('@/api', async original => ({ ...await original<typeof import('@/api')>(), ...api }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, fallback?: unknown) => typeof fallback === 'string' ? fallback : key, i18n: { language: 'zh' } }) }));
vi.mock('@/utils/toastHelpers', () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn(), handleApiErrorToast: vi.fn() }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock('@/utils/queryResultSettingsStorage', () => ({ loadQueryResultSettings: () => ({ retainQueryResults: true }) }));
const localTables = vi.hoisted(() => ({ tables: [] as Array<{ name: string; type: string }> }));
vi.mock('@/hooks/useDuckDBTables', () => ({ useDuckDBTables: () => ({ ...localTables, isLoading: false, isError: false }) }));
vi.mock('@/hooks/useSchemaTables', () => ({ useSchemaTables: () => ({ tables: [] }) }));
vi.mock('@/hooks/useAppConfig', () => ({ useAppConfig: () => ({ maxQueryRows: 10000 }) }));
vi.mock('@/hooks/useSqlColumnAutocomplete', () => ({ useSqlColumnAutocomplete: () => ({ columnMap: {}, flatColumnNames: [] }) }));
vi.mock('@/hooks/useEnhancedAutocomplete', () => ({ useEnhancedAutocomplete: () => ({ tableNames: [] }) }));
vi.mock('@/hooks/useDatabaseConnections', () => ({ useDatabaseConnections: () => ({ connections: [] }) }));
vi.mock('@/hooks/useAiStatus', () => ({ useAiStatus: () => ({ enabled: false, configured: false }) }));
vi.mock('@/hooks/useFederatedQueryDetection', () => ({ useFederatedQueryDetection: () => ({ attachDatabases: [], unrecognizedPrefixes: [], requiresFederatedQuery: false, tableSource: { type: 'duckdb' }, availableConnections: [], manualDatabases: [] }) }));
vi.mock('@/Query/SQLQuery/SQLEditor', () => ({ SQLEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <textarea aria-label="SQL draft" value={value} onChange={event => onChange(event.target.value)} /> }));
vi.mock('@/Query/SQLQuery/SQLToolbar', () => ({ SQLToolbar: ({ onExecute, onCancel, onAsyncExecute, isExecuting }: { onExecute: () => void; onCancel?: () => void; onAsyncExecute: () => void; isExecuting: boolean }) => <><button onClick={onExecute} disabled={isExecuting}>run-query</button><button onClick={onAsyncExecute}>save-query</button>{isExecuting && <button onClick={onCancel}>cancel-query</button>}</> }));
vi.mock('@/Query/JoinQuery', () => ({ JoinQueryPanel: () => null }));
vi.mock('@/Query/SetOperations', () => ({ SetOperationsPanel: () => null }));
vi.mock('@/Query/PivotTable/PivotPanel', () => ({ PivotPanel: () => null }));
vi.mock('@/Query/Insights/InsightsPanel', () => ({ InsightsPanel: () => null }));
vi.mock('@/Query/SQLQuery/ai/AiChatDrawer', () => ({ AiChatDrawer: () => null, ChatToggleButton: () => null }));
const previewState = vi.hoisted(() => ({ open: false }));
vi.mock('@/Query/components/SQLPreview', () => ({ SQLPreview: ({ open }: { open: boolean }) => { previewState.open = open; return null; } }));
vi.mock('@/components/SQLHighlight', () => ({ SQLHighlight: ({ sql }: { sql: string }) => <pre>{sql}</pre> }));
vi.mock('@/Query/Bookmarks/SaveQueryDialog', () => ({ SaveQueryDialog: () => null }));
vi.mock('@/Query/components/FederationChip', () => ({ FederationChip: () => null }));

let workspace: UseQueryWorkspaceReturn;
let history: GlobalHistoryItem[];
const service = (id: string) => ({ id, name: `Service ${id}` });
const ok = (v: string) => ({ data: [{ v }], columns: ['v'], row_count: 1 });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tabs = createRef<QueryTabsHandle>();
  function Harness() {
    const runner = useQueryRunner();
    workspace = runner;
    history = useGlobalHistory().history;
    return <><button onClick={() => void runner.moveToBackground()}>adopt-query</button><QueryTabs ref={tabs} activeTab={workspace.currentTab} onTabChange={workspace.handleTabChange}
      selectedTablesByTab={workspace.selectedTables} onRestoreSqlTables={workspace.restoreSqlTables}
      onExecute={runner.execute} onCancel={() => void runner.cancel()} /></>;
  }
  render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
  return { tabs, client };
}
function activePanel() {
  const id = screen.getAllByRole('tab').find(tab => tab.getAttribute('aria-selected') === 'true')!.getAttribute('aria-controls')!;
  return within(document.getElementById(id)!);
}
function run() { fireEvent.click(activePanel().getByRole('button', { name: 'run-query' })); }
function draft() { return activePanel().getByLabelText('SQL draft'); }
async function idle() { await waitFor(() => expect(activePanel().getByRole('button', { name: 'run-query' })).toBeEnabled()); }
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); __resetWorkbenchCommands(); localTables.tables = [];
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
  vi.stubGlobal('XMLHttpRequest', class { constructor() { throw new Error('Unexpected XHR'); } });
  api.executeQuackQuery.mockImplementation(async (id: string) => ok(id));
  api.executeDuckDBSQL.mockResolvedValue(ok('local'));
  api.cancelSyncQuery.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); __resetWorkbenchCommands(); vi.unstubAllGlobals(); });

describe('Quack cross-layer frontend integration', () => {
  /** 2026-11-03: repeated Quack table previews created duplicate tabs unlike local previews. */
  it('reuses an identical remote preview without executing or changing its disclosure state', () => {
    const { tabs } = setup();
    const sql = 'SELECT * FROM memory.main.orders LIMIT 100;';
    act(() => tabs.current!.openQuackQuery(service('A'), sql));
    fireEvent.click(screen.getByRole('tab', { name: 'SQL 1' }));
    act(() => tabs.current!.openQuackQuery(service('A'), sql));
    expect(screen.getAllByRole('tab')).toHaveLength(6);
    expect(screen.getByRole('tab', { name: 'Service A · SQL 2' })).toHaveAttribute('aria-selected', 'true');
    expect(draft()).toHaveValue(sql);
    expect(previewState.open).toBe(false);
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
  });

  /** 2026-11-03: reuse must compare current drafts so edited SQL is never overwritten. */
  it('keeps an edited remote draft and opens a separate table preview', () => {
    const { tabs } = setup();
    const sql = 'SELECT * FROM memory.main.orders LIMIT 100;';
    act(() => tabs.current!.openQuackQuery(service('A'), sql));
    fireEvent.change(draft(), { target: { value: 'SELECT edited_remote_draft' } });
    act(() => tabs.current!.openQuackQuery(service('A'), sql));
    expect(draft()).toHaveValue(sql);
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    fireEvent.click(screen.getByRole('tab', { name: 'Service A · SQL 2' }));
    expect(draft()).toHaveValue('SELECT edited_remote_draft');
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
  });

  /** 2026-11-03: identical SQL and display names must not merge different services. */
  it('keeps same-named services separate while refocusing only the matching service', async () => {
    const { tabs } = setup();
    const sql = 'SELECT * FROM orders';
    act(() => tabs.current!.openQuackQuery({ id: 'A', name: 'Same name' }, sql));
    act(() => tabs.current!.openQuackQuery({ id: 'B', name: 'Same name' }, sql));
    act(() => tabs.current!.openQuackQuery({ id: 'A', name: 'Same name' }, sql));
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    expect(screen.getByRole('tab', { name: 'Same name · SQL 2' })).toHaveAttribute('aria-selected', 'true');
    run(); await idle();
    expect(api.executeQuackQuery.mock.calls[0][0]).toBe('A');
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
  });

  /** 2026-11-03: the explicit new-query action must still create independent empty drafts. */
  it('keeps explicit empty remote queries as independent tabs', () => {
    const { tabs } = setup();
    act(() => tabs.current!.openQuackQuery(service('A')));
    act(() => tabs.current!.openQuackQuery(service('A')));
    expect(screen.getAllByRole('tab')).toHaveLength(7);
    expect(draft()).toHaveValue('');
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
  });

  /** 2026-11-03: a legacy row's preview command must never overwrite a remote draft or execute. */
  it('repeated table-preview commands refill a local editor while preserving the remote target and draft', async () => {
    const { tabs } = setup();
    act(() => tabs.current!.openQuackQuery(service('A'), 'SELECT remote_value FROM remote_orders'));
    const sql = 'SELECT * FROM local_orders LIMIT 100;';
    act(() => queueWorkbenchCommand('openTableQuery', sql));
    expect(previewState.open).toBe(false);
    expect(screen.getByRole('tab', { name: 'SQL 1' })).toHaveAttribute('aria-selected', 'true');
    expect(draft()).toHaveValue(sql);
    fireEvent.change(draft(), { target: { value: 'SELECT edited_local_draft' } });
    act(() => queueWorkbenchCommand('openTableQuery', sql));
    expect(draft()).toHaveValue(sql);
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Service A · SQL 2' }));
    expect(draft()).toHaveValue('SELECT remote_value FROM remote_orders');
    run(); await idle();
    expect(api.executeQuackQuery).toHaveBeenCalledTimes(1);
    expect(api.executeQuackQuery.mock.calls[0][0]).toBe('A');
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
  });
  it('same SQL in A/B stays separate in results and history, and history replay binds A', async () => {
    const { tabs } = setup();
    for (const id of ['A', 'B']) {
      act(() => tabs.current!.openQuackQuery(service(id), 'SELECT * FROM orders'));
      run(); await idle();
    }
    expect(history).toHaveLength(2);
    expect(history.map(item => item.source?.connectionId)).toEqual(['B', 'A']);
    const a = history.find(item => item.source?.connectionId === 'A')!;
    act(() => tabs.current!.loadSql(a.sql, a.type, { source: a.source }));
    expect(draft()).toHaveValue('SELECT * FROM orders LIMIT 10000');
    run(); await idle();
    expect(api.executeQuackQuery.mock.calls.map(c => c[0])).toEqual(['A', 'B', 'A']);
    expect(workspace.resultTabs.map(t => t.query.source.connectionId)).toEqual(['A', 'B', 'A']);
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
  });

  it('local table selection while remote A runs preserves its draft and its captured completion target', async () => {
    const pending = deferred<ReturnType<typeof ok>>();
    api.executeQuackQuery.mockReturnValueOnce(pending.promise);
    const { tabs } = setup();
    act(() => tabs.current!.openQuackQuery(service('A'), 'SELECT * FROM remote_orders'));
    run();
    act(() => workspace.handleTableSelect({ name: 'local_orders', source: 'duckdb' }));
    expect(draft()).toHaveValue('SELECT * FROM remote_orders LIMIT 10000');
    act(() => tabs.current!.openQuackQuery(service('B'), 'SELECT 2'));
    await act(async () => { pending.resolve(ok('A late')); });
    await waitFor(() => expect(workspace.resultTabs).toHaveLength(1));
    expect(workspace.lastQuery?.source.connectionId).toBe('A');
    expect(draft()).toHaveValue('SELECT 2');
    expect(history[0].source?.connectionId).toBe('A');
  });

  it('closing editor A while its query runs does not retarget the response to editor B', async () => {
    const pending = deferred<ReturnType<typeof ok>>();
    api.executeQuackQuery.mockReturnValueOnce(pending.promise);
    const { tabs } = setup();
    act(() => tabs.current!.openQuackQuery(service('A'), 'SELECT 1'));
    run();
    act(() => tabs.current!.openQuackQuery(service('B'), 'SELECT 2'));
    fireEvent.click(screen.getByRole('button', { name: '关闭 Service A · SQL 2' }));
    await act(async () => { pending.resolve(ok('A late')); });
    await waitFor(() => expect(history).toHaveLength(1));
    expect(workspace.lastQuery?.source.connectionId).toBe('A');
    expect(history[0].source?.connectionId).toBe('A');
    expect(draft()).toHaveValue('SELECT 2');
    expect(api.executeQuackQuery).toHaveBeenCalledTimes(1);
  });

  it('loading local history while remote editor is active returns to a local editor', async () => {
    const { tabs } = setup();
    act(() => workspace.handleTableSelect({ name: 'local_orders', source: 'duckdb' }));
    expect(draft()).toHaveValue('SELECT * FROM local_orders LIMIT 10000');
    act(() => tabs.current!.openQuackQuery(service('A'), 'SELECT remote_value'));
    act(() => tabs.current!.loadSql('SELECT 42', 'sql'));
    expect(previewState.open).toBe(true);
    expect(screen.getByRole('tab', { name: 'SQL 1' })).toHaveAttribute('aria-selected', 'true');
    expect(draft()).toHaveValue('SELECT 42');
    run(); await idle();
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
    expect(api.executeDuckDBSQL).toHaveBeenCalledTimes(1);
  });

  it('editor save keeps remote A and its full business SQL when B is opened before submission', async () => {
    api.submitAsyncQuery.mockResolvedValue({ task_id: 'save-A' });
    const { tabs } = setup();
    act(() => tabs.current!.openQuackQuery(service('A'), 'SELECT * FROM orders_A'));
    run(); await idle();
    fireEvent.click(activePanel().getByRole('button', { name: 'save-query' }));
    act(() => tabs.current!.openQuackQuery(service('B'), 'SELECT * FROM orders_B'));
    fireEvent.click(screen.getByRole('button', { name: '提交任务' }));
    await waitFor(() => expect(api.submitAsyncQuery).toHaveBeenCalledTimes(1));
    expect(api.submitAsyncQuery.mock.calls[0][0]).toMatchObject({ sql: 'SELECT * FROM orders_A', quack_service_id: 'A', apply_row_limit: false });
    expect(api.executeQuackQuery).toHaveBeenCalledTimes(1);
  });

  /** Regression candidate 2026-11-03: workspace catches remote errors, so editor writes successful history. */
  it('records the actual remote error in history rather than a successful execution', async () => {
    api.executeQuackQuery.mockRejectedValueOnce(new Error('Remote A authentication failed'));
    const { tabs } = setup();
    act(() => tabs.current!.openQuackQuery(service('A'), 'SELECT * FROM remote_orders'));
    run(); await idle();
    expect(workspace.lastFailure?.errorMessage).toBe('Remote A authentication failed');
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
    expect(history[0]).toMatchObject({ source: { type: 'quack', connectionId: 'A' }, error: 'Remote A authentication failed' });
  });

  /** Regression 2026-11-03: cancelling, replacing or adopting a remote query must not create successful history. */
  it.each(['cancel', 'adopt', 'replace'] as const)('%s a running remote editor query keeps history free of false success', async action => {
    const { tabs } = setup();
    act(() => tabs.current!.openQuackQuery(service('Seed'), 'SELECT 7'));
    run(); await idle();
    const pending = deferred<ReturnType<typeof ok>>();
    api.executeQuackQuery.mockImplementationOnce((_id: string, _sql: string, options: { signal: AbortSignal }) => {
      options.signal.addEventListener('abort', () => pending.reject(Object.assign(new Error('HTTP wait cancelled'), { name: 'CanceledError', code: 'ERR_CANCELED' })), { once: true });
      return pending.promise;
    });
    api.moveQueryToBackground.mockResolvedValueOnce({ task_id: 'adopted-A' });
    act(() => tabs.current!.openQuackQuery(service('A'), 'SELECT slow_A'));
    run();
    const request = api.executeQuackQuery.mock.calls[1][2];
    if (action === 'cancel') fireEvent.click(activePanel().getByRole('button', { name: 'cancel-query' }));
    else if (action === 'adopt') fireEvent.click(screen.getByRole('button', { name: 'adopt-query' }));
    else {
      act(() => tabs.current!.openQuackQuery(service('B'), 'SELECT fast_B'));
      run();
    }
    // Wait for A as well as the active editor B to leave the execution state.
    await waitFor(() => {
      for (const button of screen.getAllByRole('button', { name: 'run-query', hidden: true })) expect(button).toBeEnabled();
    });
    expect(request.signal.aborted).toBe(true);
    expect(history.map(item => item.source?.connectionId)).toEqual(action === 'replace' ? ['B', 'Seed'] : ['Seed']);
    expect(JSON.parse(localStorage.getItem('duckquery-global-history')!).some((item: GlobalHistoryItem) => item.source?.connectionId === 'A')).toBe(false);
    expect(workspace.resultTabs.map(tab => tab.query.source.connectionId)).toEqual(action === 'replace' ? ['Seed', 'B'] : ['Seed']);
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
    if (action === 'adopt') {
      expect(api.moveQueryToBackground).toHaveBeenCalledExactlyOnceWith(request.requestId);
      expect(api.cancelSyncQuery).not.toHaveBeenCalled();
    } else expect(api.cancelSyncQuery).toHaveBeenCalledExactlyOnceWith(request.requestId);
  });

  /** Regression 2026-11-03: remote transport/server cancellation variants must skip both success and error history. */
  it.each([
    { name: 'AbortError' },
    { name: 'CanceledError' },
    { code: 'ERR_CANCELED' },
    { code: 'QUERY_CANCELLED' },
  ])('remote cancellation marker %j never becomes a history entry', async marker => {
    api.executeQuackQuery.mockRejectedValueOnce(Object.assign(new Error('Remote query cancelled'), marker));
    const { tabs } = setup();
    act(() => tabs.current!.openQuackQuery(service('A'), 'SELECT slow_A'));
    run(); await idle();
    expect(history).toEqual([]);
    expect(localStorage.getItem('duckquery-global-history')).toBeNull();
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
    expect(api.executeQuackQuery).toHaveBeenCalledTimes(1);
  });
});

describe('Quack background preview semantics through the actual task panel', () => {
  function task(snapshot: boolean): AsyncTask {
    return { task_id: 'A-task', status: 'completed', sql: 'SELECT * FROM remote_A', created_at: '2026-11-03T00:00:00Z',
      result_info: snapshot ? { result_kind: 'snapshot', available: true, row_count: 1 } : { table_name: 'local_A', row_count: 1 },
      metadata: { quack_service_id: 'A', source: { type: 'quack', connectionId: 'A', connectionName: 'Service A' } } };
  }
  it.each([true, false])('refresh after task preview uses %s snapshot semantics', async snapshot => {
    api.listAsyncTasks.mockResolvedValue({ tasks: [task(snapshot)] });
    api.getBackgroundQueryResult.mockResolvedValue(ok('saved A snapshot'));
    localTables.tables = [{ name: 'local_A', type: 'TABLE' }];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Tasks() {
      workspace = useQueryWorkspace();
      return <AsyncTaskPanel onPreviewResult={workspace.displayQueryPreview} />;
    }
    render(<QueryClientProvider client={client}><Tasks /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: '预览结果' }));
    await waitFor(() => expect(workspace.lastQuery).not.toBeNull());
    expect(workspace.lastQuery).toMatchObject(snapshot
      ? { sql: 'SELECT * FROM remote_A', source: { type: 'quack', connectionId: 'A' } }
      : { sql: 'SELECT * FROM "local_A"', source: { type: 'duckdb' } });
    await act(async () => { await workspace.refreshActiveResult(); });
    if (snapshot) {
      expect(api.getBackgroundQueryResult).toHaveBeenCalledWith('A-task');
      expect(api.executeQuackQuery.mock.calls[0].slice(0, 2)).toEqual(['A', 'SELECT * FROM remote_A']);
      expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
    } else {
      expect(api.executeDuckDBSQL).toHaveBeenCalledTimes(2);
      expect(api.executeDuckDBSQL.mock.calls[1][0]).toBe('SELECT * FROM "local_A"');
      expect(api.executeQuackQuery).not.toHaveBeenCalled();
    }
  });
});
