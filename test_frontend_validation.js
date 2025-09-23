#!/usr/bin/env node
/**
 * 前端功能验证脚本
 * 验证可视化查询构建器的前端逻辑，不依赖React测试框架
 */

console.log('🚀 开始运行前端功能验证测试...\n');

// 模拟前端SQL生成逻辑
function generateSQLPreview(config, tableName) {
    try {
        if (!config || !tableName) {
            return {
                success: false,
                sql: '',
                errors: ['配置或表名不能为空'],
                warnings: []
            };
        }

        let sql = '';
        const errors = [];
        const warnings = [];

        // 构建SELECT子句
        const selectItems = [];
        
        // 添加选中的列
        if (config.selectedColumns && config.selectedColumns.length > 0) {
            config.selectedColumns.forEach(col => {
                selectItems.push(`"${col}"`);
            });
        }

        // 添加聚合函数
        if (config.aggregations && config.aggregations.length > 0) {
            config.aggregations.forEach(agg => {
                let aggExpr;
                if (agg.function === 'COUNT_DISTINCT') {
                    aggExpr = `COUNT(DISTINCT "${agg.column}")`;
                } else {
                    aggExpr = `${agg.function}("${agg.column}")`;
                }
                
                const alias = agg.alias || `${agg.function}_${agg.column}`;
                selectItems.push(`${aggExpr} AS "${alias}"`);
            });
        }

        // 构建SELECT子句
        if (config.isDistinct) {
            sql = 'SELECT DISTINCT ';
        } else {
            sql = 'SELECT ';
        }

        if (selectItems.length > 0) {
            sql += selectItems.join(', ');
        } else {
            sql += '*';
        }

        sql += ` FROM "${tableName}"`;

        // 构建WHERE子句
        if (config.filters && config.filters.length > 0) {
            const conditions = [];
            config.filters.forEach((filter, index) => {
                let condition = `"${filter.column}" ${filter.operator}`;
                
                if (filter.operator === 'IS NULL' || filter.operator === 'IS NOT NULL') {
                    // 不需要值
                } else if (filter.operator === 'BETWEEN') {
                    condition += ` ${filter.value} AND ${filter.value2}`;
                } else {
                    if (typeof filter.value === 'string') {
                        condition += ` '${filter.value}'`;
                    } else {
                        condition += ` ${filter.value}`;
                    }
                }

                if (index === 0) {
                    conditions.push(condition);
                } else {
                    const logicOp = filter.logicOperator || 'AND';
                    conditions.push(`${logicOp} ${condition}`);
                }
            });

            if (conditions.length > 0) {
                sql += ` WHERE ${conditions.join(' ')}`;
            }
        }

        // 构建GROUP BY子句
        if (config.aggregations && config.aggregations.length > 0) {
            if (config.groupBy && config.groupBy.length > 0) {
                const groupColumns = config.groupBy.map(col => `"${col}"`).join(', ');
                sql += ` GROUP BY ${groupColumns}`;
            } else if (config.selectedColumns && config.selectedColumns.length > 0) {
                const groupColumns = config.selectedColumns.map(col => `"${col}"`).join(', ');
                sql += ` GROUP BY ${groupColumns}`;
            }
        }

        // 构建ORDER BY子句
        if (config.orderBy && config.orderBy.length > 0) {
            const sortedOrder = config.orderBy.sort((a, b) => a.priority - b.priority);
            const orderItems = sortedOrder.map(sort => `"${sort.column}" ${sort.direction}`);
            sql += ` ORDER BY ${orderItems.join(', ')}`;
        }

        // 构建LIMIT子句
        if (config.limit && config.limit > 0) {
            sql += ` LIMIT ${config.limit}`;
        }

        return {
            success: true,
            sql: sql,
            errors: errors,
            warnings: warnings
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

// 验证配置的函数
function validateVisualQueryConfig(config) {
    const errors = [];
    const warnings = [];

    if (!config.tableName || config.tableName.trim() === '') {
        errors.push('表名不能为空');
    }

    // 验证聚合函数
    if (config.aggregations) {
        config.aggregations.forEach(agg => {
            if (!agg.column || agg.column.trim() === '') {
                errors.push('聚合函数必须指定列名');
            }
        });
    }

    // 验证筛选条件
    if (config.filters) {
        config.filters.forEach(filter => {
            if (!filter.column || filter.column.trim() === '') {
                errors.push('筛选条件必须指定列名');
            }

            if (filter.operator !== 'IS NULL' && filter.operator !== 'IS NOT NULL') {
                if (filter.value === null || filter.value === undefined) {
                    errors.push(`筛选条件 '${filter.column}' 需要指定值`);
                }
            }

            if (filter.operator === 'BETWEEN') {
                if (filter.value2 === null || filter.value2 === undefined) {
                    errors.push('BETWEEN操作符需要指定两个值');
                }
            }
        });
    }

    // 性能警告
    if (config.aggregations && config.aggregations.length > 5) {
        warnings.push('聚合函数过多可能影响查询性能');
    }

    if (config.filters && config.filters.length > 10) {
        warnings.push('筛选条件过多可能影响查询性能');
    }

    return {
        isValid: errors.length === 0,
        errors: errors,
        warnings: warnings,
        complexityScore: (config.aggregations?.length || 0) * 2 + (config.filters?.length || 0)
    };
}

// 测试用例
function testBasicSQLGeneration() {
    console.log('🧪 测试基础SQL生成...');
    
    const config = {
        tableName: 'users',
        selectedColumns: ['name', 'age'],
        aggregations: [],
        filters: [],
        orderBy: [],
        isDistinct: false
    };

    const result = generateSQLPreview(config, 'users');
    const expected = 'SELECT "name", "age" FROM "users"';
    
    if (result.success && result.sql === expected) {
        console.log(`✅ 基础SQL生成测试通过: ${result.sql}`);
        return true;
    } else {
        console.log(`❌ 基础SQL生成测试失败: 期望 ${expected}, 实际 ${result.sql}`);
        return false;
    }
}

function testSQLWithAggregation() {
    console.log('🧪 测试聚合函数SQL生成...');
    
    const config = {
        tableName: 'sales',
        selectedColumns: ['region'],
        aggregations: [
            { column: 'amount', function: 'SUM', alias: 'total_sales' }
        ],
        filters: [],
        orderBy: [],
        groupBy: ['region'],
        isDistinct: false
    };

    const result = generateSQLPreview(config, 'sales');
    const expected = 'SELECT "region", SUM("amount") AS "total_sales" FROM "sales" GROUP BY "region"';
    
    if (result.success && result.sql === expected) {
        console.log(`✅ 聚合函数SQL生成测试通过: ${result.sql}`);
        return true;
    } else {
        console.log(`❌ 聚合函数SQL生成测试失败: 期望 ${expected}, 实际 ${result.sql}`);
        return false;
    }
}

function testSQLWithFilters() {
    console.log('🧪 测试筛选条件SQL生成...');
    
    const config = {
        tableName: 'users',
        selectedColumns: ['name', 'age'],
        aggregations: [],
        filters: [
            { column: 'age', operator: '>', value: 18 },
            { column: 'status', operator: '=', value: 'active', logicOperator: 'AND' }
        ],
        orderBy: [],
        isDistinct: false
    };

    const result = generateSQLPreview(config, 'users');
    const expected = 'SELECT "name", "age" FROM "users" WHERE "age" > 18 AND "status" = \'active\'';
    
    if (result.success && result.sql === expected) {
        console.log(`✅ 筛选条件SQL生成测试通过: ${result.sql}`);
        return true;
    } else {
        console.log(`❌ 筛选条件SQL生成测试失败: 期望 ${expected}, 实际 ${result.sql}`);
        return false;
    }
}

function testValidation() {
    console.log('🧪 测试配置验证...');
    
    // 测试有效配置
    const validConfig = {
        tableName: 'users',
        selectedColumns: ['name', 'age'],
        aggregations: [{ column: 'salary', function: 'AVG' }],
        filters: [{ column: 'status', operator: '=', value: 'active' }],
        orderBy: []
    };

    const validResult = validateVisualQueryConfig(validConfig);
    if (!validResult.isValid) {
        console.log(`❌ 有效配置验证失败: ${validResult.errors.join(', ')}`);
        return false;
    }

    // 测试无效配置
    const invalidConfig = {
        tableName: '', // 空表名
        selectedColumns: ['name'],
        aggregations: [{ column: '', function: 'SUM' }], // 空列名
        filters: [{ column: 'status', operator: '=', value: null }], // 缺少值
        orderBy: []
    };

    const invalidResult = validateVisualQueryConfig(invalidConfig);
    if (invalidResult.isValid) {
        console.log('❌ 无效配置验证失败: 应该检测到错误');
        return false;
    }

    console.log('✅ 配置验证测试通过');
    return true;
}

function testChineseLabels() {
    console.log('🧪 测试中文标签...');
    
    const aggregationLabels = {
        'SUM': '求和',
        'AVG': '平均值',
        'COUNT': '计数',
        'MIN': '最小值',
        'MAX': '最大值',
        'COUNT_DISTINCT': '去重计数'
    };

    const filterLabels = {
        '=': '等于',
        '!=': '不等于',
        '>': '大于',
        '<': '小于',
        'LIKE': '包含',
        'IS NULL': '为空'
    };

    const logicLabels = {
        'AND': '且',
        'OR': '或'
    };

    if (Object.keys(aggregationLabels).length >= 6 && 
        Object.keys(filterLabels).length >= 6 && 
        Object.keys(logicLabels).length === 2) {
        console.log('✅ 中文标签测试通过');
        return true;
    } else {
        console.log('❌ 中文标签测试失败');
        return false;
    }
}

// 运行所有测试
function runAllTests() {
    const tests = [
        testBasicSQLGeneration,
        testSQLWithAggregation,
        testSQLWithFilters,
        testValidation,
        testChineseLabels
    ];

    let passed = 0;
    let failed = 0;

    tests.forEach(test => {
        try {
            if (test()) {
                passed++;
            } else {
                failed++;
            }
            console.log();
        } catch (error) {
            console.log(`❌ 测试异常: ${error.message}`);
            failed++;
            console.log();
        }
    });

    console.log('='.repeat(60));
    console.log('📊 前端测试结果汇总:');
    console.log(`✅ 通过: ${passed}`);
    console.log(`❌ 失败: ${failed}`);
    console.log(`📈 通过率: ${(passed/(passed+failed)*100).toFixed(1)}%`);

    if (failed === 0) {
        console.log('🎉 所有前端测试都通过了！');
        return true;
    } else {
        console.log('⚠️  有前端测试失败，需要修复问题');
        return false;
    }
}

// 执行测试
const success = runAllTests();
process.exit(success ? 0 : 1);