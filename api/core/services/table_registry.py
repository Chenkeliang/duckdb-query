"""DuckDB 表的稳定排序登记表(system.db):sort_seq 是列表顺序的唯一权威。

为什么不用别的:table_oid 在库文件重建/重启后会漂移(2026-07-22 实测,重启即
洗牌);metadata created_at 受时区、同秒建表与精度影响,不适合作排序键。
序列 sort_seq 单调递增、持久、与时间无关;created_at 只用于展示与 AI 理解
"最新/今天建的",不参与排序。

行为约定(2026-07-23 设计):
- 新建/替换表(record_creation):sort_seq = nextval → 排到最上
- 首见批量登记(sync):按调用方给定顺序整体垫底式分配(迁移时先按元数据
  created_at 排好再冻结),之后顺序永久稳定
- 删除表:登记行同步删除(sync 兜底清理)
所有写入失败只告警降级,绝不拖垮业务请求。
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Callable, Dict, Optional, Sequence

from core.database.duckdb_pool import with_system_connection
from core.common.timezone_utils import get_storage_time

logger = logging.getLogger(__name__)

_DATABASE_KEY = "main"
_SCHEMA_NAME = "main"
_schema_ready = False


def _ensure_schema(conn: Any) -> None:
    global _schema_ready  # pylint: disable=global-statement
    if _schema_ready:
        return
    conn.execute("CREATE SEQUENCE IF NOT EXISTS system_table_sort_seq")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS system_table_registry (
            database_key VARCHAR NOT NULL,
            schema_name VARCHAR NOT NULL,
            table_name VARCHAR NOT NULL,
            sort_seq BIGINT NOT NULL,
            created_at TIMESTAMP,
            PRIMARY KEY (database_key, schema_name, table_name)
        )
        """
    )
    _schema_ready = True


def record_creation(table_name: str, created_at: Optional[datetime] = None) -> None:
    """新建/替换表时登记:拿新序号排到最上。失败只告警,不拦创建流程。"""
    try:
        with with_system_connection() as conn:
            _ensure_schema(conn)
            conn.execute(
                """
                INSERT OR REPLACE INTO system_table_registry
                (database_key, schema_name, table_name, sort_seq, created_at)
                VALUES (?, ?, ?, nextval('system_table_sort_seq'), ?)
                """,
                [_DATABASE_KEY, _SCHEMA_NAME, table_name, created_at or get_storage_time()],
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("table registry record_creation failed for %s: %s", table_name, exc)


def remove(table_name: str) -> None:
    """删表时同步删登记行(sync 也会兜底清理)。"""
    try:
        with with_system_connection() as conn:
            _ensure_schema(conn)
            conn.execute(
                "DELETE FROM system_table_registry WHERE database_key = ? "
                "AND schema_name = ? AND table_name = ?",
                [_DATABASE_KEY, _SCHEMA_NAME, table_name],
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("table registry remove failed for %s: %s", table_name, exc)


def _seed_order(
    unseen: Sequence[str],
    registry_empty: bool,
    created_lookup: Optional[Callable[[str], Optional[dict]]],
) -> list[str]:
    """未登记表的登记顺序(最旧在前,逐个 nextval 后最新者序号最大)。

    迁移(登记表为空)时按元数据 created_at 排好再冻结:有时间的按时间,
    没时间的(如 SQL 直建的遗留表)垫底;之后的新面孔保持调用方给定的
    目录顺序。不再从 table_oid 猜真实创建时间。
    """
    if not registry_empty or not created_lookup:
        return list(reversed(unseen))
    dated: list[tuple[str, str]] = []
    undated: list[str] = []
    for name in unseen:
        meta = None
        try:
            meta = created_lookup(name)
        except Exception as exc:  # noqa: BLE001
            logger.debug("created_at lookup failed for %s: %s", name, exc)
        ts = (meta or {}).get("created_at")
        if ts is None:
            undated.append(name)
        else:
            dated.append((ts.isoformat() if isinstance(ts, datetime) else str(ts), name))
    dated.sort()  # 最旧在前
    return list(reversed(undated)) + [name for _, name in dated]


def sync(
    physical_names: Sequence[str],
    created_lookup: Optional[Callable[[str], Optional[dict]]] = None,
) -> Dict[str, Dict[str, Any]]:
    """对齐登记表与物理目录,返回 name → {sort_seq, created_at}。

    - 新面孔 → 逐个 nextval 登记(迁移时按 created_lookup 排定初始顺序)
    - 已消失 → 删行
    读写全部单连接完成;失败时返回空 map,调用方自行降级。
    """
    result: Dict[str, Dict[str, Any]] = {}
    names = list(physical_names)
    try:
        with with_system_connection() as conn:
            _ensure_schema(conn)
            rows = conn.execute(
                "SELECT table_name, sort_seq, created_at FROM system_table_registry "
                "WHERE database_key = ? AND schema_name = ?",
                [_DATABASE_KEY, _SCHEMA_NAME],
            ).fetchall()
            registered = {r[0]: {"sort_seq": r[1], "created_at": r[2]} for r in rows}

            wanted = set(names)
            for gone in set(registered) - wanted:
                conn.execute(
                    "DELETE FROM system_table_registry WHERE database_key = ? "
                    "AND schema_name = ? AND table_name = ?",
                    [_DATABASE_KEY, _SCHEMA_NAME, gone],
                )
                registered.pop(gone, None)

            unseen = [n for n in names if n not in registered]
            is_migration = not registered
            for name in _seed_order(unseen, is_migration, created_lookup):
                created: Optional[datetime] = None
                meta = None
                try:
                    meta = created_lookup(name) if created_lookup else None
                except Exception as exc:  # noqa: BLE001
                    logger.debug("created_at lookup failed for %s: %s", name, exc)
                raw = (meta or {}).get("created_at")
                if isinstance(raw, datetime):
                    created = raw
                elif raw is not None:
                    try:
                        created = datetime.fromisoformat(str(raw))
                    except ValueError:
                        created = None
                if created is None and not is_migration:
                    # 迁移时无元数据的遗留表创建时间未知,留空不撒谎;
                    # 迁移后的新面孔"首见≈创建",用当前时间
                    created = get_storage_time()
                seq = conn.execute(
                    "SELECT nextval('system_table_sort_seq')"
                ).fetchone()[0]
                conn.execute(
                    """
                    INSERT OR REPLACE INTO system_table_registry
                    (database_key, schema_name, table_name, sort_seq, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    [_DATABASE_KEY, _SCHEMA_NAME, name, seq, created],
                )
                registered[name] = {"sort_seq": seq, "created_at": created}

            result = {n: registered[n] for n in names if n in registered}
    except Exception as exc:  # noqa: BLE001
        logger.warning("table registry sync failed: %s", exc)
    return result
