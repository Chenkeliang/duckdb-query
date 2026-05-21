import { describe, it, expect, vi, beforeEach } from 'vitest';

const postMock = vi.hoisted(() => vi.fn());
const deleteMock = vi.hoisted(() => vi.fn());

vi.mock('../client', () => ({
  uploadClient: {
    post: postMock,
    delete: deleteMock,
  },
  normalizeResponse: (response: { data: { data: unknown } }) => ({
    data: response.data.data,
  }),
  handleApiError: (err: unknown) => err,
}));

import {
  CHUNKED_UPLOAD_THRESHOLD_BYTES,
  uploadFileAuto,
  uploadFileChunked,
} from '../fileApi';

describe('fileApi chunked upload', () => {
  beforeEach(() => {
    postMock.mockReset();
    deleteMock.mockReset();
  });

  it('uploadFileAuto uses single upload for small files', async () => {
    const file = new File(['a,b\n1,2'], 'small.csv', { type: 'text/csv' });
    postMock.mockResolvedValueOnce({
      data: {
        data: { file_id: 't1', row_count: 1 },
        success: true,
      },
    });

    const result = await uploadFileAuto(file, 'my_table');
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0][0]).toBe('/api/upload');
    expect(result.file_id).toBe('t1');
  });

  it('uploadFileChunked runs init, chunk, complete', async () => {
    const content = 'x'.repeat(CHUNKED_UPLOAD_THRESHOLD_BYTES + 100);
    const file = new File([content], 'big.csv', { type: 'text/csv' });

    postMock
      .mockResolvedValueOnce({
        data: {
          data: {
            upload_id: 'up-1',
            total_chunks: 2,
            chunk_size: CHUNKED_UPLOAD_THRESHOLD_BYTES,
          },
        },
      })
      .mockResolvedValueOnce({
        data: { data: { chunk_number: 0, progress: 50 } },
      })
      .mockResolvedValueOnce({
        data: { data: { chunk_number: 1, progress: 100 } },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            file_info: {
              source_id: 'big_table',
              row_count: 10,
              columns: ['x'],
            },
          },
        },
      });

    const result = await uploadFileChunked(file, 'big_table');
    expect(postMock).toHaveBeenCalledTimes(4);
    expect(postMock.mock.calls[0][0]).toBe('/api/upload/init');
    expect(postMock.mock.calls[1][0]).toBe('/api/upload/chunk');
    expect(postMock.mock.calls[3][0]).toBe('/api/upload/complete');
    expect(result.file_id).toBe('big_table');
  });
});
