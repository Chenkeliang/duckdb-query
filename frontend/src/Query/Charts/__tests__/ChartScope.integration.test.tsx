/** Regression 2026-11-03: editor/system/server LIMIT provenance was lost before result chart aggregation. */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { EditorView } from '@codemirror/view';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryResponse } from '@/api';
import type { TableSource } from '@/types/queryWorkspace';
import { useQueryWorkspace } from '@/hooks/useQueryWorkspace';
import { SQLQueryPanel } from '@/Query/SQLQuery/SQLQueryPanel';
import { ResultPanel } from '@/Query/ResultPanel/ResultPanel';

const api = vi.hoisted(() => ({ executeDuckDBSQL: vi.fn(), executeQuackQuery: vi.fn(), executeFederatedQuery: vi.fn(), runAgent: vi.fn() }));
const settings = vi.hoisted(() => ({ retainQueryResults: false }));
vi.mock('@/api', () => api);
vi.mock('@/utils/queryResultSettingsStorage', () => ({ loadQueryResultSettings: () => settings }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));
vi.mock('@/utils/toastHelpers', () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }));
vi.mock('@/hooks/useAppConfig', () => ({ useAppConfig: () => ({ maxQueryRows: 2 }) }));
vi.mock('@/hooks/useAiEnabled', () => ({ useAiEnabled: () => false }));
vi.mock('@/hooks/useAiStatus', () => ({ useAiStatus: () => ({ enabled: false, configured: false }) }));
vi.mock('@/hooks/useDuckDBTables', () => ({ useDuckDBTables: () => ({ tables: [] }) }));
vi.mock('@/hooks/useSchemaTables', () => ({ useSchemaTables: () => ({ tables: [] }) }));
vi.mock('@/hooks/useEnhancedAutocomplete', () => ({ useEnhancedAutocomplete: () => ({ tableNames: [] }) }));
vi.mock('@/hooks/useSqlColumnAutocomplete', () => ({ useSqlColumnAutocomplete: () => ({ columnMap: {}, flatColumnNames: [] }) }));
vi.mock('@/hooks/useFederatedQueryDetection', () => ({ useFederatedQueryDetection: () => ({
  attachDatabases: [], unrecognizedPrefixes: [], requiresFederatedQuery: false,
  tableSource: { type: 'duckdb' }, availableConnections: [], manualDatabases: [],
}) }));
vi.mock('@/Query/hooks/useGlobalHistory', () => ({ useGlobalHistory: () => ({ addToHistory: vi.fn() }) }));
vi.mock('@/Query/SQLQuery/ai/AiChatDrawer', () => ({ AiChatDrawer: () => null, ChatToggleButton: () => null }));
vi.mock('@/Query/AsyncTasks/AsyncTaskDialog', () => ({ AsyncTaskDialog: () => null }));
vi.mock('@/Query/Bookmarks/SaveQueryDialog', () => ({ SaveQueryDialog: () => null }));
vi.mock('@/Query/ResultPanel/DataGridWrapper', async () => ({ DataGridWrapper: (await import('react')).forwardRef(() => null) }));
vi.mock('@/Query/ResultPanel/ResultTabGridPane', () => ({ ResultTabGridPane: () => null }));
vi.mock('@/Query/ResultPanel/hooks/useDataGridColumns', () => ({ useDataGridColumns: () => ({ columns: [] }) }));

const python = process.env.DUCKQUERY_TEST_PYTHON ?? resolve(process.cwd(), '../.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
// Only this synthetic in-memory database is used. No app configuration, service or model is accessed.
function nativeQuery(sql: string, isPreview = true): QueryResponse {
  const result = spawnSync(python, ['-c', `
import duckdb,json,sys,sqlglot
request=json.load(sys.stdin)
statement=sqlglot.parse(request['sql'],read='duckdb')[0]
limit=2 if request['preview'] and not statement.args.get('limit') else None
executed=statement.limit(limit).sql(dialect='duckdb') if limit else request['sql']
with duckdb.connect(':memory:') as con:
    cursor=con.execute(executed)
    columns=[item[0] for item in cursor.description]
    types=[{'name':item[0],'duckdb_type':str(item[1])} for item in cursor.description]
    data=[dict(zip(columns,row)) for row in cursor.fetchall()]
    print(json.dumps({'success':True,'data':data,'columns':columns,'column_types':types,'preview_limit_applied':limit,'sql_executed':executed},default=str))
`], { input: JSON.stringify({ sql, preview: isPreview }), encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
  return JSON.parse(result.stdout) as QueryResponse;
}

const sql = 'SELECT * FROM range(5) AS t(order_id)';
const remote: TableSource = { type: 'quack', connectionId: 'synthetic-service', connectionName: 'Synthetic' };
function mount(initialSQL: string, source: TableSource, retain: boolean, serverPreview = false) {
  settings.retainQueryResults = retain;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function Workspace() {
    const workspace = useQueryWorkspace();
    return <>
      <SQLQueryPanel initialSQL={initialSQL} executionSource={source} onExecute={workspace.handleQueryExecute} />
      {serverPreview && <button onClick={() => workspace.displayQueryPreview(nativeQuery(initialSQL), initialSQL, source)}>server preview</button>}
      <ResultPanel data={workspace.queryResults?.data ?? null} columns={workspace.queryResults?.columns}
        duckdbColumnTypes={workspace.queryResults?.duckdbColumnTypes} source={workspace.lastQuery?.source}
        currentSQL={workspace.lastQuery?.sql} currentBaseSQL={workspace.lastQuery?.baseSql}
        previewLimitApplied={workspace.queryResults?.previewLimitApplied} retainQueryResults={retain}
        resultTabs={workspace.resultTabs} activeResultTabId={workspace.activeResultTabId} />
    </>;
  }
  return render(<QueryClientProvider client={client}><Workspace /></QueryClientProvider>);
}

async function countPreview() {
  fireEvent.click(await screen.findByRole('button', { name: 'query.chart.chart' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'query.chart.configure' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'query.chart.recommendations' }));
  fireEvent.click(screen.getByRole('button', { name: 'query.chart.previewCandidate' }));
  await screen.findByRole('button', { name: 'query.chart.apply' });
  fireEvent.click(screen.getByRole('button', { name: 'query.chart.advanced' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
  vi.stubGlobal('XMLHttpRequest', class { constructor() { throw new Error('Unexpected XHR'); } });
  api.executeDuckDBSQL.mockImplementation(async (query: string) => nativeQuery(query));
  api.executeQuackQuery.mockImplementation(async (_id: string, query: string) => nativeQuery(query));
  api.executeFederatedQuery.mockImplementation(async ({ sql: query }: { sql: string }) => nativeQuery(query));
  api.runAgent.mockImplementation(() => { throw new Error('Unexpected model request'); });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('real CodeMirror → SQLQueryPanel → workspace → ResultPanel → chart scope', () => {
  it.each([false, true])('offers full scope for editor-added LIMIT and keeps the captured service (retain=%s)', async retain => {
    const view = mount(sql, remote, retain);
    expect(view.container.querySelector('.cm-content')).toHaveTextContent(sql);
    fireEvent.click(screen.getByRole('button', { name: 'query.execute' }));
    await waitFor(() => expect(api.executeQuackQuery).toHaveBeenCalledTimes(1));
    expect(api.executeQuackQuery.mock.calls[0].slice(0, 2)).toEqual([remote.connectionId, `${sql} LIMIT 2`]);
    await countPreview();
    expect(screen.getByTitle('2')).toBeInTheDocument();
    const expand = screen.getByRole('checkbox', { name: 'query.chart.expandScope' });
    expect(expand).not.toBeChecked();
    fireEvent.click(expand);
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.preview' }));
    await waitFor(() => expect(screen.getByTitle('5')).toBeInTheDocument());
    expect(api.executeQuackQuery.mock.calls.map(call => call[0])).toEqual([remote.connectionId, remote.connectionId, remote.connectionId]);
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
    expect(api.executeFederatedQuery).not.toHaveBeenCalled();
    expect(api.runAgent).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps backend-capped current scope inside the two returned rows (retain=%s)', async retain => {
    mount(sql, remote, retain, true);
    fireEvent.click(screen.getByRole('button', { name: 'server preview' }));
    await countPreview();
    expect(screen.getByTitle('2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'query.chart.expandScope' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.preview' }));
    await waitFor(() => expect(screen.getByTitle('5')).toBeInTheDocument());
  });

  it.each([
    `${sql} LIMIT 3 -- user restriction`,
    `${sql} OFFSET 1 ROWS FETCH NEXT 3 ROWS ONLY`,
    `SELECT * FROM (${sql} LIMIT 3) AS business_subset; -- nested restriction`,
  ])('preserves user restrictions in both scopes: %s', async initialSQL => {
    mount(initialSQL, remote, false);
    fireEvent.click(screen.getByRole('button', { name: 'query.execute' }));
    await waitFor(() => expect(api.executeQuackQuery).toHaveBeenCalledTimes(1));
    await countPreview();
    const nested = initialSQL.startsWith('SELECT * FROM (');
    expect(screen.getByTitle(nested ? '2' : '3')).toBeInTheDocument();
    if (nested) {
      fireEvent.click(screen.getByRole('checkbox', { name: 'query.chart.expandScope' }));
      fireEvent.click(screen.getByRole('button', { name: 'query.chart.preview' }));
      await waitFor(() => expect(screen.getByTitle('3')).toBeInTheDocument());
    } else expect(screen.queryByRole('checkbox', { name: 'query.chart.expandScope' })).not.toBeInTheDocument();
  });

  it('retains the original source LIMIT through a local result and a current chart preview', async () => {
    mount(`${sql} LIMIT 2; -- local result`, { type: 'duckdb' }, false);
    fireEvent.click(screen.getByRole('button', { name: 'query.execute' }));
    await waitFor(() => expect(api.executeDuckDBSQL).toHaveBeenCalledTimes(1));
    await countPreview();
    expect(screen.getByTitle('2')).toBeInTheDocument();
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
  });

  /** Regression 2026-11-03: changing a displayed system limit must make it a business limit in charts too. */
  it('keeps a limit edited in the actual CodeMirror draft as a business restriction', async () => {
    const view = mount(sql, remote, false);
    fireEvent.click(screen.getByRole('button', { name: 'query.execute' }));
    await waitFor(() => expect(api.executeQuackQuery).toHaveBeenCalledTimes(1));
    const editor = EditorView.findFromDOM(view.container.querySelector('.cm-content') as HTMLElement)!;
    act(() => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: `${sql} LIMIT 4` } }));
    fireEvent.click(screen.getByRole('button', { name: 'query.execute' }));
    await waitFor(() => expect(api.executeQuackQuery).toHaveBeenCalledTimes(2));
    await countPreview();
    expect(screen.getByTitle('4')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'query.chart.expandScope' })).not.toBeInTheDocument();
  });

  it('keeps federated aggregation attached to the captured connections in both scopes', async () => {
    const source: TableSource = { type: 'federated', attachDatabases: [{ alias: 'synthetic', connectionId: 'synthetic-db' }] };
    mount(sql, source, true, true);
    fireEvent.click(screen.getByRole('button', { name: 'server preview' }));
    await countPreview();
    expect(screen.getByTitle('2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'query.chart.expandScope' }));
    fireEvent.click(screen.getByRole('button', { name: 'query.chart.preview' }));
    await waitFor(() => expect(screen.getByTitle('5')).toBeInTheDocument());
    expect(api.executeFederatedQuery.mock.calls.map(call => call[0].attachDatabases)).toEqual([source.attachDatabases, source.attachDatabases]);
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
  });
});
