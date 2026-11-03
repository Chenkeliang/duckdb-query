"""Manage and query independent remote DuckDB services over Quack."""

from typing import Callable, Optional

from fastapi import APIRouter, Header, Query

from core.services.foreground_queries import track_foreground_query
from core.services.quack_service import QuackError, quack_service
from models.quack_models import QuackExecuteRequest, QuackServiceConfig
from utils.response_helpers import MessageCode, create_list_response, create_success_response, error_json_response

router = APIRouter(prefix="/api/quack/services", tags=["quack"])


def _respond(operation: Callable, code: MessageCode = MessageCode.OPERATION_SUCCESS, listing: bool = False):
    """Use the standard error envelope without logging credential-bearing SQL."""
    try:
        data = operation()
        if listing:
            return create_list_response(items=data, total=len(data), message_code=code)
        return create_success_response(data=data, message_code=code)
    except QuackError as exc:
        return error_json_response(status_code=exc.status_code, code=exc.code, message=str(exc))


@router.get("")
def list_services():
    """List public configuration only; never open a connection."""
    return _respond(quack_service.list_services, listing=True)


@router.post("")
def create_service(request: QuackServiceConfig):
    """Save encrypted credentials without an implicit remote test."""
    return _respond(lambda: quack_service.save_service(request), MessageCode.CONNECTION_CREATED)


@router.post("/test")
def test_unsaved_service(request: QuackServiceConfig):
    """Explicit user-triggered test may install official core extensions."""
    return _respond(lambda: quack_service.test_connection(config=request), MessageCode.CONNECTION_TEST_SUCCESS)


@router.put("/{service_id}")
def update_service(service_id: str, request: QuackServiceConfig):
    """Replace public settings and retain an omitted token."""
    return _respond(lambda: quack_service.save_service(request, service_id), MessageCode.CONNECTION_UPDATED)


@router.delete("/{service_id}")
def delete_service(service_id: str):
    """Remove only local service registration."""
    def remove():
        quack_service.delete_service(service_id)
        removed = {"id": service_id}
        return removed
    return _respond(remove, MessageCode.CONNECTION_DELETED)


@router.post("/{service_id}/test")
def test_saved_service(service_id: str):
    """Test the currently saved endpoint and token."""
    return _respond(lambda: quack_service.test_connection(service_id), MessageCode.CONNECTION_TEST_SUCCESS)


@router.get("/{service_id}/catalogs")
def list_catalogs(service_id: str):
    """Read actual catalog names and types from the server."""
    return _respond(lambda: quack_service.catalogs(service_id), listing=True)


@router.get("/{service_id}/schemas")
def list_schemas(service_id: str, catalog: str = Query(..., min_length=1)):
    """Browse schemas for one remote catalog."""
    return _respond(lambda: quack_service.schemas(service_id, catalog), listing=True)


@router.get("/{service_id}/tables")
def list_tables(service_id: str, catalog: str = Query(..., min_length=1), schema: str = Query(..., min_length=1)):
    """Browse remote tables and views without counting data."""
    return _respond(lambda: quack_service.tables(service_id, catalog, schema), listing=True)


@router.get("/{service_id}/columns")
def list_columns(service_id: str, catalog: str = Query(..., min_length=1),
                 schema: str = Query(..., min_length=1), table: str = Query(..., min_length=1)):
    """Inspect native column types and nullability."""
    return _respond(lambda: quack_service.columns(service_id, catalog, schema, table), listing=True)


@router.post("/{service_id}/execute")
@track_foreground_query
def execute_service(service_id: str, request: QuackExecuteRequest,
                    x_request_id: Optional[str] = Header(default=None)):
    """Execute read-only SQL remotely with per-query cancellation ownership."""
    return _respond(lambda: quack_service.execute(
        service_id, request.sql, request.is_preview, x_request_id or request.request_id,
    ), MessageCode.QUERY_EXECUTED)
