import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosResponse } from 'axios';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('../client', async importOriginal => ({ ...await importOriginal<typeof import('../client')>(), apiClient: http }));
import { createQuackService, deleteQuackService, executeQuackQuery, getQuackCatalogs, getQuackColumns, getQuackSchemas, getQuackTables, listQuackServices, testQuackService, testSavedQuackService, updateQuackService } from '../quackApi';

function success(data: unknown): AxiosResponse {
  return { data: { success: true, data, messageCode: 'OPERATION_SUCCESS', message: 'ok', timestamp: '2026-11-03T00:00:00Z' }, status: 200, statusText: 'OK', headers: {}, config: {} as never };
}

beforeEach(() => vi.resetAllMocks());

describe('Quack normalized HTTP contract (2026-11-03)', () => {
  it('unwraps lists without inventing remote catalog types', async () => {
    const service = { id: 'q1', name: 'Remote', uri: 'quack:localhost:9494', has_token: true };
    http.get.mockResolvedValueOnce(success({ items: [service], total: 1 }));
    expect(await listQuackServices()).toEqual([service]);
    http.get.mockResolvedValueOnce(success({ items: [{ name: 'mysql_orders', type: 'duckdb' }], total: 1 }));
    expect(await getQuackCatalogs('q/1')).toEqual([{ name: 'mysql_orders', type: 'duckdb' }]);
    expect(http.get).toHaveBeenLastCalledWith('/api/quack/services/q%2F1/catalogs');
  });

  it('sends create, replacement token, omitted update token, and config-only deletion', async () => {
    const input = { name: 'Team', uri: 'quack:localhost:9494' };
    http.post.mockResolvedValueOnce(success({ id: 'q1', ...input, has_token: true }));
    await createQuackService({ ...input, token: 'synthetic-token' });
    expect(http.post).toHaveBeenCalledWith('/api/quack/services', { ...input, token: 'synthetic-token' });
    http.put.mockResolvedValueOnce(success({ id: 'q1', ...input, has_token: true }));
    await updateQuackService('q1', input);
    expect(http.put).toHaveBeenCalledWith('/api/quack/services/q1', input);
    expect(http.put.mock.calls[0][1]).not.toHaveProperty('token');
    http.delete.mockResolvedValueOnce(success({ id: 'q1' }));
    await deleteQuackService('q1');
    expect(http.delete).toHaveBeenCalledWith('/api/quack/services/q1');
  });

  it('tests saved and unsaved services through explicit endpoints', async () => {
    const result = { connected: true, server_version: 'v2.0.0', application_read_only: true, server_read_only_verified: false };
    http.post.mockResolvedValue(success(result));
    expect(await testQuackService({ name: 'Team', uri: 'quack:host' })).toEqual(result);
    expect(http.post).toHaveBeenLastCalledWith('/api/quack/services/test', { name: 'Team', uri: 'quack:host' });
    expect(await testSavedQuackService('q1')).toEqual(result);
    expect(http.post).toHaveBeenLastCalledWith('/api/quack/services/q1/test');
  });

  it('keeps catalog, schema, and table parameters separate from paths', async () => {
    http.get.mockResolvedValue(success({ items: [{ name: 'one' }], total: 1 }));
    await getQuackSchemas('q1', 'a/b');
    expect(http.get).toHaveBeenLastCalledWith('/api/quack/services/q1/schemas', { params: { catalog: 'a/b' } });
    await getQuackTables('q1', 'a/b', 's"x');
    expect(http.get).toHaveBeenLastCalledWith('/api/quack/services/q1/tables', { params: { catalog: 'a/b', schema: 's"x' } });
    await getQuackColumns('q1', 'a/b', 's"x', 't.t');
    expect(http.get).toHaveBeenLastCalledWith('/api/quack/services/q1/columns', { params: { catalog: 'a/b', schema: 's"x', table: 't.t' } });
    expect(http.post).not.toHaveBeenCalled();
  });

  it('preserves query scalars and carries preview, cancellation header and signal', async () => {
    const data = { columns: ['amount'], data: [{ amount: '9007199254740993.1234' }], row_count: 1, column_types: [{ name: 'amount', duckdb_type: 'DECIMAL(38,4)' }] };
    http.post.mockResolvedValue(success(data));
    const signal = new AbortController().signal;
    expect(await executeQuackQuery('q1', 'SELECT amount FROM orders', { isPreview: false, requestId: 'req1', signal })).toEqual({ ...data, success: true });
    expect(http.post).toHaveBeenLastCalledWith('/api/quack/services/q1/execute', { sql: 'SELECT amount FROM orders', is_preview: false, request_id: 'req1' }, expect.objectContaining({ signal, headers: { 'X-Request-ID': 'req1' }, timeout: expect.any(Number) }));
    await executeQuackQuery('q1', 'SELECT 1');
    expect(http.post).toHaveBeenLastCalledWith('/api/quack/services/q1/execute', { sql: 'SELECT 1', is_preview: true }, expect.any(Object));
  });

  it('throws standard failures instead of returning apparent successful metadata', async () => {
    http.get.mockResolvedValue({ ...success(null), status: 404, data: { success: false, error: { code: 'QUACK_SERVICE_NOT_FOUND', message: 'Service not found' }, messageCode: 'QUACK_SERVICE_NOT_FOUND', timestamp: '2026-11-03T00:00:00Z' } });
    await expect(getQuackCatalogs('missing')).rejects.toMatchObject({ code: 'QUACK_SERVICE_NOT_FOUND' });
  });
});
