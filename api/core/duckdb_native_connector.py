"""
DuckDB原生数据库连接器
使用DuckDB官方的MySQL和PostgreSQL扩展，实现更高效的数据库集成
"""

import duckdb
import logging
from typing import Dict, Any, Optional, List
from models.query_models import DataSourceType, DatabaseConnection

logger = logging.getLogger(__name__)


class DuckDBNativeConnector:
    """DuckDB原生数据库连接器"""
    
    def __init__(self, duckdb_connection=None):
        self.con = duckdb_connection
        self.installed_extensions = set()
        self.attached_databases = {}
    
    def install_extensions(self):
        """安装必要的DuckDB扩展"""
        try:
            # 安装MySQL扩展
            if 'mysql' not in self.installed_extensions:
                logger.info("安装DuckDB MySQL扩展...")
                self.con.execute("INSTALL mysql")
                self.con.execute("LOAD mysql")
                self.installed_extensions.add('mysql')
                logger.info("✅ MySQL扩展安装成功")
            
            # 安装PostgreSQL扩展
            if 'postgres' not in self.installed_extensions:
                logger.info("安装DuckDB PostgreSQL扩展...")
                self.con.execute("INSTALL postgres")
                self.con.execute("LOAD postgres")
                self.installed_extensions.add('postgres')
                logger.info("✅ PostgreSQL扩展安装成功")
                
        except Exception as e:
            logger.error(f"安装DuckDB扩展失败: {str(e)}")
            raise
    
    def attach_mysql_database(self, connection: DatabaseConnection) -> str:
        """使用DuckDB原生方式连接MySQL数据库"""
        try:
            self.install_extensions()
            
            params = connection.params
            host = params.get('host', 'localhost')
            port = params.get('port', 3306)
            user = params.get('user', '')
            password = params.get('password', '')
            database = params.get('database', '')
            
            # 构建连接字符串
            connection_string = f"host={host} port={port} user={user} password={password} database={database}"
            
            # 使用ATTACH命令连接MySQL数据库
            attach_sql = f"""
            ATTACH '{connection_string}' AS {connection.id} (TYPE mysql)
            """
            
            self.con.execute(attach_sql)
            self.attached_databases[connection.id] = {
                'type': 'mysql',
                'connection': connection
            }
            
            logger.info(f"✅ MySQL数据库 {connection.id} 连接成功")
            return connection.id
            
        except Exception as e:
            logger.error(f"连接MySQL数据库失败: {str(e)}")
            raise
    
    def attach_postgresql_database(self, connection: DatabaseConnection) -> str:
        """使用DuckDB原生方式连接PostgreSQL数据库"""
        try:
            self.install_extensions()
            
            params = connection.params
            host = params.get('host', 'localhost')
            port = params.get('port', 5432)
            user = params.get('user', '')
            password = params.get('password', '')
            database = params.get('database', '')
            
            # 构建连接字符串
            connection_string = f"host={host} port={port} user={user} password={password} dbname={database}"
            
            # 使用ATTACH命令连接PostgreSQL数据库
            attach_sql = f"""
            ATTACH '{connection_string}' AS {connection.id} (TYPE postgres)
            """
            
            self.con.execute(attach_sql)
            self.attached_databases[connection.id] = {
                'type': 'postgres',
                'connection': connection
            }
            
            logger.info(f"✅ PostgreSQL数据库 {connection.id} 连接成功")
            return connection.id
            
        except Exception as e:
            logger.error(f"连接PostgreSQL数据库失败: {str(e)}")
            raise
    
    def list_tables(self, database_id: str) -> List[str]:
        """列出指定数据库中的表"""
        try:
            if database_id not in self.attached_databases:
                raise ValueError(f"数据库 {database_id} 未连接")
            
            # 查询表列表
            result = self.con.execute(f"SHOW TABLES FROM {database_id}").fetchall()
            tables = [row[0] for row in result]
            
            logger.info(f"数据库 {database_id} 包含 {len(tables)} 个表")
            return tables
            
        except Exception as e:
            logger.error(f"获取表列表失败: {str(e)}")
            raise
    
    def get_table_schema(self, database_id: str, table_name: str) -> Dict[str, Any]:
        """获取表结构信息"""
        try:
            if database_id not in self.attached_databases:
                raise ValueError(f"数据库 {database_id} 未连接")
            
            # 获取表结构
            schema_sql = f"DESCRIBE {database_id}.{table_name}"
            schema_result = self.con.execute(schema_sql).fetchdf()
            
            # 获取行数
            count_sql = f"SELECT COUNT(*) FROM {database_id}.{table_name}"
            count_result = self.con.execute(count_sql).fetchone()
            row_count = count_result[0] if count_result else 0
            
            return {
                'database_id': database_id,
                'table_name': table_name,
                'columns': schema_result.to_dict('records'),
                'row_count': row_count
            }
            
        except Exception as e:
            logger.error(f"获取表结构失败: {str(e)}")
            raise
    
    def execute_cross_database_query(self, query: str):
        """执行跨数据库查询"""
        try:
            logger.info(f"执行跨数据库查询: {query}")
            result = self.con.execute(query).fetchdf()
            logger.info(f"查询完成，返回 {len(result)} 行数据")
            return result
            
        except Exception as e:
            logger.error(f"跨数据库查询失败: {str(e)}")
            raise
    
    def create_view_from_query(self, view_name: str, database_id: str, query: str):
        """从数据库查询创建视图"""
        try:
            # 创建视图，引用外部数据库表
            view_sql = f"""
            CREATE OR REPLACE VIEW {view_name} AS 
            SELECT * FROM ({query}) AS subquery
            """
            
            # 如果查询中没有指定数据库前缀，自动添加
            if f"{database_id}." not in query:
                # 简单的表名替换（实际应用中可能需要更复杂的SQL解析）
                import re
                # 查找FROM子句中的表名并添加数据库前缀
                query = re.sub(
                    r'\bFROM\s+(\w+)',
                    f'FROM {database_id}.\\1',
                    query,
                    flags=re.IGNORECASE
                )
                query = re.sub(
                    r'\bJOIN\s+(\w+)',
                    f'JOIN {database_id}.\\1',
                    query,
                    flags=re.IGNORECASE
                )
            
            view_sql = f"CREATE OR REPLACE VIEW {view_name} AS {query}"
            
            self.con.execute(view_sql)
            logger.info(f"✅ 视图 {view_name} 创建成功")
            
        except Exception as e:
            logger.error(f"创建视图失败: {str(e)}")
            raise
    
    def detach_database(self, database_id: str):
        """断开数据库连接"""
        try:
            if database_id in self.attached_databases:
                self.con.execute(f"DETACH {database_id}")
                del self.attached_databases[database_id]
                logger.info(f"✅ 数据库 {database_id} 已断开连接")
            
        except Exception as e:
            logger.error(f"断开数据库连接失败: {str(e)}")
            raise
    
    def get_attached_databases(self) -> Dict[str, Dict]:
        """获取已连接的数据库列表"""
        return self.attached_databases.copy()
    
    def test_connection(self, connection: DatabaseConnection) -> bool:
        """测试数据库连接"""
        try:
            if connection.type == DataSourceType.MYSQL:
                # 临时连接测试
                temp_id = f"test_{connection.id}"
                self.attach_mysql_database(
                    DatabaseConnection(
                        id=temp_id,
                        type=connection.type,
                        params=connection.params
                    )
                )
                # 执行简单查询测试
                self.con.execute(f"SELECT 1 FROM {temp_id}.information_schema.tables LIMIT 1")
                self.detach_database(temp_id)
                return True
                
            elif connection.type == DataSourceType.POSTGRESQL:
                # 临时连接测试
                temp_id = f"test_{connection.id}"
                self.attach_postgresql_database(
                    DatabaseConnection(
                        id=temp_id,
                        type=connection.type,
                        params=connection.params
                    )
                )
                # 执行简单查询测试
                self.con.execute(f"SELECT 1 FROM {temp_id}.information_schema.tables LIMIT 1")
                self.detach_database(temp_id)
                return True
                
            return False
            
        except Exception as e:
            logger.error(f"连接测试失败: {str(e)}")
            return False
    
    def optimize_query(self, query: str) -> str:
        """优化跨数据库查询"""
        try:
            # 获取查询计划
            explain_query = f"EXPLAIN {query}"
            plan = self.con.execute(explain_query).fetchdf()
            logger.info(f"查询计划:\n{plan.to_string()}")
            
            # 这里可以添加查询优化逻辑
            # 例如：推送谓词到远程数据库、优化JOIN顺序等
            
            return query
            
        except Exception as e:
            logger.warning(f"查询优化失败: {str(e)}")
            return query


# 全局DuckDB原生连接器实例
def get_native_connector(duckdb_connection=None):
    """获取DuckDB原生连接器实例"""
    if duckdb_connection is None:
        from core.duckdb_engine import get_db_connection
        duckdb_connection = get_db_connection()
    
    return DuckDBNativeConnector(duckdb_connection)
