from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, HttpUrl
import pandas as pd
import requests
import tempfile
import os
from typing import Optional
from core.duckdb_engine import get_db_connection

router = APIRouter()


class URLReadRequest(BaseModel):
    url: HttpUrl
    table_alias: str
    file_type: Optional[str] = None  # 可选：csv, json, parquet, excel
    encoding: Optional[str] = "utf-8"
    delimiter: Optional[str] = ","
    header: Optional[bool] = True


def convert_github_url(url: str) -> str:
    """将GitHub blob URL转换为raw URL"""
    url_str = str(url)

    # 检查是否是GitHub blob URL
    if "github.com" in url_str and "/blob/" in url_str:
        # 将 github.com/user/repo/blob/branch/path 转换为 raw.githubusercontent.com/user/repo/branch/path
        url_str = url_str.replace("github.com", "raw.githubusercontent.com")
        url_str = url_str.replace("/blob/", "/")

    return url_str


@router.post("/api/read_from_url")
async def read_from_url(request: URLReadRequest):
    """从URL读取文件并创建DuckDB表"""
    try:
        # 转换GitHub URL
        converted_url = convert_github_url(str(request.url))

        # 下载文件
        response = requests.get(converted_url, timeout=30)
        response.raise_for_status()

        # 检测文件类型
        url_str = str(request.url).lower()
        if request.file_type:
            file_type = request.file_type.lower()
        elif url_str.endswith(".csv"):
            file_type = "csv"
        elif url_str.endswith(".json"):
            file_type = "json"
        elif url_str.endswith((".parquet", ".pq")):
            file_type = "parquet"
        elif url_str.endswith((".xlsx", ".xls")):
            file_type = "excel"
        else:
            # 默认尝试CSV
            file_type = "csv"

        # 创建临时文件
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=f".{file_type}"
        ) as temp_file:
            temp_file.write(response.content)
            temp_file_path = temp_file.name

        try:
            # 根据文件类型读取数据
            if file_type == "csv":
                df = pd.read_csv(
                    temp_file_path,
                    encoding=request.encoding,
                    delimiter=request.delimiter,
                    header=0 if request.header else None,
                )
            elif file_type == "json":
                df = pd.read_json(temp_file_path)
            elif file_type == "parquet":
                df = pd.read_parquet(temp_file_path)
            elif file_type == "excel":
                df = pd.read_excel(temp_file_path)
            else:
                raise HTTPException(
                    status_code=400, detail=f"不支持的文件类型: {file_type}"
                )

            # 检查数据是否为空
            if df.empty:
                raise HTTPException(status_code=400, detail="文件中没有数据")

            # 清理列名（移除特殊字符）
            df.columns = [
                str(col).strip().replace(" ", "_").replace("-", "_")
                for col in df.columns
            ]

            # 处理复杂数据类型列（保留原始格式）
            import json

            for col in df.columns:
                if df[col].dtype == "object":
                    # 检查是否包含复杂数据类型
                    sample_value = df[col].iloc[0] if len(df) > 0 else None
                    print(
                        f"DEBUG: 列 {col} 的样本值类型: {type(sample_value)}, 值: {sample_value}"
                    )

                    if isinstance(sample_value, (bytes, bytearray)):
                        # 将字节数组直接解码为可读字符串
                        def bytes_to_string(x):
                            if isinstance(x, (bytes, bytearray)):
                                try:
                                    # 尝试UTF-8解码
                                    return x.decode("utf-8", errors="ignore")
                                except:
                                    # 如果解码失败，返回字符串表示
                                    return str(x)
                            elif x is not None:
                                return str(x)
                            else:
                                return None

                        df[col] = df[col].apply(bytes_to_string)
                        print(f"DEBUG: 列 {col} 转换为可读字符串格式")
                    elif isinstance(sample_value, dict):
                        # 如果是字典（JSON对象），转换为JSON字符串
                        def safe_json_dumps(x):
                            if isinstance(x, dict):
                                try:
                                    # 处理包含numpy数组的字典
                                    def convert_numpy(obj):
                                        if hasattr(obj, "tolist"):  # numpy数组
                                            return obj.tolist()
                                        elif isinstance(obj, dict):
                                            return {
                                                k: convert_numpy(v)
                                                for k, v in obj.items()
                                            }
                                        elif isinstance(obj, list):
                                            return [convert_numpy(item) for item in obj]
                                        else:
                                            return obj

                                    converted_dict = convert_numpy(x)
                                    return json.dumps(
                                        converted_dict, ensure_ascii=False
                                    )
                                except Exception as e:
                                    print(f"DEBUG: JSON序列化失败: {e}")
                                    return str(x)
                            elif x is not None:
                                return str(x)
                            else:
                                return None

                        df[col] = df[col].apply(safe_json_dumps)
                        print(f"DEBUG: 列 {col} 转换为JSON字符串")
                    elif hasattr(sample_value, "__iter__") and not isinstance(
                        sample_value, str
                    ):
                        # 对于其他可迭代对象，直接转换为字符串
                        df[col] = df[col].apply(
                            lambda x: str(x) if x is not None else None
                        )
                        print(f"DEBUG: 列 {col} 转换为字符串")

            # 获取DuckDB连接
            conn = get_db_connection()

            # 检查表名是否已存在，如果存在则添加时间后缀
            table_name = request.table_alias
            original_table_name = table_name

            while True:
                try:
                    # 检查表是否存在
                    result = conn.execute(
                        f'SELECT name FROM sqlite_master WHERE type="table" AND name="{table_name}"'
                    ).fetchone()
                    if result is None:
                        # 表不存在，可以使用这个名称
                        break
                    else:
                        # 表已存在，添加时间后缀
                        import time

                        timestamp = time.strftime("%Y%m%d%H%M", time.localtime())
                        table_name = f"{original_table_name}_{timestamp}"
                        break
                except Exception as e:
                    print(f"DEBUG: 检查表名时出错: {e}")
                    break

            # 直接创建表，不使用临时表
            temp_table_name = f"temp_{table_name}"
            conn.register(temp_table_name, df)
            conn.execute(
                f'CREATE TABLE "{table_name}" AS SELECT * FROM {temp_table_name}'
            )

            # 清理临时注册的DataFrame
            try:
                conn.unregister(temp_table_name)
                print(f"DEBUG: 已清理临时注册表 {temp_table_name}")
            except Exception as e:
                print(f"DEBUG: 清理临时注册表失败: {e}")

            # 保存表元数据，包括created_at时间
            try:
                from core.timezone_utils import get_current_time_iso
                from core.file_datasource_manager import file_datasource_manager

                table_metadata = {
                    "source_id": table_name,
                    "filename": f"url_{table_name}",
                    "file_path": f"url://{converted_url}",
                    "file_type": file_type,
                    "row_count": len(df),
                    "column_count": len(df.columns),
                    "columns": df.columns.tolist(),
                    "created_at": get_current_time_iso(),  # 使用统一的时区配置
                    "source_url": converted_url,
                }

                # 保存到文件数据源管理器
                file_datasource_manager.save_file_datasource(table_metadata)
                print(f"DEBUG: 成功保存表元数据: {table_name}")

            except Exception as metadata_error:
                print(f"DEBUG: 保存表元数据失败: {str(metadata_error)}")

            # 获取表信息
            columns_result = conn.execute(f'DESCRIBE "{table_name}"').fetchall()
            columns = [row[0] for row in columns_result]

            return {
                "success": True,
                "message": f"成功从URL读取文件并创建表: {table_name}",
                "table_name": table_name,
                "row_count": len(df),
                "column_count": len(df.columns),
                "columns": columns,
                "file_type": file_type,
                "url": converted_url,
                "original_url": str(request.url),
            }

        finally:
            # 清理临时文件
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)

    except requests.RequestException as e:
        raise HTTPException(status_code=400, detail=f"无法下载文件: {str(e)}")
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="文件为空或格式不正确")
    except pd.errors.ParserError as e:
        raise HTTPException(status_code=400, detail=f"文件解析错误: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"处理文件时发生错误: {str(e)}")


@router.get("/api/url_info")
async def get_url_info(url: str):
    """获取URL文件信息（不下载完整文件）"""
    try:
        # 发送HEAD请求获取文件信息
        response = requests.head(url, timeout=10)
        response.raise_for_status()

        content_type = response.headers.get("content-type", "")
        content_length = response.headers.get("content-length")

        # 检测文件类型
        url_lower = url.lower()
        if url_lower.endswith(".csv") or "csv" in content_type:
            file_type = "csv"
        elif url_lower.endswith(".json") or "json" in content_type:
            file_type = "json"
        elif url_lower.endswith((".parquet", ".pq")):
            file_type = "parquet"
        elif url_lower.endswith((".xlsx", ".xls")) or "excel" in content_type:
            file_type = "excel"
        else:
            file_type = "unknown"

        return {
            "success": True,
            "file_type": file_type,
            "content_type": content_type,
            "content_length": int(content_length) if content_length else None,
            "url": url,
        }

    except requests.RequestException as e:
        raise HTTPException(status_code=400, detail=f"无法访问URL: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取URL信息时发生错误: {str(e)}")
