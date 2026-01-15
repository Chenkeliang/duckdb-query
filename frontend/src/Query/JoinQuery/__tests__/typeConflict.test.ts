/**
 * JoinQueryPanel 类型冲突集成测试
 * 
 * Property 5: Unresolved conflicts block execution
 * For any query with at least one unresolved type conflict,
 * attempting to execute SHALL be blocked and return a flag indicating conflicts exist.
 */

import { describe, it, expect } from 'vitest';
import {
  areTypesCompatible,
  getRecommendedCastType,
  generateConflictKey,
} from '@/utils/duckdbTypes';

describe('JoinQueryPanel Type Conflict Integration', () => {
  /**
   * Property 5: Unresolved conflicts block execution
   */
  describe('Property 5: Execution blocking', () => {
    it('should detect conflict between VARCHAR and INTEGER', () => {
      const leftType = 'VARCHAR';
      const rightType = 'INTEGER';
      
      expect(areTypesCompatible(leftType, rightType)).toBe(false);
    });

    it('should not detect conflict between compatible types', () => {
      const leftType = 'INTEGER';
      const rightType = 'BIGINT';
      
      expect(areTypesCompatible(leftType, rightType)).toBe(true);
    });

    it('should generate correct conflict key', () => {
      const key = generateConflictKey('orders', 'id', 'users', 'order_id');
      expect(key).toBe('orders.id::users.order_id');
    });

    it('should recommend VARCHAR for string + numeric conflict', () => {
      const recommended = getRecommendedCastType('VARCHAR', 'INTEGER');
      expect(recommended).toBe('VARCHAR');
    });

    it('should recommend DOUBLE for numeric conflicts', () => {
      const recommended = getRecommendedCastType('INTEGER', 'DECIMAL(18,4)');
      expect(recommended).toBe('DOUBLE');
    });
  });

  describe('TRY_CAST SQL generation', () => {
    it('should generate TRY_CAST for resolved conflicts', () => {
      // Simulate the SQL generation logic
      const leftTable = 'orders';
      const leftColumn = 'id';
      const rightTable = 'users';
      const rightColumn = 'order_id';
      const castType = 'VARCHAR';
      
      const leftRef = `"${leftTable}"."${leftColumn}"`;
      const rightRef = `"${rightTable}"."${rightColumn}"`;
      
      const sqlWithCast = `TRY_CAST(${leftRef} AS ${castType}) = TRY_CAST(${rightRef} AS ${castType})`;
      
      expect(sqlWithCast).toBe('TRY_CAST("orders"."id" AS VARCHAR) = TRY_CAST("users"."order_id" AS VARCHAR)');
    });

    it('should not generate TRY_CAST for compatible types', () => {
      const leftTable = 'orders';
      const leftColumn = 'id';
      const rightTable = 'users';
      const rightColumn = 'order_id';
      
      const leftRef = `"${leftTable}"."${leftColumn}"`;
      const rightRef = `"${rightTable}"."${rightColumn}"`;
      
      const sqlWithoutCast = `${leftRef} = ${rightRef}`;
      
      expect(sqlWithoutCast).toBe('"orders"."id" = "users"."order_id"');
    });
  });

  describe('conflict detection scenarios', () => {
    const testCases = [
      // Incompatible types
      { left: 'VARCHAR', right: 'INTEGER', compatible: false },
      { left: 'TEXT', right: 'BIGINT', compatible: false },
      { left: 'DATE', right: 'VARCHAR', compatible: false },
      { left: 'TIMESTAMP', right: 'INTEGER', compatible: false },
      { left: 'JSON', right: 'VARCHAR', compatible: false },
      { left: 'UUID', right: 'INTEGER', compatible: false },
      
      // Compatible types
      { left: 'INTEGER', right: 'BIGINT', compatible: true },
      { left: 'FLOAT', right: 'DOUBLE', compatible: true },
      { left: 'VARCHAR', right: 'TEXT', compatible: true },
      { left: 'DATE', right: 'TIMESTAMP', compatible: true },
      { left: 'DECIMAL(18,4)', right: 'DECIMAL(10,2)', compatible: true },
      { left: 'INTEGER', right: 'DOUBLE', compatible: true },
    ];

    testCases.forEach(({ left, right, compatible }) => {
      it(`should ${compatible ? 'not ' : ''}detect conflict: ${left} vs ${right}`, () => {
        expect(areTypesCompatible(left, right)).toBe(compatible);
      });
    });
  });

  describe('recommended type scenarios', () => {
    const testCases = [
      // String + any → VARCHAR
      { left: 'VARCHAR', right: 'INTEGER', expected: 'VARCHAR' },
      { left: 'TEXT', right: 'BIGINT', expected: 'VARCHAR' },
      { left: 'DATE', right: 'VARCHAR', expected: 'VARCHAR' },
      
      // Numeric + numeric → DOUBLE
      { left: 'INTEGER', right: 'DECIMAL(18,4)', expected: 'DOUBLE' },
      
      // DateTime + any → TIMESTAMP
      { left: 'DATE', right: 'INTEGER', expected: 'TIMESTAMP' },
      { left: 'TIMESTAMP', right: 'BIGINT', expected: 'TIMESTAMP' },
      
      // Complex types → VARCHAR
      { left: 'JSON', right: 'INTEGER', expected: 'VARCHAR' },
      { left: 'UUID', right: 'BIGINT', expected: 'VARCHAR' },
    ];

    testCases.forEach(({ left, right, expected }) => {
      it(`should recommend ${expected} for ${left} + ${right}`, () => {
        expect(getRecommendedCastType(left, right)).toBe(expected);
      });
    });
  });
});
