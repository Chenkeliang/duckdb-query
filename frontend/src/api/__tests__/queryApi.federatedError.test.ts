import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '../client';
import { executeFederatedQuery } from '../queryApi';

describe('executeFederatedQuery error metadata', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves normalized SQL diagnostics through the friendly error wrapper', async () => {
    const failure = Object.assign(new Error('query failed'), {
      code: 'QUERY_FAILED',
      messageCode: 'QUERY_FAILED',
      statusCode: 500,
      details: {
        sql_location: { line: 1, column: 8, end_column: 15 },
        sql_identity: { sha256: 'abc' },
      },
    });
    vi.spyOn(apiClient, 'post').mockRejectedValue(failure);

    await expect(
      executeFederatedQuery({ sql: 'SELECT missing', isPreview: false })
    ).rejects.toMatchObject({
      code: 'QUERY_FAILED',
      statusCode: 500,
      details: failure.details,
    });
  });
});
