/**
 * URL 导入 API 与后端 url_reader 路由/字段对齐（防回归）
 * @see docs/API_CONTRACT_FE_BE.md §5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosResponse } from 'axios';

const { postMock, getMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  getMock: vi.fn(),
}));

vi.mock('../client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../client')>();
  return {
    ...actual,
    apiClient: {
      post: postMock,
      get: getMock,
    },
  };
});

import { readFromUrl, getUrlInfo } from '../fileApi';

function successResponse<T>(data: T): AxiosResponse {
  return {
    data: {
      success: true,
      data,
      messageCode: 'URL_READ_SUCCESS',
      message: 'ok',
      timestamp: '2026-01-01T00:00:00Z',
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as never,
  };
}

describe('readFromUrl', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it('calls POST /api/read_from_url with header field (not has_header)', async () => {
    postMock.mockResolvedValue(
      successResponse({
        table_name: 't1',
        row_count: 10,
        columns: [],
      })
    );

    const result = await readFromUrl('https://example.com/a.csv', 't1', {
      hasHeader: false,
      delimiter: ';',
      encoding: 'utf-8',
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0][0]).toBe('/api/read_from_url');
    expect(postMock.mock.calls[0][1]).toEqual({
      url: 'https://example.com/a.csv',
      table_alias: 't1',
      header: false,
      delimiter: ';',
      encoding: 'utf-8',
      import_mode: 'auto',
      prefer_native: true,
    });
    expect(result.table_name).toBe('t1');
    expect(result.success).toBe(true);
  });
});

describe('getUrlInfo', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('calls GET /api/url_info and maps content_length to size', async () => {
    getMock.mockResolvedValue(
      successResponse({
        file_type: 'csv',
        content_type: 'text/csv',
        content_length: 12345,
        url: 'https://example.com/a.csv',
      })
    );

    const result = await getUrlInfo('https://example.com/a.csv');

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock.mock.calls[0][0]).toBe(
      '/api/url_info?url=' + encodeURIComponent('https://example.com/a.csv')
    );
    expect(result.file_type).toBe('csv');
    expect(result.size).toBe(12345);
  });
});
