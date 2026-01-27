"""
统一configuration管理系统
集中管理所有configurationfile，提供configurationloading、验证、updating等功能
"""

import os
import json
import logging
from typing import Dict, Any, Optional, List
from pathlib import Path
from dataclasses import dataclass, asdict
from threading import Lock

logger = logging.getLogger(__name__)

@dataclass
class DuckDBPaths:
    """DuckDB data目录集合"""

    database_path: Path
    system_database_path: Path  # 系统tabledatabasepath（独立于用户data）
    temp_dir: Path
    extension_dir: Path
    home_dir: Path

# 避免循环导入，在需要时动态导入
# from core.security.security import mask_sensitive_config
from core.foundation.crypto_utils import decrypt_config_passwords

@dataclass
class DatabaseConfig:
    """databaseconfiguration"""

    id: str
    name: str
    type: str  # mysql, postgresql, sqlite
    params: Dict[str, Any]
    enabled: bool = True
    description: Optional[str] = None


@dataclass
class AppConfig:
    """
    应用configuration类

    包含应用运行所需的所有configurationparameter，包括基础configuration和DuckDB引擎configuration。
    所有configuration都可以通过configurationfile进行自定义，系统会自动loading和验证。
    """

    # ==================== 基础应用configuration ====================
    debug: bool = False
    """debug模式开关，启用后会输出详细的debuginfo"""

    cors_origins: List[str] = None
    """跨域请求允许的源columntable，用于前端跨域访问"""

    max_file_size: int = 50 * 1024 * 1024 * 1024  # 50GB
    """最大file上传大小限制，单位为字节"""

    max_query_rows: int = 10000
    """页面queryresult最大行数，更大data量使用异步任务"""

    max_tables: int = 200
    """databasetable预览最大数量限制"""

    timezone: str = "Asia/Shanghai"
    """应用时区设置，影响时间相关的data处理。默认使用中国时区"""

    table_metadata_cache_ttl_hours: int = 24
    """table元data缓存valid期（小时），<=0 时禁用缓存"""

    # ==================== DuckDB引擎configuration ====================
    # 这些parameter控制DuckDBquery引擎的行为和性能

    duckdb_memory_limit: str = "8GB"
    """DuckDB内存使用限制，支持KB/MB/GB单位"""

    duckdb_threads: int = 8
    """DuckDB并行query线程数，建议设置为CPU核心数"""

    duckdb_temp_directory: str = None
    """DuckDB临时file目录，None时使用系统默认"""

    duckdb_home_directory: str = None
    """DuckDB主目录，用于存储configuration和扩展，None时使用系统默认"""

    duckdb_extension_directory: str = None
    """DuckDB扩展安装目录，None时使用系统默认"""

    duckdb_data_dir: str = None
    """DuckDBdata根目录，包含databasefile、临时目录、扩展目录"""

    duckdb_database_path: str = None
    """DuckDBdatabasefilepath，is empty时在data目录下creating main.db"""

    duckdb_enable_profiling: str = "query_tree"
    """DuckDBquery性能分析格式：json, query_tree, query_tree_optimizer, no_output"""

    duckdb_profiling_output: str = None
    """性能分析输出filepath，None时使用系统默认"""

    duckdb_prefer_range_joins: bool = False
    """是否优先使用范围JOIN，可能影响JOIN性能"""

    duckdb_enable_object_cache: bool = True
    """是否启用对象缓存，提升重复query性能"""

    duckdb_preserve_insertion_order: bool = False
    """是否保持data插入顺序，False可提升query性能"""

    duckdb_enable_progress_bar: bool = False
    """是否启用query进度条，生产环境建议关闭"""

    duckdb_extensions: List[str] = None
    """要自动安装和loading的DuckDB扩展columntable"""

    server_data_mounts: List[Dict[str, Any]] = None
    """服务器挂载目录columntable，供容器内直接读取file"""

    duckdb_remote_settings: Dict[str, Any] = None
    """DuckDBinitializing时需要executing的SET语句，如S3/OSSparameter"""

    duckdb_debug_logging: bool = False
    """是否启用DuckDBdebug日志（SHOW TABLES / EXPLAIN等）"""

    duckdb_auto_explain_threshold_ms: int = 0
    """慢query阈值，超过后自动记录EXPLAIN，0table示关闭"""

    exports_dir: str = None
    """导出file目录，默认在运行根目录的exports"""

    # ==================== connection池configuration ====================
    # 这些parameter控制DuckDBconnection池的行为和性能

    pool_min_connections: int = 2
    """connection池最小connection数"""

    pool_max_connections: int = 10
    """connection池最大connection数"""

    pool_connection_timeout: int = 30
    """connectiongettingtimeout时间，单位为秒"""

    pool_idle_timeout: int = 300
    """空闲connectiontimeout时间，单位为秒"""

    pool_max_retries: int = 3
    """connectionretry最大次数"""

    # ==================== databaseconnectionconfiguration ====================
    # 这些parameter控制外部databaseconnection的行为

    db_connect_timeout: int = 10
    """databaseconnectiontimeout时间，单位为秒"""

    db_read_timeout: int = 30
    """database读取timeout时间，单位为秒"""

    db_write_timeout: int = 30
    """database写入timeout时间，单位为秒"""

    db_ping_timeout: int = 5
    """databaseconnection测试timeout时间，单位为秒"""

    # ==================== 其他timeoutconfiguration ====================
    # 这些parameter控制各种操作的timeout行为

    url_reader_timeout: int = 30
    """URL读取timeout时间，单位为秒"""

    url_reader_head_timeout: int = 10
    """URL HEAD请求timeout时间，单位为秒"""

    sqlite_timeout: int = 10
    """SQLiteconnectiontimeout时间，单位为秒"""

    pool_wait_timeout: float = 1.0
    """connection池等待timeout时间，单位为秒"""

    federated_query_timeout: int = 300
    """联邦query前端请求timeout时间，单位为秒。默认 300秒 (5分钟)"""

    def __post_init__(self):
        if self.cors_origins is None:
            self.cors_origins = ["http://localhost:3000", "http://localhost:5173"]

        # 设置默认DuckDB扩展（包含联邦query扩展）
        if self.duckdb_extensions is None:
            self.duckdb_extensions = ["excel", "json", "parquet", "mysql", "postgres"]

        if self.server_data_mounts is None:
            self.server_data_mounts = []

        if self.duckdb_remote_settings is None:
            self.duckdb_remote_settings = {}


class ConfigManager:
    """统一configuration管理器"""

    def __init__(self, config_dir: str = None):
        self._write_lock = Lock()
        self._project_root = self._resolve_project_root()

        if config_dir:
            self.config_dir = Path(config_dir)
        elif os.getenv("CONFIG_DIR"):
            self.config_dir = Path(os.getenv("CONFIG_DIR"))
        else:
            # 默认configuration目录 (common -> core -> api -> root -> config)
            self.config_dir = Path(__file__).resolve().parent.parent.parent.parent / "config"

        self.config_dir.mkdir(exist_ok=True)

        # configurationfilepath (优先检测 .json，如果没有则检测 .jsonc)
        json_path = self.config_dir / "app-config.json"
        jsonc_path = self.config_dir / "app-config.jsonc"
        
        if not json_path.exists() and jsonc_path.exists():
            self.app_config_file = jsonc_path
        else:
            self.app_config_file = json_path


        # configuration缓存
        self._app_config: Optional[AppConfig] = None

        # initializingconfiguration
        self._initialize_configs()

    def _initialize_configs(self):
        """initializingconfigurationfile"""
        # creating默认configurationfile
        self._create_default_configs()

        # loadingconfiguration
        self.load_all_configs()

    def _create_default_configs(self):
        """creating默认configurationfile"""
        # 应用configuration模板
        if not self.app_config_file.exists():
            default_app_config = asdict(AppConfig())
            self._save_json(self.app_config_file, default_app_config)
            logger.info(f"Creating default application configuration file: {self.app_config_file}")
        else:
            # updating现有configurationfile，确保包含所有新字段
            self._update_existing_app_config()



    def _update_existing_app_config(self):
        """updating现有应用configurationfile，确保包含所有新字段"""
        try:
            # 读取现有configuration
            existing_config = self._load_json(self.app_config_file)

            # creating默认configuration
            default_config = asdict(AppConfig())

            # 合并configuration：保留现有值，添加缺失的字段
            updated_config = {}
            for key, default_value in default_config.items():
                if key in existing_config:
                    updated_config[key] = existing_config[key]
                else:
                    updated_config[key] = default_value
                    logger.info(f"Adding new configuration field: {key} = {default_value}")

            # savingupdating后的configuration
            self._save_json(self.app_config_file, updated_config)
            logger.info(f"Application configuration file updated: {self.app_config_file}")

        except Exception as e:
            logger.warning(f"Failed to update application configuration file: {str(e)}")

    def _load_json(self, file_path: Path) -> Dict[str, Any]:
        """loadingJSONconfigurationfile（支持注释）"""
        try:
            if file_path.exists():
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                    
                # 移除注释 (支持 // 和 /* */)
                import re
                
                # 移除块注释 /* ... */
                content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
                
                # 移除行注释 // ... (注意处理URL中的//，这里简单处理：//前必须有空白或行首，且不是URL的一部分)
                # 更稳健的方式是ignore字符串内容的解析，但作为简单的configurationloading器，
                # 我们假设注释出现在行尾或独立行，并且URL不会与注释混淆（URL的//前是:）
                # 这里使用简单的行处理：如果行中存在 // 且不紧跟在 : 之后（为了兼容URL），则截断
                # 或者更简单：只支持独立行的注释和行尾且前面有空格的注释
                
                lines = content.split('\n')
                cleaned_lines = []
                for line in lines:
                    # 查找注释标记 //
                    comment_idx = line.find('//')
                    if comment_idx != -1:
                        # 检查是否看起来像URL (https://)
                        # 如果 // 前面试 :，则认为是URL的一部分，不处理（简易逻辑）
                        if comment_idx > 0 and line[comment_idx-1] == ':':
                            pass
                        else:
                            line = line[:comment_idx]
                    cleaned_lines.append(line)
                
                content = '\n'.join(cleaned_lines)
                
                # 处理可能产生的尾部逗号问题（JSON不支持，但configuration变更是常事）
                # 为了保持简单，暂不处理尾部逗号，依赖标准json解析
                # 大多数情况下用户只需小心
                
                return json.loads(content)
            return {}
        except Exception as e:
            logger.error(f"Loading configuration filefailed {file_path}: {str(e)}")
            return {}

    def _save_json(self, file_path: Path, data: Any):
        """savingJSONconfigurationfile"""
        self.atomic_write_json(file_path, data)

    def load_all_configs(self):
        """loading所有configuration"""
        self.load_app_config()

    def _resolve_project_root(self) -> Path:
        """确定项目运行根目录"""
        override = os.getenv("APP_ROOT")
        if override:
            return Path(override)
        container_root = Path("/app")
        if container_root.exists():
            return container_root
        # common -> core -> api -> root
        return Path(__file__).resolve().parent.parent.parent.parent

    def _default_data_dir(self) -> Path:
        """默认data目录"""
        return self._project_root / "data"

    def get_duckdb_paths(self, ensure_dirs: bool = True) -> DuckDBPaths:
        """gettingDuckDB相关目录configuration"""
        app_config = self.get_app_config()

        base_dir = (
            Path(app_config.duckdb_data_dir)
            if app_config.duckdb_data_dir
            else self._default_data_dir() / "duckdb"
        )

        database_path = (
            Path(app_config.duckdb_database_path)
            if app_config.duckdb_database_path
            else base_dir / "main.db"
        )

        temp_dir = (
            Path(app_config.duckdb_temp_directory)
            if app_config.duckdb_temp_directory
            else base_dir / "temp"
        )
        extension_dir = (
            Path(app_config.duckdb_extension_directory)
            if app_config.duckdb_extension_directory
            else base_dir / "extensions"
        )
        home_dir = (
            Path(app_config.duckdb_home_directory)
            if app_config.duckdb_home_directory
            else base_dir / "home"
        )

        if ensure_dirs:
            for path in [
                database_path.parent,
                temp_dir,
                extension_dir,
                home_dir,
            ]:
                path.mkdir(parents=True, exist_ok=True)

        # 系统databasepath（与 main.db 同目录）
        system_database_path = database_path.parent / "system.db"

        return DuckDBPaths(
            database_path=database_path,
            system_database_path=system_database_path,
            temp_dir=temp_dir,
            extension_dir=extension_dir,
            home_dir=home_dir,
        )

    def get_exports_dir(self, ensure_dir: bool = True) -> Path:
        """getting导出目录"""
        app_config = self.get_app_config()
        exports_dir = (
            Path(app_config.exports_dir)
            if app_config.exports_dir
            else self._project_root / "exports"
        )
        if ensure_dir:
            exports_dir.mkdir(parents=True, exist_ok=True)
        return exports_dir

    def atomic_write_json(self, file_path: Path, data: Any):
        """原子写入JSONconfiguration"""
        tmp_path = file_path.with_suffix(file_path.suffix + ".tmp")
        file_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with self._write_lock:
                with open(tmp_path, "w", encoding="utf-8") as tmp_file:
                    json.dump(data, tmp_file, indent=2, ensure_ascii=False, default=str)
                os.replace(tmp_path, file_path)
        except Exception as exc:
            logger.error(f"savingconfigurationfilefailed {file_path}: {exc}")
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except OSError:
                    logger.debug("Failed to remove temporary file: %s", tmp_path)
            raise



    def load_app_config(self) -> AppConfig:
        """loading应用configuration"""
        try:
            config_data = self._load_json(self.app_config_file)

            # 从环境变量覆盖configuration
            config_data.update(
                {
                    "debug": os.getenv(
                        "DEBUG", str(config_data.get("debug", False))
                    ).lower()
                    == "true",
                    "cors_origins": os.getenv(
                        "CORS_ORIGINS", ",".join(config_data.get("cors_origins", []))
                    ).split(","),
                    "timezone": os.getenv(
                        "TIMEZONE", config_data.get("timezone", "Asia/Shanghai")
                    ),
                    "max_file_size": int(
                        os.getenv(
                            "MAX_FILE_SIZE",
                            config_data.get("max_file_size", 100 * 1024 * 1024),
                        )
                    ),
                    "max_query_rows": int(
                        os.getenv(
                            "MAX_QUERY_ROWS", config_data.get("max_query_rows", 10000)
                        )
                    ),
                    "duckdb_data_dir": os.getenv(
                        "DUCKDB_DATA_DIR", config_data.get("duckdb_data_dir")
                    )
                    or None,
                    "duckdb_database_path": os.getenv(
                        "DUCKDB_DATABASE_PATH",
                        config_data.get("duckdb_database_path"),
                    )
                    or None,
                    "duckdb_home_directory": os.getenv(
                        "DUCKDB_HOME_DIRECTORY",
                        config_data.get("duckdb_home_directory"),
                    )
                    or None,
                    "duckdb_extension_directory": os.getenv(
                        "DUCKDB_EXTENSION_DIRECTORY",
                        config_data.get("duckdb_extension_directory"),
                    )
                    or None,
                    "duckdb_debug_logging": os.getenv(
                        "DUCKDB_DEBUG_LOGGING",
                        str(config_data.get("duckdb_debug_logging", False)),
                    ).lower()
                    == "true",
                    "duckdb_auto_explain_threshold_ms": int(
                        os.getenv(
                            "DUCKDB_AUTO_EXPLAIN_THRESHOLD_MS",
                            config_data.get("duckdb_auto_explain_threshold_ms", 0)
                            or 0,
                        )
                    ),
                    "exports_dir": os.getenv(
                        "EXPORTS_DIR", config_data.get("exports_dir")
                    )
                    or None,
                    # databasetimeoutconfiguration
                    "db_connect_timeout": int(
                        os.getenv(
                            "DB_CONNECT_TIMEOUT",
                            config_data.get("db_connect_timeout", 10),
                        )
                    ),
                    "db_read_timeout": int(
                        os.getenv(
                            "DB_READ_TIMEOUT", config_data.get("db_read_timeout", 30)
                        )
                    ),
                    "db_write_timeout": int(
                        os.getenv(
                            "DB_WRITE_TIMEOUT", config_data.get("db_write_timeout", 30)
                        )
                    ),
                    "db_ping_timeout": int(
                        os.getenv(
                            "DB_PING_TIMEOUT", config_data.get("db_ping_timeout", 5)
                        )
                    ),
                    # connection池configuration
                    "pool_min_connections": int(
                        os.getenv(
                            "POOL_MIN_CONNECTIONS",
                            config_data.get("pool_min_connections", 2),
                        )
                    ),
                    "pool_max_connections": int(
                        os.getenv(
                            "POOL_MAX_CONNECTIONS",
                            config_data.get("pool_max_connections", 10),
                        )
                    ),
                    "pool_connection_timeout": int(
                        os.getenv(
                            "POOL_CONNECTION_TIMEOUT",
                            config_data.get("pool_connection_timeout", 30),
                        )
                    ),
                    "pool_idle_timeout": int(
                        os.getenv(
                            "POOL_IDLE_TIMEOUT",
                            config_data.get("pool_idle_timeout", 300),
                        )
                    ),
                    "pool_max_retries": int(
                        os.getenv(
                            "POOL_MAX_RETRIES", config_data.get("pool_max_retries", 3)
                        )
                    ),
                    "pool_wait_timeout": float(
                        os.getenv(
                            "POOL_WAIT_TIMEOUT",
                            config_data.get("pool_wait_timeout", 1.0),
                        )
                    ),
                    # 其他timeoutconfiguration
                    "url_reader_timeout": int(
                        os.getenv(
                            "URL_READER_TIMEOUT",
                            config_data.get("url_reader_timeout", 30),
                        )
                    ),
                    "url_reader_head_timeout": int(
                        os.getenv(
                            "URL_READER_HEAD_TIMEOUT",
                            config_data.get("url_reader_head_timeout", 10),
                        )
                    ),
                    "sqlite_timeout": int(
                        os.getenv(
                            "SQLITE_TIMEOUT", config_data.get("sqlite_timeout", 10)
                        )
                    ),
                    "federated_query_timeout": int(
                        os.getenv(
                            "FEDERATED_QUERY_TIMEOUT",
                            config_data.get("federated_query_timeout", 300),
                        )
                    ),
                }
            )

            pivot_extension = config_data.get("pivot_table_extension")
            if isinstance(pivot_extension, str):
                config_data["pivot_table_extension"] = (
                    pivot_extension.strip() or "pivot_table"
                )

            self._app_config = AppConfig(**config_data)
            logger.info("Application configuration loaded successfully")
            return self._app_config

        except Exception as e:
            logger.error(f"Failed to load application configuration: {str(e)}")
            self._app_config = AppConfig()
            return self._app_config



    def get_app_config(self) -> AppConfig:
        """getting应用configuration"""
        if self._app_config is None:
            self.load_app_config()
        return self._app_config



    def update_app_config(self, **kwargs) -> bool:
        """updating应用configuration"""
        try:
            if self._app_config is None:
                self.load_app_config()

            # updatingconfiguration
            for key, value in kwargs.items():
                if hasattr(self._app_config, key):
                    setattr(self._app_config, key, value)

            # saving到file
            self._save_json(self.app_config_file, asdict(self._app_config))

            logger.info("Application configuration updated successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to update application configuration: {str(e)}")
            return False

    def get_safe_mysql_configs(self) -> List[Dict[str, Any]]:
        """getting安全的MySQLconfiguration（遮蔽敏感info）"""
        safe_configs = []
        for config in self._mysql_configs.values():
            # 本地实现敏感info遮蔽，避免循环导入
            safe_params = config.params.copy()
            sensitive_keys = ["password", "pwd", "secret", "token", "key"]
            for key in safe_params:
                if any(sensitive in key.lower() for sensitive in sensitive_keys):
                    safe_params[key] = "***"

            safe_config = {
                "id": config.id,
                "name": config.name,
                "type": config.type,
                "enabled": config.enabled,
                "description": config.description,
                "params": safe_params,
            }
            safe_configs.append(safe_config)
        return safe_configs


# 全局configuration管理器实例
config_manager = ConfigManager()
