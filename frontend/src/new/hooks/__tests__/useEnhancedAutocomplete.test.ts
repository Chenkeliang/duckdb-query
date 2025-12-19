import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock the dependent hooks
vi.mock('../useDuckDBTables', () => ({
  useDuckDBTables: vi.fn(),
}));

vi.mock('../useDatabaseConnections', () => ({
  useDatabaseConnections: vi.fn(),
}));

vi.mock('../useDataSources', () => ({
  useDataSources: vi.fn(),
}));

vi.mock('../../utils/sqlUtils', () => ({
  generateDatabaseAlias: vi.fn((conn) => `${conn.type}_${conn.name.toLowerCase().replace(/\s+/g, '_')}`),
}));

import { useEnhancedAutocomplete } from '../useEnhancedAutocomplete';
import { useDuckDBTables } from '../useDuckDBTables';
import { useDatabaseConnections } from '../useDatabaseConnections';
import { useDataSources } from '../useDataSources';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('useEnhancedAutocomplete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DuckDB tables', () => {
    it('should include DuckDB tables in the result', () => {
      vi.mocked(useDuckDBTables).mockReturnValue({
        tables: [
          { name: 'users', type: 'table' },
          { name: 'orders', type: 'table' },
        ],
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      vi.mocked(useDatabaseConnections).mockReturnValue({
        connections: [],
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      vi.mocked(useDataSources).mockReturnValue({
        dataSources: [],
        total: 0,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      const { result } = renderHook(() => useEnhancedAutocomplete(), {
        wrapper: createWrapper(),
      });

      expect(result.current.duckdbTables).toHaveLength(2);
      expect(result.current.duckdbTables[0].name).toBe('users');
      expect(result.current.duckdbTables[0].source).toBe('duckdb');
      expect(result.current.tableNames).toContain('users');
      expect(result.current.tableNames).toContain('orders');
    });

    it('should include DuckDB tables in schema', () => {
      vi.mocked(useDuckDBTables).mockReturnValue({
        tables: [{ name: 'products', type: 'table' }],
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      vi.mocked(useDatabaseConnections).mockReturnValue({
        connections: [],
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      vi.mocked(useDataSources).mockReturnValue({
        dataSources: [],
        total: 0,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      const { result } = renderHook(() => useEnhancedAutocomplete(), {
        wrapper: createWrapper(),
      });

      expect(result.current.schema).toHaveProperty('products');
    });
  });

  describe('External tables', () => {
    it('should include external tables with qualified names', () => {
      vi.mocked(useDuckDBTables).mockReturnValue({
        tables: [],
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      vi.mocked(useDatabaseConnections).mockReturnValue({
        connections: [
          {
            id: 'conn1',
            name: 'Production DB',
            type: 'mysql',
            status: 'active',
            params: {},
          },
        ],
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      vi.mocked(useDataSources).mockReturnValue({
        dataSources: [
          {
            id: 'conn1',
            name: 'Production DB',
            type: 'database',
            dbType: 'mysql',
            params: {
              tables: [
                { name: 'customers', schema: 'public' },
                { name: 'products' },
              ],
            },
          },
        ],
        total: 1,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      const { result } = renderHook(() => useEnhancedAutocomplete(), {
        wrapper: createWrapper(),
      });

      // 应该有外部表
      const externalTables = result.current.tables.filter((t) => t.source === 'external');
      expect(externalTables.length).toBeGreaterThan(0);

      // 检查完整限定名
      const customersTable = externalTables.find((t) => t.name === 'customers');
      expect(customersTable).toBeDefined();
      expect(customersTable?.qualifiedName).toContain('public');
      expect(customersTable?.qualifiedName).toContain('customers');
    });

    it('should group external tables by connection', () => {
      vi.mocked(useDuckDBTables).mockReturnValue({
        tables: [],
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      vi.mocked(useDatabaseConnections).mockReturnValue({
        connections: [
          { id: 'conn1', name: 'MySQL Prod', type: 'mysql', status: 'active', params: {} },
          { id: 'conn2', name: 'PG Dev', type: 'postgresql', status: 'active', params: {} },
        ],
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      vi.mocked(useDataSources).mockReturnValue({
        dataSources: [
          {
            id: 'conn1',
            name: 'MySQL Prod',
            type: 'database',
            dbType: 'mysql',
            params: { tables: [{ name: 'users' }] },
          },
          {
            id: 'conn2',
            name: 'PG Dev',
            type: 'database',
            dbType: 'postgresql',
            params: { tables: [{ name: 'orders' }] },
          },
        ],
        total: 2,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      const { result } = renderHook(() => useEnhancedAutocomplete(), {
        wrapper: createWrapper(),
      });

      expect(result.current.externalTablesByConnection).toHaveProperty('conn1');
      expect(result.current.externalTablesByConnection).toHaveProperty('conn2');
    });
  });

  describe('getTablesForPrefix', () => {
    it('should return all tables when prefix is empty', () => {
      vi.mocked(useDuckDBTables).mockReturnValue({
        tables: [{ name: 'local_table', type: 'table' }],
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      vi.mocked(useDatabaseConnections).mockReturnValue({
        connections: [],
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      vi.mocked(useDataSources).mockReturnValue({
        dataSources: [],
        total: 0,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      const { result } = renderHook(() => useEnhancedAutocomplete(), {
        wrapper: createWrapper(),
      });

      const tables = result.current.getTablesForPrefix('');
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('local_table');
    });

    it('should filter tables by prefix', () => {
      vi.mocked(useDuckDBTables).mockReturnValue({
        tables: [{ name: 'local_table', type: 'table' }],
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      vi.mocked(useDatabaseConnections).mockReturnValue({
        connections: [
          { id: 'conn1', name: 'MySQL Prod', type: 'mysql', status: 'active', params: {} },
        ],
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      vi.mocked(useDataSources).mockReturnValue({
        dataSources: [
          {
            id: 'conn1',
            name: 'MySQL Prod',
            type: 'database',
            dbType: 'mysql',
            params: { tables: [{ name: 'remote_users' }] },
          },
        ],
        total: 1,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      const { result } = renderHook(() => useEnhancedAutocomplete(), {
        wrapper: createWrapper(),
      });

      // 使用生成的别名过滤
      const tables = result.current.getTablesForPrefix('mysql_mysql_prod');
      expect(tables.every((t) => t.source === 'external')).toBe(true);
    });
  });

  describe('Loading state', () => {
    it('should be loading when any dependency is loading', () => {
      vi.mocked(useDuckDBTables).mockReturnValue({
        tables: [],
        isLoading: true,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      vi.mocked(useDatabaseConnections).mockReturnValue({
        connections: [],
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      vi.mocked(useDataSources).mockReturnValue({
        dataSources: [],
        total: 0,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      const { result } = renderHook(() => useEnhancedAutocomplete(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('should not be loading when all dependencies are loaded', () => {
      vi.mocked(useDuckDBTables).mockReturnValue({
        tables: [],
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      vi.mocked(useDatabaseConnections).mockReturnValue({
        connections: [],
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      vi.mocked(useDataSources).mockReturnValue({
        dataSources: [],
        total: 0,
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
        refresh: vi.fn(),
      });

      const { result } = renderHook(() => useEnhancedAutocomplete(), {
        wrapper: createWrapper(),
      });

      expect(result.current.isLoading).toBe(false);
    });
  });
});
