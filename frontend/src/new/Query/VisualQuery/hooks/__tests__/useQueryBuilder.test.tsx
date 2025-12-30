/**
 * useQueryBuilder Hook 单元测试
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n/config.js';
import { useQueryBuilder } from '../useQueryBuilder';
import type { QueryConfig, FilterConfig, AggregationConfig, SortConfig, JoinConfig } from '../../QueryBuilder';

// Mock API
vi.mock('@/api', () => ({
  executeDuckDBSQL: vi.fn().mockResolvedValue({
    data: [{ id: 1, name: 'test' }],
    row_count: 1,
  }),
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// 测试包装器
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        {children}
      </I18nextProvider>
    </QueryClientProvider>
  );
}

describe('useQueryBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // 确保测试使用中文
    i18n.changeLanguage('zh');
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('初始化', () => {
    it('应该使用默认配置初始化', () => {
      const { result } = renderHook(() => useQueryBuilder(), {
        wrapper: createWrapper(),
      });

      expect(result.current.config.table).toBeNull();
      expect(result.current.config.columns).toEqual([]);
      expect(result.current.config.filters).toEqual([]);
      expect(result.current.config.aggregations).toEqual([]);
      expect(result.current.config.orderBy).toEqual([]);
      expect(result.current.config.limit).toBe(1000);
    });

    it('应该使用初始配置初始化', () => {
      const initialConfig: Partial<QueryConfig> = {
        table: 'users',
        columns: ['id', 'name'],
        limit: 500,
      };

      const { result } = renderHook(() => useQueryBuilder(initialConfig), {
        wrapper: createWrapper(),
      });

      expect(result.current.config.table).toBe('users');
      expect(result.current.config.columns).toEqual(['id', 'name']);
      expect(result.current.config.limit).toBe(500);
    });
  });

  describe('配置更新', () => {
    it('updateConfig 应该更新配置', () => {
      const { result } = renderHook(() => useQueryBuilder(), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.updateConfig({ table: 'orders' });
      });

      expect(result.current.config.table).toBe('orders');
    });

    it('setTable 应该设置表并清空其他配置', () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: ['id', 'name'],
          filters: [{ id: '1', column: 'id', operator: '=', value: 1, logicOperator: 'AND' }],
        }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.setTable('orders');
      });

      expect(result.current.config.table).toBe('orders');
      expect(result.current.config.columns).toEqual([]);
      expect(result.current.config.filters).toEqual([]);
    });

    it('setColumns 应该设置列', () => {
      const { result } = renderHook(() => useQueryBuilder({ table: 'users' }), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setColumns(['id', 'name', 'email']);
      });

      expect(result.current.config.columns).toEqual(['id', 'name', 'email']);
    });

    it('setFilters 应该设置过滤条件', () => {
      const { result } = renderHook(() => useQueryBuilder({ table: 'users' }), {
        wrapper: createWrapper(),
      });

      const filters: FilterConfig[] = [
        { id: '1', column: 'age', operator: '>', value: 18, logicOperator: 'AND' },
      ];

      act(() => {
        result.current.setFilters(filters);
      });

      expect(result.current.config.filters).toEqual(filters);
    });

    it('setAggregations 应该设置聚合', () => {
      const { result } = renderHook(() => useQueryBuilder({ table: 'users' }), {
        wrapper: createWrapper(),
      });

      const aggregations: AggregationConfig[] = [
        { id: '1', column: 'age', function: 'AVG', alias: 'avg_age' },
      ];

      act(() => {
        result.current.setAggregations(aggregations);
      });

      expect(result.current.config.aggregations).toEqual(aggregations);
    });

    it('setOrderBy 应该设置排序', () => {
      const { result } = renderHook(() => useQueryBuilder({ table: 'users' }), {
        wrapper: createWrapper(),
      });

      const orderBy: SortConfig[] = [
        { id: '1', column: 'name', direction: 'ASC' },
      ];

      act(() => {
        result.current.setOrderBy(orderBy);
      });

      expect(result.current.config.orderBy).toEqual(orderBy);
    });

    it('setJoins 应该设置 JOIN', () => {
      const { result } = renderHook(() => useQueryBuilder({ table: 'users' }), {
        wrapper: createWrapper(),
      });

      const joins: JoinConfig[] = [
        { id: '1', joinType: 'LEFT', targetTable: 'orders', sourceColumn: 'id', targetColumn: 'user_id' },
      ];

      act(() => {
        result.current.setJoins(joins);
      });

      expect(result.current.config.joins).toEqual(joins);
    });

    it('setLimit 应该设置限制', () => {
      const { result } = renderHook(() => useQueryBuilder({ table: 'users' }), {
        wrapper: createWrapper(),
      });

      act(() => {
        result.current.setLimit(100);
      });

      expect(result.current.config.limit).toBe(100);
    });

    it('resetConfig 应该重置配置', () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: ['id', 'name'],
        }),
        { wrapper: createWrapper() }
      );

      act(() => {
        result.current.resetConfig();
      });

      expect(result.current.config.table).toBeNull();
      expect(result.current.config.columns).toEqual([]);
    });
  });

  describe('验证', () => {
    it('未选择表时应该无效', () => {
      const { result } = renderHook(() => useQueryBuilder(), {
        wrapper: createWrapper(),
      });

      expect(result.current.validation.isValid).toBe(false);
      expect(result.current.validation.errors.length).toBeGreaterThan(0);
    });

    it('未选择列时应该无效', () => {
      const { result } = renderHook(() => useQueryBuilder({ table: 'users' }), {
        wrapper: createWrapper(),
      });

      expect(result.current.validation.isValid).toBe(false);
    });

    it('选择表和列后应该有效', () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: ['id', 'name'],
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current.validation.isValid).toBe(true);
      expect(result.current.validation.errors).toEqual([]);
    });

    it('有聚合但无 GROUP BY 时应该有警告', () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: ['name'],
          aggregations: [{ id: '1', column: 'age', function: 'AVG' }],
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current.validation.warnings.length).toBeGreaterThan(0);
    });

    it('BETWEEN 操作符缺少第二个值时应该无效', () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: ['id'],
          filters: [
            { id: '1', column: 'age', operator: 'BETWEEN', value: 18, logicOperator: 'AND' },
          ],
        }),
        { wrapper: createWrapper() }
      );

      expect(result.current.validation.isValid).toBe(false);
    });
  });

  describe('SQL 生成', () => {
    it('应该生成基本 SELECT 语句', async () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: ['id', 'name'],
        }),
        { wrapper: createWrapper() }
      );

      let sql: string | null = null;
      await act(async () => {
        sql = await result.current.generateSQL();
      });

      expect(sql).toContain('SELECT');
      expect(sql).toContain('"id"');
      expect(sql).toContain('"name"');
      expect(sql).toContain('FROM "users"');
    });

    it('应该生成带 WHERE 子句的 SQL', async () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: ['id', 'name'],
          filters: [
            { id: '1', column: 'age', operator: '>', value: 18, logicOperator: 'AND' },
          ],
        }),
        { wrapper: createWrapper() }
      );

      let sql: string | null = null;
      await act(async () => {
        sql = await result.current.generateSQL();
      });

      expect(sql).toContain('WHERE');
      expect(sql).toContain('"age" > 18');
    });

    it('应该生成带 ORDER BY 子句的 SQL', async () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: ['id', 'name'],
          orderBy: [{ id: '1', column: 'name', direction: 'ASC' }],
        }),
        { wrapper: createWrapper() }
      );

      let sql: string | null = null;
      await act(async () => {
        sql = await result.current.generateSQL();
      });

      expect(sql).toContain('ORDER BY');
      expect(sql).toContain('"name" ASC');
    });

    it('应该生成带 LIMIT 子句的 SQL', async () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: ['id'],
          limit: 100,
        }),
        { wrapper: createWrapper() }
      );

      let sql: string | null = null;
      await act(async () => {
        sql = await result.current.generateSQL();
      });

      expect(sql).toContain('LIMIT 100');
    });

    it('应该生成带聚合函数的 SQL', async () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: [],
          aggregations: [
            { id: '1', column: 'age', function: 'AVG', alias: 'avg_age' },
          ],
        }),
        { wrapper: createWrapper() }
      );

      let sql: string | null = null;
      await act(async () => {
        sql = await result.current.generateSQL();
      });

      expect(sql).toContain('AVG("age")');
      expect(sql).toContain('AS "avg_age"');
    });

    it('应该生成带 JOIN 的 SQL', async () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: ['id', 'name'],
          joins: [
            { id: '1', joinType: 'LEFT', targetTable: 'orders', sourceColumn: 'id', targetColumn: 'user_id' },
          ],
        }),
        { wrapper: createWrapper() }
      );

      let sql: string | null = null;
      await act(async () => {
        sql = await result.current.generateSQL();
      });

      expect(sql).toContain('LEFT JOIN "orders"');
      expect(sql).toContain('ON "users"."id" = "orders"."user_id"');
    });
  });

  describe('查询执行', () => {
    it('应该执行查询', async () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: ['id', 'name'],
        }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        await result.current.executeQuery();
      });

      // 检查 API 是否被调用
      const { executeDuckDBSQL } = await import('@/api');
      expect(executeDuckDBSQL).toHaveBeenCalled();
    });

    it('配置无效时不应该执行查询', async () => {
      const { result } = renderHook(() => useQueryBuilder(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.executeQuery();
      });

      // 检查 API 是否未被调用
      const { executeDuckDBSQL } = await import('@/api');
      expect(executeDuckDBSQL).not.toHaveBeenCalled();
    });
  });

  describe('历史记录', () => {
    it('执行查询后应该添加到历史记录', async () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: ['id', 'name'],
        }),
        { wrapper: createWrapper() }
      );

      await act(async () => {
        await result.current.executeQuery();
      });

      expect(result.current.queryHistory.length).toBeGreaterThan(0);
    });

    it('loadFromHistory 应该加载历史配置', async () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: ['id', 'name'],
        }),
        { wrapper: createWrapper() }
      );

      // 先执行一次查询
      await act(async () => {
        await result.current.executeQuery();
      });

      // 修改配置
      act(() => {
        result.current.setTable('orders');
      });

      expect(result.current.config.table).toBe('orders');

      // 从历史记录加载
      const historyItem = result.current.queryHistory[0];
      act(() => {
        result.current.loadFromHistory(historyItem);
      });

      expect(result.current.config.table).toBe('users');
    });

    it('clearHistory 应该清空历史记录', async () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: ['id', 'name'],
        }),
        { wrapper: createWrapper() }
      );

      // 先执行一次查询
      await act(async () => {
        await result.current.executeQuery();
      });

      expect(result.current.queryHistory.length).toBeGreaterThan(0);

      // 清空历史
      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.queryHistory).toEqual([]);
    });
  });

  describe('加载状态', () => {
    it('生成 SQL 时应该设置 isGeneratingSQL', async () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: ['id'],
        }),
        { wrapper: createWrapper() }
      );

      // 开始生成 SQL
      const promise = act(async () => {
        await result.current.generateSQL();
      });

      // 等待完成
      await promise;
    });

    it('执行查询时应该设置 isExecuting', async () => {
      const { result } = renderHook(
        () => useQueryBuilder({
          table: 'users',
          columns: ['id'],
        }),
        { wrapper: createWrapper() }
      );

      // 开始执行查询
      const promise = act(async () => {
        await result.current.executeQuery();
      });

      // 等待完成
      await promise;
    });
  });
});
