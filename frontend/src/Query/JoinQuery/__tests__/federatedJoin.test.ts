/**
 * JoinQueryPanel 联邦查询集成测试
 *
 * **Feature: frontend-federated-query**
 * **Validates: Requirements 1.1, 2.1, 2.2, 8.1, 9.1**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { SelectedTableObject } from '@/types/SelectedTable';
import {
  extractAttachDatabases,
  formatTableReference,
  createTableReference,
  quoteIdent,
} from '@/utils/sqlUtils';
import { getTableName, normalizeSelectedTable } from '@/utils/tableUtils';

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

describe('JoinQueryPanel Federated Query Integration', () => {
  describe('Cross-database table selection', () => {
    it('should allow mixing DuckDB and external tables', () => {
      fc.assert(
        fc.property(duckdbTableArb, externalTableArb, (duckdbTable, externalTable) => {
          const tables = [duckdbTable, externalTable];

          // 验证可以提取 attach_databases
          const attachDatabases = extractAttachDatabases(tables);
          expect(attachDatabases.length).toBe(1);
          expect(attachDatabases[0].connectionId).toBe(externalTable.connection?.id);
        }),
        { numRuns: 50 }
      );
    });

    it('should handle multiple external tables from different connections', () => {
      fc.assert(
        fc.property(
          fc.array(externalTableArb, { minLength: 2, maxLength: 4 }),
          (tables) => {
            // 确保每个表有唯一的连接 ID
            const uniqueTables = tables.map((table, index) => ({
              ...table,
              connection: {
                ...table.connection!,
                id: `conn_${index}`,
              },
            }));

            const attachDatabases = extractAttachDatabases(uniqueTables);

            // 验证每个唯一连接都被提取
            expect(attachDatabases.length).toBe(uniqueTables.length);

            // 验证所有连接 ID 都存在
            const connectionIds = new Set(attachDatabases.map((db) => db.connectionId));
            uniqueTables.forEach((table) => {
              expect(connectionIds.has(table.connection!.id)).toBe(true);
            });
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('SQL generation for federated queries', () => {
    it('should generate correct table references for external tables', () => {
      fc.assert(
        fc.property(externalTableArb, (table) => {
          const attachDatabases = extractAttachDatabases([table]);
          const ref = createTableReference(table, attachDatabases);

          // 验证外部表引用包含别名
          expect(ref.isExternal).toBe(true);
          expect(ref.alias).toBeDefined();

          // 验证格式化后的引用包含别名
          const formatted = formatTableReference(ref, 'duckdb');
          expect(formatted).toContain(ref.alias!);
        }),
        { numRuns: 50 }
      );
    });

    it('should generate correct table references for DuckDB tables', () => {
      fc.assert(
        fc.property(duckdbTableArb, (table) => {
          const attachDatabases = extractAttachDatabases([table]);
          const ref = createTableReference(table, attachDatabases);

          // 验证 DuckDB 表引用不包含别名
          expect(ref.isExternal).toBe(false);
          expect(ref.alias).toBeUndefined();

          // 验证格式化后的引用只包含表名
          const formatted = formatTableReference(ref, 'duckdb');
          expect(formatted).toBe(`"${table.name}"`);
        }),
        { numRuns: 50 }
      );
    });

    it('should generate valid JOIN SQL for mixed sources', () => {
      fc.assert(
        fc.property(duckdbTableArb, externalTableArb, (duckdbTable, externalTable) => {
          const tables = [duckdbTable, externalTable];
          const attachDatabases = extractAttachDatabases(tables);

          // 模拟 SQL 生成逻辑
          const dialect = 'duckdb';
          const parts: string[] = [];

          // SELECT
          parts.push('SELECT *');

          // FROM - 第一个表
          const firstRef = createTableReference(tables[0], attachDatabases);
          const firstFormatted = formatTableReference(firstRef, dialect);
          const firstAlias = firstRef.name;
          parts.push(`FROM ${firstFormatted} AS ${quoteIdent(firstAlias, dialect)}`);

          // JOIN - 第二个表
          const secondRef = createTableReference(tables[1], attachDatabases);
          const secondFormatted = formatTableReference(secondRef, dialect);
          const secondAlias = secondRef.name;
          parts.push(
            `LEFT JOIN ${secondFormatted} AS ${quoteIdent(secondAlias, dialect)} ON 1=1`
          );

          const sql = parts.join('\n');

          // 验证 SQL 包含必要的部分
          expect(sql).toContain('SELECT *');
          expect(sql).toContain('FROM');
          expect(sql).toContain('LEFT JOIN');
          expect(sql).toContain('AS');

          // 验证外部表引用包含别名前缀
          if (secondRef.isExternal && secondRef.alias) {
            expect(sql).toContain(secondRef.alias);
          }
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Error handling', () => {
    it('should handle empty table list gracefully', () => {
      const tables: SelectedTableObject[] = [];
      const attachDatabases = extractAttachDatabases(tables);
      expect(attachDatabases).toEqual([]);
    });

    it('should handle tables without connections', () => {
      const table: SelectedTableObject = {
        name: 'test_table',
        source: 'external',
        // 没有 connection
      };

      const attachDatabases = extractAttachDatabases([table]);
      expect(attachDatabases).toEqual([]);
    });

    it('should deduplicate connections from same source', () => {
      fc.assert(
        fc.property(connectionArb, fc.integer({ min: 2, max: 5 }), (connection, count) => {
          // 创建多个使用相同连接的表
          const tables: SelectedTableObject[] = Array.from({ length: count }, (_, i) => ({
            name: `table_${i}`,
            source: 'external' as const,
            connection,
          }));

          const attachDatabases = extractAttachDatabases(tables);

          // 验证只有一个连接
          expect(attachDatabases.length).toBe(1);
          expect(attachDatabases[0].connectionId).toBe(connection.id);
        }),
        { numRuns: 50 }
      );
    });
  });
});
