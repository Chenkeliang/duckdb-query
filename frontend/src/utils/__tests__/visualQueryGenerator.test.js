/**
 * Unit tests for visual query generator utilities
 */

import {
  generateSQLPreview,
  validateVisualQueryConfig,
  buildSelectClause,
  buildWhereClause,
  buildOrderByClause,
  buildGroupByClause
} from '../visualQueryGenerator';

describe('Visual Query Generator', () => {
  
  describe('generateSQLPreview', () => {
    it('generates basic SELECT * query', () => {
      const config = {
        tableName: 'test_table',
        selectedColumns: [],
        aggregations: [],
        filters: [],
        orderBy: [],
        isDistinct: false
      };
      
      const result = generateSQLPreview(config, 'test_table');
      
      expect(result.success).toBe(true);
      expect(result.sql).toBe('SELECT * FROM "test_table"');
      expect(result.errors).toHaveLength(0);
    });

    it('generates SELECT with specific columns', () => {
      const config = {
        tableName: 'test_table',
        selectedColumns: ['name', 'age', 'email'],
        aggregations: [],
        filters: [],
        orderBy: [],
        isDistinct: false
      };
      
      const result = generateSQLPreview(config, 'test_table');
      
      expect(result.success).toBe(true);
      expect(result.sql).toContain('SELECT "name", "age", "email"');
      expect(result.sql).toContain('FROM "test_table"');
    });

    it('generates SELECT DISTINCT query', () => {
      const config = {
        tableName: 'test_table',
        selectedColumns: ['category'],
        aggregations: [],
        filters: [],
        orderBy: [],
        isDistinct: true
      };
      
      const result = generateSQLPreview(config, 'test_table');
      
      expect(result.success).toBe(true);
      expect(result.sql).toContain('SELECT DISTINCT "category"');
    });

    it('generates query with aggregations', () => {
      const config = {
        tableName: 'sales',
        selectedColumns: ['region'],
        aggregations: [
          { column: 'amount', function: 'SUM', alias: 'total_amount' },
          { column: 'order_id', function: 'COUNT', alias: 'order_count' }
        ],
        filters: [],
        orderBy: [],
        groupBy: ['region']
      };
      
      const result = generateSQLPreview(config, 'sales');
      
      expect(result.success).toBe(true);
      expect(result.sql).toContain('SUM("amount") AS "total_amount"');
      expect(result.sql).toContain('COUNT("order_id") AS "order_count"');
      expect(result.sql).toContain('GROUP BY "region"');
    });

    it('generates query with filters', () => {
      const config = {
        tableName: 'users',
        selectedColumns: ['name', 'age'],
        aggregations: [],
        filters: [
          { column: 'status', operator: '=', value: 'active', logicOperator: 'AND' },
          { column: 'age', operator: '>', value: 18, logicOperator: 'AND' }
        ],
        orderBy: []
      };
      
      const result = generateSQLPreview(config, 'users');
      
      expect(result.success).toBe(true);
      expect(result.sql).toContain('WHERE "status" = \'active\'');
      expect(result.sql).toContain('AND "age" > 18');
    });

    it('generates query with sorting and limit', () => {
      const config = {
        tableName: 'products',
        selectedColumns: ['name', 'price'],
        aggregations: [],
        filters: [],
        orderBy: [
          { column: 'price', direction: 'DESC', priority: 0 },
          { column: 'name', direction: 'ASC', priority: 1 }
        ],
        limit: 50
      };
      
      const result = generateSQLPreview(config, 'products');
      
      expect(result.success).toBe(true);
      expect(result.sql).toContain('ORDER BY "price" DESC, "name" ASC');
      expect(result.sql).toContain('LIMIT 50');
    });

    it('handles complex query with all features', () => {
      const config = {
        tableName: 'sales_data',
        selectedColumns: ['region', 'product_category'],
        aggregations: [
          { column: 'sales_amount', function: 'SUM', alias: 'total_sales' }
        ],
        filters: [
          { column: 'order_date', operator: '>=', value: '2023-01-01', logicOperator: 'AND' },
          { column: 'status', operator: '=', value: 'completed', logicOperator: 'AND' }
        ],
        orderBy: [
          { column: 'total_sales', direction: 'DESC', priority: 0 }
        ],
        groupBy: ['region', 'product_category'],
        limit: 100,
        isDistinct: false
      };
      
      const result = generateSQLPreview(config, 'sales_data');
      
      expect(result.success).toBe(true);
      expect(result.sql).toContain('SELECT "region", "product_category"');
      expect(result.sql).toContain('SUM("sales_amount") AS "total_sales"');
      expect(result.sql).toContain('WHERE "order_date" >= \'2023-01-01\'');
      expect(result.sql).toContain('AND "status" = \'completed\'');
      expect(result.sql).toContain('GROUP BY "region", "product_category"');
      expect(result.sql).toContain('ORDER BY "total_sales" DESC');
      expect(result.sql).toContain('LIMIT 100');
    });

    it('handles errors gracefully', () => {
      const config = null; // Invalid config
      
      const result = generateSQLPreview(config, 'test_table');
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.sql).toBe('');
    });
  });

  describe('validateVisualQueryConfig', () => {
    it('validates valid configuration', () => {
      const config = {
        tableName: 'test_table',
        selectedColumns: ['col1', 'col2'],
        aggregations: [
          { column: 'amount', function: 'SUM' }
        ],
        filters: [
          { column: 'status', operator: '=', value: 'active' }
        ],
        orderBy: [
          { column: 'col1', direction: 'ASC' }
        ]
      };
      
      const result = validateVisualQueryConfig(config);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects empty table name', () => {
      const config = {
        tableName: '',
        selectedColumns: ['col1'],
        aggregations: [],
        filters: [],
        orderBy: []
      };
      
      const result = validateVisualQueryConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('表名不能为空');
    });

    it('detects invalid aggregation', () => {
      const config = {
        tableName: 'test_table',
        selectedColumns: ['col1'],
        aggregations: [
          { column: '', function: 'SUM' } // Empty column
        ],
        filters: [],
        orderBy: []
      };
      
      const result = validateVisualQueryConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('聚合函数必须指定列名');
    });

    it('detects invalid filter', () => {
      const config = {
        tableName: 'test_table',
        selectedColumns: ['col1'],
        aggregations: [],
        filters: [
          { column: 'status', operator: '=', value: null } // Missing value
        ],
        orderBy: []
      };
      
      const result = validateVisualQueryConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('筛选条件需要指定值');
    });

    it('validates BETWEEN operator', () => {
      const config = {
        tableName: 'test_table',
        selectedColumns: ['col1'],
        aggregations: [],
        filters: [
          { column: 'age', operator: 'BETWEEN', value: 18, value2: null } // Missing second value
        ],
        orderBy: []
      };
      
      const result = validateVisualQueryConfig(config);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('BETWEEN操作符需要指定两个值');
    });

    it('generates performance warnings', () => {
      const config = {
        tableName: 'test_table',
        selectedColumns: ['col1'],
        aggregations: Array.from({ length: 6 }, (_, i) => ({
          column: `col${i}`,
          function: 'SUM'
        })), // Too many aggregations
        filters: [],
        orderBy: []
      };
      
      const result = validateVisualQueryConfig(config);
      
      expect(result.warnings).toContain('聚合函数过多可能影响查询性能');
    });
  });

  describe('buildSelectClause', () => {
    it('builds SELECT * for empty columns', () => {
      const config = {
        selectedColumns: [],
        aggregations: [],
        isDistinct: false
      };
      
      const result = buildSelectClause(config);
      
      expect(result).toBe('SELECT *');
    });

    it('builds SELECT with specific columns', () => {
      const config = {
        selectedColumns: ['name', 'age'],
        aggregations: [],
        isDistinct: false
      };
      
      const result = buildSelectClause(config);
      
      expect(result).toBe('SELECT "name", "age"');
    });

    it('builds SELECT DISTINCT', () => {
      const config = {
        selectedColumns: ['category'],
        aggregations: [],
        isDistinct: true
      };
      
      const result = buildSelectClause(config);
      
      expect(result).toBe('SELECT DISTINCT "category"');
    });

    it('builds SELECT with aggregations', () => {
      const config = {
        selectedColumns: ['region'],
        aggregations: [
          { column: 'amount', function: 'SUM', alias: 'total' }
        ],
        isDistinct: false
      };
      
      const result = buildSelectClause(config);
      
      expect(result).toContain('"region"');
      expect(result).toContain('SUM("amount") AS "total"');
    });
  });

  describe('buildWhereClause', () => {
    it('returns empty string for no filters', () => {
      const result = buildWhereClause([]);
      
      expect(result).toBe('');
    });

    it('builds single filter condition', () => {
      const filters = [
        { column: 'status', operator: '=', value: 'active' }
      ];
      
      const result = buildWhereClause(filters);
      
      expect(result).toBe('WHERE "status" = \'active\'');
    });

    it('builds multiple filter conditions with AND', () => {
      const filters = [
        { column: 'status', operator: '=', value: 'active' },
        { column: 'age', operator: '>', value: 18, logicOperator: 'AND' }
      ];
      
      const result = buildWhereClause(filters);
      
      expect(result).toBe('WHERE "status" = \'active\' AND "age" > 18');
    });

    it('builds multiple filter conditions with OR', () => {
      const filters = [
        { column: 'status', operator: '=', value: 'active' },
        { column: 'status', operator: '=', value: 'pending', logicOperator: 'OR' }
      ];
      
      const result = buildWhereClause(filters);
      
      expect(result).toBe('WHERE "status" = \'active\' OR "status" = \'pending\'');
    });

    it('handles LIKE operator', () => {
      const filters = [
        { column: 'name', operator: 'LIKE', value: 'John%' }
      ];
      
      const result = buildWhereClause(filters);
      
      expect(result).toBe('WHERE "name" LIKE \'John%\'');
    });

    it('handles BETWEEN operator', () => {
      const filters = [
        { column: 'age', operator: 'BETWEEN', value: 18, value2: 65 }
      ];
      
      const result = buildWhereClause(filters);
      
      expect(result).toBe('WHERE "age" BETWEEN 18 AND 65');
    });

    it('handles IS NULL operator', () => {
      const filters = [
        { column: 'deleted_at', operator: 'IS NULL' }
      ];
      
      const result = buildWhereClause(filters);
      
      expect(result).toBe('WHERE "deleted_at" IS NULL');
    });
  });

  describe('buildOrderByClause', () => {
    it('returns empty string for no sorting', () => {
      const result = buildOrderByClause([]);
      
      expect(result).toBe('');
    });

    it('builds single column sorting', () => {
      const orderBy = [
        { column: 'name', direction: 'ASC', priority: 0 }
      ];
      
      const result = buildOrderByClause(orderBy);
      
      expect(result).toBe('ORDER BY "name" ASC');
    });

    it('builds multiple column sorting with priority', () => {
      const orderBy = [
        { column: 'age', direction: 'DESC', priority: 1 },
        { column: 'name', direction: 'ASC', priority: 0 }
      ];
      
      const result = buildOrderByClause(orderBy);
      
      // Should be sorted by priority (name first, then age)
      expect(result).toBe('ORDER BY "name" ASC, "age" DESC');
    });
  });

  describe('buildGroupByClause', () => {
    it('returns empty string for no grouping', () => {
      const config = {
        groupBy: [],
        aggregations: [],
        selectedColumns: []
      };
      
      const result = buildGroupByClause(config);
      
      expect(result).toBe('');
    });

    it('builds GROUP BY with explicit columns', () => {
      const config = {
        groupBy: ['region', 'category'],
        aggregations: [],
        selectedColumns: []
      };
      
      const result = buildGroupByClause(config);
      
      expect(result).toBe('GROUP BY "region", "category"');
    });

    it('auto-generates GROUP BY from selected columns when aggregations exist', () => {
      const config = {
        groupBy: [],
        aggregations: [{ column: 'amount', function: 'SUM' }],
        selectedColumns: ['region', 'category']
      };
      
      const result = buildGroupByClause(config);
      
      expect(result).toBe('GROUP BY "region", "category"');
    });
  });

  describe('Edge Cases', () => {
    it('handles special characters in column names', () => {
      const config = {
        tableName: 'test_table',
        selectedColumns: ['column with spaces', 'column-with-dashes'],
        aggregations: [],
        filters: [],
        orderBy: []
      };
      
      const result = generateSQLPreview(config, 'test_table');
      
      expect(result.success).toBe(true);
      expect(result.sql).toContain('"column with spaces"');
      expect(result.sql).toContain('"column-with-dashes"');
    });

    it('handles numeric values in filters', () => {
      const config = {
        tableName: 'test_table',
        selectedColumns: ['*'],
        aggregations: [],
        filters: [
          { column: 'price', operator: '>', value: 100.50 }
        ],
        orderBy: []
      };
      
      const result = generateSQLPreview(config, 'test_table');
      
      expect(result.success).toBe(true);
      expect(result.sql).toContain('"price" > 100.5');
    });

    it('handles empty string values in filters', () => {
      const config = {
        tableName: 'test_table',
        selectedColumns: ['*'],
        aggregations: [],
        filters: [
          { column: 'description', operator: '=', value: '' }
        ],
        orderBy: []
      };
      
      const result = generateSQLPreview(config, 'test_table');
      
      expect(result.success).toBe(true);
      expect(result.sql).toContain('"description" = \'\'');
    });
  });
});