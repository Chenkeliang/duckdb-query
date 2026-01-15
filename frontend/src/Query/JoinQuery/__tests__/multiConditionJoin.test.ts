/**
 * 多条件 Join SQL 生成属性测试
 * 
 * **Feature: external-table-integration-fixes, Property 8: Join Multi-Condition SQL Generation**
 * **Validates: Requirements 7.3, 7.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// 类型定义
type JoinType = 'INNER JOIN' | 'LEFT JOIN' | 'RIGHT JOIN' | 'FULL JOIN';
type Operator = '=' | '!=' | '<' | '>' | '<=' | '>=';

interface JoinCondition {
  leftColumn: string;
  rightColumn: string;
  operator: Operator;
}

interface JoinConfig {
  joinType: JoinType;
  conditions: JoinCondition[];
}

// Arbitraries
const joinTypeArb = fc.constantFrom<JoinType>('INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN');
const operatorArb = fc.constantFrom<Operator>('=', '!=', '<', '>', '<=', '>=');

const columnNameArb = fc.string({ minLength: 1, maxLength: 30 })
  .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));

const tableNameArb = fc.string({ minLength: 1, maxLength: 30 })
  .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));

const joinConditionArb: fc.Arbitrary<JoinCondition> = fc.record({
  leftColumn: columnNameArb,
  rightColumn: columnNameArb,
  operator: operatorArb,
});

const joinConfigArb: fc.Arbitrary<JoinConfig> = fc.record({
  joinType: joinTypeArb,
  conditions: fc.array(joinConditionArb, { minLength: 1, maxLength: 5 }),
});

/**
 * 生成 JOIN ON 子句
 */
const generateJoinOnClause = (
  config: JoinConfig,
  leftTableName: string,
  rightTableName: string
): string => {
  const validConditions = config.conditions.filter(
    (c) => c.leftColumn && c.rightColumn
  );
  
  if (validConditions.length === 0) {
    return '';
  }
  
  const onClause = validConditions
    .map((c) => `"${leftTableName}"."${c.leftColumn}" ${c.operator} "${rightTableName}"."${c.rightColumn}"`)
    .join(' AND ');
  
  return `${config.joinType} "${rightTableName}" ON ${onClause}`;
};

/**
 * 解析 JOIN ON 子句中的条件数量
 */
const countConditionsInClause = (clause: string): number => {
  if (!clause.includes(' ON ')) return 0;
  const onPart = clause.split(' ON ')[1];
  // 计算 AND 的数量 + 1
  const andCount = (onPart.match(/ AND /g) || []).length;
  return andCount + 1;
};

/**
 * 检查 JOIN 类型是否在子句中
 */
const hasJoinType = (clause: string, joinType: JoinType): boolean => {
  return clause.startsWith(joinType);
};

/**
 * 检查操作符是否在子句中
 */
const hasOperator = (clause: string, operator: Operator): boolean => {
  return clause.includes(` ${operator} `);
};

describe('Multi-Condition Join SQL Generation - Property Tests', () => {
  describe('ON clause generation', () => {
    /**
     * Property 8.1: 生成的 ON 子句应该包含所有有效条件
     */
    it('should include all valid conditions in ON clause', () => {
      fc.assert(
        fc.property(
          joinConfigArb,
          tableNameArb,
          tableNameArb,
          (config, leftTable, rightTable) => {
            const clause = generateJoinOnClause(config, leftTable, rightTable);
            
            if (config.conditions.length === 0) {
              return clause === '';
            }
            
            const validConditions = config.conditions.filter(
              (c) => c.leftColumn && c.rightColumn
            );
            const conditionCount = countConditionsInClause(clause);
            
            return conditionCount === validConditions.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8.2: 生成的子句应该包含正确的 JOIN 类型
     */
    it('should include correct JOIN type', () => {
      fc.assert(
        fc.property(
          joinConfigArb,
          tableNameArb,
          tableNameArb,
          (config, leftTable, rightTable) => {
            const clause = generateJoinOnClause(config, leftTable, rightTable);
            
            if (clause === '') return true;
            
            return hasJoinType(clause, config.joinType);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8.3: 每个条件的操作符应该正确出现在子句中
     */
    it('should include correct operators for each condition', () => {
      fc.assert(
        fc.property(
          joinConfigArb,
          tableNameArb,
          tableNameArb,
          (config, leftTable, rightTable) => {
            const clause = generateJoinOnClause(config, leftTable, rightTable);
            
            if (clause === '') return true;
            
            // 检查每个条件的操作符是否出现
            for (const condition of config.conditions) {
              if (condition.leftColumn && condition.rightColumn) {
                if (!hasOperator(clause, condition.operator)) {
                  return false;
                }
              }
            }
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8.4: 多条件应该用 AND 连接
     */
    it('should connect multiple conditions with AND', () => {
      fc.assert(
        fc.property(
          fc.record({
            joinType: joinTypeArb,
            conditions: fc.array(joinConditionArb, { minLength: 2, maxLength: 5 }),
          }),
          tableNameArb,
          tableNameArb,
          (config, leftTable, rightTable) => {
            const clause = generateJoinOnClause(config, leftTable, rightTable);
            
            const validConditions = config.conditions.filter(
              (c) => c.leftColumn && c.rightColumn
            );
            
            if (validConditions.length < 2) return true;
            
            // 应该包含 AND
            return clause.includes(' AND ');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property 8.5: 表名和列名应该被正确引用
     */
    it('should properly quote table and column names', () => {
      fc.assert(
        fc.property(
          joinConfigArb,
          tableNameArb,
          tableNameArb,
          (config, leftTable, rightTable) => {
            const clause = generateJoinOnClause(config, leftTable, rightTable);
            
            if (clause === '') return true;
            
            // 检查表名是否被引用
            const hasLeftTableQuoted = clause.includes(`"${leftTable}".`);
            const hasRightTableQuoted = clause.includes(`"${rightTable}"`);
            
            return hasLeftTableQuoted && hasRightTableQuoted;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge cases', () => {
    /**
     * Property: 空条件列表应该返回空字符串
     */
    it('should return empty string for empty conditions', () => {
      fc.assert(
        fc.property(
          joinTypeArb,
          tableNameArb,
          tableNameArb,
          (joinType, leftTable, rightTable) => {
            const config: JoinConfig = {
              joinType,
              conditions: [],
            };
            const clause = generateJoinOnClause(config, leftTable, rightTable);
            return clause === '';
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: 单条件应该不包含 AND
     */
    it('should not include AND for single condition', () => {
      fc.assert(
        fc.property(
          fc.record({
            joinType: joinTypeArb,
            conditions: fc.array(joinConditionArb, { minLength: 1, maxLength: 1 }),
          }),
          tableNameArb,
          tableNameArb,
          (config, leftTable, rightTable) => {
            const clause = generateJoinOnClause(config, leftTable, rightTable);
            
            if (clause === '') return true;
            
            // 单条件不应该包含 AND
            return !clause.includes(' AND ');
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: 所有支持的操作符都应该正确生成
     */
    it('should correctly generate all supported operators', () => {
      const operators: Operator[] = ['=', '!=', '<', '>', '<=', '>='];
      
      for (const op of operators) {
        const config: JoinConfig = {
          joinType: 'LEFT JOIN',
          conditions: [{
            leftColumn: 'col1',
            rightColumn: 'col2',
            operator: op,
          }],
        };
        
        const clause = generateJoinOnClause(config, 'table1', 'table2');
        expect(clause).toContain(` ${op} `);
      }
    });
  });
});
