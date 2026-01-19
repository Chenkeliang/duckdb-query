"""
数据源聚合器服务

聚合不同类型的数据源（数据库连接、DuckDB 表）到统一的视图
"""
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any

from models.datasource_models import (
    DataSourceResponse,
    DataSourceType,
    DataSourceStatus,
    DataSourceFilter,
)
from models.query_models import ConnectionStatus
from core.database.database_manager import db_manager  # 使用全局实例
from core.database.duckdb_pool import get_connection_pool

logger = logging.getLogger(__name__)


class DataSourceAggregator:
    """聚合不同类型的数据源"""

    def __init__(self):
        self.db_manager = db_manager  # 使用全局实例而不是创建新实例
        self.duckdb_pool = get_connection_pool()

    async def list_all_datasources(
        self, filters: Optional[DataSourceFilter] = None
    ) -> List[DataSourceResponse]:
        """列出所有数据源"""
        datasources = []

        try:
            # 聚合数据库连接
            if not filters or not filters.type or filters.type == DataSourceType.DATABASE:
                db_sources = await self._get_database_sources(filters)
                datasources.extend(db_sources)

            # 聚合文件数据源（DuckDB 表）
            if not filters or not filters.type or filters.type == DataSourceType.FILE:
                file_sources = await self._get_file_sources(filters)
                datasources.extend(file_sources)

            # 应用搜索过滤
            if filters and filters.search:
                search_term = filters.search.lower()
                datasources = [
                    ds
                    for ds in datasources
                    if search_term in ds.name.lower()
                    or (ds.metadata and search_term in str(ds.metadata).lower())
                ]

            return datasources

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("获取数据源列表失败: %s", e)
            raise

    async def get_datasource(self, source_id: str) -> Optional[DataSourceResponse]:
        """获取单个数据源"""
        try:
            # 尝试从数据库连接中查找
            if source_id.startswith("db_"):
                return await self._get_database_source_by_id(source_id)

            # 尝试从文件数据源（DuckDB 表）中查找
            if source_id.startswith("file_") or source_id.startswith("table_"):
                return await self._get_file_source_by_id(source_id)

            # 如果没有前缀，尝试所有类型
            # 先尝试数据库
            db_source = await self._get_database_source_by_id(f"db_{source_id}")
            if db_source:
                return db_source

            # 再尝试文件
            file_source = await self._get_file_source_by_id(f"table_{source_id}")
            if file_source:
                return file_source

            return None

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("获取数据源 %s 失败: %s", source_id, e)
            raise

    async def delete_datasource(self, source_id: str) -> bool:
        """删除数据源"""
        try:
            # 根据 ID 前缀判断数据源类型并删除
            if source_id.startswith("db_"):
                return await self._delete_database_source(source_id)
            if source_id.startswith("file_") or source_id.startswith("table_"):
                return await self._delete_file_source(source_id)

            # 尝试删除数据库连接
            if await self._delete_database_source(f"db_{source_id}"):
                return True
            # 尝试删除文件数据源
            if await self._delete_file_source(f"table_{source_id}"):
                return True
            return False

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("删除数据源 %s 失败: %s", source_id, e)
            raise

    async def _get_database_sources(
        self, filters: Optional[DataSourceFilter] = None
    ) -> List[DataSourceResponse]:
        """获取数据库数据源"""
        sources = []

        try:
            # 确保连接已加载
            # pylint: disable=protected-access
            if not self.db_manager._config_loaded:
                self.db_manager._load_connections_from_config()
            # pylint: enable=protected-access

            for conn_id, connection in self.db_manager.connections.items():
                # 应用子类型过滤
                if (
                    filters
                    and filters.subtype
                    and connection.type.value != filters.subtype
                ):
                    continue

                # 应用状态过滤
                status = self._map_connection_status(connection.status)
                if filters and filters.status and status != filters.status:
                    continue

                # 脱敏连接信息
                sanitized_params = self._sanitize_connection_params(connection.params)

                source = DataSourceResponse(
                    id=f"db_{conn_id}",
                    name=connection.name,
                    type=DataSourceType.DATABASE,
                    subtype=connection.type.value,
                    status=status,
                    created_at=connection.created_at or datetime.now(),
                    updated_at=connection.updated_at,
                    connection_info=sanitized_params,
                    metadata={
                        "host": connection.params.get("host", "localhost"),
                        "port": connection.params.get("port"),
                        "database": connection.params.get("database"),
                        "schema": connection.params.get("schema"),
                    },
                )
                sources.append(source)

            return sources

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("获取数据库数据源失败: %s", e)
            return []

    async def _get_file_sources(
        self, filters: Optional[DataSourceFilter] = None
    ) -> List[DataSourceResponse]:
        """获取文件数据源（DuckDB 表）"""
        sources = []

        try:
            # 获取 DuckDB 连接
            with self.duckdb_pool.get_connection() as conn:
                # 查询所有表
                tables_query = """
                    SELECT
                        table_name,
                        estimated_size as size_bytes,
                        column_count
                    FROM duckdb_tables()
                    WHERE schema_name = 'main'
                """
                result = conn.execute(tables_query).fetchall()

                for row in result:
                    table_name = row[0]
                    size_bytes = row[1] if len(row) > 1 else None
                    column_count = row[2] if len(row) > 2 else None

                    # 获取行数
                    try:
                        count_result = conn.execute(
                            f"SELECT COUNT(*) FROM {table_name}"
                        ).fetchone()
                        row_count = count_result[0] if count_result else None
                    except Exception:  # pylint: disable=broad-exception-caught
                        row_count = None

                    # 应用状态过滤
                    status = DataSourceStatus.ACTIVE
                    if filters and filters.status and status != filters.status:
                        continue

                    source = DataSourceResponse(
                        id=f"table_{table_name}",
                        name=table_name,
                        type=DataSourceType.FILE,
                        subtype="duckdb_table",
                        status=status,
                        created_at=datetime.now(),  # DuckDB 表没有创建时间
                        metadata={
                            "table_name": table_name,
                            "schema": "main",
                        },
                        row_count=row_count,
                        column_count=column_count,
                        size_bytes=size_bytes,
                    )
                    sources.append(source)

            return sources

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("获取文件数据源失败: %s", e)
            return []

    async def _get_database_source_by_id(
        self, source_id: str
    ) -> Optional[DataSourceResponse]:
        """根据 ID 获取数据库数据源"""
        try:
            # 移除 db_ 前缀
            conn_id = source_id.replace("db_", "")

            # 确保连接已加载
            # pylint: disable=protected-access
            if not self.db_manager._config_loaded:
                self.db_manager._load_connections_from_config()
            # pylint: enable=protected-access

            connection = self.db_manager.connections.get(conn_id)
            if not connection:
                return None

            # 脱敏连接信息
            sanitized_params = self._sanitize_connection_params(connection.params)

            return DataSourceResponse(
                id=source_id,
                name=connection.name,
                type=DataSourceType.DATABASE,
                subtype=connection.type.value,
                status=self._map_connection_status(connection.status),
                created_at=connection.created_at or datetime.now(),
                updated_at=connection.updated_at,
                connection_info=sanitized_params,
                metadata={
                    "host": connection.params.get("host", "localhost"),
                    "port": connection.params.get("port"),
                    "database": connection.params.get("database"),
                    "schema": connection.params.get("schema"),
                },
            )

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("获取数据库数据源 %s 失败: %s", source_id, e)
            return None

    async def _get_file_source_by_id(self, source_id: str) -> Optional[DataSourceResponse]:
        """根据 ID 获取文件数据源（DuckDB 表）"""
        try:
            # 移除 table_ 或 file_ 前缀
            table_name = source_id.replace("table_", "").replace("file_", "")

            with self.duckdb_pool.get_connection() as conn:
                # 检查表是否存在
                check_query = f"""
                    SELECT
                        table_name,
                        estimated_size as size_bytes,
                        column_count
                    FROM duckdb_tables()
                    WHERE schema_name = 'main' AND table_name = '{table_name}'
                """
                result = conn.execute(check_query).fetchone()

                if not result:
                    return None

                size_bytes = result[1] if len(result) > 1 else None
                column_count = result[2] if len(result) > 2 else None

                # 获取行数
                try:
                    count_result = conn.execute(
                        f"SELECT COUNT(*) FROM {table_name}"
                    ).fetchone()
                    row_count = count_result[0] if count_result else None
                except Exception:  # pylint: disable=broad-exception-caught
                    row_count = None

                return DataSourceResponse(
                    id=source_id,
                    name=table_name,
                    type=DataSourceType.FILE,
                    subtype="duckdb_table",
                    status=DataSourceStatus.ACTIVE,
                    created_at=datetime.now(),
                    metadata={
                        "table_name": table_name,
                        "schema": "main",
                    },
                    row_count=row_count,
                    column_count=column_count,
                    size_bytes=size_bytes,
                )

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("获取文件数据源 %s 失败: %s", source_id, e)
            return None

    async def _delete_database_source(self, source_id: str) -> bool:
        """删除数据库数据源"""
        try:
            # 移除 db_ 前缀
            conn_id = source_id.replace("db_", "")

            # 使用 DatabaseManager 删除连接
            return self.db_manager.remove_connection(conn_id)

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("删除数据库数据源 %s 失败: %s", source_id, e)
            return False

    async def _delete_file_source(self, source_id: str) -> bool:
        """删除文件数据源（DuckDB 表）"""
        try:
            # 移除 table_ 或 file_ 前缀
            table_name = source_id.replace("table_", "").replace("file_", "")

            with self.duckdb_pool.get_connection() as conn:
                # 删除表
                conn.execute(f"DROP TABLE IF EXISTS {table_name}")
                logger.info("成功删除 DuckDB 表: %s", table_name)
                return True

        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("删除文件数据源 %s 失败: %s", source_id, e)
            return False

    def _sanitize_connection_params(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        脱敏连接参数

        对于密码字段，返回特殊标记 ***ENCRYPTED*** 而不是空字符串
        这样前端可以识别出已有密码，用户可以选择不修改
        """
        sanitized = params.copy()

        # 密码字段：如果存在密码，返回加密标记
        if "password" in sanitized and sanitized["password"]:
            sanitized["password"] = "***ENCRYPTED***"

        # 不脱敏用户名，前端需要显示完整用户名
        # 用户名不是敏感信息，可以明文显示

        return sanitized

    def _map_connection_status(self, status) -> DataSourceStatus:
        """映射连接状态到数据源状态"""
        if status == ConnectionStatus.ACTIVE:
            return DataSourceStatus.ACTIVE
        if status == ConnectionStatus.INACTIVE:
            return DataSourceStatus.INACTIVE
        if status == ConnectionStatus.ERROR:
            return DataSourceStatus.ERROR
        return DataSourceStatus.INACTIVE


# 全局实例
datasource_aggregator = DataSourceAggregator()
