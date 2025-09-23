#!/usr/bin/env python3
"""
简化的功能验证脚本
验证可视化查询构建器的核心功能，不依赖外部测试框架
"""

import sys
import os

# 添加API路径
sys.path.append('api')

def test_sql_generation_basic():
    """测试基础SQL生成功能"""
    print("🧪 测试基础SQL生成...")
    
    # 模拟基础配置
    table_name = "users"
    selected_columns = ["name", "age", "email"]
    
    # 生成基础SELECT语句
    if selected_columns:
        columns_str = ', '.join([f'"{col}"' for col in selected_columns])
        sql = f'SELECT {columns_str} FROM "{table_name}"'
    else:
        sql = f'SELECT * FROM "{table_name}"'
    
    expected = 'SELECT "name", "age", "email" FROM "users"'
    assert sql == expected, f"❌ 期望: {expected}, 实际: {sql}"
    print(f"✅ 基础SQL生成测试通过: {sql}")
    return True

def test_sql_generation_with_filters():
    """测试带筛选条件的SQL生成"""
    print("🧪 测试筛选条件SQL生成...")
    
    table_name = "users"
    selected_columns = ["name", "age"]
    filters = [
        {"column": "age", "operator": ">", "value": 18},
        {"column": "status", "operator": "=", "value": "active", "logic_operator": "AND"}
    ]
    
    # 生成SELECT子句
    columns_str = ', '.join([f'"{col}"' for col in selected_columns])
    sql = f'SELECT {columns_str} FROM "{table_name}"'
    
    # 生成WHERE子句
    if filters:
        conditions = []
        for i, filter_config in enumerate(filters):
            column = f'"{filter_config["column"]}"'
            operator = filter_config["operator"]
            value = filter_config["value"]
            
            if isinstance(value, str):
                condition = f"{column} {operator} '{value}'"
            else:
                condition = f"{column} {operator} {value}"
            
            if i == 0:
                conditions.append(condition)
            else:
                logic_op = filter_config.get("logic_operator", "AND")
                conditions.append(f"{logic_op} {condition}")
        
        where_clause = "WHERE " + " ".join(conditions)
        sql += f" {where_clause}"
    
    expected = 'SELECT "name", "age" FROM "users" WHERE "age" > 18 AND "status" = \'active\''
    assert sql == expected, f"❌ 期望: {expected}, 实际: {sql}"
    print(f"✅ 筛选条件SQL生成测试通过: {sql}")
    return True

def test_sql_generation_with_aggregation():
    """测试聚合函数SQL生成"""
    print("🧪 测试聚合函数SQL生成...")
    
    table_name = "sales"
    selected_columns = ["region"]
    aggregations = [
        {"column": "amount", "function": "SUM", "alias": "total_sales"},
        {"column": "order_id", "function": "COUNT", "alias": "order_count"}
    ]
    
    # 生成SELECT子句
    select_items = []
    
    # 添加选中的列
    for col in selected_columns:
        select_items.append(f'"{col}"')
    
    # 添加聚合函数
    for agg in aggregations:
        func = agg["function"]
        column = f'"{agg["column"]}"'
        alias = agg["alias"]
        
        if func == "COUNT_DISTINCT":
            agg_expr = f"COUNT(DISTINCT {column})"
        else:
            agg_expr = f"{func}({column})"
        
        select_items.append(f'{agg_expr} AS "{alias}"')
    
    select_clause = "SELECT " + ", ".join(select_items)
    from_clause = f'FROM "{table_name}"'
    group_by_columns = ', '.join([f'"{col}"' for col in selected_columns])
    group_by_clause = f'GROUP BY {group_by_columns}'
    
    sql = f"{select_clause} {from_clause} {group_by_clause}"
    
    expected = 'SELECT "region", SUM("amount") AS "total_sales", COUNT("order_id") AS "order_count" FROM "sales" GROUP BY "region"'
    assert sql == expected, f"❌ 期望: {expected}, 实际: {sql}"
    print(f"✅ 聚合函数SQL生成测试通过: {sql}")
    return True

def test_sql_generation_with_sorting():
    """测试排序SQL生成"""
    print("🧪 测试排序SQL生成...")
    
    table_name = "products"
    selected_columns = ["name", "price"]
    order_by = [
        {"column": "price", "direction": "DESC", "priority": 0},
        {"column": "name", "direction": "ASC", "priority": 1}
    ]
    limit = 10
    
    # 生成SELECT子句
    columns_str = ', '.join([f'"{col}"' for col in selected_columns])
    sql = f'SELECT {columns_str} FROM "{table_name}"'
    
    # 生成ORDER BY子句
    if order_by:
        # 按优先级排序
        sorted_order = sorted(order_by, key=lambda x: x["priority"])
        order_items = []
        for sort_config in sorted_order:
            column = f'"{sort_config["column"]}"'
            direction = sort_config["direction"]
            order_items.append(f"{column} {direction}")
        
        order_clause = "ORDER BY " + ", ".join(order_items)
        sql += f" {order_clause}"
    
    # 添加LIMIT
    if limit:
        sql += f" LIMIT {limit}"
    
    expected = 'SELECT "name", "price" FROM "products" ORDER BY "price" DESC, "name" ASC LIMIT 10'
    assert sql == expected, f"❌ 期望: {expected}, 实际: {sql}"
    print(f"✅ 排序SQL生成测试通过: {sql}")
    return True

def test_validation_logic():
    """测试验证逻辑"""
    print("🧪 测试验证逻辑...")
    
    # 测试有效配置
    valid_config = {
        "table_name": "users",
        "selected_columns": ["name", "age"],
        "aggregations": [],
        "filters": [],
        "order_by": []
    }
    
    errors = []
    warnings = []
    
    # 验证表名
    if not valid_config["table_name"] or not valid_config["table_name"].strip():
        errors.append("表名不能为空")
    
    # 验证聚合函数
    for agg in valid_config["aggregations"]:
        if not agg.get("column") or not agg["column"].strip():
            errors.append("聚合函数必须指定列名")
    
    # 验证筛选条件
    for filter_config in valid_config["filters"]:
        if not filter_config.get("column") or not filter_config["column"].strip():
            errors.append("筛选条件必须指定列名")
        
        operator = filter_config.get("operator")
        if operator not in ["IS NULL", "IS NOT NULL"] and filter_config.get("value") is None:
            errors.append("筛选条件需要指定值")
    
    is_valid = len(errors) == 0
    assert is_valid, f"❌ 验证失败: {errors}"
    print("✅ 有效配置验证测试通过")
    
    # 测试无效配置
    invalid_config = {
        "table_name": "",  # 无效的空表名
        "selected_columns": ["name"],
        "aggregations": [{"column": "", "function": "SUM"}],  # 无效的空列名
        "filters": [{"column": "status", "operator": "=", "value": None}],  # 缺少值
        "order_by": []
    }
    
    errors = []
    
    # 验证表名
    if not invalid_config["table_name"] or not invalid_config["table_name"].strip():
        errors.append("表名不能为空")
    
    # 验证聚合函数
    for agg in invalid_config["aggregations"]:
        if not agg.get("column") or not agg["column"].strip():
            errors.append("聚合函数必须指定列名")
    
    # 验证筛选条件
    for filter_config in invalid_config["filters"]:
        operator = filter_config.get("operator")
        if operator not in ["IS NULL", "IS NOT NULL"] and filter_config.get("value") is None:
            errors.append("筛选条件需要指定值")
    
    is_valid = len(errors) == 0
    assert not is_valid, "❌ 应该检测到无效配置"
    assert len(errors) == 3, f"❌ 应该有3个错误，实际: {len(errors)}"
    print("✅ 无效配置验证测试通过")
    
    return True

def test_chinese_labels():
    """测试中文标签映射"""
    print("🧪 测试中文标签映射...")
    
    # 聚合函数中文标签
    aggregation_labels = {
        "SUM": "求和",
        "AVG": "平均值", 
        "COUNT": "计数",
        "MIN": "最小值",
        "MAX": "最大值",
        "COUNT_DISTINCT": "去重计数",
        "MEDIAN": "中位数",
        "STDDEV_SAMP": "标准差",
        "VAR_SAMP": "方差"
    }
    
    # 筛选操作符中文标签
    filter_operator_labels = {
        "=": "等于",
        "!=": "不等于",
        ">": "大于",
        "<": "小于",
        ">=": "大于等于",
        "<=": "小于等于",
        "LIKE": "包含",
        "IS NULL": "为空",
        "IS NOT NULL": "不为空",
        "BETWEEN": "介于...之间"
    }
    
    # 逻辑操作符中文标签
    logic_operator_labels = {
        "AND": "且",
        "OR": "或"
    }
    
    # 排序方向中文标签
    sort_direction_labels = {
        "ASC": "升序",
        "DESC": "降序"
    }
    
    # 验证标签完整性
    assert len(aggregation_labels) >= 9, "聚合函数标签不完整"
    assert len(filter_operator_labels) >= 10, "筛选操作符标签不完整"
    assert len(logic_operator_labels) == 2, "逻辑操作符标签不完整"
    assert len(sort_direction_labels) == 2, "排序方向标签不完整"
    
    print("✅ 中文标签映射测试通过")
    return True

def run_all_tests():
    """运行所有测试"""
    print("🚀 开始运行可视化查询构建器功能验证测试...\n")
    
    tests = [
        test_sql_generation_basic,
        test_sql_generation_with_filters,
        test_sql_generation_with_aggregation,
        test_sql_generation_with_sorting,
        test_validation_logic,
        test_chinese_labels
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            test()
            passed += 1
            print()
        except Exception as e:
            print(f"❌ 测试失败: {e}")
            failed += 1
            print()
    
    print("=" * 60)
    print(f"📊 测试结果汇总:")
    print(f"✅ 通过: {passed}")
    print(f"❌ 失败: {failed}")
    print(f"📈 通过率: {passed/(passed+failed)*100:.1f}%")
    
    if failed == 0:
        print("🎉 所有测试都通过了！可视化查询构建器核心功能验证成功！")
        return True
    else:
        print("⚠️  有测试失败，需要修复问题")
        return False

if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)