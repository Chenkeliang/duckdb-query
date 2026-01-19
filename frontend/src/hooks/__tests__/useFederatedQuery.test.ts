/**
 * useFederatedQuery Hook 属性测试
 *
 * **Feature: frontend-federated-query**
 * **Property 4: Attach databases removal consistency**
 * **Property 7: Column alias in multi-table queries**
 * **Validates: Requirements 1.4, 4.3, 4.4**
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { useFederatedQuery } from '../useFederatedQuery';
import type { SelectedTableObject } from '@/types/SelectedTable';

// 生成有效的数据库类型
const databaseTypeArb = fc.constantFrom('mysql', 'postgresql', 'sqlite') as fc.Arbitrary<
  'mysql' | 'postgresql' | 'sqlite'
>;

// 生成有效的连接 ID
const connectionIdArb = fc.uuid();

// 生成有效的名称
const validNameArb = fc
  .tuple(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    fc.string({
      minLength: 0,
      maxLength: 15,
      unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
    })
  )
  .map(([first, rest]) => first + rest);

// 生成数据库连接
const connectionArb = fc.record({
  id: connectionIdArb,
  name: validNameArb,
  type: databaseTypeArb,
});

// 生成 DuckDB 表
const duckdbTableArb: fc.Arbitrary<SelectedTableObject> = validNameArb.map((name) => ({
  name,
  source: 'duckdb' as const,
}));

// 生成外部表
const externalTableArb: fc.Arbitrary<SelectedTableObject> = fc
  .tuple(validNameArb, connectionArb)
  .map(([name, connection]) => ({
    name,
    source: 'external' as const,
    connection,
  }));

describe('useFederatedQuery Hook', () => {
  describe('Property 4: Attach databases removal consistency', () => {
    /**
     * **Property 4: Attach databases removal consistency**
     * *For any* table removal operation, if no remaining tables reference
     * a particular external connection, that connection SHALL be removed
     * from the `attach_databases` list.
     */

    it('should remove connection from attach_databases when last table using it is removed', () => {
      fc.assert(
        fc.property(externalTableArb, (table) => {
          const { result } = renderHook(() => useFederatedQuery());

          // 添加表
          act(() => {
            result.current.addTable(table);
          });

          // 验证 attach_databases 包含该连接
          expect(result.current.state.attachDatabases.length).toBe(1);
          expect(result.current.state.attachDatabases[0].connectionId).toBe(
            table.connection?.id
          );

          // 移除表
          act(() => {
            result.current.removeTable(table);
          });

          // 验证 attach_databases 为空
          expect(result.current.state.attachDatabases.length).toBe(0);
        }),
        { numRuns: 50 }
      );
    });

    it('should keep connection in attach_databases if other tables still use it', () => {
      fc.assert(
        fc.property(connectionArb, fc.integer({ min: 2, max: 4 }), (connection, count) => {
          const { result } = renderHook(() => useFederatedQuery());

          // 创建多个使用相同连接的表
          const tables: SelectedTableObject[] = Array.from({ length: count }, (_, i) => ({
            name: `table_${i}`,
            source: 'external' as const,
            connection,
          }));

          // 添加所有表
          act(() => {
            tables.forEach((table) => result.current.addTable(table));
          });

          // 验证只有一个连接
          expect(result.current.state.attachDatabases.length).toBe(1);

          // 移除第一个表
          act(() => {
            result.current.removeTable(tables[0]);
          });

          // 验证连接仍然存在（因为还有其他表使用它）
          expect(result.current.state.attachDatabases.length).toBe(1);
          expect(result.current.state.attachDatabases[0].connectionId).toBe(connection.id);
        }),
        { numRuns: 50 }
      );
    });

    it('should handle mixed sources correctly on removal', () => {
      fc.assert(
        fc.property(duckdbTableArb, externalTableArb, (duckdbTable, externalTable) => {
          fc.pre(duckdbTable.name !== externalTable.name);
          const { result } = renderHook(() => useFederatedQuery());

          // 添加两种类型的表
          act(() => {
            result.current.addTable(duckdbTable);
            result.current.addTable(externalTable);
          });

          // 验证状态
          expect(result.current.state.hasMixedSources).toBe(true);
          expect(result.current.state.attachDatabases.length).toBe(1);

          // 移除外部表
          act(() => {
            result.current.removeTable(externalTable);
          });

          // 验证 attach_databases 为空，但仍有 DuckDB 表
          expect(result.current.state.attachDatabases.length).toBe(0);
          expect(result.current.state.selectedTables.length).toBe(1);
          expect(result.current.state.hasMixedSources).toBe(false);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 7: Column alias in multi-table queries', () => {
    /**
     * **Property 7: Column alias in multi-table queries**
     * *For any* query involving multiple tables, each column reference
     * in SELECT and WHERE clauses SHALL be prefixed with its source table alias.
     */

    it('should prefix columns with table alias in generated SQL', () => {
      fc.assert(
        fc.property(
          fc.array(duckdbTableArb, { minLength: 2, maxLength: 3 }),
          validNameArb,
          (tables, columnName) => {
            const { result } = renderHook(() => useFederatedQuery());

            // 添加表
            act(() => {
              tables.forEach((table) => result.current.addTable(table));
            });

            // 生成带列的 SQL
            const columns = tables.map((table) => ({
              table: table.name,
              column: columnName,
            }));

            const sql = result.current.generateSelectSQL({ columns });

            // 验证每个列都有表前缀
            tables.forEach((table) => {
              expect(sql).toContain(`"${table.name}"."${columnName}"`);
            });
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should use database alias for external tables in column references', () => {
      fc.assert(
        fc.property(externalTableArb, validNameArb, (table, columnName) => {
          const { result } = renderHook(() => useFederatedQuery());

          // 添加外部表
          act(() => {
            result.current.addTable(table);
          });

          // 获取生成的别名
          const alias = result.current.state.attachDatabases[0]?.alias;
          expect(alias).toBeDefined();

          // 生成带列的 SQL
          const columns = [{ table: table.name, column: columnName }];
          const sql = result.current.generateSelectSQL({ columns });

          // 验证列引用使用了数据库别名
          expect(sql).toContain(`"${alias}"."${columnName}"`);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Basic functionality', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useFederatedQuery());

      expect(result.current.state.selectedTables).toHaveLength(0);
      expect(result.current.state.attachDatabases).toHaveLength(0);
      expect(result.current.state.hasExternalTables).toBe(false);
      expect(result.current.state.hasMixedSources).toBe(false);
    });

    it('should add and remove tables correctly', () => {
      const { result } = renderHook(() => useFederatedQuery());

      const table: SelectedTableObject = { name: 'test_table', source: 'duckdb' };

      act(() => {
        result.current.addTable(table);
      });

      expect(result.current.state.selectedTables).toHaveLength(1);

      act(() => {
        result.current.removeTable(table);
      });

      expect(result.current.state.selectedTables).toHaveLength(0);
    });

    it('should not add duplicate tables', () => {
      const { result } = renderHook(() => useFederatedQuery());

      const table: SelectedTableObject = { name: 'test_table', source: 'duckdb' };

      act(() => {
        result.current.addTable(table);
        result.current.addTable(table);
      });

      expect(result.current.state.selectedTables).toHaveLength(1);
    });

    it('should clear all tables', () => {
      const { result } = renderHook(() => useFederatedQuery());

      act(() => {
        result.current.addTable({ name: 'table1', source: 'duckdb' });
        result.current.addTable({ name: 'table2', source: 'duckdb' });
      });

      expect(result.current.state.selectedTables).toHaveLength(2);

      act(() => {
        result.current.clearTables();
      });

      expect(result.current.state.selectedTables).toHaveLength(0);
    });

    it('should generate valid SQL for single table', () => {
      const { result } = renderHook(() => useFederatedQuery());

      act(() => {
        result.current.addTable({ name: 'users', source: 'duckdb' });
      });

      const sql = result.current.generateSelectSQL({});

      expect(sql).toContain('SELECT *');
      expect(sql).toContain('FROM "users"');
      expect(sql).toContain('LIMIT 1000');
    });

    it('should generate valid SQL for multiple tables', () => {
      const { result } = renderHook(() => useFederatedQuery());

      act(() => {
        result.current.addTable({ name: 'users', source: 'duckdb' });
        result.current.addTable({ name: 'orders', source: 'duckdb' });
      });

      const sql = result.current.generateSelectSQL({});

      expect(sql).toContain('SELECT *');
      expect(sql).toContain('FROM "users"');
      expect(sql).toContain('CROSS JOIN "orders"');
    });
  });
});
