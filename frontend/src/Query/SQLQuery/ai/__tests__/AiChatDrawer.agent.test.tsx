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

vi.mock('@/api/dataSourceApi', () => ({
  listDatabaseConnections: vi.fn().mockResolvedValue({ success: true, connections: [] }),
}));

vi.mock('@/api/databaseSchemasApi', () => ({
  listConnectionTablesFlat: vi.fn().mockResolvedValue([]),
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

    // 内容打字机渐进呈现,最终完整出现(B)
    await waitFor(() => expect(screen.getByText('已支付 2 笔')).toBeTruthy());
    // 步骤在答案到达后自动折叠成摘要(A);点开摘要才看到探查明细
    fireEvent.click(screen.getByText(/使用了/));
    expect(screen.getByText('run_query')).toBeTruthy();
    expect(screen.getByText('returned 2 rows')).toBeTruthy();
    expect(screen.getByText('t1')).toBeTruthy(); // evidence 徽标

    fireEvent.click(screen.getByText('插入编辑器'));
    expect(onInsert).toHaveBeenCalledWith(
      "SELECT count(*) FROM orders WHERE status='paid'",
    );
  });

  it('auto-collapses tool steps into a summary after the answer, expandable', async () => {
    mocks.streamAgent.mockImplementation(async (_body, { onEvent }) => {
      onEvent({ event: 'run_started', run_id: 'r1', session_id: null, limits: { steps: 6, sql_calls: 3, seconds: 90, llm_calls: 7 } });
      onEvent({ event: 'tool_started', run_id: 'r1', tool_call_id: 't1', tool: 'search_tables', args_summary: 'orders' });
      onEvent({ event: 'tool_completed', run_id: 'r1', tool_call_id: 't1', tool: 'search_tables', ok: true, ui_summary: 'found 1 table', truncated: false, elapsed_ms: 5 });
      onEvent({ event: 'answer', run_id: 'r1', result: { content: '结论', sql: null, evidence: [] }, termination_reason: 'completed' });
      onEvent({ event: 'done', run_id: 'r1', session_id: null, usage: { llm_calls: 2, tool_calls: 1, sql_calls: 0, elapsed_ms: 100 } });
    });
    renderDrawer();
    fireEvent.change(screen.getByPlaceholderText(/问数据智能体/), { target: { value: 'x' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/问数据智能体/), { key: 'Enter' });

    // 答案到达 → 步骤自动折叠:摘要出现,探查明细从 DOM 收起
    await waitFor(() => expect(screen.getByText(/使用了/)).toBeTruthy());
    expect(screen.queryByText('search_tables')).toBeNull();
    // 点摘要展开 → 明细可见
    fireEvent.click(screen.getByText(/使用了/));
    expect(screen.getByText('search_tables')).toBeTruthy();
    expect(screen.getByText('found 1 table')).toBeTruthy();
  });

  it('never leaves a perpetual spinner when the stream ends with no answer/error', async () => {
    // 模拟连接中断:只有 run_started,随后流结束(无 answer/无 error)
    mocks.streamAgent.mockImplementation(async (_body, { onEvent }) => {
      onEvent({ event: 'run_started', run_id: 'r1', session_id: null, limits: { steps: 6, sql_calls: 3, seconds: 90, llm_calls: 7 } });
      // 流正常结束,但从未给终止事件
    });
    renderDrawer();
    fireEvent.change(screen.getByPlaceholderText(/问数据智能体/), { target: { value: 'hi' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/问数据智能体/), { key: 'Enter' });
    await waitFor(() => expect(screen.getByText(/连接中断/)).toBeTruthy());
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
    // 页面只显示本地化文案:后端英文明细(内部标识)绝不出现在气泡里
    expect(screen.queryByText(/model failed to follow/i)).toBeNull();
  });

  it('shows a localized message when the request itself fails (no raw English)', async () => {
    mocks.streamAgent.mockImplementation(async () => {
      throw new Error('Load failed'); // WKWebView/网络层原始英文
    });
    renderDrawer();
    fireEvent.change(screen.getByPlaceholderText(/问数据智能体/), { target: { value: 'hi' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/问数据智能体/), { key: 'Enter' });
    await waitFor(() => expect(screen.getByText(/智能体运行失败/)).toBeTruthy());
    expect(screen.queryByText(/Load failed/)).toBeNull();
  });

  it('shows a localized message for an unmapped termination reason (no raw code)', async () => {
    mocks.streamAgent.mockImplementation(async (_body, { onEvent }) => {
      onEvent({ event: 'run_started', run_id: 'r1', session_id: null, limits: { steps: 6, sql_calls: 3, seconds: 90, llm_calls: 7 } });
      onEvent({ event: 'error', run_id: 'r1', termination_reason: 'some_new_reason', message: 'internal detail' });
    });
    renderDrawer();
    fireEvent.change(screen.getByPlaceholderText(/问数据智能体/), { target: { value: 'hi' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/问数据智能体/), { key: 'Enter' });
    await waitFor(() => expect(screen.getByText(/运行未正常结束/)).toBeTruthy());
    expect(screen.queryByText(/some_new_reason|internal detail/)).toBeNull();
  });

  it('shows the scope bar and sends the scope with the question', async () => {
    let sent: Record<string, unknown> | null = null;
    mocks.streamAgent.mockImplementation(async (body, { onEvent }) => {
      sent = body as Record<string, unknown>;
      onEvent({ event: 'answer', run_id: 'r1', result: { content: 'ok', sql: null, evidence: [] }, termination_reason: 'completed' });
    });
    render(
      <AiChatDrawer
        open
        onClose={() => {}}
        selectedTables={['orders']}
        attachDatabases={[{ alias: 'mysql_sorder', connectionId: 'db_sorder' }]}
        onInsertSQL={vi.fn()}
        locale="zh"
      />,
    );
    // 作用域常驻条:本地 + 已挂载连接,末尾是「添加数据源」
    expect(screen.getByText(/本地 DuckDB/)).toBeTruthy();
    expect(screen.getByText(/mysql_sorder/)).toBeTruthy();
    expect(screen.getByText('添加数据源')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/问数据智能体/), { target: { value: '多少笔' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/问数据智能体/), { key: 'Enter' });
    await waitFor(() => expect(sent).not.toBeNull());
    const ctx = (sent as unknown as { context: { tables: string[]; attach_databases: {alias:string; connection_id:string}[] } }).context;
    expect(ctx.tables).toContain('orders');
    // 连接必须被授权,否则后端 guard 会拒掉一切远端查询
    expect(ctx.attach_databases).toEqual([{ alias: 'mysql_sorder', connection_id: 'db_sorder' }]);
  });

  it('removes a connection from scope and stops sending it', async () => {
    let sent: Record<string, unknown> | null = null;
    mocks.streamAgent.mockImplementation(async (body, { onEvent }) => {
      sent = body as Record<string, unknown>;
      onEvent({ event: 'answer', run_id: 'r1', result: { content: 'ok', sql: null, evidence: [] }, termination_reason: 'completed' });
    });
    render(
      <AiChatDrawer
        open onClose={() => {}} selectedTables={[]}
        attachDatabases={[{ alias: 'mysql_sorder', connectionId: 'db_sorder' }]}
        locale="zh"
      />,
    );
    fireEvent.click(screen.getByLabelText('移出作用域'));
    fireEvent.change(screen.getByPlaceholderText(/问数据智能体/), { target: { value: 'hi' } });
    fireEvent.keyDown(screen.getByPlaceholderText(/问数据智能体/), { key: 'Enter' });
    await waitFor(() => expect(sent).not.toBeNull());
    const ctx = (sent as unknown as { context: { attach_databases: unknown[] } }).context;
    expect(ctx.attach_databases).toEqual([]);  // 所见即所查
  });
});
