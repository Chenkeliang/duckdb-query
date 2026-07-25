/**
 * AgentSseParser:事件跨 chunk 断开、心跳注释、损坏事件容错。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AgentSseParser, streamAgent, type AgentEvent } from '../agentApi';
import { setApiBaseUrl } from '../client';

const mocks = vi.hoisted(() => ({
  tauriFetch: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: mocks.tauriFetch }));

const EV = (name: string, data: object) =>
  `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

const streamResponse = (chunks: string[]) => ({
  ok: true,
  status: 200,
  body: new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  }),
});

afterEach(() => {
  vi.restoreAllMocks();
  mocks.tauriFetch.mockReset();
  setApiBaseUrl('');
  delete (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

describe('AgentSseParser', () => {
  it('parses complete events with names and payloads', () => {
    const p = new AgentSseParser();
    const events = p.push(
      EV('run_started', { run_id: 'r1', session_id: null, limits: { steps: 6, sql_calls: 3, seconds: 90, llm_calls: 7 } }) +
        EV('answer', { run_id: 'r1', result: { content: 'ok', sql: null, evidence: [] }, termination_reason: 'completed' }),
    );
    expect(events.map((e) => e.event)).toEqual(['run_started', 'answer']);
    const ans = events[1] as Extract<AgentEvent, { event: 'answer' }>;
    expect((ans.result as { content: string }).content).toBe('ok');
  });

  it('handles an event split across chunks', () => {
    const p = new AgentSseParser();
    const whole = EV('tool_started', {
      run_id: 'r1', tool_call_id: 't1', tool: 'run_query', args_summary: 'SELECT …',
    });
    const cut = Math.floor(whole.length / 2);
    expect(p.push(whole.slice(0, cut))).toEqual([]);
    const events = p.push(whole.slice(cut));
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('tool_started');
  });

  it('ignores heartbeat comments and keeps subsequent events', () => {
    const p = new AgentSseParser();
    const events = p.push(': ka\n\n' + EV('done', { run_id: 'r1', usage: { llm_calls: 1, tool_calls: 0, sql_calls: 0, elapsed_ms: 5 } }));
    expect(events.map((e) => e.event)).toEqual(['done']);
  });

  it('drops a corrupted event without breaking the stream', () => {
    const p = new AgentSseParser();
    const events = p.push('event: answer\ndata: {broken\n\n' + EV('done', { run_id: 'r1', usage: { llm_calls: 1, tool_calls: 0, sql_calls: 0, elapsed_ms: 5 } }));
    expect(events.map((e) => e.event)).toEqual(['done']);
  });
});

describe('streamAgent transport', () => {
  const request = { mode: 'data_qa' as const, input: { messages: [{ role: 'user', content: 'count' }] } };

  it('uses the Tauri HTTP stream in the desktop app', async () => {
    (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    setApiBaseUrl('http://127.0.0.1:54321');
    const nativeFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(streamResponse([]) as Response);
    mocks.tauriFetch.mockResolvedValue(
      streamResponse([
        EV('run_started', { run_id: 'r1', session_id: null, limits: { steps: 6, sql_calls: 3, seconds: 90, llm_calls: 7 } }),
        EV('answer', { run_id: 'r1', result: { content: '9', sql: 'SELECT 9', evidence: ['t1'] }, termination_reason: 'completed' }),
      ]) as Response,
    );
    const events: AgentEvent[] = [];

    await streamAgent(request, { onEvent: (event) => events.push(event) });

    expect(mocks.tauriFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:54321/api/ai/agent/stream',
      expect.any(Object),
    );
    expect(nativeFetch).not.toHaveBeenCalled();
    expect(events.map((event) => event.event)).toEqual(['run_started', 'answer']);
  });

  it('keeps native fetch for the browser build', async () => {
    const nativeFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      streamResponse([EV('done', { run_id: 'r1', session_id: null, usage: { steps: 1, llm_calls: 1, tool_calls: 0, sql_calls: 0, elapsed_ms: 5 } })]) as Response,
    );
    const events: AgentEvent[] = [];

    await streamAgent(request, { onEvent: (event) => events.push(event) });

    expect(nativeFetch).toHaveBeenCalledOnce();
    expect(mocks.tauriFetch).not.toHaveBeenCalled();
    expect(events.map((event) => event.event)).toEqual(['done']);
  });

  it('passes AbortSignal to the Tauri HTTP stream', async () => {
    (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const controller = new AbortController();
    mocks.tauriFetch.mockResolvedValue(streamResponse([]) as Response);

    await streamAgent(request, { onEvent: vi.fn(), signal: controller.signal });

    expect(mocks.tauriFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it('normalizes Tauri cancellation to AbortError', async () => {
    (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const controller = new AbortController();
    mocks.tauriFetch.mockImplementation(async () => {
      controller.abort();
      throw new Error('Request cancelled');
    });

    await expect(
      streamAgent(request, { onEvent: vi.fn(), signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
