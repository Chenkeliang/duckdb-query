from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def _preflight(origin: str):
    return client.options(
        "/health",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
        },
    )


def test_tauri_macos_origin_allowed():
    r = _preflight("tauri://localhost")
    assert r.headers.get("access-control-allow-origin") == "tauri://localhost"


def test_tauri_windows_origin_allowed():
    r = _preflight("http://tauri.localhost")
    assert r.headers.get("access-control-allow-origin") == "http://tauri.localhost"
