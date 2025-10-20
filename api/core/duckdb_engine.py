import duckdb
import logging
import pandas as pd
import time
from typing import List, Dict, Any, Optional, Tuple
import re
from collections import defaultdict

from models.query_models import (
    QueryRequest,
    Join,
    JoinType,
    JoinCondition,
    MultiTableJoin,
    DataSource,
)

logger = logging.getLogger(__name__)

# 导入连接池管理器
from core.duckdb_pool import get_connection_pool

# 创建一个全局的DuckDB连接实例，确保在整个应用程序中共享
_global_duckdb_connection = None


def _resolve_duckdb_extensions(app_config, override_extensions: Optional[List[str]] = None) -> List[str]:
    """根据配置和开关生成最终需要加载的DuckDB扩展列表"""
    base_extensions = []
    source_extensions = override_extensions if override_extensions is not None else app_config.duckdb_extensions

    if source_extensions:
        for ext in source_extensions:
            if ext:
                base_extensions.append(ext)

    pivot_extension = (app_config.pivot_table_extension or "pivot_table").strip()
    if pivot_extension:
        # 先移除重复的透视扩展，避免列表中存在旧值
        base_extensions = [ext for ext in base_extensions if ext != pivot_extension]
        if app_config.enable_pivot_tables:
            base_extensions.append(pivot_extension)

    # 去重但保持顺序（忽略大小写）
    seen = set()
    resolved = []
    for ext in base_extensions:
        key = ext.lower()
        if key not in seen:
            resolved.append(ext)
            seen.add(key)

    return resolved


def _apply_duckdb_configuration(connection, temp_dir: str):
    """
    自动应用所有DuckDB配置参数

    Args:
        connection: DuckDB连接实例
        temp_dir: 临时目录路径
    """
    from core.config_manager import config_manager

    try:
        app_config = config_manager.get_app_config()

        # 获取所有以duckdb_开头的配置项
        config_items = {
            k: v for k, v in app_config.__dict__.items() if k.startswith("duckdb_")
        }

        logger.info(f"发现 {len(config_items)} 个DuckDB配置项")

        # 应用基础配置
        if config_items.get("duckdb_threads"):
            connection.execute(f"SET threads={config_items['duckdb_threads']}")
            logger.info(f"DuckDB线程数设置为: {config_items['duckdb_threads']}")

        if config_items.get("duckdb_memory_limit"):
            connection.execute(
                f"SET memory_limit='{config_items['duckdb_memory_limit']}'"
            )
            connection.execute(
                f"SET max_memory='{config_items['duckdb_memory_limit']}'"
            )
            logger.info(f"DuckDB内存限制设置为: {config_items['duckdb_memory_limit']}")

        # 设置临时目录
        connection.execute(f"SET temp_directory='{temp_dir}'")

        # 应用性能优化配置
        if config_items.get("duckdb_enable_profiling") is not None:
            connection.execute(
                f"SET enable_profiling={str(config_items['duckdb_enable_profiling']).lower()}"
            )
            if config_items.get("duckdb_profiling_output"):
                connection.execute(
                    f"SET profiling_output='{config_items['duckdb_profiling_output']}'"
                )
            logger.info(
                f"DuckDB性能分析设置为: {config_items['duckdb_enable_profiling']}"
            )

        if config_items.get("duckdb_prefer_range_joins") is not None:
            connection.execute(
                f"SET prefer_range_joins={str(config_items['duckdb_prefer_range_joins']).lower()}"
            )
            logger.info(
                f"DuckDB优先范围JOIN设置为: {config_items['duckdb_prefer_range_joins']}"
            )

        if config_items.get("duckdb_enable_object_cache") is not None:
            connection.execute(
                f"SET enable_object_cache={str(config_items['duckdb_enable_object_cache']).lower()}"
            )
            logger.info(
                f"DuckDB对象缓存设置为: {config_items['duckdb_enable_object_cache']}"
            )

        if config_items.get("duckdb_preserve_insertion_order") is not None:
            connection.execute(
                f"SET preserve_insertion_order={str(config_items['duckdb_preserve_insertion_order']).lower()}"
            )
            logger.info(
                f"DuckDB保持插入顺序设置为: {config_items['duckdb_preserve_insertion_order']}"
            )

        if config_items.get("duckdb_enable_progress_bar") is not None:
            connection.execute(
                f"SET enable_progress_bar={str(config_items['duckdb_enable_progress_bar']).lower()}"
            )
            logger.info(
                f"DuckDB进度条设置为: {config_items['duckdb_enable_progress_bar']}"
            )

        # 设置目录配置
        if config_items.get("duckdb_home_directory"):
            connection.execute(
                f"SET home_directory='{config_items['duckdb_home_directory']}'"
            )
            logger.info(f"DuckDB主目录设置为: {config_items['duckdb_home_directory']}")

        if config_items.get("duckdb_extension_directory"):
            connection.execute(
                f"SET extension_directory='{config_items['duckdb_extension_directory']}'"
            )
            logger.info(
                f"DuckDB扩展目录设置为: {config_items['duckdb_extension_directory']}"
            )

        # 自动安装和加载扩展
        extensions_to_load = _resolve_duckdb_extensions(
            app_config, config_items.get("duckdb_extensions")
        )
        if extensions_to_load:
            _install_duckdb_extensions(connection, extensions_to_load)
        else:
            logger.info("未配置需要加载的DuckDB扩展")

    except Exception as e:
        logger.error(f"应用DuckDB配置时出错: {str(e)}")
        # 使用默认配置作为后备
        _apply_default_duckdb_config(connection, temp_dir)


def _install_duckdb_extensions(connection, extensions: List[str]):
    """
    安装和加载DuckDB扩展

    Args:
        connection: DuckDB连接实例
        extensions: 扩展名称列表
    """
    if not extensions:
        return

    for ext_name in extensions:
        try:
            # 先尝试加载扩展（如果已安装）
            connection.execute(f"LOAD {ext_name};")
            logger.info(f"DuckDB扩展 {ext_name} 已加载")
        except Exception as load_error:
            # 如果加载失败，尝试安装后再加载
            try:
                connection.execute(f"INSTALL {ext_name};")
                connection.execute(f"LOAD {ext_name};")
                logger.info(f"DuckDB扩展 {ext_name} 安装并加载成功")
            except Exception as install_error:
                logger.warning(
                    f"安装或加载DuckDB扩展 {ext_name} 失败: {str(install_error)}"
                )


def _apply_default_duckdb_config(connection, temp_dir: str):
    """
    应用默认DuckDB配置（作为后备方案）

    Args:
        connection: DuckDB连接实例
        temp_dir: 临时目录路径
    """
    logger.info("应用默认DuckDB配置")

    try:
        # 尝试从配置文件获取默认值
        from core.config_manager import config_manager

        app_config = config_manager.get_app_config()

        # 使用配置文件中的默认值
        connection.execute(f"SET threads={app_config.duckdb_threads}")
        connection.execute(f"SET memory_limit='{app_config.duckdb_memory_limit}'")
        connection.execute(f"SET temp_directory='{temp_dir}'")

        # 性能优化 - 使用配置默认值
        connection.execute(
            f"SET enable_profiling={str(app_config.duckdb_enable_profiling).lower()}"
        )
        connection.execute(
            f"SET prefer_range_joins={str(app_config.duckdb_prefer_range_joins).lower()}"
        )
        connection.execute(
            f"SET enable_object_cache={str(app_config.duckdb_enable_object_cache).lower()}"
        )
        connection.execute(
            f"SET preserve_insertion_order={str(app_config.duckdb_preserve_insertion_order).lower()}"
        )
        connection.execute(
            f"SET enable_progress_bar={str(app_config.duckdb_enable_progress_bar).lower()}"
        )

        # 安装默认扩展
        extensions_to_load = _resolve_duckdb_extensions(app_config)
        if extensions_to_load:
            _install_duckdb_extensions(connection, extensions_to_load)

        logger.info("成功应用配置文件中的默认DuckDB配置")

    except Exception as e:
        logger.error(f"应用DuckDB配置失败: {str(e)}")
        # 不再使用硬编码后备值，让错误暴露出来
        raise RuntimeError(f"无法应用DuckDB配置，请检查配置文件: {str(e)}")


def get_db_connection():
    """
    获取DuckDB连接的单例实例
    """
    global _global_duckdb_connection
    if _global_duckdb_connection is None:
        logger.info("创建新的DuckDB连接...")
        # 使用持久化文件而不是内存模式
        # 兼容本地开发和Docker环境
        import os

        if os.path.exists("/app"):
            # Docker环境
            db_path = "/app/data/duckdb/main.db"
            temp_dir = "/app/data/duckdb/temp"
        else:
            # 本地开发环境
            db_path = "./data/duckdb/main.db"
            temp_dir = "./data/duckdb/temp"

        # 确保基础目录存在
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        os.makedirs(temp_dir, exist_ok=True)

        # 创建DuckDB扩展和配置目录
        if os.path.exists("/app"):
            # Docker环境
            extension_dir = "/app/data/duckdb/extensions"
            home_dir = "/app/data/duckdb/home"
        else:
            # 本地开发环境
            extension_dir = "./data/duckdb/extensions"
            home_dir = "./data/duckdb/home"

        os.makedirs(extension_dir, exist_ok=True)
        os.makedirs(home_dir, exist_ok=True)

        _global_duckdb_connection = duckdb.connect(database=db_path)
        logger.info(f"DuckDB连接到持久化文件: {db_path}")

        # 自动应用所有DuckDB配置
        _apply_duckdb_configuration(_global_duckdb_connection, temp_dir)

        logger.info("DuckDB配置和扩展已自动应用")
    return _global_duckdb_connection


def execute_query(query, con=None):
    """
    在DuckDB中执行查询 - 带性能监控
    """
    if con is None:
        con = get_db_connection()

    logger.info(f"执行DuckDB查询: {query}")
    start_time = time.time()

    try:
        # 先获取表列表，用于调试
        tables = con.execute("SHOW TABLES").fetchdf()
        logger.info(f"当前DuckDB中的表: {tables.to_string()}")

        # 对于JOIN查询，先分析查询计划
        if "JOIN" in query.upper():
            try:
                explain_query = f"EXPLAIN ANALYZE {query}"
                plan_result = con.execute(explain_query).fetchdf()
                logger.info(f"JOIN查询执行计划:\n{plan_result.to_string()}")
            except Exception as e:
                logger.warning(f"获取查询计划失败: {str(e)}")

        # 执行查询
        result = con.execute(query).fetchdf()

        execution_time = (time.time() - start_time) * 1000

        # 详细的性能日志
        if execution_time > 1000:  # 超过1秒的查询
            logger.warning(
                f"慢查询检测: 耗时 {execution_time:.2f}ms，返回 {len(result)} 行"
            )
            logger.warning(f"慢查询SQL: {query}")
        else:
            logger.info(
                f"查询执行完成，耗时: {execution_time:.2f}ms，返回 {len(result)} 行"
            )

        return result
    except Exception as e:
        execution_time = (time.time() - start_time) * 1000
        logger.error(f"DuckDB查询执行失败 (耗时: {execution_time:.2f}ms): {str(e)}")
        raise


def register_dataframe(table_name: str, df: pd.DataFrame, con=None) -> bool:
    """
    将DataFrame注册到DuckDB (临时表，重启后会丢失)
    建议使用 create_persistent_table() 进行持久化
    """
    if con is None:
        con = get_db_connection()

    try:
        # 预处理DataFrame以避免类型转换错误
        processed_df = prepare_dataframe_for_duckdb(df)
        con.register(table_name, processed_df)
        logger.info(
            f"成功注册临时表: {table_name}, 行数: {len(processed_df)}, 列数: {len(processed_df.columns)}"
        )
        return True
    except Exception as e:
        logger.error(f"注册表失败 {table_name}: {str(e)}")
        return False


def create_persistent_table(table_name: str, df: pd.DataFrame, con=None) -> bool:
    """
    创建持久化表到DuckDB，数据会写入磁盘文件
    """
    if con is None:
        con = get_db_connection()

    try:
        from core.file_datasource_manager import (
            create_typed_table_from_dataframe,
            file_datasource_manager,
        )
        from core.timezone_utils import get_current_time_iso

        metadata = create_typed_table_from_dataframe(con, table_name, df)

        table_metadata = {
            "source_id": table_name,
            "filename": f"table_{table_name}",
            "file_path": f"duckdb://{table_name}",
            "file_type": "duckdb_table",
            "row_count": metadata.get("row_count", 0),
            "column_count": metadata.get("column_count", 0),
            "columns": metadata.get("columns", []),
            "column_profiles": metadata.get("column_profiles", []),
            "schema_version": 2,
            "created_at": get_current_time_iso(),
        }

        file_datasource_manager.save_file_datasource(table_metadata)
        logger.info(
            "成功创建Typed持久化表: %s (行: %s, 列: %s)",
            table_name,
            table_metadata["row_count"],
            table_metadata["column_count"],
        )
        return True

    except Exception as e:
        logger.error(f"创建持久化表失败 {table_name}: {str(e)}")
        return False


def table_exists(table_name: str, con=None) -> bool:
    """
    检查表是否存在
    """
    if con is None:
        con = get_db_connection()

    try:
        tables_df = con.execute("SHOW TABLES").fetchdf()
        return table_name in tables_df["name"].tolist()
    except Exception as e:
        logger.error(f"检查表是否存在失败 {table_name}: {str(e)}")
        return False


def safe_encode_string(value: str) -> str:
    """
    安全地处理字符串编码，避免编码错误
    """
    if not value:
        return ""

    try:
        # 尝试直接使用字符串
        return str(value)
    except UnicodeDecodeError:
        try:
            # 如果是字节类型，尝试不同的编码
            if isinstance(value, bytes):
                for encoding in ["utf-8", "latin1", "cp1252", "iso-8859-1"]:
                    try:
                        return value.decode(encoding)
                    except UnicodeDecodeError:
                        continue
                # 如果所有编码都失败，使用错误替换
                return value.decode("utf-8", errors="replace")
            else:
                # 如果是字符串，直接返回
                return str(value)
        except Exception:
            # 最后的保险措施
            return str(value).encode("ascii", errors="ignore").decode("ascii")


def drop_table_if_exists(table_name: str, con=None) -> bool:
    """
    删除表（如果存在）
    """
    if con is None:
        con = get_db_connection()

    try:
        con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
        logger.info(f"已删除表: {table_name}")
        return True
    except Exception as e:
        logger.error(f"删除表失败 {table_name}: {str(e)}")
        return False


def backup_table(table_name: str, con=None) -> str:
    """
    备份表到临时表
    返回备份表名
    """
    if con is None:
        con = get_db_connection()

    backup_name = f"{table_name}_backup_{int(time.time())}"

    try:
        # 检查原表是否存在
        tables = con.execute("SHOW TABLES").fetchall()
        table_exists = any(table[0] == table_name for table in tables)

        if not table_exists:
            logger.warning(f"表 {table_name} 不存在，无需备份")
            return ""

        # 创建备份表
        con.execute(f'CREATE TABLE "{backup_name}" AS SELECT * FROM "{table_name}"')
        logger.info(f"已备份表 {table_name} 到 {backup_name}")
        return backup_name

    except Exception as e:
        logger.error(f"备份表失败 {table_name}: {str(e)}")
        return ""


def convert_table_to_varchar(
    table_name: str, backup_table_name: str = "", con=None
) -> bool:
    """
    将表的所有列转换为VARCHAR类型
    使用DuckDB原生功能，避免pandas
    """
    if con is None:
        con = get_db_connection()

    try:
        # 如果没有提供备份表名，先创建备份
        if not backup_table_name:
            backup_table_name = backup_table(table_name, con)
            if not backup_table_name:
                logger.error(f"无法备份表 {table_name}")
                return False

        # 获取表结构
        columns_info = con.execute(f'DESCRIBE "{backup_table_name}"').fetchall()

        # 构建SELECT语句，将所有列CAST为VARCHAR
        cast_columns = []
        for col_name, col_type, *_ in columns_info:
            if col_type.upper().startswith("VARCHAR"):
                # 已经是VARCHAR类型，直接使用
                cast_columns.append(f'"{col_name}"')
            else:
                # 转换为VARCHAR类型
                cast_columns.append(f'CAST("{col_name}" AS VARCHAR) AS "{col_name}"')

        cast_sql = ", ".join(cast_columns)

        # 删除原表
        drop_table_if_exists(table_name, con)

        # 重新创建表，所有列都是VARCHAR类型
        create_sql = f'CREATE TABLE "{table_name}" AS SELECT {cast_sql} FROM "{backup_table_name}"'
        con.execute(create_sql)

        # 删除备份表
        drop_table_if_exists(backup_table_name, con)

        logger.info(f"成功将表 {table_name} 的所有列转换为VARCHAR类型")
        return True

    except Exception as e:
        logger.error(f"转换表类型失败 {table_name}: {str(e)}")
        return False


def check_and_convert_table_types(table_name: str, con=None) -> bool:
    """
    检查表的列类型，如果有非VARCHAR类型则转换
    """
    if con is None:
        con = get_db_connection()

    try:
        # 检查表是否存在
        tables = con.execute("SHOW TABLES").fetchall()
        table_exists = any(table[0] == table_name for table in tables)

        if not table_exists:
            logger.info(f"表 {table_name} 不存在，无需检查")
            return True

        # 获取表结构
        columns_info = con.execute(f'DESCRIBE "{table_name}"').fetchall()

        # 检查是否有非VARCHAR类型的列
        non_varchar_columns = []
        for col_name, col_type, *_ in columns_info:
            if not col_type.upper().startswith("VARCHAR"):
                non_varchar_columns.append((col_name, col_type))

        if non_varchar_columns:
            logger.info(
                f"表 {table_name} 有 {len(non_varchar_columns)} 个非VARCHAR列，需要转换"
            )
            for col_name, col_type in non_varchar_columns:
                logger.info(f"  - {col_name}: {col_type}")

            # 执行转换
            return convert_table_to_varchar(table_name, "", con)
        else:
            logger.info(f"表 {table_name} 所有列都是VARCHAR类型，无需转换")
            return True

    except Exception as e:
        logger.error(f"检查表类型失败 {table_name}: {str(e)}")
        return False


def ensure_all_tables_varchar(con=None) -> bool:
    """
    确保所有表的列都是VARCHAR类型
    """
    if con is None:
        con = get_db_connection()

    try:
        # 获取所有表
        tables = con.execute("SHOW TABLES").fetchall()

        success_count = 0
        total_count = len(tables)

        for table_row in tables:
            table_name = table_row[0]
            if check_and_convert_table_types(table_name, con):
                success_count += 1
            else:
                logger.error(f"转换表 {table_name} 失败")

        logger.info(f"表类型检查完成: {success_count}/{total_count} 个表成功")
        return success_count == total_count

    except Exception as e:
        logger.error(f"批量检查表类型失败: {str(e)}")
        return False


def create_varchar_table_from_dataframe(
    table_name: str, df: pd.DataFrame, con=None
) -> bool:
    """
    从DataFrame创建DuckDB表，所有列都转换为VARCHAR类型
    优先使用DuckDB原生功能，避免pandas预处理
    """
    if con is None:
        con = get_db_connection()

    try:
        if df is None or df.empty:
            logger.warning(f"DataFrame为空，无法创建表 {table_name}")
            return False

        from core.file_datasource_manager import (
            create_typed_table_from_dataframe,
            file_datasource_manager,
        )
        from core.timezone_utils import get_current_time_iso

        metadata = create_typed_table_from_dataframe(con, table_name, df)

        table_metadata = {
            "source_id": table_name,
            "filename": f"table_{table_name}",
            "file_path": f"duckdb://{table_name}",
            "file_type": "duckdb_table",
            "row_count": metadata.get("row_count", 0),
            "column_count": metadata.get("column_count", 0),
            "columns": metadata.get("columns", []),
            "column_profiles": metadata.get("column_profiles", []),
            "schema_version": 2,
            "created_at": get_current_time_iso(),
        }

        file_datasource_manager.save_file_datasource(table_metadata)
        logger.info(
            "成功创建Typed DuckDB表: %s (行: %s, 列: %s)",
            table_name,
            table_metadata["row_count"],
            table_metadata["column_count"],
        )
        return True

    except Exception as e:
        logger.error(f"创建Typed表失败 {table_name}: {str(e)}")
        return False


def prepare_dataframe_for_duckdb(df: pd.DataFrame) -> pd.DataFrame:
    """
    预处理DataFrame以避免DuckDB类型转换错误
    将所有数据统一转换为字符串类型，确保JOIN操作的兼容性
    """
    if df.empty:
        return df

    # 创建DataFrame的深拷贝
    processed_df = df.copy()

    logger.info(
        f"开始预处理DataFrame: {len(processed_df)}行, {len(processed_df.columns)}列"
    )

    # 处理所有列，统一转换为字符串类型
    for col in processed_df.columns:
        try:
            # 处理不同的数据类型
            if processed_df[col].dtype == "datetime64[ns]":
                # 日期时间转换为字符串
                processed_df[col] = processed_df[col].dt.strftime("%Y-%m-%d %H:%M:%S")
            elif processed_df[col].dtype == "bool":
                # 布尔值转换为字符串
                processed_df[col] = processed_df[col].astype(str)
            elif processed_df[col].dtype in ["float64", "float32"]:
                # 浮点数转换为字符串，处理NaN
                processed_df[col] = processed_df[col].fillna("").astype(str)
            elif processed_df[col].dtype in ["int64", "int32", "int16", "int8"]:
                # 整数转换为字符串
                processed_df[col] = processed_df[col].astype(str)
            else:
                # 对象类型（包括字符串）
                processed_df[col] = processed_df[col].fillna("").astype(str)

            # 简化字符串处理，避免性能问题
            # 直接转换为字符串，处理空值
            processed_df[col] = processed_df[col].astype(str).replace("nan", "")

        except Exception as e:
            logger.warning(f"处理列 {col} 时出错: {e}，使用默认字符串转换")
            # 使用最简单的转换方法
            try:
                processed_df[col] = processed_df[col].astype(str).fillna("")
            except:
                # 如果还是失败，创建一个空字符串列
                processed_df[col] = [""] * len(processed_df)

    # 清理列名，确保是有效的SQL标识符
    clean_columns = []
    for i, col in enumerate(processed_df.columns):
        try:
            clean_col = str(col).encode("utf-8", errors="replace").decode("utf-8")
            # 移除或替换特殊字符
            clean_col = "".join(
                c if c.isalnum() or c in ["_", "-"] else "_" for c in clean_col
            )
            if not clean_col or clean_col[0].isdigit():
                clean_col = f"col_{i}"
            clean_columns.append(clean_col)
        except:
            clean_columns.append(f"col_{i}")

    processed_df.columns = clean_columns

    logger.info(f"DataFrame预处理完成: 所有列已转换为字符串类型")
    return processed_df


def get_table_info(table_name: str, con=None) -> Dict[str, Any]:
    """
    获取表的信息
    """
    if con is None:
        con = get_db_connection()

    try:
        # 获取表结构
        schema_query = f"DESCRIBE {table_name}"
        schema_df = con.execute(schema_query).fetchdf()

        # 获取行数
        count_query = f"SELECT COUNT(*) as row_count FROM {table_name}"
        count_result = con.execute(count_query).fetchone()
        row_count = count_result[0] if count_result else 0

        # 统一列数据格式：转换为前端期望的对象数组格式
        columns = []
        for _, row in schema_df.iterrows():
            columns.append({"name": row["column_name"], "type": row["column_type"]})

        return {
            "table_name": table_name,
            "columns": columns,
            "row_count": row_count,
        }
    except Exception as e:
        logger.error(f"获取表信息失败 {table_name}: {str(e)}")
        return {}


def generate_improved_column_aliases(
    sources: List[DataSource],
) -> Dict[str, Dict[str, str]]:
    """
    为冲突的列名生成改进的别名
    使用原始字段名 + 表标识的方式，如：字段名_表标识
    """
    conflicts = detect_column_conflicts(sources)
    aliases = {}

    # 为每个数据源生成简化的表标识
    table_identifiers = generate_table_identifiers(sources)

    for source in sources:
        source_aliases = {}
        table_identifier = table_identifiers.get(source.id, source.id)

        if source.columns:
            for column in source.columns:
                if column in conflicts:
                    # 生成改进的别名：column_name_table_identifier
                    alias = f"{column}_{table_identifier}"
                    source_aliases[column] = alias
                else:
                    # 非冲突列保持原始名称
                    source_aliases[column] = column
        aliases[source.id] = source_aliases

    return aliases


def generate_table_identifiers(sources: List[DataSource]) -> Dict[str, str]:
    """
    为每个数据源生成简化的表标识
    """
    identifiers = {}

    # 收集所有表名
    table_names = []
    for source in sources:
        # 使用表名或ID作为基础
        base_name = getattr(source, "name", None) or source.id
        table_names.append((source.id, base_name))

    # 生成唯一标识符
    used_identifiers = set()
    for source_id, base_name in table_names:
        # 简化表名：取前几个字符或使用完整表名
        simplified_name = simplify_table_name(base_name)

        # 确保标识符唯一
        final_identifier = simplified_name
        counter = 1
        while final_identifier in used_identifiers:
            final_identifier = f"{simplified_name}_{counter}"
            counter += 1

        identifiers[source_id] = final_identifier
        used_identifiers.add(final_identifier)

    return identifiers


def simplify_table_name(table_name: str, max_length: int = 10) -> str:
    """
    简化表名，使其更适合用作标识符
    """
    if not table_name:
        return "table"

    # 移除特殊字符并转换为小写
    import re

    clean_name = re.sub(r"[^a-zA-Z0-9_]", "_", table_name).lower()

    # 如果名称太长，进行截断
    if len(clean_name) > max_length:
        clean_name = clean_name[:max_length]

    # 确保不以数字开头
    if clean_name and clean_name[0].isdigit():
        clean_name = f"t_{clean_name}"

    # 如果结果为空或太短，使用默认名称
    if not clean_name or len(clean_name) < 2:
        clean_name = "tbl"

    return clean_name


def detect_column_conflicts(sources: List[DataSource]) -> Dict[str, List[str]]:
    """
    检测多个数据源之间的列名冲突
    """
    column_sources = defaultdict(list)

    for source in sources:
        if source.columns:
            for column in source.columns:
                column_sources[column].append(source.id)

    # 找出冲突的列名
    conflicts = {
        col: source_list
        for col, source_list in column_sources.items()
        if len(source_list) > 1
    }

    return conflicts


def generate_column_aliases(sources: List[DataSource]) -> Dict[str, Dict[str, str]]:
    """
    为冲突的列名生成别名
    """
    conflicts = detect_column_conflicts(sources)
    aliases = {}

    for source in sources:
        source_aliases = {}
        if source.columns:
            for column in source.columns:
                if column in conflicts:
                    # 生成别名：table_name_column_name
                    alias = f"{source.id}_{column}"
                    source_aliases[column] = alias
                else:
                    source_aliases[column] = column
        aliases[source.id] = source_aliases

    return aliases


def build_join_query(query_request: QueryRequest) -> str:
    """
    构建复杂的多表JOIN查询
    """
    sources = query_request.sources
    joins = query_request.joins

    if not sources:
        raise ValueError("至少需要一个数据源")

    if len(sources) == 1:
        # 单表查询
        return build_single_table_query(query_request)

    # 多表JOIN查询
    return build_multi_table_join_query(query_request)


def get_actual_table_name(source) -> str:
    """
    获取数据源的实际表名
    对于DuckDB表，去掉duckdb_前缀
    """
    # 检查是否是DuckDB数据源
    source_type = getattr(source, "sourceType", None) or getattr(source, "type", None)

    if source_type == "duckdb":
        # 使用name字段，如果没有则从id中获取
        actual_table_name = getattr(source, "name", None) or getattr(source, "id", None)
        # 确保表名不为None
        if not actual_table_name:
            raise ValueError("DuckDB数据源缺少表名")

        # 如果表名以'duckdb_'开头，去掉前缀
        if isinstance(actual_table_name, str) and actual_table_name.startswith(
            "duckdb_"
        ):
            actual_table_name = actual_table_name[7:]  # 去掉'duckdb_'前缀
        return actual_table_name
    else:
        # 对于非DuckDB数据源，直接使用id
        table_id = getattr(source, "id", None)
        if not table_id:
            raise ValueError("数据源缺少ID")
        return table_id


def build_single_table_query(query_request: QueryRequest) -> str:
    """
    构建单表查询，并将SELECT * 展开为所有列
    """
    con = get_db_connection()
    source = query_request.sources[0]
    actual_table_name = get_actual_table_name(source)
    table_name_sql = f'"{actual_table_name}"'

    # 构建SELECT子句
    if query_request.select_columns:
        select_clause = ", ".join([f'"{col}"' for col in query_request.select_columns])
    else:
        try:
            # 展开 SELECT *
            columns_df = con.execute(f"PRAGMA table_info({table_name_sql})").fetchdf()
            all_columns = columns_df["name"].tolist()
            select_clause = ", ".join([f'"{col}"' for col in all_columns])
            if not select_clause:  # 如果表没有列
                select_clause = "*"
        except Exception as e:
            logger.warning(
                f"无法获取表 '{actual_table_name}' 的列信息来展开 '*': {e}。将回退到 'SELECT *'。"
            )
            select_clause = "*"

    query = f"SELECT {select_clause} FROM {table_name_sql}"

    # 添加WHERE条件
    if query_request.where_conditions:
        query += f" WHERE {query_request.where_conditions}"

    # 添加ORDER BY
    if query_request.order_by:
        query += f" ORDER BY {query_request.order_by}"

    # 添加LIMIT
    if query_request.limit:
        query += f" LIMIT {query_request.limit}"

    return query


def build_multi_table_join_query(query_request: QueryRequest) -> str:
    """
    构建多表JOIN查询 - 优化VARCHAR JOIN性能
    """
    sources = query_request.sources
    joins = query_request.joins

    # 为JOIN列创建索引以提升性能
    if joins:
        try:
            create_join_indexes(sources, joins)
        except Exception as e:
            logger.warning(f"创建JOIN索引失败，但继续执行查询: {str(e)}")

    # 生成改进的列别名以处理冲突
    column_aliases = generate_improved_column_aliases(sources)

    # 构建SELECT子句
    select_parts = []
    if query_request.select_columns:
        # 用户指定了要选择的列
        for col in query_request.select_columns:
            # 查找列属于哪个表
            found = False
            for source in sources:
                if source.columns and col in source.columns:
                    table_alias = source.id
                    column_alias = column_aliases[source.id][col]
                    select_parts.append(f'{table_alias}."{col}" AS "{column_alias}"')
                    found = True
                    break
            if not found:
                # 如果没找到，直接使用列名
                select_parts.append(f'"{col}"')
    else:
        # 选择所有列，使用改进的别名避免冲突
        for source in sources:
            if source.columns:
                for col in source.columns:
                    table_alias = source.id
                    column_alias = column_aliases[source.id][col]
                    select_parts.append(f'{table_alias}."{col}" AS "{column_alias}"')

    select_clause = ", ".join(select_parts) if select_parts else "*"

    # 构建FROM子句和JOIN子句
    if not joins:
        # 没有JOIN条件，使用CROSS JOIN
        from_clause = f'"{get_actual_table_name(sources[0])}"'
        for source in sources[1:]:
            from_clause += f' CROSS JOIN "{get_actual_table_name(source)}"'
    else:
        # 有JOIN条件，构建JOIN链
        from_clause = build_join_chain(sources, joins)

    # 构建优化的查询 - 添加HASH JOIN提示
    if joins:
        # 对于有JOIN的查询，添加优化提示
        query = f"SELECT {select_clause} FROM {from_clause}"
    else:
        query = f"SELECT {select_clause} FROM {from_clause}"

    # 添加WHERE条件
    if query_request.where_conditions:
        query += f" WHERE {query_request.where_conditions}"

    # 添加ORDER BY
    if query_request.order_by:
        query += f" ORDER BY {query_request.order_by}"

    # 添加LIMIT
    if query_request.limit:
        query += f" LIMIT {query_request.limit}"

    return query


def build_join_chain(sources: List[DataSource], joins: List[Join]) -> str:
    """
    构建JOIN链，支持多表连接和多字段关联
    """
    if not joins:
        return f'"{get_actual_table_name(sources[0])}"'

    # 创建表的映射
    source_map = {source.id: source for source in sources}

    # 从第一个JOIN开始构建
    first_join = joins[0]
    left_source = source_map[first_join.left_source_id]
    right_source = source_map[first_join.right_source_id]
    left_table = get_actual_table_name(left_source)
    right_table = get_actual_table_name(right_source)

    # 构建JOIN类型映射
    join_type_map = {
        JoinType.INNER: "INNER JOIN",
        JoinType.LEFT: "LEFT JOIN",
        JoinType.RIGHT: "RIGHT JOIN",
        JoinType.FULL_OUTER: "FULL OUTER JOIN",
        JoinType.CROSS: "CROSS JOIN",
    }

    # 开始构建查询
    from_clause = f'"{left_table}"'

    # 收集所有相同表对的JOIN条件
    join_conditions_map = {}

    for join in joins:
        left_id = join.left_source_id
        right_id = join.right_source_id

        # 创建JOIN键，用于合并相同表对的JOIN条件
        join_key = tuple(sorted([left_id, right_id]))

        if join_key not in join_conditions_map:
            join_conditions_map[join_key] = {
                "left_table": left_id,
                "right_table": right_id,
                "join_type": join.join_type,
                "conditions": [],
            }

        # 添加条件到对应的JOIN
        if join.conditions:
            join_conditions_map[join_key]["conditions"].extend(join.conditions)

    # 处理所有JOIN（现在每个表对只处理一次）
    for join_key, join_info in join_conditions_map.items():
        left_id = join_info["left_table"]
        right_id = join_info["right_table"]
        join_type = join_info["join_type"]
        all_conditions = join_info["conditions"]

        join_type_sql = join_type_map.get(join_type, "INNER JOIN")
        right_source = source_map[right_id]
        right_table = get_actual_table_name(right_source)

        from_clause += f' {join_type_sql} "{right_table}"'

        # 添加所有JOIN条件（包括多字段关联）
        if join_type != JoinType.CROSS and all_conditions:
            conditions = []
            for condition in all_conditions:
                left_source = source_map[left_id]
                right_source = source_map[right_id]
                left_table_name = get_actual_table_name(left_source)
                right_table_name = get_actual_table_name(right_source)
                base_left_col = (
                    f'"{left_table_name}"."{condition.left_column}"'
                )
                base_right_col = (
                    f'"{right_table_name}"."{condition.right_column}"'
                )
                left_col = base_left_col
                right_col = base_right_col

                if condition.left_cast:
                    left_col = f"TRY_CAST({left_col} AS {condition.left_cast})"
                if condition.right_cast:
                    right_col = f"TRY_CAST({right_col} AS {condition.right_cast})"
                conditions.append(f"{left_col} {condition.operator} {right_col}")

            if conditions:
                from_clause += f" ON {' AND '.join(conditions)}"

    return from_clause


def create_varchar_index(table_name: str, column_name: str, con=None) -> bool:
    """
    为VARCHAR列创建索引以优化JOIN性能
    """
    if con is None:
        con = get_db_connection()

    try:
        # 检查表是否存在
        tables = con.execute("SHOW TABLES").fetchall()
        table_exists = any(table[0] == table_name for table in tables)

        if not table_exists:
            logger.warning(f"表 {table_name} 不存在，无法创建索引")
            return False

        # 创建索引名称
        index_name = f"idx_{table_name}_{column_name}".replace("-", "_").replace(
            " ", "_"
        )

        # 检查索引是否已存在
        try:
            existing_indexes = con.execute(
                f"PRAGMA table_info('{table_name}')"
            ).fetchall()
            # DuckDB的索引检查方式
            con.execute(
                f'CREATE INDEX IF NOT EXISTS "{index_name}" ON "{table_name}" ("{column_name}")'
            )
            logger.info(
                f"已为表 {table_name} 的列 {column_name} 创建索引: {index_name}"
            )
            return True
        except Exception as e:
            if "already exists" in str(e).lower():
                logger.info(f"索引 {index_name} 已存在")
                return True
            else:
                raise e

    except Exception as e:
        logger.error(f"创建索引失败 {table_name}.{column_name}: {str(e)}")
        return False


def create_join_indexes(sources: List[DataSource], joins: List[Join], con=None) -> None:
    """
    为JOIN操作中涉及的列创建索引
    """
    if con is None:
        con = get_db_connection()

    try:
        # 收集所有JOIN列
        join_columns = set()

        for join in joins:
            for condition in join.conditions:
                join_columns.add((join.left_source_id, condition.left_column))
                join_columns.add((join.right_source_id, condition.right_column))

        # 为每个JOIN列创建索引
        for table_name, column_name in join_columns:
            create_varchar_index(table_name, column_name, con)

        logger.info(f"已为 {len(join_columns)} 个JOIN列创建索引")

    except Exception as e:
        logger.error(f"批量创建JOIN索引失败: {str(e)}")


def optimize_query_plan(query: str, con=None) -> str:
    """
    优化查询计划
    """
    if con is None:
        con = get_db_connection()

    try:
        # 获取查询计划
        explain_query = f"EXPLAIN {query}"
        plan = con.execute(explain_query).fetchdf()
        logger.info(f"查询计划:\n{plan.to_string()}")

        # 这里可以添加查询优化逻辑
        # 例如：重新排序JOIN顺序、添加索引提示等

        return query
    except Exception as e:
        logger.warning(f"查询计划分析失败: {str(e)}")
        return query


def validate_query_syntax(query: str, con=None) -> Tuple[bool, str]:
    """
    验证查询语法
    """
    if con is None:
        con = get_db_connection()

    try:
        # 使用EXPLAIN来验证语法
        explain_query = f"EXPLAIN {query}"
        con.execute(explain_query)
        return True, "查询语法正确"
    except Exception as e:
        return False, f"查询语法错误: {str(e)}"


def handle_non_serializable_data(obj):
    """
    处理不可序列化的数据类型，转换为JSON可序列化的格式
    """
    import json
    import decimal
    import numpy as np
    from datetime import datetime, date

    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    elif isinstance(obj, decimal.Decimal):
        return float(obj)
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif pd.isna(obj):
        return None
    else:
        return str(obj)
