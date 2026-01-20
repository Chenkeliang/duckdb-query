# pylint: disable=duplicate-code
"""
元数据管理器
负责管理数据库连接和文件数据源的元数据，统一存储在 DuckDB 中
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from functools import lru_cache

from core.database.duckdb_pool import with_system_connection
from core.common.timezone_utils import get_current_time
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
        with with_system_connection() as conn:
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
                    source_sql TEXT,
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

            # 创建系统 SQL 收藏表
            conn.execute("""
                CREATE TABLE IF NOT EXISTS system_sql_favorites (
                    id VARCHAR PRIMARY KEY,
                    name VARCHAR NOT NULL,
                    type VARCHAR NOT NULL,
                    sql TEXT NOT NULL,
                    description TEXT,
                    tags JSON,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    usage_count INTEGER DEFAULT 0,
                    metadata JSON
                )
            """)

            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_fav_type ON system_sql_favorites(type)"
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

            # 迁移：添加 source_sql 字段（如果表已存在但缺少该字段）
            try:
                result = conn.execute("""
                    SELECT COUNT(*) 
                    FROM information_schema.columns 
                    WHERE table_name = 'system_file_datasources' 
                    AND column_name = 'source_sql'
                """).fetchone()

                if result[0] == 0:
                    logger.info("检测到缺失的 source_sql 字段，开始迁移...")
                    conn.execute("""
                        ALTER TABLE system_file_datasources 
                        ADD COLUMN source_sql TEXT
                    """)
                    logger.info("source_sql 字段迁移完成")
            except Exception as e:
                logger.warning(f"添加 source_sql 字段时出现警告（可能已存在）: {e}")

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
        logger.debug(f"[METADATA_DEBUG] save_metadata 开始: table={table}, id={id}")
        try:
            with with_system_connection() as conn:
                logger.debug(f"[METADATA_DEBUG] save_metadata 获取连接成功: table={table}, id={id}")
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

                # 获取表的实际列名，过滤掉不存在的字段
                try:
                    table_columns_df = conn.execute(f"DESCRIBE {table}").fetchdf()
                    valid_columns = set(table_columns_df["column_name"].tolist())
                except Exception as e:
                    logger.warning(f"无法获取表 {table} 的列信息: {e}")
                    valid_columns = None
                
                # 过滤数据，只保留表中存在的列
                if valid_columns:
                    filtered_data = {k: v for k, v in data.items() if k in valid_columns}
                    if len(filtered_data) < len(data):
                        removed_fields = set(data.keys()) - set(filtered_data.keys())
                        logger.debug(f"过滤掉不存在的字段: {removed_fields}")
                    data = filtered_data

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

                logger.debug(f"[METADATA_DEBUG] save_metadata 执行 INSERT: table={table}, id={id}")
                conn.execute(sql, values)
                logger.debug(f"[METADATA_DEBUG] save_metadata INSERT 完成: table={table}, id={id}")

                # 清除缓存
                cache_key = f"{table}:{id}"
                self._cache.pop(cache_key, None)

                logger.info(f"[METADATA_DEBUG] save_metadata 成功: {table}/{id}")
                logger.info(f"保存元数据成功: {table}/{id}")
                return True

        except Exception as e:
            logger.error(f"[METADATA_DEBUG] save_metadata 失败: {table}/{id}, 错误: {e}")
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
            with with_system_connection() as conn:
                # 根据表类型使用不同的主键字段
                if table == "system_database_connections":
                    id_field = "id"
                elif table == "system_file_datasources":
                    id_field = "source_id"
                elif table == "system_migration_status":
                    id_field = "migration_name"
                elif table == "system_sql_favorites":
                    id_field = "id"
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
            with with_system_connection() as conn:
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
            with with_system_connection() as conn:
                # 根据表类型使用不同的主键字段
                if table == "system_database_connections":
                    id_field = "id"
                elif table == "system_file_datasources":
                    id_field = "source_id"
                elif table == "system_migration_status":
                    id_field = "migration_name"
                elif table == "system_sql_favorites":
                    id_field = "id"
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
            with with_system_connection() as conn:
                # 根据表类型使用不同的主键字段
                if table == "system_database_connections":
                    id_field = "id"
                elif table == "system_file_datasources":
                    id_field = "source_id"
                elif table == "system_migration_status":
                    id_field = "migration_name"
                elif table == "system_sql_favorites":
                    id_field = "id"
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
            return False

    def import_legacy_sql_favorites(self) -> Dict[str, Any]:
        """
        从 JSON 文件导入旧的 SQL 收藏数据到 DuckDB 表。
        这是一个手动触发的迁移操作。
        """
        import os
        from pathlib import Path
        from dateutil import parser

        # 确定配置文件路径
        if os.getenv("CONFIG_DIR"):
            config_dir = Path(os.getenv("CONFIG_DIR"))
        else:
            config_dir = Path(__file__).parent.parent.parent / "config"
        
        favorites_file = config_dir / "sql-favorites.json"
        migrated_file = config_dir / "sql-favorites.json.migrated"

        if not favorites_file.exists():
            return {"success": False, "message": "未找到配置文件", "path": str(favorites_file)}

        imported_count = 0
        skipped_count = 0
        
        try:
            with open(favorites_file, "r", encoding="utf-8") as f:
                favorites = json.load(f)

            if not isinstance(favorites, list):
                return {"success": False, "message": "JSON 格式错误，应为列表", "path": str(favorites_file)}

            with with_system_connection() as conn:
                conn.execute("BEGIN TRANSACTION")
                try:
                    for item in favorites:
                        # 解析时间
                        created_at = None
                        updated_at = None
                        try:
                            if item.get("created_at"):
                                created_at = parser.parse(item["created_at"])
                            if item.get("updated_at"):
                                updated_at = parser.parse(item["updated_at"])
                        except Exception:
                            # 忽略解析错误，使用默认值（由数据库决定，或者是 None）
                            pass

                        # 准备数据，注意处理 JSON 类型的 tags
                        item_data = {
                            "id": item.get("id"),
                            "name": item.get("name"),
                            "type": item.get("type", "duckdb"), # 默认类型
                            "sql": item.get("sql"),
                            "description": item.get("description"),
                            "tags": json.dumps(item.get("tags", [])),
                            "created_at": created_at,
                            "updated_at": updated_at,
                            "usage_count": item.get("usage_count", 0)
                        }
                        
                        # 确保必需字段存在
                        if not item_data["id"] or not item_data["name"] or not item_data["sql"]:
                            logger.warning(f"跳过不完整的收藏项: {item.get('name', 'Unknown')}")
                            skipped_count += 1
                            continue

                        # 执行插入 (INSERT OR IGNORE)
                        # DuckDB 的 INSERT OR IGNORE 语法
                        columns = list(item_data.keys())
                        placeholders = ", ".join(["?" for _ in columns])
                        column_names = ", ".join(columns)
                        values = list(item_data.values())

                        conn.execute(
                            f"INSERT OR IGNORE INTO system_sql_favorites ({column_names}) VALUES ({placeholders})",
                            values
                        )
                        
                        # 检查是否插入成功（如果 ID 已存在则不会插入）
                        # 简单的做法是认为每次执行都是 attempted import
                        imported_count += 1
                    
                    conn.execute("COMMIT")
                except Exception as e:
                    conn.execute("ROLLBACK")
                    raise e
            
            # 迁移成功，重命名文件
            try:
                if migrated_file.exists():
                    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
                    backup_path = f"{migrated_file}.{timestamp}"
                    migrated_file.rename(backup_path)
                    logger.info(f"Existing migrated file backup to {backup_path}")

                favorites_file.rename(migrated_file)
            except Exception as e:
                logger.warning(f"文件重命名失败，但数据已导入: {e}")

            return {
                "success": True,
                "imported": imported_count,
                "path": str(favorites_file),
                "migrated_path": str(migrated_file)
            }

        except Exception as e:
            logger.error(f"导入 SQL 收藏失败: {e}")
            return {"success": False, "message": str(e), "path": str(favorites_file)}


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

    def save_sql_favorite(self, favorite: dict) -> bool:
        """保存 SQL 收藏"""
        # 确保 tags 是 JSON 列表
        if "tags" in favorite and not isinstance(favorite["tags"], str):
             # 只有当它是列表/对象时才序列化，如果已经是字符串则不处理
             # 但为了统一，这里最好确保它是 JSON 字符串或者 metadata manager 能处理
             # update/save_metadata 底层会处理 list/dict -> json.dumps
             pass
        return self.save_metadata("system_sql_favorites", favorite["id"], favorite)

    def get_sql_favorite(self, fav_id: str) -> Optional[dict]:
        """获取 SQL 收藏"""
        return self.get_metadata("system_sql_favorites", fav_id)

    def list_sql_favorites(self, filters: dict = None) -> List[dict]:
        """列出 SQL 收藏"""
        return self.list_metadata("system_sql_favorites", filters)

    def update_sql_favorite(self, fav_id: str, updates: dict) -> bool:
        """更新 SQL 收藏"""
        return self.update_metadata("system_sql_favorites", fav_id, updates)

    def delete_sql_favorite(self, fav_id: str) -> bool:
        """删除 SQL 收藏"""
        return self.delete_metadata("system_sql_favorites", fav_id)


# 全局元数据管理器实例
metadata_manager = MetadataManager()
