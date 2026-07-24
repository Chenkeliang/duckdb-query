/**
 * AgentSseParser:事件跨 chunk 断开、心跳注释、损坏事件容错。
 */
import { describe, expect, it } from 'vitest';

import { AgentSseParser, type AgentEvent } from '../agentApi';

const EV = (name: string, data: object) =>
  `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

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
