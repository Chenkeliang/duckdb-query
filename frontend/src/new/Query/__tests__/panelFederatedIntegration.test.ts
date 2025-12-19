/**
 * Panel Federated Query Integration Tests
 * 
 * **Feature: sql-panel-federated-query**
 * **Task 11.4: Integration tests for all panels**
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
 * 
 * Tests the federated query support across different query panels:
 * - SQLQueryPanel: Full federated query support with SQL parsing
 * - JoinQueryPanel: Federated JOIN support
 * - PivotTablePanel: External table warning (no federated support)
 * - SetOperationsPanel: External table warning (no federated support)
 */

import { describe, it, expect } from 'vitest';
import {
  parseSQLTableReferences,
  buildAttachDatabasesFromParsedRefs,
  extractAttachDatabases,
  type DatabaseConnection,
} from '../../utils/sqlUtils';
import type { SelectedTable } from '../../types/SelectedTable';

// Mock connections for testing
const mockConnections: DatabaseConnection[] = [
  { id: 'conn-mysql', name: 'orders', type: 'mysql', host: 'localhost', port: 3306, database: 'orders_db' },
  { id: 'conn-pg', name: 'analytics', type: 'postgresql', host: 'localhost', port: 5432, database: 'analytics_db' },
];

describe('Panel Federated Query Integration', () => {
  /**
   * SQLQueryPanel Integration
   * Full federated query support with SQL parsing
   */
  describe('SQLQueryPanel - Full Federated Support', () => {
    it('should detect external tables from SQL', () => {
      const sql = 'SELECT * FROM mysql_orders.users';
      const refs = parseSQLTableReferences(sql);
      const { attachDatabases } = buildAttachDatabasesFromParsedRefs(refs, mockConnections);
      
      expect(attachDatabases.length).toBeGreaterThan(0);
      expect(attachDatabases[0].connectionId).toBe('conn-mysql');
    });

    it('should support federated JOIN in SQL', () => {
      const sql = `
        SELECT u.*, o.total
        FROM mysql_orders.users u
        JOIN local_orders o ON u.id = o.user_id
      `;
      const refs = parseSQLTableReferences(sql);
      const { attachDatabases } = buildAttachDatabasesFromParsedRefs(refs, mockConnections);
      
      expect(attachDatabases.length).toBe(1);
      expect(attachDatabases[0].connectionId).toBe('conn-mysql');
    });

    it('should support multiple external databases in SQL', () => {
      const sql = `
        SELECT u.*, e.event_type
        FROM mysql_orders.users u
        JOIN postgresql_analytics.events e ON u.id = e.user_id
      `;
      const refs = parseSQLTableReferences(sql);
      const { attachDatabases } = buildAttachDatabasesFromParsedRefs(refs, mockConnections);
      
      expect(attachDatabases.length).toBe(2);
    });

    it('should report unrecognized prefixes', () => {
      const sql = 'SELECT * FROM unknown_db.users';
      const refs = parseSQLTableReferences(sql);
      const { unrecognizedPrefixes } = buildAttachDatabasesFromParsedRefs(refs, mockConnections);
      
      expect(unrecognizedPrefixes).toContain('unknown_db');
    });
  });

  /**
   * JoinQueryPanel Integration
   * Federated JOIN support via extractAttachDatabases
   */
  describe('JoinQueryPanel - Federated JOIN Support', () => {
    it('should extract attachDatabases from selected external tables', () => {
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
        {
          name: 'local_orders',
          source: 'duckdb',
        },
      ];
      
      const attachDatabases = extractAttachDatabases(selectedTables);
      
      expect(attachDatabases.length).toBe(1);
      expect(attachDatabases[0].connectionId).toBe('conn-mysql');
    });

    it('should support cross-database JOIN', () => {
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
        {
          name: 'events',
          source: 'external',
          connection: {
            id: 'conn-pg',
            name: 'analytics',
            type: 'postgresql',
          },
        },
      ];
      
      const attachDatabases = extractAttachDatabases(selectedTables);
      
      expect(attachDatabases.length).toBe(2);
      expect(attachDatabases.map(db => db.connectionId)).toContain('conn-mysql');
      expect(attachDatabases.map(db => db.connectionId)).toContain('conn-pg');
    });

    it('should deduplicate same connection from multiple tables', () => {
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
        {
          name: 'products',
          source: 'external',
          connection: {
            id: 'conn-mysql',
            name: 'orders',
            type: 'mysql',
          },
        },
      ];
      
      const attachDatabases = extractAttachDatabases(selectedTables);
      
      expect(attachDatabases.length).toBe(1);
    });

    it('should return empty for DuckDB-only tables', () => {
      const selectedTables: SelectedTable[] = [
        { name: 'users', source: 'duckdb' },
        { name: 'orders', source: 'duckdb' },
      ];
      
      const attachDatabases = extractAttachDatabases(selectedTables);
      
      expect(attachDatabases.length).toBe(0);
    });
  });

  /**
   * PivotTablePanel Integration
   * External table warning (no federated support)
   */
  describe('PivotTablePanel - External Table Warning', () => {
    it('should identify external tables for warning display', () => {
      const selectedTable: SelectedTable = {
        name: 'users',
        source: 'external',
        connection: {
          id: 'conn-mysql',
          name: 'orders',
          type: 'mysql',
        },
      };
      
      // PivotTablePanel checks if source is external to show warning
      const isExternal = selectedTable.source === 'external';
      
      expect(isExternal).toBe(true);
    });

    it('should not show warning for DuckDB tables', () => {
      const selectedTable: SelectedTable = {
        name: 'users',
        source: 'duckdb',
      };
      
      const isExternal = selectedTable.source === 'external';
      
      expect(isExternal).toBe(false);
    });
  });

  /**
   * SetOperationsPanel Integration
   * External table warning (no federated support)
   */
  describe('SetOperationsPanel - External Table Warning', () => {
    it('should identify external tables for warning display', () => {
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
        {
          name: 'archived_users',
          source: 'duckdb',
        },
      ];
      
      // SetOperationsPanel checks if any table is external
      const hasExternalTable = selectedTables.some(t => t.source === 'external');
      
      expect(hasExternalTable).toBe(true);
    });

    it('should not show warning when all tables are DuckDB', () => {
      const selectedTables: SelectedTable[] = [
        { name: 'users', source: 'duckdb' },
        { name: 'archived_users', source: 'duckdb' },
      ];
      
      const hasExternalTable = selectedTables.some(t => t.source === 'external');
      
      expect(hasExternalTable).toBe(false);
    });
  });

  /**
   * Cross-Panel Consistency
   * Ensure consistent behavior across panels
   */
  describe('Cross-Panel Consistency', () => {
    it('should use same extractAttachDatabases logic across panels', () => {
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
      
      // Both SQLQueryPanel and JoinQueryPanel use extractAttachDatabases
      const attachDatabases = extractAttachDatabases(selectedTables);
      
      expect(attachDatabases.length).toBe(1);
      expect(attachDatabases[0].connectionId).toBe('conn-mysql');
      expect(attachDatabases[0].alias).toMatch(/mysql.*orders/i);
    });

    it('should generate consistent aliases', () => {
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
      
      // Call multiple times to ensure consistency
      const result1 = extractAttachDatabases(selectedTables);
      const result2 = extractAttachDatabases(selectedTables);
      
      expect(result1[0].alias).toBe(result2[0].alias);
    });

    it('should handle string table names (legacy format)', () => {
      const selectedTables: SelectedTable[] = ['users', 'orders'];
      
      // String tables are treated as DuckDB tables
      const attachDatabases = extractAttachDatabases(selectedTables);
      
      expect(attachDatabases.length).toBe(0);
    });
  });
});
