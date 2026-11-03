/** 2026-11-03: only arrows fetch structural metadata; keep selection/preview/cache ownership intact. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableItem } from '../TableItem';
import { DatabaseConnectionNode } from '../DatabaseConnectionNode';
import { __resetWorkbenchCommands, registerWorkbenchCommand } from '@/Query/workbenchCommands';
import { invalidateAfterDatabaseChange } from '@/utils/cacheInvalidation';
import type { SelectedTableObject } from '@/types/SelectedTable';
const api = vi.hoisted(() => ({ getDuckDBTableStructure: vi.fn(), getExternalTableStructure: vi.fn(), getDuckDBTableDetail: vi.fn(), getExternalTableDetail: vi.fn(), executeDuckDBSQL: vi.fn(), executeFederatedQuery: vi.fn(), listConnectionSchemas: vi.fn(), listConnectionTablesFlat: vi.fn() }));
vi.mock('@/api', async original => ({ ...await original<typeof import('@/api')>(), ...api }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: unknown) => options && typeof options === 'object' && 'name' in options ? `${key} ${options.name}` : key }) }));
vi.mock('@/utils/toastHelpers', () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn(), showDownloadStartedToast: vi.fn() }));
const local: SelectedTableObject = { name: 'orders', source: 'duckdb' };
const response = (name = 'amount', type = 'DECIMAL(38,19)') => ({ table_name: 'orders', columns: [{ name, type }], column_count: 1 });
function mount(table: SelectedTableObject = local, extra: Partial<React.ComponentProps<typeof TableItem>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSelect = vi.fn(), onPreview = vi.fn();
  const view = (value: SelectedTableObject) => <QueryClientProvider client={client}><TableItem table={value} isSelected={false} onSelect={onSelect} onPreview={onPreview} {...extra} /></QueryClientProvider>;
  const result = render(view(table));
  return { ...result, client, onSelect, onPreview, replace: (value: SelectedTableObject) => result.rerender(view(value)) };
}
function noDataWork() {
  expect(api.executeDuckDBSQL).not.toHaveBeenCalled(); expect(api.executeFederatedQuery).not.toHaveBeenCalled();
  expect(api.getDuckDBTableDetail).not.toHaveBeenCalled(); expect(api.getExternalTableDetail).not.toHaveBeenCalled();
}
beforeEach(() => { vi.clearAllMocks(); __resetWorkbenchCommands(); api.getDuckDBTableStructure.mockResolvedValue(response()); api.getExternalTableStructure.mockResolvedValue(response()); });
afterEach(() => { cleanup(); __resetWorkbenchCommands(); });

describe('table field disclosure', () => {
  it('loads local fields lazily, preserves full type text, and reuses cache after collapsing', async () => {
    const state = mount(); const preview = vi.fn(); registerWorkbenchCommand('openTableQuery', preview);
    expect(api.getDuckDBTableStructure).not.toHaveBeenCalled();
    const arrow = screen.getByRole('button', { name: 'dataSource.expandFields orders' });
    await userEvent.click(arrow); expect(arrow).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText('DECIMAL(38,19)')).toHaveAttribute('title', 'DECIMAL(38,19)');
    expect(api.getDuckDBTableStructure).toHaveBeenCalledExactlyOnceWith('orders');
    await userEvent.click(screen.getByText('amount'));
    expect(state.onSelect).not.toHaveBeenCalled(); expect(state.onPreview).not.toHaveBeenCalled(); expect(preview).not.toHaveBeenCalled(); noDataWork();
    await userEvent.click(arrow); expect(screen.queryByText('amount')).not.toBeInTheDocument();
    await userEvent.click(arrow); await screen.findByText('amount'); expect(api.getDuckDBTableStructure).toHaveBeenCalledTimes(1);
    expect(document.getElementById(arrow.getAttribute('aria-controls')!)).toBeInTheDocument();
  });
  it.each(['mysql', 'postgresql', 'sqlite', 'duckdb'] as const)('loads %s columns with the connection and schema identity', async type => {
    const table: SelectedTableObject = { name: 'orders', source: 'external', schema: type === 'postgresql' ? 'odd"schema' : undefined, connection: { id: `conn-${type}`, name: type, type } };
    const state = mount(table);
    expect(api.getExternalTableStructure).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'dataSource.expandFields orders' })); await screen.findByText('amount');
    expect(api.getExternalTableStructure).toHaveBeenCalledExactlyOnceWith(`conn-${type}`, 'orders', table.schema);
    expect(api.getDuckDBTableStructure).not.toHaveBeenCalled(); expect(state.onSelect).not.toHaveBeenCalled(); noDataWork();
  });
  it('has distinct caches for same-named tables and ignores the late previous connection response', async () => {
    let resolveA!: (value: ReturnType<typeof response>) => void;
    api.getExternalTableStructure.mockImplementation((id: string) => id === 'A' ? new Promise(resolve => { resolveA = resolve; }) : Promise.resolve(response('B_only', 'VARCHAR')));
    const table = (id: string): SelectedTableObject => ({ name: 'orders', source: 'external', connection: { id, name: id, type: 'mysql' } });
    const state = mount(table('A')); await userEvent.click(screen.getByRole('button', { name: 'dataSource.expandFields orders' }));
    await waitFor(() => expect(api.getExternalTableStructure).toHaveBeenCalledTimes(1)); state.replace(table('B'));
    await screen.findByText('B_only'); await act(async () => resolveA(response('A_only', 'INTEGER')));
    expect(screen.queryByText('A_only')).not.toBeInTheDocument(); expect(screen.getByText('B_only')).toBeInTheDocument(); noDataWork();
  });
  it('does not replace the rich column/index cache used by existing designers', async () => {
    const state = mount(); const key = ['table-columns', 'orders', 'duckdb', undefined];
    state.client.setQueryData(key, [{ name: 'indexed', type: 'BIGINT', hasLeadingIndex: true }]);
    await userEvent.click(screen.getByRole('button', { name: 'dataSource.expandFields orders' })); await screen.findByText('amount');
    expect(state.client.getQueryData(key)).toEqual([{ name: 'indexed', type: 'BIGINT', hasLeadingIndex: true }]);
    expect(screen.queryByText('indexed')).not.toBeInTheDocument();
  });
  it('shows a recoverable error, retries metadata only, and clears the error on success', async () => {
    api.getDuckDBTableStructure.mockRejectedValueOnce(new Error('Synthetic metadata unavailable'));
    const state = mount(); await userEvent.click(screen.getByRole('button', { name: 'dataSource.expandFields orders' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic metadata unavailable');
    await userEvent.click(screen.getByRole('button', { name: 'dataSource.retryFields' })); await screen.findByText('amount');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(); expect(api.getDuckDBTableStructure).toHaveBeenCalledTimes(2);
    expect(state.onSelect).not.toHaveBeenCalled(); noDataWork();
  });
  it('shows an empty structure without selecting or previewing', async () => {
    api.getDuckDBTableStructure.mockResolvedValue({ table_name: 'orders', columns: [], column_count: 0 });
    const state = mount(); await userEvent.click(screen.getByRole('button', { name: 'dataSource.expandFields orders' }));
    await screen.findByText('dataSource.noFields'); expect(state.onPreview).not.toHaveBeenCalled(); noDataWork();
  });
  it('never expands a disabled row or starts metadata in bulk-delete mode', async () => {
    mount(local, { disabled: true }); const arrow = screen.getByRole('button', { name: 'dataSource.expandFields orders' });
    expect(arrow).toBeDisabled(); await userEvent.click(arrow); expect(api.getDuckDBTableStructure).not.toHaveBeenCalled(); cleanup();
    mount(local, { batchMode: true }); expect(screen.queryByRole('button', { name: 'dataSource.expandFields orders' })).not.toBeInTheDocument();
    expect(api.getDuckDBTableStructure).not.toHaveBeenCalled();
  });
  it('keeps double-click preview separate from arrow/checkbox keyboard actions', async () => {
    const state = mount(local, { selectionMode: 'multiple' }); const preview = vi.fn(); registerWorkbenchCommand('openTableQuery', preview);
    const arrow = screen.getByRole('button', { name: 'dataSource.expandFields orders' }); arrow.focus(); await userEvent.keyboard('{Enter}'); await screen.findByText('amount');
    expect(state.onSelect).not.toHaveBeenCalled(); await userEvent.click(screen.getByRole('checkbox')); expect(state.onSelect).toHaveBeenCalledTimes(1);
    await userEvent.dblClick(screen.getByText('orders')); expect(preview).toHaveBeenCalledExactlyOnceWith('SELECT * FROM orders LIMIT 100;');
    expect(api.getDuckDBTableStructure).toHaveBeenCalledTimes(1); noDataWork();
  });
  it('refreshing table information also refreshes an expanded field list', async () => {
    api.getDuckDBTableStructure.mockResolvedValueOnce(response('old_field')).mockResolvedValueOnce(response('new_field'));
    mount(); await userEvent.click(screen.getByRole('button', { name: 'dataSource.expandFields orders' })); await screen.findByText('old_field');
    fireEvent.contextMenu(screen.getByText('orders')); await userEvent.click(screen.getByRole('menuitem', { name: 'dataSource.refreshTableInfo' }));
    await screen.findByText('new_field'); expect(screen.queryByText('old_field')).not.toBeInTheDocument(); noDataWork();
  });
  it('refreshes expanded metadata after saved connection settings change', async () => {
    api.getExternalTableStructure.mockResolvedValueOnce(response('previous_database')).mockResolvedValueOnce(response('updated_database'));
    const table: SelectedTableObject = { name: 'orders', source: 'external', connection: { id: 'same-id', name: 'Database', type: 'mysql' } };
    const state = mount(table); await userEvent.click(screen.getByRole('button', { name: 'dataSource.expandFields orders' })); await screen.findByText('previous_database');
    await act(async () => { await invalidateAfterDatabaseChange(state.client); });
    await screen.findByText('updated_database'); expect(screen.queryByText('previous_database')).not.toBeInTheDocument(); noDataWork();
  });
  it('refreshing one connection updates its fields without invalidating another connection', async () => {
    api.listConnectionSchemas.mockResolvedValue([]); api.listConnectionTablesFlat.mockResolvedValue([{ name: 'orders' }]);
    api.getExternalTableStructure.mockResolvedValueOnce(response('before_refresh')).mockResolvedValueOnce(response('after_refresh'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const otherKey = ['table-columns', 'orders', 'other', undefined, 'columns-only']; client.setQueryData(otherKey, [{ name: 'other_fields', type: 'VARCHAR' }]);
    const onSelect = vi.fn();
    render(<QueryClientProvider client={client}><DatabaseConnectionNode connection={{ id: 'current', name: 'Current', type: 'mysql', status: 'active', params: {} }} selectedTables={[]} onTableSelect={onSelect} /></QueryClientProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Current' }));
    await userEvent.click(await screen.findByRole('button', { name: 'dataSource.expandFields orders' })); await screen.findByText('before_refresh');
    fireEvent.contextMenu(screen.getByText('Current')); await userEvent.click(screen.getByRole('menuitem', { name: 'dataSource.refreshConnection' }));
    await screen.findByText('after_refresh'); expect(screen.queryByText('before_refresh')).not.toBeInTheDocument();
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false); expect(onSelect).not.toHaveBeenCalled(); noDataWork();
  });
});
