# pylint: disable=duplicate-code
"""
分块文件上传路由
支持大文件上传，带进度显示和断点续传
"""

import asyncio
import os
import hashlib
import logging
import traceback
import time
import threading
import shutil
import uuid
from typing import Dict, Any, Optional
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks
from pydantic import BaseModel

from core.common.exceptions import (
    BaseAPIException,
    QueryExecutionError,
    ResourceNotFoundError,
    ValidationError as APIValidationError,
)
from core.common.config_manager import config_manager
from core.common.paths import get_temp_dir
from core.database.duckdb_engine import with_duckdb_connection
from core.data.excel_import_manager import sanitize_identifier
from core.data.file_datasource_manager import (
    create_table_from_file,
    file_datasource_manager,
)
from core.data.import_mode import normalize_import_mode
from core.services.file_ingestion_service import (
    ingest_tabular_file,
    prepare_excel_pending,
)
from core.services.resource_manager import schedule_cleanup
from core.common.timezone_utils import get_current_time_iso  # 统一时间
from utils.response_helpers import (
    create_success_response,
    MessageCode,
    error_json_response,
)

logger = logging.getLogger(__name__)
router = APIRouter()


STREAMABLE_FILE_TYPES = {"csv", "json", "jsonl"}
STREAM_CHUNK_SIZE = 1024 * 1024  # 1MB 内部流式写入块
# 会话空闲超时:超过该时长无任何分块活动即视为废弃(与任务产物 24h 回收口径一致)。
# 活跃会话每收到一个分块都会刷新 last_activity_ts,慢速上传不受影响。
UPLOAD_SESSION_TTL_SECONDS = 24 * 3600


class ChunkUploadRequest(BaseModel):
    """分块上传请求模型"""

    chunk_number: int
    total_chunks: int
    file_name: str
    file_size: int
    chunk_size: int
    file_hash: str = None  # 文件MD5哈希，用于验证


class UploadStatus(BaseModel):
    """上传状态模型"""

    upload_id: str
    file_name: str
    total_chunks: int
    uploaded_chunks: int
    progress: float
    status: str  # 'uploading', 'completed', 'failed', 'processing'
    file_size: int
    created_at: str
    error_message: str = None


# 全局上传状态存储
upload_sessions: Dict[str, Dict[str, Any]] = {}
upload_sessions_lock = threading.RLock()


def _acquire_upload_session(upload_id: str) -> Dict[str, Any]:
    """原子取得会话并登记进行中的请求，防止回收线程并发删除。"""
    with upload_sessions_lock:
        session = upload_sessions.get(upload_id)
        if session is None:
            raise ResourceNotFoundError("Upload session", upload_id)
        session["active_operations"] = session.get("active_operations", 0) + 1
        session["last_activity_ts"] = time.time()
        return session


def _release_upload_session(
    upload_id: str, session: Dict[str, Any]
) -> Optional[str]:
    """释放进行中的请求；取消期间的文件清理延后到最后一个请求退出。"""
    cleanup_dir = None
    with upload_sessions_lock:
        if upload_sessions.get(upload_id) is not session:
            return None
        active = max(0, session.get("active_operations", 1) - 1)
        session["active_operations"] = active
        session["last_activity_ts"] = time.time()
        if active == 0 and session.get("cancel_requested"):
            upload_sessions.pop(upload_id, None)
            cleanup_dir = session.get("chunks_dir")

    return cleanup_dir


def _is_streaming_supported(file_extension: str) -> bool:
    return hasattr(os, "mkfifo") and file_extension.lower() in STREAMABLE_FILE_TYPES


def _build_chunk_path(session: Dict[str, Any], chunk_number: int) -> str:
    return os.path.join(session["chunks_dir"], f"chunk_{chunk_number:06d}")


class ChunkStreamWriter:
    """将分块数据同时写入最终文件并流向FIFO供DuckDB读取"""

    def __init__(self, session: Dict[str, Any], fifo_path: str, final_file_path: str):
        self.session = session
        self.fifo_path = fifo_path
        self.final_file_path = final_file_path
        self._stop_event = threading.Event()
        self._thread = threading.Thread(target=self._run, name=f"ChunkStream-{session['upload_id']}")
        self.error: Optional[Exception] = None

    def start(self):
        self._thread.start()

    def stop(self):
        self._stop_event.set()

    def wait(self):
        if self._thread.is_alive():
            self._thread.join()

    def _run(self):
        try:
            os.makedirs(os.path.dirname(self.final_file_path), exist_ok=True)
            if os.path.exists(self.final_file_path):
                os.unlink(self.final_file_path)
            with open(self.final_file_path, "wb") as final_file:
                with open(self.fifo_path, "wb") as fifo:
                    for chunk_num in range(self.session["total_chunks"]):
                        if self._stop_event.is_set():
                            break
                        chunk_path = _build_chunk_path(self.session, chunk_num)
                        if not os.path.exists(chunk_path):
                            raise FileNotFoundError(f"Missing chunk file: {chunk_path}")

                        with open(chunk_path, "rb") as chunk_file:
                            while True:
                                data = chunk_file.read(STREAM_CHUNK_SIZE)
                                if not data:
                                    break
                                final_file.write(data)
                                fifo.write(data)

                        try:
                            os.unlink(chunk_path)
                        except FileNotFoundError:
                            pass

                # FIFO读取完成后由DuckDB关闭，我们负责回收文件
        except BrokenPipeError as exc:
            self.error = exc
        except Exception as exc:  # pylint: disable=broad-exception-caught
            self.error = exc
        finally:
            try:
                os.unlink(self.fifo_path)
            except FileNotFoundError:
                pass


def _generate_unique_table_name(con, desired_name: Optional[str], user_provided: bool = False) -> str:
    base_name = desired_name if desired_name else ""
    if not base_name:
        base_name = "table"

    # 如果用户明确提供了表名，尊重用户输入（允许数字开头）
    sanitized = sanitize_identifier(base_name, allow_leading_digit=user_provided, prefix="table")
    if not sanitized:
        sanitized = f"table_{int(time.time())}"

    original = sanitized
    while True:
        try:
            result = con.execute(
                "SELECT 1 FROM information_schema.tables WHERE lower(table_name) = lower(?)",
                [sanitized],
            ).fetchone()
            if result is None:
                break
            timestamp = time.strftime("%Y%m%d%H%M", time.localtime())
            sanitized = f"{original}_{timestamp}"
            break
        except Exception as exc:  # pylint: disable=broad-exception-caught
            logger.debug("Failed to check table name conflict: %s", exc)
            break

    return sanitized


def get_upload_dir() -> str:
    """获取上传目录"""
    upload_dir = os.path.join(str(get_temp_dir()), "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    return upload_dir


def _is_safe_basename(file_name: str) -> bool:
    """file_name 是否为安全的纯文件名(无目录分隔 / .. / NUL)。"""
    if not file_name or file_name in (".", ".."):
        return False
    if any(ch in file_name for ch in ("/", "\\", "\x00")):
        return False
    return os.path.basename(file_name) == file_name


def _get_final_file_path(file_name: str) -> str:
    base_dir = os.path.dirname(get_upload_dir())
    os.makedirs(base_dir, exist_ok=True)
    # 纵深防御:只取末段文件名,并断言归一化后仍落在 base_dir 内
    safe_name = os.path.basename(file_name)
    final = os.path.join(base_dir, safe_name)
    base_real = os.path.realpath(base_dir)
    if os.path.commonpath([os.path.realpath(final), base_real]) != base_real:
        raise APIValidationError("Resolved upload path escapes the upload directory")
    return final


def get_chunks_dir(upload_id: str) -> str:
    """获取分块存储目录"""
    chunks_dir = os.path.join(get_upload_dir(), "chunks", upload_id)
    os.makedirs(chunks_dir, exist_ok=True)
    return chunks_dir


def reap_stale_upload_sessions(
    ttl_seconds: int = UPLOAD_SESSION_TTL_SECONDS,
) -> int:
    """回收废弃的分块上传:超时无活动的内存会话 + 进程重启后遗留的孤儿分块目录。

    此前中断的上传(关标签页/断网)会把会话条目和 chunk 文件永久留下;
    进程重启后 upload_sessions 清空,磁盘上的 chunk 目录更是无人认领。
    由 cleanup_scheduler 周期调用(启动即执行一次,覆盖重启遗留)。
    返回回收的会话/目录数量。
    """
    now = time.time()
    removed = 0

    stale_sessions = []
    with upload_sessions_lock:
        for upload_id, session in list(upload_sessions.items()):
            last_activity = session.get("last_activity_ts", 0)
            if (
                now - last_activity < ttl_seconds
                or session.get("active_operations", 0) > 0
            ):
                continue
            # 锁内摘除即完成认领：后到请求只能得到 404，不会先成功再被删。
            if upload_sessions.pop(upload_id, None) is session:
                stale_sessions.append((upload_id, session))

    for upload_id, session in stale_sessions:
        chunks_dir = session.get("chunks_dir")
        if chunks_dir and os.path.isdir(chunks_dir):
            shutil.rmtree(chunks_dir, ignore_errors=True)
        removed += 1
        logger.info(
            "Reaped stale upload session: %s (file: %s, status: %s)",
            upload_id, session.get("file_name"), session.get("status"),
        )

    # 磁盘孤儿:chunks 根目录下不属于任何在册会话的子目录(通常来自进程重启)。
    # 目录 mtime 随块文件写入更新,足以作为活跃信号。
    chunks_base = os.path.join(get_upload_dir(), "chunks")
    if os.path.isdir(chunks_base):
        for entry in os.scandir(chunks_base):
            with upload_sessions_lock:
                session_exists = entry.name in upload_sessions
            if not entry.is_dir() or session_exists:
                continue
            try:
                stale = now - entry.stat().st_mtime >= ttl_seconds
            except OSError:
                continue
            if stale:
                shutil.rmtree(entry.path, ignore_errors=True)
                removed += 1
                logger.info("Reaped orphan chunks dir: %s", entry.path)

    return removed


def calculate_file_hash(file_path: str) -> str:
    """计算文件MD5哈希"""
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()


async def process_streaming_upload(
    session: Dict[str, Any],
):
    """通过FIFO流式写入DuckDB，适用于CSV/JSON/JSONL"""
    fifo_path = os.path.join(session["chunks_dir"], f"stream_{session['upload_id']}.fifo")
    try:
        if os.path.exists(fifo_path):
            os.unlink(fifo_path)
        os.mkfifo(fifo_path)
    except Exception as exc:
        logger.error("Failed to create FIFO: %s", exc)
        raise QueryExecutionError("Unable to create streaming upload channel") from exc

    final_file_path = _get_final_file_path(session["file_name"])
    writer = ChunkStreamWriter(session, fifo_path, final_file_path)
    writer.start()

    try:
        file_info = _load_stream_into_duckdb(session, fifo_path, final_file_path)
    except Exception:
        writer.stop()
        writer.wait()
        raise

    writer.wait()
    if writer.error:
        raise QueryExecutionError(f"Streaming write failed: {writer.error}")

    if session.get("file_hash"):
        actual_hash = calculate_file_hash(final_file_path)
        if actual_hash != session["file_hash"]:
            raise APIValidationError("File hash verification failed, file may be corrupted")

    try:
        file_size = os.path.getsize(final_file_path)
    except OSError:
        file_size = session.get("file_size", 0)

    file_info["file_size"] = file_size
    file_info["cleanup_path"] = final_file_path
    return file_info


def _load_stream_into_duckdb(
    session: Dict[str, Any], fifo_path: str, final_file_path: str
) -> Dict[str, Any]:
    file_extension = session.get("file_extension") or session["file_name"].lower().split(".")[-1]
    with with_duckdb_connection() as con:
        desired_name = session.get("table_alias") or session["file_name"].split(".")[0]
        source_id = _generate_unique_table_name(con, desired_name)

        # Build reader_options from session CSV fields (streaming path; CSV only)
        _stream_csv_opts: Dict[str, Any] = {}
        if file_extension == "csv":
            if session.get("csv_delimiter") is not None:
                _stream_csv_opts["delim"] = session["csv_delimiter"]
            if session.get("csv_has_header") is not None:
                _stream_csv_opts["HEADER"] = session["csv_has_header"]
            if session.get("csv_encoding") is not None:
                _stream_csv_opts["encoding"] = session["csv_encoding"]

        metadata = create_table_from_file(
            con,
            source_id,
            fifo_path,
            file_extension,
            import_mode=session.get("import_mode", "auto"),
            reader_options=_stream_csv_opts or None,
        )

        table_metadata = {
            "source_id": source_id,
            "filename": session["file_name"],
            "file_path": final_file_path,
            "file_type": file_extension,
            "row_count": metadata.get("row_count", 0),
            "column_count": metadata.get("column_count", 0),
            "columns": metadata.get("columns", []),
            "column_profiles": metadata.get("column_profiles", []),
            "schema_version": 2,
            "created_at": get_current_time_iso(),
        }

        file_datasource_manager.save_file_datasource(table_metadata)
        logger.info("Streaming file datasource saved successfully: %s", source_id)

        return {
            "source_id": source_id,
            "filename": session["file_name"],
            "file_size": 0,
            "row_count": metadata.get("row_count", 0),
            "column_count": metadata.get("column_count", 0),
            "columns": metadata.get("columns", []),
            "preview_data": [{"提示": "预览数据已禁用以提高性能"}],
        }


@router.post("/api/upload/init", tags=["Chunked Upload"])
async def init_upload(
    file_name: str = Form(...),
    file_size: int = Form(...),
    chunk_size: int = Form(default=1024 * 1024),  # 默认1MB分块
    file_hash: str = Form(default=None),
    table_alias: str = Form(default=None),  # 表别名支持
    import_mode: str = Form(default="auto"),
    csv_delimiter: Optional[str] = Form(default=None),
    csv_has_header: Optional[bool] = Form(default=None),
    csv_encoding: Optional[str] = Form(default=None),
):
    """
    初始化分块上传

    Args:
        file_name: 文件名
        file_size: 文件总大小
        chunk_size: 分块大小
        file_hash: 文件MD5哈希（可选）
        table_alias: 表别名（可选）
    """
    try:
        try:
            normalize_import_mode(import_mode)
        except ValueError as exc:
            raise APIValidationError(str(exc)) from exc

        # 拒绝路径穿越:file_name 必须是纯文件名——否则最终落盘路径可 ../../
        # 越出上传目录写任意文件
        if not _is_safe_basename(file_name):
            raise APIValidationError("Invalid file name: path components are not allowed")

        # 从配置中获取文件大小限制
        app_config = config_manager.get_app_config()
        if file_size <= 0:
            raise APIValidationError("Invalid file_size")
        if file_size > app_config.max_file_size:
            max_file_size_mb = app_config.max_file_size / 1024 / 1024
            return error_json_response(
                413,
                MessageCode.FILE_TOO_LARGE,
                f"File too large, maximum supported {max_file_size_mb:.0f}MB. Current file size: {file_size / 1024 / 1024:.1f}MB",
            )

        # 检查文件类型
        file_extension = file_name.lower().split(".")[-1]
        supported_formats = ["csv", "xlsx", "xls", "json", "jsonl", "parquet", "pq"]

        if file_extension not in supported_formats:
            raise APIValidationError(
                f"Unsupported file format. Supported formats: {', '.join(supported_formats)}"
            )

        # 生成上传ID
        upload_id = str(uuid.uuid4())

        # 计算总分块数
        total_chunks = (file_size + chunk_size - 1) // chunk_size

        # 创建上传会话
        session = {
            "upload_id": upload_id,
            "file_name": file_name,
            "file_size": file_size,
            "chunk_size": chunk_size,
            "total_chunks": total_chunks,
            "uploaded_chunks": 0,
            "uploaded_chunk_numbers": set(),
            "status": "uploading",
            "active_operations": 0,
            "created_at": get_current_time_iso(),
            "last_activity_ts": time.time(),
            "file_hash": file_hash,
            "table_alias": table_alias,  # 保存表别名
            "import_mode": import_mode,
            "csv_delimiter": csv_delimiter,
            "csv_has_header": csv_has_header,
            "csv_encoding": csv_encoding,
            "chunks_dir": get_chunks_dir(upload_id),
            "file_extension": file_extension,
        }
        with upload_sessions_lock:
            upload_sessions[upload_id] = session

        logger.info(
            "Initialized upload session: %s, file: %s, size: %d, chunks: %d",
            upload_id, file_name, file_size, total_chunks
        )

        return create_success_response(
            data={
                "upload_id": upload_id,
                "total_chunks": total_chunks,
                "chunk_size": chunk_size,
            },
            message_code=MessageCode.CHUNKED_UPLOAD_INIT,
            message="Upload session initialized successfully",
        )

    except BaseAPIException:
        raise
    except Exception as e:
        logger.error("Failed to initialize upload: %s", e)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to initialize upload: {str(e)}",
        )


@router.post("/api/upload/chunk", tags=["Chunked Upload"])
async def upload_chunk(
    upload_id: str = Form(...),
    chunk_number: int = Form(...),
    chunk: UploadFile = File(...),
):
    """
    上传文件分块

    Args:
        upload_id: 上传会话ID
        chunk_number: 分块编号（从0开始）
        chunk: 分块文件数据
    """
    session = None
    try:
        session = _acquire_upload_session(upload_id)

        if session["status"] != "uploading":
            raise APIValidationError(f"Upload session status error: {session['status']}")

        if chunk_number < 0 or chunk_number >= session["total_chunks"]:
            raise APIValidationError(
                f"Invalid chunk number: {chunk_number}, total chunks: {session['total_chunks']}"
            )

        # 检查分块是否已上传
        if chunk_number in session["uploaded_chunk_numbers"]:
            return create_success_response(
                data={
                    "chunk_number": chunk_number,
                    "progress": len(session["uploaded_chunk_numbers"])
                    / session["total_chunks"]
                    * 100,
                },
                message_code=MessageCode.CHUNKED_UPLOAD_CHUNK,
                message=f"Chunk {chunk_number} already exists, skipping upload",
            )

        # 保存分块
        chunk_path = _build_chunk_path(session, chunk_number)
        # 有界读:至多读 chunk_size+1 字节,超限块不必先把整块灌进内存才发现
        # (Starlette 已把 multipart part spool 到临时文件,这里封顶本层的分配)
        max_chunk = session["chunk_size"]
        chunk_content = await chunk.read(max_chunk + 1)

        # 单块不得超过声明的 chunk_size(末块可更小);累计不得超过声明的
        # file_size——否则可声明小文件却分块灌入超大数据,绕过 init 的大小门
        if len(chunk_content) > max_chunk:
            raise APIValidationError(
                f"Chunk {chunk_number} exceeds declared chunk size "
                f"({len(chunk_content)} > {session['chunk_size']})"
            )
        session["received_bytes"] = session.get("received_bytes", 0) + len(chunk_content)
        if session["received_bytes"] > session["file_size"]:
            raise APIValidationError("Cumulative upload exceeds declared file size")

        with open(chunk_path, "wb") as f:
            f.write(chunk_content)

        # 更新会话状态
        session["uploaded_chunk_numbers"].add(chunk_number)
        session["uploaded_chunks"] = len(session["uploaded_chunk_numbers"])

        progress = session["uploaded_chunks"] / session["total_chunks"] * 100

        logger.info(
            "Uploaded chunk %d/%d, progress: %.1f%%",
            chunk_number, session['total_chunks'], progress
        )

        return create_success_response(
            data={
                "chunk_number": chunk_number,
                "uploaded_chunks": session["uploaded_chunks"],
                "total_chunks": session["total_chunks"],
                "progress": progress,
            },
            message_code=MessageCode.CHUNKED_UPLOAD_CHUNK,
            message=f"Chunk {chunk_number} uploaded successfully",
        )

    except BaseAPIException:
        raise
    except Exception as e:
        logger.error("Failed to upload chunk: %s", e)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to upload chunk: {str(e)}",
        )
    finally:
        if session is not None:
            cleanup_dir = _release_upload_session(upload_id, session)
            if cleanup_dir:
                await asyncio.to_thread(
                    shutil.rmtree, cleanup_dir, ignore_errors=True
                )


@router.post("/api/upload/complete", tags=["Chunked Upload"])
async def complete_upload(
    upload_id: str = Form(...), background_tasks: BackgroundTasks = None
):
    """
    完成分块上传，合并文件并处理

    Args:
        upload_id: 上传会话ID
    """
    session = None
    try:
        session = _acquire_upload_session(upload_id)

        if session["uploaded_chunks"] != session["total_chunks"]:
            raise APIValidationError(
                f"Upload incomplete, uploaded: {session['uploaded_chunks']}/{session['total_chunks']}"
            )

        session["status"] = "processing"

        file_extension = session.get("file_extension") or session["file_name"].lower().split(".")[-1]
        streaming_supported = _is_streaming_supported(file_extension)

        if streaming_supported:
            file_info = await process_streaming_upload(session)
            final_file_path = file_info.get("cleanup_path")
        else:
            temp_upload_path = os.path.join(get_upload_dir(), session["file_name"])

            with open(temp_upload_path, "wb") as final_file:
                for chunk_num in range(session["total_chunks"]):
                    chunk_path = _build_chunk_path(session, chunk_num)
                    if os.path.exists(chunk_path):
                        with open(chunk_path, "rb") as chunk_file:
                            final_file.write(chunk_file.read())
                    else:
                        raise QueryExecutionError(f"Chunk file missing: chunk_{chunk_num:06d}")

            final_file_path = _get_final_file_path(session["file_name"])
            shutil.move(temp_upload_path, final_file_path)
            logger.info("File moved to: %s", final_file_path)

            if session.get("file_hash"):
                actual_hash = calculate_file_hash(final_file_path)
                if actual_hash != session["file_hash"]:
                    raise APIValidationError(
                        "File hash verification failed, file may be corrupted"
                    )

            # Build reader_options from session CSV fields (CSV only)
            _csv_opts: Dict[str, Any] = {}
            if file_extension == "csv":
                if session.get("csv_delimiter") is not None:
                    _csv_opts["delim"] = session["csv_delimiter"]
                if session.get("csv_has_header") is not None:
                    _csv_opts["HEADER"] = session["csv_has_header"]
                if session.get("csv_encoding") is not None:
                    _csv_opts["encoding"] = session["csv_encoding"]

            file_info = await process_uploaded_file(
                final_file_path,
                session["file_name"],
                session.get("table_alias"),
                background_tasks=background_tasks,
                import_mode=session.get("import_mode", "auto"),
                reader_options=_csv_opts or None,
            )

        if os.path.exists(session["chunks_dir"]):
            await asyncio.to_thread(
                shutil.rmtree, session["chunks_dir"], ignore_errors=True
            )

        if background_tasks:
            cleanup_target = file_info.pop("cleanup_path", None)
            if cleanup_target:
                schedule_cleanup(cleanup_target, background_tasks)
            elif (
                not file_info.get("pending_excel")
                and final_file_path
                and os.path.exists(final_file_path)
            ):
                schedule_cleanup(final_file_path, background_tasks)

        # 成功后会话已无消费者(无状态查询端点),立即移除,不留终态条目
        with upload_sessions_lock:
            if upload_sessions.get(upload_id) is session:
                upload_sessions.pop(upload_id, None)

        logger.info(
            "File upload completed: %s, size: %d",
            session['file_name'], session['file_size']
        )

        return create_success_response(
            data={
                "upload_id": upload_id,
                "file_info": file_info,
            },
            message_code=MessageCode.CHUNKED_UPLOAD_COMPLETE,
            message="File upload and processing completed",
        )

    except BaseAPIException:
        raise
    except Exception as e:
        logger.error("Failed to complete upload: %s", e)
        logger.error("Stack trace: %s", traceback.format_exc())

        with upload_sessions_lock:
            failed_session = upload_sessions.get(upload_id)
            if failed_session is not None:
                failed_session["status"] = "failed"
                failed_session["error_message"] = str(e)

        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to complete upload: {str(e)}",
        )
    finally:
        if session is not None:
            cleanup_dir = _release_upload_session(upload_id, session)
            if cleanup_dir:
                await asyncio.to_thread(
                    shutil.rmtree, cleanup_dir, ignore_errors=True
                )


async def process_uploaded_file(
    file_path: str,
    file_name: str,
    table_alias: str = None,
    background_tasks: Optional[BackgroundTasks] = None,
    import_mode: str = "auto",
    reader_options: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Process uploaded file and load to DuckDB"""
    try:
        normalize_import_mode(import_mode)
        logger.info("Starting to process uploaded file: %s, path: %s", file_name, file_path)

        file_extension = file_name.lower().split(".")[-1]
        logger.info("File type: %s", file_extension)

        if file_extension in {"xlsx", "xls"}:
            pending_payload = prepare_excel_pending(file_path, file_name, table_alias)
            if background_tasks:
                from core.data.excel_import_manager import _get_pending_base_dir

                pending_dir = _get_pending_base_dir() / pending_payload.file_id
                schedule_cleanup(str(pending_dir), background_tasks, delay_seconds=6 * 3600)

            return {
                "success": True,
                "pending_excel": pending_payload.to_api_dict(),
                "message": "Excel 文件已上传，请选择需要导入的工作表。",
                "cleanup_path": None,
            }

        with with_duckdb_connection() as con:
            logger.info("Starting to load into DuckDB...")
            ingest_result = ingest_tabular_file(
                con,
                file_path,
                file_extension,
                table_alias,
                import_mode=import_mode,
                filename_for_meta=file_name,
                persist_path=file_path,
                reader_options=reader_options,
            )
            source_id = ingest_result.table_name
            table_info = {
                "row_count": ingest_result.row_count,
                "column_count": ingest_result.column_count,
                "columns": ingest_result.columns,
                "column_profiles": ingest_result.column_profiles,
            }
            logger.info("Successfully loaded into DuckDB: %s", table_info)

        logger.info(
            "File processing completed: %s, table: %s, rows: %d",
            file_name,
            source_id,
            table_info["row_count"],
        )

        return {
            "source_id": source_id,
            "filename": file_name,
            "file_size": os.path.getsize(file_path),
            "row_count": table_info["row_count"],
            "column_count": table_info["column_count"],
            "columns": table_info["columns"],
            "preview_data": [{"提示": "预览数据已禁用以提高性能"}],
            "cleanup_path": file_path,
        }

    except Exception as e:
        logger.error("Failed to process file: %s", e)
        logger.error("Stack trace: %s", traceback.format_exc())
        raise


@router.delete("/api/upload/cancel/{upload_id}", tags=["Chunked Upload"])
async def cancel_upload(upload_id: str):
    """取消上传"""
    try:
        cleanup_dir = None
        processing = False
        with upload_sessions_lock:
            session = upload_sessions.get(upload_id)
            if session is None:
                raise ResourceNotFoundError("Upload session", upload_id)
            if session.get("status") == "processing":
                processing = True
            elif session.get("active_operations", 0) > 0:
                session["cancel_requested"] = True
                session["status"] = "cancelling"
            else:
                upload_sessions.pop(upload_id, None)
                cleanup_dir = session.get("chunks_dir")

        if processing:
            return error_json_response(
                409,
                "UPLOAD_PROCESSING",
                "Upload processing has already started and cannot be cancelled",
            )

        # 进行中的请求由 release 路径清理，避免写文件时并发 rmtree。
        if cleanup_dir:
            await asyncio.to_thread(
                shutil.rmtree, cleanup_dir, ignore_errors=True
            )

        logger.info("Upload cancelled: %s", upload_id)

        return create_success_response(
            data={"upload_id": upload_id},
            message_code=MessageCode.CHUNKED_UPLOAD_CANCELLED,
            message="Upload cancelled",
        )

    except BaseAPIException:
        raise
    except Exception as e:
        logger.error("Failed to cancel upload: %s", e)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to cancel upload: {str(e)}",
        )
