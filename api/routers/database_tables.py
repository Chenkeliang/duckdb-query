"""数据库表管理API端点，支持MySQL和PostgreSQL"""

from fastapi import APIRouter, HTTPException
# pylint: disable=bad-indentation
import logging
from core.database.database_manager import db_manager
from core.common.config_manager import config_manager
from core.security.encryption import password_encryptor
from utils.response_helpers import (
    create_success_response,
    create_list_response,
    MessageCode,
)

# 获取应用配置
app_config = config_manager.get_app_config()

router = APIRouter()
logger = logging.getLogger(__name__)

def _quote_mysql_identifier(identifier: str) -> str:
    escaped = identifier.replace("`", "``")
    return f"`{escaped}`"


def _safe_decode_value(value):
    """
    安全解码可能包含非 UTF-8 编码的值
    
    Args:
        value: 任意类型的值，特别处理 bytes 类型
        
    Returns:
        解码后的值，如果是 bytes 则尝试多种编码解码
    """
    if isinstance(value, bytes):
        # 尝试多种编码解码 bytes
        try:
            return value.decode('utf-8')
        except UnicodeDecodeError:
            try:
                # 尝试 GBK 编码（常见于中文 Windows 系统）
                return value.decode('gbk')
            except UnicodeDecodeError:
                try:
                    # 尝试 latin1 编码
                    return value.decode('latin1')
                except UnicodeDecodeError:
                    # 如果都失败，返回十六进制表示
                    hex_str = value.hex()
                    if len(hex_str) > 40:
                        return f"<binary:{hex_str[:40]}...>"
                    return f"<binary:{hex_str}>"
    return value


def _safe_decode_row(row):
    """
    安全解码数据库行中的所有值
    
    Args:
        row: 数据库查询返回的行（tuple 或 list）
        
    Returns:
        解码后的行（list）
    """
    return [_safe_decode_value(value) for value in row]



@router.get("/api/datasources/databases/{connection_id}/tables", tags=["Database Management"])
async def get_database_tables_alias(connection_id: str):
    """获取指定数据库连接的所有表信息（别名）"""
    return await get_database_tables(connection_id)


@router.get("/api/database_tables/{connection_id}", tags=["Database Management"])
async def get_database_tables(connection_id: str):
    """获取指定数据库连接的所有表信息"""
    try:
        # 获取应用配置
        from core.common.config_manager import config_manager

        app_config = config_manager.get_app_config()

        # 获取数据库连接配置
        connection = db_manager.get_connection(connection_id)
        if not connection:
            raise HTTPException(
                status_code=404, detail=f"Database connection {connection_id} does not exist"
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
                    status_code=400, detail="Missing username parameter (user or username)"
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
                            cursor.execute(f"DESCRIBE {_quote_mysql_identifier(table_name)}")
                            columns = []
                            for col_row in cursor.fetchall():
                                columns.append(
                                    {
                                        "name": _safe_decode_value(col_row[0]),
                                        "type": _safe_decode_value(col_row[1]),
                                        "null": _safe_decode_value(col_row[2]),
                                        "key": _safe_decode_value(col_row[3]),
                                        "default": _safe_decode_value(col_row[4]),
                                        "extra": _safe_decode_value(col_row[5]),
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
                                f"Failed to get table {table_name} info: {str(table_error)}"
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

                    return create_success_response(
                        data={
                            "connection_id": connection_id,
                            "connection_name": connection.name,
                            "database": db_config["database"],
                            "tables": table_info,
                            "table_count": len(table_info),
                        },
                        message_code=MessageCode.TABLES_RETRIEVED,
                    )

            finally:
                conn.close()

        elif db_type == "postgresql":
            # PostgreSQL连接
            import psycopg2

            # 支持 user 和 username 两种参数名称
            username = db_config.get("user") or db_config.get("username")
            if not username:
                raise HTTPException(
                    status_code=400, detail="Missing username parameter (user or username)"
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
                    logger.info(f"PostgreSQL query schema: {schema}")

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
                    logger.info(f"Schema '{schema}' exists: {len(schema_exists) > 0}")

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
                    logger.info(f"Attempting to diagnose schema '{schema}' access...")

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
                        logger.info(f"schema '{schema}' object statistics:")
                        for table_type, count in type_counts:
                            logger.info(f"  - {table_type}: {count} items")
                    except Exception as e:
                        logger.warning(f"Table type statistics query failed: {e}")

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
                        logger.info(f"pg_class query result: {len(pg_class_tables)} tables")
                        for table in pg_class_tables:
                            logger.info(f"  - {table[0]} (from pg_class)")
                    except Exception as e:
                        logger.warning(f"pg_class query failed: {e}")

                    # 如果还是没有找到表，使用最宽松的查询
                    if len(tables) == 0:
                        try:
                            logger.info("Attempting most permissive query...")
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
                            logger.warning(f"Loose query failed: {e}")

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
                                f"Failed to get table {table_name} info: {str(table_error)}"
                            )
                            # Even if a single table fails, continue processing other tables
                            table_info.append(
                                {
                                    "table_name": table_name,
                                    "columns": [],
                                    "column_count": 0,
                                    "row_count": 0,  # 返回0避免前端错误
                                    "error": str(table_error),
                                }
                            )

                    return create_success_response(
                        data={
                            "connection_id": connection_id,
                            "connection_name": connection.name,
                            "database": db_config["database"],
                            "tables": table_info,
                            "table_count": len(table_info),
                        },
                        message_code=MessageCode.TABLES_RETRIEVED,
                    )

            finally:
                conn.close()

        else:
            raise HTTPException(
                status_code=400, detail=f"Unsupported database type: {db_type}"
            )

    except Exception as e:
        logger.error(f"Failed to get database '{connection_id}' table info: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get database '{connection_id}' table info: {str(e)}",
        )



@router.get("/api/datasources/databases/{connection_id}/schemas", tags=["Database Management"])
async def list_connection_schemas_alias(connection_id: str):
    """获取指定数据库连接的所有 schemas（别名）"""
    return await list_connection_schemas(connection_id)


@router.get("/api/databases/{connection_id}/schemas", tags=["Database Management"])
async def list_connection_schemas(connection_id: str):
    """获取指定数据库连接下的所有 schemas（仅 PostgreSQL）
    
    对于 MySQL/SQLite，返回空列表（这些数据库没有 schema 概念）
    """
    try:
        # 获取应用配置
        from core.common.config_manager import config_manager
        app_config = config_manager.get_app_config()

        # 获取数据库连接配置
        connection = db_manager.get_connection(connection_id)
        if not connection:
            raise HTTPException(
                status_code=404, detail=f"Database connection {connection_id} does not exist"
            )

        db_type = (
            connection.type.value
            if hasattr(connection.type, "value")
            else str(connection.type)
        )

        # MySQL and SQLite do not support schema, return empty list
        if db_type in ["mysql", "sqlite"]:
            return create_list_response(
                items=[],
                total=0,
                message_code=MessageCode.SCHEMAS_RETRIEVED,
            )

        # PostgreSQL: 查询所有 schemas
        if db_type == "postgresql":
            import psycopg2

            db_config = connection.params
            username = db_config.get("user") or db_config.get("username")
            if not username:
                raise HTTPException(
                    status_code=400, detail="Missing username parameter (user or username)"
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
                    # 查询所有用户 schemas（排除系统 schemas）
                    cursor.execute(
                        """
                        SELECT 
                            schema_name,
                            (SELECT COUNT(*) 
                             FROM information_schema.tables 
                             WHERE table_schema = schema_name) as table_count
                        FROM information_schema.schemata
                        WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
                        ORDER BY schema_name
                    """
                    )

                    schemas = []
                    for row in cursor.fetchall():
                        schemas.append({"name": row[0], "table_count": row[1]})

                    return create_list_response(
                        items=schemas,
                        total=len(schemas),
                        message_code=MessageCode.SCHEMAS_RETRIEVED,
                    )
            finally:
                conn.close()

        else:
            raise HTTPException(
                status_code=400, detail=f"Unsupported database type: {db_type}"
            )

    except Exception as e:
        logger.error(f"Failed to get schemas: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to get schemas: {str(e)}"
        )



@router.get("/api/datasources/databases/{connection_id}/schemas/{schema}/tables", tags=["Database Management"])
async def list_schema_tables_alias(connection_id: str, schema: str):
    """获取指定 schema 下的所有表（别名）"""
    return await list_schema_tables(connection_id, schema)


@router.get(
    "/api/databases/{connection_id}/schemas/{schema}/tables",
    tags=["Database Management"],
)
async def list_schema_tables(connection_id: str, schema: str):
    """获取指定 schema 下的所有表（仅 PostgreSQL）
    
    对于 MySQL/SQLite，此端点不适用
    """
    try:
        # 获取应用配置
        from core.common.config_manager import config_manager
        app_config = config_manager.get_app_config()

        # 获取数据库连接配置
        connection = db_manager.get_connection(connection_id)
        if not connection:
            raise HTTPException(
                status_code=404, detail=f"Database connection {connection_id} does not exist"
            )

        db_type = (
            connection.type.value
            if hasattr(connection.type, "value")
            else str(connection.type)
        )

        # 只支持 PostgreSQL
        if db_type != "postgresql":
            raise HTTPException(
                status_code=400,
                detail=f"This endpoint only supports PostgreSQL, current type: {db_type}",
            )

        # PostgreSQL: 查询指定 schema 下的表
        import psycopg2

        db_config = connection.params
        username = db_config.get("user") or db_config.get("username")
        if not username:
            raise HTTPException(
                status_code=400, detail="Missing username parameter (user or username)"
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
                # 查询指定 schema 下的所有表
                cursor.execute(
                    """
                    SELECT 
                        table_name,
                        table_type
                    FROM information_schema.tables 
                    WHERE table_schema = %s
                    ORDER BY table_name
                """,
                    (schema,),
                )

                tables = []
                for row in cursor.fetchall():
                    tables.append({
                        "name": row[0],
                        "type": row[1], # Use actual table type
                        "row_count": 0,  # 不统计行数，提升性能
                    })

                return create_list_response(
                    items=tables,
                    total=len(tables),
                    message_code=MessageCode.TABLES_RETRIEVED,
                )
        finally:
            conn.close()

    except Exception as e:
        logger.error(f"Failed to get table list: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get table list: {str(e)}")



@router.get("/api/datasources/databases/{connection_id}/tables/detail", tags=["Database Management"])
async def get_table_details_alias(connection_id: str, table_name: str, schema: str | None = None):
    """获取指定表的详细信息（别名）"""
    return await get_table_details(connection_id, table_name, schema)


@router.get(
    "/api/database_table_details/{connection_id}/{table_name}",
    tags=["Database Management"],
)
async def get_table_details(connection_id: str, table_name: str, schema: str | None = None):
    """获取指定表的详细信息，包括字段详情和示例数据"""
    try:
        # 获取应用配置
        from core.common.config_manager import config_manager

        app_config = config_manager.get_app_config()

        # 获取数据库连接配置
        connection = db_manager.get_connection(connection_id)
        if not connection:
            raise HTTPException(
                status_code=404, detail=f"Database connection {connection_id} does not exist"
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
                    status_code=400, detail="Missing username parameter (user or username)"
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
                    cursor.execute(f"DESCRIBE {_quote_mysql_identifier(table_name)}")
                    columns = []
                    for col_row in cursor.fetchall():
                        columns.append(
                            {
                                "name": _safe_decode_value(col_row[0]),
                                "type": _safe_decode_value(col_row[1]),
                                "null": _safe_decode_value(col_row[2]),
                                "key": _safe_decode_value(col_row[3]),
                                "default": _safe_decode_value(col_row[4]),
                                "extra": _safe_decode_value(col_row[5]),
                            }
                        )

                    # 不再统计行数，提升性能
                    row_count = 0  # 返回0避免前端错误

                    # 获取示例数据（前5行）
                    cursor.execute(f"SELECT * FROM {_quote_mysql_identifier(table_name)} LIMIT 5")
                    sample_data = []
                    for row in cursor.fetchall():
                        sample_data.append(_safe_decode_row(row))

                    # 获取索引详情 (MySQL)
                    indexes = []
                    try:
                        cursor.execute(f"SHOW INDEX FROM {_quote_mysql_identifier(table_name)}")
                        # SHOW INDEX returns: Table, Non_unique, Key_name, Seq_in_index, Column_name, ...
                        # Non_unique: 0 = Unique, 1 = Not Unique
                        raw_indexes = cursor.fetchall()
                        
                        # 聚合复合索引
                        index_map = {}
                        for idx_row in raw_indexes:
                            key_name = _safe_decode_value(idx_row[2])
                            col_name = _safe_decode_value(idx_row[4])
                            non_unique = idx_row[1]
                            seq = idx_row[3]
                            if key_name not in index_map:
                                index_map[key_name] = {
                                    "name": key_name,
                                    "unique": non_unique == 0,
                                    "columns": []
                                }
                            index_map[key_name]["columns"].append((seq, col_name))
                        
                        # 格式化输出
                        for k, v in index_map.items():
                            # 按 seq 排序列
                            v["columns"].sort(key=lambda x: x[0])
                            cols = [c[1] for c in v["columns"]]
                            indexes.append({
                                "name": k,
                                "unique": v["unique"],
                                "columns": ", ".join(cols),
                                "type": "PRIMARY" if k == "PRIMARY" else ("UNIQUE" if v["unique"] else "INDEX")
                            })
                    except Exception as e:
                        logger.warning(f"Failed to get MySQL indexes: {e}")


                    return create_success_response(
                        data={
                            "table_name": table_name,
                            "columns": columns,
                            "indexes": indexes,
                            "column_count": len(columns),
                            "row_count": row_count,
                            "sample_data": sample_data,
                        },
                        message_code=MessageCode.TABLE_RETRIEVED,
                    )

            finally:
                conn.close()

        elif db_type == "postgresql":
            # PostgreSQL连接
            import psycopg2
            from psycopg2 import sql as pg_sql

            # ... omit repeated connection code ...
            # 支持 user 和 username 两种参数名称
            username = db_config.get("user") or db_config.get("username")
            if not username:
                raise HTTPException(
                    status_code=400, detail="Missing username parameter (user or username)"
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
                    schema = schema or db_config.get("schema", "public")

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

                    columns_data = cursor.fetchall()
                    
                    # 获取主键和唯一键信息 (用于在列列表显示简略信息)
                    cursor.execute(
                        """
                        SELECT kcu.column_name, tco.constraint_type
                        FROM information_schema.table_constraints tco
                        JOIN information_schema.key_column_usage kcu 
                             ON kcu.constraint_name = tco.constraint_name
                             AND kcu.table_schema = tco.table_schema
                        WHERE kcu.table_name = %s AND kcu.table_schema = %s
                        AND tco.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
                        """,
                        (table_name, schema)
                    )
                    
                    key_map = {}
                    for k_row in cursor.fetchall():
                        col_name = k_row[0]
                        c_type = k_row[1]
                        if c_type == 'PRIMARY KEY':
                            key_map[col_name] = 'PRI'
                        elif c_type == 'UNIQUE':
                            key_map[col_name] = 'UNI'

                    columns = []
                    for col_row in columns_data:
                        col_name = col_row[0]
                        columns.append(
                            {
                                "name": col_name,
                                "type": col_row[1],
                                "null": col_row[2],
                                "key": key_map.get(col_name, ""),
                                "default": col_row[3] if col_row[3] else None,
                                "extra": col_row[4],
                            }
                        )

                    # 不再统计行数，提升性能
                    row_count = 0  # 返回0避免前端错误

                    # 获取示例数据（前5行）
                    cursor.execute(
                        pg_sql.SQL("SELECT * FROM {}.{} LIMIT 5").format(
                            pg_sql.Identifier(schema),
                            pg_sql.Identifier(table_name),
                        )
                    )
                    sample_data = []
                    for row in cursor.fetchall():
                        sample_data.append(_safe_decode_row(row))

                    # 获取索引详情 (PostgreSQL)
                    indexes = []
                    try:
                        # 使用 pg_indexes 配合 pg_class 等获取更详细信息
                        # 这里我们查询 pg_indexes 视图，它包含 indexdef (CREATE INDEX 语句)
                        # 但为了更好的结构化数据，我们查询系统目录
                        cursor.execute(
                            """
                            SELECT
                                i.relname as index_name,
                                a.attname as column_name,
                                ix.indisunique as is_unique,
                                ix.indisprimary as is_primary,
                                array_position(ix.indkey, a.attnum) as seq
                            FROM
                                pg_class t,
                                pg_class i,
                                pg_index ix,
                                pg_attribute a
                            WHERE
                                t.oid = ix.indrelid
                                and i.oid = ix.indexrelid
                                and a.attrelid = t.oid
                                and a.attnum = ANY(ix.indkey)
                                and t.relkind = 'r'
                                and t.relname = %s
                                and t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = %s)
                            ORDER BY
                                t.relname,
                                i.relname,
                                array_position(ix.indkey, a.attnum)
                            """,
                            (table_name, schema)
                        )
                        
                        raw_indexes = cursor.fetchall()
                         # 聚合复合索引
                        index_map = {}
                        for idx_row in raw_indexes:
                            idx_name = idx_row[0]
                            col_name = idx_row[1]
                            is_unique = idx_row[2]
                            is_primary = idx_row[3]
                            
                            if idx_name not in index_map:
                                index_map[idx_name] = {
                                    "name": idx_name,
                                    "unique": is_unique,
                                    "primary": is_primary,
                                    "columns": []
                                }
                            index_map[idx_name]["columns"].append(col_name)
                        
                        for k, v in index_map.items():
                            indexes.append({
                                "name": k,
                                "unique": v["unique"],
                                "columns": ", ".join(v["columns"]),
                                "type": "PRIMARY" if v["primary"] else ("UNIQUE" if v["unique"] else "INDEX")
                            })
                    except Exception as e:
                         logger.warning(f"Failed to get PostgreSQL indexes: {e}")


                    return create_success_response(
                        data={
                            "table_name": table_name,
                            "columns": columns,
                            "indexes": indexes, 
                            "column_count": len(columns),
                            "row_count": row_count,
                            "sample_data": sample_data,
                        },
                        message_code=MessageCode.TABLE_RETRIEVED,
                    )

            finally:
                conn.close()

        else:
            raise HTTPException(
                status_code=400, detail=f"Unsupported database type: {db_type}"
            )

    except Exception as e:
        logger.error(f"Failed to get table details: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get table details: {str(e)}")
