"""
file工具模块
提供file类型检测和file读取功能
"""

import pandas as pd
import numpy as np
import logging
import os
import time
from uuid import uuid4
from typing import Dict, Any, Optional

from core.common.utils import normalize_dataframe_output, handle_non_serializable_data
from core.database.duckdb_engine import with_duckdb_connection

logger = logging.getLogger(__name__)


def detect_file_type(filename: str) -> str:
    """检测file类型"""
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


def read_file_by_type(
    file_path: str, file_type: str = None, nrows: int = None
) -> pd.DataFrame:
    """根据file类型读取file"""
    if file_type is None:
        file_type = detect_file_type(file_path)

    try:
        if file_type == "csv":
            # 智能检测编码，不再盲目尝试 latin-1
            import charset_normalizer

            # 读取file头部的字节用于检测
            with open(file_path, "rb") as f:
                raw_data = f.read(1024 * 1024)  # 读取前 1MB
                
            # 1. 尝试常见编码 (GB18030 覆盖了 GBK 和 GB2312)
            # 优先尝试 UTF-8 和 GB18030，因为它们最常见且区分度高
            preferred_encodings = ["utf-8", "gb18030"]
            detected_encoding = None
            
            for enc in preferred_encodings:
                try:
                    raw_data.decode(enc)
                    # 如果能successfully解码，但需要进一步确认不是伪造的 (latin-1 总是successfully)
                    # 这里如果是 utf-8 或 gb18030 successfully解码，通常就是正确的
                    detected_encoding = enc
                    break
                except UnicodeDecodeError:
                    continue
            
            # 2. 如果常见编码failed，使用 charset-normalizer 深度检测
            if not detected_encoding:
                matches = charset_normalizer.from_bytes(raw_data).best()
                if matches:
                    detected_encoding = matches.encoding
            
            # 3. 最后的兜底
            if not detected_encoding:
                detected_encoding = "latin-1"  # 即使是乱码也先读出来，保证不报错
                logger.warning(f"Unable to detect encoding for file {file_path}, falling back to latin-1")

            logger.info(f"Detected encoding for {file_path}: {detected_encoding}")
            
            if nrows is not None:
                df = pd.read_csv(file_path, encoding=detected_encoding, nrows=nrows)
            else:
                df = pd.read_csv(file_path, encoding=detected_encoding)
            
        elif file_type == "excel":
            if nrows is not None:
                df = pd.read_excel(file_path, nrows=nrows)
            else:
                df = pd.read_excel(file_path)
        elif file_type == "json":
            if nrows is not None:
                # JSONfile不支持nrowsparameter，需要手动处理
                df = pd.read_json(file_path)
                df = df.head(nrows)
            else:
                df = pd.read_json(file_path)
        elif file_type == "jsonl":
            # JSONLfile每行一个JSON对象，使用lines=Trueparameter
            if nrows is not None:
                df = pd.read_json(file_path, lines=True)
                df = df.head(nrows)
            else:
                df = pd.read_json(file_path, lines=True)
        elif file_type == "parquet":
            if nrows is not None:
                # Parquetfile不支持nrowsparameter，需要手动处理
                df = pd.read_parquet(file_path)
                df = df.head(nrows)
            else:
                df = pd.read_parquet(file_path)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")

        return df

    except Exception as e:
        logger.error(f"Failed to read file {file_path}: {str(e)}")
        raise


def get_file_preview(file_path: str, rows: int = 10) -> Dict[str, Any]:
    """gettingfile预览info"""
    try:
        file_type = detect_file_type(file_path)
        normalized_type = "parquet" if file_type == "pq" else file_type
        duckdb_preview_types = {"csv", "json", "jsonl", "parquet"}
        if normalized_type in duckdb_preview_types:
            try:
                return _get_duckdb_file_preview(
                    file_path, normalized_type, rows
                )
            except Exception as preview_error:
                logger.warning(
                    "DuckDB preview failed, falling back to pandas: %s", preview_error
                )

        return _get_pandas_file_preview(file_path, file_type, rows)

    except Exception as e:
        logger.error(f"Failed to get file preview {file_path}: {str(e)}")
        raise


def _get_duckdb_file_preview(file_path: str, file_type: str, rows: int) -> Dict[str, Any]:
    temp_table = f"__preview_{uuid4().hex}"
    quoted_table = _quote_identifier(temp_table)
    with with_duckdb_connection() as con:
        try:
            load_file_to_duckdb(
                con,
                temp_table,
                file_path,
                file_type,
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


def _get_pandas_file_preview(file_path: str, file_type: str, rows: int) -> Dict[str, Any]:
    df = read_file_by_type(file_path, file_type, nrows=rows)

    file_size = os.path.getsize(file_path)

    try:
        if file_type == "jsonl":
            with open(file_path, "r", encoding="utf-8") as f:
                total_rows = sum(1 for line in f if line.strip())
        else:
            full_df = read_file_by_type(file_path, file_type)
            total_rows = len(full_df)
    except Exception:
        total_rows = len(df)

    processed_df = df.copy()
    for col in processed_df.columns:
        if processed_df[col].dtype == "object":
            processed_df[col] = processed_df[col].apply(
                lambda x: (
                    str(x)
                    if not (
                        isinstance(x, (str, int, float, bool, type(None), list, dict))
                        or x is None
                    )
                    else x
                )
            )
        else:
            processed_df[col] = processed_df[col].replace({pd.isna: None})

    return {
        "file_type": file_type,
        "file_size": file_size,
        "total_rows": total_rows,
        "columns": processed_df.columns.tolist(),
        "column_types": processed_df.dtypes.astype(str).to_dict(),
        "preview_data": normalize_dataframe_output(processed_df.head(rows)),
        "sample_values": {
            col: processed_df[col].dropna().head(3).tolist()
            for col in processed_df.columns
        },
    }


def _quote_identifier(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _format_reader_option_value(value: Any) -> str:
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
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


def _detect_csv_encoding(file_path: str) -> Optional[str]:
    """检测 CSV 文件编码，返回 DuckDB 可识别的编码名称。

    Args:
        file_path: CSV 文件路径

    Returns:
        检测到的编码名称，如果是 UTF-8 则返回 None（让 DuckDB 使用默认值）
    """
    import charset_normalizer

    # DuckDB 支持的编码名称映射
    # 注意：DuckDB 支持 GB18030 但不支持 GBK，需要将 GBK 映射到 GB18030
    encoding_map = {
        "gb18030": "GB18030",
        "gb2312": "GB18030",  # GB2312 是 GB18030 的子集
        "gbk": "GB18030",     # GBK 是 GB18030 的子集
        "big5": "BIG5",
        "shift_jis": "SHIFT_JIS",
        "euc_jp": "EUC_JP",
        "euc_kr": "EUC_KR",
        "euc_jis_2004": "GB18030",  # 有时中文文件会被误检测为日文编码
        "iso-8859-1": "LATIN1",
        "latin1": "LATIN1",
        "cp1252": "WINDOWS-1252",
        "utf-16": "UTF-16",
        "utf-16-le": "UTF-16LE",
        "utf-16-be": "UTF-16BE",
    }

    try:
        with open(file_path, "rb") as f:
            # 读取前 100KB 用于编码检测（避免在多字节字符中间截断）
            raw_data = f.read(100 * 1024)

        # 优先尝试 UTF-8
        try:
            raw_data.decode("utf-8")
            return None  # UTF-8 是 DuckDB 默认编码，无需指定
        except UnicodeDecodeError:
            pass

        # 使用 charset_normalizer 检测编码
        result = charset_normalizer.from_bytes(raw_data)
        if result and result.best():
            detected = result.best().encoding
            logger.info(f"Detected CSV encoding for {file_path}: {detected}")
            return encoding_map.get(detected.lower(), detected.upper())

        # charset_normalizer 失败时，尝试常见中文编码
        for enc in ["gb18030", "gbk"]:
            try:
                raw_data.decode(enc)
                logger.info(f"Fallback encoding detection for {file_path}: {enc}")
                return "GBK"
            except UnicodeDecodeError:
                continue

    except Exception as e:
        logger.warning(f"Failed to detect encoding for {file_path}: {e}")

    return None


def load_file_to_duckdb(
    connection,
    table_name: str,
    file_path: str,
    file_type: Optional[str] = None,
    reader_options: Optional[Dict[str, Any]] = None,
    drop_existing: bool = True,
) -> Dict[str, Any]:
    """使用DuckDB原生read_*系columnloadingfile，必要时回退到pandas。

    Args:
        connection: DuckDBconnection实例
        table_name: 目标table名
        file_path: 本地filepath
        file_type: 可选file类型；缺省时自动根据扩展名推断
        reader_options: 传递给read_*函数的额外parameter
        drop_existing: 是否在creating前deleting旧table
    Returns:
        包含是否触发pandas回退的result字典
    """

    if connection is None:
        raise ValueError("load_file_to_duckdb requires valid DuckDB connection")

    normalized_type = (file_type or detect_file_type(file_path) or "").lower()

    native_readers = {
        "csv": ("read_csv_auto", {"HEADER": True, "SAMPLE_SIZE": -1}),
        "json": (
            "read_json_auto",
            {"format": "auto", "maximum_depth": 10},
        ),
        "jsonl": (
            "read_json_auto",
            {"format": "newline_delimited", "maximum_depth": 10},
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
            logger.info(f"Using encoding '{detected_encoding}' for CSV file: {file_path}")

    if reader_options:
        merged_options.update(reader_options)

    quoted_table = _quote_identifier(table_name)
    invocation = _build_reader_invocation(function_name, merged_options)
    load_sql = f"CREATE TABLE {quoted_table} AS SELECT * FROM {invocation}"

    if drop_existing:
        connection.execute(f"DROP TABLE IF EXISTS {quoted_table}")

    try:
        connection.execute(load_sql, [file_path])
        logger.info("Loaded file %s using DuckDB %s", file_path, function_name)
        return {"fallback_used": False, "engine": "duckdb"}
    except Exception as native_error:
        logger.warning(
            "DuckDB native read failed for %s, falling back to pandas: %s", file_path, native_error
        )

    # pandas fallback
    df = read_file_by_type(file_path, normalized_type)
    temp_view = f"tmp_{table_name}_{int(time.time())}"
    try:
        connection.register(temp_view, df)
        if drop_existing:
            connection.execute(f"DROP TABLE IF EXISTS {quoted_table}")
        source_ref = _quote_identifier(temp_view)
        connection.execute(
            f"CREATE TABLE {quoted_table} AS SELECT * FROM {source_ref}"
        )
        logger.info("Created table %s via pandas fallback", table_name)
        return {"fallback_used": True, "engine": "pandas"}
    finally:
        try:
            connection.unregister(temp_view)
        except Exception:
            pass
