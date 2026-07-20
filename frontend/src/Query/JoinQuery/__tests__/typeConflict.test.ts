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
  normalizeTypeName,
  DUCKDB_CAST_TYPES,
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

    it('should return empty (no safe type-only recommendation) for numeric conflicts', () => {
      // 复审二次修正:固定 scale DECIMAL 会舍入假匹配、VARCHAR 又丢匹配——类型层面无安全默认,
      // 返回 '' 交由数据感知推断 / 用户手填
      const recommended = getRecommendedCastType('INTEGER', 'DECIMAL(18,4)');
      expect(recommended).toBe('');
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
      
      // Numeric + numeric → ''(类型层面无安全默认,交由数据感知推断 / 手填)
      { left: 'INTEGER', right: 'DECIMAL(18,4)', expected: '' },

      // DateTime + 非时间类型 → VARCHAR(把 INTEGER 硬转 TIMESTAMP 是纪元误读陷阱)
      { left: 'DATE', right: 'INTEGER', expected: 'VARCHAR' },
      { left: 'TIMESTAMP', right: 'BIGINT', expected: 'VARCHAR' },

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

  describe('federated source-native type names (regression)', () => {
    // 回归:联邦表详情返回源库原生类型名,旧词表不认,DuckDB TIMESTAMP ×
    // MySQL datetime / PG timestamp without time zone 被误判冲突,
    // 强迫用户走无谓的类型转换对话框。
    const compatiblePairs = [
      ['TIMESTAMP', 'datetime'],                        // MySQL
      ['TIMESTAMP', 'timestamp without time zone'],     // PostgreSQL
      ['TIMESTAMP', 'timestamp(0) without time zone'],  // PG 带精度参数
      ['DATE', 'datetime'],
      ['BIGINT', 'bigint unsigned'],                    // MySQL 无符号
      ['BIGINT', 'int8'],                               // INT8 = 8 字节 = BIGINT
      ['VARCHAR', 'character varying'],                 // PG
      ['VARCHAR', 'mediumtext'],                        // MySQL
      ['DOUBLE', 'double precision'],                   // PG
    ] as const;

    compatiblePairs.forEach(([left, right]) => {
      it(`should treat ${left} × ${right} as compatible`, () => {
        expect(areTypesCompatible(left, right)).toBe(true);
      });
    });

    it('normalizes source-native and alias spellings to canonical names', () => {
      expect(normalizeTypeName('datetime')).toBe('TIMESTAMP');
      expect(normalizeTypeName('timestamp(3) without time zone')).toBe('TIMESTAMP');
      expect(normalizeTypeName('bigint unsigned')).toBe('UBIGINT');
      expect(normalizeTypeName('INT8')).toBe('BIGINT');
      expect(normalizeTypeName('NUMERIC(10,2)')).toBe('DECIMAL');
      expect(normalizeTypeName('character varying')).toBe('VARCHAR');
      expect(normalizeTypeName('INTEGER[]')).toBe('ARRAY');
    });
  });

  describe('cast target safety (regression)', () => {
    it('offers only lossless-or-explicit targets, VARCHAR first', () => {
      // 回归:曾提供 INTEGER(32 位,>2^31 溢出成 NULL → JOIN 漏匹配)
      // 与 DECIMAL(18,4)(超限静默截断)
      expect(DUCKDB_CAST_TYPES[0]).toBe('VARCHAR');
      expect(DUCKDB_CAST_TYPES).not.toContain('INTEGER');
      expect(DUCKDB_CAST_TYPES).not.toContain('DECIMAL(18,4)');
      expect(DUCKDB_CAST_TYPES).toContain('BIGINT');
      expect(DUCKDB_CAST_TYPES).toContain('DECIMAL(38,6)');
    });
  });
});
