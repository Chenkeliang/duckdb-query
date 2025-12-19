/**
 * Federated Query Execution Tests
 * 
 * **Feature: sql-panel-federated-query**
 * **Property 5: Federated Query API Selection**
 * **Property 6: Standard Query API for DuckDB-Only**
 * **Property 12: Backward Compatibility**
 * **Validates: Requirements 1.4, 1.5, 10.2, 10.5, 14.1**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parseSQLTableReferences,
  buildAttachDatabasesFromParsedRefs,
  mergeAttachDatabases,
  extractAttachDatabases,
  type DatabaseConnection,
  type AttachDatabase,
} from '../../../utils/sqlUtils';
import type { SelectedTable } from '../../../types/SelectedTable';

// Mock connections for testing
const mockConnections: DatabaseConnection[] = [
  { id: 'conn-mysql', name: 'orders', type: 'mysql', host: 'localhost', port: 3306, database: 'orders_db' },
  { id: 'conn-pg', name: 'analytics', type: 'postgresql', host: 'localhost', port: 5432, database: 'analytics_db' },
  { id: 'conn-sqlite', name: 'backup', type: 'sqlite', database: '/path/to/backup.db' },
];

/**
 * Helper function to determine if a query requires federated execution
 * This mirrors the logic in SQLQueryPanel
 */
function determineQueryType(
  sql: string,
  selectedTables: SelectedTable[],
  connections: DatabaseConnection[]
): {
  queryType: 'duckdb' | 'external' | 'federated';
  attachDatabases: AttachDatabase[];
  requiresFederatedQuery: boolean;
} {
  // 1. Parse SQL for table references
  const parsedRefs = parseSQLTableReferences(sql);
  
  // 2. Build attachDatabases from SQL parsing
  const { attachDatabases: fromSQL, unrecognizedPrefixes } = buildAttachDatabasesFromParsedRefs(
    parsedRefs,
    connections
  );
  
  // 3. Extract attachDatabases from selected tables
  const fromSelectedTables = extractAttachDatabases(selectedTables);
  
  // 4. Merge all sources
  const { attachDatabases, requiresFederatedQuery } = mergeAttachDatabases(
    fromSelectedTables,
    fromSQL
  );
  
  // 5. Determine query type
  let queryType: 'duckdb' | 'external' | 'federated' = 'duckdb';
  
  if (requiresFederatedQuery && attachDatabases.length > 0) {
    queryType = 'federated';
  } else if (selectedTables.some(t => 
    typeof t !== 'string' && t.source === 'external'
  )) {
    queryType = 'external';
  }
  
  return {
    queryType,
    attachDatabases,
    requiresFederatedQuery,
  };
}

describe('Federated Query API Selection', () => {
  /**
   * **Property 5: Federated Query API Selection**
   * When SQL contains external table prefixes that match known connections,
   * the system should select the federated query API.
   * **Validates: Requirements 1.4, 10.2, 10.5**
   */
  describe('Property 5: Federated Query API Selection', () => {
    it('should select federated API when SQL contains external table prefix', () => {
      const sql = 'SELECT * FROM mysql_orders.users';
      const result = determineQueryType(sql, [], mockConnections);
      
      expect(result.queryType).toBe('federated');
      expect(result.requiresFederatedQuery).toBe(true);
      expect(result.attachDatabases.length).toBeGreaterThan(0);
    });

    it('should select federated API for JOIN with external tables', () => {
      const sql = `
        SELECT u.*, o.total
        FROM mysql_orders.users u
        JOIN local_orders o ON u.id = o.user_id
      `;
      const result = determineQueryType(sql, [], mockConnections);
      
      expect(result.queryType).toBe('federated');
      expect(result.requiresFederatedQuery).toBe(true);
    });

    it('should select federated API for multiple external databases', () => {
      const sql = `
        SELECT u.*, e.event_type
        FROM mysql_orders.users u
        JOIN postgresql_analytics.events e ON u.id = e.user_id
      `;
      const result = determineQueryType(sql, [], mockConnections);
      
      expect(result.queryType).toBe('federated');
      expect(result.attachDatabases.length).toBe(2);
    });

    it('should include correct connection IDs in attachDatabases', () => {
      const sql = 'SELECT * FROM mysql_orders.users';
      const result = determineQueryType(sql, [], mockConnections);
      
      expect(result.attachDatabases.some(db => db.connectionId === 'conn-mysql')).toBe(true);
    });

    // Property-based test
    it('should always select federated API when prefix matches a connection', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...mockConnections),
          fc.stringMatching(/^[a-z][a-z0-9_]{2,15}$/),
          (connection, tableName) => {
            // Generate SQL with the connection's alias
            const alias = `${connection.type}_${connection.name}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            const sql = `SELECT * FROM ${alias}.${tableName}`;
            
            const result = determineQueryType(sql, [], mockConnections);
            
            // Should detect as federated query
            expect(result.requiresFederatedQuery).toBe(true);
            expect(result.queryType).toBe('federated');
          }
        ),
        { numRuns: 30 }
      );
    });
  });

  /**
   * **Property 6: Standard Query API for DuckDB-Only**
   * When SQL contains only DuckDB tables (no external prefixes),
   * the system should select the standard query API.
   * **Validates: Requirements 1.5**
   */
  describe('Property 6: Standard Query API for DuckDB-Only', () => {
    it('should select standard API for DuckDB-only query', () => {
      const sql = 'SELECT * FROM users';
      const result = determineQueryType(sql, [], mockConnections);
      
      expect(result.queryType).toBe('duckdb');
      expect(result.requiresFederatedQuery).toBe(false);
      expect(result.attachDatabases).toHaveLength(0);
    });

    it('should select standard API for multiple DuckDB tables', () => {
      const sql = `
        SELECT u.*, o.total
        FROM users u
        JOIN orders o ON u.id = o.user_id
      `;
      const result = determineQueryType(sql, [], mockConnections);
      
      expect(result.queryType).toBe('duckdb');
      expect(result.requiresFederatedQuery).toBe(false);
    });

    it('should select standard API for DuckDB functions', () => {
      const sql = "SELECT * FROM read_csv('data.csv')";
      const result = determineQueryType(sql, [], mockConnections);
      
      expect(result.queryType).toBe('duckdb');
      expect(result.requiresFederatedQuery).toBe(false);
    });

    it('should select standard API for CTEs', () => {
      const sql = `
        WITH user_stats AS (
          SELECT user_id, COUNT(*) as cnt FROM orders GROUP BY user_id
        )
        SELECT * FROM user_stats
      `;
      const result = determineQueryType(sql, [], mockConnections);
      
      expect(result.queryType).toBe('duckdb');
      expect(result.requiresFederatedQuery).toBe(false);
    });

    // Property-based test
    it('should always select standard API for tables without prefix', () => {
      const validTableName = fc.stringMatching(/^[a-z][a-z0-9_]{2,15}$/)
        .filter(name => !mockConnections.some(c => 
          name.toLowerCase().includes(c.name.toLowerCase()) ||
          name.toLowerCase().includes(c.type.toLowerCase())
        ));
      
      fc.assert(
        fc.property(validTableName, (tableName) => {
          const sql = `SELECT * FROM ${tableName}`;
          const result = determineQueryType(sql, [], mockConnections);
          
          expect(result.queryType).toBe('duckdb');
          expect(result.requiresFederatedQuery).toBe(false);
        }),
        { numRuns: 30 }
      );
    });
  });

  /**
   * **Property 12: Backward Compatibility**
   * Existing DuckDB-only queries should continue to work without changes.
   * **Validates: Requirements 14.1**
   */
  describe('Property 12: Backward Compatibility', () => {
    it('should handle legacy simple SELECT queries', () => {
      const legacyQueries = [
        'SELECT * FROM users',
        'SELECT id, name FROM products WHERE price > 100',
        'SELECT COUNT(*) FROM orders',
        'SELECT * FROM users LIMIT 10',
        'SELECT * FROM users ORDER BY created_at DESC',
      ];
      
      legacyQueries.forEach(sql => {
        const result = determineQueryType(sql, [], mockConnections);
        expect(result.queryType).toBe('duckdb');
        expect(result.requiresFederatedQuery).toBe(false);
      });
    });

    it('should handle legacy JOIN queries', () => {
      const sql = `
        SELECT u.name, o.total
        FROM users u
        INNER JOIN orders o ON u.id = o.user_id
        WHERE o.status = 'completed'
      `;
      const result = determineQueryType(sql, [], mockConnections);
      
      expect(result.queryType).toBe('duckdb');
      expect(result.requiresFederatedQuery).toBe(false);
    });

    it('should handle legacy aggregate queries', () => {
      const sql = `
        SELECT 
          category,
          COUNT(*) as count,
          SUM(price) as total
        FROM products
        GROUP BY category
        HAVING COUNT(*) > 5
      `;
      const result = determineQueryType(sql, [], mockConnections);
      
      expect(result.queryType).toBe('duckdb');
      expect(result.requiresFederatedQuery).toBe(false);
    });

    it('should handle legacy subqueries', () => {
      const sql = `
        SELECT * FROM users
        WHERE id IN (
          SELECT user_id FROM orders WHERE total > 1000
        )
      `;
      const result = determineQueryType(sql, [], mockConnections);
      
      expect(result.queryType).toBe('duckdb');
      expect(result.requiresFederatedQuery).toBe(false);
    });

    it('should handle legacy UNION queries', () => {
      const sql = `
        SELECT id, name FROM users
        UNION ALL
        SELECT id, name FROM archived_users
      `;
      const result = determineQueryType(sql, [], mockConnections);
      
      expect(result.queryType).toBe('duckdb');
      expect(result.requiresFederatedQuery).toBe(false);
    });

    it('should handle legacy window functions', () => {
      const sql = `
        SELECT 
          id,
          name,
          ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) as rank
        FROM employees
      `;
      const result = determineQueryType(sql, [], mockConnections);
      
      expect(result.queryType).toBe('duckdb');
      expect(result.requiresFederatedQuery).toBe(false);
    });

    // Property-based test for backward compatibility
    it('should maintain backward compatibility for any DuckDB-only query pattern', () => {
      const tableNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{2,10}$/);
      const columnNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{1,10}$/);
      
      fc.assert(
        fc.property(
          tableNameArb,
          fc.array(columnNameArb, { minLength: 1, maxLength: 5 }),
          (tableName, columns) => {
            const columnList = columns.join(', ');
            const sql = `SELECT ${columnList} FROM ${tableName}`;
            
            const result = determineQueryType(sql, [], mockConnections);
            
            // All DuckDB-only queries should work as before
            expect(result.queryType).toBe('duckdb');
            expect(result.requiresFederatedQuery).toBe(false);
            expect(result.attachDatabases).toHaveLength(0);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});

describe('Selected Tables Integration', () => {
  it('should detect external source from selectedTables', () => {
    const selectedTables: SelectedTable[] = [
      {
        name: 'users',
        source: 'external',
        connection: {
          id: 'conn-mysql',
          name: 'orders',
          type: 'mysql',
        },
      },
    ];
    
    const sql = 'SELECT * FROM users';
    const result = determineQueryType(sql, selectedTables, mockConnections);
    
    // When selectedTables has external source, it should be detected
    expect(result.attachDatabases.length).toBeGreaterThan(0);
    expect(result.requiresFederatedQuery).toBe(true);
  });

  it('should merge SQL parsing and selectedTables', () => {
    const selectedTables: SelectedTable[] = [
      {
        name: 'users',
        source: 'external',
        connection: {
          id: 'conn-mysql',
          name: 'orders',
          type: 'mysql',
        },
      },
    ];
    
    // SQL references a different external database
    const sql = 'SELECT * FROM postgresql_analytics.events';
    const result = determineQueryType(sql, selectedTables, mockConnections);
    
    // Should have both connections
    expect(result.attachDatabases.length).toBe(2);
    expect(result.requiresFederatedQuery).toBe(true);
  });

  it('should prioritize selectedTables alias over SQL parsing', () => {
    const selectedTables: SelectedTable[] = [
      {
        name: 'users',
        source: 'external',
        connection: {
          id: 'conn-mysql',
          name: 'orders',
          type: 'mysql',
        },
      },
    ];
    
    // SQL also references the same connection
    const sql = 'SELECT * FROM mysql_orders.users';
    const result = determineQueryType(sql, selectedTables, mockConnections);
    
    // Should deduplicate - only one entry for conn-mysql
    const mysqlDbs = result.attachDatabases.filter(db => db.connectionId === 'conn-mysql');
    expect(mysqlDbs).toHaveLength(1);
  });
});
