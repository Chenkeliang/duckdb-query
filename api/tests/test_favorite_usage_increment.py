"""#22 回归：SQL 收藏使用次数自增必须原子，并发下不能丢计数。

旧实现是 get → +1 → update 的读-改-写，两个并发请求读到同一个旧值、各自写回
+1，丢失一次自增。改为单条 UPDATE ... usage_count = usage_count + 1 ... RETURNING。
"""

import threading
import uuid

from core.database.metadata_manager import metadata_manager


def _make_favorite(usage_count: int = 0) -> str:
    fav_id = f"fav_{uuid.uuid4().hex[:8]}"
    metadata_manager.save_sql_favorite({
        "id": fav_id,
        "name": fav_id,
        "sql": "SELECT 1",
        "type": "query",
        "description": "",
        "tags": [],
        "usage_count": usage_count,
    })
    return fav_id


def test_increment_returns_new_value():
    fav_id = _make_favorite(usage_count=4)
    try:
        assert metadata_manager.increment_sql_favorite_usage(fav_id) == 5
        assert metadata_manager.get_sql_favorite(fav_id)["usage_count"] == 5
    finally:
        metadata_manager.delete_sql_favorite(fav_id)


def test_increment_missing_returns_none():
    assert metadata_manager.increment_sql_favorite_usage("does-not-exist") is None


def test_concurrent_increments_do_not_lose_updates():
    fav_id = _make_favorite(usage_count=0)
    n_threads = 12
    barrier = threading.Barrier(n_threads)
    errors = []

    def worker():
        barrier.wait()
        try:
            metadata_manager.increment_sql_favorite_usage(fav_id)
        except Exception as exc:  # pragma: no cover
            errors.append(exc)

    try:
        threads = [threading.Thread(target=worker) for _ in range(n_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors, f"increment raised under concurrency: {errors}"
        final = metadata_manager.get_sql_favorite(fav_id)["usage_count"]
        assert final == n_threads, f"expected {n_threads} after concurrent increments, got {final}"
    finally:
        metadata_manager.delete_sql_favorite(fav_id)
