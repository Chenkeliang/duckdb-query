"""
文件数据源管理器
负责管理文件数据源的配置、加载和持久化
"""

import json
import os
import logging
import re
import pandas as pd
import hashlib
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Dict, Any, List, Optional, Sequence, Tuple
from uuid import uuid4
from datetime import datetime

import duckdb

from core.duckdb_engine import get_db_connection
from core.config_manager import config_manager

logger = logging.getLogger(__name__)


@dataclass
class ColumnProfile:
    """列级元数据快照"""

    name: str
    duckdb_type: str
    nullable: bool
    sample_values: List[str]
    null_count: Optional[int] = None
    distinct_count: Optional[int] = None
    min_value: Optional[Any] = None
    max_value: Optional[Any] = None
    precision: Optional[int] = None
    scale: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        min_value = _format_value(self.min_value)
        max_value = _format_value(self.max_value)

        return {
            "name": self.name,
            "duckdb_type": self.duckdb_type,
            "nullable": self.nullable,
            "precision": self.precision,
            "scale": self.scale,
            "sample_values": [str(val) for val in self.sample_values],
            "statistics": {
                "null_count": self.null_count,
                "distinct_count": self.distinct_count,
                "min": min_value,
                "max": max_value,
            },
        }


def _quote_identifier(identifier: str) -> str:
    escaped = identifier.replace('"', '""')
    return f'"{escaped}"'


def _parse_decimal_precision_scale(type_str: str) -> Tuple[Optional[int], Optional[int]]:
    if not type_str:
        return None, None

    match = re.match(r".*?(?:DECIMAL|NUMERIC)\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)", type_str, re.IGNORECASE)
    if match:
        try:
            return int(match.group(1)), int(match.group(2))
        except ValueError:
            return None, None
    return None, None


def _format_value(value: Any) -> Optional[Any]:
    if value is None:
        return None

    if isinstance(value, Decimal):
        return format(value, "f")

    if isinstance(value, pd.Timestamp):
        return value.isoformat()

    if isinstance(value, datetime):
        return value.isoformat()

    # pandas / numpy scalar 转换
    if hasattr(value, "item"):
        try:
            value = value.item()
        except Exception:
            value = str(value)

    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    if isinstance(value, bytes):
        try:
            return value.decode("utf-8")
        except Exception:
            return value.decode("latin-1", errors="ignore")

    if isinstance(value, (str, int, float, bool)):
        return value

    return str(value)


def _configure_duckdb_for_ingestion(con: duckdb.DuckDBPyConnection):
    settings = [
        "SET decimal_infer_max_length=38",
        "SET decimal_infer_max_scale=18",
    ]
    for stmt in settings:
        try:
            con.execute(stmt)
        except Exception as exc:
            logger.debug("配置DuckDB推断参数失败 (%s): %s", stmt, exc)


def _create_table_atomically(
    con: duckdb.DuckDBPyConnection, table_name: str, select_sql: str, params: Optional[Sequence[Any]] = None
):
    tmp_table = f"__tmp_{table_name}_{uuid4().hex[:8]}"
    quoted_tmp = _quote_identifier(tmp_table)
    quoted_target = _quote_identifier(table_name)

    con.execute("BEGIN TRANSACTION")
    try:
        con.execute(
            f"CREATE TABLE {quoted_tmp} AS {select_sql}",
            params or [],
        )
        con.execute(f"DROP TABLE IF EXISTS {quoted_target}")
        con.execute(f"ALTER TABLE {quoted_tmp} RENAME TO {quoted_target}")
        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK")
        raise
    finally:
        try:
            con.execute(f"DROP TABLE IF EXISTS {quoted_tmp}")
        except Exception:
            pass


def _collect_column_profiles(
    con: duckdb.DuckDBPyConnection, table_name: str, sample_limit: int = 6
) -> List[ColumnProfile]:
    schema_info = con.execute(f"PRAGMA table_info({_quote_identifier(table_name)})").fetchall()
    profiles: List[ColumnProfile] = []
    quoted_table = _quote_identifier(table_name)

    for column in schema_info:
        col_name = column[1]
        duckdb_type = column[2]
        nullable = not bool(column[3])
        quoted_col = _quote_identifier(col_name)

        precision, scale = _parse_decimal_precision_scale(duckdb_type)

        stats_sql = (
            f"SELECT "
            f"COUNT(*) AS total_count, "
            f"COUNT({quoted_col}) AS non_null_count, "
            f"COUNT(*) - COUNT({quoted_col}) AS null_count, "
            f"COUNT(DISTINCT {quoted_col}) AS distinct_count, "
            f"MIN({quoted_col}) AS min_value, "
            f"MAX({quoted_col}) AS max_value "
            f"FROM {quoted_table}"
        )

        stats_row = con.execute(stats_sql).fetchone()
        null_count = int(stats_row[2]) if stats_row and stats_row[2] is not None else None
        distinct_count = int(stats_row[3]) if stats_row and stats_row[3] is not None else None
        min_value = stats_row[4] if stats_row else None
        max_value = stats_row[5] if stats_row else None

        sample_sql = (
            f"SELECT DISTINCT {quoted_col} FROM {quoted_table} "
            f"WHERE {quoted_col} IS NOT NULL LIMIT {sample_limit}"
        )
        sample_rows = con.execute(sample_sql).fetchall()
        sample_values: List[str] = []
        for row in sample_rows:
            formatted = _format_value(row[0])
            if formatted is not None:
                sample_values.append(str(formatted))

        profiles.append(
            ColumnProfile(
                name=col_name,
                duckdb_type=duckdb_type,
                nullable=nullable,
                precision=precision,
                scale=scale,
                sample_values=sample_values,
                null_count=null_count,
                distinct_count=distinct_count,
                min_value=min_value,
                max_value=max_value,
            )
        )

    return profiles


def build_table_metadata_snapshot(
    con: duckdb.DuckDBPyConnection, table_name: str
) -> Dict[str, Any]:
    quoted_table = _quote_identifier(table_name)
    row_count = con.execute(f"SELECT COUNT(*) FROM {quoted_table}").fetchone()[0]
    profiles = _collect_column_profiles(con, table_name)

    return {
        "row_count": int(row_count),
        "column_count": len(profiles),
        "columns": [profile.name for profile in profiles],
        "column_profiles": [profile.to_dict() for profile in profiles],
        "schema_version": 2,
    }


class FileDatasourceManager:
    """文件数据源管理器类"""

    def __init__(self):
        """初始化文件数据源管理器"""
        self.config_dir = config_manager.config_dir
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.config_file = self.config_dir / "file-datasources.json"

        self.data_dir = (
            Path(__file__).resolve().parent.parent / "data" / "file_sources"
        )
        self.data_dir.mkdir(parents=True, exist_ok=True)

        # 确保配置文件存在
        if not self.config_file.exists():
            with self.config_file.open("w", encoding="utf-8") as f:
                json.dump([], f, ensure_ascii=False, indent=2)

    def _get_file_hash(self, file_path: str) -> str:
        """计算文件的MD5哈希值"""
        hash_md5 = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()

    def save_file_datasource(self, file_info: Dict[str, Any]):
        """保存文件数据源配置"""
        try:
            # 读取现有配置
            configs = []
            if self.config_file.exists():
                with self.config_file.open("r", encoding="utf-8") as f:
                    configs = json.load(f)

            # 查找是否已存在相同source_id的配置
            existing_index = None
            for i, config in enumerate(configs):
                if config.get("source_id") == file_info["source_id"]:
                    existing_index = i
                    break

            # 更新或添加配置
            if existing_index is not None:
                configs[existing_index] = file_info
            else:
                configs.append(file_info)

            # 保存配置
            with self.config_file.open("w", encoding="utf-8") as f:
                json.dump(configs, f, ensure_ascii=False, indent=2, default=str)

            logger.info(f"文件数据源配置已保存: {file_info['source_id']}")
            return True

        except Exception as e:
            logger.error(f"保存文件数据源配置失败: {str(e)}")
            raise

    def get_file_datasource(self, source_id: str) -> Optional[Dict[str, Any]]:
        """获取文件数据源配置"""
        try:
            if not self.config_file.exists():
                return None

            with self.config_file.open("r", encoding="utf-8") as f:
                configs = json.load(f)

            for config in configs:
                if config.get("source_id") == source_id:
                    return config

            return None
        except Exception as e:
            logger.error(f"获取文件数据源配置失败: {str(e)}")
            return None

    def list_file_datasources(self) -> List[Dict[str, Any]]:
        """列出所有文件数据源"""
        try:
            if not self.config_file.exists():
                return []

            with self.config_file.open("r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"列出文件数据源失败: {str(e)}")
            return []

    def delete_file_datasource(self, source_id: str) -> bool:
        """删除文件数据源"""
        try:
            if not self.config_file.exists():
                return False

            with self.config_file.open("r", encoding="utf-8") as f:
                configs = json.load(f)

            # 查找并删除配置
            new_configs = [
                config for config in configs if config.get("source_id") != source_id
            ]

            # 如果配置有变化，则保存
            if len(new_configs) != len(configs):
                with self.config_file.open("w", encoding="utf-8") as f:
                    json.dump(new_configs, f, ensure_ascii=False, indent=2, default=str)

                logger.info(f"文件数据源配置已删除: {source_id}")
                return True

            return False
        except Exception as e:
            logger.error(f"删除文件数据源配置失败: {str(e)}")
            return False

    def reload_all_file_datasources(self):
        """重新加载所有文件数据源到DuckDB"""
        try:
            logger.info("开始重新加载所有文件数据源到DuckDB...")

            # 获取DuckDB连接
            duckdb_con = get_db_connection()

            # 获取所有文件数据源配置
            configs = self.list_file_datasources()
            success_count = 0

            for config in configs:
                source_id = config["source_id"]
                file_path = config["file_path"]
                file_type = config["file_type"]

                # 检查文件是否存在
                if not os.path.exists(file_path):
                    logger.warning(f"文件不存在，跳过: {file_path}")
                    continue

                try:
                    # 重新加载文件到DuckDB
                    table_metadata = create_table_from_file_path_typed(
                        duckdb_con, source_id, file_path, file_type
                    )

                    if table_metadata:
                        config["row_count"] = table_metadata.get("row_count")
                        config["column_count"] = table_metadata.get("column_count")
                        config["columns"] = table_metadata.get("columns", [])
                        if table_metadata.get("column_profiles") is not None:
                            config["column_profiles"] = table_metadata["column_profiles"]
                        config["schema_version"] = table_metadata.get(
                            "schema_version", config.get("schema_version", 2)
                        )

                        try:
                            self.save_file_datasource(config)
                        except Exception as save_exc:
                            logger.warning(
                                "更新文件元数据失败 %s: %s", source_id, save_exc
                            )

                    logger.info(
                        "成功重新加载文件数据源: %s (行: %s)",
                        source_id,
                        table_metadata.get("row_count") if table_metadata else "未知",
                    )
                    success_count += 1
                except Exception as e:
                    logger.error(f"重新加载文件数据源失败 {source_id}: {str(e)}")

            logger.info(f"文件数据源重新加载完成，成功: {success_count}/{len(configs)}")
            return success_count

        except Exception as e:
            logger.error(f"重新加载文件数据源失败: {str(e)}")


def create_typed_table_from_dataframe(
    duckdb_con: duckdb.DuckDBPyConnection, table_name: str, df: pd.DataFrame
) -> Dict[str, Any]:
    """
    使用 DuckDB 原生能力将 DataFrame 落库且保留列类型。
    """
    if df is None or df.empty:
        raise ValueError("DataFrame 为空，无法创建表")

    _configure_duckdb_for_ingestion(duckdb_con)

    temp_view = f"temp_df_{uuid4().hex[:8]}"
    quoted_temp = _quote_identifier(temp_view)

    try:
        duckdb_con.register(temp_view, df)
        select_sql = f"SELECT * FROM {quoted_temp}"
        _create_table_atomically(duckdb_con, table_name, select_sql)
    finally:
        try:
            duckdb_con.unregister(temp_view)
        except Exception:
            pass

    metadata = build_table_metadata_snapshot(duckdb_con, table_name)
    logger.info(
        "成功创建Typed表: %s (行: %s, 列: %s)",
        table_name,
        metadata["row_count"],
        metadata["column_count"],
    )
    return metadata


def create_table_from_file_path_typed(
    duckdb_con: duckdb.DuckDBPyConnection,
    table_name: str,
    file_path: str,
    file_type: str,
) -> Dict[str, Any]:
    """
    从文件路径创建带类型的 DuckDB 持久化表。
    """
    _configure_duckdb_for_ingestion(duckdb_con)
    normalized_type = (file_type or "").lower()

    try:
        if normalized_type in {"csv"}:
            try:
                duckdb_con.execute("INSTALL encodings")
                duckdb_con.execute("LOAD encodings")
            except Exception:
                logger.debug("encodings 扩展不可用，继续使用默认编码处理")

            strict_sql = (
                "SELECT * FROM read_csv_auto(?, AUTO_DETECT=1, SAMPLE_SIZE=-1, "
                "IGNORE_ERRORS=TRUE)"
            )
            try:
                _create_table_atomically(
                    duckdb_con, table_name, strict_sql, [file_path]
                )
            except Exception as exc:
                logger.warning(
                    "严格小数推断失败，回退普通CSV读取: %s", getattr(exc, "message", exc)
                )
                fallback_sql = (
                    "SELECT * FROM read_csv_auto(?, AUTO_DETECT=1, SAMPLE_SIZE=-1, "
                    "IGNORE_ERRORS=TRUE)"
                )
                _create_table_atomically(
                    duckdb_con, table_name, fallback_sql, [file_path]
                )
        elif normalized_type in {"xlsx", "xls", "excel"}:
            try:
                duckdb_con.execute("INSTALL excel")
                duckdb_con.execute("LOAD excel")
                select_sql = "SELECT * FROM EXCEL_SCAN(?)"
                _create_table_atomically(
                    duckdb_con, table_name, select_sql, [file_path]
                )
            except Exception as excel_exc:
                logger.warning("DuckDB Excel 扩展失败，回退至 pandas: %s", excel_exc)
                df = pd.read_excel(file_path)
                return create_typed_table_from_dataframe(duckdb_con, table_name, df)
        elif normalized_type in {"json"}:
            select_sql = "SELECT * FROM read_json_auto(?)"
            _create_table_atomically(
                duckdb_con, table_name, select_sql, [file_path]
            )
        elif normalized_type in {"jsonl"}:
            try:
                select_sql = (
                    "SELECT * FROM read_json_auto(?, format='newline_delimited')"
                )
                _create_table_atomically(
                    duckdb_con, table_name, select_sql, [file_path]
                )
            except Exception as jsonl_exc:
                logger.warning("DuckDB JSONL 读取失败，回退至 pandas: %s", jsonl_exc)
                df = pd.read_json(file_path, lines=True)
                return create_typed_table_from_dataframe(duckdb_con, table_name, df)
        elif normalized_type in {"parquet", "pq"}:
            select_sql = "SELECT * FROM read_parquet(?)"
            _create_table_atomically(
                duckdb_con, table_name, select_sql, [file_path]
            )
        else:
            raise ValueError(f"不支持的文件类型: {file_type}")
    except Exception as exc:
        logger.error("从文件创建表失败 %s: %s", table_name, exc)
        raise

    metadata = build_table_metadata_snapshot(duckdb_con, table_name)
    logger.info(
        "成功创建Typed文件表: %s (行: %s, 列: %s)",
        table_name,
        metadata["row_count"],
        metadata["column_count"],
    )
    return metadata


def create_table_from_dataframe(
    duckdb_con, table_name: str, file_path_or_df, file_type: Optional[str] = None
) -> Dict[str, Any]:
    """
    统一入口：支持直接传入文件路径或 DataFrame。
    返回值包含行数、列数量、列定义与列型元数据。
    """
    if isinstance(file_path_or_df, str):
        metadata = create_table_from_file_path_typed(
            duckdb_con, table_name, file_path_or_df, file_type or ""
        )
    else:
        metadata = create_typed_table_from_dataframe(
            duckdb_con, table_name, file_path_or_df
        )

    return metadata


# 兼容旧函数命名，统一走 typed 流程
create_varchar_table_from_dataframe_file = create_typed_table_from_dataframe
create_varchar_table_from_file_path = create_table_from_file_path_typed


def convert_table_to_varchar(table_name: str, table_alias: str, duckdb_con):
    """
    将表的所有列转换为VARCHAR类型
    """
    try:
        # 获取表的列信息
        columns_info = duckdb_con.execute(
            f"PRAGMA table_info('{table_name}')"
        ).fetchall()

        # 检查是否所有列都是VARCHAR类型
        all_varchar = True
        for col_info in columns_info:
            col_name, col_type = col_info[1], col_info[2]
            if col_type.upper() != "VARCHAR":
                all_varchar = False
                break

        if all_varchar:
            logger.info(f"表 {table_name} 所有列都是VARCHAR类型，无需转换")
            return

        # 如果不是所有列都是VARCHAR，则进行转换
        logger.info(f"表 {table_name} 需要转换列类型为VARCHAR")

        # 构建新的表名
        new_table_name = f"{table_name}_new_{int(datetime.now().timestamp() * 1000)}"

        # 构建列转换SQL
        cast_columns = []
        for col_info in columns_info:
            col_name = col_info[1]
            # 对列名进行转义
            escaped_col_name = col_name.replace('"', '""')
            cast_columns.append(
                f'CAST("{escaped_col_name}" AS VARCHAR) AS "{escaped_col_name}"'
            )

        cast_sql = ", ".join(cast_columns)

        # 创建新的VARCHAR表
        create_sql = (
            f'CREATE TABLE "{new_table_name}" AS SELECT {cast_sql} FROM "{table_name}"'
        )
        duckdb_con.execute(create_sql)

        # 删除旧表
        duckdb_con.execute(f'DROP TABLE "{table_name}"')

        # 重命名新表
        duckdb_con.execute(f'ALTER TABLE "{new_table_name}" RENAME TO "{table_name}"')

        logger.info(f"成功将表 {table_name} 转换为VARCHAR类型")

    except Exception as e:
        logger.error(f"转换表 {table_name} 列类型失败: {str(e)}")
        raise


def reload_all_file_datasources_to_duckdb(duckdb_con):
    """重新加载所有文件数据源到DuckDB"""
    return file_datasource_manager.reload_all_file_datasources()


# 创建全局实例
file_datasource_manager = FileDatasourceManager()
