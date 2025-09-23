/**
 * Visual Query SQL Generator
 * 
 * Generates DuckDB-compatible SQL from visual query configurations.
 * Supports SELECT with columns, aggregation functions, GROUP BY, DISTINCT, and basic structure.
 */

import {
  validateConfig,
  AGGREGATION_LABELS
} from '../types/visualQuery';

import {
  generateAggregationSQL,
  getColumnTypeInfo
} from './visualQueryUtils';

/**
 * Main SQL generation function
 * @param {Object} config - Visual query configuration
 * @param {string} tableName - Name of the table to query
 * @returns {Object} Result object with sql string and any errors
 */
export function generateSQL(config, tableName) {
  try {
    // Validate configuration first
    const validation = validateConfig(config);
    if (!validation.isValid) {
      return {
        success: false,
        sql: '',
        errors: validation.errors,
        warnings: validation.warnings || []
      };
    }

    // Check if we have any analysis conditions
    const hasAnalysisConditions = 
      config.selectedColumns.length > 0 ||
      config.aggregations.length > 0 ||
      config.filters.length > 0 ||
      config.groupBy.length > 0 ||
      config.orderBy.length > 0 ||
      config.limit !== null ||
      config.isDistinct;

    // If no conditions, return empty (will use default behavior)
    if (!hasAnalysisConditions) {
      return {
        success: true,
        sql: '',
        errors: [],
        warnings: ['没有配置任何分析条件，将使用默认查询']
      };
    }

    // Build SQL components
    const selectClause = buildSelectClause(config);
    const fromClause = buildFromClause(tableName);
    const whereClause = buildWhereClause(config.filters);
    const groupByClause = buildGroupByClause(config, selectClause.needsGroupBy);
    const orderByClause = buildOrderByClause(config.orderBy);
    const limitClause = buildLimitClause(config.limit);

    // Combine all clauses
    let sql = selectClause.sql + fromClause;
    
    if (whereClause) {
      sql += whereClause;
    }
    
    if (groupByClause) {
      sql += groupByClause;
    }
    
    if (orderByClause) {
      sql += orderByClause;
    }
    
    if (limitClause) {
      sql += limitClause;
    }

    return {
      success: true,
      sql: sql.trim(),
      errors: [],
      warnings: validation.warnings || []
    };

  } catch (error) {
    return {
      success: false,
      sql: '',
      errors: [`SQL生成失败: ${error.message}`],
      warnings: []
    };
  }
}

/**
 * Build SELECT clause with columns, aggregations, and calculated fields
 * @param {Object} config - Visual query configuration
 * @returns {Object} SELECT clause info
 */
function buildSelectClause(config) {
  const selectItems = [];
  let needsGroupBy = false;

  // Start with DISTINCT if specified
  let selectKeyword = 'SELECT';
  if (config.isDistinct) {
    selectKeyword = 'SELECT DISTINCT';
  }

  // Add selected columns
  if (config.selectedColumns && config.selectedColumns.length > 0) {
    selectItems.push(...config.selectedColumns.map(col => escapeIdentifier(col)));
  }

  // Add calculated fields
  if (config.calculatedFields && config.calculatedFields.length > 0) {
    const calculatedItems = config.calculatedFields.map(field => {
      const expression = generateCalculatedFieldExpression(field);
      return `${expression} AS ${escapeIdentifier(field.name)}`;
    });
    
    selectItems.push(...calculatedItems);
  }

  // Add conditional fields
  if (config.conditionalFields && config.conditionalFields.length > 0) {
    const conditionalItems = config.conditionalFields.map(field => {
      const expression = generateConditionalFieldExpression(field);
      return `${expression} AS ${escapeIdentifier(field.name)}`;
    });
    
    selectItems.push(...conditionalItems);
  }

  // Add aggregation functions
  if (config.aggregations && config.aggregations.length > 0) {
    // 只有在明确指定了groupBy或者有非聚合列时才需要GROUP BY
    // 如果只有聚合函数而没有其他列，说明要统计整体结果，不需要GROUP BY
    const hasNonAggregationColumns = config.selectedColumns && config.selectedColumns.length > 0;
    const hasExplicitGroupBy = config.groupBy && config.groupBy.length > 0;
    
    // 只有在以下情况才需要GROUP BY：
    // 1. 明确指定了groupBy字段，或者
    // 2. 有选中的列且这些列不全是聚合列
    needsGroupBy = hasExplicitGroupBy || (hasNonAggregationColumns && !config.aggregationOnly);
    
    const aggregationItems = config.aggregations.map(agg => {
      try {
        // 尝试使用自动类型转换的聚合函数生成
        const columnTypeInfo = getColumnTypeInfo(agg.column);
        const aggSQL = generateAggregationSQL(agg, columnTypeInfo.type, columnTypeInfo.name);
        
        if (agg.alias && agg.alias.trim()) {
          return `${aggSQL} AS ${escapeIdentifier(agg.alias)}`;
        }
        
        return aggSQL;
      } catch (error) {
        // 如果类型转换失败，回退到基础实现但对数值名称的VARCHAR列进行TRY_CAST
        console.warn(`聚合函数类型转换失败，使用回退方案: ${error.message}`);
        
        const column = agg.column;
        const func = agg.function;
        
        // 检查是否需要类型转换（当SUM/AVG遇到文本类型时）
        const isTextColumn = typeof column === 'string' || 
                           (column && ['varchar', 'text', 'string', 'char'].some(type => 
                             String(column.dataType || column.type || 'text').toLowerCase().includes(type)));
        
        let columnRef;
        if ((func === 'SUM' || func === 'AVG') && isTextColumn) {
          // 对文本类型的列进行类型转换，支持中文字段名和任意命名
          columnRef = `TRY_CAST(${escapeIdentifier(column)} AS DECIMAL)`;
        } else {
          columnRef = escapeIdentifier(column);
        }
        
        const funcCall = `${func}(${columnRef})`;
        
        if (agg.alias && agg.alias.trim()) {
          return `${funcCall} AS ${escapeIdentifier(agg.alias)}`;
        }
        
        return funcCall;
      }
    });
    
    selectItems.push(...aggregationItems);
  }

  // If no items specified and no aggregations, select all
  if (selectItems.length === 0) {
    selectItems.push('*');
  }

  return {
    sql: `${selectKeyword} ${selectItems.join(', ')}`,
    needsGroupBy
  };
}

/**
 * Build FROM clause
 * @param {string} tableName - Table name
 * @returns {string} FROM clause
 */
function buildFromClause(tableName) {
  if (!tableName || tableName.trim() === '') {
    throw new Error('表名不能为空');
  }
  
  return ` FROM ${escapeIdentifier(tableName)}`;
}

/**
 * Build WHERE clause from filters
 * @param {Array} filters - Filter configurations
 * @returns {string|null} WHERE clause or null if no filters
 */
function buildWhereClause(filters) {
  if (!filters || filters.length === 0) {
    return null;
  }

  const conditions = [];
  
  for (let i = 0; i < filters.length; i++) {
    const filter = filters[i];
    
    if (!filter.column || !filter.operator) {
      continue; // Skip invalid filters
    }

    const column = escapeIdentifier(filter.column);
    const operator = filter.operator;
    let condition = '';

    try {
      switch (operator) {
        case '=':
        case '!=':
        case '>':
        case '<':
        case '>=':
        case '<=':
          condition = `${column} ${operator} ${formatSQLValue(filter.value)}`;
          break;
          
        case 'LIKE':
        case 'NOT LIKE':
        case 'ILIKE':
          // Add wildcards for LIKE operations if not already present
          let likeValue = filter.value;
          if (likeValue && !likeValue.includes('%')) {
            likeValue = `%${likeValue}%`;
          }
          condition = `${column} ${operator} ${escapeStringLiteral(likeValue)}`;
          break;
          
        case 'IS NULL':
          condition = `${column} IS NULL`;
          break;
          
        case 'IS NOT NULL':
          condition = `${column} IS NOT NULL`;
          break;
          
        case 'BETWEEN':
          if (filter.value !== undefined && filter.value2 !== undefined) {
            condition = `${column} BETWEEN ${formatSQLValue(filter.value)} AND ${formatSQLValue(filter.value2)}`;
          }
          break;
          
        default:
          console.warn(`不支持的筛选操作符: ${operator}`);
          continue;
      }

      if (condition) {
        // Add logic operator for filters after the first one
        if (i > 0 && filter.logicOperator) {
          conditions.push(`${filter.logicOperator} ${condition}`);
        } else {
          conditions.push(condition);
        }
      }
    } catch (error) {
      console.warn(`筛选条件生成失败: ${error.message}`);
      continue;
    }
  }

  if (conditions.length === 0) {
    return null;
  }

  return ` WHERE ${conditions.join(' ')}`;
}

/**
 * Build GROUP BY clause
 * @param {Object} config - Visual query configuration
 * @param {boolean} needsGroupBy - Whether GROUP BY is needed for aggregations
 * @returns {string|null} GROUP BY clause or null
 */
function buildGroupByClause(config, needsGroupBy) {
  const groupByColumns = [];

  // 优先使用明确指定的GROUP BY列
  if (config.groupBy && config.groupBy.length > 0) {
    groupByColumns.push(...config.groupBy.map(col => escapeIdentifier(col)));
  }
  // 如果没有明确指定GROUP BY，但是有选中的列和聚合函数，则自动添加
  else if (needsGroupBy && config.selectedColumns && config.selectedColumns.length > 0) {
    // 只有在需要分组统计时才添加选中列到GROUP BY
    config.selectedColumns.forEach(col => {
      const escapedCol = escapeIdentifier(col);
      if (!groupByColumns.includes(escapedCol)) {
        groupByColumns.push(escapedCol);
      }
    });
  }

  if (groupByColumns.length === 0) {
    return null;
  }

  return ` GROUP BY ${groupByColumns.join(', ')}`;
}

/**
 * Build ORDER BY clause
 * @param {Array} orderBy - Sort configurations
 * @returns {string|null} ORDER BY clause or null
 */
function buildOrderByClause(orderBy) {
  if (!orderBy || orderBy.length === 0) {
    return null;
  }

  const orderItems = orderBy
    .sort((a, b) => (a.priority || 0) - (b.priority || 0)) // Sort by priority
    .map(order => {
      const column = escapeIdentifier(order.column);
      const direction = order.direction || 'ASC';
      
      // Validate direction
      if (!['ASC', 'DESC'].includes(direction.toUpperCase())) {
        throw new Error(`无效的排序方向: ${direction}`);
      }
      
      return `${column} ${direction.toUpperCase()}`;
    });

  return ` ORDER BY ${orderItems.join(', ')}`;
}

/**
 * Build LIMIT clause
 * @param {number|null} limit - Limit value
 * @returns {string|null} LIMIT clause or null
 */
function buildLimitClause(limit) {
  if (!limit || limit <= 0) {
    return null;
  }

  // Validate limit is a positive integer
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`无效的限制条数: ${limit}`);
  }

  return ` LIMIT ${limit}`;
}

/**
 * Escape SQL identifiers to prevent injection and handle special characters
 * @param {string} identifier - The identifier to escape
 * @returns {string} Escaped identifier
 */
function escapeIdentifier(identifier) {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('标识符必须是非空字符串');
  }

  // Remove any existing quotes and escape internal quotes
  const cleaned = identifier.replace(/"/g, '""');
  
  // Always quote identifiers to handle special characters and reserved words
  return `"${cleaned}"`;
}

/**
 * Escape SQL string literals
 * @param {string} value - The string value to escape
 * @returns {string} Escaped string literal
 */
function escapeStringLiteral(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  
  if (typeof value !== 'string') {
    value = String(value);
  }
  
  // Escape single quotes by doubling them
  const escaped = value.replace(/'/g, "''");
  return `'${escaped}'`;
}

/**
 * Get SQL representation of a value based on its type
 * @param {any} value - The value to convert
 * @param {string} dataType - The expected data type
 * @returns {string} SQL representation of the value
 */
function formatSQLValue(value, dataType = 'TEXT') {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  const upperDataType = dataType.toUpperCase();

  // Handle numeric types
  if (upperDataType.includes('INT') || upperDataType.includes('NUMERIC') || 
      upperDataType.includes('DECIMAL') || upperDataType.includes('FLOAT') || 
      upperDataType.includes('DOUBLE') || upperDataType.includes('REAL')) {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      throw new Error(`无效的数值: ${value}`);
    }
    return String(numValue);
  }

  // Handle boolean types
  if (upperDataType.includes('BOOL')) {
    return value ? 'TRUE' : 'FALSE';
  }

  // Handle date/time types
  if (upperDataType.includes('DATE') || upperDataType.includes('TIME') || upperDataType.includes('TIMESTAMP')) {
    return escapeStringLiteral(value);
  }

  // Default to string literal
  return escapeStringLiteral(value);
}

/**
 * Validate aggregation function
 * @param {string} func - Aggregation function name
 * @returns {boolean} Whether the function is valid
 */
function isValidAggregationFunction(func) {
  const validFunctions = [
    // Basic aggregation functions
    'SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'COUNT_DISTINCT',
    
    // Statistical functions
    'MEDIAN', 'MODE', 'STDDEV_SAMP', 'VAR_SAMP',
    'PERCENTILE_CONT_25', 'PERCENTILE_CONT_75',
    'PERCENTILE_DISC_25', 'PERCENTILE_DISC_75',
    
    // Window functions
    'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'PERCENT_RANK', 'CUME_DIST',
    
    // Trend analysis functions
    'SUM_OVER', 'AVG_OVER', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE'
  ];
  return validFunctions.includes(func.toUpperCase());
}

/**
 * Generate SQL expression for calculated field
 * @param {Object} field - Calculated field configuration
 * @returns {string} SQL expression
 */
function generateCalculatedFieldExpression(field) {
  const { type, operation, expression } = field;
  
  if (expression && expression.trim()) {
    // Use custom expression if provided
    return expression;
  }
  
  // Generate expression based on type and operation
  switch (type) {
    case 'mathematical':
      return generateMathematicalExpression(operation, field);
    case 'date':
      return generateDateExpression(operation, field);
    case 'string':
      return generateStringExpression(operation, field);
    default:
      throw new Error(`不支持的计算字段类型: ${type}`);
  }
}

/**
 * Generate mathematical expression
 * @param {string} operation - Mathematical operation
 * @param {Object} field - Field configuration
 * @returns {string} SQL expression
 */
function generateMathematicalExpression(operation, field) {
  // For now, return a placeholder that can be customized
  // In a real implementation, this would parse the expression or use predefined patterns
  switch (operation) {
    case 'add':
      return 'column1 + column2'; // Placeholder
    case 'subtract':
      return 'column1 - column2'; // Placeholder
    case 'multiply':
      return 'column1 * column2'; // Placeholder
    case 'divide':
      return 'column1 / column2'; // Placeholder
    case 'power':
      return 'POWER(column1, 2)'; // Placeholder
    case 'sqrt':
      return 'SQRT(column1)'; // Placeholder
    case 'abs':
      return 'ABS(column1)'; // Placeholder
    case 'round':
      return 'ROUND(column1, 2)'; // Placeholder
    default:
      return field.expression || 'column1';
  }
}

/**
 * Generate date expression
 * @param {string} operation - Date operation
 * @param {Object} field - Field configuration
 * @returns {string} SQL expression
 */
function generateDateExpression(operation, field) {
  switch (operation) {
    case 'extract_year':
      return 'EXTRACT(YEAR FROM date_column)'; // Placeholder
    case 'extract_month':
      return 'EXTRACT(MONTH FROM date_column)'; // Placeholder
    case 'extract_day':
      return 'EXTRACT(DAY FROM date_column)'; // Placeholder
    default:
      return field.expression || 'date_column';
  }
}

/**
 * Generate string expression
 * @param {string} operation - String operation
 * @param {Object} field - Field configuration
 * @returns {string} SQL expression
 */
function generateStringExpression(operation, field) {
  switch (operation) {
    case 'upper':
      return 'UPPER(text_column)'; // Placeholder
    case 'lower':
      return 'LOWER(text_column)'; // Placeholder
    case 'length':
      return 'LENGTH(text_column)'; // Placeholder
    default:
      return field.expression || 'text_column';
  }
}

/**
 * Generate SQL expression for conditional field
 * @param {Object} field - Conditional field configuration
 * @returns {string} SQL expression
 */
function generateConditionalFieldExpression(field) {
  if (field.type === 'conditional') {
    return generateCaseWhenExpression(field);
  } else if (field.type === 'binning') {
    return generateBinningExpression(field);
  }
  
  throw new Error(`不支持的条件字段类型: ${field.type}`);
}

/**
 * Generate CASE WHEN expression
 * @param {Object} field - Conditional field configuration
 * @returns {string} SQL CASE WHEN expression
 */
function generateCaseWhenExpression(field) {
  if (!field.conditions || field.conditions.length === 0) {
    throw new Error('条件字段缺少条件设置');
  }

  const conditions = field.conditions.map(condition => {
    const column = escapeIdentifier(condition.column);
    const operator = condition.operator;
    const value = condition.value;
    const result = escapeStringLiteral(condition.result);

    let conditionClause = '';
    
    switch (operator) {
      case 'IS NULL':
        conditionClause = `${column} IS NULL`;
        break;
      case 'IS NOT NULL':
        conditionClause = `${column} IS NOT NULL`;
        break;
      case 'LIKE':
        conditionClause = `${column} LIKE ${escapeStringLiteral(`%${value}%`)}`;
        break;
      default:
        conditionClause = `${column} ${operator} ${formatSQLValue(value)}`;
        break;
    }

    return `WHEN ${conditionClause} THEN ${result}`;
  }).join(' ');

  const defaultValue = field.defaultValue ? escapeStringLiteral(field.defaultValue) : 'NULL';
  
  return `CASE ${conditions} ELSE ${defaultValue} END`;
}

/**
 * Generate binning expression using WIDTH_BUCKET
 * @param {Object} field - Binning field configuration
 * @returns {string} SQL WIDTH_BUCKET expression
 */
function generateBinningExpression(field) {
  if (!field.column) {
    throw new Error('分组字段缺少列名');
  }

  const column = escapeIdentifier(field.column);
  const bins = field.bins || 5;

  switch (field.type) {
    case 'age_groups':
      return `CASE 
        WHEN WIDTH_BUCKET(${column}, 0, 100, ${bins}) = 1 THEN '0-20岁'
        WHEN WIDTH_BUCKET(${column}, 0, 100, ${bins}) = 2 THEN '21-40岁'
        WHEN WIDTH_BUCKET(${column}, 0, 100, ${bins}) = 3 THEN '41-60岁'
        WHEN WIDTH_BUCKET(${column}, 0, 100, ${bins}) = 4 THEN '61-80岁'
        ELSE '80岁以上'
      END`;
      
    case 'price_ranges':
      return `CASE 
        WHEN WIDTH_BUCKET(${column}, 0, 10000, ${bins}) = 1 THEN '0-2000元'
        WHEN WIDTH_BUCKET(${column}, 0, 10000, ${bins}) = 2 THEN '2001-4000元'
        WHEN WIDTH_BUCKET(${column}, 0, 10000, ${bins}) = 3 THEN '4001-6000元'
        WHEN WIDTH_BUCKET(${column}, 0, 10000, ${bins}) = 4 THEN '6001-8000元'
        ELSE '8000元以上'
      END`;
      
    case 'equal_width':
      return `'区间' || WIDTH_BUCKET(${column}, (SELECT MIN(${column}) FROM ${field.tableName || 'table'}), (SELECT MAX(${column}) FROM ${field.tableName || 'table'}), ${bins})`;
      
    case 'custom_ranges':
      // For custom ranges, use a simple WIDTH_BUCKET with default range
      return `'分组' || WIDTH_BUCKET(${column}, 0, 1000, ${bins})`;
      
    default:
      return `WIDTH_BUCKET(${column}, 0, 100, ${bins})`;
  }
}

/**
 * Generate SQL for a specific aggregation
 * @param {Object} aggregation - Aggregation configuration
 * @returns {string} SQL aggregation expression
 */
function generateAggregationSQL(aggregation) {
  if (!aggregation.function || !aggregation.column) {
    throw new Error('聚合函数配置不完整');
  }

  if (!isValidAggregationFunction(aggregation.function)) {
    throw new Error(`不支持的聚合函数: ${aggregation.function}`);
  }

  const column = escapeIdentifier(aggregation.column);
  const func = aggregation.function.toUpperCase();

  // Handle special cases for different function types
  switch (func) {
    case 'COUNT_DISTINCT':
      return `COUNT(DISTINCT ${column})`;
      
    // Percentile functions
    case 'PERCENTILE_CONT_25':
      return `PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ${column})`;
    case 'PERCENTILE_CONT_75':
      return `PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${column})`;
    case 'PERCENTILE_DISC_25':
      return `PERCENTILE_DISC(0.25) WITHIN GROUP (ORDER BY ${column})`;
    case 'PERCENTILE_DISC_75':
      return `PERCENTILE_DISC(0.75) WITHIN GROUP (ORDER BY ${column})`;
      
    // Window functions - ranking
    case 'ROW_NUMBER':
      return `ROW_NUMBER() OVER (ORDER BY ${column})`;
    case 'RANK':
      return `RANK() OVER (ORDER BY ${column})`;
    case 'DENSE_RANK':
      return `DENSE_RANK() OVER (ORDER BY ${column})`;
    case 'PERCENT_RANK':
      return `PERCENT_RANK() OVER (ORDER BY ${column})`;
    case 'CUME_DIST':
      return `CUME_DIST() OVER (ORDER BY ${column})`;
      
    // Window functions - trend analysis
    case 'SUM_OVER':
      return `SUM(${column}) OVER (ORDER BY ${column} ROWS UNBOUNDED PRECEDING)`;
    case 'AVG_OVER':
      return `AVG(${column}) OVER (ORDER BY ${column} ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)`;
    case 'LAG':
      return `LAG(${column}, 1) OVER (ORDER BY ${column})`;
    case 'LEAD':
      return `LEAD(${column}, 1) OVER (ORDER BY ${column})`;
    case 'FIRST_VALUE':
      return `FIRST_VALUE(${column}) OVER (ORDER BY ${column} ROWS UNBOUNDED PRECEDING)`;
    case 'LAST_VALUE':
      return `LAST_VALUE(${column}) OVER (ORDER BY ${column} ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)`;
      
    // Standard aggregation functions
    default:
      return `${func}(${column})`;
  }
}

/**
 * Preview SQL generation - returns formatted SQL with comments
 * @param {Object} config - Visual query configuration
 * @param {string} tableName - Table name
 * @returns {Object} Result with formatted SQL and metadata
 */
export function generateSQLPreview(config, tableName) {
  const result = generateSQL(config, tableName);
  
  if (!result.success) {
    return result;
  }

  // Add Chinese comments to explain the query
  let commentedSQL = result.sql;
  
  if (config.selectedColumns && config.selectedColumns.length > 0) {
    commentedSQL = `-- 选择的列: ${config.selectedColumns.join(', ')}\n${commentedSQL}`;
  }
  
  if (config.aggregations && config.aggregations.length > 0) {
    const aggDescriptions = config.aggregations.map(agg => 
      `${AGGREGATION_LABELS[agg.function] || agg.function}(${agg.column})`
    );
    commentedSQL = `-- 聚合函数: ${aggDescriptions.join(', ')}\n${commentedSQL}`;
  }
  
  if (config.filters && config.filters.length > 0) {
    commentedSQL = `-- 筛选条件: ${config.filters.length}个条件\n${commentedSQL}`;
  }

  return {
    ...result,
    sql: commentedSQL,
    metadata: {
      hasColumns: config.selectedColumns && config.selectedColumns.length > 0,
      hasAggregations: config.aggregations && config.aggregations.length > 0,
      hasFilters: config.filters && config.filters.length > 0,
      hasGroupBy: config.groupBy && config.groupBy.length > 0,
      hasOrderBy: config.orderBy && config.orderBy.length > 0,
      hasLimit: config.limit && config.limit > 0,
      isDistinct: config.isDistinct
    }
  };
}

// Export utility functions for testing
export {
  escapeIdentifier,
  escapeStringLiteral,
  formatSQLValue,
  isValidAggregationFunction,
  generateAggregationSQL
};