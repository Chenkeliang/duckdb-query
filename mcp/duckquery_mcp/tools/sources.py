from typing import Any


async def add_connection(client, cfg, *, connection: dict, test: bool = True,
                         confirm: bool = False) -> Any:
    """Save (and optionally test) an external DB connection.

    Persists a connection (with credentials), so it needs confirm=true outside
    read-only mode, like every other write tool.

    `connection` must follow the DatabaseConnection shape:
      {id, name, type, params: {host, port, database, username, password, ...}}
    where `type` is one of: mysql, postgresql, sqlite, etc. `id` is a required
    unique string; if omitted here, a uuid is generated automatically.
    `test=True` (default) verifies the connection before saving; set to False to save without testing.
    """
    from duckquery_mcp.safety import confirm_required
    blocked = confirm_required(cfg, True, confirm)
    if blocked:
        return blocked
    if not connection.get("id"):
        # 后端 DatabaseConnection.id 为必填;缺失会在路由内被吞成语焉不详的 500
        import uuid

        connection = {**connection, "id": f"conn_{uuid.uuid4().hex[:12]}"}
    return await client.call(
        "POST",
        "/api/datasources/databases",
        params={"test_connection": str(test).lower()},
        json_body=connection,
    )


async def add_local_file_source(
    client,
    cfg,
    *,
    path: str,
    table_alias: str | None = None,
    import_mode: str = "auto",
    csv_delimiter: str | None = None,
    csv_has_header: bool | None = None,
    csv_encoding: str | None = None,
    confirm: bool = False,
) -> Any:
    """Register a local CSV/Parquet/JSON/Excel file as a DuckDB table.

    Desktop mode allows any local path (ALLOW_ARBITRARY_LOCAL_PATHS=1) — unlike
    the desktop UI's own import flow, there's no native file dialog here forcing
    a human to pick the exact file, so this needs confirm=true outside read-only
    mode (which blocks it outright) the same as any other mutating tool: without
    it, path could point anywhere the backend process can read (~/.ssh, browser
    profile databases, etc.), not just files the user meant to import.
    `import_mode`: auto | literal | variant. auto = safe type promotion (numeric-looking
    ID columns stay VARCHAR); literal = every column VARCHAR; variant = JSON/JSONL
    columns loaded as VARIANT.
    CSV-specific options (`csv_delimiter`, `csv_has_header`, `csv_encoding`) are ignored for non-CSV files.
    """
    from duckquery_mcp.safety import confirm_required
    blocked = confirm_required(cfg, True, confirm)
    if blocked:
        return blocked
    body: dict = {"path": path, "import_mode": import_mode}
    if table_alias is not None:
        body["table_alias"] = table_alias
    if csv_delimiter is not None:
        body["csv_delimiter"] = csv_delimiter
    if csv_has_header is not None:
        body["csv_has_header"] = csv_has_header
    if csv_encoding is not None:
        body["csv_encoding"] = csv_encoding
    return await client.call("POST", "/api/server-files/import", json_body=body)


async def import_excel(
    client,
    cfg,
    *,
    path: str,
    sheets: list,
    import_mode: str = "auto",
    confirm: bool = False,
) -> Any:
    """Import selected Excel sheets as DuckDB tables.

    Same arbitrary-local-path exposure as add_local_file_source (no native file
    dialog gates this path) — needs confirm=true outside read-only mode.

    Each item in `sheets` is a dict matching ExcelSheetImportConfig:
      {name: str, target_table: str, header_rows?: int, header_row_index?: int,
       fill_merged?: bool, mode?: "create"|"append"|"replace"}
    `import_mode`: auto | literal | variant (see add_local_file_source).
    """
    from duckquery_mcp.safety import confirm_required
    blocked = confirm_required(cfg, True, confirm)
    if blocked:
        return blocked
    return await client.call(
        "POST",
        "/api/server-files/excel/import",
        json_body={"path": path, "sheets": sheets, "import_mode": import_mode},
    )


async def paste_data(
    client,
    cfg,
    *,
    table_name: str,
    column_names: list,
    column_types: list,
    data_rows: list,
    delimiter: str = ",",
    has_header: bool = False,
    confirm: bool = False,
) -> Any:
    """Create a DuckDB table from pasted tabular data.

    Creates a table, so it needs confirm=true outside read-only mode, like every
    other write tool.

    `column_names`: list of column name strings, e.g. ["id", "name"].
    `column_types`: list of type strings matching column_names, e.g. ["INTEGER", "VARCHAR"].
      Supported types: VARCHAR, INTEGER, DOUBLE, DATE, BOOLEAN.
    `data_rows`: list of rows, each a list of string cell values,
      e.g. [["1", "Alice"], ["2", "Bob"]].
    `delimiter`: used only for context (data is already parsed into rows).
    `has_header`: whether the first row of data_rows is a header (usually False since
      column_names is explicit).
    """
    from duckquery_mcp.safety import confirm_required
    blocked = confirm_required(cfg, True, confirm)
    if blocked:
        return blocked
    return await client.call(
        "POST",
        "/api/paste-data",
        json_body={
            "table_name": table_name,
            "column_names": column_names,
            "column_types": column_types,
            "data_rows": data_rows,
            "delimiter": delimiter,
            "has_header": has_header,
        },
    )


async def read_url(
    client,
    cfg,
    *,
    url: str,
    table_alias: str,
    file_type: str | None = None,
    import_mode: str = "auto",
    encoding: str = "utf-8",
    delimiter: str = ",",
    header: bool = True,
    prefer_native: bool = True,
    confirm: bool = False,
) -> Any:
    """Download a remote file URL and load it into a DuckDB table.

    Fetches a remote URL and creates a table, so it needs confirm=true outside
    read-only mode, like every other write tool.

    `url`: public HTTP/HTTPS URL (GitHub blob URLs are auto-converted to raw).
    `table_alias`: desired table name (de-duplicated if it already exists).
    `file_type`: csv | json | parquet | excel (auto-detected from URL/Content-Type if omitted).
    `import_mode`: auto | literal | variant (see add_local_file_source).
    `prefer_native`: try DuckDB/httpfs direct read first (faster), fall back to HTTP download.
    Internal/loopback addresses and S3 URLs are blocked by the backend.
    """
    from duckquery_mcp.safety import confirm_required
    blocked = confirm_required(cfg, True, confirm)
    if blocked:
        return blocked
    return await client.call(
        "POST",
        "/api/read_from_url",
        json_body={
            "url": url,
            "table_alias": table_alias,
            "file_type": file_type,
            "import_mode": import_mode,
            "encoding": encoding,
            "delimiter": delimiter,
            "header": header,
            "prefer_native": prefer_native,
        },
    )
