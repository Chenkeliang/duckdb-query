"""Table metadata caching utilities with TTL-based invalidation."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Callable, Dict, Optional

from models.visual_query_models import TableMetadata

try:  # pragma: no cover - config manager may be unavailable in certain test setups
    from core.common.config_manager import config_manager  # type: ignore
except Exception:  # pragma: no cover
    config_manager = None

logger = logging.getLogger(__name__)


@dataclass
class _CacheEntry:
    metadata: TableMetadata
    expires_at: datetime


class TableMetadataCache:
    """In-memory metadata cache with per-table TTL."""

    def __init__(self) -> None:
        self._cache: Dict[str, _CacheEntry] = {}
        self._lock = RLock()

    def _get_ttl(self) -> Optional[timedelta]:
        if not config_manager:
            return None
        try:
            app_cfg = config_manager.get_app_config()
            ttl_hours = getattr(app_cfg, "table_metadata_cache_ttl_hours", 0) or 0
        except Exception as exc:  # pragma: no cover - defensive branch
            logger.warning("无法获取表元数据缓存TTL配置: %s", exc)
            return None
        if ttl_hours <= 0:
            return None
        return timedelta(hours=float(ttl_hours))

    def get_or_load(
        self,
        table_name: str,
        loader: Callable[[], TableMetadata],
        force_refresh: bool = False,
    ) -> TableMetadata:
        ttl = self._get_ttl()
        if ttl is None:
            metadata = loader()
            if force_refresh:
                self.invalidate(table_name)
            return metadata

        cache_key = table_name
        if not force_refresh:
            with self._lock:
                entry = self._cache.get(cache_key)
                if entry and entry.expires_at > datetime.now(timezone.utc):
                    return entry.metadata

        metadata = loader()
        expires_at = datetime.now(timezone.utc) + ttl
        with self._lock:
            self._cache[cache_key] = _CacheEntry(
                metadata=metadata,
                expires_at=expires_at,
            )
        return metadata

    def invalidate(self, table_name: Optional[str] = None) -> int:
        """Clear cache entries."""
        with self._lock:
            if table_name:
                return 1 if self._cache.pop(table_name, None) else 0
            count = len(self._cache)
            self._cache.clear()
            return count


table_metadata_cache = TableMetadataCache()


def invalidate_table_metadata_cache(table_name: Optional[str] = None) -> int:
    """Helper used by routers/tests."""
    return table_metadata_cache.invalidate(table_name)
