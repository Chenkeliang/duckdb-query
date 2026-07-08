/**
 * showErrorToast：通用兜底错误码(OPERATION_FAILED 等)应展示后端 message 明细,
 * 而不是笼统翻译("操作失败")——否则异步任务提交失败等场景用户看不到真正原因(#7)。
 * 具体错误码(TABLE_NOT_FOUND 等)仍用其友好翻译。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TFunction } from 'i18next';
import type { ApiError } from '@/api';

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (msg: string, opts?: unknown) => toastError(msg, opts), success: vi.fn() },
}));

import { showErrorToast } from '../toastHelpers';

// 模拟 i18next：已知码返回翻译,未知码返回 defaultValue(即 code 本身)
const TRANSLATIONS: Record<string, string> = {
  'errors:OPERATION_FAILED': '操作失败',
  'errors:TABLE_NOT_FOUND': '表不存在',
};
const t = ((key: string, opts?: { defaultValue?: string }) =>
  TRANSLATIONS[key] ?? opts?.defaultValue ?? key) as unknown as TFunction;

const err = (code: string, message?: string): ApiError =>
  ({ name: 'ApiError', code, message: message ?? '' } as unknown as ApiError);

describe('showErrorToast generic-code detail (#7)', () => {
  beforeEach(() => toastError.mockClear());

  it('generic OPERATION_FAILED 展示后端 message 明细', () => {
    showErrorToast(t, err('OPERATION_FAILED', 'Failed to submit task: connection refused'));
    expect(toastError).toHaveBeenCalledWith(
      'Failed to submit task: connection refused',
      expect.anything()
    );
  });

  it('具体码 TABLE_NOT_FOUND 仍用友好翻译', () => {
    showErrorToast(t, err('TABLE_NOT_FOUND', 'Catalog Error: table missing'));
    expect(toastError).toHaveBeenCalledWith('表不存在', expect.anything());
  });

  it('generic 码但无 message 时回落到笼统翻译', () => {
    showErrorToast(t, err('OPERATION_FAILED'));
    expect(toastError).toHaveBeenCalledWith('操作失败', expect.anything());
  });
});
