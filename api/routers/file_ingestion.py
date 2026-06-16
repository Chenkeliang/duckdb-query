# pylint: disable=duplicate-code
"""
文件入湖路由（本地上传 + Excel）。

- 路径：`/api/upload`、`/api/data-sources/excel/*`
- 与 `datasources.py`（`/api/datasources/*` 连接/列表 CRUD）职责不同，勿合并单文件。
"""
import logging
import os
import time
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Body,
    File,
    Form,
    UploadFile,
)
from pydantic import BaseModel, Field, field_validator, model_validator

from core.common.paths import get_temp_dir
from core.common.timezone_utils import get_current_time_iso
from core.data.excel_import_manager import _get_pending_base_dir
from core.data.file_datasource_manager import build_table_metadata_snapshot
from core.data.file_utils import detect_file_type
from core.data.import_mode import normalize_import_mode
from core.database.duckdb_engine import with_duckdb_connection
from core.services.file_ingestion_service import (
    import_pending_excel_sheets,
    ingest_tabular_file,
    inspect_pending_excel,
    prepare_excel_pending,
)
from core.common.exceptions import (
    BaseAPIException,
    SecurityError,
    ValidationError as APIValidationError,
)
from core.security.security import security_validator
from core.services.resource_manager import save_upload_file, schedule_cleanup
from models.query_models import FileUploadResponse
from utils.response_helpers import (
    MessageCode,
    create_error_response,
    create_list_response,
    create_success_response,
    error_json_response,
)

router = APIRouter()

logger = logging.getLogger(__name__)


VALID_EXCEL_IMPORT_MODES = {"replace", "append", "fail"}
VALID_CELL_IMPORT_MODES = {"auto", "literal"}


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
    import_mode: str = Field(
        default="auto",
        description="auto=先文本再安全定型; literal=全部VARCHAR",
    )

    @field_validator("import_mode", mode="before")
    @classmethod
    def _validate_import_mode(cls, value: str) -> str:
        normalized = (value or "auto").strip().lower()
        if normalized not in VALID_CELL_IMPORT_MODES:
            raise ValueError("import_mode must be auto or literal")
        return normalized

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
    import_mode: str = Form("auto"),
    csv_delimiter: Optional[str] = Form(None),
    csv_has_header: Optional[bool] = Form(None),
    csv_encoding: Optional[str] = Form(None),
) -> Any:
    """上传文件并返回详细信息，支持CSV、Excel、JSON、Parquet格式"""
    try:
        try:
            normalize_import_mode(import_mode)
        except ValueError as exc:
            raise APIValidationError(str(exc), details={"field": "import_mode"}) from exc

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
            raise SecurityError(
                f"File validation failed: {'; '.join(validation_result['errors'])}",
                details={"errors": validation_result["errors"]},
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
            raise BaseAPIException(
                message="Unsupported file type. Supported formats: CSV, Excel, JSON, Parquet",
                status_code=400,
                error_code=MessageCode.FILE_TYPE_NOT_SUPPORTED.value,
            )

        # 创建临时目录
        temp_dir = str(get_temp_dir())
        os.makedirs(temp_dir, exist_ok=True)

        # 保存文件
        save_path = os.path.join(temp_dir, file.filename)
        with open(save_path, "wb") as f:
            f.write(file_content)

        # 获取文件预览信息
        from core.data.file_utils import get_file_preview

        if file_type == "excel":
            pending_payload = prepare_excel_pending(
                save_path, file.filename, table_alias
            )

            try:
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
            except Exception as e:
                logger.warning(f"Failed to delete temporary file: {str(e)}")

            pending_dir = _get_pending_base_dir() / pending_payload.file_id
            schedule_cleanup(str(pending_dir), background_tasks, delay_seconds=6 * 3600)

            logger.info(
                "Excel file uploaded successfully, waiting for sheet selection: %s (%s)",
                pending_payload.original_filename,
                pending_payload.file_id,
            )

            return create_success_response(
                data={
                    "file_type": "excel",
                    "requires_sheet_selection": True,
                    "pending_excel": pending_payload.to_api_dict(),
                },
                message_code=MessageCode.FILE_UPLOADED,
                message="Excel file uploaded, please select the worksheets to import.",
            )

        preview_info = get_file_preview(save_path, rows=10)

        # Build reader_options for CSV files only
        reader_options: Optional[Dict[str, Any]] = None
        if file_type == "csv":
            opts: Dict[str, Any] = {}
            if csv_delimiter is not None:
                opts["delim"] = csv_delimiter
            if csv_has_header is not None:
                opts["HEADER"] = csv_has_header  # uppercase to override default
            if csv_encoding is not None:
                opts["encoding"] = csv_encoding
            if opts:
                reader_options = opts

        with with_duckdb_connection() as duckdb_con:
            try:
                ingest_result = ingest_tabular_file(
                    duckdb_con,
                    save_path,
                    file_type,
                    table_alias,
                    import_mode=import_mode,
                    filename_for_meta=file.filename,
                    persist_path=save_path,
                    reader_options=reader_options,
                )
            except Exception as e:
                return error_json_response(
                    500,
                    MessageCode.EXCEL_IMPORT_FAILED,
                    f"Failed to persist to DuckDB: {str(e)}",
                    details={"filename": file.filename},
                )

        source_id = ingest_result.table_name
        row_count = ingest_result.row_count
        column_count = ingest_result.column_count
        columns = ingest_result.columns

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

    except BaseAPIException:
        raise
    except Exception as e:
        logger.error(f"File upload processing failed: {str(e)}")
        logger.error(f"Stack trace: {traceback.format_exc()}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"File upload processing failed: {str(e)}",
        )


@router.post("/api/data-sources/excel/inspect", tags=["Data Sources"])
async def inspect_excel(request: ExcelInspectRequest):
    """检查Excel文件的工作表信息"""
    try:
        data = inspect_pending_excel(request.file_id)
        return create_success_response(
            data=data,
            message_code=MessageCode.EXCEL_SHEETS_INSPECTED,
        )
    except ValueError as e:
        raise BaseAPIException(
            message=str(e),
            status_code=404,
            error_code=MessageCode.FILE_NOT_FOUND.value,
            details={"file_id": request.file_id},
        ) from e
    except Exception as e:
        logger.error(f"Failed to inspect Excel file: {str(e)}")
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to read Excel file: {str(e)}",
            details={"file_id": request.file_id},
        )


@router.post("/api/data-sources/excel/import", tags=["Data Sources"])
async def import_excel(request: ExcelImportRequest):
    """导入Excel工作表到DuckDB"""
    try:
        with with_duckdb_connection() as duckdb_con:
            processed_results = import_pending_excel_sheets(
                duckdb_con,
                request.file_id,
                request.sheets,
                import_mode=request.import_mode,
            )
    except ValueError as e:
        raise BaseAPIException(
            message=str(e),
            status_code=404,
            error_code=MessageCode.FILE_NOT_FOUND.value,
            details={"file_id": request.file_id},
        ) from e
    except Exception as e:
        logger.error(f"Excel import failed: {str(e)}")
        return error_json_response(
            500,
            MessageCode.EXCEL_IMPORT_FAILED,
            f"Excel import failed: {str(e)}",
            details={"file_id": request.file_id},
        )

    return create_success_response(
        data={
            "file_id": request.file_id,
            "results": processed_results,
        },
        message_code=MessageCode.EXCEL_SHEETS_IMPORTED,
    )
