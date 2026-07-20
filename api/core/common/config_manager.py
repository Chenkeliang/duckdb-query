"""
统一配置管理系统
集中管理所有配置文件，提供配置加载、验证、更新等功能
"""

import os
import json
import logging
from typing import Dict, Any, Optional, List
from pathlib import Path
from dataclasses import dataclass, asdict, field
from threading import Lock

from core.common.paths import get_config_dir, get_user_data_dir

logger = logging.getLogger(__name__)

@dataclass
class DuckDBPaths:
    """DuckDB 数据目录集合"""

    database_path: Path
    system_database_path: Path  # 系统表数据库路径（独立于用户数据）
    temp_dir: Path
    extension_dir: Path
    home_dir: Path

# 避免循环导入，在需要时动态导入
# from core.security.security import mask_sensitive_config
from core.foundation.crypto_utils import decrypt_config_passwords

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

    包含应用运行所需的所有配置参数，包括基础配置和 DuckDB 引擎配置。
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
    """页面查询结果最大行数，更大数据量使用异步任务（默认与 frontend/src/constants/queryLimits.ts 中 DEFAULT_MAX_QUERY_ROWS 一致）"""

    max_tables: int = 200
    """数据库表预览最大数量限制"""

    timezone: str = "Asia/Shanghai"
    """应用时区设置，影响时间相关的数据处理。默认使用中国时区"""

    table_metadata_cache_ttl_hours: int = 24
    """表元数据缓存有效期（小时），<=0 时禁用缓存"""

    # ==================== DuckDB 引擎配置 ====================
    # 这些参数控制 DuckDB 查询引擎的行为和性能

    duckdb_memory_limit: str = "8GB"
    """DuckDB内存使用限制，支持KB/MB/GB单位"""

    duckdb_threads: int = field(default_factory=lambda: os.cpu_count() or 8)
    """DuckDB 并行查询线程数。默认跟随 CPU 核心数（与 DuckDB 原生默认一致，
    避免硬编码 8 在 <8 核机上过度订阅、>8 核机上跑不满）；可在配置中显式覆盖。"""

    duckdb_temp_directory: str = None
    """DuckDB 临时文件目录，None 时使用系统默认"""

    duckdb_home_directory: str = None
    """DuckDB 主目录，用于存储配置和扩展，None 时使用系统默认"""

    duckdb_extension_directory: str = None
    """DuckDB扩展安装目录，None时使用系统默认"""

    duckdb_data_dir: str = None
    """DuckDB 数据根目录，包含数据库文件、临时目录、扩展目录"""

    duckdb_database_path: str = None
    """DuckDB 数据库文件路径，为空时在数据目录下创建 main.db"""

    duckdb_enable_profiling: str = "no_output"
    """DuckDB 查询性能分析格式：json, query_tree_optimizer, no_output。
    默认 no_output:不向 stderr 吐执行树(否则连 SELECT 42 都刷满桌面 4MB 日志)。
    注意:值 "query_tree" 会在加载期被【无条件重映射】为 no_output——它曾是刷屏的旧
    出厂默认,且无法按值区分"遗留"还是"主动选择"。要看执行树诊断请用
    query_tree_optimizer 或 json(二者不受重映射影响);慢查询另有 auto-EXPLAIN 兜底。"""

    duckdb_profiling_output: str = None
    """性能分析输出文件路径，None 时使用系统默认"""

    duckdb_prefer_range_joins: bool = False
    """是否优先使用范围JOIN，可能影响JOIN性能"""

    duckdb_enable_object_cache: bool = True
    """[DuckDB 1.5.3 起为 legacy no-op] 历史"对象缓存"开关；当前锁定版本执行
    SET 不报错但无实际效果，仅为兼容旧配置文件保留（勿依赖它提升性能）。"""

    duckdb_preserve_insertion_order: bool = False
    """是否保持数据插入顺序，False 可提升查询性能"""

    duckdb_enable_progress_bar: bool = False
    """是否启用查询进度条，生产环境建议关闭"""

    duckdb_extensions: List[str] = None
    """要自动安装和加载的 DuckDB 扩展列表"""

    server_data_mounts: List[Dict[str, Any]] = None
    """服务器挂载目录列表，供容器内直接读取文件"""

    duckdb_remote_settings: Dict[str, Any] = None
    """DuckDB 初始化时需要执行的 SET 语句，如 S3/OSS 参数"""

    engine_compat: Dict[str, bool] = None
    """引擎兼容性配置（四个布尔开关，默认全 false，与 DuckDB 原生默认一致）：
    sqlite_all_varchar / mysql_incomplete_dates_as_nulls / pg_array_as_varchar /
    unsafe_enable_version_guessing。字段名与 DuckDB SET GLOBAL 的 option 名完全一致，
    实际生效逻辑见 core/database/duckdb_engine.py:apply_engine_compat_settings"""

    duckdb_auto_explain_threshold_ms: int = 0
    """慢查询阈值，超过后自动记录 EXPLAIN，0 表示关闭"""

    json_import_column_type: str = "auto"
    """JSON/JSONL 入湖默认类型策略：auto（DuckDB 推断）或 variant（各列 VARIANT）"""

    exports_dir: str = None
    """导出文件目录，默认在运行根目录的 exports"""

    # ==================== 连接池配置 ====================
    # 这些参数控制 DuckDB 连接池的行为和性能

    pool_min_connections: int = 2
    """连接池最小连接数"""

    pool_max_connections: int = 10
    """连接池最大连接数"""

    pool_connection_timeout: int = 30
    """获取连接超时时间，单位为秒"""

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

    # ==================== 其他超时配置 ====================
    # 这些参数控制各种操作的超时行为

    url_reader_timeout: int = 30
    """URL 读取超时时间，单位为秒"""

    url_reader_head_timeout: int = 10
    """URL HEAD 请求超时时间，单位为秒"""

    sqlite_timeout: int = 10
    """SQLite 连接超时时间，单位为秒"""

    pool_wait_timeout: float = 1.0
    """连接池等待超时时间，单位为秒"""

    federated_query_timeout: int = 300
    """联邦查询前端请求超时时间，单位为秒。默认 300 秒 (5 分钟)"""

    federated_semijoin_threshold: int = 10000
    """联邦查询半连接下推行数阈值，超过此值跳过半连接优化"""

    def __post_init__(self):
        if self.cors_origins is None:
            self.cors_origins = [
                "http://localhost:48000",   # 前端（docker 映射 / 手动 vite）
                "tauri://localhost",        # macOS webview 源
                "http://tauri.localhost",   # Windows webview 源
            ]

        # 设置默认 DuckDB 扩展（包含联邦查询扩展）
        if self.duckdb_extensions is None:
            self.duckdb_extensions = [
                "excel",
                "json",
                "parquet",
                "httpfs",
                "mysql",
                "postgres",
            ]

        if self.server_data_mounts is None:
            self.server_data_mounts = []

        if self.duckdb_remote_settings is None:
            self.duckdb_remote_settings = {}

        if self.engine_compat is None:
            self.engine_compat = {}
        for _key in (
            "sqlite_all_varchar",
            "mysql_incomplete_dates_as_nulls",
            "pg_array_as_varchar",
            "unsafe_enable_version_guessing",
        ):
            self.engine_compat.setdefault(_key, False)


class ConfigManager:
    """统一配置管理器"""

    def __init__(self, config_dir: str = None):
        self._write_lock = Lock()
        self._project_root = self._resolve_project_root()

        if config_dir:
            self.config_dir = Path(config_dir)
        else:
            # CONFIG_DIR env 优先,否则 per-user 目录(冻结/桌面安全)
            self.config_dir = get_config_dir()

        self.config_dir.mkdir(parents=True, exist_ok=True)

        # 配置文件路径 (优先检测 .json，如果没有则检测 .jsonc)
        json_path = self.config_dir / "app-config.json"
        jsonc_path = self.config_dir / "app-config.jsonc"
        
        if not json_path.exists() and jsonc_path.exists():
            self.app_config_file = jsonc_path
        else:
            self.app_config_file = json_path


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
            logger.info(f"Creating default application configuration file: {self.app_config_file}")
        else:
            # 更新现有配置文件，确保包含所有新字段
            self._update_existing_app_config()



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
                    logger.info(f"Adding new configuration field: {key} = {default_value}")

            # 保存更新后的配置
            self._save_json(self.app_config_file, updated_config)
            logger.info(f"Application configuration file updated: {self.app_config_file}")

        except Exception as e:
            logger.warning(f"Failed to update application configuration file: {str(e)}")

    def _load_json(self, file_path: Path) -> Dict[str, Any]:
        """加载 JSON 配置文件（支持注释）"""
        try:
            if file_path.exists():
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                    
                # 移除注释 (支持 // 和 /* */)
                import re
                
                # 移除块注释 /* ... */
                content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
                
                # 移除行注释 // ... (注意处理URL中的//，这里简单处理：//前必须有空白或行首，且不是URL的一部分)
                # 更稳健的方式是忽略字符串内容的解析，但作为简单的配置加载器，
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
                
                # 处理可能产生的尾部逗号问题（JSON 不支持，但配置变更是常事）
                # 为了保持简单，暂不处理尾部逗号，依赖标准json解析
                # 大多数情况下用户只需小心
                
                return json.loads(content)
            return {}
        except Exception as e:
            logger.error(f"Loading configuration filefailed {file_path}: {str(e)}")
            return {}

    def _save_json(self, file_path: Path, data: Any):
        """保存 JSON 配置文件"""
        self.atomic_write_json(file_path, data)

    def load_all_configs(self):
        """加载所有配置"""
        self.load_app_config()

    def _resolve_project_root(self) -> Path:
        """项目运行根目录 = 统一的可写根目录(单一事实源)。

        "APP_ROOT(显式 env)优先于 per-user" 的逻辑统一收敛到 get_user_data_dir(),
        避免两处各写一遍而漂移 —— Plan A 当年只改了一处、漏了另一处,正是容器启动崩溃的根因。
        """
        return get_user_data_dir()

    def _default_data_dir(self) -> Path:
        """默认数据目录"""
        return self._project_root / "data"

    def get_duckdb_paths(self, ensure_dirs: bool = True) -> DuckDBPaths:
        """获取 DuckDB 相关目录配置"""
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

        # 系统数据库路径（与 main.db 同目录）
        system_database_path = database_path.parent / "system.db"

        return DuckDBPaths(
            database_path=database_path,
            system_database_path=system_database_path,
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
        """原子写入 JSON 配置"""
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
                    "cors_origins": [
                        o
                        for o in os.getenv(
                            "CORS_ORIGINS",
                            ",".join(config_data.get("cors_origins", [])),
                        ).split(",")
                        if o
                    ]
                    or None,
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
                    "duckdb_memory_limit": os.getenv(
                        "DUCKDB_MEMORY_LIMIT",
                        config_data.get("duckdb_memory_limit", "8GB"),
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

            remote_env = os.getenv("DUCKDB_REMOTE_SETTINGS")
            if remote_env:
                try:
                    import json as _json

                    parsed_remote = _json.loads(remote_env)
                    if isinstance(parsed_remote, dict):
                        base_remote = config_data.get("duckdb_remote_settings") or {}
                        if isinstance(base_remote, dict):
                            config_data["duckdb_remote_settings"] = {
                                **base_remote,
                                **parsed_remote,
                            }
                        else:
                            config_data["duckdb_remote_settings"] = parsed_remote
                except ValueError as parse_err:
                    logger.warning(
                        "Invalid DUCKDB_REMOTE_SETTINGS JSON: %s", parse_err
                    )

            # 无条件把 query_tree 重映射为 no_output:它曾是旧出厂默认(把完整执行树刷进
            # stderr,桌面 4MB 日志),且无法按值区分"遗留"与"主动选择"。这是有意的功能取舍
            # (非一次性迁移)——要执行树诊断请用 query_tree_optimizer / json(不受此影响)。
            # 字段注释已如实说明,文档同步。
            if config_data.get("duckdb_enable_profiling") == "query_tree":
                config_data["duckdb_enable_profiling"] = "no_output"

            # duckdb_debug_logging 曾是死开关(无人消费),已移除字段;剥离旧
            # app-config.json 里的遗留键,否则 AppConfig(**config_data) 会因未知
            # 关键字参数报错(加载不过滤未知键)。
            config_data.pop("duckdb_debug_logging", None)

            self._app_config = AppConfig(**config_data)
            logger.info("Application configuration loaded successfully")
            return self._app_config

        except Exception as e:
            logger.error(f"Failed to load application configuration: {str(e)}")
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

            logger.info("Application configuration updated successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to update application configuration: {str(e)}")
            return False

    def get_safe_mysql_configs(self) -> List[Dict[str, Any]]:
        """获取安全的 MySQL 配置（遮蔽敏感信息）"""
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
