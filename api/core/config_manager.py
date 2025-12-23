"""
统一配置管理系统
集中管理所有配置文件，提供配置加载、验证、更新等功能
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
    """DuckDB 数据目录集合"""

    database_path: Path
    temp_dir: Path
    extension_dir: Path
    home_dir: Path

# 避免循环导入，在需要时动态导入
# from core.security import mask_sensitive_config
from core.encryption import decrypt_config_passwords

@dataclass
class DatabaseConfig:
    """数据库配置"""

    id: str
    name: str
    type: str  # mysql, postgresql, sqlite
    params: Dict[str, Any]
    enabled: bool = True
    description: Optional[str] = None


@dataclass
class AppConfig:
    """
    应用配置类

    包含应用运行所需的所有配置参数，包括基础配置和DuckDB引擎配置。
    所有配置都可以通过配置文件进行自定义，系统会自动加载和验证。
    """

    # ==================== 基础应用配置 ====================
    debug: bool = False
    """调试模式开关，启用后会输出详细的调试信息"""

    cors_origins: List[str] = None
    """跨域请求允许的源列表，用于前端跨域访问"""

    max_file_size: int = 50 * 1024 * 1024 * 1024  # 50GB
    """最大文件上传大小限制，单位为字节"""

    max_query_rows: int = 10000
    """页面查询结果最大行数，更大数据量使用异步任务"""

    max_tables: int = 200
    """数据库表预览最大数量限制"""

    timezone: str = "Asia/Shanghai"
    """应用时区设置，影响时间相关的数据处理。默认使用中国时区"""

    table_metadata_cache_ttl_hours: int = 24
    """表元数据缓存有效期（小时），<=0 时禁用缓存"""

    # ==================== DuckDB引擎配置 ====================
    # 这些参数控制DuckDB查询引擎的行为和性能

    duckdb_memory_limit: str = "8GB"
    """DuckDB内存使用限制，支持KB/MB/GB单位"""

    duckdb_threads: int = 8
    """DuckDB并行查询线程数，建议设置为CPU核心数"""

    duckdb_temp_directory: str = None
    """DuckDB临时文件目录，None时使用系统默认"""

    duckdb_home_directory: str = None
    """DuckDB主目录，用于存储配置和扩展，None时使用系统默认"""

    duckdb_extension_directory: str = None
    """DuckDB扩展安装目录，None时使用系统默认"""

    duckdb_data_dir: str = None
    """DuckDB数据根目录，包含数据库文件、临时目录、扩展目录"""

    duckdb_database_path: str = None
    """DuckDB数据库文件路径，为空时在数据目录下创建 main.db"""

    duckdb_enable_profiling: str = "query_tree"
    """DuckDB查询性能分析格式：json, query_tree, query_tree_optimizer, no_output"""

    duckdb_profiling_output: str = None
    """性能分析输出文件路径，None时使用系统默认"""

    duckdb_prefer_range_joins: bool = False
    """是否优先使用范围JOIN，可能影响JOIN性能"""

    duckdb_enable_object_cache: bool = True
    """是否启用对象缓存，提升重复查询性能"""

    duckdb_preserve_insertion_order: bool = False
    """是否保持数据插入顺序，False可提升查询性能"""

    duckdb_enable_progress_bar: bool = False
    """是否启用查询进度条，生产环境建议关闭"""

    duckdb_extensions: List[str] = None
    """要自动安装和加载的DuckDB扩展列表"""

    server_data_mounts: List[Dict[str, Any]] = None
    """服务器挂载目录列表，供容器内直接读取文件"""

    duckdb_remote_settings: Dict[str, Any] = None
    """DuckDB初始化时需要执行的SET语句，如S3/OSS参数"""

    duckdb_debug_logging: bool = False
    """是否启用DuckDB调试日志（SHOW TABLES / EXPLAIN等）"""

    duckdb_auto_explain_threshold_ms: int = 0
    """慢查询阈值，超过后自动记录EXPLAIN，0表示关闭"""

    exports_dir: str = None
    """导出文件目录，默认在运行根目录的exports"""

    # ==================== 连接池配置 ====================
    # 这些参数控制DuckDB连接池的行为和性能

    pool_min_connections: int = 2
    """连接池最小连接数"""

    pool_max_connections: int = 10
    """连接池最大连接数"""

    pool_connection_timeout: int = 30
    """连接获取超时时间，单位为秒"""

    pool_idle_timeout: int = 300
    """空闲连接超时时间，单位为秒"""

    pool_max_retries: int = 3
    """连接重试最大次数"""

    # ==================== 数据库连接配置 ====================
    # 这些参数控制外部数据库连接的行为

    db_connect_timeout: int = 10
    """数据库连接超时时间，单位为秒"""

    db_read_timeout: int = 30
    """数据库读取超时时间，单位为秒"""

    db_write_timeout: int = 30
    """数据库写入超时时间，单位为秒"""

    db_ping_timeout: int = 5
    """数据库连接测试超时时间，单位为秒"""

    # ==================== 其他超时配置 ====================
    # 这些参数控制各种操作的超时行为

    url_reader_timeout: int = 30
    """URL读取超时时间，单位为秒"""

    url_reader_head_timeout: int = 10
    """URL HEAD请求超时时间，单位为秒"""

    sqlite_timeout: int = 10
    """SQLite连接超时时间，单位为秒"""

    pool_wait_timeout: float = 1.0
    """连接池等待超时时间，单位为秒"""

    def __post_init__(self):
        if self.cors_origins is None:
            self.cors_origins = ["http://localhost:3000", "http://localhost:5173"]

        # 设置默认DuckDB扩展（包含联邦查询扩展）
        if self.duckdb_extensions is None:
            self.duckdb_extensions = ["excel", "json", "parquet", "mysql", "postgres"]

        if self.server_data_mounts is None:
            self.server_data_mounts = []

        if self.duckdb_remote_settings is None:
            self.duckdb_remote_settings = {}


class ConfigManager:
    """统一配置管理器"""

    def __init__(self, config_dir: str = None):
        self._write_lock = Lock()
        self._project_root = self._resolve_project_root()

        if config_dir:
            self.config_dir = Path(config_dir)
        elif os.getenv("CONFIG_DIR"):
            self.config_dir = Path(os.getenv("CONFIG_DIR"))
        else:
            # 默认配置目录
            self.config_dir = Path(__file__).parent.parent.parent / "config"

        self.config_dir.mkdir(exist_ok=True)

        # 配置文件路径
        self.app_config_file = self.config_dir / "app-config.json"
        self.sql_favorites_file = self.config_dir / "sql-favorites.json"

        # 配置缓存
        self._app_config: Optional[AppConfig] = None

        # 初始化配置
        self._initialize_configs()

    def _initialize_configs(self):
        """初始化配置文件"""
        # 创建默认配置文件
        self._create_default_configs()

        # 加载配置
        self.load_all_configs()

    def _create_default_configs(self):
        """创建默认配置文件"""
        # 应用配置模板
        if not self.app_config_file.exists():
            default_app_config = asdict(AppConfig())
            self._save_json(self.app_config_file, default_app_config)
            logger.info(f"创建默认应用配置文件: {self.app_config_file}")
        else:
            # 更新现有配置文件，确保包含所有新字段
            self._update_existing_app_config()

        # SQL收藏配置模板
        if not self.sql_favorites_file.exists():
            default_sql_favorites = []
            self._save_json(self.sql_favorites_file, default_sql_favorites)
            logger.info(f"创建默认SQL收藏配置文件: {self.sql_favorites_file}")

    def _update_existing_app_config(self):
        """更新现有应用配置文件，确保包含所有新字段"""
        try:
            # 读取现有配置
            existing_config = self._load_json(self.app_config_file)

            # 创建默认配置
            default_config = asdict(AppConfig())

            # 合并配置：保留现有值，添加缺失的字段
            updated_config = {}
            for key, default_value in default_config.items():
                if key in existing_config:
                    updated_config[key] = existing_config[key]
                else:
                    updated_config[key] = default_value
                    logger.info(f"添加新配置字段: {key} = {default_value}")

            # 保存更新后的配置
            self._save_json(self.app_config_file, updated_config)
            logger.info(f"应用配置文件已更新: {self.app_config_file}")

        except Exception as e:
            logger.warning(f"更新应用配置文件失败: {str(e)}")

    def _load_json(self, file_path: Path) -> Dict[str, Any]:
        """加载JSON配置文件"""
        try:
            if file_path.exists():
                with open(file_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            return {}
        except Exception as e:
            logger.error(f"加载配置文件失败 {file_path}: {str(e)}")
            return {}

    def _save_json(self, file_path: Path, data: Any):
        """保存JSON配置文件"""
        self.atomic_write_json(file_path, data)

    def load_all_configs(self):
        """加载所有配置"""
        self.load_app_config()

    def _resolve_project_root(self) -> Path:
        """确定项目运行根目录"""
        override = os.getenv("APP_ROOT")
        if override:
            return Path(override)
        container_root = Path("/app")
        if container_root.exists():
            return container_root
        return Path(__file__).resolve().parent.parent.parent

    def _default_data_dir(self) -> Path:
        """默认数据目录"""
        return self._project_root / "data"

    def get_duckdb_paths(self, ensure_dirs: bool = True) -> DuckDBPaths:
        """获取DuckDB相关目录配置"""
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

        return DuckDBPaths(
            database_path=database_path,
            temp_dir=temp_dir,
            extension_dir=extension_dir,
            home_dir=home_dir,
        )

    def get_exports_dir(self, ensure_dir: bool = True) -> Path:
        """获取导出目录"""
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
        """原子写入JSON配置"""
        tmp_path = file_path.with_suffix(file_path.suffix + ".tmp")
        file_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with self._write_lock:
                with open(tmp_path, "w", encoding="utf-8") as tmp_file:
                    json.dump(data, tmp_file, indent=2, ensure_ascii=False, default=str)
                os.replace(tmp_path, file_path)
        except Exception as exc:
            logger.error(f"保存配置文件失败 {file_path}: {exc}")
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except OSError:
                    logger.debug("移除临时文件失败: %s", tmp_path)
            raise



    def load_app_config(self) -> AppConfig:
        """加载应用配置"""
        try:
            config_data = self._load_json(self.app_config_file)

            # 从环境变量覆盖配置
            config_data.update(
                {
                    "debug": os.getenv(
                        "DEBUG", str(config_data.get("debug", False))
                    ).lower()
                    == "true",
                    "cors_origins": os.getenv(
                        "CORS_ORIGINS", ",".join(config_data.get("cors_origins", []))
                    ).split(","),
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
                    # 数据库超时配置
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
                    # 连接池配置
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
                    # 其他超时配置
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
                }
            )

            pivot_extension = config_data.get("pivot_table_extension")
            if isinstance(pivot_extension, str):
                config_data["pivot_table_extension"] = (
                    pivot_extension.strip() or "pivot_table"
                )

            self._app_config = AppConfig(**config_data)
            logger.info("应用配置加载成功")
            return self._app_config

        except Exception as e:
            logger.error(f"加载应用配置失败: {str(e)}")
            self._app_config = AppConfig()
            return self._app_config



    def get_app_config(self) -> AppConfig:
        """获取应用配置"""
        if self._app_config is None:
            self.load_app_config()
        return self._app_config



    def update_app_config(self, **kwargs) -> bool:
        """更新应用配置"""
        try:
            if self._app_config is None:
                self.load_app_config()

            # 更新配置
            for key, value in kwargs.items():
                if hasattr(self._app_config, key):
                    setattr(self._app_config, key, value)

            # 保存到文件
            self._save_json(self.app_config_file, asdict(self._app_config))

            logger.info("应用配置更新成功")
            return True

        except Exception as e:
            logger.error(f"更新应用配置失败: {str(e)}")
            return False

    def get_safe_mysql_configs(self) -> List[Dict[str, Any]]:
        """获取安全的MySQL配置（遮蔽敏感信息）"""
        safe_configs = []
        for config in self._mysql_configs.values():
            # 本地实现敏感信息遮蔽，避免循环导入
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


# 全局配置管理器实例
config_manager = ConfigManager()
