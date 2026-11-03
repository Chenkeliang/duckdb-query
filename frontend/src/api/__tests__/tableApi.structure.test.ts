/** 2026-11-03: sidebar structure requests must explicitly avoid statistics/sample paths. */
import { beforeEach, expect, it, vi } from 'vitest';
const get = vi.hoisted(() => vi.fn());
vi.mock('../client', async original => ({ ...await original<typeof import('../client')>(), apiClient: { get } }));
import { getDuckDBTableStructure, getExternalTableStructure, getDuckDBTableDetail } from '../index';
const structure = { table_name: 'orders', columns: [{ name: 'amount', type: 'DECIMAL(38,19)' }], column_count: 1 };
beforeEach(() => { get.mockReset(); get.mockResolvedValue({ data: { success: true, data: structure } }); });
it('uses the existing local route with a safely encoded name and columns_only', async () => {
  expect(await getDuckDBTableStructure('odd /"table')).toEqual(structure);
  expect(get).toHaveBeenCalledExactlyOnceWith('/api/duckdb/tables/odd%20%2F%22table?columns_only=true');
});
it('keeps external connection/schema/table identity in metadata-only requests', async () => {
  expect(await getExternalTableStructure('db_conn-B', 'odd " table', 'odd/schema')).toEqual(structure);
  const url = new URL(get.mock.calls[0][0], 'http://localhost');
  expect(url.pathname).toBe('/api/datasources/databases/conn-B/tables/detail');
  expect(Object.fromEntries(url.searchParams)).toEqual({ table_name: 'odd " table', schema: 'odd/schema', columns_only: 'true' });
});
it('leaves default detail calls and their row counts unchanged', async () => {
  get.mockResolvedValue({ data: { success: true, data: { table: { ...structure, row_count: 7 } } } });
  expect((await getDuckDBTableDetail('orders')).row_count).toBe(7);
  expect(get).toHaveBeenCalledExactlyOnceWith('/api/duckdb/tables/orders');
});
it('propagates standardized request errors instead of disguising them as an empty schema', async () => {
  const error = Object.assign(new Error('Synthetic connection unavailable'), { code: 'CONNECTION_TEST_FAILED' });
  get.mockRejectedValue(error);
  await expect(getExternalTableStructure('conn', 'orders')).rejects.toBe(error);
});
