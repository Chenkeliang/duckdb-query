/**
 * #10 / NEW-D 回归：多 Tab 保留模式下，Tab A 慢查询在飞时刷新 Tab B，
 * 不能把 Tab A 的响应丢弃、让 Tab A 永久转圈。
 *
 * 修复前用单一全局 requestId ref：刷新 Tab B 会覆盖它，Tab A 的响应回来因
 * requestId 对不上被 early-return，Tab A 的 result.loading 永远停在 true。
 * 修复后按"槽位"(tab:${tabId} / 单结果槽) 各自追踪最新请求，互不覆盖。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, def?: string | Record<string, unknown>) =>
      typeof def === 'string' ? def : key,
  }),
}));
vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/utils/toastHelpers', () => ({
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
}));
vi.mock('@/utils/queryResultSettingsStorage', () => ({
  loadQueryResultSettings: () => ({ retainQueryResults: true }),
}));
vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>();
  return {
    ...actual,
    executeDuckDBSQL: vi.fn(),
    executeFederatedQuery: vi.fn(),
    cancelSyncQuery: vi.fn(),
  };
});

import * as api from '@/api';
import { useQueryWorkspace } from '../useQueryWorkspace';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const okResult = (label: string) => ({ data: [{ v: label }], columns: ['v'] });

describe('useQueryWorkspace multi-tab refresh race (#10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Tab A response is applied (not dropped) even if Tab B refresh started after', async () => {
    const exec = vi.mocked(api.executeDuckDBSQL);
    // 两次种子查询立即成功，各建一个结果 Tab
    exec.mockResolvedValueOnce(okResult('seedA') as never);
    exec.mockResolvedValueOnce(okResult('seedB') as never);

    const { result } = renderHook(() => useQueryWorkspace());

    await act(async () => {
      await result.current.handleQueryExecute('SELECT 1 AS v');
    });
    await act(async () => {
      await result.current.handleQueryExecute('SELECT 2 AS v');
    });

    await waitFor(() => expect(result.current.resultTabs.length).toBe(2));
    const [tabA, tabB] = result.current.resultTabs;

    // 刷新阶段：两次调用各返回一个受控 deferred（A 先发起，B 后发起）
    const dA = deferred<ReturnType<typeof okResult>>();
    const dB = deferred<ReturnType<typeof okResult>>();
    exec.mockReturnValueOnce(dA.promise as never);
    exec.mockReturnValueOnce(dB.promise as never);

    // 不 await：让两个刷新都处于在飞状态
    let refreshA!: Promise<void>;
    let refreshB!: Promise<void>;
    act(() => {
      refreshA = result.current.refreshResultTab(tabA.id);
    });
    act(() => {
      refreshB = result.current.refreshResultTab(tabB.id);
    });

    // 两个 Tab 现在都在 loading
    await waitFor(() => {
      const a = result.current.resultTabs.find((t) => t.id === tabA.id)!;
      const b = result.current.resultTabs.find((t) => t.id === tabB.id)!;
      expect(a.result.loading).toBe(true);
      expect(b.result.loading).toBe(true);
    });

    // A 先返回（此时 B 是"更晚发起"的那个）——修复前 A 会被全局 ref 判为过期丢弃
    await act(async () => {
      dA.resolve(okResult('freshA'));
      await refreshA;
    });

    const aAfter = result.current.resultTabs.find((t) => t.id === tabA.id)!;
    expect(aAfter.result.loading).toBe(false); // 关键：不再永久转圈
    expect(aAfter.result.data).toEqual([{ v: 'freshA' }]);

    // B 随后返回，也正常落地
    await act(async () => {
      dB.resolve(okResult('freshB'));
      await refreshB;
    });
    const bAfter = result.current.resultTabs.find((t) => t.id === tabB.id)!;
    expect(bAfter.result.loading).toBe(false);
    expect(bAfter.result.data).toEqual([{ v: 'freshB' }]);
  });

  it('re-refreshing the SAME tab supersedes the earlier in-flight request for that tab', async () => {
    const exec = vi.mocked(api.executeDuckDBSQL);
    exec.mockResolvedValueOnce(okResult('seed') as never);

    const { result } = renderHook(() => useQueryWorkspace());
    await act(async () => {
      await result.current.handleQueryExecute('SELECT 1 AS v');
    });
    await waitFor(() => expect(result.current.resultTabs.length).toBe(1));
    const tab = result.current.resultTabs[0];

    const d1 = deferred<ReturnType<typeof okResult>>();
    const d2 = deferred<ReturnType<typeof okResult>>();
    exec.mockReturnValueOnce(d1.promise as never);
    exec.mockReturnValueOnce(d2.promise as never);

    let r1!: Promise<void>;
    let r2!: Promise<void>;
    act(() => {
      r1 = result.current.refreshResultTab(tab.id);
    });
    act(() => {
      r2 = result.current.refreshResultTab(tab.id);
    });

    // 旧的先返回：应被丢弃（同一槽位已被更新请求取代），不覆盖成旧值
    await act(async () => {
      d1.resolve(okResult('stale'));
      await r1;
    });
    // 新的返回：这才是最终结果
    await act(async () => {
      d2.resolve(okResult('winner'));
      await r2;
    });

    const after = result.current.resultTabs.find((t) => t.id === tab.id)!;
    expect(after.result.loading).toBe(false);
    expect(after.result.data).toEqual([{ v: 'winner' }]);
  });
});
