

# ---- 目录裁剪不得动登记表(2026-07-26 实测:表顺序被打乱) ----

def test_scoped_catalog_does_not_wipe_the_table_registry():
    """按范围裁剪目录时,登记表必须用完整物理清单同步。

    sync() 会删掉清单外的登记行;若传裁剪后的清单,范围外那些表的行被删,
    下次列表把它们当新表重登记 → 新序号 → 用户看到"表顺序又变了"。
    """
    from unittest.mock import patch

    from core.database.duckdb_engine import with_duckdb_connection
    from core.services import ai_context

    with with_duckdb_connection() as con:
        con.execute("CREATE TABLE IF NOT EXISTS reg_keep_a(id INTEGER)")
        con.execute("CREATE TABLE IF NOT EXISTS reg_keep_b(id INTEGER)")
    try:
        seen: list[list[str]] = []

        def spy(names, created_lookup=None):
            seen.append(list(names))
            return {n: {"sort_seq": i, "created_at": None} for i, n in enumerate(names)}

        with patch("core.services.ai_context.table_registry.sync", side_effect=spy):
            text = ai_context.build_catalog_text(None, ["reg_keep_a"])

        assert seen, "未调用 registry.sync"
        synced = seen[0]
        assert "reg_keep_a" in synced and "reg_keep_b" in synced, (
            f"sync 收到的是裁剪后的清单,会删掉范围外的登记行: {synced}"
        )
        # 展示侧仍然只列范围内的表
        assert "reg_keep_a" in text and "reg_keep_b" not in text
    finally:
        with with_duckdb_connection() as con:
            con.execute("DROP TABLE IF EXISTS reg_keep_a")
            con.execute("DROP TABLE IF EXISTS reg_keep_b")
