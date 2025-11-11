import { transformVisualConfigForApi, FilterValueType, generateSQLPreview } from '../visualQueryUtils';

describe('visualQueryUtils', () => {
  describe('transformVisualConfigForApi', () => {
    it('serializes filters and having with value types and companions', () => {
      const config = {
        tableName: 'sales_orders',
        filters: [
          {
            column: 'region',
            operator: '=',
            value: 'APAC',
            logicOperator: 'AND',
            valueType: FilterValueType.CONSTANT,
            columnType: 'string'
          },
          {
            column: 'amount',
            operator: '>',
            logicOperator: 'AND',
            valueType: FilterValueType.COLUMN,
            rightColumn: 'target_amount',
            columnType: 'number',
            rightColumnType: 'number'
          },
        ],
        having: [
          {
            column: 'SUM(amount)',
            operator: '>',
            value: 1000,
            logicOperator: 'AND',
            valueType: FilterValueType.CONSTANT,
            columnType: 'number'
          },
          {
            column: 'AVG(discount)',
            operator: '!=',
            logicOperator: 'AND',
            valueType: FilterValueType.EXPRESSION,
            expression: '"threshold_discount"',
            columnType: 'number'
          },
        ],
        aggregations: [],
        calculatedFields: [],
        conditionalFields: [],
        orderBy: [],
        groupBy: [],
        limit: null,
      };

      const result = transformVisualConfigForApi(config, config.tableName);

      expect(result.table_name).toBe('sales_orders');
      expect(result.filters).toHaveLength(2);
      expect(result.having).toHaveLength(2);

      const columnFilter = result.filters[1];
      expect(columnFilter.value_type).toBe(FilterValueType.COLUMN);
      expect(columnFilter.right_column).toBe('target_amount');
      expect(columnFilter.value).toBeNull();
      expect(columnFilter.value2).toBeNull();
      expect(columnFilter.column_type).toBe('number');
      expect(columnFilter.right_column_type).toBe('number');

      const constantHaving = result.having[0];
      expect(constantHaving.value_type).toBe(FilterValueType.CONSTANT);
      expect(constantHaving.value).toBe(1000);
      expect(constantHaving.column_type).toBe('number');

      const expressionHaving = result.having[1];
      expect(expressionHaving.value_type).toBe(FilterValueType.EXPRESSION);
      expect(expressionHaving.expression).toBe('"threshold_discount"');
      expect(expressionHaving.column_type).toBe('number');
    });
  });

  describe('generateSQLPreview (utils)', () => {
    it('renders column vs column comparison in WHERE clause', () => {
      const config = {
        tableName: 'orders',
        selectedColumns: [],
        aggregations: [],
        filters: [
          {
            column: 'left_amount',
            operator: '=',
            logicOperator: 'AND',
            valueType: FilterValueType.COLUMN,
            rightColumn: 'right_amount',
            columnType: 'number',
            rightColumnType: 'number',
          },
        ],
        having: [],
        orderBy: [],
        groupBy: [],
        limit: null,
        isDistinct: false,
      };

      const columns = [
        { name: 'left_amount', dataType: 'INTEGER' },
        { name: 'right_amount', dataType: 'INTEGER' },
      ];

      const result = generateSQLPreview(config, 'orders', columns);
      expect(result.success).toBe(true);
      expect(result.sql).toContain('"left_amount" = "right_amount"');
    });

    it('renders pure expression predicate when column is omitted', () => {
      const config = {
        tableName: 'orders',
        selectedColumns: [],
        aggregations: [],
        filters: [
          {
            column: '',
            operator: '>',
            valueType: FilterValueType.EXPRESSION,
            expression: '("卖家应退金额" + "实际应退金额") > 99',
          },
        ],
        having: [],
        orderBy: [],
        groupBy: [],
        limit: null,
        isDistinct: false,
      };

      const columns = [
        { name: '卖家应退金额', dataType: 'DOUBLE' },
        { name: '实际应退金额', dataType: 'DOUBLE' },
      ];

      const result = generateSQLPreview(config, 'orders', columns);
      expect(result.success).toBe(true);
      expect(result.sql).toContain('WHERE ("卖家应退金额" + "实际应退金额") > 99');
    });

    it('renders expression comparison in WHERE clause', () => {
      const config = {
        tableName: 'metrics',
        selectedColumns: [],
        aggregations: [],
        filters: [
          {
            column: 'score',
            operator: '=',
            logicOperator: 'AND',
            valueType: FilterValueType.EXPRESSION,
            expression: 'A + B',
            columnType: 'number',
          },
        ],
        having: [],
        orderBy: [],
        groupBy: [],
        limit: null,
        isDistinct: false,
      };

      const columns = [
        { name: 'score', dataType: 'DOUBLE' },
        { name: 'A', dataType: 'DOUBLE' },
        { name: 'B', dataType: 'DOUBLE' },
      ];

      const result = generateSQLPreview(config, 'metrics', columns);
      expect(result.success).toBe(true);
      expect(result.sql).toContain('"score" = (A + B)');
    });
  });
});
