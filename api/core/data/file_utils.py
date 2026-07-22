"""
文件工具模块
提供文件类型检测和文件读取功能
"""

import logging
import os
from uuid import uuid4
from typing import Dict, Any, Optional

from core.common.utils import handle_non_serializable_data
from core.database.duckdb_engine import with_duckdb_connection

logger = logging.getLogger(__name__)


def detect_file_type(filename: str) -> str:
    """检测文件类型"""
    extension = filename.lower().split(".")[-1]

    type_mapping = {
        "csv": "csv",
        "xls": "excel",
        "xlsx": "excel",
        "json": "json",
        "jsonl": "jsonl",
        "parquet": "parquet",
        "pq": "parquet",
    }

    return type_mapping.get(extension, "unknown")


class _UnreliableNativeEncoding(Exception):
    """标记编码在 DuckDB 原生 CSV reader 上不可靠，需改走 UTF-8 转码兜底。"""


# DuckDB 原生 CSV reader「不报错但解码错乱」的编码（按版本实测维护）
_DUCKDB_UNRELIABLE_CSV_ENCODINGS = {"BIG5"}

# DuckDB 编码名 → Python codec 名（多数同名可直接用）
_PYTHON_ENCODING_ALIASES = {
    "UTF-16LE": "utf-16-le",
    "UTF-16BE": "utf-16-be",
}


def detect_text_encoding(file_path: str, explicit: str = None) -> str:
    """探测文本文件编码，返回 Python codec 名。

    显式给定（探测结果或用户高级选项）优先；其后 UTF-8/GB18030 快路径；
    再 charset_normalizer 深度探测；最后 latin-1 兜底（任何字节序列都可
    解码，保证"读得出来"而非报错——与既有行为一致）。
    """
    if explicit:
        candidate = _PYTHON_ENCODING_ALIASES.get(str(explicit).upper(), str(explicit))
        try:
            import codecs

            codecs.lookup(candidate)
            return candidate
        except LookupError:
            logger.warning(
                "Unknown encoding %r for %s; falling back to detection", explicit, file_path
            )

    import charset_normalizer

    with open(file_path, "rb") as f:
        raw_data = f.read(1024 * 1024)  # 前 1MB

    # utf-8 自校验，可做快路径；gb18030 几乎能解码任意字节序列，绝不能当先验
    # （会把 BIG5 等文件静默错认），只配做 normalizer 之后的兜底
    try:
        raw_data.decode("utf-8")
        return "utf-8"
    except UnicodeDecodeError:
        pass

    result = charset_normalizer.from_bytes(raw_data)
    matches = result.best() if result else None
    if matches:
        return matches.encoding

    for enc in ("gb18030",):
        try:
            raw_data.decode(enc)
            return enc
        except UnicodeDecodeError:
            continue

    logger.warning("Unable to detect encoding for %s, falling back to latin-1", file_path)
    return "latin-1"


def transcode_to_utf8(file_path: str, encoding: str = None) -> str:
    """把文本文件按给定/探测编码流式转码成 UTF-8 临时文件，返回临时路径。

    v1.2.1 起这是 CSV 的统一兜底：DuckDB 原生 reader 不认/不可靠的编码
    （BIG5 静默乱码、小语种拼写差异）一律先转码再交回原生 reader，覆盖
    Python 支持的全部编码，且后续路径（all_varchar/促升/严格模式）与主
    路径完全一致。调用方负责删除临时文件。
    """
    import tempfile

    codec = detect_text_encoding(file_path, explicit=encoding)
    logger.info("Transcoding %s from %s to UTF-8", file_path, codec)
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", newline="", suffix=".csv", delete=False
        ) as tmp:
            tmp_path = tmp.name
            with open(file_path, "r", encoding=codec, newline="") as source:
                while True:
                    chunk = source.read(1 << 20)
                    if not chunk:
                        break
                    tmp.write(chunk)
    except Exception:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        raise
    return tmp_path


def get_file_preview(
    file_path: str, rows: int = 10, csv_encoding: Optional[str] = None
) -> Dict[str, Any]:
    """获取文件预览信息。

    csv/json/jsonl/parquet 走 DuckDB 预览（其内部 load_file_to_duckdb 已带
    CSV 转码兜底）；excel 走 openpyxl/calamine 原生预览。v1.2.1 起不再有
    pandas 预览兜底——原 parquet/json 的 pandas 兜底在桌面冻结包（无
    pyarrow）本就是死路，失败改为如实报错。
    """
    try:
        file_type = detect_file_type(file_path)
        normalized_type = "parquet" if file_type == "pq" else file_type
        if normalized_type == "excel":
            from core.data.excel_import_manager import get_excel_native_preview

            return get_excel_native_preview(file_path, rows)
        reader_options = (
            {"encoding": csv_encoding}
            if csv_encoding and normalized_type == "csv"
            else None
        )
        return _get_duckdb_file_preview(
            file_path, normalized_type, rows, reader_options=reader_options
        )

    except Exception as e:
        logger.error(f"Failed to get file preview {file_path}: {str(e)}")
        raise


def _get_duckdb_file_preview(
    file_path: str,
    file_type: str,
    rows: int,
    reader_options: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    temp_table = f"__preview_{uuid4().hex}"
    quoted_table = _quote_identifier(temp_table)
    with with_duckdb_connection() as con:
        try:
            load_file_to_duckdb(
                con,
                temp_table,
                file_path,
                file_type,
                reader_options=reader_options,
                drop_existing=True,
            )

            columns_info = con.execute(f"PRAGMA table_info({quoted_table})").fetchall()
            columns = [info[1] for info in columns_info]
            column_types = {info[1]: info[2] for info in columns_info}

            total_rows = con.execute(
                f"SELECT COUNT(*) FROM {quoted_table}"
            ).fetchone()[0]

            preview_rows = con.execute(
                f"SELECT * FROM {quoted_table} LIMIT ?", [rows]
            ).fetchall()

            preview_data = []
            for row in preview_rows:
                row_dict = {
                    col: handle_non_serializable_data(value)
                    for col, value in zip(columns, row)
                }
                preview_data.append(row_dict)

            sample_values = {}
            for col in columns:
                quoted_col = _quote_identifier(col)
                values = con.execute(
                    f"SELECT DISTINCT {quoted_col} FROM {quoted_table} "
                    f"WHERE {quoted_col} IS NOT NULL LIMIT 3"
                ).fetchall()
                sample_values[col] = [
                    handle_non_serializable_data(value[0]) for value in values
                ]

        finally:
            try:
                con.execute(f"DROP TABLE IF EXISTS {quoted_table}")
            except Exception:
                pass

    return {
        "file_type": file_type,
        "file_size": os.path.getsize(file_path),
        "total_rows": int(total_rows),
        "columns": columns,
        "column_types": column_types,
        "preview_data": preview_data,
        "sample_values": sample_values,
    }


# 标识符转义统一走 core.common.sql_identifiers(消灭历史 8 份副本)
from core.common.sql_identifiers import quote_identifier as _quote_identifier  # noqa: E402


def _swap_staging_table(
    connection, staging_name: str, table_name: str, drop_existing: bool = True
) -> None:
    """把已经建好、已验证可用的 staging 表原子换名成目标表。

    DROP+RENAME 包在真事务里：RENAME 失败(如目标已存在且 drop_existing=False，
    或执行被中断)时 ROLLBACK 撤销 DROP，目标表不会凭空消失——staging 表在这一步
    之前已经完整建好，"建表"和"替换"是两个独立阶段，替换失败不影响已经有效的
    旧数据。与 core.database.federated_attach.execute_sql_and_persist、
    core.data.file_datasource_manager._create_table_atomically 用同一个模式。
    """
    quoted_staging = _quote_identifier(staging_name)
    quoted_target = _quote_identifier(table_name)
    connection.execute("BEGIN TRANSACTION")
    try:
        if drop_existing:
            connection.execute(f"DROP TABLE IF EXISTS {quoted_target}")
        connection.execute(f"ALTER TABLE {quoted_staging} RENAME TO {quoted_target}")
        connection.execute("COMMIT")
    except Exception:  # pylint: disable=broad-exception-caught
        connection.execute("ROLLBACK")
        raise


def _format_reader_option_value(value: Any) -> str:
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        parts = []
        for key, val in value.items():
            escaped_key = str(key).replace("'", "''")
            escaped_val = str(val).replace("'", "''")
            parts.append(f"'{escaped_key}': '{escaped_val}'")
        return "{" + ", ".join(parts) + "}"
    if value is None:
        return "NULL"
    text = str(value).replace("'", "''")
    return f"'{text}'"


def _build_reader_invocation(function_name: str, options: Optional[Dict[str, Any]]) -> str:
    option_pairs = []
    if options:
        option_pairs = [
            f"{key}={_format_reader_option_value(val)}" for key, val in options.items()
        ]
    args = ["?"] + option_pairs
    return f"{function_name}({', '.join(args)})"


def _resolve_json_reader_format(file_path: str, file_type: str) -> str:
    """Choose an explicit format when a UTF-8 BOM breaks DuckDB auto detection."""
    with open(file_path, "rb") as source:
        prefix = source.read(4096)

    has_utf8_bom = prefix.startswith(b"\xef\xbb\xbf")
    if has_utf8_bom:
        prefix = prefix[3:]

    if file_type == "jsonl":
        # DuckDB 1.5 rejects BOM with explicit newline_delimited, while auto
        # correctly recognizes the subsequent JSON objects.
        return "auto" if has_utf8_bom else "newline_delimited"

    return "array" if prefix.lstrip().startswith(b"[") else "auto"


def _detect_csv_encoding(file_path: str) -> Optional[str]:
    """检测 CSV 编码，返回 DuckDB 认识的编码拼写；UTF-8 返回 None（默认值）。

    探测统一走 detect_text_encoding（utf-8 → gb18030 快速先验 →
    charset_normalizer 深度探测）：此前这里直接用 charset_normalizer，
    小样本 GBK 文件会被误判成 BIG5，原生路径按错误编码读出静默乱码。
    """
    # Python codec 名 → DuckDB 编码拼写
    # 注意：DuckDB 支持 GB18030 但不支持 GBK；1.5 实测只认 latin-1 / CP1252
    # 这两种拼写（LATIN1、WINDOWS-1252 会被拒绝）
    encoding_map = {
        "gb18030": "GB18030",
        "gb2312": "GB18030",
        "gbk": "GB18030",
        "big5": "BIG5",
        "shift_jis": "SHIFT_JIS",
        "cp932": "SHIFT_JIS",   # charset_normalizer 对日文 CSV 的常见探测结果
        "ms932": "SHIFT_JIS",
        "euc_jp": "EUC_JP",
        "euc_kr": "EUC_KR",
        "euc_jis_2004": "GB18030",  # 中文文件偶被误判为日文编码
        "iso-8859-1": "latin-1",
        "latin1": "latin-1",
        "latin-1": "latin-1",
        "cp1252": "CP1252",
        "utf-16": "UTF-16",
        "utf-16-le": "UTF-16LE",
        "utf-16-be": "UTF-16BE",
    }

    try:
        codec = detect_text_encoding(file_path)
    except Exception as e:  # pylint: disable=broad-exception-caught
        logger.warning(f"Failed to detect encoding for {file_path}: {e}")
        return None
    normalized = str(codec).lower().replace("_", "-")
    if normalized in ("utf-8", "ascii", "utf-8-sig"):
        return None  # DuckDB 默认 UTF-8
    mapped = encoding_map.get(normalized) or encoding_map.get(str(codec).lower())
    result = mapped or str(codec).upper()
    logger.info(f"Detected CSV encoding for {file_path}: {result}")
    return result


def _load_json_file_as_variant(
    connection,
    table_name: str,
    file_path: str,
    file_type: str,
    *,
    drop_existing: bool = True,
) -> Dict[str, Any]:
    """JSON/JSONL 入湖：各列 CAST 为 DuckDB VARIANT。

    目标表在整个构建过程中都不会被触碰：原始 JSON 先读进一张 TEMP 表用于探测
    列名，CAST 后的结果先落到一张普通 staging 表，两步都成功之后才通过
    _swap_staging_table 原子换名——任何一步失败，drop_existing=True 也不会
    提前删掉旧表（回归：曾经是先无条件 DROP 目标表，再开始读文件，读文件或
    CAST 失败时旧表已经没了）。
    """
    raw_stage = f"__json_variant_raw_{uuid4().hex}"
    quoted_raw_stage = _quote_identifier(raw_stage)
    variant_stage = f"__json_variant_stage_{uuid4().hex}"
    quoted_variant_stage = _quote_identifier(variant_stage)
    format_value = _resolve_json_reader_format(file_path, file_type)

    try:
        connection.execute(
            f"""
            CREATE TEMP TABLE {quoted_raw_stage} AS
            SELECT * FROM read_json_auto(?, format='{format_value}', maximum_depth=10)
            """,
            [file_path],
        )
        columns_df = connection.execute(f"PRAGMA table_info({quoted_raw_stage})").fetchall()
        column_names = [row[1] for row in columns_df]
        if not column_names:
            raise ValueError("JSON file produced no columns for VARIANT import")

        select_parts = []
        for col in column_names:
            safe = col.replace('"', '""')
            select_parts.append(f'CAST("{safe}" AS VARIANT) AS "{safe}"')
        select_sql = ", ".join(select_parts)
        connection.execute(
            f"CREATE TABLE {quoted_variant_stage} AS SELECT {select_sql} FROM {quoted_raw_stage}"
        )
        _swap_staging_table(connection, variant_stage, table_name, drop_existing)
    finally:
        for stage in (raw_stage, variant_stage):
            try:
                connection.execute(f"DROP TABLE IF EXISTS {_quote_identifier(stage)}")
            except Exception:  # pylint: disable=broad-exception-caught
                pass

    logger.info("Loaded %s as VARIANT columns into %s", file_path, table_name)
    return {"fallback_used": False, "engine": "duckdb_variant"}


def load_file_to_duckdb(
    connection,
    table_name: str,
    file_path: str,
    file_type: Optional[str] = None,
    reader_options: Optional[Dict[str, Any]] = None,
    drop_existing: bool = True,
    import_mode: Optional[str] = None,
) -> Dict[str, Any]:
    """使用 DuckDB 原生 read_* 系列函数加载文件，必要时回退到 pandas。

    Args:
        connection: DuckDB 连接实例
        table_name: 目标表名
        file_path: 本地文件路径
        file_type: 可选文件类型；缺省时自动根据扩展名推断
        reader_options: 传递给 read_* 函数的额外参数
        drop_existing: 是否在创建前删除旧表
    Returns:
        包含是否触发 pandas 回退结果的字典
    """

    if connection is None:
        raise ValueError("load_file_to_duckdb requires valid DuckDB connection")

    normalized_type = (file_type or detect_file_type(file_path) or "").lower()
    from core.data.import_mode import resolve_import_mode

    import_mode = resolve_import_mode(import_mode, file_type=normalized_type)
    json_reader_format = (
        _resolve_json_reader_format(file_path, normalized_type)
        if normalized_type in ("json", "jsonl")
        else None
    )

    native_readers = {
        "csv": ("read_csv_auto", {"HEADER": True, "SAMPLE_SIZE": -1}),
        "json": (
            "read_json_auto",
            {
                "format": json_reader_format or "auto",
                "maximum_depth": 10,
            },
        ),
        "jsonl": (
            "read_json_auto",
            {
                "format": json_reader_format or "newline_delimited",
                "maximum_depth": 10,
            },
        ),
        "parquet": ("read_parquet", {}),
        "pq": ("read_parquet", {}),
    }

    if normalized_type not in native_readers:
        raise ValueError(f"Unsupported file type: {normalized_type}")

    function_name, defaults = native_readers[normalized_type]
    merged_options = defaults.copy()

    # 对于 CSV 文件，先检测编码
    if normalized_type == "csv":
        detected_encoding = _detect_csv_encoding(file_path)
        if detected_encoding:
            merged_options["encoding"] = detected_encoding
            # 非 UTF-8 编码的 CSV 文件需要 strict_mode=false 以正确处理引号
            merged_options["strict_mode"] = False
            logger.info(f"Using encoding '{detected_encoding}' for CSV file: {file_path}")

    if reader_options:
        merged_options.update(reader_options)

    # DuckDB 对个别编码会「不报错但解码错乱」（实测 1.5.3 的 BIG5：换行被映射成
    # 图形字符、分隔符失效）——静默产出坏数据比失败更危险，直接强制转码兜底
    force_transcode_encoding: Optional[str] = None
    if normalized_type == "csv":
        effective_encoding = str(merged_options.get("encoding") or "").upper()
        if effective_encoding in _DUCKDB_UNRELIABLE_CSV_ENCODINGS:
            force_transcode_encoding = effective_encoding
            logger.info(
                "Encoding %s is unreliable in DuckDB native reader; transcoding %s to UTF-8",
                effective_encoding,
                file_path,
            )

    if normalized_type in ("json", "jsonl"):
        from core.data.import_mode import is_variant_json_import

        if is_variant_json_import(import_mode):
            return _load_json_file_as_variant(
                connection,
                table_name,
                file_path,
                normalized_type,
                drop_existing=drop_existing,
            )

    if normalized_type == "csv":
        from core.data.import_mode import (
            normalize_import_mode,
            should_promote_column_types,
            use_all_varchar_on_load,
        )
        from core.data.ingestion_precision import promote_table_column_types_from_varchar

        normalize_import_mode(import_mode)
        if use_all_varchar_on_load(import_mode) and "all_varchar" not in merged_options:
            merged_options["all_varchar"] = True
            logger.info("CSV import_mode=%s: all_varchar=true for %s", import_mode, file_path)

    # 全程建到一张 staging 表，原生/pandas 两条路都成功之后再原子换名——目标表
    # 在此之前不会被触碰（回归：曾经是先无条件 DROP 目标表，原生和 pandas 两条
    # 路都失败时目标表永久消失，见 file_utils 顶部 issue #6 的说明）。
    staging_name = f"__stage_{table_name}_{uuid4().hex[:8]}"
    quoted_staging = _quote_identifier(staging_name)
    invocation = _build_reader_invocation(function_name, merged_options)
    load_sql = f"CREATE TABLE {quoted_staging} AS SELECT * FROM {invocation}"

    fallback_used = False
    try:
        try:
            if force_transcode_encoding is not None:
                raise _UnreliableNativeEncoding(force_transcode_encoding)
            connection.execute(load_sql, [file_path])
            logger.info("Loaded file %s using DuckDB %s", file_path, function_name)
        except Exception as native_error:
            if not isinstance(native_error, _UnreliableNativeEncoding):
                logger.warning(
                    "DuckDB native read failed for %s, falling back to pandas: %s",
                    file_path,
                    native_error,
                )
            connection.execute(f"DROP TABLE IF EXISTS {quoted_staging}")

            if normalized_type != "csv":
                # v1.2.1 起 json/jsonl/parquet 无 pandas 兜底（parquet 兜底在
                # 桌面冻结包缺 pyarrow 本就是死路），原生失败如实上抛
                raise

            # CSV 统一兜底：按探测/指定编码流式转码 UTF-8，再交回原生 reader。
            # 覆盖 DuckDB 不认的编码拼写与 BIG5 类静默乱码场景，且 all_varchar/
            # 严格模式/促升与主路径完全一致
            transcoded_path = transcode_to_utf8(
                file_path, encoding=merged_options.get("encoding")
            )
            try:
                retry_options = {
                    k: v for k, v in merged_options.items() if k != "encoding"
                }
                retry_invocation = _build_reader_invocation(
                    function_name, retry_options
                )
                connection.execute(
                    f"CREATE TABLE {quoted_staging} AS SELECT * FROM {retry_invocation}",
                    [transcoded_path],
                )
                logger.info(
                    "Created table %s via UTF-8 transcode fallback", table_name
                )
            finally:
                try:
                    os.remove(transcoded_path)
                except OSError:  # pylint: disable=broad-exception-caught
                    pass
            fallback_used = True

        if normalized_type == "csv":
            from core.data.import_mode import should_promote_column_types
            from core.data.ingestion_precision import promote_table_column_types_from_varchar

            if should_promote_column_types(import_mode):
                promote_table_column_types_from_varchar(connection, staging_name)

        _swap_staging_table(connection, staging_name, table_name, drop_existing)
    finally:
        try:
            connection.execute(f"DROP TABLE IF EXISTS {quoted_staging}")
        except Exception:  # pylint: disable=broad-exception-caught
            pass

    engine = "transcode" if fallback_used else "duckdb"
    return {"fallback_used": fallback_used, "engine": engine}
