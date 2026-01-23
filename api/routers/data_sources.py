# pylint: disable=duplicate-code
"""
File Data Sources API Router

This module handles file uploads and Excel imports.
Database connection endpoints have been moved to datasources.py (unified API).
"""
import logging
import os
import time
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Body,
    File,
    Form,
    HTTPException,
    UploadFile,
)
from pydantic import BaseModel, Field, field_validator, model_validator

from core.common.timezone_utils import get_current_time_iso
from core.data.excel_import_manager import (
    cleanup_pending_excel,
    derive_default_table_name,
    get_pending_excel,
    inspect_excel_sheets,
    load_excel_sheet_dataframe,
    register_excel_upload,
    sanitize_identifier,
)
from core.data.file_datasource_manager import (
    _quote_identifier,
    build_table_metadata_snapshot,
    create_table_from_dataframe,
    file_datasource_manager,
)
from core.data.file_utils import detect_file_type
from core.database.duckdb_engine import with_duckdb_connection
from core.security.security import security_validator
from core.services.resource_manager import save_upload_file, schedule_cleanup
from models.query_models import FileUploadResponse
from utils.response_helpers import (
    MessageCode,
    create_error_response,
    create_list_response,
    create_success_response,
)

router = APIRouter()

logger = logging.getLogger(__name__)


VALID_EXCEL_IMPORT_MODES = {"replace", "append", "fail"}


class ExcelInspectRequest(BaseModel):
    file_id: str = Field(..., description="上传后的Excel文件标识")


class ExcelImportSheet(BaseModel):
    name: str = Field(..., description="工作表名称")
    target_table: str = Field(..., description="目标DuckDB表名")
    mode: str = Field(default="replace", description="导入模式 replace/append/fail")
    header_rows: int = Field(default=1, description="表头行数")
    header_row_index: Optional[int] = Field(
        default=1, description="表头起始行(1-based)"
    )
    fill_merged: bool = Field(default=False, description="是否填充合并单元格")

    @field_validator("mode", mode="before")
    @classmethod
    def _validate_mode(cls, mode: str) -> str:
        normalized = (mode or "").lower()
        if normalized not in VALID_EXCEL_IMPORT_MODES:
            raise ValueError(f"Unsupported import mode: {mode}")
        return normalized

    @field_validator("header_rows")
    @classmethod
    def _validate_header_rows(cls, value: int) -> int:
        if value < 0:
            raise ValueError("Header row count cannot be negative")
        return value

    @field_validator("target_table")
    @classmethod
    def _validate_target_table(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Target table name cannot be empty")
        return value

    @model_validator(mode="after")
    def _normalize_header_row_index(self):
        if self.header_rows == 0:
            self.header_row_index = None
        elif self.header_row_index is None or self.header_row_index <= 0:
            self.header_row_index = 1
        return self


class ExcelImportRequest(BaseModel):
    file_id: str = Field(..., description="上传后的Excel文件标识")
    sheets: List[ExcelImportSheet]

    @field_validator("sheets")
    @classmethod
    def _validate_sheets(cls, sheets: List[ExcelImportSheet]) -> List[ExcelImportSheet]:
        if not sheets:
            raise ValueError("At least one worksheet must be selected for import")
        return sheets


@router.post("/api/upload", tags=["Data Sources"])
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    table_alias: str = Form(None),
) -> Any:
    """上传文件并返回详细信息，支持CSV、Excel、JSON、Parquet格式"""
    try:
        # 读取文件内容
        file_content = await file.read()
        file_size = len(file_content)

        # 重置文件指针
        await file.seek(0)

        # 保存临时文件用于安全验证
        temp_file_path = await save_upload_file(file)

        # 安全验证
        validation_result = security_validator.validate_file_upload(
            temp_file_path, file.filename, file_size
        )

        if not validation_result["valid"]:
            # 清理临时文件
            try:
                os.remove(temp_file_path)
            except:
                pass
            raise HTTPException(
                status_code=400,
                detail=f"File validation failed: {'; '.join(validation_result['errors'])}",
            )

        # Log warnings
        if validation_result["warnings"]:
            logger.warning(
                f"File upload warning {file.filename}: {'; '.join(validation_result['warnings'])}"
            )

        # 检查文件类型
        file_type = detect_file_type(file.filename)
        if file_type == "unknown":
            try:
                os.remove(temp_file_path)
            except:
                pass
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Supported formats: CSV, Excel, JSON, Parquet",
            )

        # 创建临时目录
        temp_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "temp_files"
        )
        os.makedirs(temp_dir, exist_ok=True)

        # 保存文件
        save_path = os.path.join(temp_dir, file.filename)
        with open(save_path, "wb") as f:
            f.write(file_content)

        # 获取文件预览信息
        from core.data.file_utils import get_file_preview

        if file_type == "excel":
            pending_excel = register_excel_upload(save_path, file.filename, table_alias)

            try:
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
            except Exception as e:
                logger.warning(f"Failed to delete temporary file: {str(e)}")

            pending_dir = Path(pending_excel.stored_path).parent
            schedule_cleanup(str(pending_dir), background_tasks, delay_seconds=6 * 3600)

            logger.info(
                "Excel file uploaded successfully, waiting for sheet selection: %s (%s)",
                pending_excel.original_filename,
                pending_excel.file_id,
            )

            return create_success_response(
                data={
                    "file_type": "excel",
                    "requires_sheet_selection": True,
                    "pending_excel": {
                        "file_id": pending_excel.file_id,
                        "original_filename": pending_excel.original_filename,
                        "file_size": pending_excel.file_size,
                        "table_alias": pending_excel.table_alias,
                        "uploaded_at": pending_excel.uploaded_at,
                        "default_table_prefix": pending_excel.default_table_prefix,
                    },
                },
                message_code=MessageCode.FILE_UPLOADED,
                message="Excel file uploaded, please select the worksheets to import.",
            )

        preview_info = get_file_preview(save_path, rows=10)

        source_id = table_alias if table_alias else file.filename.split(".")[0]
        source_id = sanitize_identifier(
            source_id, allow_leading_digit=bool(table_alias), prefix="table"
        )

        if not source_id:
            source_id = f"table_{int(time.time())}"

        original_source_id = source_id

        with with_duckdb_connection() as duckdb_con:
            while True:
                try:
                    result = duckdb_con.execute(
                        "SELECT table_name FROM information_schema.tables WHERE table_name = ?",
                        [source_id],
                    ).fetchone()
                    if result is None:
                        break
                    timestamp = time.strftime("%Y%m%d%H%M", time.localtime())
                    source_id = f"{original_source_id}_{timestamp}"
                    break
                except Exception as e:
                    logger.warning(f"Error checking table name: {e}")
                    break

            try:
                table_metadata = create_table_from_dataframe(
                    duckdb_con, source_id, save_path, file_type
                )
            except Exception as e:
                raise HTTPException(
                    status_code=500, detail=f"Failed to persist to DuckDB: {str(e)}"
                )

        row_count = table_metadata.get("row_count", 0)
        column_count = table_metadata.get("column_count", 0)
        columns = table_metadata.get("columns", [])
        column_profiles = table_metadata.get("column_profiles", [])

        file_info = {
            "source_id": source_id,
            "filename": file.filename,
            "file_path": save_path,
            "file_type": file_type,
            "row_count": row_count,
            "column_count": column_count,
            "columns": columns,
            "column_profiles": column_profiles,
            "schema_version": 2,
            "created_at": get_current_time_iso(),
        }

        config_saved = file_datasource_manager.save_file_datasource(file_info)
        if not config_saved:
            logger.warning(f"Failed to save file datasource configuration: {source_id}")

        logger.info(
            f"File {file.filename} persisted to DuckDB, table: {source_id}, rows: {row_count}"
        )

        try:
            if os.path.exists(save_path):
                os.remove(save_path)
        except Exception as e:
            logger.warning(f"Failed to delete original uploaded file: {str(e)}")

        try:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
        except Exception as e:
            logger.warning(f"Failed to delete temporary file: {str(e)}")

        schedule_cleanup(save_path, background_tasks)

        return FileUploadResponse(
            success=True,
            file_id=source_id,
            filename=file.filename,
            file_size=preview_info["file_size"],
            columns=preview_info["columns"],
            row_count=preview_info["total_rows"],
            preview_data=preview_info["preview_data"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File upload processing failed: {str(e)}")
        logger.error(f"Stack trace: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"File upload processing failed: {str(e)}")


def _table_exists(con, table_name: str) -> bool:
    try:
        result = con.execute(
            "SELECT 1 FROM information_schema.tables WHERE lower(table_name) = lower(?)",
            [table_name],
        ).fetchone()
        return result is not None
    except Exception:
        return False


def _fetch_existing_columns(con, table_name: str) -> List[str]:
    rows = con.execute(f"PRAGMA table_info({_quote_identifier(table_name)})").fetchall()
    return [row[1] for row in rows]


@router.post("/api/data-sources/excel/inspect", tags=["Data Sources"])
async def inspect_excel(request: ExcelInspectRequest):
    """检查Excel文件的工作表信息"""
    pending = get_pending_excel(request.file_id)
    if not pending:
        raise HTTPException(
            status_code=404,
            detail=f"Excel file not found or expired: {request.file_id}",
        )

    try:
        sheets_info = inspect_excel_sheets(pending.stored_path)
        return create_success_response(
            data={
                "file_id": pending.file_id,
                "original_filename": pending.original_filename,
                "table_alias": pending.table_alias,
                "sheets": sheets_info,
            },
            message_code=MessageCode.EXCEL_SHEETS_INSPECTED,
        )
    except Exception as e:
        logger.error(f"Failed to inspect Excel file: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to read Excel file: {str(e)}"
        )


@router.post("/api/data-sources/excel/import", tags=["Data Sources"])
async def import_excel(request: ExcelImportRequest):
    """导入Excel工作表到DuckDB"""
    pending = get_pending_excel(request.file_id)
    if not pending:
        raise HTTPException(
            status_code=404,
            detail=f"Excel file not found or expired: {request.file_id}",
        )

    processed_results = []
    try:
        with with_duckdb_connection() as duckdb_con:
            for sheet_config in request.sheets:
                try:
                    target_table = sanitize_identifier(
                        sheet_config.target_table,
                        allow_leading_digit=True,
                        prefix="table",
                    )

                    exists = _table_exists(duckdb_con, target_table)
                    mode = sheet_config.mode.lower()
                    if exists and mode == "fail":
                        processed_results.append({
                            "sheet_name": sheet_config.name,
                            "target_table": target_table,
                            "success": False,
                            "message": f"Table {target_table} already exists",
                        })
                        continue

                    effective_header_row = (
                        None if sheet_config.header_rows == 0 else sheet_config.header_row_index
                    )
                    df = load_excel_sheet_dataframe(
                        pending.stored_path,
                        sheet_config.name,
                        header_row_index=effective_header_row,
                        fill_merged=sheet_config.fill_merged,
                    )

                    if df.empty:
                        processed_results.append({
                            "sheet_name": sheet_config.name,
                            "target_table": target_table,
                            "success": False,
                            "message": f"Sheet '{sheet_config.name}' contains no data",
                        })
                        continue

                    quoted = _quote_identifier(target_table)

                    if exists and mode == "append":
                        existing_cols = _fetch_existing_columns(duckdb_con, target_table)
                        insert_cols = [c for c in df.columns if c in existing_cols]
                        if not insert_cols:
                            processed_results.append({
                                "sheet_name": sheet_config.name,
                                "target_table": target_table,
                                "success": False,
                                "message": "No overlapping columns between sheet and existing table",
                            })
                            continue
                        df_insert = df[insert_cols]
                        temp_view = f"__excel_tmp_{uuid4().hex}"
                        duckdb_con.register(temp_view, df_insert)
                        cols_list = ", ".join(_quote_identifier(c) for c in insert_cols)
                        insert_sql = f"INSERT INTO {quoted} ({cols_list}) SELECT {cols_list} FROM {temp_view}"
                        duckdb_con.execute(insert_sql)
                        duckdb_con.unregister(temp_view)
                        row_count = len(df_insert)
                    else:
                        if exists and mode == "replace":
                            duckdb_con.execute(f"DROP TABLE IF EXISTS {quoted}")
                        # Create table from DataFrame directly
                        temp_view = f"__excel_tmp_{uuid4().hex}"
                        duckdb_con.register(temp_view, df)
                        duckdb_con.execute(f"CREATE TABLE {quoted} AS SELECT * FROM {temp_view}")
                        duckdb_con.unregister(temp_view)
                        row_count = len(df)

                    file_info = {
                        "source_id": target_table,
                        "filename": pending.original_filename,
                        "file_path": pending.stored_path,
                        "file_type": "excel",
                        "sheet_name": sheet_config.name,
                        "row_count": row_count,
                        "column_count": len(df.columns),
                        "columns": list(df.columns),
                        "schema_version": 2,
                        "created_at": get_current_time_iso(),
                    }
                    file_datasource_manager.save_file_datasource(file_info)

                    processed_results.append({
                        "sheet_name": sheet_config.name,
                        "target_table": target_table,
                        "success": True,
                        "row_count": row_count,
                        "column_count": len(df.columns),
                        "mode": mode,
                    })

                except Exception as sheet_error:
                    logger.error(f"Failed to import sheet {sheet_config.name}: {sheet_error}")
                    processed_results.append({
                        "sheet_name": sheet_config.name,
                        "target_table": sheet_config.target_table,
                        "success": False,
                        "message": str(sheet_error),
                    })

    except Exception as e:
        logger.error(f"Excel import failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Excel import failed: {str(e)}")

    finally:
        cleanup_pending_excel(request.file_id)

    return create_success_response(
        data={
            "file_id": pending.file_id,
            "results": processed_results,
        },
        message_code=MessageCode.EXCEL_SHEETS_IMPORTED,
    )
