"""
DuckDB JOIN性能测试工具
用于测试和优化VARCHAR类型的JOIN操作性能
"""

import time
import logging
import pandas as pd
from typing import List, Dict, Any
from core.duckdb_engine import get_db_connection, execute_query

logger = logging.getLogger(__name__)


def test_join_performance(left_table: str, right_table: str, 
                         left_column: str, right_column: str,
                         join_type: str = "INNER") -> Dict[str, Any]:
    """
    测试两个表的JOIN性能
    
    Args:
        left_table: 左表名
        right_table: 右表名  
        left_column: 左表连接列
        right_column: 右表连接列
        join_type: JOIN类型 (INNER, LEFT, RIGHT, FULL OUTER)
    
    Returns:
        性能测试结果
    """
    con = get_db_connection()
    
    try:
        # 获取表的基本信息
        left_count = con.execute(f'SELECT COUNT(*) FROM "{left_table}"').fetchone()[0]
        right_count = con.execute(f'SELECT COUNT(*) FROM "{right_table}"').fetchone()[0]
        
        logger.info(f"开始JOIN性能测试:")
        logger.info(f"  左表: {left_table} ({left_count:,} 行)")
        logger.info(f"  右表: {right_table} ({right_count:,} 行)")
        logger.info(f"  连接列: {left_column} = {right_column}")
        logger.info(f"  JOIN类型: {join_type}")
        
        # 构建JOIN查询
        query = f'''
        SELECT COUNT(*) as result_count
        FROM "{left_table}" l
        {join_type} JOIN "{right_table}" r 
        ON l."{left_column}" = r."{right_column}"
        '''
        
        # 执行性能测试
        start_time = time.time()
        result = con.execute(query).fetchone()
        execution_time = (time.time() - start_time) * 1000
        
        result_count = result[0] if result else 0
        
        # 计算性能指标
        performance_metrics = {
            'left_table': left_table,
            'right_table': right_table,
            'left_rows': left_count,
            'right_rows': right_count,
            'total_input_rows': left_count + right_count,
            'result_rows': result_count,
            'execution_time_ms': execution_time,
            'rows_per_second': (left_count + right_count) / (execution_time / 1000) if execution_time > 0 else 0,
            'join_type': join_type,
            'status': 'success'
        }
        
        # 性能评估
        if execution_time < 1000:
            performance_level = "优秀"
        elif execution_time < 5000:
            performance_level = "良好"
        elif execution_time < 15000:
            performance_level = "一般"
        else:
            performance_level = "需要优化"
            
        performance_metrics['performance_level'] = performance_level
        
        logger.info(f"JOIN性能测试完成:")
        logger.info(f"  执行时间: {execution_time:.2f}ms")
        logger.info(f"  结果行数: {result_count:,}")
        logger.info(f"  处理速度: {performance_metrics['rows_per_second']:.0f} 行/秒")
        logger.info(f"  性能评级: {performance_level}")
        
        return performance_metrics
        
    except Exception as e:
        logger.error(f"JOIN性能测试失败: {str(e)}")
        return {
            'left_table': left_table,
            'right_table': right_table,
            'status': 'error',
            'error': str(e),
            'execution_time_ms': 0
        }


def analyze_table_statistics(table_name: str) -> Dict[str, Any]:
    """
    分析表的统计信息，用于JOIN优化
    """
    con = get_db_connection()
    
    try:
        # 基本统计
        row_count = con.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]
        
        # 列信息
        columns_info = con.execute(f'DESCRIBE "{table_name}"').fetchall()
        
        # 分析每列的唯一值数量（用于评估JOIN选择性）
        column_stats = {}
        for col_name, col_type, *_ in columns_info:
            try:
                distinct_count = con.execute(f'SELECT COUNT(DISTINCT "{col_name}") FROM "{table_name}"').fetchone()[0]
                null_count = con.execute(f'SELECT COUNT(*) FROM "{table_name}" WHERE "{col_name}" IS NULL').fetchone()[0]
                
                column_stats[col_name] = {
                    'type': col_type,
                    'distinct_count': distinct_count,
                    'null_count': null_count,
                    'selectivity': distinct_count / row_count if row_count > 0 else 0
                }
            except Exception as e:
                logger.warning(f"无法获取列 {col_name} 的统计信息: {str(e)}")
                column_stats[col_name] = {
                    'type': col_type,
                    'error': str(e)
                }
        
        return {
            'table_name': table_name,
            'row_count': row_count,
            'column_count': len(columns_info),
            'column_stats': column_stats
        }
        
    except Exception as e:
        logger.error(f"分析表统计信息失败 {table_name}: {str(e)}")
        return {
            'table_name': table_name,
            'error': str(e)
        }


def suggest_join_optimization(left_table: str, right_table: str,
                            left_column: str, right_column: str) -> List[str]:
    """
    基于表统计信息提供JOIN优化建议
    """
    suggestions = []
    
    try:
        # 分析两个表的统计信息
        left_stats = analyze_table_statistics(left_table)
        right_stats = analyze_table_statistics(right_table)
        
        left_rows = left_stats.get('row_count', 0)
        right_rows = right_stats.get('row_count', 0)
        
        # 基于表大小的建议
        if left_rows > right_rows * 10:
            suggestions.append(f"建议将小表 {right_table} 作为右表，大表 {left_table} 作为左表")
        elif right_rows > left_rows * 10:
            suggestions.append(f"建议将小表 {left_table} 作为右表，大表 {right_table} 作为左表")
        
        # 基于列选择性的建议
        left_col_stats = left_stats.get('column_stats', {}).get(left_column, {})
        right_col_stats = right_stats.get('column_stats', {}).get(right_column, {})
        
        left_selectivity = left_col_stats.get('selectivity', 0)
        right_selectivity = right_col_stats.get('selectivity', 0)
        
        if left_selectivity < 0.1:
            suggestions.append(f"左表连接列 {left_column} 选择性较低 ({left_selectivity:.2%})，考虑添加索引")
        if right_selectivity < 0.1:
            suggestions.append(f"右表连接列 {right_column} 选择性较低 ({right_selectivity:.2%})，考虑添加索引")
        
        # 基于NULL值的建议
        left_nulls = left_col_stats.get('null_count', 0)
        right_nulls = right_col_stats.get('null_count', 0)
        
        if left_nulls > left_rows * 0.1:
            suggestions.append(f"左表连接列 {left_column} 有较多NULL值 ({left_nulls:,})，考虑数据清理")
        if right_nulls > right_rows * 0.1:
            suggestions.append(f"右表连接列 {right_column} 有较多NULL值 ({right_nulls:,})，考虑数据清理")
        
        # 通用优化建议
        total_rows = left_rows + right_rows
        if total_rows > 100000:
            suggestions.append("大数据量JOIN，建议确保有足够的内存配置")
            suggestions.append("考虑在JOIN列上创建索引")
            suggestions.append("如果可能，考虑数据预处理和去重")
        
        if not suggestions:
            suggestions.append("当前JOIN配置看起来合理，无特殊优化建议")
            
    except Exception as e:
        logger.error(f"生成优化建议失败: {str(e)}")
        suggestions.append(f"无法分析表统计信息: {str(e)}")
    
    return suggestions


def run_comprehensive_join_test(left_table: str, right_table: str,
                               left_column: str, right_column: str) -> Dict[str, Any]:
    """
    运行综合的JOIN性能测试和分析
    """
    logger.info("开始综合JOIN性能测试...")
    
    # 1. 基础性能测试
    performance_result = test_join_performance(left_table, right_table, 
                                             left_column, right_column)
    
    # 2. 获取优化建议
    optimization_suggestions = suggest_join_optimization(left_table, right_table,
                                                       left_column, right_column)
    
    # 3. 表统计信息
    left_stats = analyze_table_statistics(left_table)
    right_stats = analyze_table_statistics(right_table)
    
    return {
        'performance_test': performance_result,
        'optimization_suggestions': optimization_suggestions,
        'left_table_stats': left_stats,
        'right_table_stats': right_stats,
        'test_timestamp': time.time()
    }
