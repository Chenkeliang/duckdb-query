/**
 * 集合操作列一致性验证属性测试
 * 
 * **Feature: external-table-integration-fixes, Property 9: Set Operations Column Validation**
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// 类型定义
interface ColumnValidationResult {
  isValid: boolean;
  message: string | null;
}

// Arbitraries
const columnNameArb = fc.string({ minLength: 1, maxLength: 30 })
  .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));

const tableNameArb = fc.string({ minLength: 1, maxLength: 30 })
  .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));

/**
 * 验证列一致性
 * 集合操作要求所有表的选中列数量一致
 */
const validateColumnConsistency = (
  tableNames: string[],
  selectedColumns: Record<string, string[]>
): ColumnValidationResult => {
  if (tableNames.length < 2) {
    return { isValid: true, message: null };
  }

  // 获取每个表的选中列
  const tableColumnLists = tableNames.map((tableName) => {
    return selectedColumns[tableName] || [];
  });

  // 以第一个表的列作为基准
  const baseColumns = tableColumnLists[0];
  const baseCount = baseColumns.length;

  // 检查所有表的列数量是否一致
  for (let i = 1; i < tableColumnLists.length; i++) {
    const currentColumns = tableColumnLists[i];
    if (currentColumns.length !== baseCount) {
      return {
        isValid: false,
        message: `表 ${i + 1} 的选中列数量 (${currentColumns.length}) 与第一个表 (${baseCount}) 不一致`,
      };
    }
  }

  return { isValid: true, message: null };
};

/**
 * 检查是否可以执行集合操作
 */
const canExecuteSetOperation = (
  tableCount: number,
  columnValidation: ColumnValidationResult,
  hasMixedSources: boolean,
  hasExternalWithDifferentConnections: boolean
): boolean => {
  if (tableCount < 2) return false;
  if (hasMixedSources) return false;
  if (hasExternalWithDifferentConnections) return false;
  if (!columnValidation.isValid) return false;
  return true;
};

describe('Set Operations Column Validation - Property Tests', () => {
  describe('Column consistency validation', () => {
    /**
     * Property 9.1: 单表或空表应该总是有效
     */
    it('should be valid for single table or no tables', () => {
      fc.assert(
        fc.property(
          fc.array(tableNameArb, { minLength: 0, maxLength: 1 }),
          fc.dictionary(tableNameArb, fc.array(columnNameArb, { minLength: 0, maxLength: 10 })),
          (tableNames, selectedColumns) => {
            const result = validateColumnConsistency(tableNames, selectedColumns);
            return result.isValid === true && result.message === null;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 9.2: 所有表选中相同数量的列时应该有效
     */
    it('should be valid when all tables have same column count', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 5 }),
          fc.integer({ min: 1, max: 10 }),
          (tableCount, columnCount) => {
            const tableNames: string[] = [];
            const selectedColumns: Record<string, string[]> = {};
            
            for (let i = 0; i < tableCount; i++) {
              const tableName = `table_${i}`;
              tableNames.push(tableName);
              selectedColumns[tableName] = Array.from(
                { length: columnCount },
                (_, j) => `col_${j}`
              );
            }
            
            const result = validateColumnConsistency(tableNames, selectedColumns);
            return result.isValid === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 9.3: 列数量不一致时应该无效
     */
    it('should be invalid when column counts differ', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 5 }),
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1, max: 10 }),
          (tableCount, baseColumnCount, differentColumnCount) => {
            // 确保列数量不同
            if (baseColumnCount === differentColumnCount) {
              return true; // 跳过相同的情况
            }
            
            const tableNames: string[] = [];
            const selectedColumns: Record<string, string[]> = {};
            
            for (let i = 0; i < tableCount; i++) {
              const tableName = `table_${i}`;
              tableNames.push(tableName);
              // 第一个表使用 baseColumnCount，其他表使用 differentColumnCount
              const count = i === 0 ? baseColumnCount : differentColumnCount;
              selectedColumns[tableName] = Array.from(
                { length: count },
                (_, j) => `col_${j}`
              );
            }
            
            const result = validateColumnConsistency(tableNames, selectedColumns);
            return result.isValid === false && result.message !== null;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 9.4: 错误消息应该包含列数量信息
     */
    it('should include column count info in error message', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 1, max: 10 }),
          (baseCount, differentCount) => {
            if (baseCount === differentCount) return true;
            
            const tableNames = ['table_1', 'table_2'];
            const selectedColumns: Record<string, string[]> = {
              table_1: Array.from({ length: baseCount }, (_, j) => `col_${j}`),
              table_2: Array.from({ length: differentCount }, (_, j) => `col_${j}`),
            };
            
            const result = validateColumnConsistency(tableNames, selectedColumns);
            
            if (!result.isValid && result.message) {
              // 消息应该包含列数量
              return result.message.includes(String(baseCount)) && 
                     result.message.includes(String(differentCount));
            }
            return false;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Execution eligibility', () => {
    /**
     * Property: 少于 2 个表时不能执行
     */
    it('should not execute with less than 2 tables', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1 }),
          (tableCount) => {
            const validation: ColumnValidationResult = { isValid: true, message: null };
            const result = canExecuteSetOperation(tableCount, validation, false, false);
            return result === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: 列验证失败时不能执行
     */
    it('should not execute when column validation fails', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 10 }),
          fc.string({ minLength: 1, maxLength: 100 }),
          (tableCount, errorMessage) => {
            const validation: ColumnValidationResult = { 
              isValid: false, 
              message: errorMessage 
            };
            const result = canExecuteSetOperation(tableCount, validation, false, false);
            return result === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: 混合数据源时不能执行
     */
    it('should not execute with mixed sources', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 10 }),
          (tableCount) => {
            const validation: ColumnValidationResult = { isValid: true, message: null };
            const result = canExecuteSetOperation(tableCount, validation, true, false);
            return result === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: 所有条件满足时可以执行
     */
    it('should execute when all conditions are met', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 10 }),
          (tableCount) => {
            const validation: ColumnValidationResult = { isValid: true, message: null };
            const result = canExecuteSetOperation(tableCount, validation, false, false);
            return result === true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge cases', () => {
    /**
     * Property: 空列选择应该被视为有效（0 列一致）
     */
    it('should handle empty column selections consistently', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 2, max: 5 }),
          (tableCount) => {
            const tableNames: string[] = [];
            const selectedColumns: Record<string, string[]> = {};
            
            for (let i = 0; i < tableCount; i++) {
              const tableName = `table_${i}`;
              tableNames.push(tableName);
              selectedColumns[tableName] = []; // 空列选择
            }
            
            const result = validateColumnConsistency(tableNames, selectedColumns);
            // 所有表都是 0 列，应该一致
            return result.isValid === true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: 缺失的表应该被视为 0 列
     */
    it('should treat missing tables as 0 columns', () => {
      const tableNames = ['table_1', 'table_2'];
      const selectedColumns: Record<string, string[]> = {
        table_1: ['col_1', 'col_2'],
        // table_2 缺失
      };
      
      const result = validateColumnConsistency(tableNames, selectedColumns);
      // table_1 有 2 列，table_2 有 0 列，应该不一致
      expect(result.isValid).toBe(false);
    });
  });
});
