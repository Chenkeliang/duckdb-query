"""
文件工具模块
提供文件类型检测和文件读取功能
"""

import pandas as pd
import numpy as np
import logging
import os
from typing import Dict, Any

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
            # 对于CSV文件，先尝试使用 latin-1 编码，如果失败则使用 UTF-8
            encodings_to_try = ["latin-1", "utf-8"]
            for encoding in encodings_to_try:
                try:
                    if nrows is not None:
                        df = pd.read_csv(file_path, encoding=encoding, nrows=nrows)
                    else:
                        df = pd.read_csv(file_path, encoding=encoding)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                # 如果所有编码都失败
                raise ValueError(f"无法解码文件 {file_path}，请检查文件编码")
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
        df = read_file_by_type(file_path, file_type, nrows=rows)

        # 获取文件大小
        file_size = os.path.getsize(file_path)

        # 获取全量数据行数（读取完整文件来获取准确行数）
        try:
            if file_type == "jsonl":
                # 对于JSONL文件，通过计算行数来获取总行数，避免pandas的"Trailing data"问题
                with open(file_path, "r", encoding="utf-8") as f:
                    total_rows = sum(1 for line in f if line.strip())
            else:
                full_df = read_file_by_type(file_path, file_type)
                total_rows = len(full_df)
        except Exception:
            # 如果读取完整文件失败，估算行数
            total_rows = len(df)

        # 处理非序列化数据类型
        processed_df = df.copy()
        for col in processed_df.columns:
            if processed_df[col].dtype == "object":
                # 处理复杂对象类型
                processed_df[col] = processed_df[col].apply(
                    lambda x: (
                        str(x)
                        if not (
                            isinstance(
                                x, (str, int, float, bool, type(None), list, dict)
                            )
                            or x is None
                        )
                        else x
                    )
                )
            else:
                # 处理NaN值
                processed_df[col] = processed_df[col].replace({pd.isna: None})

        return {
            "file_type": file_type,
            "file_size": file_size,
            "total_rows": total_rows,
            "columns": processed_df.columns.tolist(),
            "column_types": processed_df.dtypes.astype(str).to_dict(),
            "preview_data": processed_df.head(rows).to_dict(orient="records"),
            "sample_values": {
                col: processed_df[col].dropna().head(3).tolist()
                for col in processed_df.columns
            },
        }

    except Exception as e:
        logger.error(f"获取文件预览失败 {file_path}: {str(e)}")
        raise
