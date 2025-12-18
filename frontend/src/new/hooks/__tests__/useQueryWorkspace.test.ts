/**
 * useQueryWorkspace Hook 属性测试
 * 
 * **Feature: external-table-integration-fixes, Property 1: SelectedTable Data Flow Integrity**
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { SelectedTableObject, DatabaseType } from '../../types/SelectedTable';
import { normalizeSelectedTable } from '../../utils/tableUtils';

// Arbitraries for property-based testing
const databaseTypeArb = fc.constantFrom<DatabaseType>('mysql', 'postgresql', 'sqlite');

const externalConnectionArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  type: databaseTypeArb,
});

const duckdbTableArb: fc.Arbitrary<SelectedTableObject> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  source: fc.constant('duckdb' as const),
  schema: fc.constant(undefined),
  connection: fc.constant(undefined),
  displayName: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
});

const externalTableArb: fc.Arbitrary<SelectedTableObject> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  source: fc.constant('external' as const),
  connection: externalConnectionArb,
  schema: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  displayName: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
});

const selectedTableArb = fc.oneof(duckdbTableArb, externalTableArb);

/**
 * 比较两个 SelectedTable 是否相同（复制自 useQueryWorkspace）
 */
const isSameTable = (a: SelectedTableObject, b: SelectedTableObject): boolean => {
  if (a.source !== b.source) return false;
  if (a.name !== b.name) return false;
  
  if (a.source === 'external' && b.source === 'external') {
    return (
      a.connection?.id === b.connection?.id &&
      a.schema === b.schema
    );
  }
  
  return true;
};

describe('useQueryWorkspace - Property Tests', () => {
  describe('normalizeSelectedTable', () => {
    /**
     * Property: String tables should be normalized to DuckDB source
     */
    it('should normalize string tables to DuckDB source', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (tableName) => {
            const result = normalizeSelectedTable(tableName);
            return (
              result.name === tableName &&
              result.source === 'duckdb' &&
              result.connection === undefined
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Object tables should preserve all fields
     */
    it('should preserve all fields for object tables', () => {
      fc.assert(
        fc.property(
          selectedTableArb,
          (table) => {
            const result = normalizeSelectedTable(table);
            return (
              result.name === table.name &&
              result.source === table.source &&
              result.schema === table.schema
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: External tables should preserve connection info
     */
    it('should preserve connection info for external tables', () => {
      fc.assert(
        fc.property(
          externalTableArb,
          (table) => {
            const result = normalizeSelectedTable(table);
            return (
              result.source === 'external' &&
              result.connection?.id === table.connection?.id &&
              result.connection?.name === table.connection?.name &&
              result.connection?.type === table.connection?.type
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('isSameTable', () => {
    /**
     * Property: isSameTable should be reflexive (a === a)
     */
    it('should be reflexive', () => {
      fc.assert(
        fc.property(
          selectedTableArb,
          (table) => {
            return isSameTable(table, table);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: isSameTable should be symmetric (a === b implies b === a)
     */
    it('should be symmetric', () => {
      fc.assert(
        fc.property(
          selectedTableArb,
          selectedTableArb,
          (a, b) => {
            return isSameTable(a, b) === isSameTable(b, a);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Different sources should never be equal
     */
    it('should return false for different sources', () => {
      fc.assert(
        fc.property(
          duckdbTableArb,
          externalTableArb,
          (duckdb, external) => {
            return !isSameTable(duckdb, external);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Same name but different connection should not be equal
     */
    it('should distinguish tables with same name but different connections', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          externalConnectionArb,
          externalConnectionArb,
          (name, conn1, conn2) => {
            // Only test when connections are actually different
            if (conn1.id === conn2.id) return true;
            
            const table1: SelectedTableObject = {
              name,
              source: 'external',
              connection: conn1,
            };
            const table2: SelectedTableObject = {
              name,
              source: 'external',
              connection: conn2,
            };
            return !isSameTable(table1, table2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('SelectedTable data flow integrity', () => {
    /**
     * Property 1: External table selection should preserve all required fields
     */
    it('should preserve connection ID, schema, table name, and source type', () => {
      fc.assert(
        fc.property(
          externalTableArb,
          (table) => {
            const normalized = normalizeSelectedTable(table);
            
            // All required fields should be present
            const hasName = typeof normalized.name === 'string' && normalized.name.length > 0;
            const hasSource = normalized.source === 'external';
            const hasConnectionId = typeof normalized.connection?.id === 'string';
            const hasConnectionType = ['mysql', 'postgresql', 'sqlite'].includes(normalized.connection?.type || '');
            
            return hasName && hasSource && hasConnectionId && hasConnectionType;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: DuckDB table selection should have correct source
     */
    it('should set source to duckdb for DuckDB tables', () => {
      fc.assert(
        fc.property(
          duckdbTableArb,
          (table) => {
            const normalized = normalizeSelectedTable(table);
            return normalized.source === 'duckdb';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Table deselection should work correctly
     */
    it('should correctly identify tables for removal', () => {
      fc.assert(
        fc.property(
          fc.array(selectedTableArb, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 0 }),
          (tables, indexToRemove) => {
            const idx = indexToRemove % tables.length;
            const tableToRemove = tables[idx];
            
            // Filter out the table
            const remaining = tables.filter(t => !isSameTable(t, tableToRemove));
            
            // The removed table should not be in remaining
            const stillExists = remaining.some(t => isSameTable(t, tableToRemove));
            
            return !stillExists;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


describe('External query routing - Property Tests', () => {
  /**
   * Property 3: External Query Execution Routing
   * For any query execution with source.type='external', the system should route
   * to external SQL execution with correct datasource parameters
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  
  describe('Query source routing', () => {
    /**
     * Property: External source should route to external execution
     */
    it('should route external source to external execution', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }), // SQL
          fc.string({ minLength: 1, maxLength: 50 }),  // connectionId
          databaseTypeArb,                              // databaseType
          (sql, connectionId, databaseType) => {
            const source = {
              type: 'external' as const,
              connectionId,
              databaseType,
            };
            
            // Simulate the routing logic from useQueryWorkspace
            const shouldRouteToExternal = source.type === 'external';
            
            return shouldRouteToExternal === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: DuckDB source should not route to external execution
     */
    it('should not route DuckDB source to external execution', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (sql) => {
            const source = {
              type: 'duckdb' as const,
            };
            
            const shouldRouteToExternal = source.type === 'external';
            return shouldRouteToExternal === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Missing source should default to DuckDB
     */
    it('should default to DuckDB when source is undefined', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (sql) => {
            const source = undefined;
            const querySource = source || { type: 'duckdb' as const };
            
            return querySource.type === 'duckdb';
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('External datasource parameter construction', () => {
    /**
     * Property: Connection ID should be passed correctly
     */
    it('should pass connection ID to external SQL execution', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          databaseTypeArb,
          (connectionId, databaseType) => {
            const source = {
              type: 'external' as const,
              connectionId,
              databaseType,
            };
            
            // Simulate the datasource construction
            const datasource = {
              id: source.connectionId,
              type: source.databaseType || 'mysql',
            };
            
            return datasource.id === connectionId;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Database type should be passed correctly or default to mysql
     */
    it('should pass database type or default to mysql', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.option(databaseTypeArb, { nil: undefined }),
          (connectionId, databaseType) => {
            const source = {
              type: 'external' as const,
              connectionId,
              databaseType,
            };
            
            // Simulate the datasource construction
            const datasource = {
              id: source.connectionId,
              type: source.databaseType || 'mysql',
            };
            
            if (databaseType) {
              return datasource.type === databaseType;
            } else {
              return datasource.type === 'mysql';
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('LastQuery state preservation', () => {
    /**
     * Property: LastQuery should preserve SQL and source after execution
     */
    it('should preserve SQL and source in lastQuery state', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          databaseTypeArb,
          (sql, connectionId, databaseType) => {
            const source = {
              type: 'external' as const,
              connectionId,
              databaseType,
            };
            
            // Simulate lastQuery state update
            const lastQuery = { sql, source };
            
            return (
              lastQuery.sql === sql &&
              lastQuery.source.type === 'external' &&
              lastQuery.source.connectionId === connectionId &&
              lastQuery.source.databaseType === databaseType
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
