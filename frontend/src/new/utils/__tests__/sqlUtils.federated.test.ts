/**
 * 联邦查询 SQL 工具属性测试
 *
 * **Feature: frontend-federated-query**
 * **Property 1: Attach databases list consistency**
 * **Property 2: External table SQL prefix**
 * **Property 3: DuckDB table SQL format**
 * **Property 5: Unique database aliases**
 * **Validates: Requirements 1.3, 2.1, 4.2, 8.2, 8.3, 9.2, 9.3, 9.5**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  extractAttachDatabases,
  generateDatabaseAlias,
  formatTableReference,
  createTableReference,
  type AttachDatabase,
  type DatabaseConnection,
  type TableReference,
} from '../sqlUtils';
import type { SelectedTableObject } from '@/new/types/SelectedTable';

// 生成有效的数据库类型
const databaseTypeArb = fc.constantFrom('mysql', 'postgresql', 'sqlite') as fc.Arbitrary<
  'mysql' | 'postgresql' | 'sqlite'
>;

// 生成有效的连接 ID
const connectionIdArb = fc.uuid();

// 生成有效的名称（字母数字下划线，以字母开头）
const validNameArb = fc
  .tuple(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    fc.string({
      minLength: 0,
      maxLength: 20,
      unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'.split('')),
    })
  )
  .map(([first, rest]) => first + rest);

// 生成数据库连接
const connectionArb: fc.Arbitrary<DatabaseConnection> = fc.record({
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
  .tuple(validNameArb, fc.option(validNameArb, { nil: undefined }), connectionArb)
  .map(([name, schema, connection]) => ({
    name,
    schema,
    source: 'external' as const,
    connection,
  }));

// 生成混合表列表
const mixedTablesArb = fc.array(fc.oneof(duckdbTableArb, externalTableArb), {
  minLength: 0,
  maxLength: 10,
});

describe('Federated Query SQL Utils', () => {
  describe('Property 1: Attach databases list consistency', () => {
    /**
     * **Property 1: Attach databases list consistency**
     * *For any* set of selected tables, the `attach_databases` list SHALL contain
     * exactly the unique external database connections referenced by those tables,
     * with no duplicates and no DuckDB tables included.
     */

    it('should contain only unique external connections', async () => {
      await fc.assert(
        fc.property(mixedTablesArb, (tables) => {
          const result = extractAttachDatabases(tables);

          // 收集所有外部连接 ID
          const externalConnectionIds = new Set<string>();
          tables.forEach((table) => {
            if (table.source === 'external' && table.connection) {
              externalConnectionIds.add(table.connection.id);
            }
          });

          // 验证结果数量等于唯一外部连接数
          expect(result.length).toBe(externalConnectionIds.size);

          // 验证结果中的连接 ID 都是唯一的
          const resultConnectionIds = result.map((db) => db.connectionId);
          expect(new Set(resultConnectionIds).size).toBe(result.length);

          // 验证结果中的连接 ID 都来自外部表
          resultConnectionIds.forEach((id) => {
            expect(externalConnectionIds.has(id)).toBe(true);
          });
        }),
        { numRuns: 100 }
      );
    });

    it('should not include DuckDB tables', async () => {
      await fc.assert(
        fc.property(fc.array(duckdbTableArb, { minLength: 1, maxLength: 5 }), (tables) => {
          const result = extractAttachDatabases(tables);
          expect(result.length).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    it('should handle duplicate external connections', async () => {
      await fc.assert(
        fc.property(connectionArb, fc.integer({ min: 2, max: 5 }), (connection, count) => {
          // 创建多个使用相同连接的外部表
          const tables: SelectedTableObject[] = Array.from({ length: count }, (_, i) => ({
            name: `table_${i}`,
            source: 'external' as const,
            connection,
          }));

          const result = extractAttachDatabases(tables);

          // 应该只有一个条目
          expect(result.length).toBe(1);
          expect(result[0].connectionId).toBe(connection.id);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5: Unique database aliases', () => {
    /**
     * **Property 5: Unique database aliases**
     * *For any* set of external database connections, the generated aliases
     * SHALL be unique, even if multiple connections have similar names.
     */

    it('should generate unique aliases for all connections', async () => {
      await fc.assert(
        fc.property(
          fc.array(connectionArb, { minLength: 1, maxLength: 10 }),
          (connections) => {
            const existingAliases = new Set<string>();
            const generatedAliases: string[] = [];

            connections.forEach((conn) => {
              const alias = generateDatabaseAlias(conn, existingAliases);
              generatedAliases.push(alias);
              existingAliases.add(alias);
            });

            // 验证所有别名都是唯一的
            expect(new Set(generatedAliases).size).toBe(generatedAliases.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate valid SQL identifiers', async () => {
      await fc.assert(
        fc.property(connectionArb, (connection) => {
          const alias = generateDatabaseAlias(connection);

          // 验证别名以字母开头
          expect(/^[a-z]/.test(alias)).toBe(true);

          // 验证别名只包含字母、数字、下划线
          expect(/^[a-z][a-z0-9_]*$/.test(alias)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should handle alias conflicts by adding numeric suffix', async () => {
      const connection: DatabaseConnection = {
        id: '1',
        name: 'test_db',
        type: 'mysql',
      };

      const existingAliases = new Set(['mysql_test_db']);
      const alias = generateDatabaseAlias(connection, existingAliases);

      expect(alias).toBe('mysql_test_db_1');
      expect(existingAliases.has(alias)).toBe(false);
    });
  });

  describe('Property 2: External table SQL prefix', () => {
    /**
     * **Property 2: External table SQL prefix**
     * *For any* external table in a query, the generated SQL SHALL include
     * the database alias prefix in the format `alias.schema.table` or `alias.table`.
     */

    it('should include alias prefix for external tables', async () => {
      await fc.assert(
        fc.property(validNameArb, validNameArb, (tableName, alias) => {
          const tableRef: TableReference = {
            name: tableName,
            alias,
            isExternal: true,
          };

          const sql = formatTableReference(tableRef, 'duckdb');

          // 验证 SQL 包含别名前缀
          expect(sql).toContain(`"${alias}"`);
          expect(sql).toContain(`"${tableName}"`);
          expect(sql).toBe(`"${alias}"."${tableName}"`);
        }),
        { numRuns: 100 }
      );
    });

    it('should include schema for external tables with schema', async () => {
      await fc.assert(
        fc.property(validNameArb, validNameArb, validNameArb, (tableName, schema, alias) => {
          const tableRef: TableReference = {
            name: tableName,
            schema,
            alias,
            isExternal: true,
          };

          const sql = formatTableReference(tableRef, 'duckdb');

          // 验证 SQL 包含 alias.schema.table 格式
          expect(sql).toBe(`"${alias}"."${schema}"."${tableName}"`);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3: DuckDB table SQL format', () => {
    /**
     * **Property 3: DuckDB table SQL format**
     * *For any* DuckDB local table in a mixed-source query, the generated SQL
     * SHALL use unqualified table names without any database prefix.
     */

    it('should not include alias prefix for DuckDB tables', async () => {
      await fc.assert(
        fc.property(validNameArb, (tableName) => {
          const tableRef: TableReference = {
            name: tableName,
            isExternal: false,
          };

          const sql = formatTableReference(tableRef, 'duckdb');

          // 验证 SQL 只包含表名，没有别名前缀
          expect(sql).toBe(`"${tableName}"`);
          // 验证没有点号（表示没有前缀）
          expect(sql.split('.').length).toBe(1);
        }),
        { numRuns: 100 }
      );
    });

    it('should include schema for DuckDB tables with schema', async () => {
      await fc.assert(
        fc.property(validNameArb, validNameArb, (tableName, schema) => {
          const tableRef: TableReference = {
            name: tableName,
            schema,
            isExternal: false,
          };

          const sql = formatTableReference(tableRef, 'duckdb');

          // 验证 SQL 包含 schema.table 格式（没有数据库别名）
          expect(sql).toBe(`"${schema}"."${tableName}"`);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('createTableReference', () => {
    it('should create correct reference for external tables', async () => {
      await fc.assert(
        fc.property(externalTableArb, (table) => {
          const attachDatabases = extractAttachDatabases([table]);
          const ref = createTableReference(table, attachDatabases);

          expect(ref.isExternal).toBe(true);
          expect(ref.name).toBe(table.name);
          expect(ref.schema).toBe(table.schema);

          if (table.connection) {
            expect(ref.connectionId).toBe(table.connection.id);
            expect(ref.alias).toBeDefined();
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should create correct reference for DuckDB tables', async () => {
      await fc.assert(
        fc.property(duckdbTableArb, (table) => {
          const ref = createTableReference(table, []);

          expect(ref.isExternal).toBe(false);
          expect(ref.name).toBe(table.name);
          expect(ref.alias).toBeUndefined();
          expect(ref.connectionId).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });
  });
});
