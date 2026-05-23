/**
 * @see docs/API_CONTRACT_FE_BE.md §7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosResponse } from 'axios';
import { PivotQueryMode, AggregationFunction } from '@/types/pivotQuery';

const { postMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
}));

vi.mock('../client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client')>();
  return {
    ...actual,
    apiClient: {
      post: postMock,
    },
  };
});

import { generatePivotQuery, previewPivotQuery } from '../pivotQueryApi';

const config = { table_name: 'sales', filters: [], limit: 100 };
const pivotConfig = {
  rows: ['region'],
  columns: ['year'],
  values: [{ column: 'amount', aggregation: AggregationFunction.SUM }],
};

function successResponse<T>(data: T): AxiosResponse {
  return {
    data: {
      success: true,
      data,
      messageCode: 'PIVOT_QUERY_GENERATED',
      message: 'ok',
      timestamp: '2026-01-01T00:00:00Z',
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as never,
  };
}

describe('pivotQueryApi', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it('generatePivotQuery posts /api/pivot-query/generate', async () => {
    postMock.mockResolvedValueOnce(
      successResponse({
        sql: 'SELECT 1',
        base_sql: 'SELECT * FROM sales',
        pivot_sql: 'PIVOT ...',
        warnings: [],
        metadata: { mode: 'pivot' },
      })
    );

    const result = await generatePivotQuery(config, pivotConfig);

    expect(postMock).toHaveBeenCalledWith('/api/pivot-query/generate', {
      config,
      pivot_config: pivotConfig,
      attach_databases: undefined,
    });
    expect(result.mode).toBe(PivotQueryMode.PIVOT);
    expect(result.final_sql).toBe('SELECT 1');
    expect(result.base_sql).toBe('SELECT * FROM sales');
  });

  it('previewPivotQuery posts /api/pivot-query/preview and fills returned_rows', async () => {
    postMock.mockResolvedValueOnce(
      successResponse({
        data: [{ region: 'APAC', total: 1 }],
        columns: ['region', 'total'],
        row_count: 1,
        mode: 'pivot',
        errors: [],
        warnings: [],
      })
    );

    const result = await previewPivotQuery(config, pivotConfig, 500);

    expect(postMock).toHaveBeenCalledWith('/api/pivot-query/preview', {
      config,
      pivot_config: pivotConfig,
      limit: 500,
      attach_databases: undefined,
    });
    expect(result.returned_rows).toBe(1);
    expect(result.data).toHaveLength(1);
  });
});
