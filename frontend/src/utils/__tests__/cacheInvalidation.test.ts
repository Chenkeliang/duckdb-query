import { describe, it, expect, vi } from 'vitest';

import {
  invalidateAfterFileUpload,
  invalidateAfterTableDelete,
  invalidateAfterTableCreate,
  invalidateAllDataCaches,
} from '../cacheInvalidation';
import { TABLE_COLUMNS_QUERY_KEY } from '@/hooks/useTableColumns';

// 最小 QueryClient mock：只需要 invalidateQueries
function makeClient() {
  return {
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  } as unknown as import('@tanstack/react-query').QueryClient;
}

function invalidatedKeys(client: ReturnType<typeof makeClient>): unknown[][] {
  return (client.invalidateQueries as ReturnType<typeof vi.fn>).mock.calls
    .map(([arg]) => (arg as { queryKey?: unknown[] })?.queryKey)
    .filter(Boolean) as unknown[][];
}

function invalidatesTableColumns(client: ReturnType<typeof makeClient>): boolean {
  const target = JSON.stringify(TABLE_COLUMNS_QUERY_KEY);
  return invalidatedKeys(client).some((k) => JSON.stringify(k) === target);
}

describe('cacheInvalidation also invalidates per-table columns', () => {
  it('invalidateAfterFileUpload invalidates table-columns', async () => {
    const client = makeClient();
    await invalidateAfterFileUpload(client);
    expect(invalidatesTableColumns(client)).toBe(true);
  });

  it('invalidateAfterTableDelete invalidates table-columns', async () => {
    const client = makeClient();
    await invalidateAfterTableDelete(client);
    expect(invalidatesTableColumns(client)).toBe(true);
  });

  it('invalidateAfterTableCreate invalidates table-columns', async () => {
    const client = makeClient();
    await invalidateAfterTableCreate(client);
    expect(invalidatesTableColumns(client)).toBe(true);
  });

  it('invalidateAllDataCaches invalidates table-columns', async () => {
    const client = makeClient();
    await invalidateAllDataCaches(client);
    expect(invalidatesTableColumns(client)).toBe(true);
  });
});
