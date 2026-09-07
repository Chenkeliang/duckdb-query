"""Bound Excel ZIP expansion before any supported spreadsheet reader runs."""

import os
import zipfile

from core.common.exceptions import BaseAPIException


def validate_excel_archive(path: str) -> None:
    """Check ZIP member count and declared expanded bytes; legacy XLS is unaffected."""
    if not zipfile.is_zipfile(path):
        return
    limit = int(os.environ.get("DUCKQUERY_MAX_EXCEL_EXPANDED_BYTES", 512 * 1024 * 1024))
    if limit <= 0:
        raise ValueError("DUCKQUERY_MAX_EXCEL_EXPANDED_BYTES must be positive")
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > 10000 or sum(entry.file_size for entry in entries) > limit:
            raise BaseAPIException("Excel archive exceeds expansion limit", 413, "FILE_TOO_LARGE")
