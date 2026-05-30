"""schema 检索:Retriever 接口 + KeywordRetriever(零新基建,契合「不过重」)。

VectorRetriever 日后作同一接口的第二实现加入,上层(llm_context/路由/前端)零改动。
"""

from __future__ import annotations

import re
from typing import List, Protocol

_MAX_TABLES = 10


def _tokens(text: str) -> set[str]:
    return {t for t in re.split(r"[^a-z0-9]+", (text or "").lower()) if len(t) >= 2}


class Retriever(Protocol):
    def retrieve(
        self, question: str, selected_tables: List[str], candidate_tables: List[str]
    ) -> List[str]:
        ...


class KeywordRetriever:
    """选中表优先,再用问题关键词在候选表名里召回;去重并截断到 max_tables。"""

    def __init__(self, max_tables: int = _MAX_TABLES):
        self._max = max_tables

    def retrieve(
        self, question: str, selected_tables: List[str], candidate_tables: List[str]
    ) -> List[str]:
        result: List[str] = []
        for t in selected_tables or []:
            if t and t not in result:
                result.append(t)
        q = _tokens(question)
        for t in candidate_tables or []:
            if len(result) >= self._max:
                break
            if t in result:
                continue
            name_tokens = _tokens(t)
            if (q & name_tokens) or any(tok in (t or "").lower() for tok in q):
                result.append(t)
        return result[: self._max]
