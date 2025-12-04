"""
元数据管理器
负责管理数据库连接和文件数据源的元数据，统一存储在 DuckDB 中
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from functools import lru_cache

from core.duckdb_engine import with_duckdb_connection
from core.timezone_utils import get_current_time
from utils.encryption_utils import encrypt_json, decrypt_json

logger = logging.getLogger(__name__)


class MetadataManager:
    """统一的元数据管理器 - 使用泛型接口简化管理"""

    def __init__(self, duckdb_path: str = None):
        self.duckdb_path = duckdb_path
        self._cache = {}
        self._cache_ttl = timedelta(minutes=5)
        self._init_metadata_tables()
        logger.info("元数据管理器初始化完成")

    def _init_metadata_tables(self):
        """初始化所有元数据表（自动创建，如果不存在）"""
        with with_duckdb_connection() as conn:
            # 创建数据库连接元数据表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS system_database_connections (
                    id VARCHAR PRIMARY KEY,
                    name VARCHAR NOT NULL,
                    type VARCHAR NOT NULL,
                    params JSON NOT NULL,
                    status VARCHAR NOT NULL DEFAULT 'active',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_tested TIMESTAMP,
                    metadata JSON
                )
            """)

            # 创建文件数据源元数据表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS system_file_datasources (
                    source_id VARCHAR PRIMARY KEY,
                    filename VARCHAR NOT NULL,
                    file_path VARCHAR,
                    file_type VARCHAR NOT NULL,
                    row_count INTEGER,
                    column_count INTEGER,
                    columns JSON,
                    column_profiles JSON,
                    upload_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_accessed TIMESTAMP,
                    file_size BIGINT,
                    file_hash VARCHAR,
                    metadata JSON
                )
            """)

            # 创建迁移状态表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS system_migration_status (
                    migration_name VARCHAR PRIMARY KEY,
                    status VARCHAR NOT NULL,
                    started_at TIMESTAMP,
                    completed_at TIMESTAMP,
                    error_message TEXT,
                    records_migrated INTEGER DEFAULT 0,
                    metadata JSON
                )
            """)

            # 创建索引
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_db_conn_type ON system_database_connections(type)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_db_conn_status ON system_database_connections(status)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_file_ds_type ON system_file_datasources(file_type)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_file_ds_upload ON system_file_datasources(upload_time)"
            )

            # 迁移：添加缺失的字段（如果表已存在但缺少字段）
            try:
                # 检查 created_at 字段是否存在
                result = conn.execute("""
                    SELECT COUNT(*) 
                    FROM information_schema.columns 
                    WHERE table_name = 'system_file_datasources' 
                    AND column_name = 'created_at'
                """).fetchone()

                if result[0] == 0:
                    logger.info("检测到缺失的 created_at / updated_at 字段，开始迁移 system_file_datasources 表结构...")
                    # DuckDB 某些版本不支持在 ADD COLUMN 时同时声明 NOT NULL + DEFAULT
                    # 这里先以可空列形式添加，再用 UPDATE 回填历史数据，避免语法限制
                    conn.execute("""
                        ALTER TABLE system_file_datasources 
                        ADD COLUMN created_at TIMESTAMP
                    """)
                    conn.execute("""
                        ALTER TABLE system_file_datasources 
                        ADD COLUMN updated_at TIMESTAMP
                    """)
                    # 使用 upload_time 或当前时间回填，保证后续查询有合理的时间值
                    conn.execute("""
                        UPDATE system_file_datasources
                        SET created_at = COALESCE(upload_time, CURRENT_TIMESTAMP)
                        WHERE created_at IS NULL
                    """)
                    conn.execute("""
                        UPDATE system_file_datasources
                        SET updated_at = COALESCE(upload_time, CURRENT_TIMESTAMP)
                        WHERE updated_at IS NULL
                    """)

                    # 尝试为新列设置默认值（允许失败，避免不同 DuckDB 版本差异导致崩溃）
                    try:
                        conn.execute("""
                            ALTER TABLE system_file_datasources
                            ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP
                        """)
                        conn.execute("""
                            ALTER TABLE system_file_datasources
                            ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP
                        """)
                    except Exception as alter_exc:
                        logger.warning(f"设置 created_at/updated_at 默认值时出现警告（可忽略）: {alter_exc}")

                    logger.info("system_file_datasources 字段迁移完成")
            except Exception as e:
                logger.warning(f"添加字段时出现警告（可能已存在）: {e}")

            logger.info("元数据表初始化完成")

    # 统一的 CRUD 接口
    def save_metadata(self, table: str, id: str, data: dict) -> bool:
        """
        保存元数据（数据库连接或文件数据源）
        
        对于数据库连接，智能处理密码字段：
        - 如果密码是 ***ENCRYPTED***，保持原密码不变
        - 如果密码是新值，加密并保存
        - 如果密码为空，清除密码
        """
        try:
            with with_duckdb_connection() as conn:
                # 对于数据库连接，智能处理密码字段
                if table == "system_database_connections" and "params" in data:
                    data = data.copy()
                    params = data["params"].copy() if isinstance(data["params"], dict) else data["params"]
                    
                    # 检查密码字段是否是加密标记
                    if isinstance(params, dict) and params.get("password") == "***ENCRYPTED***":
                        # 密码是标记，需要保持原密码
                        # 获取原有连接的密码
                        existing = self.get_metadata(table, id)
                        if existing and "params" in existing:
                            existing_params = existing["params"]
                            if isinstance(existing_params, dict) and "password" in existing_params:
                                # 使用原密码
                                params["password"] = existing_params["password"]
                                logger.debug(f"保持原密码不变: {id}")
                            else:
                                # 原连接没有密码，清除标记
                                params.pop("password", None)
                        else:
                            # 新连接但密码是标记，清除标记
                            params.pop("password", None)
                    
                    # 加密敏感参数
                    data["params"] = encrypt_json(params)

                # 构建插入语句
                columns = list(data.keys())
                placeholders = ", ".join(["?" for _ in columns])
                column_names = ", ".join(columns)

                # 使用 INSERT OR REPLACE 实现 upsert
                sql = f"""
                    INSERT OR REPLACE INTO {table} ({column_names})
                    VALUES ({placeholders})
                """

                values = [
                    json.dumps(v) if isinstance(v, (dict, list)) else v
                    for v in data.values()
                ]

                conn.execute(sql, values)

                # 清除缓存
                cache_key = f"{table}:{id}"
                self._cache.pop(cache_key, None)

                logger.info(f"保存元数据成功: {table}/{id}")
                return True

        except Exception as e:
            logger.error(f"保存元数据失败: {table}/{id}, 错误: {e}", exc_info=True)
            return False

    def get_metadata(self, table: str, id: str) -> Optional[dict]:
        """获取元数据（带缓存）"""
        cache_key = f"{table}:{id}"

        # 检查缓存
        if cache_key in self._cache:
            cached_data, cached_time = self._cache[cache_key]
            if datetime.now() - cached_time < self._cache_ttl:
                return cached_data

        try:
            with with_duckdb_connection() as conn:
                # 根据表类型使用不同的主键字段
                if table == "system_database_connections":
                    id_field = "id"
                elif table == "system_file_datasources":
                    id_field = "source_id"
                elif table == "system_migration_status":
                    id_field = "migration_name"
                else:
                    id_field = "id"
                
                result = conn.execute(
                    f"SELECT * FROM {table} WHERE {id_field} = ?", [id]
                ).fetchone()

                if not result:
                    return None

                # 转换为字典
                columns = [desc[0] for desc in conn.description]
                data = dict(zip(columns, result))

                # 对于数据库连接，先解密 params 字段再解析其他 JSON
                if table == "system_database_connections" and "params" in data:
                    if isinstance(data["params"], str):
                        # params 是加密的 JSON 字符串，需要解密
                        data["params"] = decrypt_json(data["params"])
                
                # 解析其他 JSON 字段
                for key, value in data.items():
                    if key == "params" and table == "system_database_connections":
                        # params 已经处理过了，跳过
                        continue
                    if isinstance(value, str) and value.startswith(("{", "[")):
                        try:
                            data[key] = json.loads(value)
                        except:
                            pass

                # 更新缓存
                self._cache[cache_key] = (data, datetime.now())

                return data

        except Exception as e:
            logger.error(f"获取元数据失败: {table}/{id}, 错误: {e}")
            return None

    def list_metadata(self, table: str, filters: dict = None) -> List[dict]:
        """列出元数据"""
        try:
            with with_duckdb_connection() as conn:
                sql = f"SELECT * FROM {table}"
                params = []

                # 添加过滤条件
                if filters:
                    conditions = []
                    for key, value in filters.items():
                        conditions.append(f"{key} = ?")
                        params.append(value)

                    if conditions:
                        sql += " WHERE " + " AND ".join(conditions)

                results = conn.execute(sql, params).fetchall()

                # 转换为字典列表
                columns = [desc[0] for desc in conn.description]
                data_list = []

                for row in results:
                    data = dict(zip(columns, row))

                    # 对于数据库连接，先解密 params 字段
                    if table == "system_database_connections" and "params" in data:
                        if isinstance(data["params"], str):
                            # params 是加密的 JSON 字符串，需要解密
                            data["params"] = decrypt_json(data["params"])
                    
                    # 解析其他 JSON 字段
                    for key, value in data.items():
                        if key == "params" and table == "system_database_connections":
                            # params 已经处理过了，跳过
                            continue
                        if isinstance(value, str) and value.startswith(("{", "[")):
                            try:
                                data[key] = json.loads(value)
                            except:
                                pass

                    data_list.append(data)

                return data_list

        except Exception as e:
            logger.error(f"列出元数据失败: {table}, 错误: {e}")
            return []

    def update_metadata(self, table: str, id: str, updates: dict) -> bool:
        """更新元数据"""
        try:
            with with_duckdb_connection() as conn:
                # 根据表类型使用不同的主键字段
                if table == "system_database_connections":
                    id_field = "id"
                elif table == "system_file_datasources":
                    id_field = "source_id"
                elif table == "system_migration_status":
                    id_field = "migration_name"
                else:
                    id_field = "id"
                
                # 构建更新语句
                set_clauses = []
                values = []

                for key, value in updates.items():
                    set_clauses.append(f"{key} = ?")
                    if isinstance(value, (dict, list)):
                        values.append(json.dumps(value))
                    else:
                        values.append(value)

                values.append(id)

                sql = f"""
                    UPDATE {table}
                    SET {", ".join(set_clauses)}
                    WHERE {id_field} = ?
                """

                conn.execute(sql, values)

                # 清除缓存
                cache_key = f"{table}:{id}"
                self._cache.pop(cache_key, None)

                logger.info(f"更新元数据成功: {table}/{id}")
                return True

        except Exception as e:
            logger.error(f"更新元数据失败: {table}/{id}, 错误: {e}")
            return False

    def delete_metadata(self, table: str, id: str) -> bool:
        """删除元数据"""
        try:
            with with_duckdb_connection() as conn:
                # 根据表类型使用不同的主键字段
                if table == "system_database_connections":
                    id_field = "id"
                elif table == "system_file_datasources":
                    id_field = "source_id"
                elif table == "system_migration_status":
                    id_field = "migration_name"
                else:
                    id_field = "id"
                
                conn.execute(
                    f"DELETE FROM {table} WHERE {id_field} = ?", [id]
                )

                # 清除缓存
                cache_key = f"{table}:{id}"
                self._cache.pop(cache_key, None)

                logger.info(f"删除元数据成功: {table}/{id}")
                return True

        except Exception as e:
            logger.error(f"删除元数据失败: {table}/{id}, 错误: {e}")
            return False

    def invalidate_cache(self, table: str = None, id: str = None):
        """清除缓存"""
        if table and id:
            cache_key = f"{table}:{id}"
            self._cache.pop(cache_key, None)
        else:
            self._cache.clear()
            logger.info("清除所有元数据缓存")

    # 便捷方法（内部调用统一接口）
    def save_database_connection(self, connection: dict) -> bool:
        """保存数据库连接"""
        return self.save_metadata("system_database_connections", connection["id"], connection)

    def get_database_connection(self, conn_id: str) -> Optional[dict]:
        """获取数据库连接"""
        return self.get_metadata("system_database_connections", conn_id)

    def list_database_connections(self, filters: dict = None) -> List[dict]:
        """列出数据库连接"""
        return self.list_metadata("system_database_connections", filters)

    def update_database_connection(self, conn_id: str, updates: dict) -> bool:
        """更新数据库连接"""
        return self.update_metadata("system_database_connections", conn_id, updates)

    def delete_database_connection(self, conn_id: str) -> bool:
        """删除数据库连接"""
        return self.delete_metadata("system_database_connections", conn_id)

    def save_file_datasource(self, datasource: dict) -> bool:
        """保存文件数据源元数据"""
        return self.save_metadata("system_file_datasources", datasource["source_id"], datasource)

    def get_file_datasource(self, source_id: str) -> Optional[dict]:
        """获取文件数据源元数据"""
        return self.get_metadata("system_file_datasources", source_id)

    def list_file_datasources(self, filters: dict = None) -> List[dict]:
        """列出文件数据源"""
        return self.list_metadata("system_file_datasources", filters)

    def update_file_datasource(self, source_id: str, updates: dict) -> bool:
        """更新文件数据源元数据"""
        return self.update_metadata("system_file_datasources", source_id, updates)

    def delete_file_datasource(self, source_id: str) -> bool:
        """删除文件数据源元数据"""
        return self.delete_metadata("system_file_datasources", source_id)


# 全局元数据管理器实例
metadata_manager = MetadataManager()
