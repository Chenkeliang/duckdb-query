"""数据库表管理API端点，支持MySQL和PostgreSQL"""

from fastapi import APIRouter, HTTPException
import logging
from core.database_manager import db_manager
from core.config_manager import config_manager
from core.encryption import password_encryptor

# 获取应用配置
app_config = config_manager.get_app_config()

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/api/database_tables/{connection_id}", tags=["Database Management"])
async def get_database_tables(connection_id: str):
    """获取指定数据库连接的所有表信息"""
    try:
        # 获取应用配置
        from core.config_manager import config_manager

        app_config = config_manager.get_app_config()

        # 获取数据库连接配置
        connection = db_manager.get_connection(connection_id)
        if not connection:
            raise HTTPException(
                status_code=404, detail=f"数据库连接 {connection_id} 不存在"
            )

        # 根据数据库类型处理不同的连接方式
        db_config = connection.params
        db_type = (
            connection.type.value
            if hasattr(connection.type, "value")
            else str(connection.type)
        )

        if db_type == "mysql":
            # MySQL连接
            import pymysql

            # 支持 user 和 username 两种参数名称
            username = db_config.get("user") or db_config.get("username")
            if not username:
                raise HTTPException(
                    status_code=400, detail="缺少用户名参数 (user 或 username)"
                )

            password = db_config.get("password", "")
            if password_encryptor.is_encrypted(password):
                password = password_encryptor.decrypt_password(password)

            conn = pymysql.connect(
                host=db_config.get("host", "localhost"),
                port=int(db_config.get("port", 3306)),
                user=username,
                password=password,
                database=db_config["database"],
                charset="utf8mb4",
                connect_timeout=app_config.db_connect_timeout,
                read_timeout=app_config.db_read_timeout,
                write_timeout=app_config.db_write_timeout,
            )

            try:
                with conn.cursor() as cursor:
                    # 获取所有表名
                    cursor.execute("SHOW TABLES")
                    tables = [row[0] for row in cursor.fetchall()]

                    table_info = []
                    # 限制表数量，避免超时
                    max_tables = getattr(app_config, "max_tables", 200)  # 默认200
                    tables_to_process = tables[:max_tables]

                    for table_name in tables_to_process:
                        try:
                            # 获取表结构信息
                            cursor.execute(f"DESCRIBE `{table_name}`")
                            columns = []
                            for col_row in cursor.fetchall():
                                columns.append(
                                    {
                                        "name": col_row[0],
                                        "type": col_row[1],
                                        "null": col_row[2],
                                        "key": col_row[3],
                                        "default": col_row[4],
                                        "extra": col_row[5],
                                    }
                                )

                            # 不再统计行数，提升性能
                            table_info.append(
                                {
                                    "table_name": table_name,
                                    "columns": columns,
                                    "column_count": len(columns),
                                    "row_count": 0,  # 不再提供行数统计，返回0避免前端错误
                                }
                            )

                        except Exception as table_error:
                            logger.warning(
                                f"获取表 {table_name} 信息失败: {str(table_error)}"
                            )
                            # 即使单个表失败，也继续处理其他表
                            table_info.append(
                                {
                                    "table_name": table_name,
                                    "columns": [],
                                    "column_count": 0,
                                    "row_count": 0,  # 返回0避免前端错误
                                    "error": str(table_error),
                                }
                            )

                    return {
                        "success": True,
                        "connection_id": connection_id,
                        "connection_name": connection.name,
                        "database": db_config["database"],
                        "tables": table_info,
                        "table_count": len(table_info),
                    }

            finally:
                conn.close()

        elif db_type == "postgresql":
            # PostgreSQL连接
            import psycopg2

            # 支持 user 和 username 两种参数名称
            username = db_config.get("user") or db_config.get("username")
            if not username:
                raise HTTPException(
                    status_code=400, detail="缺少用户名参数 (user 或 username)"
                )

            password = db_config.get("password", "")
            if password_encryptor.is_encrypted(password):
                password = password_encryptor.decrypt_password(password)

            conn = psycopg2.connect(
                host=db_config.get("host", "localhost"),
                port=int(db_config.get("port", 5432)),
                user=username,
                password=password,
                database=db_config["database"],
                connect_timeout=app_config.db_connect_timeout,
            )

            try:
                with conn.cursor() as cursor:
                    # 获取schema参数，默认为public
                    schema = db_config.get("schema", "public")
                    logger.info(f"PostgreSQL查询schema: {schema}")

                    # 首先检查schema是否存在
                    cursor.execute(
                        """
                        SELECT schema_name 
                        FROM information_schema.schemata 
                        WHERE schema_name = %s
                    """,
                        (schema,),
                    )
                    schema_exists = cursor.fetchall()
                    logger.info(f"Schema '{schema}' 存在: {len(schema_exists) > 0}")

                    # 获取所有表名 (指定的schema) - 只包含真正的表，排除视图
                    cursor.execute(
                        """
                        SELECT table_name 
                        FROM information_schema.tables 
                        WHERE table_schema = %s AND table_type = 'BASE TABLE'
                        ORDER BY table_name
                    """,
                        (schema,),
                    )
                    tables = [row[0] for row in cursor.fetchall()]
                    logger.info(
                        f"PostgreSQL找到 {len(tables)} 个表在schema '{schema}'中"
                    )

                    # 添加详细的诊断信息，无论是否找到表
                    logger.info(f"尝试诊断schema '{schema}'的访问情况...")

                    # 检查所有表的详细信息，区分表和视图
                    try:
                        cursor.execute(
                            """
                            SELECT table_type, COUNT(*) as count
                            FROM information_schema.tables 
                            WHERE table_schema = %s 
                            GROUP BY table_type
                            ORDER BY table_type
                        """,
                            (schema,),
                        )
                        type_counts = cursor.fetchall()
                        logger.info(f"schema '{schema}' 对象统计:")
                        for table_type, count in type_counts:
                            logger.info(f"  - {table_type}: {count} 个")
                    except Exception as e:
                        logger.warning(f"表类型统计查询失败: {e}")

                    # 尝试pg_class查询（更底层的方式）
                    try:
                        cursor.execute(
                            """
                            SELECT c.relname as table_name
                            FROM pg_class c
                            JOIN pg_namespace n ON n.oid = c.relnamespace
                            WHERE n.nspname = %s AND c.relkind = 'r'
                            ORDER BY c.relname
                            LIMIT 5
                        """,
                            (schema,),
                        )
                        pg_class_tables = cursor.fetchall()
                        logger.info(f"pg_class查询结果: {len(pg_class_tables)} 个表")
                        for table in pg_class_tables:
                            logger.info(f"  - {table[0]} (来自pg_class)")
                    except Exception as e:
                        logger.warning(f"pg_class查询失败: {e}")

                    # 如果还是没有找到表，使用最宽松的查询
                    if len(tables) == 0:
                        try:
                            logger.info("尝试最宽松的查询...")
                            cursor.execute(
                                """
                                SELECT table_name 
                                FROM information_schema.tables 
                                WHERE table_schema = %s AND table_type != 'VIEW'
                                ORDER BY table_name
                            """,
                                (schema,),
                            )
                            loose_tables = cursor.fetchall()
                            if len(loose_tables) > 0:
                                logger.info(
                                    f"宽松查询找到 {len(loose_tables)} 个非视图表，更新主结果"
                                )
                                tables = [row[0] for row in loose_tables]
                        except Exception as e:
                            logger.warning(f"宽松查询失败: {e}")

                    table_info = []
                    # 限制表数量，避免超时
                    max_tables = getattr(app_config, "max_tables", 200)  # 默认200
                    tables_to_process = tables[:max_tables]

                    for table_name in tables_to_process:
                        try:
                            # 获取表结构信息
                            cursor.execute(
                                """
                                SELECT 
                                    column_name,
                                    data_type,
                                    is_nullable,
                                    column_default,
                                    '' as extra  -- PostgreSQL没有extra字段，保持与MySQL结构一致
                                FROM information_schema.columns 
                                WHERE table_name = %s AND table_schema = %s
                                ORDER BY ordinal_position
                            """,
                                (table_name, schema),
                            )

                            columns = []
                            for col_row in cursor.fetchall():
                                columns.append(
                                    {
                                        "name": col_row[0],
                                        "type": col_row[1],
                                        "null": col_row[2],
                                        "key": "",  # PostgreSQL的键信息需要额外查询
                                        "default": col_row[3] if col_row[3] else None,
                                        "extra": col_row[4],
                                    }
                                )

                            # 不再统计行数，提升性能
                            table_info.append(
                                {
                                    "table_name": table_name,
                                    "columns": columns,
                                    "column_count": len(columns),
                                    "row_count": 0,  # 不再提供行数统计，返回0避免前端错误
                                }
                            )

                        except Exception as table_error:
                            logger.warning(
                                f"获取表 {table_name} 信息失败: {str(table_error)}"
                            )
                            # 即使单个表失败，也继续处理其他表
                            table_info.append(
                                {
                                    "table_name": table_name,
                                    "columns": [],
                                    "column_count": 0,
                                    "row_count": 0,  # 返回0避免前端错误
                                    "error": str(table_error),
                                }
                            )

                    return {
                        "success": True,
                        "connection_id": connection_id,
                        "connection_name": connection.name,
                        "database": db_config["database"],
                        "tables": table_info,
                        "table_count": len(table_info),
                    }

            finally:
                conn.close()

        else:
            raise HTTPException(
                status_code=400, detail=f"不支持的数据库类型: {db_type}"
            )

    except Exception as e:
        logger.error(f"获取数据库 '{connection_id}' 的表信息失败: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"获取数据库 '{connection_id}' 的表信息失败: {str(e)}",
        )


@router.get(
    "/api/database_table_details/{connection_id}/{table_name}",
    tags=["Database Management"],
)
async def get_table_details(connection_id: str, table_name: str):
    """获取指定表的详细信息，包括字段详情和示例数据"""
    try:
        # 获取应用配置
        from core.config_manager import config_manager

        app_config = config_manager.get_app_config()

        # 获取数据库连接配置
        connection = db_manager.get_connection(connection_id)
        if not connection:
            raise HTTPException(
                status_code=404, detail=f"数据库连接 {connection_id} 不存在"
            )

        # 根据数据库类型处理不同的连接方式
        db_config = connection.params
        db_type = (
            connection.type.value
            if hasattr(connection.type, "value")
            else str(connection.type)
        )

        if db_type == "mysql":
            # MySQL连接
            import pymysql

            # 支持 user 和 username 两种参数名称
            username = db_config.get("user") or db_config.get("username")
            if not username:
                raise HTTPException(
                    status_code=400, detail="缺少用户名参数 (user 或 username)"
                )

            password = db_config.get("password", "")
            if password_encryptor.is_encrypted(password):
                password = password_encryptor.decrypt_password(password)

            conn = pymysql.connect(
                host=db_config.get("host", "localhost"),
                port=int(db_config.get("port", 3306)),
                user=username,
                password=password,
                database=db_config["database"],
                charset="utf8mb4",
                connect_timeout=app_config.db_connect_timeout,
                read_timeout=app_config.db_read_timeout,
                write_timeout=app_config.db_write_timeout,
            )

            try:
                with conn.cursor() as cursor:
                    # 获取表结构详细信息
                    cursor.execute(f"DESCRIBE `{table_name}`")
                    columns = []
                    for col_row in cursor.fetchall():
                        columns.append(
                            {
                                "name": col_row[0],
                                "type": col_row[1],
                                "null": col_row[2],
                                "key": col_row[3],
                                "default": col_row[4],
                                "extra": col_row[5],
                            }
                        )

                    # 不再统计行数，提升性能
                    row_count = 0  # 返回0避免前端错误

                    # 获取示例数据（前5行）
                    cursor.execute(f"SELECT * FROM `{table_name}` LIMIT 5")
                    sample_data = []
                    for row in cursor.fetchall():
                        sample_data.append(list(row))

                    return {
                        "success": True,
                        "table_name": table_name,
                        "columns": columns,
                        "column_count": len(columns),
                        "row_count": row_count,
                        "sample_data": sample_data,
                    }

            finally:
                conn.close()

        elif db_type == "postgresql":
            # PostgreSQL连接
            import psycopg2

            # 支持 user 和 username 两种参数名称
            username = db_config.get("user") or db_config.get("username")
            if not username:
                raise HTTPException(
                    status_code=400, detail="缺少用户名参数 (user 或 username)"
                )

            password = db_config.get("password", "")
            if password_encryptor.is_encrypted(password):
                password = password_encryptor.decrypt_password(password)

            conn = psycopg2.connect(
                host=db_config.get("host", "localhost"),
                port=int(db_config.get("port", 5432)),
                user=username,
                password=password,
                database=db_config["database"],
                connect_timeout=app_config.db_connect_timeout,
            )

            try:
                with conn.cursor() as cursor:
                    # 获取schema参数，默认为public
                    schema = db_config.get("schema", "public")

                    # 获取表结构详细信息
                    cursor.execute(
                        """
                        SELECT 
                            column_name,
                            data_type,
                            is_nullable,
                            column_default,
                            '' as extra  -- PostgreSQL没有extra字段，保持与MySQL结构一致
                        FROM information_schema.columns 
                        WHERE table_name = %s AND table_schema = %s
                        ORDER BY ordinal_position
                    """,
                        (table_name, schema),
                    )

                    columns = []
                    for col_row in cursor.fetchall():
                        columns.append(
                            {
                                "name": col_row[0],
                                "type": col_row[1],
                                "null": col_row[2],
                                "key": "",  # PostgreSQL的键信息需要额外查询
                                "default": col_row[3] if col_row[3] else None,
                                "extra": col_row[4],
                            }
                        )

                    # 不再统计行数，提升性能
                    row_count = 0  # 返回0避免前端错误

                    # 获取示例数据（前5行）
                    cursor.execute(f'SELECT * FROM "{table_name}" LIMIT 5')
                    sample_data = []
                    for row in cursor.fetchall():
                        sample_data.append(list(row))

                    return {
                        "success": True,
                        "table_name": table_name,
                        "columns": columns,
                        "column_count": len(columns),
                        "row_count": row_count,
                        "sample_data": sample_data,
                    }

            finally:
                conn.close()

        else:
            raise HTTPException(
                status_code=400, detail=f"不支持的数据库类型: {db_type}"
            )

    except Exception as e:
        logger.error(f"获取表详细信息失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取表详细信息失败: {str(e)}")
