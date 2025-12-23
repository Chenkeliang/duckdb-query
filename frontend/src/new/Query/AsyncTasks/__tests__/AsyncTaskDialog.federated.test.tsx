/**
 * AsyncTaskDialog 联邦查询功能测试
 * 
 * 测试异步任务对话框的联邦查询支持
 * 
 * **Feature: async-federated-query**
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';

import { AsyncTaskDialog, AttachDatabase } from '../AsyncTaskDialog';

// Mock submitAsyncQuery
vi.mock('@/services/apiClient', () => ({
  submitAsyncQuery: vi.fn().mockResolvedValue({ task_id: 'test-task-id' }),
}));

// 创建测试用的 QueryClient
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

// 测试包装器
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        {children}
      </I18nextProvider>
    </QueryClientProvider>
  );
};

describe('AsyncTaskDialog - Federated Query Support', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    sql: 'SELECT * FROM mysql_db.users',
  };

  describe('attachDatabases prop', () => {
    it('should accept attachDatabases prop', () => {
      /**
       * **Feature: async-federated-query**
       * **Validates: Requirements 3.1**
       */
      const attachDatabases: AttachDatabase[] = [
        { alias: 'mysql_db', connectionId: 'conn-1', connectionName: 'MySQL Production' },
      ];

      render(
        <TestWrapper>
          <AsyncTaskDialog {...defaultProps} attachDatabases={attachDatabases} />
        </TestWrapper>
      );

      // 对话框应该正常渲染
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should render without attachDatabases (non-federated query)', () => {
      render(
        <TestWrapper>
          <AsyncTaskDialog {...defaultProps} />
        </TestWrapper>
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should render with empty attachDatabases array', () => {
      render(
        <TestWrapper>
          <AsyncTaskDialog {...defaultProps} attachDatabases={[]} />
        </TestWrapper>
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('attached databases display', () => {
    it('should display attached databases list for federated query', () => {
      /**
       * **Feature: async-federated-query**
       * **Validates: Requirements 3.2**
       */
      const attachDatabases: AttachDatabase[] = [
        { alias: 'mysql_db', connectionId: 'conn-1', connectionName: 'MySQL Production' },
        { alias: 'pg_db', connectionId: 'conn-2', connectionName: 'PostgreSQL Analytics' },
      ];

      render(
        <TestWrapper>
          <AsyncTaskDialog {...defaultProps} attachDatabases={attachDatabases} />
        </TestWrapper>
      );

      // 应该显示数据库别名
      expect(screen.getByText('mysql_db')).toBeInTheDocument();
      expect(screen.getByText('pg_db')).toBeInTheDocument();

      // 应该显示连接名称
      expect(screen.getByText('MySQL Production')).toBeInTheDocument();
      expect(screen.getByText('PostgreSQL Analytics')).toBeInTheDocument();
    });

    it('should display connectionId when connectionName is not provided', () => {
      const attachDatabases: AttachDatabase[] = [
        { alias: 'mysql_db', connectionId: 'conn-123' },
      ];

      render(
        <TestWrapper>
          <AsyncTaskDialog {...defaultProps} attachDatabases={attachDatabases} />
        </TestWrapper>
      );

      expect(screen.getByText('mysql_db')).toBeInTheDocument();
      expect(screen.getByText('conn-123')).toBeInTheDocument();
    });

    it('should not display attached databases section for non-federated query', () => {
      render(
        <TestWrapper>
          <AsyncTaskDialog {...defaultProps} />
        </TestWrapper>
      );

      // 不应该显示附加数据库相关内容
      expect(screen.queryByText('mysql_db')).not.toBeInTheDocument();
    });
  });

  describe('AttachDatabase interface', () => {
    it('should have correct structure', () => {
      const db: AttachDatabase = {
        alias: 'test_db',
        connectionId: 'conn-1',
        connectionName: 'Test Database',
      };

      expect(db.alias).toBe('test_db');
      expect(db.connectionId).toBe('conn-1');
      expect(db.connectionName).toBe('Test Database');
    });

    it('should allow optional connectionName', () => {
      const db: AttachDatabase = {
        alias: 'test_db',
        connectionId: 'conn-1',
      };

      expect(db.alias).toBe('test_db');
      expect(db.connectionId).toBe('conn-1');
      expect(db.connectionName).toBeUndefined();
    });
  });
});
