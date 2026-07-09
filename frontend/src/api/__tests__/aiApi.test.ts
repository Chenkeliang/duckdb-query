import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../client', () => ({
  apiClient: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
  normalizeResponse: (r: { data: { data: unknown } }) => ({ data: r.data.data }),
  handleApiError: (e: unknown) => { throw e; },
}));

import { apiClient } from '../client';
import { getAiSettings, saveAiSettings, testProvider, errorFix, explainSql, nlToSql, chat } from '../aiApi';

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

  it('errorFix POSTs /api/ai/error-fix and unwraps the result', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { explanation: 'e', fixed_sql: 'SELECT 1', safe: true } },
    });
    const out = await errorFix('SELECT x', 'Binder Error', { tables: ['t'], locale: 'zh' });
    expect(apiClient.post).toHaveBeenCalledWith('/api/ai/error-fix', {
      sql: 'SELECT x', error: 'Binder Error', tables: ['t'], attach_databases: [], locale: 'zh',
    });
    expect(out.fixed_sql).toBe('SELECT 1');
    expect(out.safe).toBe(true);
  });

  it('explainSql POSTs /api/ai/explain-sql and unwraps explanation', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { explanation: '这条 SQL 取所有订单' } },
    });
    const out = await explainSql('SELECT * FROM orders', { locale: 'zh' });
    expect(apiClient.post).toHaveBeenCalledWith('/api/ai/explain-sql', {
      sql: 'SELECT * FROM orders', locale: 'zh',
    });
    expect(out.explanation).toBe('这条 SQL 取所有订单');
  });

  it('nlToSql POSTs /api/ai/nl-to-sql with tables and unwraps result', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { sql: 'SELECT 1', used_tables: ['orders'], safe: true } },
    });
    const out = await nlToSql('多少订单', { tables: ['orders'], locale: 'zh' });
    expect(apiClient.post).toHaveBeenCalledWith('/api/ai/nl-to-sql', {
      question: '多少订单', tables: ['orders'], locale: 'zh',
    });
    expect(out.sql).toBe('SELECT 1');
    expect(out.safe).toBe(true);
    expect(out.used_tables).toEqual(['orders']);
  });

  it('chat POSTs current_sql when currentSql is provided (数据助手需看到工作台当前SQL)', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { content: '好的' } },
    });
    const out = await chat(
      [{ role: 'user', content: '在当前SQL里加上rules的关联' }],
      { tables: ['alerts'], locale: 'zh', currentSql: 'SELECT * FROM alerts' },
    );
    expect(apiClient.post).toHaveBeenCalledWith('/api/ai/chat', {
      messages: [{ role: 'user', content: '在当前SQL里加上rules的关联' }],
      tables: ['alerts'],
      attach_databases: [],
      locale: 'zh',
      current_sql: 'SELECT * FROM alerts',
    });
    expect(out.content).toBe('好的');
  });

  it('chat 不传 currentSql 时省略 current_sql 字段', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { content: '好的' } },
    });
    await chat([{ role: 'user', content: 'hi' }], { tables: [], locale: 'zh' });
    expect(apiClient.post).toHaveBeenCalledWith('/api/ai/chat', {
      messages: [{ role: 'user', content: 'hi' }],
      tables: [],
      attach_databases: [],
      locale: 'zh',
    });
  });
});
