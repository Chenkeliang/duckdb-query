import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client', () => ({
  apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
  normalizeResponse: (r: { data: { data: unknown } }) => ({ data: r.data.data }),
  handleApiError: (e: unknown) => { throw e; },
}));

import { apiClient } from '../client';
import { getAiSettings, saveAiSettings, testProvider } from '../aiApi';

describe('aiApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getAiSettings GETs /api/settings/ai', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { enabled: false, providers: [] } } });
    const out = await getAiSettings();
    expect(apiClient.get).toHaveBeenCalledWith('/api/settings/ai');
    expect(out.enabled).toBe(false);
  });

  it('saveAiSettings PUTs the payload', async () => {
    (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { saved: true } } });
    await saveAiSettings({ enabled: true, default_provider: 'p1', providers: [], features: {} });
    expect(apiClient.put).toHaveBeenCalledWith('/api/settings/ai', expect.objectContaining({ enabled: true }));
  });

  it('testProvider POSTs the test endpoint', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { ok: true } } });
    const out = await testProvider('p1');
    expect(apiClient.post).toHaveBeenCalledWith('/api/ai/providers/p1/test');
    expect(out.ok).toBe(true);
  });
});
