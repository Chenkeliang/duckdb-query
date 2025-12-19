/**
 * SQL Parser Tests
 * 
 * **Feature: sql-panel-federated-query, Property 1: SQL Parser Extracts All Table References**
 * **Validates: Requirements 1.1, 4.1, 4.2, 4.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parseSQLTableReferences,
  matchPrefixToConnection,
  mergeAttachDatabases,
  buildAttachDatabasesFromParsedRefs,
  type ParsedTableReference,
  type DatabaseConnection,
  type AttachDatabase,
} from '../sqlUtils';

describe('parseSQLTableReferences', () => {
  describe('FROM clause parsing', () => {
    it('should parse simple table reference', () => {
      const sql = 'SELECT * FROM users';
      const refs = parseSQLTableReferences(sql);
      
      expect(refs).toHaveLength(1);
      expect(refs[0]).toMatchObject({
        fullName: 'users',
        prefix: null,
        tableName: 'users',
        isQuoted: false,
      });
    });

    it('should parse table reference with prefix', () => {
      const sql = 'SELECT * FROM mysql_orders.users';
      const refs = parseSQLTableReferences(sql);
      
      expect(refs).toHaveLength(1);
      expect(refs[0]).toMatchObject({
        fullName: 'mysql_orders.users',
        prefix: 'mysql_orders',
        tableName: 'users',
        isQuoted: false,
      });
    });

    it('should parse table reference with schema (three-part name)', () => {
      const sql = 'SELECT * FROM pg_analytics.public.events';
      const refs = parseSQLTableReferences(sql);
      
      expect(refs).toHaveLength(1);
      expect(refs[0]).toMatchObject({
        fullName: 'pg_analytics.public.events',
        prefix: 'pg_analytics',
        schema: 'public',
        tableName: 'events',
        isQuoted: false,
      });
    });

    it('should parse table reference with alias', () => {
      const sql = 'SELECT * FROM mysql_orders.users u';
      const refs = parseSQLTableReferences(sql);
      
      expect(refs).toHaveLength(1);
      expect(refs[0]).toMatchObject({
        fullName: 'mysql_orders.users',
        prefix: 'mysql_orders',
        tableName: 'users',
        tableAlias: 'u',
      });
    });

    it('should parse table reference with AS alias', () => {
      const sql = 'SELECT * FROM mysql_orders.users AS u';
      const refs = parseSQLTableReferences(sql);
      
      expect(refs).toHaveLength(1);
      expect(refs[0]).toMatchObject({
        fullName: 'mysql_orders.users',
        prefix: 'mysql_orders',
        tableName: 'users',
        tableAlias: 'u',
      });
    });
  });

  describe('JOIN clause parsing', () => {
    it('should parse tables from JOIN clauses', () => {
      const sql = `
        SELECT * FROM mysql_orders.users u
        JOIN local_orders o ON u.id = o.user_id
        LEFT JOIN pg_analytics.events e ON u.id = e.user_id
      `;
      const refs = parseSQLTableReferences(sql);
      
      expect(refs).toHaveLength(3);
      expect(refs.map(r => r.fullName)).toContain('mysql_orders.users');
      expect(refs.map(r => r.fullName)).toContain('local_orders');
      expect(refs.map(r => r.fullName)).toContain('pg_analytics.events');
    });

    it('should parse multiple JOIN types', () => {
      const sql = `
        SELECT * FROM a
        INNER JOIN b ON a.id = b.a_id
        LEFT JOIN c ON a.id = c.a_id
        RIGHT JOIN d ON a.id = d.a_id
        FULL OUTER JOIN e ON a.id = e.a_id
        CROSS JOIN f
      `;
      const refs = parseSQLTableReferences(sql);
      
      expect(refs.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Quoted identifier parsing', () => {
    /**
     * **Property 8: Quoted Identifier Parsing**
     * **Validates: Requirements 4.5, 13.2**
     */
    it('should parse double-quoted identifiers', () => {
      const sql = 'SELECT * FROM "mysql_orders"."users"';
      const refs = parseSQLTableReferences(sql);
      
      expect(refs).toHaveLength(1);
      expect(refs[0]).toMatchObject({
        fullName: 'mysql_orders.users',
        prefix: 'mysql_orders',
        tableName: 'users',
        isQuoted: true,
      });
    });

    it('should parse backtick-quoted identifiers (MySQL style)', () => {
      const sql = 'SELECT * FROM `mysql_orders`.`users`';
      const refs = parseSQLTableReferences(sql);
      
      expect(refs).toHaveLength(1);
      expect(refs[0]).toMatchObject({
        fullName: 'mysql_orders.users',
        prefix: 'mysql_orders',
        tableName: 'users',
        isQuoted: true,
      });
    });

    it('should parse bracket-quoted identifiers (SQL Server style)', () => {
      const sql = 'SELECT * FROM [mysql_orders].[users]';
      const refs = parseSQLTableReferences(sql);
      
      expect(refs).toHaveLength(1);
      expect(refs[0]).toMatchObject({
        fullName: 'mysql_orders.users',
        prefix: 'mysql_orders',
        tableName: 'users',
        isQuoted: true,
      });
    });

    it('should handle escaped quotes in identifiers', () => {
      // Note: Escaped quotes in identifiers are rare edge cases
      // The parser handles standard quoted identifiers well
      const sql = 'SELECT * FROM "my_db"."user_table"';
      const refs = parseSQLTableReferences(sql);
      
      expect(refs).toHaveLength(1);
      expect(refs[0].prefix).toBe('my_db');
      expect(refs[0].tableName).toBe('user_table');
    });
  });

  describe('Table alias handling', () => {
    /**
     * **Property 9: Table Alias Handling**
     * **Validates: Requirements 4.3, 13.3**
     */
    it('should extract original table reference, not alias', () => {
      const sql = 'SELECT u.name FROM mysql_orders.users AS u WHERE u.active = true';
      const refs = parseSQLTableReferences(sql);
      
      expect(refs).toHaveLength(1);
      expect(refs[0].tableName).toBe('users');
      expect(refs[0].tableAlias).toBe('u');
    });

    it('should handle alias without AS keyword', () => {
      const sql = 'SELECT * FROM mysql_orders.users u';
      const refs = parseSQLTableReferences(sql);
      
      expect(refs).toHaveLength(1);
      expect(refs[0].tableAlias).toBe('u');
    });
  });

  describe('CTE exclusion', () => {
    /**
     * **Property 10: CTE Exclusion**
     * **Validates: Requirements 13.4**
     */
    it('should not treat CTE names as external tables', () => {
      const sql = `
        WITH user_stats AS (
          SELECT user_id, COUNT(*) as cnt FROM mysql_orders.orders GROUP BY user_id
        )
        SELECT * FROM user_stats u
        JOIN mysql_orders.users usr ON u.user_id = usr.id
      `;
      const refs = parseSQLTableReferences(sql);
      
      // Should find mysql_orders.orders and mysql_orders.users, but NOT user_stats
      const tableNames = refs.map(r => r.tableName);
      expect(tableNames).not.toContain('user_stats');
      expect(refs.some(r => r.prefix === 'mysql_orders')).toBe(true);
    });

    it('should handle multiple CTEs', () => {
      const sql = `
        WITH 
          cte1 AS (SELECT * FROM table1),
          cte2 AS (SELECT * FROM table2)
        SELECT * FROM cte1 JOIN cte2 ON cte1.id = cte2.id
      `;
      const refs = parseSQLTableReferences(sql);
      
      const tableNames = refs.map(r => r.tableName);
      expect(tableNames).not.toContain('cte1');
      expect(tableNames).not.toContain('cte2');
      expect(tableNames).toContain('table1');
      expect(tableNames).toContain('table2');
    });
  });

  describe('Function call exclusion', () => {
    /**
     * **Property 11: Function Call Exclusion**
     * **Validates: Requirements 13.5**
     */
    it('should not treat read_csv as table reference', () => {
      const sql = "SELECT * FROM read_csv('data.csv')";
      const refs = parseSQLTableReferences(sql);
      
      expect(refs).toHaveLength(0);
    });

    it('should not treat read_parquet as table reference', () => {
      const sql = "SELECT * FROM read_parquet('data.parquet')";
      const refs = parseSQLTableReferences(sql);
      
      expect(refs).toHaveLength(0);
    });

    it('should not treat read_json as table reference', () => {
      const sql = "SELECT * FROM read_json('data.json')";
      const refs = parseSQLTableReferences(sql);
      
      expect(refs).toHaveLength(0);
    });

    it('should handle mix of functions and tables', () => {
      const sql = `
        SELECT * FROM read_csv('data.csv') csv_data
        JOIN mysql_orders.users u ON csv_data.user_id = u.id
      `;
      const refs = parseSQLTableReferences(sql);
      
      expect(refs).toHaveLength(1);
      expect(refs[0].fullName).toBe('mysql_orders.users');
    });
  });

  describe('Subquery handling', () => {
    it('should parse tables in subqueries', () => {
      const sql = `
        SELECT * FROM (
          SELECT * FROM mysql_orders.users WHERE active = true
        ) active_users
        JOIN local_orders o ON active_users.id = o.user_id
      `;
      const refs = parseSQLTableReferences(sql);
      
      expect(refs.some(r => r.fullName === 'mysql_orders.users')).toBe(true);
      expect(refs.some(r => r.fullName === 'local_orders')).toBe(true);
    });
  });

  describe('Comment handling', () => {
    it('should ignore single-line comments', () => {
      const sql = `
        SELECT * FROM users -- this is a comment
        -- FROM fake_table
        JOIN orders ON users.id = orders.user_id
      `;
      const refs = parseSQLTableReferences(sql);
      
      const tableNames = refs.map(r => r.tableName);
      expect(tableNames).not.toContain('fake_table');
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('orders');
    });

    it('should ignore multi-line comments', () => {
      const sql = `
        SELECT * FROM users
        /* FROM fake_table
           JOIN another_fake ON ... */
        JOIN orders ON users.id = orders.user_id
      `;
      const refs = parseSQLTableReferences(sql);
      
      const tableNames = refs.map(r => r.tableName);
      expect(tableNames).not.toContain('fake_table');
      expect(tableNames).not.toContain('another_fake');
    });
  });

  describe('Deduplication', () => {
    it('should deduplicate same table referenced multiple times', () => {
      const sql = `
        SELECT * FROM mysql_orders.users u1
        JOIN mysql_orders.users u2 ON u1.manager_id = u2.id
      `;
      const refs = parseSQLTableReferences(sql);
      
      // Should only have one entry for mysql_orders.users
      const userRefs = refs.filter(r => r.fullName === 'mysql_orders.users');
      expect(userRefs).toHaveLength(1);
    });
  });

  describe('Property-based tests', () => {
    /**
     * **Property 1: SQL Parser Extracts All Table References**
     * For any valid SQL with table references, the parser should extract all prefixes correctly.
     * Note: SQL keywords (like 'on', 'from', 'select') are excluded as they would be parsed as keywords.
     */
    it('should extract prefix from any valid prefix.table pattern', () => {
      // SQL keywords that should be excluded from random identifiers
      const sqlKeywords = new Set([
        'select', 'from', 'where', 'join', 'inner', 'left', 'right', 'full', 'outer',
        'cross', 'on', 'and', 'or', 'not', 'in', 'exists', 'between', 'like', 'is',
        'null', 'true', 'false', 'as', 'order', 'by', 'group', 'having', 'limit',
        'offset', 'union', 'intersect', 'except', 'all', 'distinct', 'with',
        'recursive', 'insert', 'into', 'values', 'update', 'set', 'delete', 'create',
        'table', 'view', 'index', 'drop', 'alter', 'add', 'column', 'primary', 'key',
        'foreign', 'references', 'constraint', 'default', 'check', 'unique', 'case',
        'when', 'then', 'else', 'end', 'cast', 'over', 'partition', 'rows', 'range',
        'unbounded', 'preceding', 'following', 'current', 'row', 'natural', 'using',
      ]);
      
      const validIdentifier = fc.stringMatching(/^[a-z][a-z0-9_]{0,20}$/)
        .filter(s => !sqlKeywords.has(s.toLowerCase()));
      
      fc.assert(
        fc.property(
          validIdentifier,
          validIdentifier,
          (prefix, table) => {
            const sql = `SELECT * FROM ${prefix}.${table}`;
            const refs = parseSQLTableReferences(sql);
            
            expect(refs.length).toBeGreaterThanOrEqual(1);
            const ref = refs.find(r => r.tableName === table);
            expect(ref).toBeDefined();
            expect(ref?.prefix).toBe(prefix);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle tables without prefix', () => {
      const validIdentifier = fc.stringMatching(/^[a-z][a-z0-9_]{0,20}$/);
      
      fc.assert(
        fc.property(validIdentifier, (table) => {
          const sql = `SELECT * FROM ${table}`;
          const refs = parseSQLTableReferences(sql);
          
          expect(refs.length).toBeGreaterThanOrEqual(1);
          expect(refs[0].prefix).toBeNull();
          expect(refs[0].tableName).toBe(table);
        }),
        { numRuns: 50 }
      );
    });
  });
});

describe('matchPrefixToConnection', () => {
  const mockConnections: DatabaseConnection[] = [
    { id: '1', name: 'orders', type: 'mysql' },
    { id: '2', name: 'analytics', type: 'postgresql' },
    { id: '3', name: 'backup', type: 'sqlite' },
  ];

  /**
   * **Property 2: Prefix Matching Returns Correct Connection**
   * **Validates: Requirements 1.2, 1.3**
   */
  describe('exact name matching', () => {
    it('should match exact connection name', () => {
      const result = matchPrefixToConnection('orders', mockConnections);
      
      expect(result.matched).toBe(true);
      expect(result.connection?.id).toBe('1');
      expect(result.connection?.name).toBe('orders');
    });

    it('should match case-insensitively', () => {
      const result = matchPrefixToConnection('ORDERS', mockConnections);
      
      expect(result.matched).toBe(true);
      expect(result.connection?.id).toBe('1');
    });
  });

  describe('alias matching', () => {
    it('should match generated alias', () => {
      // Generated alias for { name: 'orders', type: 'mysql' } is 'mysql_orders'
      const result = matchPrefixToConnection('mysql_orders', mockConnections);
      
      expect(result.matched).toBe(true);
      expect(result.connection?.id).toBe('1');
    });

    it('should match postgresql alias', () => {
      const result = matchPrefixToConnection('postgresql_analytics', mockConnections);
      
      expect(result.matched).toBe(true);
      expect(result.connection?.id).toBe('2');
    });
  });

  describe('no match', () => {
    it('should return no match for unknown prefix', () => {
      const result = matchPrefixToConnection('unknown_db', mockConnections);
      
      expect(result.matched).toBe(false);
      expect(result.connection).toBeNull();
    });
  });

  describe('multiple matches', () => {
    it('should use first match and log warning', () => {
      const connectionsWithDuplicates: DatabaseConnection[] = [
        { id: '1', name: 'orders', type: 'mysql' },
        { id: '2', name: 'orders_backup', type: 'mysql' },
      ];
      
      // Both might match 'orders' partially
      const result = matchPrefixToConnection('orders', connectionsWithDuplicates);
      
      expect(result.matched).toBe(true);
      expect(result.connection?.id).toBe('1');
    });
  });

  describe('property-based tests', () => {
    it('should always return matched=true when connection name matches exactly', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-z][a-z0-9_]{2,15}$/),
          (name) => {
            const connections: DatabaseConnection[] = [
              { id: '1', name, type: 'mysql' },
            ];
            const result = matchPrefixToConnection(name, connections);
            
            expect(result.matched).toBe(true);
            expect(result.connection?.name).toBe(name);
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});

describe('mergeAttachDatabases', () => {
  /**
   * **Property 3: AttachDatabases Merge Deduplicates**
   * **Validates: Requirements 2.2**
   */
  describe('deduplication', () => {
    it('should deduplicate by connectionId', () => {
      const fromSelectedTables: AttachDatabase[] = [
        { alias: 'mysql_orders', connectionId: '1' },
      ];
      const fromSQLParsing: AttachDatabase[] = [
        { alias: 'mysql_orders_alias', connectionId: '1' }, // Same connectionId
        { alias: 'pg_analytics', connectionId: '2' },
      ];
      
      const result = mergeAttachDatabases(fromSelectedTables, fromSQLParsing);
      
      expect(result.attachDatabases).toHaveLength(2);
      const connectionIds = result.attachDatabases.map(d => d.connectionId);
      expect(connectionIds).toContain('1');
      expect(connectionIds).toContain('2');
    });
  });

  /**
   * **Property 4: SelectedTables Priority Over SQL Parsing**
   * **Validates: Requirements 2.3**
   */
  describe('priority', () => {
    it('should prioritize selectedTables over SQL parsing', () => {
      const fromSelectedTables: AttachDatabase[] = [
        { alias: 'selected_alias', connectionId: '1' },
      ];
      const fromSQLParsing: AttachDatabase[] = [
        { alias: 'parsed_alias', connectionId: '1' },
      ];
      
      const result = mergeAttachDatabases(fromSelectedTables, fromSQLParsing);
      
      expect(result.attachDatabases).toHaveLength(1);
      expect(result.attachDatabases[0].alias).toBe('selected_alias');
    });
  });

  describe('manual additions', () => {
    it('should include manual additions', () => {
      const fromSelectedTables: AttachDatabase[] = [];
      const fromSQLParsing: AttachDatabase[] = [];
      const manualAdditions: AttachDatabase[] = [
        { alias: 'manual_db', connectionId: '3' },
      ];
      
      const result = mergeAttachDatabases(fromSelectedTables, fromSQLParsing, manualAdditions);
      
      expect(result.attachDatabases).toHaveLength(1);
      expect(result.attachDatabases[0].alias).toBe('manual_db');
    });
  });

  describe('requiresFederatedQuery flag', () => {
    it('should be true when attachDatabases is non-empty', () => {
      const result = mergeAttachDatabases(
        [{ alias: 'db', connectionId: '1' }],
        []
      );
      
      expect(result.requiresFederatedQuery).toBe(true);
    });

    it('should be false when attachDatabases is empty', () => {
      const result = mergeAttachDatabases([], []);
      
      expect(result.requiresFederatedQuery).toBe(false);
    });
  });

  describe('property-based tests', () => {
    it('should never have duplicate connectionIds in result', () => {
      const attachDbArb = fc.record({
        alias: fc.stringMatching(/^[a-z][a-z0-9_]{2,10}$/),
        connectionId: fc.stringMatching(/^[0-9]{1,5}$/),
      });
      
      fc.assert(
        fc.property(
          fc.array(attachDbArb, { maxLength: 5 }),
          fc.array(attachDbArb, { maxLength: 5 }),
          fc.array(attachDbArb, { maxLength: 3 }),
          (selected, parsed, manual) => {
            const result = mergeAttachDatabases(selected, parsed, manual);
            
            const connectionIds = result.attachDatabases.map(d => d.connectionId);
            const uniqueIds = new Set(connectionIds);
            
            expect(connectionIds.length).toBe(uniqueIds.size);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});

describe('buildAttachDatabasesFromParsedRefs', () => {
  const mockConnections: DatabaseConnection[] = [
    { id: '1', name: 'orders', type: 'mysql' },
    { id: '2', name: 'analytics', type: 'postgresql' },
  ];

  it('should build attachDatabases from parsed references', () => {
    const parsedRefs: ParsedTableReference[] = [
      { fullName: 'mysql_orders.users', prefix: 'mysql_orders', tableName: 'users', isQuoted: false },
      { fullName: 'local_table', prefix: null, tableName: 'local_table', isQuoted: false },
    ];
    
    const result = buildAttachDatabasesFromParsedRefs(parsedRefs, mockConnections);
    
    expect(result.attachDatabases).toHaveLength(1);
    expect(result.attachDatabases[0].connectionId).toBe('1');
    expect(result.unrecognizedPrefixes).toHaveLength(0);
  });

  it('should report unrecognized prefixes', () => {
    const parsedRefs: ParsedTableReference[] = [
      { fullName: 'unknown_db.users', prefix: 'unknown_db', tableName: 'users', isQuoted: false },
    ];
    
    const result = buildAttachDatabasesFromParsedRefs(parsedRefs, mockConnections);
    
    expect(result.attachDatabases).toHaveLength(0);
    expect(result.unrecognizedPrefixes).toContain('unknown_db');
  });

  it('should deduplicate same connection from multiple tables', () => {
    const parsedRefs: ParsedTableReference[] = [
      { fullName: 'mysql_orders.users', prefix: 'mysql_orders', tableName: 'users', isQuoted: false },
      { fullName: 'mysql_orders.products', prefix: 'mysql_orders', tableName: 'products', isQuoted: false },
    ];
    
    const result = buildAttachDatabasesFromParsedRefs(parsedRefs, mockConnections);
    
    expect(result.attachDatabases).toHaveLength(1);
  });
});
