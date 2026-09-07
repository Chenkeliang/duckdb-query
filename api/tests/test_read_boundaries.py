"""Regression 2026-09-07: redirects and oversized uploads escaped ingress limits."""

import asyncio
from unittest.mock import Mock

import pytest

from core.common.exceptions import BaseAPIException
from core.services import resource_manager
from routers import url_reader


def test_redirect_target_is_validated_before_second_request(monkeypatch):
    """A public URL must not redirect into loopback or cloud metadata."""
    checked = []

    def validate(url):
        checked.append(url)
        if "127.0.0.1" in url:
            raise BaseAPIException("Blocked", 400)

    response = Mock(status_code=302, headers={"Location": "http://127.0.0.1/private"})
    get = Mock(return_value=response)
    monkeypatch.setattr(url_reader, "_assert_public_url", validate)
    monkeypatch.setattr(url_reader, "_send_checked_request", get)
    with pytest.raises(BaseAPIException):
        url_reader._checked_request("get", "https://example.com/data", 1)
    assert len(checked) == 2
    get.assert_called_once()
    response.close.assert_called_once()


def test_info_rejects_loopback_before_request(monkeypatch):
    """The metadata endpoint must enforce the same address policy as download."""
    head = Mock()
    monkeypatch.setattr(url_reader.requests, "head", head)
    with pytest.raises(BaseAPIException):
        url_reader.get_url_info("http://127.0.0.1/data")
    head.assert_not_called()


def test_redirect_limit_closes_every_response(monkeypatch):
    monkeypatch.setattr(url_reader, "_assert_public_url", lambda _: None)
    response = Mock(status_code=302, headers={"Location": "/loop"})
    monkeypatch.setattr(url_reader, "_send_checked_request", Mock(return_value=response))
    with pytest.raises(BaseAPIException, match="Too many"):
        url_reader._checked_request("get", "https://example.com/loop", 1)
    assert response.close.call_count == 6


@pytest.mark.parametrize("url", ["file:///etc/passwd", "http://u:p@example.com/x", "http://[::ffff:127.0.0.1]/"])
def test_unsafe_url_forms_fail_closed(url):
    with pytest.raises(BaseAPIException):
        url_reader._assert_public_url(url)


def test_upload_streams_and_removes_oversized_partial(monkeypatch, tmp_path):
    monkeypatch.setattr(resource_manager, "_temp_dir", lambda: tmp_path)
    from core.common.config_manager import config_manager
    monkeypatch.setattr(config_manager, "get_app_config", lambda: Mock(max_file_size=4))

    class Upload:
        filename = "../../outside.csv"

        def __init__(self):
            self.chunks = iter([b"123", b"45", b""])

        async def read(self, size):
            assert size == 1024 * 1024
            return next(self.chunks)

    with pytest.raises(BaseAPIException) as exc:
        asyncio.run(resource_manager.save_upload_file(Upload()))
    assert exc.value.status_code == 413
    assert not list(tmp_path.iterdir())


def test_github_normalization_requires_exact_host():
    url = "https://notgithub.com/team/blob/main/x.csv"
    assert url_reader.normalize_remote_url(url) == url


def test_direct_https_pins_validated_address_and_retains_hostname(monkeypatch):
    """Regression 2026-09-07: DNS cannot be resolved again after validation."""
    adapter = url_reader._PinnedAddressAdapter()
    monkeypatch.setattr(url_reader, "_assert_public_url", lambda _: "93.184.216.34")
    manager = Mock()
    adapter.poolmanager = manager
    request = url_reader.requests.Request("GET", "https://example.com/data").prepare()
    adapter.get_connection_with_tls_context(request, True)
    kwargs = manager.connection_from_host.call_args.kwargs
    assert kwargs["host"] == "93.184.216.34"
    assert kwargs["pool_kwargs"]["server_hostname"] == "example.com"
    assert kwargs["pool_kwargs"]["assert_hostname"] == "example.com"


def test_upload_exact_limit_and_hostile_filename(monkeypatch, tmp_path):
    """Regression 2026-09-07: exact limits succeed; filenames cannot escape temp root."""
    from core.common.config_manager import config_manager
    monkeypatch.setattr(resource_manager, "_temp_dir", lambda: tmp_path)
    monkeypatch.setattr(config_manager, "get_app_config", lambda: Mock(max_file_size=4))

    class Upload:
        filename = "../../outside.csv"

        def __init__(self):
            self.chunks = iter([b"1234", b""])

        async def read(self, size):
            assert size > 0
            return next(self.chunks)

    from pathlib import Path
    path = Path(asyncio.run(resource_manager.save_upload_file(Upload())))
    assert path.parent == tmp_path
    assert path.read_bytes() == b"1234"


def test_excel_expansion_budget_is_checked_before_parsing(monkeypatch, tmp_path):
    """Regression 2026-09-07: a tiny compressed workbook may expand beyond budget."""
    import zipfile
    from core.data.archive_limits import validate_excel_archive
    path = tmp_path / "large.xlsx"
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("xl/worksheets/sheet1.xml", "x" * 4096)
    monkeypatch.setenv("DUCKQUERY_MAX_EXCEL_EXPANDED_BYTES", "1024")
    with pytest.raises(BaseAPIException) as exc:
        validate_excel_archive(str(path))
    assert exc.value.status_code == 413


def test_remote_oversize_cleans_staging_before_database_access(monkeypatch, tmp_path):
    """Regression 2026-09-07: response length cannot bypass actual-byte limits."""
    response = Mock()
    response.iter_content.return_value = iter([b"123", b"456"])
    monkeypatch.setattr(url_reader, "_assert_public_url", lambda _: "93.184.216.34")
    # The helper normally returns a requests response implementing the context protocol.
    response.__enter__ = Mock(return_value=response)
    response.__exit__ = Mock(return_value=False)
    monkeypatch.setattr(url_reader, "_checked_request", lambda *_: response)
    monkeypatch.setattr(url_reader, "config_manager", Mock(
        get_app_config=Mock(return_value=Mock(max_file_size=4, url_reader_timeout=1))
    ))
    monkeypatch.setattr(url_reader, "resolve_import_mode", lambda *_args, **_kwargs: "auto")
    original = url_reader.tempfile.NamedTemporaryFile
    monkeypatch.setattr(url_reader.tempfile, "NamedTemporaryFile", lambda **kw: original(dir=tmp_path, **kw))
    connection = Mock(side_effect=AssertionError("Must not acquire DB connection"))
    monkeypatch.setattr(url_reader, "with_duckdb_connection", connection)
    with pytest.raises(BaseAPIException) as exc:
        url_reader.read_from_url(url_reader.URLReadRequest(url="https://example.com/file.csv", table_alias="test"))
    assert exc.value.status_code == 413
    assert not list(tmp_path.iterdir())
    connection.assert_not_called()


def test_pinned_transport_streams_from_validated_address(monkeypatch):
    """Regression 2026-09-07: direct transport pins the IP but keeps the HTTP Host."""
    from http.server import BaseHTTPRequestHandler, HTTPServer
    import threading
    seen = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            seen.append(self.headers["Host"])
            self.send_response(200)
            self.send_header("Content-Length", "4")
            self.end_headers()
            self.wfile.write(b"data")

        def log_message(self, *_):
            return

    server = HTTPServer(("127.0.0.1", 0), Handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("NO_PROXY", "*")
    monkeypatch.setattr(url_reader, "_assert_public_url", lambda _: "127.0.0.1")
    host = f"pinned.invalid:{server.server_port}"
    try:
        with url_reader._send_checked_request("get", f"http://{host}/file", 2) as response:
            assert response.status_code == 200, (response.status_code, response.headers, seen)
            assert b"".join(response.iter_content(2)) == b"data"
        assert seen == [host]
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=2)
