"""Unified encoding detection and decoding utilities.

Uses charset_normalizer as a hard dependency for accurate encoding detection.

Typical usage:
    from core.foundation.encoding_utils import safe_decode

    text = safe_decode(raw_bytes)
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from charset_normalizer import from_bytes

if TYPE_CHECKING:
    from collections.abc import Sequence

logger = logging.getLogger(__name__)

DEFAULT_FALLBACK_ENCODINGS: tuple[str, ...] = (
    "utf-8",
    "gbk",
    "gb2312",
    "latin1",
    "cp1252",
)


def safe_decode(
    data: bytes | str,
    preferred_encoding: str | None = None,
    fallback_encodings: Sequence[str] | None = None,
    errors: str = "replace",
) -> str:
    """Safely decodes bytes to string with automatic encoding detection.

    Priority order:
    1. Return immediately if already a string
    2. Try preferred_encoding if specified
    3. Use charset_normalizer for detection
    4. Try fallback encodings in order
    5. Fall back to UTF-8 with error replacement

    Args:
        data: Bytes to decode, or string (returned as-is).
        preferred_encoding: Encoding to try first before auto-detection.
        fallback_encodings: Encodings to try if detection fails.
        errors: Error handling strategy for final fallback ('replace', 'ignore').

    Returns:
        Decoded string. Never raises for encoding issues.
    """
    if isinstance(data, str):
        return data
    if not data:
        return ""

    if preferred_encoding:
        try:
            return data.decode(preferred_encoding)
        except (UnicodeDecodeError, LookupError):
            pass

    try:
        result = from_bytes(data)
        if result:
            best = result.best()
            if best:
                return str(best)
    except Exception as e:
        logger.debug("charset_normalizer detection failed: %s", e)

    encodings = fallback_encodings or DEFAULT_FALLBACK_ENCODINGS
    for enc in encodings:
        try:
            return data.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue

    logger.debug("All encoding attempts failed, using errors=%r", errors)
    return data.decode("utf-8", errors=errors)


def safe_encode_string(value: str) -> str:
    """Ensures a string can be safely encoded to UTF-8.

    Args:
        value: String to process.

    Returns:
        The string, with unencodable characters replaced.
    """
    if not value:
        return ""
    try:
        return str(value)
    except Exception:
        return value.encode("utf-8", errors="replace").decode("utf-8")
