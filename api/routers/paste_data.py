import logging
import json
import traceback
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
import pandas as pd
import numpy as np
from pydantic import BaseModel

from core.duckdb_engine import get_db_connection, create_persistent_table
from core.file_datasource_manager import file_datasource_manager
from core.timezone_utils import get_current_time  # 导入时区工具

router = APIRouter()
logger = logging.getLogger(__name__)


class PasteDataRequest(BaseModel):
    table_name: str
    column_names: List[str]
    column_types: List[str]
    data_rows: List[List[str]]
    delimiter: str = ","
    has_header: bool = False


@router.post("/api/paste-data", tags=["Data Sources"])
async def save_paste_data(request: PasteDataRequest):
    """
    保存粘贴的数据到DuckDB
    """
    try:
        logger.info(f"开始处理粘贴数据保存请求，表名: {request.table_name}")

        # 验证输入
        if not request.table_name.strip():
            raise HTTPException(status_code=400, detail="表名不能为空")

        if not request.column_names:
            raise HTTPException(status_code=400, detail="列名不能为空")

        if not request.data_rows:
            raise HTTPException(status_code=400, detail="数据不能为空")

        if len(request.column_names) != len(request.column_types):
            raise HTTPException(status_code=400, detail="列名和列类型数量不匹配")

        # 验证数据行列数一致性
        expected_columns = len(request.column_names)
        for i, row in enumerate(request.data_rows):
            if len(row) != expected_columns:
                raise HTTPException(
                    status_code=400,
                    detail=f"第 {i+1} 行数据列数 ({len(row)}) 与预期列数 ({expected_columns}) 不匹配",
                )

        # 创建DataFrame
        df = pd.DataFrame(request.data_rows, columns=request.column_names)

        # 高级数据清理函数
        def clean_cell_data(series):
            """清理单元格数据，去除引号和多余空格"""
            # 转换为字符串并去除首尾空格
            cleaned = series.astype(str).str.strip()

            # 去除引号包裹（双引号和单引号）
            cleaned = cleaned.str.replace(r'^"(.*)"$', r"\1", regex=True)  # 去除双引号
            cleaned = cleaned.str.replace(r"^'(.*)'$", r"\1", regex=True)  # 去除单引号

            # 再次去除可能的首尾空格
            cleaned = cleaned.str.strip()

            # 处理空字符串和None值
            cleaned = cleaned.replace("", None)
            cleaned = cleaned.replace("null", None)
            cleaned = cleaned.replace("NULL", None)

            return cleaned

        # 数据类型转换
        for i, (col_name, col_type) in enumerate(
            zip(request.column_names, request.column_types)
        ):
            try:
                if col_type == "INTEGER":
                    # 先清理数据
                    df[col_name] = clean_cell_data(df[col_name])
                    # 处理空值并转换为整数
                    df[col_name] = (
                        pd.to_numeric(df[col_name], errors="coerce")
                        .fillna(0)
                        .astype(int)
                    )
                elif col_type == "DOUBLE":
                    # 先清理数据
                    df[col_name] = clean_cell_data(df[col_name])
                    # 转换为浮点数
                    df[col_name] = pd.to_numeric(df[col_name], errors="coerce").fillna(
                        0.0
                    )
                elif col_type == "DATE":
                    # 先清理数据
                    df[col_name] = clean_cell_data(df[col_name])
                    # 转换为日期
                    df[col_name] = pd.to_datetime(df[col_name], errors="coerce")
                elif col_type == "BOOLEAN":
                    # 先清理数据并转换为小写
                    df[col_name] = clean_cell_data(df[col_name]).str.lower()
                    # 布尔值映射
                    df[col_name] = (
                        df[col_name]
                        .map(
                            {
                                "true": True,
                                "false": False,
                                "1": True,
                                "0": False,
                                "yes": True,
                                "no": False,
                                "t": True,
                                "f": False,
                            }
                        )
                        .fillna(False)
                    )
                else:  # VARCHAR
                    # 清理数据但保持为字符串
                    df[col_name] = clean_cell_data(df[col_name])
                    # 将None值转换为空字符串
                    df[col_name] = df[col_name].fillna("")

            except Exception as e:
                logger.warning(f"列 {col_name} 类型转换失败，使用字符串类型: {str(e)}")
                df[col_name] = df[col_name].astype(str).str.strip()

        # 清理表名（移除特殊字符，确保符合SQL标准）
        clean_table_name = "".join(
            c for c in request.table_name if c.isalnum() or c in ("_", "-")
        ).strip()
        if not clean_table_name:
            clean_table_name = (
                f"pasted_table_{pd.Timestamp.now().strftime('%Y%m%d_%H%M%S')}"
            )

        # 保存到DuckDB
        con = get_db_connection()
        success = create_persistent_table(clean_table_name, df, con)

        if not success:
            raise HTTPException(status_code=500, detail="保存数据到DuckDB失败")

        # 验证保存结果
        try:
            result = con.execute(
                f'SELECT COUNT(*) as count FROM "{clean_table_name}"'
            ).fetchone()
            saved_rows = result[0] if result else 0

            if saved_rows != len(df):
                logger.warning(
                    f"保存的行数 ({saved_rows}) 与预期行数 ({len(df)}) 不匹配"
                )
        except Exception as e:
            logger.warning(f"验证保存结果失败: {str(e)}")
            saved_rows = len(df)

        logger.info(
            f"成功保存粘贴数据到表: {clean_table_name}, 行数: {saved_rows}, 列数: {len(request.column_names)}"
        )

        # 使用统一的时区配置
        try:
            from core.timezone_utils import get_current_time_iso

            createdAt = get_current_time_iso()
        except ImportError:
            # 如果无法导入时区工具，使用默认时间
            from datetime import datetime

            createdAt = get_current_time().isoformat()

        # 保存元数据
        try:
            file_info = {
                "source_id": clean_table_name,
                "filename": f"{clean_table_name}.pasted",
                "file_path": "pasted_data",
                "file_type": "pasted",
                "row_count": saved_rows,
                "column_count": len(request.column_names),
                "columns": request.column_names,
                "created_at": createdAt,  # 使用标准的 created_at 字段
            }
            file_datasource_manager.save_file_datasource(file_info)
            logger.info(f"成功保存粘贴数据的元数据: {clean_table_name}")
        except Exception as e:
            logger.warning(f"保存粘贴数据的元数据失败: {str(e)}")

        return {
            "success": True,
            "message": f"数据已成功保存到表: {clean_table_name}",
            "table_name": clean_table_name,
            "rows_saved": saved_rows,
            "columns_count": len(request.column_names),
            "column_info": [
                {"name": name, "type": type_}
                for name, type_ in zip(request.column_names, request.column_types)
            ],
            "created_at": createdAt,  # 使用标准的 created_at 字段
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"保存粘贴数据失败: {str(e)}")
        logger.error(
            f"请求数据: table_name={request.table_name}, columns={len(request.column_names)}, rows={len(request.data_rows)}"
        )
        raise HTTPException(status_code=500, detail=f"保存数据失败: {str(e)}")


@router.get("/api/paste-data/tables", tags=["Data Sources"])
async def get_pasted_tables():
    """
    获取所有通过粘贴创建的表列表
    """
    try:
        con = get_db_connection()

        # 获取所有表
        tables_df = con.execute("SHOW TABLES").fetchdf()

        if tables_df.empty:
            return {"success": True, "tables": []}

        # 获取每个表的详细信息
        table_info = []
        for table_name in tables_df["name"].tolist():
            try:
                # 获取表结构
                schema_df = con.execute(f'DESCRIBE "{table_name}"').fetchdf()
                # 获取行数
                count_result = con.execute(
                    f'SELECT COUNT(*) as count FROM "{table_name}"'
                ).fetchone()
                row_count = count_result[0] if count_result else 0

                table_info.append(
                    {
                        "name": table_name,
                        "columns": len(schema_df),
                        "rows": row_count,
                        "schema": (
                            [{"name": row["column_name"], "type": row["column_type"]} for _, row in schema_df.iterrows()] if not schema_df.empty else []
                        ),
                    }
                )
            except Exception as e:
                logger.warning(f"获取表 {table_name} 信息失败: {str(e)}")
                continue

        return {"success": True, "tables": table_info, "count": len(table_info)}

    except Exception as e:
        logger.error(f"获取粘贴表列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取表列表失败: {str(e)}")


@router.delete("/api/paste-data/tables/{table_name}", tags=["Data Sources"])
async def delete_pasted_table(table_name: str):
    """
    删除指定的粘贴表
    """
    try:
        con = get_db_connection()

        # 检查表是否存在
        tables_df = con.execute("SHOW TABLES").fetchdf()
        if table_name not in tables_df["name"].tolist():
            raise HTTPException(status_code=404, detail=f"表 {table_name} 不存在")

        # 删除表
        con.execute(f'DROP TABLE IF EXISTS "{table_name}"')

        logger.info(f"成功删除表: {table_name}")

        return {"success": True, "message": f"表 {table_name} 已成功删除"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除表 {table_name} 失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除表失败: {str(e)}")


@router.get("/api/paste-data/preview/{table_name}", tags=["Data Sources"])
async def preview_pasted_table(table_name: str, limit: int = 100):
    """
    预览指定粘贴表的数据
    """
    try:
        con = get_db_connection()

        # 检查表是否存在
        tables_df = con.execute("SHOW TABLES").fetchdf()
        if table_name not in tables_df["name"].tolist():
            raise HTTPException(status_code=404, detail=f"表 {table_name} 不存在")

        # 获取表数据
        preview_df = con.execute(
            f'SELECT * FROM "{table_name}" LIMIT {limit}'
        ).fetchdf()

        # 获取表结构
        schema_df = con.execute(f'DESCRIBE "{table_name}"').fetchdf()

        # 获取总行数
        count_result = con.execute(
            f'SELECT COUNT(*) as count FROM "{table_name}"'
        ).fetchone()
        total_rows = count_result[0] if count_result else 0

        return {
            "success": True,
            "table_name": table_name,
            "total_rows": total_rows,
            "preview_rows": len(preview_df),
            "columns": [{"name": row["column_name"], "type": row["column_type"]} for _, row in schema_df.iterrows()] if not schema_df.empty else [],
            "data": preview_df.to_dict("records") if not preview_df.empty else [],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"预览表 {table_name} 失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"预览表失败: {str(e)}")
