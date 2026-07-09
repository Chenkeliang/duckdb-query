/**
 * AsyncTaskPanel 联邦/本地徽标测试
 *
 * 覆盖：此前徽标只嗅探 SQL 里的「联邦查询」注释，SQL 面板提交的联邦任务没有该
 * 注释时会被误判为「本地」。修复后优先读取后端返回的 metadata.is_federated，
 * SQL 注释嗅探仅作老任务（无 metadata）兜底。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock react-i18next（沿用仓库内既有模式：defaultValue 为字符串时直接透传）
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string | Record<string, unknown>) => {
      if (typeof defaultValue === 'string') return defaultValue;
      return key;
    },
  }),
}));

const listAsyncTasksMock = vi.fn();
vi.mock('@/api', () => ({
  listAsyncTasks: (...args: unknown[]) => listAsyncTasksMock(...args),
  cancelAsyncTask: vi.fn(),
  retryAsyncTask: vi.fn(),
  // AsyncTaskPanel 通过 useAppConfig 间接依赖，这里给出可解析的默认配置，避免真实网络请求
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

describe('AsyncTaskPanel - 联邦/本地徽标', () => {
  it('metadata.is_federated=true 的任务渲染"联邦"，即使 SQL 不含联邦查询注释', async () => {
    const tasks: AsyncTask[] = [
      {
        task_id: 'task-federated',
        status: 'completed',
        sql: 'SELECT * FROM mysql_sorder.orders', // SQL 面板提交，无「联邦查询」注释
        created_at: new Date().toISOString(),
        metadata: { is_federated: true },
      },
      {
        task_id: 'task-local',
        status: 'completed',
        sql: 'SELECT * FROM local_table',
        created_at: new Date().toISOString(),
        metadata: { is_federated: false },
      },
    ];
    listAsyncTasksMock.mockResolvedValue({ tasks });

    render(
      <TestWrapper>
        <AsyncTaskPanel />
      </TestWrapper>
    );

    expect(await screen.findByText('联邦')).toBeInTheDocument();
    expect(screen.getByText('本地')).toBeInTheDocument();
  });

  it('metadata 显式 false 时不被 SQL 注释嗅探覆盖(复用带注释 SQL 的本地任务)', async () => {
    const tasks: AsyncTask[] = [
      {
        task_id: 'local-with-stale-marker',
        status: 'completed',
        // 用户复用了带「联邦查询」注释的 SQL,但后端判定为本地任务
        sql: '-- 联邦查询: mysql_sorder\nSELECT * FROM local_table',
        created_at: new Date().toISOString(),
        metadata: { is_federated: false },
      },
    ];
    listAsyncTasksMock.mockResolvedValue({ tasks });

    render(
      <TestWrapper>
        <AsyncTaskPanel />
      </TestWrapper>
    );

    expect(await screen.findByText('本地')).toBeInTheDocument();
    expect(screen.queryByText('联邦')).not.toBeInTheDocument();
  });

  it('无 metadata 的老任务仍靠 SQL 注释兜底判断为联邦', async () => {
    const tasks: AsyncTask[] = [
      {
        task_id: 'legacy-federated',
        status: 'completed',
        sql: '-- 联邦查询\nSELECT * FROM mysql_sorder.orders',
        created_at: new Date().toISOString(),
        // 无 metadata 字段
      },
    ];
    listAsyncTasksMock.mockResolvedValue({ tasks });

    render(
      <TestWrapper>
        <AsyncTaskPanel />
      </TestWrapper>
    );

    expect(await screen.findByText('联邦')).toBeInTheDocument();
  });
});
