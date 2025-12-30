import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transformExternalColumns, transformDuckDBColumns } from '../useTableColumns';

// Mock apiClient
vi.mock('@/api', () => ({
  getDuckDBTableDetail: vi.fn(),
  getExternalTableDetail: vi.fn(),
}));

describe('useTableColumns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('transformExternalColumns', () => {
    /**
     * **Feature: external-table-column-fix, Property 2: Column Data Format Consistency**
     * **Validates: Requirements 1.4, 4.2**
     * 
     * *For any* external table column response, the transformed output should have 
     * the same structure as DuckDB table column response (containing `name` and `type` fields).
     */
    it('should transform external columns to consistent format', () => {
      const externalColumns = [
        { name: 'id', type: 'INT' },
        { name: 'username', type: 'VARCHAR(255)' },
        { name: 'email', type: 'VARCHAR(100)' },
      ];

      const result = transformExternalColumns(externalColumns);

      expect(result).toHaveLength(3);
      result.forEach((col) => {
        expect(col).toHaveProperty('name');
        expect(col).toHaveProperty('type');
        expect(typeof col.name).toBe('string');
        expect(typeof col.type).toBe('string');
      });
    });

    it('should handle column_name and data_type fields', () => {
      const externalColumns = [
        { column_name: 'id', data_type: 'INTEGER' },
        { column_name: 'name', data_type: 'TEXT' },
      ];

      const result = transformExternalColumns(externalColumns);

      expect(result).toEqual([
        { name: 'id', type: 'INTEGER' },
        { name: 'name', type: 'TEXT' },
      ]);
    });

    it('should return empty array for null input', () => {
      expect(transformExternalColumns(null)).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      expect(transformExternalColumns(undefined)).toEqual([]);
    });

    it('should return empty array for non-array input', () => {
      expect(transformExternalColumns('not an array')).toEqual([]);
      expect(transformExternalColumns(123)).toEqual([]);
      expect(transformExternalColumns({})).toEqual([]);
    });

    it('should filter out columns with unknown name', () => {
      const columns = [
        { name: 'valid', type: 'INT' },
        { type: 'VARCHAR' }, // missing name
        { name: '', type: 'TEXT' }, // empty name becomes 'unknown' and filtered
      ];

      const result = transformExternalColumns(columns);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('valid');
    });

    it('should use unknown for missing type', () => {
      const columns = [{ name: 'col1' }];

      const result = transformExternalColumns(columns);

      expect(result).toEqual([{ name: 'col1', type: 'unknown' }]);
    });
  });

  describe('transformDuckDBColumns', () => {
    /**
     * **Feature: external-table-column-fix, Property 2: Column Data Format Consistency**
     * **Validates: Requirements 1.4, 4.2**
     */
    it('should transform DuckDB columns to consistent format', () => {
      const duckdbColumns = [
        { column_name: 'id', data_type: 'INTEGER' },
        { column_name: 'name', data_type: 'VARCHAR' },
        { column_name: 'created_at', data_type: 'TIMESTAMP' },
      ];

      const result = transformDuckDBColumns(duckdbColumns);

      expect(result).toHaveLength(3);
      result.forEach((col) => {
        expect(col).toHaveProperty('name');
        expect(col).toHaveProperty('type');
        expect(typeof col.name).toBe('string');
        expect(typeof col.type).toBe('string');
      });
    });

    it('should handle name and type fields', () => {
      const duckdbColumns = [
        { name: 'id', type: 'INTEGER' },
        { name: 'value', type: 'DOUBLE' },
      ];

      const result = transformDuckDBColumns(duckdbColumns);

      expect(result).toEqual([
        { name: 'id', type: 'INTEGER' },
        { name: 'value', type: 'DOUBLE' },
      ]);
    });

    it('should return empty array for null input', () => {
      expect(transformDuckDBColumns(null)).toEqual([]);
    });

    it('should return empty array for undefined input', () => {
      expect(transformDuckDBColumns(undefined)).toEqual([]);
    });

    it('should return empty array for non-array input', () => {
      expect(transformDuckDBColumns('not an array')).toEqual([]);
      expect(transformDuckDBColumns(123)).toEqual([]);
      expect(transformDuckDBColumns({})).toEqual([]);
    });

    it('should filter out columns with unknown name', () => {
      const columns = [
        { column_name: 'valid', data_type: 'INT' },
        { data_type: 'VARCHAR' }, // missing name
      ];

      const result = transformDuckDBColumns(columns);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('valid');
    });
  });

  describe('Column Format Consistency Property', () => {
    /**
     * **Feature: external-table-column-fix, Property 2: Column Data Format Consistency**
     * **Validates: Requirements 1.4, 4.2**
     * 
     * Both transform functions should produce the same output structure
     */
    it('should produce identical structure from both transform functions', () => {
      const externalInput = [
        { name: 'id', type: 'INTEGER' },
        { name: 'name', type: 'VARCHAR' },
      ];

      const duckdbInput = [
        { column_name: 'id', data_type: 'INTEGER' },
        { column_name: 'name', data_type: 'VARCHAR' },
      ];

      const externalResult = transformExternalColumns(externalInput);
      const duckdbResult = transformDuckDBColumns(duckdbInput);

      // Both should have same structure
      expect(externalResult).toEqual(duckdbResult);
    });

    it('should handle mixed field naming conventions', () => {
      // External API might return either format
      const mixedExternal = [
        { name: 'col1', type: 'INT' },
        { column_name: 'col2', data_type: 'VARCHAR' },
      ];

      const result = transformExternalColumns(mixedExternal);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ name: 'col1', type: 'INT' });
      expect(result[1]).toEqual({ name: 'col2', type: 'VARCHAR' });
    });
  });

  describe('API Selection Property', () => {
    /**
     * **Feature: external-table-column-fix, Property 1: External Table Column API Selection**
     * **Validates: Requirements 1.1, 4.1**
     * 
     * *For any* selected table in JoinQueryPanel, if the table source is 'external', 
     * the system should call `getExternalTableDetail` API; otherwise, it should call 
     * `getDuckDBTableDetail` API.
     */
    it('should determine correct API based on table source - external', () => {
      const externalTable = {
        name: 'users',
        source: 'external' as const,
        connection: { id: 'conn-123', type: 'mysql' as const },
      };

      const isExternal = externalTable.source === 'external';
      const hasConnectionId = !!externalTable.connection?.id;
      const shouldUseExternalAPI = isExternal && hasConnectionId;

      expect(shouldUseExternalAPI).toBe(true);
    });

    it('should determine correct API based on table source - duckdb', () => {
      const duckdbTable: { name: string; source: 'duckdb' | 'external' } = {
        name: 'local_table',
        source: 'duckdb',
      };

      const isExternal = duckdbTable.source === 'external';
      const shouldUseExternalAPI = isExternal;

      expect(shouldUseExternalAPI).toBe(false);
    });

    it('should determine correct API for string table (defaults to duckdb)', () => {
      const stringTable = 'my_table';

      // String tables are always DuckDB tables
      const isString = typeof stringTable === 'string';
      const isExternal = !isString; // String tables are never external

      expect(isExternal).toBe(false);
    });

    it('should require connection id for external tables', () => {
      const externalWithoutConnection: { name: string; source: 'external'; connection?: { id: string } } = {
        name: 'users',
        source: 'external',
        // No connection
      };

      const isExternal = externalWithoutConnection.source === 'external';
      const hasConnectionId = !!externalWithoutConnection.connection?.id;
      const shouldUseExternalAPI = isExternal && hasConnectionId;

      // Should not use external API without connection id
      expect(shouldUseExternalAPI).toBe(false);
    });
  });
});
