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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const tableState = vi.hoisted(() => ({
  tables: [] as Array<{ name: string; type: string }>,
  isLoading: false,
  isError: false,
}));

vi.mock('@/hooks/useDuckDBTables', () => ({
  useDuckDBTables: () => tableState,
}));

vi.mock('@/api', () => ({
  listAsyncTasks: (...args: unknown[]) => listAsyncTasksMock(...args),
  cancelAsyncTask: vi.fn(),
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
      <AsyncTaskPanel onPreviewSQL={onPreviewSQL} />
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
  beforeEach(() => {
    vi.clearAllMocks();
    retryAsyncTaskMock.mockResolvedValue({ data: { task_id: 'new-task' } });
    tableState.tables = [];
    tableState.isLoading = false;
    tableState.isError = false;
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
