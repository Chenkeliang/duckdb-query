import duckdb
import pandas as pd

# 测试使用DuckDB直接读取文件
file_path = "/Users/keliang/mypy/interactive-data-query/测试大文件.csv"

try:
    # 创建DuckDB连接
    con = duckdb.connect()
    
    # 尝试使用DuckDB读取文件
    print("尝试使用DuckDB读取文件...")
    result = con.execute(f"SELECT * FROM read_csv_auto('{file_path}', SAMPLE_SIZE=10000)").fetchone()
    print(f"成功读取文件第一行: {result}")
    
    # 获取列信息
    print("获取列信息...")
    columns_info = con.execute(f"DESCRIBE SELECT * FROM read_csv_auto('{file_path}', SAMPLE_SIZE=10000)").fetchall()
    print(f"列信息: {columns_info}")
    
    # 尝试创建表
    print("尝试创建表...")
    con.execute(f"CREATE TABLE test_table AS SELECT * FROM read_csv_auto('{file_path}', SAMPLE_SIZE=10000)")
    print("成功创建表")
    
    # 查看表结构
    print("查看表结构...")
    table_info = con.execute("DESCRIBE test_table").fetchall()
    print(f"表结构: {table_info}")
    
    # 关闭连接
    con.close()
    
except Exception as e:
    print(f"使用DuckDB读取文件时出错: {e}")
    import traceback
    traceback.print_exc()

# 尝试使用pandas读取文件
try:
    print("\n尝试使用pandas读取文件...")
    df = pd.read_csv(file_path, nrows=5)
    print(f"成功用pandas读取文件前5行:\n{df}")
except Exception as e:
    print(f"使用pandas读取文件时出错: {e}")
    import traceback
    traceback.print_exc()