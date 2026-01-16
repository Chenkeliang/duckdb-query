# API Response Standardization Specification

This document defines the **mandatory** structure for all API responses in the backend. All API endpoints MUST adhere strictly to these formats to ensure frontend compatibility and maintainability.

## 1. Core Principles

1.  **Unified Structure**: Every response (success or error) must follow a predictable JSON schema.
2.  **Mandatory Wrappers**: No endpoint is allowed to return raw dictionaries, lists, or Pydantic models directly. All returns must be wrapped using the shared helper functions.
3.  **Code-Driven I18n**: The backend provides stable `messageCode`s. The frontend uses these codes to translate messages (e.g., `t('errors.CONNECTION_FAILED')`). The backend's `message` field is a fallback/debug string.
4.  **No Exceptions for Business Errors**: Business logic errors (e.g., "Not Found", "Validation Failed") should return a structured 200 or 400/500 JSON response, not just raise a generic 500.

## 2. Standard Success Response

**Helper**: `api.utils.response_helpers.create_success_response`

```json
{
  "success": true,
  "data": { ... },          // The actual payload (object, list, or null)
  "messageCode": "OPERATION_SUCCESS",
  "message": "Operation completed successfully", // Fallback text
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Usage Rule
```python
# ✅ CORRECT
return create_success_response(data={"id": 1})

# ❌ INCORRECT
return {"id": 1}
return {"success": True, "data": ...}  # Do not manually construct
return MyPydanticModel(...)
```

## 3. Standard List Response

**Helper**: `api.utils.response_helpers.create_list_response`

```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "total": 100,
    "page": 1,          // Optional
    "pageSize": 20      // Optional
  },
  "messageCode": "ITEMS_RETRIEVED",
  "message": "Items retrieved successfully",
  "timestamp": "..."
}
```

## 4. Standard Error Response

**Helper**: `api.utils.response_helpers.create_error_response`

**Critical**: Errors must be returned as `JSONResponse` with the standardized body, NOT raised as generic `HTTPException`s (which often leads to double-wrapping or loss of structure).

```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found",
    "details": { "id": "123" }
  },
  "detail": "The requested resource was not found", // For legacy/frontend compatibility
  "messageCode": "RESOURCE_NOT_FOUND",
  "message": "The requested resource was not found",
  "timestamp": "..."
}
```

### Usage Rule
```python
# ✅ CORRECT
return JSONResponse(
    status_code=404,
    content=create_error_response(
        code="RESOURCE_NOT_FOUND",
        message=f"User {uid} not found"
    )
)

# ❌ INCORRECT
raise HTTPException(404, detail="Not Found")
return {"success": False, "error": ...}
```

## 5. Audit Results & Required Action

The following files have been identified as **Non-Compliant** and require refactoring:

| File | Issue | Action |
|------|-------|--------|
| `async_tasks.py` | Returns raw Pydantic models & dicts | Wrap in `create_success_response` |
| `chunked_upload.py` | Returns raw success dicts | Use `create_success_response` |
| `database_tables.py` | Returns raw lists/dicts | Use `create_success_response` |
| `duckdb_query.py` | Returns raw dicts | Use `create_success_response` |
| `paste_data.py` | Returns raw strings (if endpoints) | Verify & Wrap |
| `query.py` | Returns `VisualQueryResponse` Pydantic models | Wrap in `create_success_response` |
| `query_cancel.py` | Check for manual dict construction | Enforce helper |
| `sql_favorites.py` | Returns raw `{"success": true...}` | Use helper |
| `url_reader.py` | Returns raw dicts | Use helper |

**Compliant Files (Verified)**:
- `config_api.py`
- `datasources.py`
- `settings.py`
- `server_files.py` (Check for deep endpoints)
