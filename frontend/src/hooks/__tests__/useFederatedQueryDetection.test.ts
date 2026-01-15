/**
 * useFederatedQueryDetection Hook 单元测试
 */

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';

// Mock connections data
const mockConnections = [
  {
    id: 'conn-1',
    name: 'mysql_orders',
    type: 'mysql' as const,
    status: 'active' as const,
    params: { host: 'localhost', port: 3306, database: 'orders' },
  },
  {
    id: 'conn-2',
    name: 'pg_analytics',
    type: 'postgresql' as const,
    status: 'active' as const,
    params: { host: 'localhost', port: 5432, database: 'analytics' },
  },
];

// Mock useDatabaseConnections
vi.mock('../useDatabaseConnections', () => ({
  useDatabaseConnections: () => ({
    connections: mockConnections,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Import after mock
import { useFederatedQueryDetection } from '../useFederatedQueryDetection';
import type { SelectedTable } from '@/types/SelectedTable';

// 创建测试用的 QueryClient wrapper
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useFederatedQueryDetection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('DuckDB-only SQL', () => {
    it('should not require federated query for DuckDB-only SQL', () => {
      const { result } = renderHook(
        () =>
          useFederatedQueryDetection({
            sql: 'SELECT * FROM local_users',
            selectedTables: [],
            debounceMs: 0,
          }),
        { wrapper: createWrapper() }
      );

      // 等待防抖完成
      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(result.current.requiresFederatedQuery).toBe(false);
      expect(result.current.attachDatabases).toHaveLength(0);
      expect(result.current.unrecognizedPrefixes).toHaveLength(0);
      expect(result.current.tableSource.type).toBe('duckdb');
    });

    it('should parse table references without prefix', () => {
      const { result } = renderHook(
        () =>
          useFederatedQueryDetection({
            sql: 'SELECT * FROM users u JOIN orders o ON u.id = o.user_id',
            selectedTables: [],
            debounceMs: 0,
          }),
        { wrapper: createWrapper() }
      );

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(result.current.parsedTableReferences).toHaveLength(2);
      expect(result.current.parsedTableReferences[0].tableName).toBe('users');
      expect(result.current.parsedTableReferences[0].prefix).toBeNull();
      expect(result.current.parsedTableReferences[1].tableName).toBe('orders');
    });
  });

  describe('External table SQL', () => {
    it('should detect external table references by prefix', () => {
      const { result } = renderHook(
        () =>
          useFederatedQueryDetection({
            sql: 'SELECT * FROM mysql_orders.users',
            selectedTables: [],
            debounceMs: 0,
          }),
        { wrapper: createWrapper() }
      );

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(result.current.requiresFederatedQuery).toBe(true);
      expect(result.current.attachDatabases).toHaveLength(1);
      expect(result.current.attachDatabases[0].connectionId).toBe('conn-1');
      expect(result.current.tableSource.type).toBe('external');
    });

    it('should handle unrecognized prefixes', () => {
      const { result } = renderHook(
        () =>
          useFederatedQueryDetection({
            sql: 'SELECT * FROM unknown_db.users',
            selectedTables: [],
            debounceMs: 0,
          }),
        { wrapper: createWrapper() }
      );

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(result.current.unrecognizedPrefixes).toContain('unknown_db');
      expect(result.current.attachDatabases).toHaveLength(0);
    });
  });

  describe('Mixed sources', () => {
    it('should handle mixed DuckDB and external tables', () => {
      const { result } = renderHook(
        () =>
          useFederatedQueryDetection({
            sql: 'SELECT * FROM local_users u JOIN mysql_orders.orders o ON u.id = o.user_id',
            selectedTables: [],
            debounceMs: 0,
          }),
        { wrapper: createWrapper() }
      );

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(result.current.requiresFederatedQuery).toBe(true);
      expect(result.current.parsedTableReferences).toHaveLength(2);
      expect(result.current.attachDatabases).toHaveLength(1);
    });

    it('should merge attachDatabases from selectedTables and SQL', () => {
      const selectedTables: SelectedTable[] = [
        {
          name: 'products',
          source: 'external',
          connection: {
            id: 'conn-2',
            name: 'pg_analytics',
            type: 'postgresql',
          },
        },
      ];

      const { result } = renderHook(
        () =>
          useFederatedQueryDetection({
            sql: 'SELECT * FROM mysql_orders.users',
            selectedTables,
            debounceMs: 0,
          }),
        { wrapper: createWrapper() }
      );

      act(() => {
        vi.advanceTimersByTime(10);
      });

      // 应该包含两个连接
      const connectionIds = result.current.attachDatabases.map((db) => db.connectionId);
      expect(connectionIds).toContain('conn-1'); // from SQL
      expect(connectionIds).toContain('conn-2'); // from selectedTables
    });
  });

  describe('Manual override', () => {
    it('should allow manual database addition', () => {
      const { result } = renderHook(
        () =>
          useFederatedQueryDetection({
            sql: 'SELECT * FROM local_users',
            selectedTables: [],
            debounceMs: 0,
          }),
        { wrapper: createWrapper() }
      );

      act(() => {
        vi.advanceTimersByTime(10);
      });

      // 初始状态：不需要联邦查询
      expect(result.current.requiresFederatedQuery).toBe(false);

      // 手动添加数据库
      act(() => {
        result.current.addManualDatabase({
          alias: 'mysql_orders',
          connectionId: 'conn-1',
        });
      });

      // 现在需要联邦查询
      expect(result.current.requiresFederatedQuery).toBe(true);
      expect(result.current.manualDatabases).toHaveLength(1);
    });

    it('should allow manual database removal', () => {
      const { result } = renderHook(
        () =>
          useFederatedQueryDetection({
            sql: 'SELECT * FROM local_users',
            selectedTables: [],
            debounceMs: 0,
          }),
        { wrapper: createWrapper() }
      );

      act(() => {
        vi.advanceTimersByTime(10);
      });

      // 添加数据库
      act(() => {
        result.current.addManualDatabase({
          alias: 'mysql_orders',
          connectionId: 'conn-1',
        });
      });

      expect(result.current.manualDatabases).toHaveLength(1);

      // 移除数据库
      act(() => {
        result.current.removeManualDatabase('conn-1');
      });

      expect(result.current.manualDatabases).toHaveLength(0);
      expect(result.current.requiresFederatedQuery).toBe(false);
    });

    it('should not add duplicate manual databases', () => {
      const { result } = renderHook(
        () =>
          useFederatedQueryDetection({
            sql: 'SELECT * FROM local_users',
            selectedTables: [],
            debounceMs: 0,
          }),
        { wrapper: createWrapper() }
      );

      act(() => {
        vi.advanceTimersByTime(10);
      });

      // 添加两次相同的数据库
      act(() => {
        result.current.addManualDatabase({
          alias: 'mysql_orders',
          connectionId: 'conn-1',
        });
      });

      act(() => {
        result.current.addManualDatabase({
          alias: 'mysql_orders',
          connectionId: 'conn-1',
        });
      });

      expect(result.current.manualDatabases).toHaveLength(1);
    });

    it('should clear all manual databases', () => {
      const { result } = renderHook(
        () =>
          useFederatedQueryDetection({
            sql: 'SELECT * FROM local_users',
            selectedTables: [],
            debounceMs: 0,
          }),
        { wrapper: createWrapper() }
      );

      act(() => {
        vi.advanceTimersByTime(10);
      });

      // 添加多个数据库
      act(() => {
        result.current.addManualDatabase({
          alias: 'mysql_orders',
          connectionId: 'conn-1',
        });
      });

      act(() => {
        result.current.addManualDatabase({
          alias: 'pg_analytics',
          connectionId: 'conn-2',
        });
      });

      expect(result.current.manualDatabases).toHaveLength(2);

      // 清空
      act(() => {
        result.current.clearManualDatabases();
      });

      expect(result.current.manualDatabases).toHaveLength(0);
    });
  });

  describe('Debounce behavior', () => {
    it('should debounce SQL parsing', () => {
      const { result, rerender } = renderHook(
        ({ sql }) =>
          useFederatedQueryDetection({
            sql,
            selectedTables: [],
            debounceMs: 300,
          }),
        {
          wrapper: createWrapper(),
          initialProps: { sql: 'SELECT 1' },
        }
      );

      // 初始状态
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // 快速更新 SQL
      rerender({ sql: 'SELECT * FROM mysql_orders.users' });

      // 防抖期间，isParsing 应该为 true
      expect(result.current.isParsing).toBe(true);

      // 防抖完成前，不应该检测到外部表（还是旧的解析结果）
      expect(result.current.attachDatabases).toHaveLength(0);

      // 等待防抖完成
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(result.current.isParsing).toBe(false);
      expect(result.current.attachDatabases).toHaveLength(1);
    });
  });

  describe('Disabled state', () => {
    it('should not parse when disabled', () => {
      const { result } = renderHook(
        () =>
          useFederatedQueryDetection({
            sql: 'SELECT * FROM mysql_orders.users',
            selectedTables: [],
            debounceMs: 0,
            enabled: false,
          }),
        { wrapper: createWrapper() }
      );

      act(() => {
        vi.advanceTimersByTime(10);
      });

      // 禁用时不应该解析
      expect(result.current.parsedTableReferences).toHaveLength(0);
      expect(result.current.attachDatabases).toHaveLength(0);
    });
  });

  describe('Reparse functionality', () => {
    it('should force reparse when reparse is called', () => {
      const { result } = renderHook(
        () =>
          useFederatedQueryDetection({
            sql: 'SELECT * FROM mysql_orders.users',
            selectedTables: [],
            debounceMs: 0,
          }),
        { wrapper: createWrapper() }
      );

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(result.current.parsedTableReferences).toHaveLength(1);

      // 强制重新解析
      act(() => {
        result.current.reparse();
      });

      // 应该重新解析（结果相同）
      expect(result.current.parsedTableReferences).toHaveLength(1);
    });
  });

  describe('TableSource computation', () => {
    it('should return duckdb source for local tables only', () => {
      const { result } = renderHook(
        () =>
          useFederatedQueryDetection({
            sql: 'SELECT * FROM local_users',
            selectedTables: [],
            debounceMs: 0,
          }),
        { wrapper: createWrapper() }
      );

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(result.current.tableSource.type).toBe('duckdb');
    });

    it('should return external source with connection info', () => {
      const { result } = renderHook(
        () =>
          useFederatedQueryDetection({
            sql: 'SELECT * FROM mysql_orders.users',
            selectedTables: [],
            debounceMs: 0,
          }),
        { wrapper: createWrapper() }
      );

      act(() => {
        vi.advanceTimersByTime(10);
      });

      expect(result.current.tableSource.type).toBe('external');

      if (result.current.tableSource.type === 'external') {
        expect(result.current.tableSource.connectionId).toBe('conn-1');
        expect(result.current.tableSource.connectionName).toBe('mysql_orders');
        expect(result.current.tableSource.databaseType).toBe('mysql');
      }
    });
  });

  describe('Available connections', () => {
    it('should expose available connections', () => {
      const { result } = renderHook(
        () =>
          useFederatedQueryDetection({
            sql: 'SELECT 1',
            selectedTables: [],
            debounceMs: 0,
          }),
        { wrapper: createWrapper() }
      );

      expect(result.current.availableConnections).toHaveLength(2);
      expect(result.current.availableConnections[0].name).toBe('mysql_orders');
      expect(result.current.availableConnections[1].name).toBe('pg_analytics');
    });
  });
});
