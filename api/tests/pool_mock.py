"""Shared mocks for DuckDB connection pool in router tests."""

from unittest.mock import MagicMock


def bind_mock_duckdb_pool(mock_patch, mock_con):
    """Make patch target behave like with_duckdb_connection() yielding mock_con."""
    mock_cm = MagicMock()
    mock_cm.__enter__.return_value = mock_con
    mock_cm.__exit__.return_value = False
    mock_patch.return_value = mock_cm
