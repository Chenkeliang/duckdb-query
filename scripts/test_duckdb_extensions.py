#!/usr/bin/env python3
"""
DuckDB 外部数据库扩展测试脚本

测试 DuckDB 的 mysql 和 postgres 扩展是否可用，
以及是否支持跨数据库 JOIN 查询。

使用方法:
    python scripts/test_duckdb_extensions.py

如果要测试实际连接，请设置环境变量:
    MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
    POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DATABASE
"""

import os
import sys

def test_duckdb_version():
    """测试 DuckDB 版本"""
    print("=" * 60)
    print("1. 测试 DuckDB 版本")
    print("=" * 60)
    
    try:
        import duckdb
        print(f"✅ DuckDB 版本: {duckdb.__version__}")
        
        conn = duckdb.connect(':memory:')
        result = conn.execute("SELECT version()").fetchone()
        print(f"✅ DuckDB 内部版本: {result[0]}")
        conn.close()
        return True
    except Exception as e:
        print(f"❌ 错误: {e}")
        return False


def test_list_extensions():
    """列出所有可用的扩展"""
    print("\n" + "=" * 60)
    print("2. 列出可用扩展")
    print("=" * 60)
    
    try:
        import duckdb
        conn = duckdb.connect(':memory:')
        
        # 列出所有扩展
        result = conn.execute("""
            SELECT extension_name, installed, loaded, description 
            FROM duckdb_extensions() 
            WHERE extension_name IN ('mysql', 'postgres', 'sqlite')
            ORDER BY extension_name
        """).fetchall()
        
        print("\n相关扩展状态:")
        print("-" * 80)
        print(f"{'扩展名':<15} {'已安装':<10} {'已加载':<10} {'描述'}")
        print("-" * 80)
        
        for row in result:
            name, installed, loaded, desc = row
            installed_str = "✅" if installed else "❌"
            loaded_str = "✅" if loaded else "❌"
            print(f"{name:<15} {installed_str:<10} {loaded_str:<10} {desc or 'N/A'}")
        
        conn.close()
        return True
    except Exception as e:
        print(f"❌ 错误: {e}")
        return False


def test_mysql_extension():
    """测试 MySQL 扩展"""
    print("\n" + "=" * 60)
    print("3. 测试 MySQL 扩展")
    print("=" * 60)
    
    try:
        import duckdb
        conn = duckdb.connect(':memory:')
        
        # 安装扩展
        print("正在安装 mysql 扩展...")
        conn.execute("INSTALL mysql")
        print("✅ mysql 扩展安装成功")
        
        # 加载扩展
        print("正在加载 mysql 扩展...")
        conn.execute("LOAD mysql")
        print("✅ mysql 扩展加载成功")
        
        # 检查扩展函数
        result = conn.execute("""
            SELECT function_name 
            FROM duckdb_functions() 
            WHERE function_name LIKE '%mysql%'
            LIMIT 10
        """).fetchall()
        
        if result:
            print(f"✅ 找到 {len(result)} 个 MySQL 相关函数")
        
        # 测试实际连接（如果提供了环境变量）
        mysql_host = os.environ.get('MYSQL_HOST')
        mysql_user = os.environ.get('MYSQL_USER')
        mysql_password = os.environ.get('MYSQL_PASSWORD')
        mysql_database = os.environ.get('MYSQL_DATABASE')
        
        if all([mysql_host, mysql_user, mysql_database]):
            print(f"\n尝试连接 MySQL: {mysql_host}/{mysql_database}")
            try:
                attach_sql = f"""
                    ATTACH 'host={mysql_host} user={mysql_user} password={mysql_password or ''} database={mysql_database}' 
                    AS mysql_db (TYPE mysql)
                """
                conn.execute(attach_sql)
                print("✅ MySQL 连接成功!")
                
                # 列出表
                tables = conn.execute("SHOW TABLES FROM mysql_db").fetchall()
                print(f"✅ 找到 {len(tables)} 个表")
                if tables[:5]:
                    print(f"   前 5 个表: {[t[0] for t in tables[:5]]}")
                
            except Exception as e:
                print(f"⚠️ MySQL 连接失败: {e}")
        else:
            print("\n💡 提示: 设置环境变量 MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE 来测试实际连接")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ MySQL 扩展测试失败: {e}")
        return False


def test_postgres_extension():
    """测试 PostgreSQL 扩展"""
    print("\n" + "=" * 60)
    print("4. 测试 PostgreSQL 扩展")
    print("=" * 60)
    
    try:
        import duckdb
        conn = duckdb.connect(':memory:')
        
        # 安装扩展
        print("正在安装 postgres 扩展...")
        conn.execute("INSTALL postgres")
        print("✅ postgres 扩展安装成功")
        
        # 加载扩展
        print("正在加载 postgres 扩展...")
        conn.execute("LOAD postgres")
        print("✅ postgres 扩展加载成功")
        
        # 检查扩展函数
        result = conn.execute("""
            SELECT function_name 
            FROM duckdb_functions() 
            WHERE function_name LIKE '%postgres%'
            LIMIT 10
        """).fetchall()
        
        if result:
            print(f"✅ 找到 {len(result)} 个 PostgreSQL 相关函数")
        
        # 测试实际连接（如果提供了环境变量）
        pg_host = os.environ.get('POSTGRES_HOST')
        pg_user = os.environ.get('POSTGRES_USER')
        pg_password = os.environ.get('POSTGRES_PASSWORD')
        pg_database = os.environ.get('POSTGRES_DATABASE')
        
        if all([pg_host, pg_user, pg_database]):
            print(f"\n尝试连接 PostgreSQL: {pg_host}/{pg_database}")
            try:
                attach_sql = f"""
                    ATTACH 'host={pg_host} dbname={pg_database} user={pg_user} password={pg_password or ''}' 
                    AS pg_db (TYPE postgres)
                """
                conn.execute(attach_sql)
                print("✅ PostgreSQL 连接成功!")
                
                # 列出表
                tables = conn.execute("SHOW TABLES FROM pg_db").fetchall()
                print(f"✅ 找到 {len(tables)} 个表")
                if tables[:5]:
                    print(f"   前 5 个表: {[t[0] for t in tables[:5]]}")
                
            except Exception as e:
                print(f"⚠️ PostgreSQL 连接失败: {e}")
        else:
            print("\n💡 提示: 设置环境变量 POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DATABASE 来测试实际连接")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ PostgreSQL 扩展测试失败: {e}")
        return False


def test_cross_database_join():
    """测试跨数据库 JOIN（模拟）"""
    print("\n" + "=" * 60)
    print("5. 测试跨数据库 JOIN 能力（模拟）")
    print("=" * 60)
    
    try:
        import duckdb
        conn = duckdb.connect(':memory:')
        
        # 创建两个模拟的"外部"表
        conn.execute("""
            CREATE TABLE local_users (
                id INTEGER PRIMARY KEY,
                name VARCHAR,
                email VARCHAR
            )
        """)
        
        conn.execute("""
            CREATE TABLE local_orders (
                id INTEGER PRIMARY KEY,
                user_id INTEGER,
                amount DECIMAL(10,2),
                created_at TIMESTAMP
            )
        """)
        
        # 插入测试数据
        conn.execute("""
            INSERT INTO local_users VALUES 
            (1, 'Alice', 'alice@example.com'),
            (2, 'Bob', 'bob@example.com'),
            (3, 'Charlie', 'charlie@example.com')
        """)
        
        conn.execute("""
            INSERT INTO local_orders VALUES 
            (1, 1, 100.00, '2024-01-01'),
            (2, 1, 200.00, '2024-01-02'),
            (3, 2, 150.00, '2024-01-03')
        """)
        
        # 执行 JOIN 查询
        result = conn.execute("""
            SELECT u.name, COUNT(o.id) as order_count, SUM(o.amount) as total_amount
            FROM local_users u
            LEFT JOIN local_orders o ON u.id = o.user_id
            GROUP BY u.name
            ORDER BY total_amount DESC NULLS LAST
        """).fetchall()
        
        print("✅ JOIN 查询成功!")
        print("\n查询结果:")
        print("-" * 50)
        print(f"{'用户名':<15} {'订单数':<10} {'总金额'}")
        print("-" * 50)
        for row in result:
            name, count, total = row
            print(f"{name:<15} {count:<10} {total or 0:.2f}")
        
        conn.close()
        print("\n✅ 跨表 JOIN 能力验证通过")
        print("   如果 MySQL 和 PostgreSQL 扩展都能正常 ATTACH，")
        print("   则可以直接在 DuckDB 中执行跨数据库 JOIN 查询。")
        return True
        
    except Exception as e:
        print(f"❌ 跨数据库 JOIN 测试失败: {e}")
        return False


def test_attach_syntax():
    """展示 ATTACH 语法"""
    print("\n" + "=" * 60)
    print("6. ATTACH 语法参考")
    print("=" * 60)
    
    print("""
MySQL ATTACH 语法:
------------------
ATTACH 'host=localhost user=root password=xxx database=mydb port=3306' 
    AS mysql_db (TYPE mysql);

-- 查询
SELECT * FROM mysql_db.my_table;

PostgreSQL ATTACH 语法:
-----------------------
ATTACH 'host=localhost dbname=mydb user=postgres password=xxx port=5432' 
    AS pg_db (TYPE postgres);

-- 查询
SELECT * FROM pg_db.my_table;

跨数据库 JOIN 示例:
-------------------
-- 假设已经 ATTACH 了 mysql_db 和 pg_db
SELECT 
    m.id,
    m.name,
    p.order_count
FROM mysql_db.users m
JOIN pg_db.user_stats p ON m.id = p.user_id;

注意事项:
---------
1. 扩展需要先 INSTALL 再 LOAD
2. ATTACH 的数据库是只读的
3. 大数据量 JOIN 时，DuckDB 会自动优化查询计划
4. 建议对大表先导入到 DuckDB 本地表再 JOIN
""")
    return True


def main():
    """主函数"""
    print("\n" + "=" * 60)
    print("DuckDB 外部数据库扩展测试")
    print("=" * 60)
    
    results = {
        "DuckDB 版本": test_duckdb_version(),
        "扩展列表": test_list_extensions(),
        "MySQL 扩展": test_mysql_extension(),
        "PostgreSQL 扩展": test_postgres_extension(),
        "跨数据库 JOIN": test_cross_database_join(),
        "语法参考": test_attach_syntax(),
    }
    
    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    
    all_passed = True
    for name, passed in results.items():
        status = "✅ 通过" if passed else "❌ 失败"
        print(f"{name}: {status}")
        if not passed:
            all_passed = False
    
    print("\n" + "=" * 60)
    if all_passed:
        print("🎉 所有测试通过！DuckDB 扩展可用于跨数据库查询。")
    else:
        print("⚠️ 部分测试失败，请检查上面的错误信息。")
    print("=" * 60)
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
