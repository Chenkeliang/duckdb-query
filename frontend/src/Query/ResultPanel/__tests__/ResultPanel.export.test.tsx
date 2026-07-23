/**
 * 回归:联邦查询结果导出必须携带 attach_databases。
 *
 * bug:导出 handler 曾用父级从不传递的 `attachDatabases` prop(恒 undefined),
 * 而非查询实际来源(effectiveSource)的 attach 列表 → 联邦导出报
 * "Catalog Error: schema xxx does not exist"。修复后改取 effectiveAttachDatabases。
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string | Record<string, unknown>) =>
      typeof defaultValue === 'string' ? defaultValue : key,
    i18n: { language: 'zh', changeLanguage: vi.fn() },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../DataGridWrapper', () => ({
  DataGridWrapper: () => <div data-testid="data-grid-mock" />,
}));

vi.mock('../ImportToDuckDBDialog', () => ({ ImportToDuckDBDialog: () => null }));

vi.mock('../hooks/useDataGridColumns', () => ({
  useDataGridColumns: () => ({ columns: [] }),
}));

// ResultToolbar 暴露导出按钮,便于触发 onExportParquet
vi.mock('../ResultToolbar', () => ({
  ResultToolbar: ({ onExportParquet }: { onExportParquet?: () => void }) => (
    <button data-testid="export-parquet" onClick={() => onExportParquet?.()}>
      export
    </button>
  ),
}));

// 非桌面环境:跳过原生存盘对话框,走浏览器下载分支
vi.mock('@/desktop/openExternal', () => ({ isTauri: () => false, openExternal: vi.fn() }));
vi.mock('@/desktop/saveLocal', () => ({ pickSavePath: vi.fn() }));
vi.mock('@/demo/isDemo', () => ({ IS_DEMO: false }));

// vi.hoisted:mock 工厂被提升到文件顶部,普通顶层变量会 "before initialization"
const exportMock = vi.hoisted(() => vi.fn());

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>();
  return { ...actual, exportQueryResults: exportMock };
});

import { ResultPanel } from '../ResultPanel';

function Wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('ResultPanel 联邦导出', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exportMock.mockResolvedValue({
      file_id: 'f1',
      download_url: '/api/query-results/export/f1/download',
      format: 'parquet',
    });
  });

  it('导出携带来自 effectiveSource 的 attach_databases(而非未传递的 prop)', async () => {
    const sql = 'SELECT id FROM "mysql_sorder"."bschool_order"';
    const source = {
      type: 'federated',
      sql,
      attachDatabases: [{ alias: 'mysql_sorder', connectionId: 'SORDER' }],
    };

    render(
      <Wrap>
        {/* 注意:故意不传 attachDatabases prop —— 正是父级的真实行为 */}
        <ResultPanel data={[{ id: 1 }]} currentSQL={sql} source={source as never} />
      </Wrap>
    );

    fireEvent.click(screen.getByTestId('export-parquet'));

    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1));
    expect(exportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sql,
        format: 'parquet',
        attach_databases: [{ alias: 'mysql_sorder', connection_id: 'SORDER' }],
      })
    );
  });

  it('本地(无 attach)导出时 attach_databases 为 undefined', async () => {
    const sql = 'SELECT * FROM local_tbl';
    const source = { type: 'duckdb', sql, attachDatabases: [] };

    render(
      <Wrap>
        <ResultPanel data={[{ id: 1 }]} currentSQL={sql} source={source as never} />
      </Wrap>
    );

    fireEvent.click(screen.getByTestId('export-parquet'));

    await waitFor(() => expect(exportMock).toHaveBeenCalledTimes(1));
    expect(exportMock).toHaveBeenCalledWith(
      expect.objectContaining({ sql, format: 'parquet', attach_databases: undefined })
    );
  });
});
