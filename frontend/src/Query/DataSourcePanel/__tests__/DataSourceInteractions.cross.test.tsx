/** 2026-11-03: real legacy/Quack rows, mocked APIs, no business/external side effects. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableItem } from '../TableItem';
import { DatabaseConnectionNode } from '../DatabaseConnectionNode';
import { QuackServiceBrowser } from '@/Quack/QuackServiceBrowser';
import { __resetWorkbenchCommands, registerWorkbenchCommand } from '@/Query/workbenchCommands';
import { generateExternalTableReference } from '@/utils/sqlUtils';
import type { DatabaseType, SelectedTableObject } from '@/types/SelectedTable';
const api = vi.hoisted(() => ({ listConnectionSchemas: vi.fn(), listConnectionTablesFlat: vi.fn(), listSchemaTablesForConnection: vi.fn(), getQuackCatalogs: vi.fn(), getQuackSchemas: vi.fn(), getQuackTables: vi.fn(), getQuackColumns: vi.fn(), executeDuckDBSQL: vi.fn(), executeFederatedQuery: vi.fn(), executeQuackQuery: vi.fn(), deleteDuckDBTable: vi.fn(), exportQueryResults: vi.fn() }));
vi.mock('@/api', async original => ({ ...await original<typeof import('@/api')>(), ...api }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: unknown) => {
  if (key === 'quack.openPreview' || key === 'dataSource.openPreviewSQL') return 'Open preview SQL (100 rows)';
  return options && typeof options === 'object' && 'name' in options ? `${key} ${options.name}` : key;
} }) }));
vi.mock('@/utils/toastHelpers', () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn(), showDownloadStartedToast: vi.fn() }));
const types: DatabaseType[] = ['mysql', 'postgresql', 'sqlite', 'duckdb'];
const legacy = [{ label: 'local DuckDB', table: { name: 'orders', source: 'duckdb' } as SelectedTableObject }, ...types.map(type => ({ label: type, table: { name: 'orders', source: 'external', schema: type === 'postgresql' ? 'odd"schema' : undefined, connection: { id: `conn-${type}`, name: `DB_${type}`, type } } as SelectedTableObject }))];
const loadSql = vi.fn();
function wrap(children: React.ReactNode) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>); }
function row(table: SelectedTableObject, extra: Partial<React.ComponentProps<typeof TableItem>> = {}) {
  const select = vi.fn(), preview = vi.fn(), importTable = vi.fn();
  wrap(<TableItem table={table} isSelected={false} onSelect={select} onPreview={preview} onImport={importTable} {...extra} />);
  return { select, preview, importTable, element: screen.getByText('orders').closest('[role="button"]') as HTMLElement };
}
function noExecution() { for (const call of [api.executeDuckDBSQL, api.executeFederatedQuery, api.executeQuackQuery, api.deleteDuckDBTable, api.exportQueryResults]) expect(call).not.toHaveBeenCalled(); }
beforeEach(() => {
  vi.clearAllMocks(); __resetWorkbenchCommands(); registerWorkbenchCommand('openTableQuery', loadSql);
  api.listConnectionSchemas.mockResolvedValue([{ name: 'public' }]); api.listConnectionTablesFlat.mockResolvedValue([{ name: 'orders' }]); api.listSchemaTablesForConnection.mockResolvedValue([{ name: 'orders' }]);
  api.getQuackCatalogs.mockResolvedValue([{ name: 'catalog', type: 'duckdb' }]); api.getQuackSchemas.mockResolvedValue([{ name: 'public' }]); api.getQuackTables.mockResolvedValue([{ name: 'orders', type: 'BASE TABLE' }]); api.getQuackColumns.mockResolvedValue([{ name: 'id', type: 'BIGINT' }]);
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => { cleanup(); __resetWorkbenchCommands(); });
describe.each(legacy)('$label table interactions', ({ table }) => {
  /** Regression: selected legacy tables had no independent double-click refill. */
  it('double-click opens one quoted SQL preview, selects once and never executes', async () => {
    const result = row(table); await userEvent.dblClick(result.element);
    expect(loadSql).toHaveBeenCalledExactlyOnceWith(`SELECT * FROM ${generateExternalTableReference(table).qualifiedName} LIMIT 100;`);
    expect(result.select).toHaveBeenCalledExactlyOnceWith(table); expect(result.preview).not.toHaveBeenCalled(); noExecution();
  });
  it('shares SQL-preview context action and preserves the original data-preview callback', async () => {
    const result = row(table); const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    fireEvent(result.element, event); expect(event.defaultPrevented).toBe(true);
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Open preview SQL (100 rows)' }));
    expect(loadSql).toHaveBeenCalledExactlyOnceWith(`SELECT * FROM ${generateExternalTableReference(table).qualifiedName} LIMIT 100;`);
    expect(result.select).not.toHaveBeenCalled(); expect(result.preview).not.toHaveBeenCalled(); noExecution();
    fireEvent.contextMenu(result.element); await userEvent.click(await screen.findByRole('menuitem', { name: 'dataSource.previewData' }));
    expect(result.preview).toHaveBeenCalledTimes(1); expect(loadSql).toHaveBeenCalledTimes(1); expect(result.importTable).not.toHaveBeenCalled();
  });
  it('preserves single-click and keyboard selection without opening SQL', async () => {
    const result = row(table); await userEvent.click(result.element); result.element.focus(); await userEvent.keyboard('{Enter}'); await userEvent.keyboard(' ');
    expect(result.select).toHaveBeenCalledTimes(3); expect(loadSql).not.toHaveBeenCalled(); expect(result.preview).not.toHaveBeenCalled(); noExecution();
  });
  it('keeps insert/copy double-clicks from reaching the preview handler', async () => {
    const result = row(table); const insert = vi.fn(); registerWorkbenchCommand('insertText', insert);
    await userEvent.dblClick(screen.getByRole('button', { name: 'common.insertTableName' })); await userEvent.dblClick(screen.getByRole('button', { name: 'common.copyTableName' }));
    expect(insert).toHaveBeenCalledTimes(2); expect(result.select).not.toHaveBeenCalled(); expect(loadSql).not.toHaveBeenCalled(); noExecution();
  });
});
it('keeps disabled rows and bulk-delete double-clicks away from SQL preview', async () => {
  const table = legacy[0].table; const disabled = row(table, { disabled: true }); await userEvent.dblClick(disabled.element);
  expect(disabled.select).not.toHaveBeenCalled(); expect(loadSql).not.toHaveBeenCalled(); cleanup();
  const onBatchToggle = vi.fn(); const batch = row(table, { batchMode: true, onBatchToggle }); await userEvent.dblClick(batch.element);
  expect(onBatchToggle).toHaveBeenCalledTimes(2); expect(batch.select).not.toHaveBeenCalled(); expect(loadSql).not.toHaveBeenCalled(); noExecution();
});
it.each(types)('%s connection/schema arrows are lazy and never select or query tables', async type => {
  const select = vi.fn(); const name = `DB_${type}`;
  wrap(<DatabaseConnectionNode connection={{ id: `conn-${type}`, name, type, status: 'active', params: {} }} selectedTables={[]} onTableSelect={select} />);
  expect(api.listConnectionSchemas).not.toHaveBeenCalled(); expect(api.listConnectionTablesFlat).not.toHaveBeenCalled();
  await userEvent.click(screen.getByText(name));
  expect(api.listConnectionSchemas).not.toHaveBeenCalled(); expect(api.listConnectionTablesFlat).not.toHaveBeenCalled();
  await userEvent.click(screen.getByText(name));
  expect(api.listConnectionSchemas).not.toHaveBeenCalled(); expect(api.listConnectionTablesFlat).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name }));
  if (type === 'postgresql') { expect(api.listSchemaTablesForConnection).not.toHaveBeenCalled(); await userEvent.click(await screen.findByRole('button', { name: 'public' })); await waitFor(() => expect(api.listSchemaTablesForConnection).toHaveBeenCalledWith(`conn-${type}`, 'public')); }
  await screen.findByText('orders'); expect(select).not.toHaveBeenCalled(); expect(loadSql).not.toHaveBeenCalled(); noExecution();
  await userEvent.click(screen.getByRole('button', { name })); expect(screen.queryByText('orders')).not.toBeInTheDocument();
});
it('Quack arrows/double-click/context menu follow the same read-only preview contract', async () => {
  const service = { id: 'Q', name: 'Quack', uri: 'quack:localhost:9494', has_token: true }; const open = vi.fn(); wrap(<QuackServiceBrowser service={service} onOpenQuery={open} />);
  await userEvent.click(await screen.findByRole('button', { name: 'quack.expandNode catalog' })); await userEvent.click(await screen.findByRole('button', { name: 'quack.expandNode public' })); const table = await screen.findByRole('button', { name: 'orders' });
  await userEvent.dblClick(table); expect(open).toHaveBeenCalledExactlyOnceWith(service, 'SELECT * FROM catalog.public.orders LIMIT 100;'); expect(api.getQuackColumns).not.toHaveBeenCalled(); noExecution(); open.mockClear();
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }); fireEvent(table,event); expect(event.defaultPrevented).toBe(true);
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Open preview SQL (100 rows)' })); expect(open).toHaveBeenCalledTimes(1); noExecution();
  await userEvent.click(screen.getByRole('button', { name: 'quack.expandNode orders' })); await screen.findByText('BIGINT'); expect(open).toHaveBeenCalledTimes(1); noExecution();
});
