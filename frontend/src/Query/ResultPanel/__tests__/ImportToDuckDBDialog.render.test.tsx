/**
 * ImportToDuckDBDialog 渲染测试
 *
 * 覆盖：移除 `databaseType !== 'mysql'` 硬编码 gate 后，非 mysql 联邦数据源
 * （如 duckdb）应能正常导入，且 source.attachDatabases（camelCase）会被正确
 * 映射为 snake_case 传给 saveQueryToDuckDB。
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  SQLHighlight: () => <div data-testid="sql-highlight-mock" />,
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

    fireEvent.click(screen.getByRole('button', { name: '导入' }));

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

    fireEvent.click(screen.getByRole('button', { name: '导入' }));

    await waitFor(() => {
      expect(saveQueryToDuckDBMock).toHaveBeenCalledTimes(1);
    });

    const attachDatabasesArg = saveQueryToDuckDBMock.mock.calls[0][4];
    expect(attachDatabasesArg).toBeUndefined();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
