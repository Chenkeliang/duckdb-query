# pylint: disable=duplicate-code,too-many-public-methods,bad-indentation
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
from utils.encryption_utils import encrypt_json, decrypt_json, json_needs_key_migration

logger = logging.getLogger(__name__)


class MetadataManager:
    """统一的元数据管理器 - 使用泛型接口简化管理"""

    def __init__(self, duckdb_path: str = None):
        self.duckdb_path = duckdb_path
        self._cache = {}
        self._cache_ttl = timedelta(minutes=5)
        self._init_metadata_tables()
        logger.info("Metadata manager initialization completed")

    def _init_metadata_tables(self):
        """初始化所有元数据表（如果不存在则自动创建）"""
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

            # 通用应用设置 KV(收拢原则:业务级设置一律进 system.db,新增设置用
            # get/save_app_setting,不要再各自开散装 JSON 文件——引导层除外:
            # app-config.json 决定 system.db 位置(先有鸡)、runtime.json 供壳与
            # MCP 免 DB 发现端口、secret.key 是解密 DB 内容的钥匙,三者必须留文件)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS system_app_settings (
                    key VARCHAR PRIMARY KEY,
                    value JSON,
                    updated_at TIMESTAMP
                )
            """)

            # 迁移：添加缺失的字段（如果表已存在但缺少该字段）
            try:
                # 检查 created_at 字段是否存在
                result = conn.execute("""
                    SELECT COUNT(*) 
                    FROM information_schema.columns 
                    WHERE table_name = 'system_file_datasources' 
                    AND column_name = 'created_at'
                """).fetchone()

                if result[0] == 0:
                    logger.info("Detected missing created_at / updated_at fields, starting migration of system_file_datasources table structure...")
                    # DuckDB 某些版本不支持在 ADD COLUMN 时同时声明 NOT NULL + DEFAULT
                    # 这里先以可空列的形式添加，再用 UPDATE 回填历史数据，避免语法限制
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
                        logger.warning(f"Warning occurred when setting created_at/updated_at default values (can be ignored): {alter_exc}")

                    logger.info("system_file_datasources field migration completed")
            except Exception as e:
                logger.warning(f"Warning occurred when adding fields (may already exist): {e}")

            # 迁移：添加 source_sql 字段（如果表已存在但缺少该字段）
            try:
                result = conn.execute("""
                    SELECT COUNT(*) 
                    FROM information_schema.columns 
                    WHERE table_name = 'system_file_datasources' 
                    AND column_name = 'source_sql'
                """).fetchone()

                if result[0] == 0:
                    logger.info("Detected missing source_sql field, starting migration...")
                    conn.execute("""
                        ALTER TABLE system_file_datasources 
                        ADD COLUMN source_sql TEXT
                    """)
                    logger.info("source_sql field migration completed")
            except Exception as e:
                logger.warning(f"Warning occurred when adding source_sql field (may already exist): {e}")

            logger.info("metadatatableinitializingcompleted")

    # 统一的 CRUD 接口
    def save_metadata(self, table: str, id: str, data: dict) -> bool:
        """
        保存元数据（数据库连接或文件数据源）

        对于数据库连接，智能处理密码字段：
        - 如果密码是 ***ENCRYPTED***，保持原密码不变
        - 如果密码是新值，加密并保存
        - 如果密码为空，清除密码
        """
        logger.debug(f"[METADATA_DEBUG] save_metadata starting: table={table}, id={id}")
        try:
            with with_system_connection() as conn:
                logger.debug(f"[METADATA_DEBUG] save_metadata gettingconnectionsuccessfully: table={table}, id={id}")
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
                                logger.debug(f"Keeping original password: {id}")
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
                    logger.warning(f"Unable to get table {table} column info: {e}")
                    valid_columns = None
                
                # 过滤数据，只保留表中存在的列
                if valid_columns:
                    filtered_data = {k: v for k, v in data.items() if k in valid_columns}
                    if len(filtered_data) < len(data):
                        removed_fields = set(data.keys()) - set(filtered_data.keys())
                        logger.debug(f"Filtered out non-existent fields: {removed_fields}")
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

                logger.debug(f"[METADATA_DEBUG] save_metadata executing INSERT: table={table}, id={id}")
                conn.execute(sql, values)
                logger.debug(f"[METADATA_DEBUG] save_metadata INSERT completed: table={table}, id={id}")

                # 清除缓存
                cache_key = f"{table}:{id}"
                self._cache.pop(cache_key, None)

                logger.info(f"[METADATA_DEBUG] save_metadata successfully: {table}/{id}")
                logger.info(f"savingmetadatasuccessfully: {table}/{id}")
                return True

        except Exception as e:
            logger.error(f"[METADATA_DEBUG] save_metadata failed: {table}/{id}, error: {e}")
            logger.error(f"savingmetadatafailed: {table}/{id}, error: {e}", exc_info=True)
            return False

    def _migrate_legacy_params_if_needed(
        self, conn, id_field: str, record_id: str, raw_params: str, decrypted_params: dict
    ) -> None:
        """把仍用历史默认密钥加密的 params 用本机密钥重新加密写回。

        逐条读取时顺带迁移，不做批量扫描/批量改写：出错只影响这一条，且
        不影响本次读取已经拿到的正确明文（失败仅记日志，不抛出）。
        """
        if not json_needs_key_migration(raw_params):
            return
        try:
            conn.execute(
                f'UPDATE system_database_connections SET params = ? WHERE {id_field} = ?',
                [encrypt_json(decrypted_params), record_id],
            )
            logger.info("Migrated connection %s params to new encryption key", record_id)
        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.warning("Failed to migrate params encryption for %s: %s", record_id, e)

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
                        raw_params = data["params"]
                        data["params"] = decrypt_json(raw_params)
                        self._migrate_legacy_params_if_needed(
                            conn, id_field, id, raw_params, data["params"]
                        )

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
            logger.error(f"gettingmetadatafailed: {table}/{id}, error: {e}")
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
                            raw_params = data["params"]
                            data["params"] = decrypt_json(raw_params)
                            self._migrate_legacy_params_if_needed(
                                conn, "id", data["id"], raw_params, data["params"]
                            )

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
            logger.error(f"Failed to list metadata: {table}, error: {e}")
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

                logger.info(f"updatingmetadatasuccessfully: {table}/{id}")
                return True

        except Exception as e:
            logger.error(f"updatingmetadatafailed: {table}/{id}, error: {e}")
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

                logger.info(f"deletingmetadatasuccessfully: {table}/{id}")
                return True

        except Exception as e:
            return False

    def import_legacy_sql_favorites(self) -> Dict[str, Any]:
        """
        从 JSON 文件导入旧的 SQL 收藏数据到 DuckDB 表。
        这是一个手动触发的迁移操作。
        """
        from dateutil import parser

        # 确定配置文件路径（CONFIG_DIR env 优先，否则 per-user 目录；冻结安全）
        from core.common.paths import get_config_dir

        config_dir = get_config_dir()

        favorites_file = config_dir / "sql-favorites.json"
        migrated_file = config_dir / "sql-favorites.json.migrated"

        if not favorites_file.exists():
            return {"success": False, "message": "未找到configurationfile", "path": str(favorites_file)}

        imported_count = 0
        skipped_count = 0
        
        try:
            with open(favorites_file, "r", encoding="utf-8") as f:
                favorites = json.load(f)

            if not isinstance(favorites, list):
                return {"success": False, "message": "JSON 格式error，应为columntable", "path": str(favorites_file)}

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
                            logger.warning(f"Skipping incomplete favorite item: {item.get('name', 'Unknown')}")
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
                        # 简单的做法是认为每次执行都是一次导入尝试
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
                logger.warning(f"File rename failed, but data imported: {e}")

            return {
                "success": True,
                "imported": imported_count,
                "path": str(favorites_file),
                "migrated_path": str(migrated_file)
            }

        except Exception as e:
            logger.error(f"Failed to import SQL favorites: {e}")
            return {"success": False, "message": str(e), "path": str(favorites_file)}


    def invalidate_cache(self, table: str = None, id: str = None):
        """清除缓存"""
        if table and id:
            cache_key = f"{table}:{id}"
            self._cache.pop(cache_key, None)
        else:
            self._cache.clear()
            logger.info("Cleared all metadata cache")

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

    def increment_sql_favorite_usage(self, fav_id: str) -> Optional[int]:
        """原子自增使用次数，返回自增后的值；收藏不存在返回 None。

        单条 UPDATE ... usage_count = usage_count + 1 ... RETURNING 完成，
        避免"先 get 再 +1 再 update"在并发下丢失自增（回归 #22）。只改
        usage_count，与旧的 update_sql_favorite({"usage_count": ...}) 语义
        一致（不触碰 updated_at——"使用"不算编辑）。
        """
        try:
            with with_system_connection() as conn:
                rows = conn.execute(
                    "UPDATE system_sql_favorites "
                    "SET usage_count = usage_count + 1 "
                    "WHERE id = ? "
                    "RETURNING usage_count",
                    [fav_id],
                ).fetchall()
            if not rows:
                return None
            # 失效该行缓存，避免后续 get 命中旧计数
            self._cache.pop(f"system_sql_favorites:{fav_id}", None)
            return int(rows[0][0])
        except Exception as e:
            logger.error("Failed to increment sql favorite usage %s: %s", fav_id, e)
            raise

    def delete_sql_favorite(self, fav_id: str) -> bool:
        """删除 SQL 收藏"""
        return self.delete_metadata("system_sql_favorites", fav_id)

    # ==================== 通用应用设置 KV ====================

    def get_app_setting(self, key: str) -> Optional[Dict[str, Any]]:
        """读一条通用设置;不存在返回 None(区别于"存在但为空 dict")。"""
        with with_system_connection() as conn:
            row = conn.execute(
                "SELECT value FROM system_app_settings WHERE key = ?", [key]
            ).fetchone()
        if not row or row[0] is None:
            return None
        value = row[0]
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                return None
        return value if isinstance(value, dict) else None

    def save_app_setting(self, key: str, value: Dict[str, Any]) -> None:
        """写/覆盖一条通用设置(value 序列化为 JSON)。"""
        with with_system_connection() as conn:
            conn.execute(
                """
                INSERT INTO system_app_settings (key, value, updated_at)
                VALUES (?, ?, now())
                ON CONFLICT (key) DO UPDATE
                SET value = excluded.value, updated_at = excluded.updated_at
                """,
                [key, json.dumps(value, ensure_ascii=False)],
            )


# 全局元数据管理器实例
metadata_manager = MetadataManager()
