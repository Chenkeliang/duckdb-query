import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useQuackCatalogs, useQuackColumns, useQuackSchemas, useQuackServiceMutations, useQuackServices } from '../useQuackServices';

const api = vi.hoisted(() => ({ createQuackService: vi.fn(), updateQuackService: vi.fn(), deleteQuackService: vi.fn(), listQuackServices: vi.fn(), getQuackCatalogs: vi.fn(), getQuackSchemas: vi.fn(), getQuackTables: vi.fn(), getQuackColumns: vi.fn() }));
vi.mock('@/api', () => api);

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

beforeEach(() => vi.clearAllMocks());

describe('Quack shared server-state regression coverage (2026-11-03)', () => {
  it('shares the saved-service request between tree and management consumers', async () => {
    api.listQuackServices.mockResolvedValue([{ id: 'q1', name: 'Team' }]);
    const { wrapper } = setup();
    const first = renderHook(useQuackServices, { wrapper });
    const second = renderHook(useQuackServices, { wrapper });
    await waitFor(() => expect(first.result.current.services).toHaveLength(1));
    expect(second.result.current.services).toEqual(first.result.current.services);
    expect(api.listQuackServices).toHaveBeenCalledTimes(1);
  });

  it('keeps catalogs and same-named columns isolated by service and full table scope', async () => {
    api.getQuackCatalogs.mockImplementation(async (id: string) => [{ name: id }]);
    api.getQuackColumns.mockImplementation(async (id: string, _catalog: string, schema: string) => [{ name: `${id}-${schema}`, type: 'VARCHAR' }]);
    const { wrapper } = setup();
    const first = renderHook(() => useQuackCatalogs('q1'), { wrapper });
    const second = renderHook(() => useQuackCatalogs('q2'), { wrapper });
    const c1 = renderHook(() => useQuackColumns('q1', 'db', 'one', 'orders'), { wrapper });
    const c2 = renderHook(() => useQuackColumns('q1', 'db', 'two', 'orders'), { wrapper });
    await waitFor(() => expect(second.result.current.data).toEqual([{ name: 'q2' }]));
    expect(first.result.current.data).toEqual([{ name: 'q1' }]);
    await waitFor(() => expect(c2.result.current.data?.[0].name).toBe('q1-two'));
    expect(c1.result.current.data?.[0].name).toBe('q1-one');
  });

  it('does not request unopened metadata', () => {
    const { wrapper } = setup();
    renderHook(() => useQuackCatalogs('q1', false), { wrapper });
    renderHook(() => useQuackSchemas('q1', 'db', false), { wrapper });
    expect(api.getQuackCatalogs).not.toHaveBeenCalled();
    expect(api.getQuackSchemas).not.toHaveBeenCalled();
  });

  it('refreshes service lists after creation and removes only the edited service metadata', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(['quack-services'], [{ id: 'q1' }]);
    client.setQueryData(['quack-metadata', 'q1', 'catalogs'], [{ name: 'old' }]);
    client.setQueryData(['quack-metadata', 'q2', 'catalogs'], [{ name: 'untouched' }]);
    const { result } = renderHook(useQuackServiceMutations, { wrapper });
    const input = { name: 'Renamed', uri: 'quack:host' };
    api.updateQuackService.mockResolvedValue({ id: 'q1', ...input });
    await act(async () => { await result.current.update.mutateAsync({ id: 'q1', input }); });
    expect(client.getQueryData(['quack-metadata', 'q1', 'catalogs'])).toBeUndefined();
    expect(client.getQueryData(['quack-metadata', 'q2', 'catalogs'])).toEqual([{ name: 'untouched' }]);
    expect(client.getQueryState(['quack-services'])?.isInvalidated).toBe(true);
    api.createQuackService.mockResolvedValue({ id: 'q3', ...input });
    await act(async () => { await result.current.create.mutateAsync(input); });
    expect(api.createQuackService).toHaveBeenCalled();
  });
});
