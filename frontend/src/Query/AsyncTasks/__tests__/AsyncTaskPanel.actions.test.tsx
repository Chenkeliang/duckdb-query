/**
 * Historical async-task action compatibility.
 *
 * Regression: completed rows kept broken preview/download actions after their
 * result tables were removed (2026-07-30).
 *
 * A completed task can outlive its persisted result table. Such a row must offer
 * a rerun instead of actions that are guaranteed to fail.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string | Record<string, unknown>) => {
      if (typeof defaultValue === 'string') return defaultValue;
      return key;
    },
  }),
}));

const listAsyncTasksMock = vi.fn();
const retryAsyncTaskMock = vi.fn();
const getBackgroundQueryResultMock = vi.fn();
const executeDuckDBSQLMock = vi.fn();
const tableState = vi.hoisted(() => ({
  tables: [] as Array<{ name: string; type: string }>,
  isLoading: false,
  isError: false,
}));

vi.mock('@/hooks/useDuckDBTables', () => ({
  useDuckDBTables: () => tableState,
}));

vi.mock('@/api', () => ({
  executeDuckDBSQL: (...args: unknown[]) => executeDuckDBSQLMock(...args),
  listAsyncTasks: (...args: unknown[]) => listAsyncTasksMock(...args),
  cancelAsyncTask: vi.fn(),
  getBackgroundQueryResult: (...args: unknown[]) => getBackgroundQueryResultMock(...args),
  retryAsyncTask: (...args: unknown[]) => retryAsyncTaskMock(...args),
  getAppConfig: vi.fn().mockResolvedValue({
    config: {
      enable_pivot_tables: true,
      pivot_table_extension: 'pivot_table',
      max_query_rows: 10000,
      max_file_size: 500 * 1024 * 1024,
      max_file_size_display: '500MB',
      federated_query_timeout: 300,
      json_import_column_type: 'auto',
      remote_storage_configured: false,
    },
  }),
  setFederatedQueryTimeout: vi.fn(),
}));

import { AsyncTaskPanel, type AsyncTask } from '../AsyncTaskPanel';

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderTask(task: AsyncTask, onPreviewSQL = vi.fn()) {
  listAsyncTasksMock.mockResolvedValue({ tasks: [task] });
  return render(
    <TestWrapper>
      <AsyncTaskPanel onPreviewResult={onPreviewSQL} />
    </TestWrapper>
  );
}

function completedTask(): AsyncTask {
  return {
    task_id: 'historical-task',
    status: 'completed',
    sql: 'SELECT * FROM source_table',
    created_at: new Date().toISOString(),
    result_info: { table_name: 'async_result_historical_task', row_count: 10 },
  };
}

describe('AsyncTaskPanel result actions', () => {
  // Regression 2026-10-12: ordinary async preview loaded SQL into the editor
  // instead of opening persisted rows in the result pane.
  it('loads persisted table rows directly with the original query context', async () => {
    const task = completedTask();
    tableState.tables = [{ name: 'async_result_historical_task', type: 'TABLE' }];
    const response = { success: true, data: [{ value: 7 }], columns: ['value'], row_count: 1 };
    executeDuckDBSQLMock.mockResolvedValue(response);
    listAsyncTasksMock.mockResolvedValue({ tasks: [task] });
    const onPreviewResult = vi.fn();
    render(<TestWrapper><AsyncTaskPanel onPreviewResult={onPreviewResult} /></TestWrapper>);
    fireEvent.click(await screen.findByRole('button', { name: '预览结果' }));
    await waitFor(() => expect(executeDuckDBSQLMock).toHaveBeenCalled());
    expect(executeDuckDBSQLMock.mock.calls[0][0]).toEqual(expect.objectContaining({
      sql: 'SELECT * FROM "async_result_historical_task" LIMIT 10000', isPreview: true,
    }));
    expect(onPreviewResult).toHaveBeenCalledWith(response, task.sql, { type: 'duckdb' });
    expect(getBackgroundQueryResultMock).not.toHaveBeenCalled();
  });

  // Regression 2026-10-12: a response from a dismissed drawer must not
  // overwrite the result selected after reopening it.
  it('ignores the first drawer session when A returns after B', async () => {
    const taskA = { ...completedTask(), task_id: 'task-A', result_info: { table_name: 'result_A' } };
    const taskB = { ...completedTask(), task_id: 'task-B', sql: 'SELECT B', result_info: { table_name: 'result_B' } };
    tableState.tables = [{ name: 'result_A', type: 'TABLE' }, { name: 'result_B', type: 'TABLE' }];
    listAsyncTasksMock.mockResolvedValue({ tasks: [taskA, taskB] });
    let finishA!: (value: unknown) => void;
    let finishB!: (value: unknown) => void;
    executeDuckDBSQLMock.mockImplementation(({ sql }: { sql: string }) => new Promise((resolve) => {
      if (sql.includes('result_A')) finishA = resolve;
      else finishB = resolve;
    }));
    const onPreviewResult = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (active: boolean) => <QueryClientProvider client={client}><AsyncTaskPanel {...{ active }} onPreviewResult={onPreviewResult} /></QueryClientProvider>;
    const rendered = render(view(true));
    fireEvent.click((await screen.findAllByRole('button', { name: '预览结果' }))[0]);
    await waitFor(() => expect(executeDuckDBSQLMock).toHaveBeenCalledTimes(1));
    rendered.rerender(view(false));
    rendered.rerender(view(true));
    fireEvent.click(screen.getAllByRole('button', { name: '预览结果' })[1]);
    await waitFor(() => expect(executeDuckDBSQLMock).toHaveBeenCalledTimes(2));
    const responseB = { success: true, data: [{ value: 'B' }], columns: ['value'] };
    await act(async () => { finishB(responseB); });
    await waitFor(() => expect(onPreviewResult).toHaveBeenCalledWith(responseB, 'SELECT B', { type: 'duckdb' }));
    await act(async () => { finishA({ success: true, data: [{ value: 'A' }], columns: ['value'] }); });
    expect(onPreviewResult).toHaveBeenCalledTimes(1);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    retryAsyncTaskMock.mockResolvedValue({ data: { task_id: 'new-task' } });
    tableState.tables = [];
    tableState.isLoading = false;
    tableState.isError = false;
  });

  it('shows a no-match state and restores results when the search is cleared', async () => {
    tableState.tables = [{ name: 'async_result_historical_task', type: 'TABLE' }];
    renderTask(completedTask());
    await screen.findByRole('button', { name: '预览结果' });
    fireEvent.change(screen.getByRole('textbox', { name: 'async.search' }), { target: { value: 'unmatched_query' } });
    expect(screen.getByText('async.noMatches')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '预览结果' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'async.search' }), { target: { value: '' } });
    expect(await screen.findByRole('button', { name: '预览结果' })).toBeInTheDocument();
  });

  it('offers rerun instead of a broken preview when the snapshot is missing', async () => {
    const task = completedTask();
    task.result_info = { result_kind: 'snapshot', available: false, row_count: 10 };
    listAsyncTasksMock.mockResolvedValue({ tasks: [task] });
    render(<TestWrapper><AsyncTaskPanel onPreviewResult={vi.fn()} /></TestWrapper>);
    fireEvent.click(await screen.findByRole('button', { name: '重新运行' }));
    await waitFor(() => expect(retryAsyncTaskMock).toHaveBeenCalledWith(task.task_id, {}));
    expect(screen.queryByRole('button', { name: '预览结果' })).not.toBeInTheDocument();
    expect(getBackgroundQueryResultMock).not.toHaveBeenCalled();
  });

  it('shows preview and download when the completed result table exists', async () => {
    tableState.tables = [{ name: 'async_result_historical_task', type: 'TABLE' }];
    renderTask(completedTask());

    expect(await screen.findByRole('button', { name: '预览结果' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下载' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新运行' })).not.toBeInTheDocument();
  });

  it('hides result actions and reruns a completed task whose table is missing', async () => {
    renderTask(completedTask());

    const rerun = await screen.findByRole('button', { name: '重新运行' });
    expect(screen.queryByRole('button', { name: '预览结果' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下载' })).not.toBeInTheDocument();

    fireEvent.click(rerun);
    await waitFor(() => {
      expect(retryAsyncTaskMock).toHaveBeenCalledWith('historical-task', {});
    });
  });

  it('does not submit the same historical rerun twice', async () => {
    renderTask(completedTask());

    const rerun = await screen.findByRole('button', { name: '重新运行' });
    fireEvent.click(rerun);
    await waitFor(() => {
      expect(retryAsyncTaskMock).toHaveBeenCalledTimes(1);
    });

    const submittedRerun = screen.getByRole('button', { name: '重新运行' });
    expect(submittedRerun).toBeDisabled();
    fireEvent.click(submittedRerun);
    expect(retryAsyncTaskMock).toHaveBeenCalledTimes(1);
  });

  it('keeps result actions when the table catalog cannot be checked', async () => {
    tableState.isError = true;
    renderTask(completedTask());

    expect(await screen.findByRole('button', { name: '下载' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新运行' })).not.toBeInTheDocument();
  });

  it('keeps download but hides preview when only a historical custom name remains', async () => {
    renderTask({
      task_id: 'historical-custom-task',
      status: 'completed',
      sql: 'SELECT * FROM source_table',
      created_at: new Date().toISOString(),
      result_info: { custom_table_name: 'monthly_report', row_count: 10 },
    });

    expect(await screen.findByRole('button', { name: '下载' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '预览结果' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新运行' })).not.toBeInTheDocument();
  });

  it('does not treat a catalog-hidden system-prefixed result as missing', async () => {
    renderTask({
      task_id: 'system-result-task',
      status: 'completed',
      sql: 'SELECT * FROM source_table',
      created_at: new Date().toISOString(),
      result_info: { table_name: 'system_report', row_count: 10 },
    });

    expect(await screen.findByRole('button', { name: '预览结果' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下载' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新运行' })).not.toBeInTheDocument();
  });

  it('does not show result actions while the table catalog is loading', async () => {
    tableState.isLoading = true;
    renderTask(completedTask());

    expect(await screen.findByText('已完成')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '预览结果' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '下载' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新运行' })).not.toBeInTheDocument();
  });

  it('keeps retry for failed tasks', async () => {
    renderTask({
      task_id: 'failed-task',
      status: 'failed',
      sql: 'SELECT 1',
      created_at: new Date().toISOString(),
    });

    expect(await screen.findByRole('button', { name: '重试' })).toBeInTheDocument();
  });
});


it('2026-10-10: opens an adopted snapshot without a result table or a SQL rerun', async () => {
  vi.clearAllMocks();
  tableState.isLoading = false;
  tableState.isError = false;
  const task = { ...completedTask(), result_info: { result_kind: 'snapshot', row_count: 1 }, metadata: { attach_databases: [{ alias: 'crm', connection_id: 'saved-crm' }] } };
  const payload = { columns: ['n'], data: [{ n: '9007199254740993' }], success: true };
  getBackgroundQueryResultMock.mockResolvedValueOnce(payload);
  listAsyncTasksMock.mockResolvedValueOnce({ tasks: [task] });
  tableState.tables = [];
  const onPreviewResult = vi.fn();
  render(<TestWrapper><AsyncTaskPanel onPreviewResult={onPreviewResult} /></TestWrapper>);
  fireEvent.click(await screen.findByRole('button', { name: '预览结果' }));
  await waitFor(() => expect(onPreviewResult).toHaveBeenCalledWith(payload, task.sql, { type: 'federated', connectionId: 'saved-crm', connectionName: 'crm', attachDatabases: [{ alias: 'crm', connectionId: 'saved-crm' }] }));
  expect(executeDuckDBSQLMock).not.toHaveBeenCalled();
  expect(retryAsyncTaskMock).not.toHaveBeenCalled();
});
