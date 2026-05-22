/**
 * ResultPanel 组件单元测试（简化版）
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string | Record<string, unknown>) => {
      if (typeof defaultValue === 'string') return defaultValue;
      if (key === 'query.result.loading') return '加载中...';
      if (key === 'query.result.error') return '查询失败';
      if (key === 'query.result.noData') return '暂无数据';
      if (key === 'query.result.noDataHint') return '执行查询以查看结果';
      return key;
    },
    i18n: { language: 'zh', changeLanguage: vi.fn() },
  }),
  I18nextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock DataGridWrapper
vi.mock('../DataGridWrapper', () => ({
  DataGridWrapper: ({ rowData }: { rowData: Record<string, unknown>[] | null }) => (
    <div data-testid="data-grid-mock">
      {rowData?.map((row, i) => (
        <div key={i} data-testid="grid-row">
          {Object.values(row).map((v, j) => (
            <span key={j}>{String(v)}</span>
          ))}
        </div>
      ))}
    </div>
  ),
}));

// Mock ResultToolbar
vi.mock('../ResultToolbar', () => ({
  ResultToolbar: () => <div data-testid="result-toolbar">Toolbar</div>,
}));

// Mock ImportToDuckDBDialog
vi.mock('../ImportToDuckDBDialog', () => ({
  ImportToDuckDBDialog: () => null,
}));

// Mock hooks
vi.mock('../hooks/useDataGridColumns', () => ({
  useDataGridColumns: () => ({ columns: [] }),
}));

// 导入组件
import { ResultPanel } from '../ResultPanel';

// 测试包装器
function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// 测试数据
const mockData = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob', email: 'bob@example.com' },
];

describe('ResultPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该渲染加载状态', () => {
    render(
      <TestWrapper>
        <ResultPanel data={null} loading={true} />
      </TestWrapper>
    );
    expect(screen.getByText(/加载中/i)).toBeInTheDocument();
  });

  it('应该渲染错误状态', () => {
    render(
      <TestWrapper>
        <ResultPanel data={null} error={new Error('查询执行失败')} />
      </TestWrapper>
    );
    expect(screen.getByText(/查询失败/i)).toBeInTheDocument();
  });

  it('应该渲染空状态', () => {
    render(
      <TestWrapper>
        <ResultPanel data={[]} />
      </TestWrapper>
    );
    expect(screen.getByText(/暂无数据/i)).toBeInTheDocument();
  });

  it('应该渲染数据表格', () => {
    render(
      <TestWrapper>
        <ResultPanel data={mockData} />
      </TestWrapper>
    );
    expect(screen.getByTestId('data-grid-mock')).toBeInTheDocument();
  });

  it('应该渲染所有数据行', () => {
    render(
      <TestWrapper>
        <ResultPanel data={mockData} />
      </TestWrapper>
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });
});
