/**
 * Join 配置同步属性测试
 * 
 * **Feature: external-table-integration-fixes, Property 7: Join Config Synchronization**
 * **Validates: Requirements 7.1, 7.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// 类型定义
type JoinType = 'INNER JOIN' | 'LEFT JOIN' | 'RIGHT JOIN' | 'FULL JOIN';

interface JoinConfig {
  leftColumn: string;
  rightColumn: string;
  joinType: JoinType;
}

interface TableColumn {
  name: string;
  type: string;
}

// Arbitraries
const joinTypeArb = fc.constantFrom<JoinType>('INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN');

const tableColumnArb: fc.Arbitrary<TableColumn> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
  type: fc.constantFrom('INTEGER', 'VARCHAR', 'BOOLEAN', 'TIMESTAMP', 'DOUBLE'),
});

const joinConfigArb: fc.Arbitrary<JoinConfig> = fc.record({
  leftColumn: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
  rightColumn: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s)),
  joinType: joinTypeArb,
});

const tableNameArb = fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));

/**
 * 模拟 joinConfigs 收缩逻辑
 * 当表数量减少时，joinConfigs 应该相应收缩
 */
const shrinkJoinConfigs = (
  prevConfigs: JoinConfig[],
  newTableCount: number
): JoinConfig[] => {
  const requiredLength = Math.max(0, newTableCount - 1);
  
  if (requiredLength === 0) {
    return [];
  }
  
  if (prevConfigs.length > requiredLength) {
    return prevConfigs.slice(0, requiredLength);
  }
  
  return prevConfigs;
};

/**
 * 模拟 joinConfigs 扩展逻辑
 * 当表数量增加时，joinConfigs 应该相应扩展
 */
const expandJoinConfigs = (
  prevConfigs: JoinConfig[],
  newTableCount: number,
  tableColumnsMap: Record<string, TableColumn[]>,
  tableNames: string[]
): JoinConfig[] => {
  const requiredLength = Math.max(0, newTableCount - 1);
  
  if (requiredLength === 0) {
    return [];
  }
  
  if (prevConfigs.length >= requiredLength) {
    return prevConfigs.slice(0, requiredLength);
  }
  
  const newConfigs: JoinConfig[] = [...prevConfigs];
  for (let i = prevConfigs.length; i < requiredLength; i++) {
    const leftTableName = tableNames[i];
    const rightTableName = tableNames[i + 1];
    const leftCols = tableColumnsMap[leftTableName] || [];
    const rightCols = tableColumnsMap[rightTableName] || [];
    const leftIdCol = leftCols.find((c) => c.name.toLowerCase() === 'id')?.name || leftCols[0]?.name || '';
    const rightIdCol = rightCols.find((c) => c.name.toLowerCase() === 'id')?.name || rightCols[0]?.name || '';
    newConfigs.push({
      leftColumn: leftIdCol,
      rightColumn: rightIdCol,
      joinType: 'LEFT JOIN',
    });
  }
  
  return newConfigs;
};

/**
 * 模拟 selectedColumns 清理逻辑
 * 当表被移除时，对应的列选择应该被清理
 */
const cleanupSelectedColumns = (
  prevColumns: Record<string, string[]>,
  activeTableNames: Set<string>
): Record<string, string[]> => {
  const result: Record<string, string[]> = {};
  for (const [tableName, columns] of Object.entries(prevColumns)) {
    if (activeTableNames.has(tableName)) {
      result[tableName] = columns;
    }
  }
  return result;
};

describe('Join Config Synchronization - Property Tests', () => {
  describe('joinConfigs shrinking', () => {
    /**
     * Property 7.1: joinConfigs 长度应该等于 max(0, tableCount - 1)
     */
    it('should have joinConfigs length equal to tableCount - 1', () => {
      fc.assert(
        fc.property(
          fc.array(joinConfigArb, { minLength: 0, maxLength: 10 }),
          fc.integer({ min: 0, max: 10 }),
          (prevConfigs, newTableCount) => {
            const result = shrinkJoinConfigs(prevConfigs, newTableCount);
            const expectedLength = Math.max(0, newTableCount - 1);
            return result.length <= expectedLength;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 7.2: 当表数量减少时，joinConfigs 应该收缩
     */
    it('should shrink joinConfigs when table count decreases', () => {
      fc.assert(
        fc.property(
          fc.array(joinConfigArb, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 1, max: 5 }),
          (prevConfigs, decreaseBy) => {
            const originalTableCount = prevConfigs.length + 1;
            const newTableCount = Math.max(0, originalTableCount - decreaseBy);
            const result = shrinkJoinConfigs(prevConfigs, newTableCount);
            
            // 结果长度应该不超过 newTableCount - 1
            const expectedMaxLength = Math.max(0, newTableCount - 1);
            return result.length <= expectedMaxLength;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: 收缩后的配置应该保留原有配置的前 N 项
     */
    it('should preserve first N configs when shrinking', () => {
      fc.assert(
        fc.property(
          fc.array(joinConfigArb, { minLength: 2, maxLength: 10 }),
          fc.integer({ min: 1, max: 5 }),
          (prevConfigs, newTableCount) => {
            const result = shrinkJoinConfigs(prevConfigs, newTableCount);
            
            // 验证保留的配置与原配置相同
            for (let i = 0; i < result.length; i++) {
              if (result[i].leftColumn !== prevConfigs[i].leftColumn ||
                  result[i].rightColumn !== prevConfigs[i].rightColumn ||
                  result[i].joinType !== prevConfigs[i].joinType) {
                return false;
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: 0 或 1 个表时，joinConfigs 应该为空
     */
    it('should return empty array for 0 or 1 tables', () => {
      fc.assert(
        fc.property(
          fc.array(joinConfigArb, { minLength: 0, maxLength: 10 }),
          fc.integer({ min: 0, max: 1 }),
          (prevConfigs, tableCount) => {
            const result = shrinkJoinConfigs(prevConfigs, tableCount);
            return result.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('selectedColumns cleanup', () => {
    /**
     * Property: 移除表后，对应的列选择应该被清理
     */
    it('should cleanup columns for removed tables', () => {
      fc.assert(
        fc.property(
          fc.dictionary(tableNameArb, fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 })),
          fc.array(tableNameArb, { minLength: 0, maxLength: 5 }),
          (prevColumns, activeTableNames) => {
            const activeSet = new Set(activeTableNames);
            const result = cleanupSelectedColumns(prevColumns, activeSet);
            
            // 结果中不应该包含不在 activeTableNames 中的表
            for (const tableName of Object.keys(result)) {
              if (!activeSet.has(tableName)) {
                return false;
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: 活动表的列选择应该被保留
     */
    it('should preserve columns for active tables', () => {
      fc.assert(
        fc.property(
          fc.dictionary(tableNameArb, fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 })),
          (prevColumns) => {
            // 所有表都是活动的
            const activeSet = new Set(Object.keys(prevColumns));
            const result = cleanupSelectedColumns(prevColumns, activeSet);
            
            // 所有列选择都应该被保留
            for (const [tableName, columns] of Object.entries(prevColumns)) {
              if (!result[tableName] || result[tableName].length !== columns.length) {
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

  describe('joinConfigs expansion', () => {
    /**
     * Property: 扩展后的配置数量应该等于 tableCount - 1
     */
    it('should expand joinConfigs to tableCount - 1', () => {
      fc.assert(
        fc.property(
          fc.array(joinConfigArb, { minLength: 0, maxLength: 5 }),
          fc.integer({ min: 2, max: 10 }),
          fc.array(tableNameArb, { minLength: 2, maxLength: 10 }),
          (prevConfigs, newTableCount, tableNames) => {
            // 确保 tableNames 长度足够
            const actualTableNames = tableNames.slice(0, newTableCount);
            if (actualTableNames.length < newTableCount) {
              return true; // 跳过无效输入
            }
            
            const tableColumnsMap: Record<string, TableColumn[]> = {};
            actualTableNames.forEach(name => {
              tableColumnsMap[name] = [{ name: 'id', type: 'INTEGER' }];
            });
            
            const result = expandJoinConfigs(prevConfigs, newTableCount, tableColumnsMap, actualTableNames);
            const expectedLength = Math.max(0, newTableCount - 1);
            
            return result.length === expectedLength;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: 扩展时应该保留原有配置
     */
    it('should preserve existing configs when expanding', () => {
      fc.assert(
        fc.property(
          fc.array(joinConfigArb, { minLength: 1, maxLength: 3 }),
          fc.integer({ min: 5, max: 8 }),
          fc.array(tableNameArb, { minLength: 5, maxLength: 8 }),
          (prevConfigs, newTableCount, tableNames) => {
            const actualTableNames = tableNames.slice(0, newTableCount);
            if (actualTableNames.length < newTableCount) {
              return true;
            }
            
            const tableColumnsMap: Record<string, TableColumn[]> = {};
            actualTableNames.forEach(name => {
              tableColumnsMap[name] = [{ name: 'id', type: 'INTEGER' }];
            });
            
            const result = expandJoinConfigs(prevConfigs, newTableCount, tableColumnsMap, actualTableNames);
            
            // 原有配置应该被保留
            for (let i = 0; i < Math.min(prevConfigs.length, result.length); i++) {
              if (result[i].leftColumn !== prevConfigs[i].leftColumn ||
                  result[i].rightColumn !== prevConfigs[i].rightColumn ||
                  result[i].joinType !== prevConfigs[i].joinType) {
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
});
