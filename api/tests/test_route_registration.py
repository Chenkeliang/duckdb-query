"""应用路由注册：P0/P1 重构后前后端关键路径仍挂载。"""

import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from main import app

# 前端 @/api 与契约表中的关键路径
REQUIRED_PATHS = [
    "/api/datasources",
    "/api/upload",
    "/api/duckdb/execute",
    "/api/duckdb/federated-query",
    "/api/query",
    "/api/pivot-query/generate",
    "/api/pivot-query/preview",
    "/api/visual-query/generate",
    "/api/visual-query/preview",
    "/api/set-operations/generate",
    "/api/set-operations/preview",
    "/api/sql-favorites",
    "/api/sql-favorites/{favorite_id}",
    "/api/query/cancel/{request_id}",
    "/api/datasources/databases/{connection_id}/tables/detail",
    "/api/datasources/databases/{connection_id}/tables",
    "/api/datasources/databases/{connection_id}/schemas",
]


def _collect_route_paths():
    paths = set()
    for route in app.routes:
        path = getattr(route, "path", None)
        if path:
            paths.add(path)
    return paths


def test_frontend_critical_routes_registered():
    registered = _collect_route_paths()
    missing = [p for p in REQUIRED_PATHS if p not in registered]
    assert not missing, f"Missing routes: {missing}"
