/**
 * 表选中状态属性测试
 * 
 * **Feature: external-table-integration-fixes, Property 5: External Table Selection State Correctness**
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  isTableSelected, 
  isSameTable, 
  normalizeSelectedTable,
  type SelectedTable,
  type SelectedTableObject,
  type DatabaseType,
} from '@/new/utils/tableUtils';

// Arbitraries
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

describe('Selection State - Property Tests', () => {
  describe('isSameTable', () => {
    /**
     * Property: isSameTable should be reflexive
     */
    it('should be reflexive (a === a)', () => {
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
     * Property: isSameTable should be symmetric
     */
    it('should be symmetric (a === b implies b === a)', () => {
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

    /**
     * Property: Same name but different schema should not be equal
     */
    it('should distinguish tables with same name but different schemas', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          externalConnectionArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (name, connection, schema1, schema2) => {
            // Only test when schemas are actually different
            if (schema1 === schema2) return true;
            
            const table1: SelectedTableObject = {
              name,
              source: 'external',
              connection,
              schema: schema1,
            };
            const table2: SelectedTableObject = {
              name,
              source: 'external',
              connection,
              schema: schema2,
            };
            return !isSameTable(table1, table2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('isTableSelected', () => {
    /**
     * Property 5: External Table Selection State Correctness
     * For any external table, the isSelected state should be determined by matching
     * connection.id + schema + table.name
     */
    it('should correctly identify selected external tables', () => {
      fc.assert(
        fc.property(
          externalTableArb,
          (table) => {
            const selectedTables: SelectedTable[] = [table];
            
            const isSelected = isTableSelected(
              table.name,
              selectedTables,
              table.connection?.id,
              table.schema
            );
            
            return isSelected;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Non-selected tables should return false
     */
    it('should correctly identify non-selected tables', () => {
      fc.assert(
        fc.property(
          externalTableArb,
          externalTableArb,
          (table, differentTable) => {
            // Only test when tables are actually different
            if (isSameTable(table, differentTable)) return true;
            
            const selectedTables: SelectedTable[] = [differentTable];
            
            const isSelected = isTableSelected(
              table.name,
              selectedTables,
              table.connection?.id,
              table.schema
            );
            
            return !isSelected;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: String-based selection should work for backward compatibility
     */
    it('should support string-based selection for DuckDB tables', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (tableName) => {
            const selectedTables: SelectedTable[] = [tableName];
            
            const isSelected = isTableSelected(tableName, selectedTables);
            
            return isSelected;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Full identifier string should match external tables
     */
    it('should support full identifier string matching', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (tableName, connectionId, schema) => {
            const fullIdentifier = `${connectionId}.${schema}.${tableName}`;
            const selectedTables: SelectedTable[] = [fullIdentifier];
            
            const isSelected = isTableSelected(
              tableName,
              selectedTables,
              connectionId,
              schema
            );
            
            return isSelected;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Empty selection list should always return false
     */
    it('should return false for empty selection list', () => {
      fc.assert(
        fc.property(
          selectedTableArb,
          (table) => {
            const selectedTables: SelectedTable[] = [];
            
            const isSelected = isTableSelected(
              table.name,
              selectedTables,
              table.source === 'external' ? table.connection?.id : undefined,
              table.schema
            );
            
            return !isSelected;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Multiple table selection', () => {
    /**
     * Property: All selected tables should be identified as selected
     */
    it('should correctly identify all selected tables in a list', () => {
      fc.assert(
        fc.property(
          fc.array(selectedTableArb, { minLength: 1, maxLength: 10 }),
          (tables) => {
            // All tables should be selected
            return tables.every(table => {
              const normalized = normalizeSelectedTable(table);
              return isTableSelected(
                normalized.name,
                tables,
                normalized.source === 'external' ? normalized.connection?.id : undefined,
                normalized.schema
              );
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
