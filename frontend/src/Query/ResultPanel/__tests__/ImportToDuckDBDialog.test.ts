/**
 * ImportToDuckDBDialog 属性测试
 * 
 * **Feature: external-table-integration-fixes, Property 4: Import Dialog Data Flow Correctness**
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// 数据库类型
type DatabaseType = 'mysql' | 'postgresql' | 'sqlite';

// TableSource 类型
interface TableSource {
  type: 'duckdb' | 'external';
  connectionId?: string;
  connectionName?: string;
  databaseType?: DatabaseType;
  schema?: string;
}

// Arbitraries
const databaseTypeArb = fc.constantFrom<DatabaseType>('mysql', 'postgresql', 'sqlite');

const externalSourceArb: fc.Arbitrary<TableSource> = fc.record({
  type: fc.constant('external' as const),
  connectionId: fc.string({ minLength: 1, maxLength: 50 }),
  connectionName: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  databaseType: fc.option(databaseTypeArb, { nil: undefined }),
  schema: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
});

/**
 * 模拟 ImportToDuckDBDialog 中的 datasource 构建逻辑
 */
const buildDatasource = (source?: TableSource) => {
  if (source) {
    return {
      // 确保 ID 不带 db_ 前缀
      id: source.connectionId?.replace(/^db_/, '') || source.connectionId,
      type: source.databaseType || 'mysql',
    };
  }
  return {
    id: 'duckdb_internal',
    type: 'duckdb',
  };
};

/**
 * 验证表名是否有效（复制自 ImportToDuckDBDialog）
 */
const validateTableName = (name: string): { valid: boolean; error?: string } => {
  if (!name || !name.trim()) {
    return { valid: false, error: '表名不能为空' };
  }
  
  const trimmed = name.trim();
  
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    return { 
      valid: false, 
      error: '表名只能包含字母、数字和下划线，且必须以字母或下划线开头' 
    };
  }
  
  if (trimmed.length > 64) {
    return { valid: false, error: '表名长度不能超过 64 个字符' };
  }
  
  return { valid: true };
};

describe('ImportToDuckDBDialog - Property Tests', () => {
  describe('Datasource construction', () => {
    /**
     * Property 4: Import Dialog Data Flow Correctness
     * For any import operation, the datasource.id should not have db_ prefix
     */
    it('should strip db_ prefix from connection ID', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          (baseId) => {
            const source: TableSource = {
              type: 'external',
              connectionId: `db_${baseId}`,
              databaseType: 'mysql',
            };
            
            const datasource = buildDatasource(source);
            
            // The ID should not start with db_ (unless baseId itself starts with db_)
            return !datasource.id.startsWith('db_') || baseId.startsWith('db_');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: IDs without db_ prefix should remain unchanged
     */
    it('should not modify IDs without db_ prefix', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.startsWith('db_')),
          (connectionId) => {
            const source: TableSource = {
              type: 'external',
              connectionId,
              databaseType: 'mysql',
            };
            
            const datasource = buildDatasource(source);
            
            return datasource.id === connectionId;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Database type should be preserved or default to mysql
     */
    it('should preserve database type or default to mysql', () => {
      fc.assert(
        fc.property(
          externalSourceArb,
          (source) => {
            const datasource = buildDatasource(source);
            
            if (source.databaseType) {
              return datasource.type === source.databaseType;
            } else {
              return datasource.type === 'mysql';
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Missing source should default to DuckDB internal
     */
    it('should default to DuckDB internal when source is undefined', () => {
      const datasource = buildDatasource(undefined);
      
      expect(datasource.id).toBe('duckdb_internal');
      expect(datasource.type).toBe('duckdb');
    });
  });

  describe('Table name validation', () => {
    /**
     * Property: Valid table names should pass validation
     */
    it('should accept valid table names', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/),
          (tableName) => {
            const result = validateTableName(tableName);
            return result.valid === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Empty table names should fail validation
     */
    it('should reject empty table names', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', '   ', '\t', '\n'),
          (tableName) => {
            const result = validateTableName(tableName);
            return result.valid === false;
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * Property: Table names starting with numbers should fail
     */
    it('should reject table names starting with numbers', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 9 }),
          fc.string({ minLength: 0, maxLength: 50 }),
          (digit, rest) => {
            const tableName = `${digit}${rest}`;
            const result = validateTableName(tableName);
            return result.valid === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Table names longer than 64 characters should fail
     */
    it('should reject table names longer than 64 characters', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{64,100}$/),
          (tableName) => {
            const result = validateTableName(tableName);
            return result.valid === false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
