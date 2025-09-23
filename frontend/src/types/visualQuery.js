/**
 * Visual Query Configuration Data Models
 * 
 * This file contains data models and validation utilities for the visual query builder.
 * It includes Chinese display labels mapping for all functions and comprehensive type definitions.
 */

// ===== Core Configuration Types =====

/**
 * Creates a default visual query configuration
 * @param {string} tableName - The name of the table
 * @returns {Object} Default visual query configuration
 */
export function createDefaultConfig(tableName) {
  return {
    tableName: tableName || '',
    selectedColumns: [],
    aggregations: [],
    calculatedFields: [],
    conditionalFields: [],
    filters: [],
    groupBy: [],
    orderBy: [],
    limit: null,
    isDistinct: false
  };
}

/**
 * Creates a default aggregation configuration
 * @param {string} column - The column name
 * @returns {Object} Default aggregation configuration
 */
export function createDefaultAggregationConfig(column) {
  return {
    column: column || '',
    function: 'COUNT',
    displayName: AGGREGATION_LABELS['COUNT'],
    alias: null
  };
}

/**
 * Creates a default filter configuration
 * @param {string} column - The column name
 * @returns {Object} Default filter configuration
 */
export function createDefaultFilterConfig(column) {
  return {
    column: column || '',
    operator: '=',
    value: '',
    value2: null,
    logicOperator: 'AND',
    displayName: FILTER_OPERATOR_LABELS['=']
  };
}

/**
 * Creates a default sort configuration
 * @param {string} column - The column name
 * @param {number} priority - The sort priority
 * @returns {Object} Default sort configuration
 */
export function createDefaultSortConfig(column, priority = 0) {
  return {
    column: column || '',
    direction: 'ASC',
    priority: priority
  };
}

/**
 * Creates a default calculated field configuration
 * @param {string} name - The field name
 * @returns {Object} Default calculated field configuration
 */
export function createDefaultCalculatedFieldConfig(name) {
  return {
    id: Date.now().toString(),
    name: name || '',
    expression: '',
    type: 'mathematical',
    operation: 'add'
  };
}

/**
 * Creates a default conditional field configuration
 * @param {string} name - The field name
 * @returns {Object} Default conditional field configuration
 */
export function createDefaultConditionalFieldConfig(name) {
  return {
    id: Date.now().toString(),
    name: name || '',
    type: 'conditional',
    conditions: [
      {
        column: '',
        operator: '=',
        value: '',
        result: ''
      }
    ],
    defaultValue: ''
  };
}

// ===== Chinese Display Labels Mapping =====

/**
 * Chinese labels for aggregation functions
 */
export const AGGREGATION_LABELS = {
  // Basic aggregation functions
  'SUM': '求和',
  'AVG': '平均值',
  'COUNT': '计数',
  'MIN': '最小值',
  'MAX': '最大值',
  'COUNT_DISTINCT': '去重计数',
  
  // Statistical functions
  'MEDIAN': '中位数',
  'MODE': '众数',
  'STDDEV_SAMP': '标准差',
  'VAR_SAMP': '方差',
  'PERCENTILE_CONT_25': '第一四分位数',
  'PERCENTILE_CONT_75': '第三四分位数',
  'PERCENTILE_DISC_25': '第一四分位数(离散)',
  'PERCENTILE_DISC_75': '第三四分位数(离散)',
  
  // Window functions
  'ROW_NUMBER': '行号',
  'RANK': '排名',
  'DENSE_RANK': '密集排名',
  'PERCENT_RANK': '百分比排名',
  'CUME_DIST': '累积分布',
  
  // Trend analysis functions
  'SUM_OVER': '累计求和',
  'AVG_OVER': '移动平均',
  'LAG': '前一行值',
  'LEAD': '后一行值',
  'FIRST_VALUE': '首值',
  'LAST_VALUE': '末值'
};

/**
 * Chinese labels for filter operators
 */
export const FILTER_OPERATOR_LABELS = {
  '=': '等于',
  '!=': '不等于',
  '>': '大于',
  '<': '小于',
  '>=': '大于等于',
  '<=': '小于等于',
  'LIKE': '包含',
  'ILIKE': '包含(忽略大小写)',
  'IS NULL': '为空',
  'IS NOT NULL': '不为空',
  'BETWEEN': '介于...之间'
};

/**
 * Chinese labels for logic operators
 */
export const LOGIC_OPERATOR_LABELS = {
  'AND': '且',
  'OR': '或'
};

/**
 * Chinese labels for sort directions
 */
export const SORT_DIRECTION_LABELS = {
  'ASC': '升序',
  'DESC': '降序'
};

/**
 * Chinese labels for calculated field types
 */
export const CALCULATED_FIELD_TYPE_LABELS = {
  'mathematical': '数学运算',
  'date': '日期函数',
  'string': '字符串函数'
};

/**
 * Chinese labels for mathematical operations
 */
export const MATHEMATICAL_OPERATION_LABELS = {
  'add': '加法',
  'subtract': '减法',
  'multiply': '乘法',
  'divide': '除法',
  'power': '乘方',
  'sqrt': '开方',
  'abs': '绝对值',
  'round': '四舍五入'
};

/**
 * Chinese labels for date operations
 */
export const DATE_OPERATION_LABELS = {
  'extract_year': '提取年份',
  'extract_month': '提取月份',
  'extract_day': '提取日期'
};

/**
 * Chinese labels for string operations
 */
export const STRING_OPERATION_LABELS = {
  'upper': '转大写',
  'lower': '转小写',
  'length': '字符长度'
};

// ===== Aggregation Options with Display Names =====

/**
 * Available aggregation options with Chinese display names
 */
export const AGGREGATION_OPTIONS = [
  // Basic aggregation functions
  { value: 'SUM', displayName: '求和', description: '计算数值列的总和', category: 'basic' },
  { value: 'AVG', displayName: '平均值', description: '计算数值列的平均值', category: 'basic' },
  { value: 'COUNT', displayName: '计数', description: '计算行数', category: 'basic' },
  { value: 'MIN', displayName: '最小值', description: '找出最小值', category: 'basic' },
  { value: 'MAX', displayName: '最大值', description: '找出最大值', category: 'basic' },
  { value: 'COUNT_DISTINCT', displayName: '去重计数', description: '计算不重复值的数量', category: 'basic' },
  
  // Statistical functions
  { value: 'MEDIAN', displayName: '中位数', description: '计算中位数', category: 'statistical' },
  { value: 'MODE', displayName: '众数', description: '找出出现频率最高的值', category: 'statistical' },
  { value: 'STDDEV_SAMP', displayName: '标准差', description: '计算样本标准差', category: 'statistical' },
  { value: 'VAR_SAMP', displayName: '方差', description: '计算样本方差', category: 'statistical' },
  { value: 'PERCENTILE_CONT_25', displayName: '第一四分位数', description: '计算25%分位数(连续)', category: 'statistical' },
  { value: 'PERCENTILE_CONT_75', displayName: '第三四分位数', description: '计算75%分位数(连续)', category: 'statistical' },
  { value: 'PERCENTILE_DISC_25', displayName: '第一四分位数(离散)', description: '计算25%分位数(离散)', category: 'statistical' },
  { value: 'PERCENTILE_DISC_75', displayName: '第三四分位数(离散)', description: '计算75%分位数(离散)', category: 'statistical' },
  
  // Window functions - Ranking
  { value: 'ROW_NUMBER', displayName: '行号', description: '为每行分配唯一的序号', category: 'window' },
  { value: 'RANK', displayName: '排名', description: '计算排名(相同值有相同排名)', category: 'window' },
  { value: 'DENSE_RANK', displayName: '密集排名', description: '计算密集排名(无排名间隙)', category: 'window' },
  { value: 'PERCENT_RANK', displayName: '百分比排名', description: '计算百分比排名', category: 'window' },
  { value: 'CUME_DIST', displayName: '累积分布', description: '计算累积分布', category: 'window' },
  
  // Window functions - Trend analysis
  { value: 'SUM_OVER', displayName: '累计求和', description: '计算累计求和', category: 'trend' },
  { value: 'AVG_OVER', displayName: '移动平均', description: '计算移动平均值', category: 'trend' },
  { value: 'LAG', displayName: '前一行值', description: '获取前一行的值', category: 'trend' },
  { value: 'LEAD', displayName: '后一行值', description: '获取后一行的值', category: 'trend' },
  { value: 'FIRST_VALUE', displayName: '首值', description: '获取窗口内第一个值', category: 'trend' },
  { value: 'LAST_VALUE', displayName: '末值', description: '获取窗口内最后一个值', category: 'trend' }
];

/**
 * Aggregation function categories with Chinese labels
 */
export const AGGREGATION_CATEGORIES = {
  'basic': '基础聚合',
  'statistical': '统计分析',
  'window': '窗口函数',
  'trend': '趋势分析'
};

/**
 * Available filter options with Chinese display names
 */
export const FILTER_OPTIONS = [
  { value: '=', displayName: '等于', description: '完全匹配', requiresValue: true, requiresSecondValue: false },
  { value: '!=', displayName: '不等于', description: '不匹配', requiresValue: true, requiresSecondValue: false },
  { value: '>', displayName: '大于', description: '数值大于指定值', requiresValue: true, requiresSecondValue: false },
  { value: '<', displayName: '小于', description: '数值小于指定值', requiresValue: true, requiresSecondValue: false },
  { value: '>=', displayName: '大于等于', description: '数值大于或等于指定值', requiresValue: true, requiresSecondValue: false },
  { value: '<=', displayName: '小于等于', description: '数值小于或等于指定值', requiresValue: true, requiresSecondValue: false },
  { value: 'LIKE', displayName: '包含', description: '文本包含指定内容', requiresValue: true, requiresSecondValue: false },
  { value: 'ILIKE', displayName: '包含(忽略大小写)', description: '文本包含指定内容(不区分大小写)', requiresValue: true, requiresSecondValue: false },
  { value: 'IS NULL', displayName: '为空', description: '值为空', requiresValue: false, requiresSecondValue: false },
  { value: 'IS NOT NULL', displayName: '不为空', description: '值不为空', requiresValue: false, requiresSecondValue: false },
  { value: 'BETWEEN', displayName: '介于...之间', description: '值在指定范围内', requiresValue: true, requiresSecondValue: true }
];

// ===== Validation Utilities =====

/**
 * Validates a visual query configuration
 * @param {Object} config - The visual query configuration to validate
 * @returns {Object} Validation result with isValid, errors, and warnings
 */
export function validateConfig(config) {
  const errors = [];
  const warnings = [];

  // Validate table name
  if (!config.tableName || config.tableName.trim() === '') {
    errors.push('必须选择一个数据表');
  }

  // Validate selected columns
  if (config.selectedColumns.length === 0 && config.aggregations.length === 0) {
    warnings.push('未选择任何列或聚合函数，将返回所有列');
  }

  // Validate aggregations
  config.aggregations.forEach((agg, index) => {
    if (!agg.column || agg.column.trim() === '') {
      errors.push(`聚合函数 ${index + 1} 缺少列名`);
    }
    if (!agg.function) {
      errors.push(`聚合函数 ${index + 1} 缺少函数类型`);
    }
    if (!AGGREGATION_LABELS[agg.function]) {
      errors.push(`聚合函数 ${index + 1} 使用了无效的函数类型: ${agg.function}`);
    }
  });

  // Validate calculated fields
  config.calculatedFields.forEach((field, index) => {
    if (!field.name || field.name.trim() === '') {
      errors.push(`计算字段 ${index + 1} 缺少字段名称`);
    }
    if (!field.type) {
      errors.push(`计算字段 ${index + 1} 缺少计算类型`);
    }
    if (!CALCULATED_FIELD_TYPE_LABELS[field.type]) {
      errors.push(`计算字段 ${index + 1} 使用了无效的计算类型: ${field.type}`);
    }
    if (!field.operation) {
      errors.push(`计算字段 ${index + 1} 缺少操作类型`);
    }
    if (!field.expression || field.expression.trim() === '') {
      warnings.push(`计算字段 ${index + 1} 缺少表达式，将使用默认表达式`);
    }
  });

  // Validate conditional fields
  config.conditionalFields.forEach((field, index) => {
    if (!field.name || field.name.trim() === '') {
      errors.push(`条件字段 ${index + 1} 缺少字段名称`);
    }
    if (!field.type) {
      errors.push(`条件字段 ${index + 1} 缺少字段类型`);
    }
    if (field.type === 'conditional') {
      if (!field.conditions || field.conditions.length === 0) {
        errors.push(`条件字段 ${index + 1} 缺少条件设置`);
      } else {
        field.conditions.forEach((condition, condIndex) => {
          if (!condition.column) {
            errors.push(`条件字段 ${index + 1} 的条件 ${condIndex + 1} 缺少列名`);
          }
          if (!condition.operator) {
            errors.push(`条件字段 ${index + 1} 的条件 ${condIndex + 1} 缺少操作符`);
          }
          if (!condition.result) {
            errors.push(`条件字段 ${index + 1} 的条件 ${condIndex + 1} 缺少返回值`);
          }
        });
      }
    } else if (field.type === 'binning') {
      if (!field.column) {
        errors.push(`分组字段 ${index + 1} 缺少列名`);
      }
      if (!field.bins || field.bins < 2) {
        errors.push(`分组字段 ${index + 1} 的分组数量必须大于等于2`);
      }
    }
  });

  // Validate filters
  config.filters.forEach((filter, index) => {
    if (!filter.column || filter.column.trim() === '') {
      errors.push(`筛选条件 ${index + 1} 缺少列名`);
    }
    if (!filter.operator) {
      errors.push(`筛选条件 ${index + 1} 缺少操作符`);
    }
    
    const filterOption = FILTER_OPTIONS.find(opt => opt.value === filter.operator);
    if (!filterOption) {
      errors.push(`筛选条件 ${index + 1} 使用了无效的操作符: ${filter.operator}`);
    } else {
      if (filterOption.requiresValue && (filter.value === undefined || filter.value === null || filter.value === '')) {
        errors.push(`筛选条件 ${index + 1} 缺少筛选值`);
      }
      if (filterOption.requiresSecondValue && (filter.value2 === undefined || filter.value2 === null || filter.value2 === '')) {
        errors.push(`筛选条件 ${index + 1} 缺少第二个筛选值`);
      }
    }
  });

  // Validate group by with aggregations
  if (config.aggregations.length > 0 && config.groupBy.length === 0 && config.selectedColumns.length > 0) {
    warnings.push('使用聚合函数时建议设置分组列，否则可能产生意外结果');
  }

  // Validate sort columns
  config.orderBy.forEach((sort, index) => {
    if (!sort.column || sort.column.trim() === '') {
      errors.push(`排序设置 ${index + 1} 缺少列名`);
    }
    if (!sort.direction || !SORT_DIRECTION_LABELS[sort.direction]) {
      errors.push(`排序设置 ${index + 1} 使用了无效的排序方向: ${sort.direction}`);
    }
  });

  // Validate limit
  if (config.limit !== undefined && config.limit !== null) {
    if (config.limit <= 0) {
      errors.push('显示条数必须大于0');
    }
    if (!Number.isInteger(config.limit)) {
      errors.push('显示条数必须是整数');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates a single aggregation configuration
 * @param {Object} config - The aggregation configuration to validate
 * @returns {Object} Validation result
 */
export function validateAggregationConfig(config) {
  const errors = [];
  const warnings = [];

  if (!config.column || config.column.trim() === '') {
    errors.push('聚合函数缺少列名');
  }

  if (!config.function) {
    errors.push('聚合函数缺少函数类型');
  } else if (!AGGREGATION_LABELS[config.function]) {
    errors.push(`无效的聚合函数类型: ${config.function}`);
  }

  if (config.alias && config.alias.trim() === '') {
    warnings.push('别名不应为空字符串');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates a single filter configuration
 * @param {Object} config - The filter configuration to validate
 * @returns {Object} Validation result
 */
export function validateFilterConfig(config) {
  const errors = [];
  const warnings = [];

  if (!config.column || config.column.trim() === '') {
    errors.push('筛选条件缺少列名');
  }

  if (!config.operator) {
    errors.push('筛选条件缺少操作符');
  } else {
    const filterOption = FILTER_OPTIONS.find(opt => opt.value === config.operator);
    if (!filterOption) {
      errors.push(`无效的筛选操作符: ${config.operator}`);
    } else {
      if (filterOption.requiresValue && (config.value === undefined || config.value === null || config.value === '')) {
        errors.push('筛选条件缺少筛选值');
      }
      if (filterOption.requiresSecondValue && (config.value2 === undefined || config.value2 === null || config.value2 === '')) {
        errors.push('筛选条件缺少第二个筛选值');
      }
    }
  }

  if (!config.logicOperator || !LOGIC_OPERATOR_LABELS[config.logicOperator]) {
    errors.push(`无效的逻辑操作符: ${config.logicOperator}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates a single sort configuration
 * @param {Object} config - The sort configuration to validate
 * @returns {Object} Validation result
 */
export function validateSortConfig(config) {
  const errors = [];
  const warnings = [];

  if (!config.column || config.column.trim() === '') {
    errors.push('排序设置缺少列名');
  }

  if (!config.direction || !SORT_DIRECTION_LABELS[config.direction]) {
    errors.push(`无效的排序方向: ${config.direction}`);
  }

  if (config.priority < 0) {
    errors.push('排序优先级不能为负数');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates a single calculated field configuration
 * @param {Object} config - The calculated field configuration to validate
 * @returns {Object} Validation result
 */
export function validateCalculatedFieldConfig(config) {
  const errors = [];
  const warnings = [];

  if (!config.name || config.name.trim() === '') {
    errors.push('计算字段缺少字段名称');
  }

  if (!config.type) {
    errors.push('计算字段缺少计算类型');
  } else if (!CALCULATED_FIELD_TYPE_LABELS[config.type]) {
    errors.push(`无效的计算类型: ${config.type}`);
  }

  if (!config.operation) {
    errors.push('计算字段缺少操作类型');
  } else {
    // Validate operation based on type
    if (config.type === 'mathematical' && !MATHEMATICAL_OPERATION_LABELS[config.operation]) {
      errors.push(`无效的数学运算操作: ${config.operation}`);
    } else if (config.type === 'date' && !DATE_OPERATION_LABELS[config.operation]) {
      errors.push(`无效的日期函数操作: ${config.operation}`);
    } else if (config.type === 'string' && !STRING_OPERATION_LABELS[config.operation]) {
      errors.push(`无效的字符串函数操作: ${config.operation}`);
    }
  }

  if (!config.expression || config.expression.trim() === '') {
    warnings.push('计算字段缺少表达式，将使用默认表达式');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates a single conditional field configuration
 * @param {Object} config - The conditional field configuration to validate
 * @returns {Object} Validation result
 */
export function validateConditionalFieldConfig(config) {
  const errors = [];
  const warnings = [];

  if (!config.name || config.name.trim() === '') {
    errors.push('条件字段缺少字段名称');
  }

  if (!config.type) {
    errors.push('条件字段缺少字段类型');
  }

  if (config.type === 'conditional') {
    if (!config.conditions || config.conditions.length === 0) {
      errors.push('条件字段缺少条件设置');
    } else {
      config.conditions.forEach((condition, index) => {
        if (!condition.column || condition.column.trim() === '') {
          errors.push(`条件 ${index + 1} 缺少列名`);
        }
        if (!condition.operator) {
          errors.push(`条件 ${index + 1} 缺少操作符`);
        }
        if (!condition.result || condition.result.trim() === '') {
          errors.push(`条件 ${index + 1} 缺少返回值`);
        }
        if (condition.operator !== 'IS NULL' && condition.operator !== 'IS NOT NULL' && 
            (!condition.value && condition.value !== 0)) {
          errors.push(`条件 ${index + 1} 缺少比较值`);
        }
      });
    }

    if (!config.defaultValue || config.defaultValue.trim() === '') {
      warnings.push('条件字段缺少默认值');
    }
  } else if (config.type === 'binning') {
    if (!config.column || config.column.trim() === '') {
      errors.push('分组字段缺少列名');
    }
    if (!config.bins || config.bins < 2) {
      errors.push('分组数量必须大于等于2');
    }
    if (config.bins > 20) {
      warnings.push('分组数量过多可能影响性能');
    }
  } else {
    errors.push(`无效的条件字段类型: ${config.type}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// ===== Helper Functions =====

/**
 * Gets the display name for an aggregation function
 * @param {string} func - The aggregation function
 * @returns {string} Display name
 */
export function getAggregationDisplayName(func) {
  return AGGREGATION_LABELS[func] || func;
}

/**
 * Gets the display name for a filter operator
 * @param {string} operator - The filter operator
 * @returns {string} Display name
 */
export function getFilterOperatorDisplayName(operator) {
  return FILTER_OPERATOR_LABELS[operator] || operator;
}

/**
 * Gets the display name for a logic operator
 * @param {string} operator - The logic operator
 * @returns {string} Display name
 */
export function getLogicOperatorDisplayName(operator) {
  return LOGIC_OPERATOR_LABELS[operator] || operator;
}

/**
 * Gets the display name for a sort direction
 * @param {string} direction - The sort direction
 * @returns {string} Display name
 */
export function getSortDirectionDisplayName(direction) {
  return SORT_DIRECTION_LABELS[direction] || direction;
}

/**
 * Checks if a column data type is numeric
 * @param {string} dataType - The data type to check
 * @returns {boolean} True if numeric
 */
export function isNumericDataType(dataType) {
  const numericTypes = ['INTEGER', 'BIGINT', 'DOUBLE', 'REAL', 'DECIMAL', 'NUMERIC', 'FLOAT'];
  return numericTypes.some(type => dataType.toUpperCase().includes(type));
}

/**
 * Checks if a column data type is text/string
 * @param {string} dataType - The data type to check
 * @returns {boolean} True if text
 */
export function isTextDataType(dataType) {
  const textTypes = ['VARCHAR', 'TEXT', 'STRING', 'CHAR'];
  return textTypes.some(type => dataType.toUpperCase().includes(type));
}

/**
 * Checks if a column data type is date/time
 * @param {string} dataType - The data type to check
 * @returns {boolean} True if date/time
 */
export function isDateTimeDataType(dataType) {
  const dateTimeTypes = ['DATE', 'TIME', 'TIMESTAMP', 'DATETIME'];
  return dateTimeTypes.some(type => dataType.toUpperCase().includes(type));
}

/**
 * Gets appropriate filter operators for a given data type
 * @param {string} dataType - The data type
 * @returns {Array} Array of filter operators
 */
export function getFilterOperatorsForDataType(dataType) {
  const baseOperators = ['=', '!=', 'IS NULL', 'IS NOT NULL'];
  
  if (isNumericDataType(dataType) || isDateTimeDataType(dataType)) {
    return [...baseOperators, '>', '<', '>=', '<=', 'BETWEEN'];
  }
  
  if (isTextDataType(dataType)) {
    return [...baseOperators, 'LIKE', 'ILIKE'];
  }
  
  return baseOperators;
}

/**
 * Gets appropriate aggregation functions for a given data type
 * @param {string} dataType - The data type
 * @returns {Array} Array of aggregation functions
 */
export function getAggregationFunctionsForDataType(dataType) {
  const baseAggregations = ['COUNT', 'COUNT_DISTINCT'];
  const windowFunctions = ['ROW_NUMBER', 'RANK', 'DENSE_RANK', 'PERCENT_RANK', 'CUME_DIST'];
  
  if (isNumericDataType(dataType)) {
    return [
      ...baseAggregations, 
      'SUM', 'AVG', 'MIN', 'MAX', 
      'MEDIAN', 'STDDEV_SAMP', 'VAR_SAMP',
      'PERCENTILE_CONT_25', 'PERCENTILE_CONT_75', 
      'PERCENTILE_DISC_25', 'PERCENTILE_DISC_75',
      ...windowFunctions,
      'SUM_OVER', 'AVG_OVER', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE'
    ];
  }
  
  if (isDateTimeDataType(dataType)) {
    return [
      ...baseAggregations, 
      'MIN', 'MAX',
      ...windowFunctions,
      'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE'
    ];
  }
  
  if (isTextDataType(dataType)) {
    return [
      ...baseAggregations, 
      'SUM', 'AVG', 'MIN', 'MAX', 'MODE', // 支持SUM和AVG，会自动进行类型转换
      ...windowFunctions,
      'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE'
    ];
  }
  
  return [...baseAggregations, ...windowFunctions];
}