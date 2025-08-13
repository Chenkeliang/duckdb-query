"""
文件工具模块
提供文件类型检测和文件读取功能
"""

import pandas as pd
import logging

logger = logging.getLogger(__name__)


def detect_file_type(filename: str) -> str:
    """检测文件类型"""
    extension = filename.lower().split(".")[-1]

    type_mapping = {
        "csv": "csv",
        "xls": "excel",
        "xlsx": "excel",
        "json": "json",
        "jsonl": "json",
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