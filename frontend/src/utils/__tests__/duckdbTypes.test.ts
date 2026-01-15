/**
 * DuckDB 类型工具模块测试
 * 
 * 测试属性：
 * - Property 1: Type normalization strips precision/length parameters
 * - Property 2: Compatible types do not trigger conflicts
 * - Property 7: Recommended type follows type combination rules
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeTypeName,
  areTypesCompatible,
  getRecommendedCastType,
  generateConflictKey,
  isSameColumn,
  getTypeDisplayName,
  isNumericType,
  isStringType,
  isDateTimeType,
  isComplexType,
  DUCKDB_CAST_TYPES,
} from '../duckdbTypes';

describe('duckdbTypes', () => {
  /**
   * Property 1: Type normalization strips precision/length parameters
   * For any DuckDB type string with precision or length parameters,
   * normalizing the type SHALL return the base type name without parameters.
   */
  describe('normalizeTypeName - Property 1', () => {
    it('should strip precision from DECIMAL type', () => {
      expect(normalizeTypeName('DECIMAL(18,4)')).toBe('DECIMAL');
      expect(normalizeTypeName('DECIMAL(10,2)')).toBe('DECIMAL');
      expect(normalizeTypeName('decimal(5,0)')).toBe('DECIMAL');
    });

    it('should strip length from VARCHAR type', () => {
      expect(normalizeTypeName('VARCHAR(255)')).toBe('VARCHAR');
      expect(normalizeTypeName('varchar(100)')).toBe('VARCHAR');
      expect(normalizeTypeName('CHAR(10)')).toBe('CHAR');
    });

    it('should handle types without parameters', () => {
      expect(normalizeTypeName('INTEGER')).toBe('INTEGER');
      expect(normalizeTypeName('BIGINT')).toBe('BIGINT');
      expect(normalizeTypeName('VARCHAR')).toBe('VARCHAR');
      expect(normalizeTypeName('TIMESTAMP')).toBe('TIMESTAMP');
    });

    it('should handle array types', () => {
      expect(normalizeTypeName('INTEGER[]')).toBe('ARRAY');
      expect(normalizeTypeName('VARCHAR[]')).toBe('ARRAY');
    });

    it('should handle null/undefined/empty', () => {
      expect(normalizeTypeName(null)).toBe('UNKNOWN');
      expect(normalizeTypeName(undefined)).toBe('UNKNOWN');
      expect(normalizeTypeName('')).toBe('UNKNOWN');
      expect(normalizeTypeName('  ')).toBe('UNKNOWN');
    });

    it('should convert to uppercase', () => {
      expect(normalizeTypeName('integer')).toBe('INTEGER');
      expect(normalizeTypeName('Varchar')).toBe('VARCHAR');
      expect(normalizeTypeName('bigInt')).toBe('BIGINT');
    });

    it('should trim whitespace', () => {
      expect(normalizeTypeName('  INTEGER  ')).toBe('INTEGER');
      expect(normalizeTypeName('\tVARCHAR\n')).toBe('VARCHAR');
    });

    it('should handle complex type names', () => {
      expect(normalizeTypeName('TIMESTAMP WITH TIME ZONE')).toBe('TIMESTAMP WITH TIME ZONE');
      expect(normalizeTypeName('TIME WITH TIME ZONE')).toBe('TIME WITH TIME ZONE');
    });
  });

  /**
   * Property 2: Compatible types do not trigger conflicts
   * For any pair of columns with compatible types,
   * the conflict detection SHALL return no conflict for that pair.
   */
  describe('areTypesCompatible - Property 2', () => {
    describe('same type compatibility', () => {
      it('should return true for identical types', () => {
        expect(areTypesCompatible('INTEGER', 'INTEGER')).toBe(true);
        expect(areTypesCompatible('VARCHAR', 'VARCHAR')).toBe(true);
        expect(areTypesCompatible('TIMESTAMP', 'TIMESTAMP')).toBe(true);
      });

      it('should return true for same type with different precision', () => {
        expect(areTypesCompatible('DECIMAL(18,4)', 'DECIMAL(10,2)')).toBe(true);
        expect(areTypesCompatible('VARCHAR(255)', 'VARCHAR(100)')).toBe(true);
      });
    });

    describe('integer family compatibility', () => {
      it('should return true for integer types', () => {
        expect(areTypesCompatible('INTEGER', 'BIGINT')).toBe(true);
        expect(areTypesCompatible('SMALLINT', 'INTEGER')).toBe(true);
        expect(areTypesCompatible('TINYINT', 'HUGEINT')).toBe(true);
        expect(areTypesCompatible('INT', 'BIGINT')).toBe(true);
      });

      it('should return true for unsigned integer types', () => {
        expect(areTypesCompatible('UINTEGER', 'UBIGINT')).toBe(true);
        expect(areTypesCompatible('UTINYINT', 'USMALLINT')).toBe(true);
      });

      it('should return true for mixed signed/unsigned integers', () => {
        expect(areTypesCompatible('INTEGER', 'UINTEGER')).toBe(true);
        expect(areTypesCompatible('BIGINT', 'UBIGINT')).toBe(true);
      });
    });

    describe('float family compatibility', () => {
      it('should return true for float types', () => {
        expect(areTypesCompatible('FLOAT', 'DOUBLE')).toBe(true);
        expect(areTypesCompatible('REAL', 'DOUBLE')).toBe(true);
        expect(areTypesCompatible('FLOAT4', 'FLOAT8')).toBe(true);
      });
    });

    describe('numeric cross-family compatibility', () => {
      it('should return true for integer and float', () => {
        expect(areTypesCompatible('INTEGER', 'DOUBLE')).toBe(true);
        expect(areTypesCompatible('BIGINT', 'FLOAT')).toBe(true);
      });

      it('should return true for integer and decimal', () => {
        expect(areTypesCompatible('INTEGER', 'DECIMAL')).toBe(true);
        expect(areTypesCompatible('BIGINT', 'DECIMAL(18,4)')).toBe(true);
      });

      it('should return true for float and decimal', () => {
        expect(areTypesCompatible('DOUBLE', 'DECIMAL')).toBe(true);
        expect(areTypesCompatible('FLOAT', 'DECIMAL(10,2)')).toBe(true);
      });
    });

    describe('string family compatibility', () => {
      it('should return true for string types', () => {
        expect(areTypesCompatible('VARCHAR', 'TEXT')).toBe(true);
        expect(areTypesCompatible('CHAR', 'VARCHAR')).toBe(true);
        expect(areTypesCompatible('STRING', 'VARCHAR')).toBe(true);
        expect(areTypesCompatible('BPCHAR', 'TEXT')).toBe(true);
      });
    });

    describe('datetime family compatibility', () => {
      it('should return true for datetime types', () => {
        expect(areTypesCompatible('DATE', 'TIMESTAMP')).toBe(true);
        expect(areTypesCompatible('TIME', 'TIMESTAMP')).toBe(true);
        expect(areTypesCompatible('TIMESTAMPTZ', 'TIMESTAMP')).toBe(true);
      });
    });

    describe('incompatible types', () => {
      it('should return false for string vs numeric', () => {
        expect(areTypesCompatible('VARCHAR', 'INTEGER')).toBe(false);
        expect(areTypesCompatible('TEXT', 'BIGINT')).toBe(false);
        expect(areTypesCompatible('VARCHAR', 'DOUBLE')).toBe(false);
      });

      it('should return false for string vs datetime', () => {
        expect(areTypesCompatible('VARCHAR', 'TIMESTAMP')).toBe(false);
        expect(areTypesCompatible('TEXT', 'DATE')).toBe(false);
      });

      it('should return false for numeric vs datetime', () => {
        expect(areTypesCompatible('INTEGER', 'TIMESTAMP')).toBe(false);
        expect(areTypesCompatible('BIGINT', 'DATE')).toBe(false);
      });

      it('should return false for complex types with different types', () => {
        expect(areTypesCompatible('JSON', 'VARCHAR')).toBe(false);
        expect(areTypesCompatible('STRUCT', 'MAP')).toBe(false);
        expect(areTypesCompatible('LIST', 'ARRAY')).toBe(false);
        expect(areTypesCompatible('UUID', 'VARCHAR')).toBe(false);
      });

      it('should return false for UNKNOWN type', () => {
        expect(areTypesCompatible('UNKNOWN', 'INTEGER')).toBe(false);
        expect(areTypesCompatible('VARCHAR', 'UNKNOWN')).toBe(false);
        // UNKNOWN with itself is still compatible (same type)
        expect(areTypesCompatible('UNKNOWN', 'UNKNOWN')).toBe(true);
      });
    });
  });

  /**
   * Property 7: Recommended type follows type combination rules
   * For any type conflict, the recommended type SHALL follow the defined rules.
   */
  describe('getRecommendedCastType - Property 7', () => {
    describe('string + any type → VARCHAR', () => {
      it('should recommend VARCHAR for string + numeric', () => {
        expect(getRecommendedCastType('VARCHAR', 'INTEGER')).toBe('VARCHAR');
        expect(getRecommendedCastType('INTEGER', 'VARCHAR')).toBe('VARCHAR');
        expect(getRecommendedCastType('TEXT', 'BIGINT')).toBe('VARCHAR');
      });

      it('should recommend VARCHAR for string + datetime', () => {
        expect(getRecommendedCastType('VARCHAR', 'TIMESTAMP')).toBe('VARCHAR');
        expect(getRecommendedCastType('DATE', 'TEXT')).toBe('VARCHAR');
      });
    });

    describe('numeric + numeric → DOUBLE', () => {
      it('should recommend DOUBLE for integer + float', () => {
        expect(getRecommendedCastType('INTEGER', 'DOUBLE')).toBe('DOUBLE');
        expect(getRecommendedCastType('BIGINT', 'FLOAT')).toBe('DOUBLE');
      });

      it('should recommend DOUBLE for integer + decimal', () => {
        expect(getRecommendedCastType('INTEGER', 'DECIMAL')).toBe('DOUBLE');
        expect(getRecommendedCastType('DECIMAL(18,4)', 'BIGINT')).toBe('DOUBLE');
      });
    });

    describe('datetime types → TIMESTAMP', () => {
      it('should recommend TIMESTAMP for datetime + numeric', () => {
        expect(getRecommendedCastType('DATE', 'INTEGER')).toBe('TIMESTAMP');
        expect(getRecommendedCastType('BIGINT', 'TIMESTAMP')).toBe('TIMESTAMP');
      });

      it('should recommend TIMESTAMP for different datetime types', () => {
        expect(getRecommendedCastType('DATE', 'TIME')).toBe('TIMESTAMP');
        expect(getRecommendedCastType('TIMESTAMPTZ', 'DATE')).toBe('TIMESTAMP');
      });
    });

    describe('complex types → VARCHAR', () => {
      it('should recommend VARCHAR for complex types', () => {
        expect(getRecommendedCastType('JSON', 'INTEGER')).toBe('VARCHAR');
        expect(getRecommendedCastType('STRUCT', 'BIGINT')).toBe('VARCHAR');
        expect(getRecommendedCastType('UUID', 'INTEGER')).toBe('VARCHAR');
      });
    });

    describe('default → VARCHAR', () => {
      it('should recommend VARCHAR for unknown combinations', () => {
        expect(getRecommendedCastType('UNKNOWN', 'UNKNOWN')).toBe('VARCHAR');
      });
    });
  });

  describe('generateConflictKey', () => {
    it('should generate consistent key format', () => {
      const key = generateConflictKey('orders', 'id', 'users', 'order_id');
      expect(key).toBe('orders.id::users.order_id');
    });

    it('should be case-insensitive', () => {
      const key1 = generateConflictKey('Orders', 'ID', 'Users', 'Order_ID');
      const key2 = generateConflictKey('orders', 'id', 'users', 'order_id');
      expect(key1).toBe(key2);
    });

    it('should handle special characters in names', () => {
      const key = generateConflictKey('my_table', 'col_1', 'other_table', 'col_2');
      expect(key).toBe('my_table.col_1::other_table.col_2');
    });
  });

  describe('isSameColumn', () => {
    it('should return true for same table and column', () => {
      expect(isSameColumn('users', 'id', 'users', 'id')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isSameColumn('Users', 'ID', 'users', 'id')).toBe(true);
      expect(isSameColumn('ORDERS', 'order_id', 'orders', 'ORDER_ID')).toBe(true);
    });

    it('should return false for different tables', () => {
      expect(isSameColumn('users', 'id', 'orders', 'id')).toBe(false);
    });

    it('should return false for different columns', () => {
      expect(isSameColumn('users', 'id', 'users', 'name')).toBe(false);
    });
  });

  describe('getTypeDisplayName', () => {
    it('should preserve original type with precision', () => {
      expect(getTypeDisplayName('decimal(18,4)')).toBe('DECIMAL(18,4)');
      expect(getTypeDisplayName('varchar(255)')).toBe('VARCHAR(255)');
    });

    it('should convert to uppercase', () => {
      expect(getTypeDisplayName('integer')).toBe('INTEGER');
      expect(getTypeDisplayName('bigInt')).toBe('BIGINT');
    });

    it('should handle null/undefined', () => {
      expect(getTypeDisplayName(null)).toBe('UNKNOWN');
      expect(getTypeDisplayName(undefined)).toBe('UNKNOWN');
    });
  });

  describe('type category helpers', () => {
    describe('isNumericType', () => {
      it('should return true for numeric types', () => {
        expect(isNumericType('INTEGER')).toBe(true);
        expect(isNumericType('BIGINT')).toBe(true);
        expect(isNumericType('DOUBLE')).toBe(true);
        expect(isNumericType('DECIMAL(18,4)')).toBe(true);
      });

      it('should return false for non-numeric types', () => {
        expect(isNumericType('VARCHAR')).toBe(false);
        expect(isNumericType('TIMESTAMP')).toBe(false);
      });
    });

    describe('isStringType', () => {
      it('should return true for string types', () => {
        expect(isStringType('VARCHAR')).toBe(true);
        expect(isStringType('TEXT')).toBe(true);
        expect(isStringType('CHAR')).toBe(true);
      });

      it('should return false for non-string types', () => {
        expect(isStringType('INTEGER')).toBe(false);
        expect(isStringType('TIMESTAMP')).toBe(false);
      });
    });

    describe('isDateTimeType', () => {
      it('should return true for datetime types', () => {
        expect(isDateTimeType('DATE')).toBe(true);
        expect(isDateTimeType('TIMESTAMP')).toBe(true);
        expect(isDateTimeType('TIME')).toBe(true);
      });

      it('should return false for non-datetime types', () => {
        expect(isDateTimeType('INTEGER')).toBe(false);
        expect(isDateTimeType('VARCHAR')).toBe(false);
      });
    });

    describe('isComplexType', () => {
      it('should return true for complex types', () => {
        expect(isComplexType('JSON')).toBe(true);
        expect(isComplexType('STRUCT')).toBe(true);
        expect(isComplexType('MAP')).toBe(true);
        expect(isComplexType('UUID')).toBe(true);
      });

      it('should return false for simple types', () => {
        expect(isComplexType('INTEGER')).toBe(false);
        expect(isComplexType('VARCHAR')).toBe(false);
      });
    });
  });

  describe('DUCKDB_CAST_TYPES', () => {
    it('should contain common cast types', () => {
      expect(DUCKDB_CAST_TYPES).toContain('VARCHAR');
      expect(DUCKDB_CAST_TYPES).toContain('BIGINT');
      expect(DUCKDB_CAST_TYPES).toContain('INTEGER');
      expect(DUCKDB_CAST_TYPES).toContain('DOUBLE');
      expect(DUCKDB_CAST_TYPES).toContain('TIMESTAMP');
      expect(DUCKDB_CAST_TYPES).toContain('DATE');
      expect(DUCKDB_CAST_TYPES).toContain('BOOLEAN');
    });
  });
});
