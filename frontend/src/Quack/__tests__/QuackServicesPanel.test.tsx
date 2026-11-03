import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QuackServicesPanel } from '../QuackServicesPanel';
import { quackTableSQL } from '../QuackServiceBrowser';

const api = vi.hoisted(() => ({ createQuackService: vi.fn(), updateQuackService: vi.fn(), deleteQuackService: vi.fn(), testQuackService: vi.fn(), testSavedQuackService: vi.fn(), listQuackServices: vi.fn(), getQuackCatalogs: vi.fn(), getQuackSchemas: vi.fn(), getQuackTables: vi.fn(), getQuackColumns: vi.fn(), executeQuackQuery: vi.fn() }));
vi.mock('@/api', () => api);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { name?: string }) => options?.name ? `${key} ${options.name}` : key }) }));
const service = { id: 'q1', name: 'Team', uri: 'quack:host:9494', has_token: true };

function view(mode: 'manage' | 'tree' = 'manage', search = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onOpenQuery = vi.fn();
  render(<QueryClientProvider client={client}><QuackServicesPanel mode={mode} search={search} onOpenQuery={onOpenQuery} /></QueryClientProvider>);
  return { client, onOpenQuery };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listQuackServices.mockResolvedValue([service]);
  api.getQuackCatalogs.mockResolvedValue([{ name: 'mysql_named_but_duckdb', type: 'duckdb' }]);
  api.getQuackSchemas.mockResolvedValue([{ name: 'main', catalog: 'mysql_named_but_duckdb' }]);
  api.getQuackTables.mockResolvedValue([{ name: 'orders', type: 'BASE TABLE' }, { name: 'summary', type: 'VIEW' }]);
  api.getQuackColumns.mockResolvedValue([{ name: 'amount', type: 'DECIMAL(38,4)' }]);
  api.testSavedQuackService.mockResolvedValue({ connected: true });
  api.deleteQuackService.mockResolvedValue(undefined);
});

describe('Quack service browser and management regressions (2026-11-03)', () => {
  /** 2026-11-03: branch titles must not expand unlike the existing connection tree. */
  it('expands service/catalog/schema only through their arrows, never by clicking titles', async () => {
    view();
    await userEvent.click(await screen.findByText('Team'));
    expect(api.getQuackCatalogs).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Team' }));
    await userEvent.click(await screen.findByText('mysql_named_but_duckdb'));
    expect(api.getQuackSchemas).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'quack.expandNode mysql_named_but_duckdb' }));
    await userEvent.click(await screen.findByText('main'));
    expect(api.getQuackTables).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'quack.expandNode main' }));
    await screen.findByRole('button', { name: 'orders' });
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
  });
  /** 2026-11-03: Quack table names toggled columns instead of opening preview SQL. */
  it.each(['tree', 'manage'] as const)('double-click opens one bound preview without expanding columns in %s', async mode => {
    const { onOpenQuery } = view(mode);
    if (mode === 'tree') fireEvent.click(await screen.findByRole('button', { name: /quack.title/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Team' }));
    fireEvent.click(await screen.findByRole('button', { name: 'quack.expandNode mysql_named_but_duckdb' }));
    fireEvent.click(await screen.findByRole('button', { name: 'quack.expandNode main' }));
    const table = await screen.findByRole('button', { name: 'orders' });
    await userEvent.dblClick(table);
    expect(onOpenQuery).toHaveBeenCalledExactlyOnceWith(service, quackTableSQL('mysql_named_but_duckdb', 'main', 'orders'));
    expect(api.getQuackColumns).not.toHaveBeenCalled();
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
  });

  /** 2026-11-03: native browser menus obscured Quack table actions. */
  it('opens an application table menu and cancels the native context menu without querying data', async () => {
    const { onOpenQuery } = view();
    fireEvent.click(await screen.findByRole('button', { name: 'Team' }));
    fireEvent.click(await screen.findByRole('button', { name: 'quack.expandNode mysql_named_but_duckdb' }));
    fireEvent.click(await screen.findByRole('button', { name: 'quack.expandNode main' }));
    const table = await screen.findByRole('button', { name: /^summary/ });
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
    fireEvent(table, event);
    expect(event.defaultPrevented).toBe(true);
    const preview = await screen.findByRole('menuitem', { name: 'quack.openPreview' });
    expect(api.getQuackColumns).not.toHaveBeenCalled();
    expect(onOpenQuery).not.toHaveBeenCalled();
    await userEvent.click(preview);
    expect(onOpenQuery).toHaveBeenCalledExactlyOnceWith(service, quackTableSQL('mysql_named_but_duckdb', 'main', 'summary'));
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
  });

  /** 2026-11-03: service context actions must match the existing overflow menu. */
  it('offers the saved service actions on right-click without expanding the service', async () => {
    const { onOpenQuery } = view();
    fireEvent.contextMenu(await screen.findByRole('button', { name: 'Team' }));
    expect(await screen.findByRole('menuitem', { name: 'quack.edit' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'quack.testConnection' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'quack.openQuery' }));
    expect(onOpenQuery).toHaveBeenCalledExactlyOnceWith(service);
    expect(api.getQuackCatalogs).not.toHaveBeenCalled();
  });

  /** 2026-11-03: disclosure arrows and table activation must own separate actions. */
  it('keeps single-click inert, toggles columns only with the arrow, and previews an expanded table once', async () => {
    const { onOpenQuery } = view();
    fireEvent.click(await screen.findByRole('button', { name: 'Team' }));
    fireEvent.click(await screen.findByRole('button', { name: 'quack.expandNode mysql_named_but_duckdb' }));
    fireEvent.click(await screen.findByRole('button', { name: 'quack.expandNode main' }));
    const table = await screen.findByRole('button', { name: 'orders' });
    await userEvent.click(table);
    expect(api.getQuackColumns).not.toHaveBeenCalled();
    expect(onOpenQuery).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'quack.expandNode orders' }));
    await screen.findByText('DECIMAL(38,4)');
    await userEvent.dblClick(table);
    expect(onOpenQuery).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'quack.collapseNode orders' })).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'quack.collapseNode orders' }));
    expect(screen.queryByText('DECIMAL(38,4)')).not.toBeInTheDocument();
    expect(api.getQuackColumns).toHaveBeenCalledTimes(1);
    expect(onOpenQuery).toHaveBeenCalledTimes(1);
  });

  /** 2026-11-03: keyboard users need the same preview path as double-click. */
  it.each(['{Enter}', ' '])('opens one preview with keyboard %j and leaves the branch collapsed', async key => {
    const { onOpenQuery } = view();
    fireEvent.click(await screen.findByRole('button', { name: 'Team' }));
    fireEvent.click(await screen.findByRole('button', { name: 'quack.expandNode mysql_named_but_duckdb' }));
    fireEvent.click(await screen.findByRole('button', { name: 'quack.expandNode main' }));
    const table = await screen.findByRole('button', { name: 'orders' });
    table.focus();
    await userEvent.keyboard(key);
    expect(onOpenQuery).toHaveBeenCalledExactlyOnceWith(service, quackTableSQL('mysql_named_but_duckdb', 'main', 'orders'));
    expect(api.getQuackColumns).not.toHaveBeenCalled();
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
  });

  /** 2026-11-03: Quack header must use the existing tree row and count badge. */
  it('uses the shared section row and keeps header actions from toggling its disclosure', async () => {
    view('tree');
    const toggle = await screen.findByRole('button', { name: 'quack.title' });
    const header = toggle.closest('.tree-node')?.firstElementChild;
    expect(header).toHaveClass('h-8', 'pl-0.5', 'rounded-lg');
    expect(await within(header as HTMLElement).findByText('1')).toHaveClass('bg-muted', 'rounded-md');
    fireEvent.click(screen.getByRole('button', { name: 'quack.refreshServices' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(api.getQuackCatalogs).not.toHaveBeenCalled();
    await userEvent.click(toggle);
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBeInTheDocument();
  });

  it('loads metadata lazily and opens a fully qualified preview bound to its service', async () => {
    const { onOpenQuery } = view('tree');
    await waitFor(() => expect(api.listQuackServices).toHaveBeenCalled());
    const group = await screen.findByRole('button', { name: /quack.title/ });
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(api.getQuackCatalogs).not.toHaveBeenCalled();
    fireEvent.click(group);
    fireEvent.click(await screen.findByRole('button', { name: 'Team' }));
    const catalog = await screen.findByRole('button', { name: 'quack.expandNode mysql_named_but_duckdb' });
    expect(api.getQuackSchemas).not.toHaveBeenCalled();
    fireEvent.click(catalog);
    fireEvent.click(await screen.findByRole('button', { name: 'quack.expandNode main' }));
    const table = await screen.findByRole('button', { name: 'orders' });
    expect(api.getQuackColumns).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'quack.expandNode orders' }));
    await screen.findByText('DECIMAL(38,4)');
    expect(api.getQuackColumns).toHaveBeenCalledWith('q1', 'mysql_named_but_duckdb', 'main', 'orders');
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
    expect(onOpenQuery).not.toHaveBeenCalled();
    fireEvent.contextMenu(table);
    await userEvent.click(screen.getByRole('menuitem', { name: 'quack.openPreview' }));
    expect(onOpenQuery).toHaveBeenCalledWith(service, 'SELECT * FROM mysql_named_but_duckdb.main.orders LIMIT 100;');
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^summary/ })).toHaveTextContent('quack.view');
  });

  it('opens a new SQL tab with the exact saved service object', async () => {
    const { onOpenQuery } = view();
    fireEvent.click(await screen.findByRole('button', { name: 'quack.openQuery' }));
    expect(onOpenQuery).toHaveBeenCalledWith(service);
    expect(api.testSavedQuackService).not.toHaveBeenCalled();
  });

  it('opens an empty creation form without network tests or local SQL', async () => {
    view('tree');
    fireEvent.click(screen.getByRole('button', { name: 'quack.addService' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('quack.token')).toHaveValue('');
    expect(within(dialog).getByLabelText('quack.token')).toHaveAttribute('type', 'password');
    expect(api.testQuackService).not.toHaveBeenCalled();
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
  });

  it('requires deletion confirmation, deletes config only and invalidates metadata', async () => {
    const { client } = view();
    client.setQueryData(['quack-metadata', 'q1', 'catalogs'], [{ name: 'cached' }]);
    await userEvent.click(await screen.findByRole('button', { name: 'quack.serviceActions Team' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'quack.delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(api.deleteQuackService).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'quack.delete' }));
    await waitFor(() => expect(api.deleteQuackService).toHaveBeenCalledWith('q1', expect.anything()));
    await waitFor(() => expect(client.getQueryData(['quack-metadata', 'q1', 'catalogs'])).toBeUndefined());
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
  });

  it('renders failed metadata with an explicit retry, never a success indicator', async () => {
    api.getQuackCatalogs.mockRejectedValueOnce(new Error('Synthetic server unavailable'));
    view();
    fireEvent.click(await screen.findByRole('button', { name: 'Team' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Synthetic server unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'quack.retry' }));
    await screen.findByRole('button', { name: 'quack.expandNode mysql_named_but_duckdb' });
    expect(api.getQuackCatalogs).toHaveBeenCalledTimes(2);
  });

  it('filters only saved service metadata without querying remote table contents', async () => {
    view('tree', 'does-not-exist');
    expect(await screen.findByText('quack.noMatches')).toBeInTheDocument();
    expect(api.getQuackCatalogs).not.toHaveBeenCalled();
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
  });

  it('does not retain an old successful test after a connection revision changes', async () => {
    const { client } = view();
    await userEvent.click(await screen.findByRole('button', { name: 'quack.serviceActions Team' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'quack.testConnection' }));
    await screen.findByText('quack.testSucceeded');
    act(() => client.setQueryData(['quack-services'], [{ ...service, updated_at: '2026-11-03T02:00:00Z' }]));
    await waitFor(() => expect(screen.queryByText('quack.testSucceeded')).not.toBeInTheDocument());
    expect(api.testSavedQuackService).toHaveBeenCalledTimes(1);
  });

  it('escapes quoted and dotted identifiers without allowing extra statements', () => {
    expect(quackTableSQL('remote.catalog', 'my"schema', 'x; DROP TABLE orders')).toBe('SELECT * FROM "remote.catalog"."my""schema"."x; DROP TABLE orders" LIMIT 100;');
  });
});
