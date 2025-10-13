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

# 避免循环导入，在需要时动态导入
# from core.security import mask_sensitive_config
from core.encryption import decrypt_config_passwords

logger = logging.getLogger(__name__)


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

    query_timeout: int = 300  # 5分钟
    """SQL查询超时时间，单位为秒"""

    download_timeout: int = 600  # 10分钟
    """文件下载超时时间，单位为秒"""

    max_query_rows: int = 10000
    """页面查询结果最大行数，更大数据量使用异步任务"""

    max_tables: int = 200
    """数据库表预览最大数量限制"""

    enable_caching: bool = True
    """是否启用查询结果缓存"""

    cache_ttl: int = 3600  # 1小时
    """缓存生存时间，单位为秒"""

    timezone: str = "Asia/Shanghai"
    """应用时区设置，影响时间相关的数据处理"""

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

    duckdb_enable_profiling: bool = True
    """是否启用DuckDB查询性能分析，有助于性能调优"""

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

    query_proxy_timeout: int = 300
    """查询代理超时时间，单位为秒"""

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

        # 设置默认DuckDB扩展
        if self.duckdb_extensions is None:
            self.duckdb_extensions = ["excel", "json", "parquet"]


class ConfigManager:
    """统一配置管理器"""

    def __init__(self, config_dir: str = None):
        if config_dir:
            self.config_dir = Path(config_dir)
        elif os.getenv("CONFIG_DIR"):
            self.config_dir = Path(os.getenv("CONFIG_DIR"))
        else:
            # 默认配置目录
            self.config_dir = Path(__file__).parent.parent.parent / "config"

        self.config_dir.mkdir(exist_ok=True)

        # 配置文件路径
        self.mysql_config_file = self.config_dir / "mysql-configs.json"
        self.app_config_file = self.config_dir / "app-config.json"
        self.datasources_config_file = self.config_dir / "datasources.json"
        self.sql_favorites_file = self.config_dir / "sql-favorites.json"

        # 配置缓存
        self._mysql_configs: Dict[str, DatabaseConfig] = {}
        self._app_config: Optional[AppConfig] = None
        self._datasources_config: Dict[str, Any] = {}

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
        # MySQL配置模板
        if not self.mysql_config_file.exists():
            default_mysql_config = []
            self._save_json(self.mysql_config_file, default_mysql_config)
            logger.info(f"创建默认MySQL配置文件: {self.mysql_config_file}")

        # 应用配置模板
        if not self.app_config_file.exists():
            default_app_config = asdict(AppConfig())
            self._save_json(self.app_config_file, default_app_config)
            logger.info(f"创建默认应用配置文件: {self.app_config_file}")
        else:
            # 更新现有配置文件，确保包含所有新字段
            self._update_existing_app_config()

        # 数据源配置模板
        if not self.datasources_config_file.exists():
            default_datasources_config = {"file_sources": [], "database_sources": []}
            self._save_json(self.datasources_config_file, default_datasources_config)
            logger.info(f"创建默认数据源配置文件: {self.datasources_config_file}")

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
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"保存配置文件失败 {file_path}: {str(e)}")
            raise

    def load_all_configs(self):
        """加载所有配置"""
        self.load_mysql_configs()
        self.load_app_config()
        self.load_datasources_config()
        # 同步数据库管理器的配置
        self._sync_database_manager_configs()

    def load_mysql_configs(self) -> Dict[str, DatabaseConfig]:
        """加载MySQL配置 - 优先从datasources.json加载，兼容mysql-configs.json"""
        try:
            self._mysql_configs = {}

            # 首先尝试从datasources.json加载
            datasources_data = self._load_json(self.datasources_config_file)
            if datasources_data and "database_sources" in datasources_data:
                for config_data in datasources_data["database_sources"]:
                    if (
                        config_data.get("type") == "mysql"
                        and "id" in config_data
                        and "params" in config_data
                    ):
                        # 解密配置中的密码
                        decrypted_config_data = decrypt_config_passwords(config_data)

                        config = DatabaseConfig(
                            id=decrypted_config_data["id"],
                            name=decrypted_config_data.get(
                                "name", decrypted_config_data["id"]
                            ),
                            type=decrypted_config_data.get("type", "mysql"),
                            params=decrypted_config_data["params"],
                            enabled=decrypted_config_data.get("enabled", True),
                            description=decrypted_config_data.get("description"),
                        )
                        self._mysql_configs[config.id] = config

                logger.info(
                    f"从datasources.json加载了 {len(self._mysql_configs)} 个MySQL配置"
                )
                return self._mysql_configs

            # 如果datasources.json没有数据，尝试从mysql-configs.json加载（向后兼容）
            configs_data = self._load_json(self.mysql_config_file)
            if isinstance(configs_data, list):
                for config_data in configs_data:
                    if "id" in config_data and "params" in config_data:
                        # 解密配置中的密码
                        decrypted_config_data = decrypt_config_passwords(config_data)

                        config = DatabaseConfig(
                            id=decrypted_config_data["id"],
                            name=decrypted_config_data.get(
                                "name", decrypted_config_data["id"]
                            ),
                            type=decrypted_config_data.get("type", "mysql"),
                            params=decrypted_config_data["params"],
                            enabled=decrypted_config_data.get("enabled", True),
                            description=decrypted_config_data.get("description"),
                        )
                        self._mysql_configs[config.id] = config

                logger.info(
                    f"从mysql-configs.json加载了 {len(self._mysql_configs)} 个MySQL配置"
                )
                return self._mysql_configs

            logger.info(f"没有找到MySQL配置")
            return self._mysql_configs

        except Exception as e:
            logger.error(f"加载MySQL配置失败: {str(e)}")
            return {}

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
                    "query_timeout": int(
                        os.getenv(
                            "QUERY_TIMEOUT", config_data.get("query_timeout", 300)
                        )
                    ),
                    "max_query_rows": int(
                        os.getenv(
                            "MAX_QUERY_ROWS", config_data.get("max_query_rows", 10000)
                        )
                    ),
                    "enable_caching": os.getenv(
                        "ENABLE_CACHING", str(config_data.get("enable_caching", True))
                    ).lower()
                    == "true",
                    "cache_ttl": int(
                        os.getenv("CACHE_TTL", config_data.get("cache_ttl", 3600))
                    ),
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
                    "query_proxy_timeout": int(
                        os.getenv(
                            "QUERY_PROXY_TIMEOUT",
                            config_data.get("query_proxy_timeout", 300),
                        )
                    ),
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

            self._app_config = AppConfig(**config_data)
            logger.info("应用配置加载成功")
            return self._app_config

        except Exception as e:
            logger.error(f"加载应用配置失败: {str(e)}")
            self._app_config = AppConfig()
            return self._app_config

    def load_datasources_config(self) -> Dict[str, Any]:
        """加载数据源配置"""
        try:
            self._datasources_config = self._load_json(self.datasources_config_file)
            logger.info("数据源配置加载成功")
            return self._datasources_config

        except Exception as e:
            logger.error(f"加载数据源配置失败: {str(e)}")
            return {}

    def get_mysql_config(self, config_id: str) -> Optional[DatabaseConfig]:
        """获取MySQL配置"""
        return self._mysql_configs.get(config_id)

    def get_all_mysql_configs(self) -> Dict[str, DatabaseConfig]:
        """获取所有MySQL配置"""
        return self._mysql_configs.copy()

    def get_app_config(self) -> AppConfig:
        """获取应用配置"""
        if self._app_config is None:
            self.load_app_config()
        return self._app_config

    def get_datasources_config(self) -> Dict[str, Any]:
        """获取数据源配置"""
        return self._datasources_config.copy()

    def get_all_database_sources(self) -> List[Dict[str, Any]]:
        """获取所有数据库数据源配置"""
        try:
            datasources_data = self._load_json(self.datasources_config_file)
            if datasources_data and "database_sources" in datasources_data:
                return datasources_data["database_sources"]
            return []
        except Exception as e:
            logger.error(f"获取数据库数据源配置失败: {str(e)}")
            return []

    def _sync_database_manager_configs(self):
        """同步数据库管理器的配置到MySQL配置中"""
        try:
            # 获取所有数据库数据源
            database_sources = self.get_all_database_sources()

            # 将MySQL类型的配置同步到_mysql_configs
            for source in database_sources:
                if (
                    source.get("type") == "mysql"
                    and "id" in source
                    and "params" in source
                ):
                    # 检查是否已经存在
                    if source["id"] not in self._mysql_configs:
                        # 解密配置中的密码
                        decrypted_config_data = decrypt_config_passwords(source)

                        config = DatabaseConfig(
                            id=decrypted_config_data["id"],
                            name=decrypted_config_data.get(
                                "name", decrypted_config_data["id"]
                            ),
                            type=decrypted_config_data.get("type", "mysql"),
                            params=decrypted_config_data["params"],
                            enabled=decrypted_config_data.get("enabled", True),
                            description=decrypted_config_data.get("description"),
                        )
                        self._mysql_configs[config.id] = config
                        logger.info(f"同步MySQL配置: {config.id}")

            logger.info(f"同步完成，当前共有 {len(self._mysql_configs)} 个MySQL配置")

        except Exception as e:
            logger.error(f"同步数据库管理器配置失败: {str(e)}")

    def add_mysql_config(self, config: DatabaseConfig) -> bool:
        """添加MySQL配置"""
        try:
            self._mysql_configs[config.id] = config

            # 保存到文件
            configs_list = [asdict(cfg) for cfg in self._mysql_configs.values()]
            self._save_json(self.mysql_config_file, configs_list)

            logger.info(f"添加MySQL配置成功: {config.id}")
            return True

        except Exception as e:
            logger.error(f"添加MySQL配置失败: {str(e)}")
            return False

    def remove_mysql_config(self, config_id: str) -> bool:
        """删除MySQL配置"""
        try:
            if config_id in self._mysql_configs:
                del self._mysql_configs[config_id]

                # 保存到文件
                configs_list = [asdict(cfg) for cfg in self._mysql_configs.values()]
                self._save_json(self.mysql_config_file, configs_list)

                logger.info(f"删除MySQL配置成功: {config_id}")
                return True
            else:
                logger.warning(f"MySQL配置不存在: {config_id}")
                return False

        except Exception as e:
            logger.error(f"删除MySQL配置失败: {str(e)}")
            return False

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
