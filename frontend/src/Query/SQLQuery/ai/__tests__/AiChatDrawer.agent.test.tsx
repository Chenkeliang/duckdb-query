/**
 * AiChatDrawer(纯 Agent):事件驱动的步骤条与答案渲染、插入编辑器、诚实终止。
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDuckDBTables: vi.fn().mockResolvedValue([]),
  streamAgent: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock('@/api', () => ({
  getDuckDBTables: mocks.getDuckDBTables,
  streamAgent: mocks.streamAgent,
}));

import { AiChatDrawer } from '../AiChatDrawer';

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom 未实现元素级 scrollTo(组件滚动到底部的效果依赖它)
  Element.prototype.scrollTo = vi.fn();
});

function renderDrawer(onInsertSQL = vi.fn()) {
  render(
    <AiChatDrawer
      open
      onClose={() => {}}
      selectedTables={['orders']}
      onInsertSQL={onInsertSQL}
      locale="zh"
    />,
  );
  return onInsertSQL;
}

describe('AiChatDrawer agent mode', () => {
  it('renders steps and final answer from the event stream, insert works', async () => {
    mocks.streamAgent.mockImplementation(async (_body, { onEvent }) => {
      onEvent({ event: 'run_started', run_id: 'r1', session_id: null, limits: { steps: 6, sql_calls: 3, seconds: 90, llm_calls: 7 } });
      onEvent({ event: 'tool_started', run_id: 'r1', tool_call_id: 't1', tool: 'run_query', args_summary: 'SELECT …' });
      onEvent({ event: 'tool_completed', run_id: 'r1', tool_call_id: 't1', tool: 'run_query', ok: true, ui_summary: 'returned 2 rows', truncated: false, elapsed_ms: 12 });
      onEvent({ event: 'answer', run_id: 'r1', result: { content: '已支付 2 笔', sql: "SELECT count(*) FROM orders WHERE status='paid'", evidence: ['t1'] }, termination_reason: 'completed' });
      onEvent({ event: 'done', run_id: 'r1', session_id: null, usage: { llm_calls: 2, tool_calls: 1, sql_calls: 1, elapsed_ms: 900 } });
    });
    const onInsert = renderDrawer();

    fireEvent.change(screen.getByPlaceholderText(/问数据智能体/), {
      target: { value: '已支付几笔' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/问数据智能体/), { key: 'Enter' });

    await waitFor(() => expect(screen.getByText('已支付 2 笔')).toBeTruthy());
    expect(screen.getByText('run_query')).toBeTruthy();
    expect(screen.getByText('returned 2 rows')).toBeTruthy();
    expect(screen.getByText('t1')).toBeTruthy(); // evidence 徽标

    fireEvent.click(screen.getByText('插入编辑器'));
    expect(onInsert).toHaveBeenCalledWith(
      "SELECT count(*) FROM orders WHERE status='paid'",
    );
  });

  it('shows honest termination on error events', async () => {
    mocks.streamAgent.mockImplementation(async (_body, { onEvent }) => {
      onEvent({ event: 'run_started', run_id: 'r1', session_id: null, limits: { steps: 6, sql_calls: 3, seconds: 90, llm_calls: 7 } });
      onEvent({ event: 'error', run_id: 'r1', termination_reason: 'protocol_violation', message: 'bad json' });
      onEvent({ event: 'done', run_id: 'r1', session_id: null, usage: { llm_calls: 2, tool_calls: 0, sql_calls: 0, elapsed_ms: 100 } });
    });
    renderDrawer();
    fireEvent.change(screen.getByPlaceholderText(/问数据智能体/), {
      target: { value: 'hi' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/问数据智能体/), { key: 'Enter' });
    await waitFor(() =>
      expect(screen.getByText(/模型未遵守协议/)).toBeTruthy(),
    );
  });
});
