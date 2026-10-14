import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ stream: vi.fn(), tables: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, fallback?: string, opts?: Record<string, unknown>) => Object.entries(opts ?? {}).reduce((text, [name, value]) => text.replace(`{{${name}}}`, String(value)), fallback ?? key) }) }));
vi.mock('@/api', () => ({ streamAgent: mocks.stream, getDuckDBTables: mocks.tables }));
vi.mock('@/api/dataSourceApi', () => ({ listDatabaseConnections: vi.fn(async () => ({ success: true, connections: [] })) }));
vi.mock('@/api/databaseSchemasApi', () => ({ listConnectionTablesFlat: vi.fn(async () => []) }));
import { AiChatDrawer } from '../AiChatDrawer';
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); vi.clearAllMocks(); mocks.stream.mockResolvedValue(undefined); mocks.tables.mockResolvedValue([{ name: 'customers', row_count: 5 }]); Element.prototype.scrollTo = vi.fn(); });
afterEach(cleanup);
function drawer(currentSql = 'SELECT * FROM orders', selectedTables = ['orders']) {
  render(<AiChatDrawer open onClose={() => {}} selectedTables={selectedTables} currentSql={currentSql} locale="zh" />);
  return screen.getByPlaceholderText(/问数据智能体/);
}
it('preserves multiline SQL and submits once with Enter', async () => {
  const input = drawer(); expect(input.tagName).toBe('TEXTAREA');
  const question = '解释这段 SQL\nSELECT order_id\nFROM orders';
  fireEvent.change(input, { target: { value: question } }); fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(mocks.stream).toHaveBeenCalledOnce());
  expect(mocks.stream.mock.calls[0][0].input.messages.at(-1).content).toBe(question);
});
it('Shift+Enter does not send a draft', () => {
  const input = drawer(); fireEvent.change(input, { target: { value: '下一行' } });
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true }); expect(mocks.stream).not.toHaveBeenCalled();
});
it('IME composition and keyCode 229 do not send; Enter afterwards sends once', async () => {
  const input = drawer(); fireEvent.change(input, { target: { value: '订单' } });
  fireEvent.compositionStart(input); fireEvent.keyDown(input, { key: 'Enter' });
  fireEvent.compositionEnd(input); fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
  expect(mocks.stream).not.toHaveBeenCalled(); fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(mocks.stream).toHaveBeenCalledOnce());
});
it('quick explanation fills the composer for review instead of sending', () => {
  const input = drawer(); fireEvent.click(screen.getByRole('button', { name: '解释当前 SQL' }));
  expect((input as HTMLTextAreaElement).value).toContain('SELECT * FROM orders');
  expect(input).toHaveFocus(); expect(mocks.stream).not.toHaveBeenCalled();
});
it('quick optimization fills the existing optimization prompt', () => {
  const input = drawer(); fireEvent.click(screen.getByRole('button', { name: '优化当前 SQL' }));
  expect((input as HTMLTextAreaElement).value).toContain('请帮我优化这段 SQL');
  expect(mocks.stream).not.toHaveBeenCalled();
});
it('SQL shortcuts are disabled without a current SQL', () => {
  drawer(''); expect(screen.getByRole('button', { name: '解释当前 SQL' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '优化当前 SQL' })).toBeDisabled();
});
it('shows the first scoped table and additional count without changing scope', () => {
  drawer('SELECT * FROM orders', ['orders', 'customers']);
  expect(screen.getByText('orders', { selector: 'span' })).toBeVisible(); expect(screen.getByText('+1')).toBeVisible();
  const edit = screen.getByRole('button', { name: /编辑该数据源的范围/ });
  const remove = screen.getByRole('button', { name: /移出作用域/ });
  expect(edit.contains(remove)).toBe(false); expect(mocks.stream).not.toHaveBeenCalled();
});
it('Enter selects a multiline @ mention before sending', async () => {
  const input = drawer(); fireEvent.change(input, { target: { value: '检查订单\n@cust' } });
  await screen.findByRole('button', { name: /^customers/ }); fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  expect(mocks.stream).not.toHaveBeenCalled(); expect(input).toHaveValue('检查订单\n@cust');
  fireEvent.keyDown(input, { key: 'Enter' }); expect(mocks.stream).not.toHaveBeenCalled();
  expect(input).toHaveValue('检查订单\n');
  fireEvent.change(input, { target: { value: '检查订单与客户的差异' } }); fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(mocks.stream).toHaveBeenCalledOnce());
  expect(mocks.stream.mock.calls[0][0].context.scope.local_tables.sort()).toEqual(['customers', 'orders']);
});

it('closes the more-actions menu when returning to the composer without losing the draft', () => {
  const input = drawer(); fireEvent.change(input, { target: { value: '保留这段草稿' } });
  const more = screen.getByRole('button', { name: '更多动作' }); fireEvent.click(more);
  expect(more).toHaveAttribute('aria-expanded', 'true'); fireEvent.focus(input);
  expect(more).toHaveAttribute('aria-expanded', 'false'); expect(input).toHaveValue('保留这段草稿');
  expect(mocks.stream).not.toHaveBeenCalled();
});
