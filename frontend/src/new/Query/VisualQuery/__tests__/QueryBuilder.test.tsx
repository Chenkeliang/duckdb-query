/**
 * QueryBuilder 组件单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config.js';
import { QueryBuilder, QueryConfig } from '../QueryBuilder';

// Mock useDuckDBTables hook
vi.mock('@/new/hooks/useDuckDBTables', () => ({
  useDuckDBTables: () => ({
    tables: [
      { name: 'users', type: 'table' },
      { name: 'orders', type: 'table' },
      { name: 'products', type: 'table' },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// Mock getDuckDBTableDetail API
vi.mock('@/services/apiClient', () => ({
  getDuckDBTableDetail: vi.fn().mockResolvedValue({
    columns: [
      { name: 'id', type: 'INTEGER' },
      { name: 'name', type: 'VARCHAR' },
      { name: 'email', type: 'VARCHAR' },
      { name: 'age', type: 'INTEGER' },
      { name: 'created_at', type: 'TIMESTAMP' },
    ],
  }),
}));

// 测试包装器
function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        {children}
      </I18nextProvider>
    </QueryClientProvider>
  );
}

describe('QueryBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 确保测试使用中文
    i18n.changeLanguage('zh');
  });

  describe('渲染', () => {
    it('应该正确渲染组件', () => {
      render(
        <TestWrapper>
          <QueryBuilder />
        </TestWrapper>
      );

      // 检查标题
      expect(screen.getByText(/可视化查询/i)).toBeInTheDocument();
      
      // 检查按钮
      expect(screen.getByRole('button', { name: /重置/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /预览 SQL/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /执行查询/i })).toBeInTheDocument();
    });

    it('应该渲染所有标签页', () => {
      render(
        <TestWrapper>
          <QueryBuilder />
        </TestWrapper>
      );

      expect(screen.getByRole('tab', { name: /基础/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /关联/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /过滤/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /聚合/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /排序/i })).toBeInTheDocument();
    });

    it('未选择表时应禁用其他标签页', () => {
      render(
        <TestWrapper>
          <QueryBuilder />
        </TestWrapper>
      );

      // 基础标签页应该可用
      expect(screen.getByRole('tab', { name: /基础/i })).not.toBeDisabled();
      
      // 其他标签页应该禁用
      expect(screen.getByRole('tab', { name: /关联/i })).toBeDisabled();
      expect(screen.getByRole('tab', { name: /过滤/i })).toBeDisabled();
      expect(screen.getByRole('tab', { name: /聚合/i })).toBeDisabled();
      expect(screen.getByRole('tab', { name: /排序/i })).toBeDisabled();
    });
  });

  describe('表选择', () => {
    it('应该显示表选择器', () => {
      render(
        <TestWrapper>
          <QueryBuilder />
        </TestWrapper>
      );

      expect(screen.getByText(/选择表/i)).toBeInTheDocument();
    });

    it('选择表后应启用其他标签页', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <QueryBuilder selectedTable="users" />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /关联/i })).not.toBeDisabled();
        expect(screen.getByRole('tab', { name: /过滤/i })).not.toBeDisabled();
        expect(screen.getByRole('tab', { name: /聚合/i })).not.toBeDisabled();
        expect(screen.getByRole('tab', { name: /排序/i })).not.toBeDisabled();
      });
    });

    it('选择表后应显示列选择器', async () => {
      render(
        <TestWrapper>
          <QueryBuilder selectedTable="users" />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/选择列/i)).toBeInTheDocument();
      });
    });
  });

  describe('配置变更', () => {
    it('应该调用 onConfigChange 回调', async () => {
      const user = userEvent.setup();
      const onConfigChange = vi.fn();
      
      render(
        <TestWrapper>
          <QueryBuilder 
            selectedTable="users"
            onConfigChange={onConfigChange} 
          />
        </TestWrapper>
      );

      // 点击重置按钮触发配置变更
      const resetButton = screen.getByRole('button', { name: /重置/i });
      await user.click(resetButton);

      // 配置变更时应该调用回调
      await waitFor(() => {
        expect(onConfigChange).toHaveBeenCalled();
      });
    });

    it('重置按钮应该清空配置', async () => {
      const user = userEvent.setup();
      const onConfigChange = vi.fn();
      
      render(
        <TestWrapper>
          <QueryBuilder 
            selectedTable="users"
            onConfigChange={onConfigChange} 
          />
        </TestWrapper>
      );

      const resetButton = screen.getByRole('button', { name: /重置/i });
      await user.click(resetButton);

      await waitFor(() => {
        const lastCall = onConfigChange.mock.calls[onConfigChange.mock.calls.length - 1];
        expect(lastCall[0].table).toBeNull();
        expect(lastCall[0].columns).toEqual([]);
      });
    });
  });

  describe('执行查询', () => {
    it('未选择表和列时执行按钮应禁用', () => {
      render(
        <TestWrapper>
          <QueryBuilder />
        </TestWrapper>
      );

      const executeButton = screen.getByRole('button', { name: /执行查询/i });
      expect(executeButton).toBeDisabled();
    });

    it('选择表和列后执行按钮应启用', async () => {
      render(
        <TestWrapper>
          <QueryBuilder 
            initialConfig={{
              table: 'users',
              columns: ['id', 'name'],
            }}
          />
        </TestWrapper>
      );

      const executeButton = screen.getByRole('button', { name: /执行查询/i });
      expect(executeButton).not.toBeDisabled();
    });

    it('点击执行按钮应调用 onExecute 回调', async () => {
      const user = userEvent.setup();
      const onExecute = vi.fn();
      
      render(
        <TestWrapper>
          <QueryBuilder 
            initialConfig={{
              table: 'users',
              columns: ['id', 'name'],
            }}
            onExecute={onExecute}
          />
        </TestWrapper>
      );

      const executeButton = screen.getByRole('button', { name: /执行查询/i });
      await user.click(executeButton);

      // onExecute 现在接收两个参数：config 和 tableSource
      expect(onExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'users',
          columns: ['id', 'name'],
        }),
        expect.anything() // tableSource 参数
      );
    });

    it('执行中应显示加载状态', () => {
      render(
        <TestWrapper>
          <QueryBuilder 
            initialConfig={{
              table: 'users',
              columns: ['id', 'name'],
            }}
            isExecuting={true}
          />
        </TestWrapper>
      );

      expect(screen.getByText(/执行中/i)).toBeInTheDocument();
    });
  });

  describe('预览 SQL', () => {
    it('未选择表时预览按钮应禁用', () => {
      render(
        <TestWrapper>
          <QueryBuilder />
        </TestWrapper>
      );

      const previewButton = screen.getByRole('button', { name: /预览 SQL/i });
      expect(previewButton).toBeDisabled();
    });

    it('选择表后预览按钮应启用', () => {
      render(
        <TestWrapper>
          <QueryBuilder selectedTable="users" />
        </TestWrapper>
      );

      const previewButton = screen.getByRole('button', { name: /预览 SQL/i });
      expect(previewButton).not.toBeDisabled();
    });

    it('点击预览按钮应调用 onPreview 回调', async () => {
      const user = userEvent.setup();
      const onPreview = vi.fn();
      
      render(
        <TestWrapper>
          <QueryBuilder 
            selectedTable="users"
            onPreview={onPreview}
          />
        </TestWrapper>
      );

      const previewButton = screen.getByRole('button', { name: /预览 SQL/i });
      await user.click(previewButton);

      // onPreview 现在接收两个参数：config 和 tableSource
      expect(onPreview).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'users',
        }),
        expect.anything() // tableSource 参数
      );
    });
  });

  describe('标签页切换', () => {
    it('应该能切换到过滤标签页', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <QueryBuilder selectedTable="users" />
        </TestWrapper>
      );

      const filterTab = screen.getByRole('tab', { name: /过滤/i });
      await user.click(filterTab);

      expect(filterTab).toHaveAttribute('data-state', 'active');
    });

    it('应该能切换到聚合标签页', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <QueryBuilder selectedTable="users" />
        </TestWrapper>
      );

      const aggregateTab = screen.getByRole('tab', { name: /聚合/i });
      await user.click(aggregateTab);

      expect(aggregateTab).toHaveAttribute('data-state', 'active');
    });

    it('应该能切换到排序标签页', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <QueryBuilder selectedTable="users" />
        </TestWrapper>
      );

      const sortTab = screen.getByRole('tab', { name: /排序/i });
      await user.click(sortTab);

      expect(sortTab).toHaveAttribute('data-state', 'active');
    });
  });

  describe('外部表选择', () => {
    it('应该响应 selectedTable prop 变化', async () => {
      const onConfigChange = vi.fn();
      
      const { rerender } = render(
        <TestWrapper>
          <QueryBuilder onConfigChange={onConfigChange} />
        </TestWrapper>
      );

      // 更新 selectedTable
      rerender(
        <TestWrapper>
          <QueryBuilder 
            selectedTable="orders" 
            onConfigChange={onConfigChange} 
          />
        </TestWrapper>
      );

      await waitFor(() => {
        const calls = onConfigChange.mock.calls;
        const lastCall = calls[calls.length - 1];
        expect(lastCall[0].table).toBe('orders');
      });
    });

    it('切换表时应清空列选择', async () => {
      const onConfigChange = vi.fn();
      
      const { rerender } = render(
        <TestWrapper>
          <QueryBuilder 
            initialConfig={{
              table: 'users',
              columns: ['id', 'name'],
            }}
            onConfigChange={onConfigChange} 
          />
        </TestWrapper>
      );

      // 切换到另一个表
      rerender(
        <TestWrapper>
          <QueryBuilder 
            selectedTable="orders" 
            onConfigChange={onConfigChange} 
          />
        </TestWrapper>
      );

      await waitFor(() => {
        const calls = onConfigChange.mock.calls;
        const lastCall = calls[calls.length - 1];
        expect(lastCall[0].columns).toEqual([]);
      });
    });
  });

  describe('初始配置', () => {
    it('应该使用 initialConfig 初始化', () => {
      const initialConfig: Partial<QueryConfig> = {
        table: 'users',
        columns: ['id', 'name', 'email'],
        limit: 500,
      };

      render(
        <TestWrapper>
          <QueryBuilder initialConfig={initialConfig} />
        </TestWrapper>
      );

      // 执行按钮应该启用（因为有表和列）
      const executeButton = screen.getByRole('button', { name: /执行查询/i });
      expect(executeButton).not.toBeDisabled();
    });
  });

  describe('禁用状态', () => {
    it('执行中应禁用所有操作', () => {
      render(
        <TestWrapper>
          <QueryBuilder 
            initialConfig={{
              table: 'users',
              columns: ['id'],
            }}
            isExecuting={true}
          />
        </TestWrapper>
      );

      expect(screen.getByRole('button', { name: /重置/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /预览 SQL/i })).toBeDisabled();
    });
  });
});
