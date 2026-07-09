/**
 * SchemaNode 渲染测试
 *
 * 覆盖：移除 `databaseType === 'mysql'` 硬编码 gate 后，PostgreSQL（唯一经
 * SchemaNode 渲染的引擎，走 schema 分组路径）应能拿到 onImport，与
 * DatabaseConnectionNode.tsx 里 sqlite/duckdb/mysql 表的导入权限保持一致。
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string | Record<string, unknown>) => {
      if (typeof defaultValue === 'string') return defaultValue;
      return key;
    },
  }),
}));

vi.mock('@/hooks/useSchemaTables', () => ({
  useSchemaTables: () => ({
    tables: [{ name: 'orders', row_count: 5 }],
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

// 截获 TableItem 收到的 onImport,直接验证 SchemaNode 的 gate 逻辑本身
const tableItemPropsSpy = vi.fn();
vi.mock('../TableItem', () => ({
  TableItem: (props: Record<string, unknown>) => {
    tableItemPropsSpy(props);
    return <div data-testid="table-item">{(props.table as { name: string }).name}</div>;
  },
}));

import { SchemaNode } from '../SchemaNode';

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('SchemaNode - postgres 导入权限', () => {
  it('databaseType=postgresql 时 onImport 透传给 TableItem(此前被硬编码限定为仅 mysql)', () => {
    const onImport = vi.fn();
    render(
      <TestWrapper>
        <SchemaNode
          connectionId="pg-conn"
          connectionName="pg-conn"
          databaseType="postgresql"
          schema={{ name: 'public', table_count: 1 }}
          level={0}
          selectedTables={[]}
          onTableSelect={vi.fn()}
          onImport={onImport}
          forceExpanded
        />
      </TestWrapper>
    );

    expect(screen.getByTestId('table-item')).toBeInTheDocument();
    expect(tableItemPropsSpy).toHaveBeenCalled();
    const lastCallProps = tableItemPropsSpy.mock.calls[tableItemPropsSpy.mock.calls.length - 1]?.[0] as Record<string, unknown>;
    expect(lastCallProps.onImport).toBe(onImport);
  });

  it('未传 onImport 时 TableItem 收到 undefined(与其它引擎的无导入态一致)', () => {
    render(
      <TestWrapper>
        <SchemaNode
          connectionId="pg-conn-2"
          connectionName="pg-conn-2"
          databaseType="postgresql"
          schema={{ name: 'public', table_count: 1 }}
          level={0}
          selectedTables={[]}
          onTableSelect={vi.fn()}
          forceExpanded
        />
      </TestWrapper>
    );

    const lastCallProps = tableItemPropsSpy.mock.calls[tableItemPropsSpy.mock.calls.length - 1]?.[0] as Record<string, unknown>;
    expect(lastCallProps.onImport).toBeUndefined();
  });
});
