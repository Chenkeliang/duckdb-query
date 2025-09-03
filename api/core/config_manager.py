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
    """应用配置"""

    debug: bool = False
    cors_origins: List[str] = None
    max_file_size: int = 50 * 1024 * 1024 * 1024  # 50GB
    query_timeout: int = 300  # 5分钟
    download_timeout: int = 600  # 10分钟，用于下载操作
    max_query_rows: int = 10000
    max_tables: int = 200  # 数据库表预览最大数量
    enable_caching: bool = True
    cache_ttl: int = 3600  # 1小时
    timezone: str = "Asia/Shanghai"  # 应用时区
    
    # DuckDB引擎配置参数
    duckdb_memory_limit: str = "8GB"           # 内存限制
    duckdb_threads: int = 8                    # 线程数
    duckdb_temp_directory: str = None          # 临时目录
    duckdb_home_directory: str = None          # 主目录
    duckdb_extension_directory: str = None     # 扩展目录
    duckdb_enable_profiling: bool = True       # 启用性能分析
    duckdb_profiling_output: str = None        # 性能分析输出文件
    duckdb_force_index_join: bool = False      # 强制索引JOIN
    duckdb_enable_object_cache: bool = True    # 启用对象缓存
    duckdb_preserve_insertion_order: bool = False  # 保持插入顺序
    duckdb_enable_progress_bar: bool = False   # 启用进度条
    duckdb_extensions: List[str] = None        # 要安装的扩展列表

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

        # 数据源配置模板
        if not self.datasources_config_file.exists():
            default_datasources_config = {"file_sources": [], "database_sources": []}
            self._save_json(self.datasources_config_file, default_datasources_config)
            logger.info(f"创建默认数据源配置文件: {self.datasources_config_file}")

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

    def load_mysql_configs(self) -> Dict[str, DatabaseConfig]:
        """加载MySQL配置"""
        try:
            configs_data = self._load_json(self.mysql_config_file)
            self._mysql_configs = {}

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

            logger.info(f"加载了 {len(self._mysql_configs)} 个MySQL配置")
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
