"""Process-exit helpers for preserving committed DuckDB data."""

from __future__ import annotations

import logging
import os


logger = logging.getLogger(__name__)


def hard_exit_after_duckdb_cleanup(exit_code: int) -> None:
    """Interrupt active work, checkpoint DuckDB, then terminate immediately."""
    try:
        from core.database.connection_registry import connection_registry

        connection_registry.interrupt_all()
    except Exception as exc:  # pylint: disable=broad-exception-caught
        logger.warning("interrupt_all before hard exit failed: %s", exc)

    try:
        from core.database.duckdb_pool import shutdown_all_duckdb_connections

        shutdown_all_duckdb_connections()
    except Exception as exc:  # pylint: disable=broad-exception-caught
        logger.warning("DuckDB cleanup before hard exit failed: %s", exc)

    logging.shutdown()
    os._exit(exit_code)
