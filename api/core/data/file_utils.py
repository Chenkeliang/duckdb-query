"""
文件工具模块
提供文件类型检测和文件读取功能
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


def read_file_by_type(
    file_path: str, file_type: str = None, nrows: int = None
) -> pd.DataFrame:
    """根据文件类型读取文件"""
    if file_type is None:
        file_type = detect_file_type(file_path)

    try:
        if file_type == "csv":
            # 智能检测编码，不再盲目尝试 latin-1
            import charset_normalizer

            # 读取文件头部的字节用于检测
            with open(file_path, "rb") as f:
                raw_data = f.read(1024 * 1024)  # 读取前 1MB
                
            # 1. 尝试常见编码 (GB18030 覆盖了 GBK 和 GB2312)
            # 优先尝试 UTF-8 和 GB18030，因为它们最常见且区分度高
            preferred_encodings = ["utf-8", "gb18030"]
            detected_encoding = None
            
            for enc in preferred_encodings:
                try:
                    raw_data.decode(enc)
                    # 如果能成功解码，但需要进一步确认不是伪造的 (latin-1 总是成功)
                    # 这里如果是 utf-8 或 gb18030 成功解码，通常就是正确的
                    detected_encoding = enc
                    break
                except UnicodeDecodeError:
                    continue
            
            # 2. 如果常见编码失败，使用 charset-normalizer 深度检测
            if not detected_encoding:
                matches = charset_normalizer.from_bytes(raw_data).best()
                if matches:
                    detected_encoding = matches.encoding
            
            # 3. 最后的兜底
            if not detected_encoding:
                detected_encoding = "latin-1"  # 即使是乱码也先读出来，保证不报错
                logger.warning(f"无法检测文件 {file_path} 的编码，回退到 latin-1")

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
                # JSON文件不支持nrows参数，需要手动处理
                df = pd.read_json(file_path)
                df = df.head(nrows)
            else:
                df = pd.read_json(file_path)
        elif file_type == "jsonl":
            # JSONL文件每行一个JSON对象，使用lines=True参数
            if nrows is not None:
                df = pd.read_json(file_path, lines=True)
                df = df.head(nrows)
            else:
                df = pd.read_json(file_path, lines=True)
        elif file_type == "parquet":
            if nrows is not None:
                # Parquet文件不支持nrows参数，需要手动处理
                df = pd.read_parquet(file_path)
                df = df.head(nrows)
            else:
                df = pd.read_parquet(file_path)
        else:
            raise ValueError(f"不支持的文件类型: {file_type}")

        return df

    except Exception as e:
        logger.error(f"读取文件失败 {file_path}: {str(e)}")
        raise


def get_file_preview(file_path: str, rows: int = 10) -> Dict[str, Any]:
    """获取文件预览信息"""
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
                    "DuckDB预览失败，回退pandas: %s", preview_error
                )

        return _get_pandas_file_preview(file_path, file_type, rows)

    except Exception as e:
        logger.error(f"获取文件预览失败 {file_path}: {str(e)}")
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


def load_file_to_duckdb(
    connection,
    table_name: str,
    file_path: str,
    file_type: Optional[str] = None,
    reader_options: Optional[Dict[str, Any]] = None,
    drop_existing: bool = True,
) -> Dict[str, Any]:
    """使用DuckDB原生read_*系列加载文件，必要时回退到pandas。

    Args:
        connection: DuckDB连接实例
        table_name: 目标表名
        file_path: 本地文件路径
        file_type: 可选文件类型；缺省时自动根据扩展名推断
        reader_options: 传递给read_*函数的额外参数
        drop_existing: 是否在创建前删除旧表
    Returns:
        包含是否触发pandas回退的结果字典
    """

    if connection is None:
        raise ValueError("load_file_to_duckdb 需要有效的DuckDB连接")

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
        raise ValueError(f"不支持的文件类型: {normalized_type}")

    function_name, defaults = native_readers[normalized_type]
    merged_options = defaults.copy()
    if reader_options:
        merged_options.update(reader_options)

    quoted_table = _quote_identifier(table_name)
    invocation = _build_reader_invocation(function_name, merged_options)
    load_sql = f"CREATE TABLE {quoted_table} AS SELECT * FROM {invocation}"

    if drop_existing:
        connection.execute(f"DROP TABLE IF EXISTS {quoted_table}")

    try:
        connection.execute(load_sql, [file_path])
        logger.info("使用DuckDB %s 加载文件 %s", function_name, file_path)
        return {"fallback_used": False, "engine": "duckdb"}
    except Exception as native_error:
        logger.warning(
            "DuckDB原生读取 %s 失败，回退pandas: %s", file_path, native_error
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
        logger.info("已通过pandas回退创建表 %s", table_name)
        return {"fallback_used": True, "engine": "pandas"}
    finally:
        try:
            connection.unregister(temp_view)
        except Exception:
            pass
