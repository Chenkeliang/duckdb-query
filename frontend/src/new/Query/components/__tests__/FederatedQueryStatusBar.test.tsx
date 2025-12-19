/**
 * FederatedQueryStatusBar 组件单元测试
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FederatedQueryStatusBar } from '../FederatedQueryStatusBar';

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue: string, params?: Record<string, unknown>) => {
      if (params?.count !== undefined) {
        return defaultValue.replace('{{count}}', String(params.count));
      }
      if (params?.time !== undefined) {
        return defaultValue.replace('{{time}}', String(params.time));
      }
      return defaultValue;
    },
  }),
}));

describe('FederatedQueryStatusBar', () => {
  describe('Query type display', () => {
    it('should display DuckDB query type', () => {
      render(<FederatedQueryStatusBar queryType="duckdb" />);
      expect(screen.getByText('DuckDB 本地')).toBeInTheDocument();
    });

    it('should display external query type', () => {
      render(<FederatedQueryStatusBar queryType="external" />);
      expect(screen.getByText('外部数据库')).toBeInTheDocument();
    });

    it('should display federated query type', () => {
      render(<FederatedQueryStatusBar queryType="federated" />);
      expect(screen.getByText('联邦查询')).toBeInTheDocument();
    });
  });

  describe('Attached databases display', () => {
    it('should display connected databases count', () => {
      render(
        <FederatedQueryStatusBar
          queryType="federated"
          attachDatabases={[
            { alias: 'mysql_orders', connectionId: '1' },
            { alias: 'pg_users', connectionId: '2' },
          ]}
        />
      );

      expect(screen.getByText('2 个连接')).toBeInTheDocument();
    });

    it('should not display databases count when empty', () => {
      render(<FederatedQueryStatusBar queryType="duckdb" attachDatabases={[]} />);

      expect(screen.queryByText(/个连接/)).not.toBeInTheDocument();
    });
  });

  describe('Execution status', () => {
    it('should display executing status', () => {
      render(<FederatedQueryStatusBar queryType="duckdb" isExecuting={true} />);

      expect(screen.getByText('执行中...')).toBeInTheDocument();
    });

    it('should display execution time in milliseconds', () => {
      render(
        <FederatedQueryStatusBar
          queryType="duckdb"
          isExecuting={false}
          executionTime={500}
        />
      );

      expect(screen.getByText('耗时: 500ms')).toBeInTheDocument();
    });

    it('should display execution time in seconds for long queries', () => {
      render(
        <FederatedQueryStatusBar
          queryType="duckdb"
          isExecuting={false}
          executionTime={2500}
        />
      );

      expect(screen.getByText('耗时: 2.50s')).toBeInTheDocument();
    });

    it('should not display execution time when executing', () => {
      render(
        <FederatedQueryStatusBar
          queryType="duckdb"
          isExecuting={true}
          executionTime={500}
        />
      );

      expect(screen.queryByText(/耗时/)).not.toBeInTheDocument();
    });
  });
});
