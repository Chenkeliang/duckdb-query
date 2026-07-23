/**
 * 保存到 DuckDB 的行数语义闭环(复审 P1):
 *  ① ResultPanel 接线:传给 ImportToDuckDBDialog 的必须是 baseSql(无系统预览 LIMIT),
 *     单结果页 currentBaseSQL ?? currentSQL,多结果页 activeTab.query.baseSql ?? sql;
 *  ② 对话框请求参数:saveQueryToDuckDB 收到 baseSql 原文;未勾选 apply_row_limit=false,
 *     勾选后 true——不从带 LIMIT 的文本反推。
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    save: vi.fn(async (..._args: unknown[]) => ({ success: true, table_name: 't' })),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: unknown) =>
      typeof defaultValue === 'string' ? defaultValue : key,
    i18n: { language: 'zh', changeLanguage: vi.fn() },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/utils/toastHelpers', () => ({
  showSuccessToast: vi.fn(),
  showErrorToast: vi.fn(),
}));
vi.mock('@/utils/cacheInvalidation', () => ({
  invalidateAfterTableCreate: vi.fn(async () => undefined),
}));
vi.mock('@/api', () => ({
  saveQueryToDuckDB: mocks.save,
  toAttachDatabasesPayload: () => undefined,
}));

// ResultPanel 接线探针:记录 dialog 实际收到的 sql prop
vi.mock('../ImportToDuckDBDialog', () => ({
  ImportToDuckDBDialog: (props: { sql: string }) => (
    <div data-testid="import-sql-probe">{props.sql}</div>
  ),
}));
vi.mock('../DataGridWrapper', () => ({
  DataGridWrapper: () => <div data-testid="grid" />,
}));
vi.mock('../ResultToolbar', () => ({ ResultToolbar: () => <div /> }));
vi.mock('../ResultTabGridPane', () => ({ ResultTabGridPane: () => <div /> }));
vi.mock('../hooks/useDataGridColumns', () => ({ useDataGridColumns: () => ({ columns: [] }) }));

import { ResultPanel } from '../ResultPanel';

function Wrap({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('① ResultPanel → ImportToDuckDBDialog 接线(baseSql 优先)', () => {
  it('单结果页:currentBaseSQL 存在时传 baseSql,而非带预览 LIMIT 的 currentSQL', () => {
    render(
      <Wrap>
        <ResultPanel
          data={[{ a: 1 }]}
          columns={['a']}
          currentSQL={'SELECT * FROM t\nLIMIT 10000'}
          currentBaseSQL={'SELECT * FROM t'}
        />
      </Wrap>
    );
    expect(screen.getByTestId('import-sql-probe').textContent).toBe('SELECT * FROM t');
  });

  it('单结果页:无 baseSql(SQL 编辑器原文即基础)回退 currentSQL', () => {
    render(
      <Wrap>
        <ResultPanel data={[{ a: 1 }]} columns={['a']} currentSQL={'SELECT 1'} />
      </Wrap>
    );
    expect(screen.getByTestId('import-sql-probe').textContent).toBe('SELECT 1');
  });

  it('多结果页:activeTab.query.baseSql 优先', () => {
    const tab = {
      id: 'tab1',
      label: 'R1',
      query: {
        sql: 'SELECT * FROM j\nLIMIT 10000',
        baseSql: 'SELECT * FROM j',
        source: { type: 'duckdb' as const },
      },
      result: { data: [{ a: 1 }], columns: ['a'], loading: false, error: null },
    };
    render(
      <Wrap>
        <ResultPanel
          data={null}
          retainQueryResults
          resultTabs={[tab] as never}
          activeResultTabId="tab1"
        />
      </Wrap>
    );
    expect(screen.getByTestId('import-sql-probe').textContent).toBe('SELECT * FROM j');
  });
});

describe('② ImportToDuckDBDialog 请求参数(真实对话框)', () => {
  beforeEach(() => mocks.save.mockClear());

  async function mountRealDialog(): Promise<typeof import('../ImportToDuckDBDialog')> {
    // 绕过上面的探针 mock,取真实实现
    const real = await vi.importActual<typeof import('../ImportToDuckDBDialog')>(
      '../ImportToDuckDBDialog'
    );
    return real;
  }

  it('提交时 saveQueryToDuckDB 收到 baseSql 原文;默认 applyRowLimit=false,勾选后 true', async () => {
    const { ImportToDuckDBDialog } = await mountRealDialog();
    const BASE = 'SELECT * FROM t';
    // 该对话框仅对联邦源开放(handleImport 校验 source.type==='federated')
    const fedSource = {
      type: 'federated', connectionId: 'db_c1', databaseType: 'mysql',
    } as never;
    const { unmount } = render(
      <Wrap>
        <ImportToDuckDBDialog open onOpenChange={vi.fn()} sql={BASE} source={fedSource} />
      </Wrap>
    );
    fireEvent.click(screen.getByRole('button', { name: /导入|保存|Import/i }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    let args = mocks.save.mock.calls[0];
    expect(args[0]).toBe(BASE);        // baseSql 原文,不被改写
    expect(args[5]).toBe(false);       // 默认全量
    unmount();

    mocks.save.mockClear();
    render(
      <Wrap>
        <ImportToDuckDBDialog open onOpenChange={vi.fn()} sql={BASE} source={fedSource} />
      </Wrap>
    );
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /导入|保存|Import/i }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalled());
    args = mocks.save.mock.calls[0];
    expect(args[0]).toBe(BASE);
    expect(args[5]).toBe(true);        // 勾选限制
  });
});
