/** Independent cross-tests 2026-11-03: remote request ownership and mounted metadata after edits. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useQueryWorkspace } from '../useQueryWorkspace';
import { QuackServicesPanel } from '@/Quack/QuackServicesPanel';
import { QuackServiceForm } from '@/Quack/QuackServiceForm';
import type { QuackService } from '@/api';
import type { TableSource } from '@/types/queryWorkspace';

const api = vi.hoisted(() => ({
  executeDuckDBSQL: vi.fn(), executeFederatedQuery: vi.fn(), executeQuackQuery: vi.fn(),
  cancelSyncQuery: vi.fn(), moveQueryToBackground: vi.fn(),
  createQuackService: vi.fn(), updateQuackService: vi.fn(), deleteQuackService: vi.fn(),
  listQuackServices: vi.fn(), getQuackCatalogs: vi.fn(), getQuackSchemas: vi.fn(),
  getQuackTables: vi.fn(), getQuackColumns: vi.fn(),
  testQuackService: vi.fn(), testSavedQuackService: vi.fn(),
}));
vi.mock('@/api', () => api);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }));
vi.mock('@/utils/toastHelpers', () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn(), handleApiErrorToast: vi.fn() }));
vi.mock('@/utils/queryResultSettingsStorage', () => ({ loadQueryResultSettings: () => ({ retainQueryResults: true }) }));

const source = (id: string): TableSource => ({ type: 'quack', connectionId: id, connectionName: id });
const ok = (v: string) => ({ data: [{ v }], columns: ['v'], row_count: 1 });
const uncertainPromotionErrors = [
  { label: 'network', fields: { code: 'NETWORK_ERROR' } },
  { label: '503', fields: { code: 'SERVER_ERROR', statusCode: 503 } },
  { label: '408', fields: { code: 'TIMEOUT', statusCode: 408 } },
  { label: '499', fields: { code: 'REQUEST_ABORTED', statusCode: 499 } },
] as const;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
// Attach rejection handling as soon as execution starts, then assert the exact outcome after all races settle.
function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(() => undefined, (error: unknown) => error);
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected network'); }));
  vi.stubGlobal('XMLHttpRequest', class { constructor() { throw new Error('Unexpected XHR'); } });
  api.executeQuackQuery.mockImplementation(async (id: string) => ok(id));
  api.cancelSyncQuery.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Quack independent request ownership', () => {
  it('same SQL on two services preserves both result targets across reverse refresh completion', async () => {
    const { result } = renderHook(useQueryWorkspace);
    for (const id of ['A', 'B']) await act(async () => { await result.current.handleQueryExecute('SELECT * FROM orders', source(id)); });
    const [a, b] = result.current.resultTabs;
    const da = deferred<ReturnType<typeof ok>>();
    const db = deferred<ReturnType<typeof ok>>();
    api.executeQuackQuery.mockImplementation((id: string) => id === 'A' ? da.promise : db.promise);
    let ra!: Promise<void>; let rb!: Promise<void>;
    act(() => { ra = result.current.refreshResultTab(a.id); });
    act(() => { rb = result.current.refreshResultTab(b.id); });
    await act(async () => { db.resolve(ok('fresh B')); await rb; });
    await act(async () => { da.resolve(ok('fresh A')); await ra; });
    expect(result.current.resultTabs.map(t => [t.query.source.connectionId, t.result.data])).toEqual([
      ['A', [{ v: 'fresh A' }]], ['B', [{ v: 'fresh B' }]],
    ]);
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
  });

  it('closing a remote result while refresh is active prevents late resurrection', async () => {
    const { result } = renderHook(useQueryWorkspace);
    await act(async () => { await result.current.handleQueryExecute('SELECT 1', source('A')); });
    const id = result.current.resultTabs[0].id;
    const pending = deferred<ReturnType<typeof ok>>();
    api.executeQuackQuery.mockReturnValueOnce(pending.promise);
    let running!: Promise<void>;
    act(() => { running = result.current.refreshResultTab(id); });
    const signal = api.executeQuackQuery.mock.calls[1][2].signal as AbortSignal;
    act(() => result.current.closeResultTabById(id));
    expect(signal.aborted).toBe(true);
    await act(async () => { pending.resolve(ok('late A')); await running; });
    expect(result.current.resultTabs).toEqual([]);
  });

  /** Regression candidate 2026-11-03: aborting HTTP does not invoke Quack's independent remote control session. */
  it.each(['replace', 'close'] as const)('%s retires a remote request with server cancellation as well as HTTP abort', async action => {
    const { result } = renderHook(useQueryWorkspace);
    const old = deferred<ReturnType<typeof ok>>();
    let oldRequest: { requestId: string; signal: AbortSignal };
    let outcome!: Promise<unknown>;
    if (action === 'close') {
      await act(async () => { await result.current.handleQueryExecute('SELECT 1', source('A')); });
      api.executeQuackQuery.mockReturnValueOnce(old.promise);
      act(() => { outcome = captureRejection(result.current.refreshResultTab(result.current.resultTabs[0].id)); });
      oldRequest = api.executeQuackQuery.mock.calls[1][2];
      act(() => result.current.closeResultTabById(result.current.resultTabs[0].id));
      expect(result.current.resultTabs).toEqual([]);
    } else {
      api.executeQuackQuery.mockReturnValueOnce(old.promise);
      act(() => { outcome = captureRejection(result.current.handleQueryExecute('SELECT slow_A', source('A'))); });
      oldRequest = api.executeQuackQuery.mock.calls[0][2];
      await act(async () => { await result.current.handleQueryExecute('SELECT fast_B', source('B')); });
      expect(result.current.lastQuery?.source.connectionId).toBe('B');
      expect(api.executeQuackQuery.mock.calls[1][2].signal.aborted).toBe(false);
    }
    expect(oldRequest.signal.aborted).toBe(true);
    // Model a server operation independent of the aborted HTTP wait. Its late completion is discarded.
    // This proves missing control traffic, not actual native-server orphan duration.
    await act(async () => { old.resolve(ok('late A')); await outcome; });
    if (action === 'replace') expect(await outcome).toMatchObject({ name: 'AbortError' });
    else expect(await outcome).toBeUndefined();
    expect(result.current.resultTabs.some(tab => tab.query.source.connectionId === 'A')).toBe(false);
    expect(api.moveQueryToBackground).not.toHaveBeenCalled();
    expect(api.cancelSyncQuery).toHaveBeenCalledWith(oldRequest.requestId);
  });

  it('remote error and retry stay remote and never execute the same SQL locally', async () => {
    api.executeQuackQuery.mockRejectedValueOnce(new Error('Service A certificate rejected'));
    const { result } = renderHook(useQueryWorkspace);
    await act(async () => { await expect(result.current.handleQueryExecute('SELECT secret_column', source('A'))).rejects.toThrow('Service A certificate rejected'); });
    expect(result.current.lastFailure).toMatchObject({ source: source('A'), errorMessage: 'Service A certificate rejected' });
    await act(async () => { await result.current.retryLastFailure(); });
    expect(api.executeQuackQuery.mock.calls.map(c => c[0])).toEqual(['A', 'A']);
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
    expect(api.executeFederatedQuery).not.toHaveBeenCalled();
  });

  it('background adoption detaches only the captured remote request while a sibling refresh completes', async () => {
    const { result } = renderHook(useQueryWorkspace);
    for (const id of ['A', 'B']) await act(async () => { await result.current.handleQueryExecute('SELECT 1', source(id)); });
    const [a, b] = result.current.resultTabs;
    const da = deferred<ReturnType<typeof ok>>(); const db = deferred<ReturnType<typeof ok>>();
    api.executeQuackQuery.mockImplementation((id: string) => id === 'A' ? da.promise : db.promise);
    api.moveQueryToBackground.mockResolvedValue({ task_id: 'remote-B-task' });
    let ra!: Promise<void>; let rb!: Promise<void>;
    act(() => { ra = result.current.refreshResultTab(a.id); });
    act(() => { rb = result.current.refreshResultTab(b.id); });
    const aSignal = api.executeQuackQuery.mock.calls[2][2].signal as AbortSignal;
    const bSignal = api.executeQuackQuery.mock.calls[3][2].signal as AbortSignal;
    await act(async () => { expect(await result.current.moveToBackground()).toBe('remote-B-task'); });
    expect(aSignal.aborted).toBe(false); expect(bSignal.aborted).toBe(true);
    expect(api.cancelSyncQuery).not.toHaveBeenCalled();
    await act(async () => { da.resolve(ok('fresh A')); db.resolve(ok('detached B')); await ra; await rb; });
    expect(result.current.resultTabs.map(t => t.result.data)).toEqual([[{ v: 'fresh A' }], [{ v: 'B' }]]);
  });

  /** Regression candidate 2026-11-03: cancelling B's new query also cancels selected A's refresh. */
  it('cancelling the latest service B query leaves the independent service A refresh running', async () => {
    const { result } = renderHook(useQueryWorkspace);
    await act(async () => { await result.current.handleQueryExecute('SELECT 1', source('A')); });
    const a = result.current.resultTabs[0];
    const da = deferred<ReturnType<typeof ok>>(); const db = deferred<ReturnType<typeof ok>>();
    api.executeQuackQuery.mockImplementation((id: string) => id === 'A' ? da.promise : db.promise);
    let ra!: Promise<void>; let rb!: Promise<void>;
    let bOutcome!: Promise<unknown>;
    act(() => { ra = result.current.refreshResultTab(a.id); });
    act(() => { rb = result.current.handleQueryExecute('SELECT 2', source('B')); bOutcome = captureRejection(rb); });
    const aRequest = api.executeQuackQuery.mock.calls[1][2];
    const bRequest = api.executeQuackQuery.mock.calls[2][2];
    await act(async () => { await result.current.cancelQuery(); });
    const observed = { cancelled: api.cancelSyncQuery.mock.calls.map(c => c[0]), aAborted: aRequest.signal.aborted, bAborted: bRequest.signal.aborted };
    await act(async () => { da.resolve(ok('fresh A')); db.resolve(ok('cancelled B')); await ra; await bOutcome; });
    expect(await bOutcome).toMatchObject({ name: 'AbortError' });
    expect(observed).toEqual({ cancelled: [bRequest.requestId], aAborted: false, bAborted: true });
    expect(result.current.resultTabs[0].result.data).toEqual([{ v: 'fresh A' }]);
  });

  /** Regression 2026-11-03: a delayed cancel acknowledgement for A must not modify newer B state. */
  it.each(['running', 'completed', 'cancelling'] as const)('late cancel A response preserves B while B is %s', async phase => {
    const aQuery = deferred<ReturnType<typeof ok>>();
    const bQuery = deferred<ReturnType<typeof ok>>();
    const aAck = deferred<void>(); const bAck = deferred<void>();
    api.executeQuackQuery.mockImplementation((id: string, _sql: string, options: { signal: AbortSignal }) => {
      const query = id === 'A' ? aQuery : bQuery;
      options.signal.addEventListener('abort', () => query.reject(Object.assign(new Error('cancelled'), { name: 'CanceledError', code: 'ERR_CANCELED' })), { once: true });
      return query.promise;
    });
    api.cancelSyncQuery.mockReturnValueOnce(aAck.promise).mockReturnValueOnce(bAck.promise);
    const { result } = renderHook(useQueryWorkspace);
    let outcomeA!: Promise<unknown>; let cancellingA!: Promise<void>; let outcomeB!: Promise<unknown>; let cancellingB: Promise<void> | undefined;
    act(() => { outcomeA = captureRejection(result.current.handleQueryExecute('SELECT slow_A', source('A'))); });
    const aId = api.executeQuackQuery.mock.calls[0][2].requestId;
    await act(async () => { cancellingA = result.current.cancelQuery(); await outcomeA; });
    expect(api.cancelSyncQuery).toHaveBeenCalledWith(aId);
    act(() => { outcomeB = captureRejection(result.current.handleQueryExecute('SELECT slow_B', source('B'))); });
    const bRequest = api.executeQuackQuery.mock.calls[1][2];
    if (phase === 'completed') await act(async () => { bQuery.resolve(ok('B completed')); await outcomeB; });
    if (phase === 'cancelling') await act(async () => { cancellingB = result.current.cancelQuery(); await outcomeB; });
    const beforeAck = {
      loading: result.current.isResultLoading,
      cancelling: result.current.isCancelling,
      cancelled: result.current.isCancelled,
      activeId: result.current.activeExecution?.requestId,
    };
    await act(async () => { aAck.resolve(); await cancellingA; });
    const afterAck = {
      loading: result.current.isResultLoading,
      cancelling: result.current.isCancelling,
      cancelled: result.current.isCancelled,
      activeId: result.current.activeExecution?.requestId,
    };
    // Finish all controlled requests before asserting so a failure cannot leave hanging work.
    if (phase === 'running') await act(async () => { bQuery.resolve(ok('B completed')); await outcomeB; });
    if (phase === 'cancelling') await act(async () => { bAck.resolve(); await cancellingB; });
    expect(await outcomeA).toMatchObject({ name: 'AbortError' });
    if (phase === 'cancelling') expect(await outcomeB).toMatchObject({ name: 'AbortError' });
    else expect(await outcomeB).toBeUndefined();
    expect(afterAck).toEqual(beforeAck);
    if (phase === 'running') expect(afterAck).toEqual({ loading: true, cancelling: false, cancelled: false, activeId: bRequest.requestId });
    if (phase === 'completed') {
      expect(afterAck).toEqual({ loading: false, cancelling: false, cancelled: false, activeId: undefined });
      expect(result.current.lastQuery?.source.connectionId).toBe('B');
      expect(result.current.queryResults?.data).toEqual([{ v: 'B completed' }]);
    }
    if (phase === 'cancelling') {
      expect(afterAck.cancelling).toBe(true);
      expect(result.current.isCancelled).toBe(true);
      expect(result.current.isCancelling).toBe(false);
    }
    expect(api.cancelSyncQuery.mock.calls.map(call => call[0])).toEqual(phase === 'cancelling' ? [aId, bRequest.requestId] : [aId]);
  });

  /** Regression 2026-11-03: a late A cancellation must not clear the selected B result row's loading state. */
  it.each(['running', 'completed'] as const)('late cancel A preserves service B result-row loading and data while its refresh is %s', async phase => {
    const { result } = renderHook(useQueryWorkspace);
    for (const id of ['A', 'B']) await act(async () => { await result.current.handleQueryExecute('SELECT * FROM orders', source(id)); });
    const [a, b] = result.current.resultTabs;
    const aQuery = deferred<ReturnType<typeof ok>>(); const bQuery = deferred<ReturnType<typeof ok>>();
    const aAck = deferred<void>();
    api.executeQuackQuery.mockImplementation((id: string, _sql: string, options: { signal: AbortSignal }) => {
      const pending = id === 'A' ? aQuery : bQuery;
      options.signal.addEventListener('abort', () => pending.reject(Object.assign(new Error('cancelled'), { name: 'CanceledError', code: 'ERR_CANCELED' })), { once: true });
      return pending.promise;
    });
    act(() => result.current.selectResultTab(a.id));
    let refreshingA!: Promise<void>; let cancellingA!: Promise<void>; let refreshingB!: Promise<void>;
    act(() => { refreshingA = result.current.refreshResultTab(a.id); });
    const aRequest = api.executeQuackQuery.mock.calls[2][2];
    api.cancelSyncQuery.mockImplementation((requestId: string) => requestId === aRequest.requestId ? aAck.promise : Promise.resolve());
    await act(async () => { cancellingA = result.current.cancelQuery(); await refreshingA; });
    act(() => result.current.selectResultTab(b.id));
    act(() => { refreshingB = result.current.refreshResultTab(b.id); });
    const bRequest = api.executeQuackQuery.mock.calls[3][2];
    if (phase === 'completed') await act(async () => { bQuery.resolve(ok('fresh B')); await refreshingB; });
    const beforeAck = result.current.resultTabs.find(tab => tab.id === b.id)!.result;
    await act(async () => { aAck.resolve(); await cancellingA; });
    const afterAck = result.current.resultTabs.find(tab => tab.id === b.id)!.result;
    const visibleLoading = result.current.queryResults?.loading;
    const activeId = result.current.activeResultTabId;
    if (phase === 'running') await act(async () => { bQuery.resolve(ok('fresh B')); await refreshingB; });
    expect(afterAck).toEqual(beforeAck);
    expect(afterAck).toMatchObject({ loading: phase === 'running', data: [{ v: phase === 'running' ? 'B' : 'fresh B' }], error: null });
    expect(visibleLoading).toBe(phase === 'running');
    expect(activeId).toBe(b.id);
    expect(bRequest.signal.aborted).toBe(false);
    expect(api.cancelSyncQuery.mock.calls.map(call => call[0])).toEqual([aRequest.requestId]);
  });

  /** Regression 2026-11-03: completed single/refresh requests must retire their controllers without cancellation. */
  it.each(['single', 'refresh'] as const)('completed %s request is not aborted or redundantly cancelled by later work', async slot => {
    const { result } = renderHook(useQueryWorkspace);
    await act(async () => { await result.current.handleQueryExecute('SELECT 1', source('A')); });
    const tabId = result.current.resultTabs[0].id;
    if (slot === 'refresh') await act(async () => { await result.current.refreshResultTab(tabId); });
    const completed = api.executeQuackQuery.mock.calls[api.executeQuackQuery.mock.calls.length - 1][2];
    await act(async () => {
      if (slot === 'single') await result.current.handleQueryExecute('SELECT 2', source('B'));
      else await result.current.refreshResultTab(tabId);
    });
    act(() => result.current.closeResultTabById(tabId));
    expect({ aborted: completed.signal.aborted, cancellations: api.cancelSyncQuery.mock.calls }).toEqual({ aborted: false, cancellations: [] });
    expect(result.current.activeExecution).toBeNull();
  });

  /** Regression 2026-11-03: promoted requests are detached, and later same-slot work must not cancel them. */
  it.each(['single', 'refresh'] as const)('adopted %s request survives later same-slot query and result closure', async slot => {
    const { result } = renderHook(useQueryWorkspace);
    let tabId: string | undefined;
    if (slot === 'refresh') {
      await act(async () => { await result.current.handleQueryExecute('SELECT 1', source('A')); });
      tabId = result.current.resultTabs[0].id;
    }
    const adoptedQuery = deferred<ReturnType<typeof ok>>();
    api.executeQuackQuery.mockReturnValueOnce(adoptedQuery.promise);
    api.moveQueryToBackground.mockResolvedValueOnce({ task_id: 'adopted-A' });
    let outcome!: Promise<unknown>;
    act(() => { outcome = captureRejection(slot === 'single' ? result.current.handleQueryExecute('SELECT slow_A', source('A')) : result.current.refreshResultTab(tabId)); });
    const adopted = api.executeQuackQuery.mock.calls[api.executeQuackQuery.mock.calls.length - 1][2];
    await act(async () => { expect(await result.current.moveToBackground()).toBe('adopted-A'); });
    expect(adopted.signal.aborted).toBe(true);
    await act(async () => {
      if (slot === 'single') await result.current.handleQueryExecute('SELECT fast_B', source('B'));
      else await result.current.refreshResultTab(tabId);
    });
    if (tabId) act(() => result.current.closeResultTabById(tabId!));
    await act(async () => { adoptedQuery.resolve(ok('late adopted A')); await outcome; });
    if (slot === 'single') expect(await outcome).toMatchObject({ name: 'AbortError' });
    else expect(await outcome).toBeUndefined();
    expect(api.moveQueryToBackground).toHaveBeenCalledExactlyOnceWith(adopted.requestId);
    expect(api.cancelSyncQuery).not.toHaveBeenCalled();
    expect(result.current.resultTabs.some(tab => tab.result.data?.some(row => (row as { v: string }).v === 'late adopted A'))).toBe(false);
  });

  /** Regression 2026-11-03: server-side promotion can succeed before its HTTP acknowledgement reaches the client. */
  it('a later B query does not cancel adopted A while the promotion acknowledgement is delayed', async () => {
    const { result } = renderHook(useQueryWorkspace);
    const aQuery = deferred<ReturnType<typeof ok>>();
    const promotion = deferred<{ task_id: string }>();
    api.executeQuackQuery.mockReturnValueOnce(aQuery.promise);
    // The server has assigned a task; only delivery of the successful HTTP response is delayed.
    api.moveQueryToBackground.mockReturnValueOnce(promotion.promise);
    let outcomeA!: Promise<unknown>; let moving!: Promise<string | undefined>;
    act(() => { outcomeA = captureRejection(result.current.handleQueryExecute('SELECT slow_A', source('A'))); });
    const aRequest = api.executeQuackQuery.mock.calls[0][2];
    act(() => { moving = result.current.moveToBackground(); });
    expect(api.moveQueryToBackground).toHaveBeenCalledExactlyOnceWith(aRequest.requestId);
    await act(async () => { await result.current.handleQueryExecute('SELECT fast_B', source('B')); });
    await act(async () => { promotion.resolve({ task_id: 'server-owned-A' }); expect(await moving).toBe('server-owned-A'); });
    await act(async () => { aQuery.resolve(ok('adopted A late')); await outcomeA; });
    expect(await outcomeA).toMatchObject({ name: 'AbortError' });
    expect(result.current.lastQuery?.source.connectionId).toBe('B');
    expect(result.current.queryResults?.data).toEqual([{ v: 'B' }]);
    expect(result.current.isResultLoading).toBe(false);
    expect(api.executeQuackQuery.mock.calls.map(call => call[0])).toEqual(['A', 'B']);
    expect(api.cancelSyncQuery).not.toHaveBeenCalled();
  });

  /** Regression 2026-11-03: lost promotion acknowledgement is not proof that server ownership failed. */
  it('network loss after server accepted promotion does not cancel adopted A after B replaces its HTTP wait', async () => {
    const { result } = renderHook(useQueryWorkspace);
    const aQuery = deferred<ReturnType<typeof ok>>();
    const promotion = deferred<{ task_id: string }>();
    const networkError = Object.assign(new Error('Promotion response lost after acceptance'), { code: 'NETWORK_ERROR' });
    let serverOwnedTask: { task_id: string; request_id: string } | undefined;
    api.executeQuackQuery.mockReturnValueOnce(aQuery.promise);
    api.moveQueryToBackground.mockImplementationOnce((requestId: string) => {
      // Fake server commits the transfer; only its response is subsequently lost in transport.
      serverOwnedTask = { task_id: 'server-owned-A', request_id: requestId };
      return promotion.promise;
    });
    let outcomeA!: Promise<unknown>; let movingOutcome!: Promise<unknown>;
    act(() => { outcomeA = captureRejection(result.current.handleQueryExecute('SELECT slow_A', source('A'))); });
    const aRequest = api.executeQuackQuery.mock.calls[0][2];
    act(() => { movingOutcome = captureRejection(result.current.moveToBackground()); });
    await act(async () => { await result.current.handleQueryExecute('SELECT fast_B', source('B')); });
    const bRequest = api.executeQuackQuery.mock.calls[1][2];
    const cancellationsBeforeNetworkError = api.cancelSyncQuery.mock.calls.map(call => call[0]);
    await act(async () => { promotion.reject(networkError); await movingOutcome; });
    await act(async () => { aQuery.resolve(ok('adopted A late')); await outcomeA; });
    expect(serverOwnedTask).toEqual({ task_id: 'server-owned-A', request_id: aRequest.requestId });
    expect(await movingOutcome).toBe(networkError);
    expect(await outcomeA).toMatchObject({ name: 'AbortError' });
    expect(aRequest.signal.aborted).toBe(true);
    expect(bRequest.signal.aborted).toBe(false);
    expect(result.current.lastQuery?.source.connectionId).toBe('B');
    expect(result.current.queryResults?.data).toEqual([{ v: 'B' }]);
    expect(result.current.isResultLoading).toBe(false);
    expect(result.current.resultTabs.map(tab => tab.query.source.connectionId)).toEqual(['B']);
    expect(api.executeQuackQuery.mock.calls.map(call => call[0])).toEqual(['A', 'B']);
    expect(api.moveQueryToBackground).toHaveBeenCalledExactlyOnceWith(aRequest.requestId);
    expect(cancellationsBeforeNetworkError).toEqual([]);
    expect(api.cancelSyncQuery).not.toHaveBeenCalled();
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
  });

  /** Regression 2026-11-03: unknown transfer status must stay attached to foreground A until its HTTP promise ends. */
  it.each(uncertainPromotionErrors)('$label promotion failure while A is foreground still protects adopted A when B starts later', async ({ fields }) => {
    const { result } = renderHook(useQueryWorkspace);
    const aQuery = deferred<ReturnType<typeof ok>>(); const promotion = deferred<{ task_id: string }>();
    const unknownError = Object.assign(new Error('Server ownership acknowledgement unavailable'), fields);
    let serverOwnedTask: { task_id: string; request_id: string } | undefined;
    api.executeQuackQuery.mockReturnValueOnce(aQuery.promise);
    api.moveQueryToBackground.mockImplementationOnce((requestId: string) => {
      serverOwnedTask = { task_id: 'server-owned-A', request_id: requestId };
      return promotion.promise;
    });
    let aOutcome!: Promise<unknown>; let movingOutcome!: Promise<unknown>;
    act(() => { aOutcome = captureRejection(result.current.handleQueryExecute('SELECT slow_A', source('A'))); });
    const aRequest = api.executeQuackQuery.mock.calls[0][2];
    act(() => { movingOutcome = captureRejection(result.current.moveToBackground()); });
    await act(async () => { promotion.reject(unknownError); await movingOutcome; });
    const foregroundAfterUnknown = { activeId: result.current.activeExecution?.requestId, loading: result.current.isResultLoading, aborted: aRequest.signal.aborted, failure: result.current.lastFailure };
    const cancellationsBeforeB = api.cancelSyncQuery.mock.calls.map(call => call[0]);
    await act(async () => { await result.current.handleQueryExecute('SELECT fast_B', source('B')); });
    const bRequest = api.executeQuackQuery.mock.calls[1][2];
    await act(async () => { aQuery.resolve(ok('adopted A late')); await aOutcome; });
    expect(await movingOutcome).toBe(unknownError);
    expect(foregroundAfterUnknown).toEqual({ activeId: aRequest.requestId, loading: true, aborted: false, failure: null });
    expect(cancellationsBeforeB).toEqual([]);
    expect(serverOwnedTask).toEqual({ task_id: 'server-owned-A', request_id: aRequest.requestId });
    expect(await aOutcome).toMatchObject({ name: 'AbortError' });
    expect(aRequest.signal.aborted).toBe(true);
    expect(bRequest.signal.aborted).toBe(false);
    expect(result.current.lastQuery?.source.connectionId).toBe('B');
    expect(result.current.queryResults?.data).toEqual([{ v: 'B' }]);
    expect(result.current.isResultLoading).toBe(false);
    expect(api.executeQuackQuery.mock.calls.map(call => call[0])).toEqual(['A', 'B']);
    expect(api.moveQueryToBackground).toHaveBeenCalledExactlyOnceWith(aRequest.requestId);
    expect(api.cancelSyncQuery).not.toHaveBeenCalled();
  });

  /** Regression 2026-11-03: a user's later 409 response cannot disprove adoption by the first unknown attempt. */
  it.each(uncertainPromotionErrors)('$label unknown promotion followed by user retry 409 does not erase first-attempt ownership uncertainty', async ({ fields }) => {
    const { result } = renderHook(useQueryWorkspace);
    const aQuery = deferred<ReturnType<typeof ok>>(); const firstPromotion = deferred<{ task_id: string }>();
    const unknownError = Object.assign(new Error('First transfer reply unavailable'), fields);
    const conflict = Object.assign(new Error('Retry cannot establish ownership'), { statusCode: 409 });
    let serverOwnedTask: { task_id: string; request_id: string } | undefined;
    api.executeQuackQuery.mockReturnValueOnce(aQuery.promise);
    api.moveQueryToBackground.mockImplementationOnce((requestId: string) => {
      serverOwnedTask = { task_id: 'server-owned-A', request_id: requestId };
      return firstPromotion.promise;
    }).mockRejectedValueOnce(conflict);
    let aOutcome!: Promise<unknown>; let firstOutcome!: Promise<unknown>; let retryOutcome!: Promise<unknown>;
    act(() => { aOutcome = captureRejection(result.current.handleQueryExecute('SELECT slow_A', source('A'))); });
    const aRequest = api.executeQuackQuery.mock.calls[0][2];
    act(() => { firstOutcome = captureRejection(result.current.moveToBackground()); });
    await act(async () => { firstPromotion.reject(unknownError); await firstOutcome; });
    // This is an explicit second user action; the implementation must not retry on its own.
    await act(async () => { retryOutcome = captureRejection(result.current.moveToBackground()); await retryOutcome; });
    const foregroundAfterRetry = { activeId: result.current.activeExecution?.requestId, loading: result.current.isResultLoading, aborted: aRequest.signal.aborted };
    await act(async () => { await result.current.handleQueryExecute('SELECT fast_B', source('B')); });
    await act(async () => { aQuery.resolve(ok('adopted A late')); await aOutcome; });
    expect(await firstOutcome).toBe(unknownError);
    expect(await retryOutcome).toBe(conflict);
    expect(foregroundAfterRetry).toEqual({ activeId: aRequest.requestId, loading: true, aborted: false });
    expect(serverOwnedTask).toEqual({ task_id: 'server-owned-A', request_id: aRequest.requestId });
    expect(await aOutcome).toMatchObject({ name: 'AbortError' });
    expect(result.current.lastQuery?.source.connectionId).toBe('B');
    expect(result.current.queryResults?.data).toEqual([{ v: 'B' }]);
    expect(result.current.isResultLoading).toBe(false);
    expect(api.executeQuackQuery.mock.calls.map(call => call[0])).toEqual(['A', 'B']);
    expect(api.moveQueryToBackground.mock.calls).toEqual([[aRequest.requestId], [aRequest.requestId]]);
    expect(api.cancelSyncQuery).not.toHaveBeenCalled();
  });

  /** Regression 2026-11-03: an HTTP 5xx after retirement cannot establish that accepted promotion failed. */
  it('503 after B replaces A keeps possible server-owned A alive without replay or control retry', async () => {
    const { result } = renderHook(useQueryWorkspace);
    const aQuery = deferred<ReturnType<typeof ok>>(); const promotion = deferred<{ task_id: string }>();
    const unavailable = Object.assign(new Error('Promotion response unavailable'), { statusCode: 503 });
    api.executeQuackQuery.mockReturnValueOnce(aQuery.promise);
    api.moveQueryToBackground.mockReturnValueOnce(promotion.promise);
    let aOutcome!: Promise<unknown>; let movingOutcome!: Promise<unknown>;
    act(() => { aOutcome = captureRejection(result.current.handleQueryExecute('SELECT slow_A', source('A'))); });
    const aRequest = api.executeQuackQuery.mock.calls[0][2];
    act(() => { movingOutcome = captureRejection(result.current.moveToBackground()); });
    await act(async () => { await result.current.handleQueryExecute('SELECT fast_B', source('B')); });
    await act(async () => { promotion.reject(unavailable); await movingOutcome; });
    await act(async () => { aQuery.resolve(ok('adopted A late')); await aOutcome; });
    expect(await movingOutcome).toBe(unavailable);
    expect(await aOutcome).toMatchObject({ name: 'AbortError' });
    expect(aRequest.signal.aborted).toBe(true);
    expect(api.executeQuackQuery.mock.calls[1][2].signal.aborted).toBe(false);
    expect(result.current.lastQuery?.source.connectionId).toBe('B');
    expect(result.current.queryResults?.data).toEqual([{ v: 'B' }]);
    expect(result.current.isResultLoading).toBe(false);
    expect(api.executeQuackQuery.mock.calls.map(call => call[0])).toEqual(['A', 'B']);
    expect(api.moveQueryToBackground).toHaveBeenCalledExactlyOnceWith(aRequest.requestId);
    expect(api.cancelSyncQuery).not.toHaveBeenCalled();
  });

  /** Regression 2026-11-03: failed transfer must cancel only the original remote request after replacement/closure. */
  it.each(['replace', 'close'] as const)('failed promotion after %s cancels captured A and leaves the new B slot alone', async action => {
    const { result } = renderHook(useQueryWorkspace);
    let tabId: string | undefined;
    if (action === 'close') {
      await act(async () => { await result.current.handleQueryExecute('SELECT seed_A', source('A')); });
      tabId = result.current.resultTabs[0].id;
    }
    const aQuery = deferred<ReturnType<typeof ok>>(); const bQuery = deferred<ReturnType<typeof ok>>();
    const promotion = deferred<{ task_id: string }>();
    const failure = Object.assign(new Error('Promotion refused'), { statusCode: 409 });
    api.executeQuackQuery.mockImplementation((id: string, _sql: string, options: { signal: AbortSignal }) => {
      const pending = id === 'A' ? aQuery : bQuery;
      options.signal.addEventListener('abort', () => pending.reject(Object.assign(new Error('cancelled'), { name: 'CanceledError', code: 'ERR_CANCELED' })), { once: true });
      return pending.promise;
    });
    api.moveQueryToBackground.mockReturnValueOnce(promotion.promise);
    let aOutcome!: Promise<unknown>; let movingOutcome!: Promise<unknown>; let bOutcome!: Promise<unknown>;
    act(() => { aOutcome = captureRejection(action === 'close' ? result.current.refreshResultTab(tabId) : result.current.handleQueryExecute('SELECT slow_A', source('A'))); });
    const aRequest = api.executeQuackQuery.mock.calls[api.executeQuackQuery.mock.calls.length - 1][2];
    act(() => { movingOutcome = captureRejection(result.current.moveToBackground()); });
    if (tabId) act(() => result.current.closeResultTabById(tabId!));
    act(() => { bOutcome = captureRejection(result.current.handleQueryExecute('SELECT slow_B', source('B'))); });
    const bRequest = api.executeQuackQuery.mock.calls[api.executeQuackQuery.mock.calls.length - 1][2];
    const cancellationsBeforeFailure = api.cancelSyncQuery.mock.calls.map(call => call[0]);
    await act(async () => { await aOutcome; promotion.reject(failure); await movingOutcome; });
    const bStateAfterFailure = { loading: result.current.isResultLoading, activeId: result.current.activeExecution?.requestId, aborted: bRequest.signal.aborted };
    await act(async () => { bQuery.resolve(ok('B survived')); await bOutcome; });
    expect(cancellationsBeforeFailure).toEqual([]);
    expect(await movingOutcome).toBe(failure);
    if (action === 'replace') expect(await aOutcome).toMatchObject({ name: 'AbortError' });
    else expect(await aOutcome).toBeUndefined();
    expect(aRequest.signal.aborted).toBe(true);
    expect(bStateAfterFailure).toEqual({ loading: true, activeId: bRequest.requestId, aborted: false });
    expect(api.cancelSyncQuery).toHaveBeenCalledExactlyOnceWith(aRequest.requestId);
    expect(api.moveQueryToBackground).toHaveBeenCalledExactlyOnceWith(aRequest.requestId);
    expect(result.current.lastQuery?.source.connectionId).toBe('B');
    expect(result.current.queryResults?.data).toEqual([{ v: 'B survived' }]);
    if (tabId) expect(result.current.resultTabs.some(tab => tab.id === tabId)).toBe(false);
    expect(api.executeDuckDBSQL).not.toHaveBeenCalled();
  });

  /** Regression 2026-11-03: rejecting a transfer must preserve foreground execution and release transfer protection. */
  it.each(['complete', 'replace'] as const)('failed promotion without retirement keeps A foreground until it can %s normally', async next => {
    const { result } = renderHook(useQueryWorkspace);
    const aQuery = deferred<ReturnType<typeof ok>>(); const promotion = deferred<{ task_id: string }>();
    const failure = Object.assign(new Error('Transfer unavailable'), { statusCode: 409 });
    api.executeQuackQuery.mockImplementationOnce((_id: string, _sql: string, options: { signal: AbortSignal }) => {
      options.signal.addEventListener('abort', () => aQuery.reject(Object.assign(new Error('cancelled'), { name: 'CanceledError', code: 'ERR_CANCELED' })), { once: true });
      return aQuery.promise;
    });
    api.moveQueryToBackground.mockReturnValueOnce(promotion.promise);
    let aOutcome!: Promise<unknown>; let movingOutcome!: Promise<unknown>;
    act(() => { aOutcome = captureRejection(result.current.handleQueryExecute('SELECT slow_A', source('A'))); });
    const aRequest = api.executeQuackQuery.mock.calls[0][2];
    act(() => { movingOutcome = captureRejection(result.current.moveToBackground()); });
    await act(async () => { promotion.reject(failure); await movingOutcome; });
    const foregroundState = { activeId: result.current.activeExecution?.requestId, loading: result.current.isResultLoading, aborted: aRequest.signal.aborted, failure: result.current.lastFailure };
    const cancellationsBeforeNext = api.cancelSyncQuery.mock.calls.map(call => call[0]);
    if (next === 'complete') await act(async () => { aQuery.resolve(ok('A foreground')); await aOutcome; });
    else await act(async () => { await result.current.handleQueryExecute('SELECT fast_B', source('B')); await aOutcome; });
    expect(await movingOutcome).toBe(failure);
    expect(foregroundState).toEqual({ activeId: aRequest.requestId, loading: true, aborted: false, failure: null });
    expect(cancellationsBeforeNext).toEqual([]);
    if (next === 'complete') {
      expect(await aOutcome).toBeUndefined();
      expect(result.current.queryResults?.data).toEqual([{ v: 'A foreground' }]);
      expect(result.current.lastQuery?.source.connectionId).toBe('A');
      expect(api.cancelSyncQuery).not.toHaveBeenCalled();
    } else {
      expect(await aOutcome).toMatchObject({ name: 'AbortError' });
      expect(result.current.queryResults?.data).toEqual([{ v: 'B' }]);
      expect(result.current.lastQuery?.source.connectionId).toBe('B');
      expect(api.cancelSyncQuery).toHaveBeenCalledExactlyOnceWith(aRequest.requestId);
    }
  });

  /** Regression 2026-11-03: explicit cancel owns its final flags even if transfer acknowledgement arrives first. */
  it.each(['success', 'failure'] as const)('explicit cancel wins over pending promotion %s without duplicate traffic or losing cancelled state', async transfer => {
    const { result } = renderHook(useQueryWorkspace);
    const aQuery = deferred<ReturnType<typeof ok>>();
    const promotion = deferred<{ task_id: string }>(); const cancelAck = deferred<void>();
    const failure = Object.assign(new Error('Promotion rejected after cancel'), { statusCode: 409 });
    api.executeQuackQuery.mockImplementationOnce((_id: string, _sql: string, options: { signal: AbortSignal }) => {
      options.signal.addEventListener('abort', () => aQuery.reject(Object.assign(new Error('cancelled'), { name: 'CanceledError', code: 'ERR_CANCELED' })), { once: true });
      return aQuery.promise;
    });
    api.moveQueryToBackground.mockReturnValueOnce(promotion.promise);
    api.cancelSyncQuery.mockReturnValueOnce(cancelAck.promise);
    let aOutcome!: Promise<unknown>; let movingOutcome!: Promise<unknown>; let cancelling!: Promise<void>;
    act(() => { aOutcome = captureRejection(result.current.handleQueryExecute('SELECT slow_A', source('A'))); });
    const aRequest = api.executeQuackQuery.mock.calls[0][2];
    act(() => { movingOutcome = captureRejection(result.current.moveToBackground()); });
    await act(async () => { cancelling = result.current.cancelQuery(); await aOutcome; });
    const beforePromotionAck = { cancelling: result.current.isCancelling, cancelled: result.current.isCancelled, loading: result.current.isResultLoading };
    await act(async () => {
      if (transfer === 'success') promotion.resolve({ task_id: 'cancelled-background-A' });
      else promotion.reject(failure);
      await movingOutcome;
    });
    const afterPromotionAck = { cancelling: result.current.isCancelling, cancelled: result.current.isCancelled, loading: result.current.isResultLoading };
    await act(async () => { cancelAck.resolve(); await cancelling; });
    const finalCancelState = { cancelling: result.current.isCancelling, cancelled: result.current.isCancelled, loading: result.current.isResultLoading };
    await act(async () => { await result.current.handleQueryExecute('SELECT fast_B', source('B')); });
    expect(await aOutcome).toMatchObject({ name: 'AbortError' });
    expect(beforePromotionAck).toEqual({ cancelling: true, cancelled: false, loading: true });
    expect({ afterPromotionAck, finalCancelState }).toEqual({
      afterPromotionAck: beforePromotionAck,
      finalCancelState: { cancelling: false, cancelled: true, loading: false },
    });
    expect(await movingOutcome).toBe(transfer === 'success' ? undefined : failure);
    expect(api.cancelSyncQuery).toHaveBeenCalledExactlyOnceWith(aRequest.requestId);
    expect(api.moveQueryToBackground).toHaveBeenCalledExactlyOnceWith(aRequest.requestId);
    expect(api.executeQuackQuery.mock.calls.map(call => call[0])).toEqual(['A', 'B']);
    expect(result.current.resultTabs.map(tab => tab.query.source.connectionId)).toEqual(['B']);
    expect(result.current.queryResults?.data).toEqual([{ v: 'B' }]);
  });

  /** Regression guard 2026-11-03: remote cancellation changes must preserve quiet local replacement/adoption. */
  it.each(['replace', 'adopt'] as const)('local %s still resolves its retired handler quietly without server cancellation', async action => {
    const { result } = renderHook(useQueryWorkspace);
    const oldLocal = deferred<ReturnType<typeof ok>>();
    api.executeDuckDBSQL.mockReturnValueOnce(oldLocal.promise).mockResolvedValue(ok('new local'));
    api.moveQueryToBackground.mockResolvedValueOnce({ task_id: 'local-adopted' });
    let outcome!: Promise<unknown>;
    act(() => { outcome = captureRejection(result.current.handleQueryExecute('SELECT old_local')); });
    if (action === 'adopt') await act(async () => { expect(await result.current.moveToBackground()).toBe('local-adopted'); });
    await act(async () => { await result.current.handleQueryExecute('SELECT new_local'); });
    await act(async () => { oldLocal.resolve(ok('late local')); await outcome; });
    expect(await outcome).toBeUndefined();
    expect(result.current.queryResults?.data).toEqual([{ v: 'new local' }]);
    expect(api.cancelSyncQuery).not.toHaveBeenCalled();
    expect(api.executeQuackQuery).not.toHaveBeenCalled();
  });

  /** Regression 2026-11-03: only the explicit remote execute propagates errors; refresh/retry remain state-handled. */
  it('failed remote refresh and retry resolve after recording failure while local execute remains state-handled', async () => {
    const { result } = renderHook(useQueryWorkspace);
    await act(async () => { await result.current.handleQueryExecute('SELECT 1', source('A')); });
    api.executeQuackQuery.mockRejectedValueOnce(new Error('remote refresh failed'));
    await act(async () => { await expect(result.current.refreshResultTab(result.current.resultTabs[0].id)).resolves.toBeUndefined(); });
    expect(result.current.lastFailure?.errorMessage).toBe('remote refresh failed');
    api.executeQuackQuery.mockRejectedValueOnce(new Error('remote retry failed'));
    await act(async () => { await expect(result.current.retryLastFailure()).resolves.toBeUndefined(); });
    expect(result.current.lastFailure?.errorMessage).toBe('remote retry failed');
    api.executeDuckDBSQL.mockRejectedValueOnce(new Error('local unchanged'));
    await act(async () => { await expect(result.current.handleQueryExecute('SELECT missing_local')).resolves.toBeUndefined(); });
    expect(result.current.lastFailure).toMatchObject({ source: { type: 'duckdb' }, errorMessage: 'local unchanged' });
  });
});

describe('Quack metadata across real form and tree consumers', () => {
  it('editing A remounts its browser with fresh metadata while B retains its cache and expanded state', async () => {
    let endpoint = 'old-host';
    let services: QuackService[] = ['A', 'B'].map(id => ({ id, name: id, uri: `quack:${id}-old-host`, has_token: false, disable_ssl: null, ssl_fingerprint: null, timeout_seconds: 30, updated_at: 'old' }));
    api.listQuackServices.mockImplementation(async () => services);
    api.getQuackCatalogs.mockImplementation(async (id: string) => [{ name: `${id}-${endpoint}`, type: 'duckdb' }]);
    api.updateQuackService.mockImplementation(async () => {
      endpoint = 'new-host';
      services = [{ ...services[0], uri: 'quack:new-host', updated_at: 'new' }, services[1]];
      return services[0];
    });
    const { client, wrapper } = setup();
    render(<><QuackServicesPanel onOpenQuery={vi.fn()} /><QuackServiceForm service={services[0]} /></>, { wrapper });
    fireEvent.click(await within(await screen.findByRole('group', { name: 'A' })).findByRole('button', { name: 'A' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'B' })).getByRole('button', { name: 'B' }));
    await screen.findByText('A-old-host'); await screen.findByText('B-old-host');
    fireEvent.change(screen.getByLabelText('quack.uri'), { target: { value: 'quack:new-host' } });
    fireEvent.click(screen.getByRole('button', { name: 'quack.saveChanges' }));
    await waitFor(() => expect(api.listQuackServices).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(screen.getByRole('group', { name: 'A' })).getByRole('button', { name: 'A' })).toHaveAttribute('aria-expanded', 'false'));
    fireEvent.click(within(screen.getByRole('group', { name: 'A' })).getByRole('button', { name: 'A' }));
    await screen.findByText('A-new-host');
    expect(screen.getByText('B-old-host')).toBeInTheDocument();
    expect(api.getQuackCatalogs.mock.calls.filter(c => c[0] === 'B')).toHaveLength(1);
    expect(client.getQueryData(['quack-metadata', 'B', 'catalogs'])).toEqual([{ name: 'B-old-host', type: 'duckdb' }]);
  });
});
