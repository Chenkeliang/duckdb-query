/**
 * DuckDB 表 API 路径与后端 duckdb_query 对齐
 * @see docs/API_PHASE_B_CALL_MAP.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosResponse } from 'axios';

const { getMock, deleteMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  deleteMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('../client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client')>();
  return {
    ...actual,
    apiClient: {
      get: getMock,
      delete: deleteMock,
      post: postMock,
    },
  };
});

import { getDuckDBTables, deleteDuckDBTable, refreshDuckDBTableMetadata } from '../tableApi';

function listResponse(items: unknown[]): AxiosResponse {
  return {
    data: {
      success: true,
      data: { items, total: items.length },
      messageCode: 'TABLES_RETRIEVED',
      message: 'ok',
      timestamp: '2026-01-01T00:00:00Z',
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as never,
  };
}

describe('getDuckDBTables', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('uses GET /api/duckdb/tables and maps table_name', async () => {
    getMock.mockResolvedValue(
      listResponse([{ table_name: 'orders', row_count: 42 }])
    );

    const tables = await getDuckDBTables();

    expect(getMock).toHaveBeenCalledWith('/api/duckdb/tables');
    expect(tables).toEqual([
      { name: 'orders', type: 'TABLE', row_count: 42, source_type: 'file' },
    ]);
  });
});

describe('deleteDuckDBTable', () => {
  beforeEach(() => {
    deleteMock.mockReset();
  });

  it('uses DELETE /api/duckdb/tables/{name}', async () => {
    deleteMock.mockResolvedValue({
      data: {
        success: true,
        data: { deleted_table: 't1' },
        messageCode: 'TABLE_DELETED',
        message: 'ok',
        timestamp: '2026-01-01T00:00:00Z',
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
    });

    await deleteDuckDBTable('my table');

    expect(deleteMock).toHaveBeenCalledWith('/api/duckdb/tables/my%20table');
  });
});

describe('refreshDuckDBTableMetadata', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it('uses POST /api/duckdb/table/{name}/refresh', async () => {
    postMock.mockResolvedValue({
      data: {
        success: true,
        data: { table: { name: 't1', columns: [] }, refreshed: true },
        messageCode: 'TABLE_REFRESHED',
        message: 'ok',
        timestamp: '2026-01-01T00:00:00Z',
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as never,
    });

    await refreshDuckDBTableMetadata('t1');

    expect(postMock).toHaveBeenCalledWith('/api/duckdb/table/t1/refresh');
  });
});
