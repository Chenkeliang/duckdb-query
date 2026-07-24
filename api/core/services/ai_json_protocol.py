"""模型 JSON 动作协议的解析原语(供 Agent Engine 复用)。

从模型回复里容错地抽取 JSON 对象是 Agent 单动作协议的底层能力,不属于任何单一
LLM 服务,故独立成模块。
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict


def extract_json(text: str) -> Dict[str, Any]:
    """从模型回复里抽 JSON 对象(容忍 ```json 围栏与前后噪声)。失败返回空 dict。"""
    if not text:
        return {}
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else text
    start, end = candidate.find("{"), candidate.rfind("}")
    if start == -1 or end == -1 or end < start:
        return {}
    try:
        return json.loads(candidate[start : end + 1])
    except Exception:  # noqa: BLE001
        return {}
