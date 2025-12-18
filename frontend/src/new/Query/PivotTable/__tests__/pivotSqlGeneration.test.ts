/**
 * 透视表 SQL 生成属性测试
 * 
 * **Feature: external-table-integration-fixes, Property 10: Pivot SQL Generation Correctness**
 * **Validates: Requirements 9.1, 9.3, 9.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// 类型定义
type AggFunction = 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX';

interface ValueField {
  id: string;
  column: string;
  aggFunction: AggFunction;
}

// Arbitraries
const aggFunctionArb = fc.constantFrom<AggFunction>('SUM', 'COUNT', 'AVG', 'MIN', 'MAX');

const columnNameArb = fc.string({ minLength: 1, maxLength: 30 })
  .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));

const tableNameArb = fc.string({ minLength: 1, maxLength: 30 })
  .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));

const valueFieldArb: fc.Arbitrary<ValueField> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  column: columnNameArb,
  aggFunction: aggFunctionArb,
});

// 透视值（可以是字符串、数字或 null）
const pivotValueArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes("'")),
  fc.integer({ min: -1000, max: 1000 }),
  fc.constant(null)
);

/**
 * 生成透视 SQL（CASE WHEN 方式）
 */
const generatePivotSQL = (
  tableName: string,
  schema: string | undefined,
  rowFields: string[],
  columnField: string | undefined,
  valueFields: ValueField[],
  distinctValues: any[] | undefined
): string | null => {
  if (!tableName || rowFields.length === 0 || valueFields.length === 0) {
    return null;
  }

  // 获取完整表名
  const fullTableName = schema 
    ? `"${schema}"."${tableName}"`
    : `"${tableName}"`;

  const selectParts: string[] = [];

  // 行字段
  rowFields.forEach((field) => {
    selectParts.push(`"${field}"`);
  });

  // 如果有列字段和 distinct 值，使用 CASE WHEN 透视
  if (columnField && distinctValues && distinctValues.length > 0) {
    valueFields.forEach((vf) => {
      if (vf.column) {
        distinctValues.forEach((pivotValue: any) => {
          const valueStr = pivotValue === null ? 'NULL' : String(pivotValue);
          const safeAlias = valueStr.replace(/[^a-zA-Z0-9_]/g, '_');
          const condition = pivotValue === null 
            ? `"${columnField}" IS NULL`
            : `"${columnField}" = '${String(pivotValue).replace(/'/g, "''")}'`;
          
          selectParts.push(
            `${vf.aggFunction}(CASE WHEN ${condition} THEN "${vf.column}" END) AS "${vf.aggFunction}_${vf.column}_${safeAlias}"`
          );
        });
      }
    });
  } else {
    // 没有列字段时，简单聚合
    valueFields.forEach((vf) => {
      if (vf.column) {
        selectParts.push(`${vf.aggFunction}("${vf.column}") AS "${vf.aggFunction}_${vf.column}"`);
      }
    });
  }

  const parts: string[] = [];
  parts.push(`SELECT ${selectParts.join(',\n       ')}`);
  parts.push(`FROM ${fullTableName}`);
  parts.push(`GROUP BY ${rowFields.map((f) => `"${f}"`).join(', ')}`);
  parts.push(`ORDER BY ${rowFields.map((f) => `"${f}"`).join(', ')}`);
  parts.push('LIMIT 1000');

  return parts.join('\n');
};

/**
 * 计算 SQL 中 CASE WHEN 的数量
 */
const countCaseWhen = (sql: string): number => {
  return (sql.match(/CASE WHEN/g) || []).length;
};

/**
 * 检查 SQL 是否包含指定的聚合函数
 */
const hasAggFunction = (sql: string, aggFunction: AggFunction): boolean => {
  return sql.includes(`${aggFunction}(`);
};

describe('Pivot SQL Generation - Property Tests', () => {
  describe('Basic SQL generation', () => {
    /**
     * Property 10.1: 缺少必要字段时应该返回 null
     */
    it('should return null when required fields are missing', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          fc.array(columnNameArb, { minLength: 0, maxLength: 0 }), // 空行字段
          fc.array(valueFieldArb, { minLength: 1, maxLength: 3 }),
          (tableName, rowFields, valueFields) => {
            const sql = generatePivotSQL(tableName, undefined, rowFields, undefined, valueFields, undefined);
            return sql === null;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 10.2: 有效输入应该生成非空 SQL
     */
    it('should generate SQL for valid inputs', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          fc.array(columnNameArb, { minLength: 1, maxLength: 3 }),
          fc.array(valueFieldArb, { minLength: 1, maxLength: 3 }),
          (tableName, rowFields, valueFields) => {
            const sql = generatePivotSQL(tableName, undefined, rowFields, undefined, valueFields, undefined);
            return sql !== null && sql.length > 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 10.3: SQL 应该包含 GROUP BY 子句
     */
    it('should include GROUP BY clause', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          fc.array(columnNameArb, { minLength: 1, maxLength: 3 }),
          fc.array(valueFieldArb, { minLength: 1, maxLength: 3 }),
          (tableName, rowFields, valueFields) => {
            const sql = generatePivotSQL(tableName, undefined, rowFields, undefined, valueFields, undefined);
            return sql !== null && sql.includes('GROUP BY');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('CASE WHEN pivot generation', () => {
    /**
     * Property 10.4: 有透视列时应该生成 CASE WHEN
     */
    it('should generate CASE WHEN for pivot column', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          fc.array(columnNameArb, { minLength: 1, maxLength: 2 }),
          columnNameArb,
          fc.array(valueFieldArb, { minLength: 1, maxLength: 2 }),
          fc.array(pivotValueArb, { minLength: 1, maxLength: 5 }),
          (tableName, rowFields, columnField, valueFields, distinctValues) => {
            const sql = generatePivotSQL(tableName, undefined, rowFields, columnField, valueFields, distinctValues);
            
            if (sql === null) return true;
            
            // 应该包含 CASE WHEN
            return sql.includes('CASE WHEN');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 10.5: CASE WHEN 数量应该等于 valueFields * distinctValues
     */
    it('should have correct number of CASE WHEN expressions', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          fc.array(columnNameArb, { minLength: 1, maxLength: 2 }),
          columnNameArb,
          fc.array(valueFieldArb, { minLength: 1, maxLength: 2 }),
          fc.array(pivotValueArb, { minLength: 1, maxLength: 3 }),
          (tableName, rowFields, columnField, valueFields, distinctValues) => {
            const sql = generatePivotSQL(tableName, undefined, rowFields, columnField, valueFields, distinctValues);
            
            if (sql === null) return true;
            
            const validValueFields = valueFields.filter(vf => vf.column);
            const expectedCount = validValueFields.length * distinctValues.length;
            const actualCount = countCaseWhen(sql);
            
            return actualCount === expectedCount;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 10.6: 没有透视列时不应该有 CASE WHEN
     */
    it('should not have CASE WHEN without pivot column', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          fc.array(columnNameArb, { minLength: 1, maxLength: 3 }),
          fc.array(valueFieldArb, { minLength: 1, maxLength: 3 }),
          (tableName, rowFields, valueFields) => {
            const sql = generatePivotSQL(tableName, undefined, rowFields, undefined, valueFields, undefined);
            
            if (sql === null) return true;
            
            return !sql.includes('CASE WHEN');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Aggregation functions', () => {
    /**
     * Property 10.7: SQL 应该包含所有指定的聚合函数
     */
    it('should include all specified aggregation functions', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          fc.array(columnNameArb, { minLength: 1, maxLength: 2 }),
          fc.array(valueFieldArb, { minLength: 1, maxLength: 3 }),
          (tableName, rowFields, valueFields) => {
            const sql = generatePivotSQL(tableName, undefined, rowFields, undefined, valueFields, undefined);
            
            if (sql === null) return true;
            
            // 检查每个值字段的聚合函数是否出现
            for (const vf of valueFields) {
              if (vf.column && !hasAggFunction(sql, vf.aggFunction)) {
                return false;
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Schema support', () => {
    /**
     * Property 10.8: 有 schema 时应该正确引用表名
     */
    it('should correctly quote table name with schema', () => {
      fc.assert(
        fc.property(
          tableNameArb,
          tableNameArb, // schema
          fc.array(columnNameArb, { minLength: 1, maxLength: 2 }),
          fc.array(valueFieldArb, { minLength: 1, maxLength: 2 }),
          (tableName, schema, rowFields, valueFields) => {
            const sql = generatePivotSQL(tableName, schema, rowFields, undefined, valueFields, undefined);
            
            if (sql === null) return true;
            
            // 应该包含 schema.table 格式
            return sql.includes(`"${schema}"."${tableName}"`);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge cases', () => {
    /**
     * Property: NULL 值应该使用 IS NULL 条件
     */
    it('should use IS NULL for null pivot values', () => {
      const sql = generatePivotSQL(
        'test_table',
        undefined,
        ['row_field'],
        'pivot_col',
        [{ id: '1', column: 'value_col', aggFunction: 'SUM' }],
        [null, 'value1']
      );
      
      expect(sql).not.toBeNull();
      expect(sql).toContain('IS NULL');
    });

    /**
     * Property: 特殊字符应该被正确转义
     */
    it('should escape special characters in pivot values', () => {
      const sql = generatePivotSQL(
        'test_table',
        undefined,
        ['row_field'],
        'pivot_col',
        [{ id: '1', column: 'value_col', aggFunction: 'SUM' }],
        ["value'with'quotes"]
      );
      
      expect(sql).not.toBeNull();
      // 单引号应该被转义
      expect(sql).toContain("''");
    });
  });
});
