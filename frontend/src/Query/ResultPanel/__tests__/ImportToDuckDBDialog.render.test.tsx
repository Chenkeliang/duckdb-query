/**
 * ImportToDuckDBDialog 渲染测试
 *
 * 覆盖：移除 `databaseType !== 'mysql'` 硬编码 gate 后，非 mysql 联邦数据源
 * （如 duckdb）应能正常导入，且 source.attachDatabases（camelCase）会被正确
 * 映射为 snake_case 传给 saveQueryToDuckDB。
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock react-i18next（沿用仓库内既有模式：defaultValue 为字符串时直接透传）
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string | Record<string, unknown>) => {
      if (typeof defaultValue === 'string') return defaultValue;
      return key;
    },
    i18n: { language: 'zh', changeLanguage: vi.fn() },
  }),
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock SQLHighlight：内部用 CodeMirror EditorView，jsdom 下无需渲染真实编辑器
vi.mock('@/components/SQLHighlight', () => ({
  SQLHighlight: ({ sql, scrollable }: { sql: string; scrollable?: boolean }) => (
    <div
      data-testid="sql-highlight-mock"
      data-scrollable={scrollable ? 'true' : 'false'}
    >
      {sql}
    </div>
  ),
}));

// Mock saveQueryToDuckDB；toAttachDatabasesPayload 是纯函数，直接复用真实实现
const saveQueryToDuckDBMock = vi.fn();
vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api');
  return {
    ...actual,
    saveQueryToDuckDB: (...args: unknown[]) => saveQueryToDuckDBMock(...args),
  };
});

import { toast } from 'sonner';
import { ImportToDuckDBDialog } from '../ImportToDuckDBDialog';
import type { TableSource } from '@/hooks/useQueryWorkspace';

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('ImportToDuckDBDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Regression 2026-07-28: same-day saves need distinct timestamped table names. */
  it('generates a new date-time-suffixed table name when reopened', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 28, 16, 1, 2));

    const source: TableSource = {
      type: 'federated',
      connectionId: 'Sorting',
      connectionName: 'mysql_sorting',
      databaseType: 'mysql',
    };

    const onOpenChange = vi.fn();
    const { rerender } = render(
      <TestWrapper>
        <ImportToDuckDBDialog
          open
          onOpenChange={onOpenChange}
          sql="SELECT * FROM mysql_sorting.orders"
          source={source}
        />
      </TestWrapper>
    );

    expect(screen.getByLabelText('表名')).toHaveValue(
      'imported_mysql_sorting_20260728_160102'
    );

    rerender(
      <TestWrapper>
        <ImportToDuckDBDialog
          open={false}
          onOpenChange={onOpenChange}
          sql="SELECT * FROM mysql_sorting.orders"
          source={source}
        />
      </TestWrapper>
    );
    vi.setSystemTime(new Date(2026, 6, 28, 16, 1, 3));
    rerender(
      <TestWrapper>
        <ImportToDuckDBDialog
          open
          onOpenChange={onOpenChange}
          sql="SELECT * FROM mysql_sorting.orders"
          source={source}
        />
      </TestWrapper>
    );

    expect(screen.getByLabelText('表名')).toHaveValue(
      'imported_mysql_sorting_20260728_160103'
    );
  });

  /** Regression 2026-07-29: SQL stays available without crowding the primary form. */
  it('expands to show the complete SQL in a scrollable preview', () => {
    const longSql = `SELECT '${'x'.repeat(240)}' AS payload FROM orders ORDER BY end_marker`;

    render(
      <TestWrapper>
        <ImportToDuckDBDialog
          open
          onOpenChange={vi.fn()}
          sql={longSql}
          source={{
            type: 'federated',
            connectionId: 'Sorting',
            connectionName: 'mysql_sorting',
            databaseType: 'mysql',
          }}
        />
      </TestWrapper>
    );

    expect(screen.queryByTestId('sql-highlight-mock')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'SQL 预览' }));

    const preview = screen.getByTestId('sql-highlight-mock');
    expect(preview).toHaveTextContent(longSql);
    expect(preview).toHaveAttribute('data-scrollable', 'true');
  });

  it('uses precise copy and switches the current row-limit state', () => {
    render(
      <TestWrapper>
        <ImportToDuckDBDialog
          open
          onOpenChange={vi.fn()}
          sql="SELECT * FROM mysql_sorting.orders LIMIT 10000"
          source={{
            type: 'federated',
            connectionId: 'Sorting',
            connectionName: 'mysql_sorting',
            databaseType: 'mysql',
          }}
        />
      </TestWrapper>
    );

    expect(screen.getByRole('heading', { name: '保存为 DuckDB 表' })).toBeInTheDocument();
    expect(
      screen.getByText('不限结果行数：移除 SQL 最外层 LIMIT，保留子查询 LIMIT')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(
      screen.getByText('限制结果行数：保留 SQL 最外层 LIMIT；未设置时限制为 10,000 行')
    ).toBeInTheDocument();
  });

  it('非 mysql 联邦数据源（duckdb）导入时不再报 mysqlOnly 错误，attachDatabases 映射为 connection_id', async () => {
    saveQueryToDuckDBMock.mockResolvedValue({
      success: true,
      table_name: 'imported_demo',
      messageCode: 'TABLE_CREATED',
    });

    const source: TableSource = {
      type: 'federated',
      connectionId: 'X',
      connectionName: 'demo',
      databaseType: 'duckdb',
      attachDatabases: [{ alias: 'duckdb_demo', connectionId: 'X' }],
    };

    render(
      <TestWrapper>
        <ImportToDuckDBDialog
          open
          onOpenChange={vi.fn()}
          sql="SELECT * FROM duckdb_demo.items"
          source={source}
          defaultTableName="imported_demo"
        />
      </TestWrapper>
    );

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(saveQueryToDuckDBMock).toHaveBeenCalledTimes(1);
    });

    // 第 5 个参数：attachDatabases 已从 {alias, connectionId} 映射为 {alias, connection_id}
    const [sqlArg, datasourceArg, tableAliasArg, queryDataArg, attachDatabasesArg] =
      saveQueryToDuckDBMock.mock.calls[0];
    expect(sqlArg).toBe('SELECT * FROM duckdb_demo.items');
    expect(datasourceArg).toEqual({ id: 'X', type: 'duckdb' });
    expect(tableAliasArg).toBe('imported_demo');
    expect(queryDataArg).toBeNull();
    expect(attachDatabasesArg).toEqual([{ alias: 'duckdb_demo', connection_id: 'X' }]);

    // 不再弹 mysqlOnly（或任何其他）错误 toast
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('缺少 attachDatabases 时仍可正常导入（该字段可选）', async () => {
    saveQueryToDuckDBMock.mockResolvedValue({ success: true, table_name: 't', messageCode: 'TABLE_CREATED' });

    const source: TableSource = {
      type: 'federated',
      connectionId: 'X',
      databaseType: 'sqlite',
    };

    render(
      <TestWrapper>
        <ImportToDuckDBDialog
          open
          onOpenChange={vi.fn()}
          sql="SELECT * FROM sqlite_demo.orders"
          source={source}
          defaultTableName="imported_orders"
        />
      </TestWrapper>
    );

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(saveQueryToDuckDBMock).toHaveBeenCalledTimes(1);
    });

    const attachDatabasesArg = saveQueryToDuckDBMock.mock.calls[0][4];
    expect(attachDatabasesArg).toBeUndefined();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
