/**
 * 异步任务对话框的行数范围选择(验收 #4/#5 提交面、#9):
 *  - 默认未勾选 → payload.apply_row_limit === false(全量);
 *  - 勾选 → true;
 *  - 关闭再打开 → 恢复默认未勾选(组件常驻挂载,靠 [open] 重置 effect)。
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mocks } = vi.hoisted(() => ({
  mocks: { submit: vi.fn(async (_payload: unknown) => ({ task_id: 't1' })) },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: unknown) =>
      typeof defaultValue === 'string' ? defaultValue : key,
    i18n: { language: 'zh', changeLanguage: vi.fn() },
  }),
}));
vi.mock('@/utils/toastHelpers', () => ({
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
  handleApiErrorToast: vi.fn(),
}));
vi.mock('@/api', () => ({
  submitAsyncQuery: mocks.submit,
  toAttachDatabasesPayload: () => undefined,
}));

import { AsyncTaskDialog } from '../AsyncTaskDialog';

function renderDialog(open: boolean, onOpenChange = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AsyncTaskDialog open={open} onOpenChange={onOpenChange} sql="SELECT * FROM t" />
    </QueryClientProvider>
  );
}

const limitCheckbox = () => screen.getByRole('checkbox');
const submitButton = () => screen.getByRole('button', { name: '提交任务' });

describe('AsyncTaskDialog 行数范围', () => {
  beforeEach(() => mocks.submit.mockClear());

  it('默认未勾选:提交 apply_row_limit=false(全量)', async () => {
    renderDialog(true);
    expect((limitCheckbox() as HTMLElement).getAttribute('data-state')).toBe('unchecked');
    fireEvent.click(submitButton());
    await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
    expect(mocks.submit.mock.calls[0][0]).toMatchObject({
      sql: 'SELECT * FROM t',
      apply_row_limit: false,
    });
  });

  it('勾选:提交 apply_row_limit=true', async () => {
    renderDialog(true);
    fireEvent.click(limitCheckbox());
    fireEvent.click(submitButton());
    await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
    expect(mocks.submit.mock.calls[0][0]).toMatchObject({ apply_row_limit: true });
  });

  it('验收 #9:关闭再打开恢复默认未勾选', async () => {
    const { rerender } = renderDialog(true);
    const qcWrap = (ui: React.ReactElement) => ui; // rerender 复用同一 provider 树
    fireEvent.click(limitCheckbox());
    expect((limitCheckbox() as HTMLElement).getAttribute('data-state')).toBe('checked');

    // 关闭(组件保持挂载)→ 重新打开
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      qcWrap(
        <QueryClientProvider client={qc}>
          <AsyncTaskDialog open={false} onOpenChange={vi.fn()} sql="SELECT * FROM t" />
        </QueryClientProvider>
      )
    );
    rerender(
      qcWrap(
        <QueryClientProvider client={qc}>
          <AsyncTaskDialog open onOpenChange={vi.fn()} sql="SELECT * FROM t" />
        </QueryClientProvider>
      )
    );
    await waitFor(() =>
      expect((limitCheckbox() as HTMLElement).getAttribute('data-state')).toBe('unchecked')
    );
  });
});
