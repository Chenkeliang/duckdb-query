from typing import Any


async def add_connection(client, cfg, *, connection: dict, test: bool = True) -> Any:
    """Save (and optionally test) an external DB connection.

    `connection` must follow the DatabaseConnection shape:
      {name, type, params: {host, port, database, username, password, ...}}
    where `type` is one of: mysql, postgresql, sqlite, etc.
    `test=True` (default) verifies the connection before saving; set to False to save without testing.
    """
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
) -> Any:
    """Register a local CSV/Parquet/JSON/Excel file as a DuckDB table.

    Desktop mode allows any local path (ALLOW_ARBITRARY_LOCAL_PATHS=1).
    `import_mode`: auto | smart | raw (controls type inference on load).
    CSV-specific options (`csv_delimiter`, `csv_has_header`, `csv_encoding`) are ignored for non-CSV files.
    """
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
) -> Any:
    """Import selected Excel sheets as DuckDB tables.

    Each item in `sheets` is a dict matching ExcelSheetImportConfig:
      {name: str, target_table: str, header_rows?: int, header_row_index?: int,
       fill_merged?: bool, mode?: "create"|"append"|"replace"}
    `import_mode`: auto | smart | raw.
    """
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
) -> Any:
    """Create a DuckDB table from pasted tabular data.

    `column_names`: list of column name strings, e.g. ["id", "name"].
    `column_types`: list of type strings matching column_names, e.g. ["INTEGER", "VARCHAR"].
      Supported types: VARCHAR, INTEGER, DOUBLE, DATE, BOOLEAN.
    `data_rows`: list of rows, each a list of string cell values,
      e.g. [["1", "Alice"], ["2", "Bob"]].
    `delimiter`: used only for context (data is already parsed into rows).
    `has_header`: whether the first row of data_rows is a header (usually False since
      column_names is explicit).
    """
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
) -> Any:
    """Download a remote file URL and load it into a DuckDB table.

    `url`: public HTTP/HTTPS URL (GitHub blob URLs are auto-converted to raw).
    `table_alias`: desired table name (de-duplicated if it already exists).
    `file_type`: csv | json | parquet | excel (auto-detected from URL/Content-Type if omitted).
    `import_mode`: auto | smart | raw.
    `prefer_native`: try DuckDB/httpfs direct read first (faster), fall back to HTTP download.
    Internal/loopback addresses and S3 URLs are blocked by the backend.
    """
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
