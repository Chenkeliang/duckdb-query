/**
 * Visual Query Builder Utilities
 * 可视化查询构建器的工具函数
 */

// 创建默认配置
export const createDefaultConfig = (tableName = '') => ({
    tableName: tableName,
    selectedColumns: [],
    aggregations: [],
    filters: [],
    orderBy: [],
    groupBy: [],
    calculatedFields: [],
    conditionalFields: [],
    limit: null,
    isDistinct: false
});

// 聚合函数类型
export const AggregationFunction = {
    SUM: 'SUM',
    AVG: 'AVG',
    COUNT: 'COUNT',
    MIN: 'MIN',
    MAX: 'MAX',
    COUNT_DISTINCT: 'COUNT_DISTINCT'
};

// 筛选操作符
export const FilterOperator = {
    EQUAL: '=',
    NOT_EQUAL: '!=',
    GREATER_THAN: '>',
    LESS_THAN: '<',
    GREATER_EQUAL: '>=',
    LESS_EQUAL: '<=',
    LIKE: 'LIKE',
    IS_NULL: 'IS NULL',
    IS_NOT_NULL: 'IS NOT NULL',
    BETWEEN: 'BETWEEN',
    IN: 'IN',
    NOT_IN: 'NOT IN'
};

// 排序方向
export const SortDirection = {
    ASC: 'ASC',
    DESC: 'DESC'
};

// 逻辑操作符
export const LogicOperator = {
    AND: 'AND',
    OR: 'OR'
};

// 数据类型检测
export const detectColumnType = (columnName, sampleValues = []) => {
    if (!sampleValues || sampleValues.length === 0) {
        return 'text';
    }

    const nonNullValues = sampleValues.filter(v => v !== null && v !== undefined && v !== '');
    if (nonNullValues.length === 0) return 'text';

    // 检查是否为数字
    const isNumeric = nonNullValues.every(v => !isNaN(parseFloat(v)) && isFinite(v));
    if (isNumeric) {
        const hasDecimals = nonNullValues.some(v => parseFloat(v) % 1 !== 0);
        return hasDecimals ? 'decimal' : 'integer';
    }

    // 检查是否为日期
    const isDate = nonNullValues.every(v => !isNaN(Date.parse(v)));
    if (isDate) return 'date';

    // 检查是否为布尔值
    const isBool = nonNullValues.every(v =>
        v === true || v === false ||
        v === 'true' || v === 'false' ||
        v === 1 || v === 0 ||
        v === '1' || v === '0'
    );
    if (isBool) return 'boolean';

    return 'text';
};

// 生成SQL预览
export const generateSQLPreview = (config, tableName) => {
    const errors = [];
    const warnings = [];

    if (!tableName || tableName.trim() === '') {
        errors.push('表名不能为空');
        return { success: false, errors, warnings };
    }

    try {
        let sql = '';

        // SELECT 子句
        if (config.selectedColumns && config.selectedColumns.length > 0) {
            const columns = [];

            // 添加选中的列
            config.selectedColumns.forEach(col => {
                if (typeof col === 'string') {
                    columns.push(col);
                } else if (col.name) {
                    columns.push(col.name);
                }
            });

            // 添加聚合函数
            if (config.aggregations && config.aggregations.length > 0) {
                config.aggregations.forEach(agg => {
                    if (agg.function && agg.column) {
                        try {
                            // 获取列的类型信息
                            const columnTypeInfo = getColumnTypeInfo(agg.column);
                            
                            // 使用类型安全的聚合函数生成
                            const aggStr = generateAggregationSQL(agg, columnTypeInfo.type, columnTypeInfo.name);
                            columns.push(aggStr);
                        } catch (error) {
                            // 如果类型转换失败，使用原始方式但添加警告
                            warnings.push(`聚合函数 ${agg.function}(${agg.column}): ${error.message}`);
                            const aggStr = `${agg.function}(${agg.column})${agg.alias ? ` AS ${agg.alias}` : ''}`;
                            columns.push(aggStr);
                        }
                    }
                });
            }

            // 添加计算字段
            if (config.calculatedFields && config.calculatedFields.length > 0) {
                config.calculatedFields.forEach(calc => {
                    if (calc.expression && calc.alias) {
                        columns.push(`${calc.expression} AS ${calc.alias}`);
                    }
                });
            }

            sql += `SELECT ${config.isDistinct ? 'DISTINCT ' : ''}${columns.join(', ')}`;
        } else {
            sql += `SELECT ${config.isDistinct ? 'DISTINCT ' : ''}*`;
        }

        // FROM 子句
        sql += `\nFROM ${tableName}`;

        // WHERE 子句
        if (config.filters && config.filters.length > 0) {
            const whereConditions = [];

            config.filters.forEach(filter => {
                if (filter.column && filter.operator) {
                    let condition = '';

                    switch (filter.operator) {
                        case FilterOperator.IS_NULL:
                            condition = `${filter.column} IS NULL`;
                            break;
                        case FilterOperator.IS_NOT_NULL:
                            condition = `${filter.column} IS NOT NULL`;
                            break;
                        case FilterOperator.BETWEEN:
                            if (filter.value && filter.value2) {
                                condition = `${filter.column} BETWEEN '${filter.value}' AND '${filter.value2}'`;
                            }
                            break;
                        case FilterOperator.IN:
                            if (filter.values && filter.values.length > 0) {
                                const valueList = filter.values.map(v => `'${v}'`).join(', ');
                                condition = `${filter.column} IN (${valueList})`;
                            }
                            break;
                        case FilterOperator.NOT_IN:
                            if (filter.values && filter.values.length > 0) {
                                const valueList = filter.values.map(v => `'${v}'`).join(', ');
                                condition = `${filter.column} NOT IN (${valueList})`;
                            }
                            break;
                        case FilterOperator.LIKE:
                            if (filter.value !== undefined && filter.value !== null) {
                                // 自动添加通配符进行模糊匹配
                                const likeValue = `%${filter.value}%`;
                                condition = `${filter.column} LIKE '${likeValue}'`;
                            }
                            break;
                        default:
                            if (filter.value !== undefined && filter.value !== null) {
                                const value = typeof filter.value === 'string' ? `'${filter.value}'` : filter.value;
                                condition = `${filter.column} ${filter.operator} ${value}`;
                            }
                    }

                    if (condition) {
                        whereConditions.push(condition);
                    }
                }
            });

            if (whereConditions.length > 0) {
                sql += `\nWHERE ${whereConditions.join(' AND ')}`;
            }
        }

        // GROUP BY 子句 - 自动处理聚合函数的GROUP BY需求
        const hasAggregations = config.aggregations && config.aggregations.length > 0;
        let groupByColumns = [];

        if (hasAggregations) {
            // 当有聚合函数时，所有非聚合的选中列都需要加入GROUP BY
            if (config.selectedColumns && config.selectedColumns.length > 0) {
                config.selectedColumns.forEach(col => {
                    const columnName = typeof col === 'string' ? col : col.name;
                    // 检查这个列是否已经在聚合函数中使用
                    const isAggregated = config.aggregations.some(agg => agg.column === columnName);
                    if (!isAggregated) {
                        groupByColumns.push(columnName);
                    }
                });
            }
        }

        // 添加用户手动指定的GROUP BY列
        if (config.groupBy && config.groupBy.length > 0) {
            const manualGroupColumns = config.groupBy.map(col =>
                typeof col === 'string' ? col : col.name
            ).filter(Boolean);

            // 合并并去重
            manualGroupColumns.forEach(col => {
                if (!groupByColumns.includes(col)) {
                    groupByColumns.push(col);
                }
            });
        }

        if (groupByColumns.length > 0) {
            sql += `\nGROUP BY ${groupByColumns.join(', ')}`;
        }

        // ORDER BY 子句
        if (config.orderBy && config.orderBy.length > 0) {
            const orderColumns = [];

            config.orderBy.forEach(order => {
                if (order.column) {
                    const direction = order.direction || SortDirection.ASC;
                    orderColumns.push(`${order.column} ${direction}`);
                }
            });

            if (orderColumns.length > 0) {
                sql += `\nORDER BY ${orderColumns.join(', ')}`;
            }
        }

        // LIMIT 子句
        if (config.limit && config.limit > 0) {
            sql += `\nLIMIT ${config.limit}`;
        }

        // 添加注释
        sql = `-- 可视化查询生成的SQL
-- 表: ${tableName}
-- 生成时间: ${new Date().toLocaleString()}

${sql}`;

        // 检查潜在问题
        if (config.aggregations && config.aggregations.length > 0) {
            // 检查是否有非聚合列但没有GROUP BY
            if (config.selectedColumns && config.selectedColumns.length > 0) {
                const nonAggregatedColumns = config.selectedColumns.filter(col => {
                    const columnName = typeof col === 'string' ? col : col.name;
                    return !config.aggregations.some(agg => agg.column === columnName);
                });

                if (nonAggregatedColumns.length > 0 && groupByColumns.length === 0) {
                    warnings.push('使用聚合函数时，非聚合列需要添加到GROUP BY子句中');
                }
            }
        }

        if (config.filters && config.filters.length > 10) {
            warnings.push('过多的筛选条件可能影响查询性能');
        }

        return {
            success: true,
            sql: sql.trim(),
            errors,
            warnings
        };

    } catch (error) {
        errors.push(`SQL生成失败: ${error.message}`);
        return { success: false, errors, warnings };
    }
};

// 验证查询配置
export const validateConfig = (config) => {
    const errors = [];
    const warnings = [];

    if (!config.tableName || config.tableName.trim() === '') {
        errors.push('表名不能为空');
    }

    // 验证聚合配置
    if (config.aggregations) {
        config.aggregations.forEach((agg, index) => {
            if (!agg.function) {
                errors.push(`聚合 ${index + 1}: 缺少聚合函数`);
            }
            if (!agg.column) {
                errors.push(`聚合 ${index + 1}: 缺少列名`);
            }
        });
    }

    // 验证筛选配置
    if (config.filters) {
        config.filters.forEach((filter, index) => {
            if (!filter.column) {
                errors.push(`筛选 ${index + 1}: 缺少列名`);
            }
            if (!filter.operator) {
                errors.push(`筛选 ${index + 1}: 缺少操作符`);
            }
            if (filter.operator !== FilterOperator.IS_NULL &&
                filter.operator !== FilterOperator.IS_NOT_NULL &&
                (filter.value === undefined || filter.value === null)) {
                warnings.push(`筛选 ${index + 1}: 缺少筛选值`);
            }
        });
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings
    };
};

// 格式化SQL
export const formatSQL = (sql) => {
    if (!sql) return '';

    return sql
        .replace(/\s+/g, ' ')
        .replace(/\s*,\s*/g, ', ')
        .replace(/\s*\(\s*/g, '(')
        .replace(/\s*\)\s*/g, ')')
        .trim();
};

// 获取列的建议聚合函数
export const getSuggestedAggregations = (columnType) => {
    switch (columnType) {
        case 'integer':
        case 'decimal':
            return [
                AggregationFunction.SUM,
                AggregationFunction.AVG,
                AggregationFunction.MIN,
                AggregationFunction.MAX,
                AggregationFunction.COUNT
            ];
        case 'date':
            return [
                AggregationFunction.MIN,
                AggregationFunction.MAX,
                AggregationFunction.COUNT
            ];
        case 'text':
        default:
            return [
                AggregationFunction.COUNT,
                AggregationFunction.COUNT_DISTINCT
            ];
    }
};

// 获取列的建议筛选操作符
export const getSuggestedOperators = (columnType) => {
    switch (columnType) {
        case 'integer':
        case 'decimal':
            return [
                FilterOperator.EQUAL,
                FilterOperator.NOT_EQUAL,
                FilterOperator.GREATER_THAN,
                FilterOperator.LESS_THAN,
                FilterOperator.GREATER_EQUAL,
                FilterOperator.LESS_EQUAL,
                FilterOperator.BETWEEN,
                FilterOperator.IS_NULL,
                FilterOperator.IS_NOT_NULL
            ];
        case 'date':
            return [
                FilterOperator.EQUAL,
                FilterOperator.NOT_EQUAL,
                FilterOperator.GREATER_THAN,
                FilterOperator.LESS_THAN,
                FilterOperator.GREATER_EQUAL,
                FilterOperator.LESS_EQUAL,
                FilterOperator.BETWEEN,
                FilterOperator.IS_NULL,
                FilterOperator.IS_NOT_NULL
            ];
        case 'text':
        default:
            return [
                FilterOperator.EQUAL,
                FilterOperator.NOT_EQUAL,
                FilterOperator.LIKE,
                FilterOperator.IN,
                FilterOperator.NOT_IN,
                FilterOperator.IS_NULL,
                FilterOperator.IS_NOT_NULL
            ];
    }
};
// 检查聚合函数与列类型的兼容性
export const isAggregationCompatible = (aggregationFunction, columnType, columnName = '') => {
    // 数值类型检查
    const isNumericType = ['integer', 'decimal', 'bigint', 'double', 'float', 'numeric'].includes(columnType?.toLowerCase());
    const isNumericColumn = /^(amount|price|fee|cost|total|sum|count|qty|quantity|num|number|rate|percent|score|value|discount)(_|$)/i.test(columnName);
    
    switch (aggregationFunction) {
        case AggregationFunction.SUM:
        case AggregationFunction.AVG:
            // SUM和AVG对于数值类型直接兼容，对于VARCHAR但名称像数值的列也兼容（会自动转换）
            return isNumericType || isNumericColumn;
        
        case AggregationFunction.MIN:
        case AggregationFunction.MAX:
            // MIN和MAX可以用于大多数类型，但对于文本需要特殊处理
            return true;
        
        case AggregationFunction.COUNT:
        case AggregationFunction.COUNT_DISTINCT:
            // COUNT可以用于任何类型
            return true;
        
        default:
            return true;
    }
};

// 生成带类型转换的聚合函数SQL
export const generateAggregationSQL = (aggregation, columnType, columnName) => {
    const { function: func, column, alias } = aggregation;
    
    // 检查兼容性
    if (!isAggregationCompatible(func, columnType, column)) {
        throw new Error(`聚合函数 ${func} 不兼容列 ${column} 的数据类型 ${columnType}`);
    }
    
    let sqlColumn = column;
    
    // 对于可能是数值但类型为VARCHAR的列，尝试类型转换
    const isNumericType = ['integer', 'decimal', 'bigint', 'double', 'float', 'numeric'].includes(columnType?.toLowerCase());
    const isNumericColumn = /^(amount|price|fee|cost|total|sum|count|qty|quantity|num|number|rate|percent|score|value|discount)(_|$)/i.test(column);
    
    if ((func === AggregationFunction.SUM || func === AggregationFunction.AVG) && !isNumericType && isNumericColumn) {
        // 尝试将VARCHAR转换为DECIMAL，使用TRY_CAST避免转换失败
        sqlColumn = `TRY_CAST(${column} AS DECIMAL)`;
    }
    
    const aggStr = `${func}(${sqlColumn})${alias ? ` AS ${alias}` : ''}`;
    return aggStr;
};

// 获取列的数据类型信息
export const getColumnTypeInfo = (column) => {
    const columnName = typeof column === 'string' ? column : column.name;
    const columnType = typeof column === 'string' ? 'text' : (column.dataType || column.type || 'text');
    
    return {
        name: columnName,
        type: columnType.toLowerCase(),
        isNumeric: ['integer', 'decimal', 'bigint', 'double', 'float', 'numeric'].includes(columnType.toLowerCase()),
        isNumericByName: /^(amount|price|fee|cost|total|sum|count|qty|quantity|num|number|rate|percent|score|value)(_|$)/i.test(columnName)
    };
};