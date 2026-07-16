# pylint: disable=duplicate-code
import duckdb
import logging
import threading
import time
from typing import List, Dict, Any, Optional, Tuple
import re
from collections import defaultdict
from contextlib import contextmanager

from models.query_models import (
    QueryRequest,
    DataSource,
)

logger = logging.getLogger(__name__)

# 导入连接池管理器
from core.database.duckdb_pool import get_connection_pool


class PooledConnectionProxy:
    """DuckDB连接代理，确保使用后自动归还到连接池"""

    def __init__(self):
        self._pool = get_connection_pool()
        self._ctx = self._pool.get_connection()
        self._connection = self._ctx.__enter__()
        self._closed = False

    def __getattr__(self, item):
        return getattr(self._connection, item)

    def close(self):
        if not self._closed:
            self._ctx.__exit__(None, None, None)
            self._closed = True

    def __enter__(self):
        return self._connection

    def __exit__(self, exc_type, exc, tb):
        self.close()

    def __del__(self):
        self.close()


@contextmanager
def with_duckdb_connection():
    """使用DuckDB连接池获取连接"""
    pool = get_connection_pool()
    with pool.get_connection() as connection:
        yield connection


# MySQL 连接断开类错误标记（联邦查询经 DuckDB mysql 扩展时出现）
_FEDERATED_CONNECTION_LOST_MARKERS = (
    "server has gone away",
    "lost connection",
    "broken pipe",
)


def _is_federated_connection_lost(err: Exception) -> bool:
    """是否为 MySQL 联邦连接断开错误（可通过清缓存重连自愈）。"""
    msg = str(err).lower()
    return any(marker in msg for marker in _FEDERATED_CONNECTION_LOST_MARKERS)


def _is_read_only_query(query: str) -> bool:
    """仅 SELECT 视为可安全重试（幂等）。写操作即便连接闪断也不重试，
    避免语句已在 MySQL 落库、重试导致重复应用（非幂等）。解析失败按非只读处理。"""
    if not query or not query.strip():
        return False
    parser = duckdb.connect()
    try:
        statements = parser.extract_statements(query)
    except Exception:  # noqa: BLE001  无法解析时保守地不重试
        return False
    finally:
        parser.close()
    return bool(statements) and all(
        s.type == duckdb.StatementType.SELECT for s in statements
    )


@contextmanager
def _use_connection(connection=None):
    """内部工具：优先使用传入连接，否则从连接池获取"""
    if connection is not None:
        yield connection
        return
    with with_duckdb_connection() as pooled_con:
        yield pooled_con


def _resolve_duckdb_extensions(app_config, override_extensions: Optional[List[str]] = None) -> List[str]:
    """根据配置生成最终需要加载的DuckDB扩展列表"""
    base_extensions = []
    source_extensions = override_extensions if override_extensions is not None else app_config.duckdb_extensions

    if source_extensions:
        for ext in source_extensions:
            if ext:
                base_extensions.append(ext)

    # 去重但保持顺序（忽略大小写）
    seen = set()
    resolved = []
    for ext in base_extensions:
        key = ext.lower()
        if key not in seen:
            resolved.append(ext)
            seen.add(key)

    return resolved


def _quote_identifier(identifier: str) -> str:
    """转义内嵌双引号并加引号包裹单个 SQL 标识符（保留非 ASCII，如中文别名）。"""
    escaped = str(identifier).replace('"', '""')
    return f'"{escaped}"'


def build_attach_sql(alias: str, db_config: Dict[str, Any]) -> str:
    """
    根据数据库配置构建 ATTACH SQL 语句
    
    用于联邦查询，将外部数据库（MySQL、PostgreSQL、SQLite）
    附加到 DuckDB 中进行跨数据库查询。
    
    Args:
        alias: SQL 中使用的数据库别名
        db_config: 数据库连接配置，包含 type, host, user/username, password, database, port 等字段
        
    Returns:
        ATTACH SQL 语句
        
    Raises:
        ValueError: 当数据库类型不支持或缺少必要参数时
        
    Examples:
        >>> config = {'type': 'mysql', 'host': 'localhost', 'user': 'root', 
        ...           'password': 'pwd', 'database': 'mydb', 'port': 3306}
        >>> build_attach_sql('mysql_db', config)
        'ATTACH \\'host=localhost user=root password=pwd database=mydb port=3306\\' AS "mysql_db" (TYPE mysql)'
    """
    db_type = db_config.get('type', '').lower()
    quoted_alias = _quote_identifier(alias)

    # 支持 user 和 username 两种参数名称
    username = db_config.get('user') or db_config.get('username')

    if db_type == 'mysql':
        if not username:
            raise ValueError("MySQL connection missing username parameter (user or username)")
        # MySQL 连接字符串格式
        conn_str = f"host={db_config['host']} user={username} password={db_config.get('password', '')} database={db_config['database']}"
        if db_config.get('port'):
            conn_str += f" port={db_config['port']}"
        return f"ATTACH '{conn_str}' AS {quoted_alias} (TYPE mysql)"

    elif db_type in ('postgresql', 'postgres'):
        if not username:
            raise ValueError("PostgreSQL connection missing username parameter (user or username)")
        # PostgreSQL 连接字符串格式
        conn_str = f"host={db_config['host']} dbname={db_config['database']} user={username} password={db_config.get('password', '')}"
        if db_config.get('port'):
            conn_str += f" port={db_config['port']}"
        return f"ATTACH '{conn_str}' AS {quoted_alias} (TYPE postgres)"

    elif db_type == 'sqlite':
        # SQLite 使用文件路径（兼容 path、database 两种参数键）
        path = db_config.get('path') or db_config.get('database')
        if not path:
            raise ValueError("SQLite connection missing file path (path or database)")
        return f"ATTACH '{path}' AS {quoted_alias} (TYPE sqlite)"

    elif db_type == 'duckdb':
        # DuckDB 文件：原生只读挂载，零拷贝、与本地表同速（无 scanner 开销）
        path = db_config.get('path') or db_config.get('database')
        if not path:
            raise ValueError("DuckDB connection missing file path (path or database)")
        return f"ATTACH '{path}' AS {quoted_alias} (READ_ONLY)"

    else:
        raise ValueError(f"Unsupported database type: {db_type}")


def _apply_duckdb_configuration(connection, temp_dir: str):
    """
    自动应用所有DuckDB配置参数

    Args:
        connection: DuckDB连接实例
        temp_dir: 临时目录路径
    """
    from core.common.config_manager import config_manager

    try:
        app_config = config_manager.get_app_config()
        paths = config_manager.get_duckdb_paths()

        # 获取所有以duckdb_开头的配置项
        config_items = {
            k: v
            for k, v in app_config.__dict__.items()
            if k.startswith("duckdb_")
        }

        logger.info(f"Found {len(config_items)} DuckDB configuration items")

        # 应用基础配置
        if config_items.get("duckdb_threads"):
            connection.execute(f"SET threads={config_items['duckdb_threads']}")
            logger.info(f"DuckDB threads set to: {config_items['duckdb_threads']}")

        if config_items.get("duckdb_memory_limit"):
            connection.execute(
                f"SET memory_limit='{config_items['duckdb_memory_limit']}'"
            )
            connection.execute(
                f"SET max_memory='{config_items['duckdb_memory_limit']}'"
            )
            logger.info(f"DuckDB memory limit set to: {config_items['duckdb_memory_limit']}")

        # 设置目录相关配置
        resolved_temp_dir = temp_dir or str(paths.temp_dir)
        connection.execute(f"SET temp_directory='{resolved_temp_dir}'")
        connection.execute(f"SET home_directory='{paths.home_dir}'")
        connection.execute(f"SET extension_directory='{paths.extension_dir}'")

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
                f"DuckDB profiling set to: {config_items['duckdb_enable_profiling']}"
            )

        if config_items.get("duckdb_prefer_range_joins") is not None:
            connection.execute(
                f"SET prefer_range_joins={str(config_items['duckdb_prefer_range_joins']).lower()}"
            )
            logger.info(
                f"DuckDB prefer range joins set to: {config_items['duckdb_prefer_range_joins']}"
            )

        if config_items.get("duckdb_enable_object_cache") is not None:
            connection.execute(
                f"SET enable_object_cache={str(config_items['duckdb_enable_object_cache']).lower()}"
            )
            logger.info(
                f"DuckDB object cache set to: {config_items['duckdb_enable_object_cache']}"
            )

        if config_items.get("duckdb_preserve_insertion_order") is not None:
            connection.execute(
                f"SET preserve_insertion_order={str(config_items['duckdb_preserve_insertion_order']).lower()}"
            )
            logger.info(
                f"DuckDB preserve insertion order set to: {config_items['duckdb_preserve_insertion_order']}"
            )

        if config_items.get("duckdb_enable_progress_bar") is not None:
            connection.execute(
                f"SET enable_progress_bar={str(config_items['duckdb_enable_progress_bar']).lower()}"
            )
            logger.info(
                f"DuckDB progress bar set to: {config_items['duckdb_enable_progress_bar']}"
            )

        remote_settings = config_items.get("duckdb_remote_settings") or {}
        if isinstance(remote_settings, dict):
            for setting_key, setting_value in remote_settings.items():
                if not setting_key:
                    continue
                try:
                    connection.execute(f"SET {setting_key}={setting_value}")
                    logger.info("Applied remote configuration: %s=%s", setting_key, setting_value)
                except Exception as remote_error:
                    logger.warning(
                        "Failed to apply remote config %s: %s", setting_key, remote_error
                    )

        # 设置目录配置
        if config_items.get("duckdb_home_directory"):
            connection.execute(
                f"SET home_directory='{config_items['duckdb_home_directory']}'"
            )
            logger.info(f"DuckDB home directory set to: {config_items['duckdb_home_directory']}")

        if config_items.get("duckdb_extension_directory"):
            connection.execute(
                f"SET extension_directory='{config_items['duckdb_extension_directory']}'"
            )
            logger.info(
                f"DuckDB extension directory set to: {config_items['duckdb_extension_directory']}"
            )

        # 自动安装和加载扩展
        extensions_to_load = _resolve_duckdb_extensions(
            app_config, config_items.get("duckdb_extensions")
        )
        if extensions_to_load:
            _install_duckdb_extensions(connection, extensions_to_load)
        else:
            logger.info("No DuckDB extensions configured to load")

        # 应用引擎兼容性配置（SET GLOBAL，逐项 try/except，见函数注释）
        apply_engine_compat_settings(connection, app_config.engine_compat)

    except Exception as e:
        logger.error(f"Error applying DuckDB configuration: {str(e)}")
        # 使用默认配置作为后备
        _apply_default_duckdb_config(connection, temp_dir)


# autoinstall_known_extensions 是数据库实例级 GLOBAL 开关（duckdb_settings()
# 实测 scope=GLOBAL），连接池扩容与 engine_compat 保存两条路径都会做
# "关→操作→恢复"。并发交错会把别人的禁网窗口提前恢复成 true（可复现），
# 让启动路径意外联网；进程内互斥即可（窗口毫秒级：LOAD 本地文件 + 若干 SET）。
_autoinstall_toggle_lock = threading.Lock()


def _install_duckdb_extensions(connection, extensions: List[str]):
    """启动阶段加载扩展：只加载本地已有的，绝不联网。

    INSTALL 走网络(extensions.duckdb.org),受限网络下 DuckDB 内置下载客户端
    单次实测挂 ~120s,发生在连接池初始化即表现为"本地引擎启动超时"(v1.1.4
    曾为此把扩展全量预置进包)。v1.2.0 桌面包只预置 excel,启动改为:本地有
    (预置/已装)则秒加载,没有则秒失败跳过。注意"只 LOAD"并不天然禁网——
    实测别名扩展(mysql/postgres → *_scanner)的 LOAD 会触发 autoinstall
    联网下载(httpfs 等直名则本地快速失败),因此 LOAD 期间必须临时关闭
    autoinstall。未安装扩展的获取入口:扩展页手动下载(routers/
    duckdb_extensions),或联邦查询等用到时 DuckDB autoinstall(该动作
    本就需要网络)。
    """
    if not extensions:
        return

    with _autoinstall_toggle_lock:
        try:
            connection.execute("SET autoinstall_known_extensions=false")
        except Exception as exc:  # noqa: BLE001
            logger.debug("disable autoinstall before startup LOAD failed: %s", exc)
        try:
            for ext_name in extensions:
                try:
                    connection.execute(f"LOAD {ext_name};")
                    logger.info(f"DuckDB extension {ext_name} loaded")
                except Exception as load_error:
                    # 常态:未预置/未安装的扩展在全新环境必然走到这里,按 debug 降噪
                    logger.debug(
                        "DuckDB extension %s not available locally, skipped at startup "
                        "(install via extensions page, or auto-installed on first use): %s",
                        ext_name,
                        load_error,
                    )
        finally:
            try:
                connection.execute("SET autoinstall_known_extensions=true")
            except Exception as exc:  # noqa: BLE001
                # 恢复失败 = 全进程联邦扩展 autoinstall 失效直至重启，必须可见
                logger.warning("restore autoinstall after startup LOAD failed: %s", exc)


# 引擎兼容性配置对应的 DuckDB SET GLOBAL 选项名，分别由 sqlite_scanner / mysql /
# postgres / iceberg 扩展注册。字段名与 DuckDB 官方 option 名完全一致，无需映射表。
ENGINE_COMPAT_OPTIONS = (
    "sqlite_all_varchar",
    "mysql_incomplete_dates_as_nulls",
    "pg_array_as_varchar",
    "unsafe_enable_version_guessing",
)


def apply_engine_compat_settings(connection, engine_compat: Optional[Dict[str, Any]]) -> None:
    """应用引擎兼容性配置。

    SET GLOBAL 是数据库实例级作用域：在池中任意一个连接上执行，所有池化连接立即生效。
    这四个 option 分别由 sqlite_scanner/mysql/postgres/iceberg 扩展注册。

    只 SET 值为 True 的开关：False 与 DuckDB 原生默认一致，SET 是纯空转——
    且对未加载扩展的 option 执行 SET 会触发 DuckDB autoinstall 联网下载
    （受限网络单次挂 ~120s，发生在连接池初始化 = "本地引擎启动超时"；
    扩展全量预置时代被掩盖，v1.2.0 按需预置后必须掐掉）。SET 期间临时关闭
    autoinstall：本地已装的扩展 autoload 即时生效；未装的快速失败降级为
    debug 日志（用户装好扩展后新连接自然生效），初始化路径绝不联网。
    """
    if not engine_compat:
        return
    enabled = [opt for opt in ENGINE_COMPAT_OPTIONS if bool(engine_compat.get(opt, False))]
    if not enabled:
        return
    with _autoinstall_toggle_lock:
        try:
            connection.execute("SET autoinstall_known_extensions=false")
        except Exception as exc:  # noqa: BLE001
            logger.debug("disable autoinstall before engine_compat failed: %s", exc)
        try:
            for option in enabled:
                try:
                    connection.execute(f"SET GLOBAL {option}=true")
                except Exception as exc:  # noqa: BLE001  扩展未装时的预期失败，静默降级
                    logger.debug("engine_compat SET GLOBAL %s=true skipped: %s", option, exc)
        finally:
            try:
                connection.execute("SET autoinstall_known_extensions=true")
            except Exception as exc:  # noqa: BLE001
                # 恢复失败 = 全进程联邦扩展 autoinstall 失效直至重启，必须可见
                logger.warning("restore autoinstall after engine_compat failed: %s", exc)


def _apply_default_duckdb_config(connection, temp_dir: str):
    """
    应用默认DuckDB配置（作为后备方案）

    Args:
        connection: DuckDB连接实例
        temp_dir: 临时目录路径
    """
    logger.info("Applying default DuckDB configuration")

    try:
        # 尝试从配置文件获取默认值
        from core.common.config_manager import config_manager

        app_config = config_manager.get_app_config()

        # 使用配置文件中的默认值
        paths = config_manager.get_duckdb_paths()
        connection.execute(f"SET threads={app_config.duckdb_threads}")
        connection.execute(f"SET memory_limit='{app_config.duckdb_memory_limit}'")
        connection.execute(f"SET temp_directory='{temp_dir or str(paths.temp_dir)}'")
        connection.execute(f"SET home_directory='{paths.home_dir}'")
        connection.execute(f"SET extension_directory='{paths.extension_dir}'")

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

        # 应用引擎兼容性配置（SET GLOBAL，逐项 try/except，见函数注释）
        apply_engine_compat_settings(connection, app_config.engine_compat)

        logger.info("Successfully applied default DuckDB configuration from config file")

    except Exception as e:
        logger.error(f"Failed to apply DuckDB configuration: {str(e)}")
        # 不再使用硬编码后备值，让错误暴露出来
        raise RuntimeError(f"Unable to apply DuckDB configuration, please check config file: {str(e)}")


def get_db_connection():
    """
    获取DuckDB连接（兼容旧接口）。
    返回的连接对象在使用完成后会自动归还连接池。
    """
    return PooledConnectionProxy()


def fetch_query_records(connection, query):
    """执行查询 → (columns, records)：JSON 安全，纯 Python，无 DataFrame 中间层。

    v1.2.1 传输主路径。列类型无关地保真（Decimal/任意精度 int 由 DuckDB
    原生给出，编码契约见 utils.records_from_cursor），也不再有
    fetchdf/fetchall 双路径分岔。

    内置联邦连接自愈：mysql 扩展按 DSN 进程级缓存连接，空闲后被中间设备/
    wait_timeout 静默掐断，复用即「Server has gone away」，DETACH 清不掉。
    只读查询遇此错误时清空扩展连接缓存并重试一次（原先只有 join 路径的
    execute_query 有此保护，现在所有取数路径统一受益）。
    """
    from core.common.utils import records_from_cursor  # pylint: disable=import-outside-toplevel

    try:
        res = connection.execute(query)
    except Exception as err:
        if not (_is_federated_connection_lost(err) and _is_read_only_query(query)):
            raise
        logger.warning(
            "Federated MySQL connection lost (%s); clearing cache and retrying once",
            err,
        )
        try:
            connection.execute("CALL mysql_clear_cache()")
        except Exception as clear_err:  # pylint: disable=broad-except
            logger.warning("mysql_clear_cache failed: %s", clear_err)
        res = connection.execute(query)
    return records_from_cursor(res, res.description or [])


def table_exists(table_name: str, con=None) -> bool:
    """
    检查表是否存在
    """
    try:
        with _use_connection(con) as connection:
            table_names = [
                row[0] for row in connection.execute("SHOW TABLES").fetchall()
            ]
        return table_name in table_names
    except Exception as e:
        logger.error(f"Failed to check if table exists {table_name}: {str(e)}")
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


def get_table_info(table_name: str, con=None) -> Dict[str, Any]:
    """
    获取表的信息
    """
    try:
        with _use_connection(con) as connection:
            # 获取表结构
            schema_query = f"DESCRIBE {table_name}"
            schema_rows = connection.execute(schema_query).fetchall()

            # 获取行数
            count_query = f"SELECT COUNT(*) as row_count FROM {table_name}"
            count_result = connection.execute(count_query).fetchone()
        row_count = count_result[0] if count_result else 0

        # 统一列数据格式：转换为前端期望的对象数组格式
        columns = [
            {"name": str(row[0]), "type": str(row[1])} for row in schema_rows
        ]

        return {
            "table_name": table_name,
            "columns": columns,
            "row_count": row_count,
        }
    except Exception as e:
        logger.error(f"Failed to get table information {table_name}: {str(e)}")
        return {}


def generate_improved_column_aliases(
    sources: List[DataSource],
) -> Dict[str, Dict[str, str]]:
    """
    为冲突的列名生成改进的别名
    使用原始字段名 + 表标识的方式，如：字段名_表标识
    支持两种列格式：字符串列表或字典列表
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
                # 支持两种列格式：字符串或包含 'name' 键的字典
                if isinstance(column, dict):
                    col_name = column.get('name', str(column))
                else:
                    col_name = str(column)
                
                if col_name in conflicts:
                    # 生成改进的别名：column_name_table_identifier
                    alias = f"{col_name}_{table_identifier}"
                    source_aliases[col_name] = alias
                else:
                    # 非冲突列保持原始名称
                    source_aliases[col_name] = col_name
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
        # 联邦表 id 是限定名（如 "sqlite_alarm_sqlite.alerts"），需先取最后一段
        # 表名，否则 simplify_table_name 会把截断长度用在连接前缀上，
        # 导致同一连接下的不同表都被截断成相同前缀（如 sqlite_ala）而冲突
        if isinstance(base_name, str) and "." in base_name:
            base_name = base_name.rsplit(".", 1)[-1]
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

    # 移除特殊字符并转换为小写。
    # \w 按 Unicode 匹配,保留中文等非 ASCII 表名——冲突别名要求"列名_表名"可读,
    # 旧的 [^a-zA-Z0-9_] 会把「商品表」「订单表」全吞成下划线,同连接两表再撞名加 _1。
    # 别名在生成 SQL 时始终带双引号,含中文是合法标识符。
    import re

    clean_name = re.sub(r"[^\w]", "_", table_name, flags=re.UNICODE).lower()

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
    支持两种列格式：字符串列表或字典列表
    """
    column_sources = defaultdict(list)

    for source in sources:
        if source.columns:
            for column in source.columns:
                # 支持两种列格式：字符串或包含 'name' 键的字典
                if isinstance(column, dict):
                    col_name = column.get('name', str(column))
                else:
                    col_name = str(column)
                column_sources[col_name].append(source.id)

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
            raise ValueError("DuckDB data source missing table name")

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
            raise ValueError("Data source missing ID")
        return table_id


def build_single_table_query(query_request: QueryRequest) -> str:
    """
    构建单表查询，并将SELECT * 展开为所有列
    """
    source = query_request.sources[0]
    actual_table_name = get_actual_table_name(source)
    table_name_sql = f'"{actual_table_name}"'

    # 构建SELECT子句
    if query_request.select_columns:
        select_clause = ", ".join([f'"{col}"' for col in query_request.select_columns])
    else:
        try:
            # 展开 SELECT *
            with _use_connection() as connection:
                info_rows = connection.execute(
                    f"PRAGMA table_info({table_name_sql})"
                ).fetchall()
            # PRAGMA table_info 第 2 列为列名
            all_columns = [str(row[1]) for row in info_rows]
            select_clause = ", ".join([f'"{col}"' for col in all_columns])
            if not select_clause:  # 如果表没有列
                select_clause = "*"
        except Exception as e:
            logger.warning(
                f"Unable to get table '{actual_table_name}' column information to expand '*': {e}。will fall back to 'SELECT *'。"
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


def _build_column_expression(
    table_name: str, column_expr: str, available_columns: Optional[List[str]] = None
) -> str:
    """
    根据列表达式构建带表名前缀的列引用。

    - 对简单列名: 生成 "table_name"."column"
    - 对包含函数/复杂表达式的情况: 只为表达式中出现的 "列名" 添加表名前缀，
      避免把函数名一起包进双引号导致语法错误。
    """
    column_expr = (column_expr or "").strip()

    if not column_expr:
        raise ValueError("Column name in JOIN condition cannot be empty")

    columns_set = set(available_columns or [])

    # 先判断是否是“简单列名”（不包含括号/空格等），如果是则直接按列名处理
    simple_name: Optional[str] = None

    m = re.fullmatch(r'"([^"]+)"', column_expr)
    if m:
        simple_name = m.group(1)
    elif "(" not in column_expr and " " not in column_expr and "." not in column_expr:
        simple_name = column_expr

    if simple_name is not None and (not columns_set or simple_name in columns_set):
        return f'"{table_name}"."{simple_name}"'

    # 否则视为表达式：只为表达式内部的 "列名" 添加表名前缀（仅限已知列名）
    def _qualify_identifier(match: re.Match) -> str:
        identifier = match.group(1)
        if not columns_set or identifier in columns_set:
            return f'"{table_name}"."{identifier}"'
        return f'"{identifier}"'

    # 例如: substr("单据编号", 6) => substr("table"."单据编号", 6)
    qualified_expr = re.sub(r'"([^"]+)"', _qualify_identifier, column_expr)
    return qualified_expr


def optimize_query_plan(query: str, con=None) -> str:
    """
    优化查询计划
    """
    try:
        with _use_connection(con) as connection:
            explain_query = f"EXPLAIN {query}"
            plan_rows = connection.execute(explain_query).fetchall()
        plan_text = "\n".join(str(row[-1]) for row in plan_rows)
        logger.info(f"Query plan:\n{plan_text}")

        # 这里可以添加查询优化逻辑
        # 例如：重新排序JOIN顺序、添加索引提示等

        return query
    except Exception as e:
        logger.warning(f"Query plan analysis failed: {str(e)}")
        return query


def validate_query_syntax(query: str, con=None) -> Tuple[bool, str]:
    """
    验证查询语法
    """
    try:
        with _use_connection(con) as connection:
            explain_query = f"EXPLAIN {query}"
            connection.execute(explain_query)
        return True, "Query syntax correct"
    except Exception as e:
        return False, f"Query syntax error: {str(e)}"
