"""模型 JSON 动作协议的解析原语(供 Agent Engine 复用)。

从模型回复里容错地抽取 JSON 对象是 Agent 单动作协议的底层能力,不属于任何单一
LLM 服务,故独立成模块。
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict


def _scan_balanced_object(text: str, start: int) -> str | None:
    """从 text[start]('{') 起按花括号配平扫描,返回首个完整平衡对象的子串。

    尊重 JSON 字符串字面量与转义(串内 { } 不计数),因此能忽略对象**之后**的
    多余 } 或散文噪声。找不到闭合返回 None。这是修 protocol_violation 主因(模型
    在合法 action JSON 末尾多吐一个 } → 旧的"首{到末}"整体截取把多余 } 也括进来,
    json.loads 失败)的关键。
    """
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def _iter_top_level_objects(text: str):
    """依次产出 text 里每个完整的顶层 {...} 子串(配平、尊重字符串)。跳过对象之间的散文。"""
    i, n = 0, len(text)
    while i < n:
        if text[i] == "{":
            obj = _scan_balanced_object(text, i)
            if obj is None:
                return  # 无闭合,后面不会再有完整对象
            yield obj
            i += len(obj)
        else:
            i += 1


def extract_json(text: str) -> Dict[str, Any]:
    """从模型回复里容错抽取 JSON 动作对象。失败返回空 dict(交由上层 reformat)。

    容忍:```json 围栏、对象前后的散文/多余 }。扫描每个候选源(围栏内容、全文)里的
    **所有顶层对象**,逐个解析,**优先返回含 "action" 键的对象**——从而正确处理"数据 JSON
    在前、合法 action 在后"的情况。都没有 action 时回退首个可解析对象;仍无则"首{到末}"兜底。
    真正非 JSON(纯散文 / <action> XML / ```sql 无对象)仍返回空 dict——不臆造动作。
    """
    if not text:
        return {}
    candidates = []
    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if fenced:
        candidates.append(fenced.group(1))
    candidates.append(text)
    for candidate in candidates:
        if candidate.find("{") == -1:
            continue
        parsed = []
        for chunk in _iter_top_level_objects(candidate):
            try:
                parsed.append(json.loads(chunk))
            except Exception:  # noqa: BLE001
                continue
        for obj in parsed:  # 优先含 action 键的对象
            if isinstance(obj, dict) and "action" in obj:
                return obj
        if parsed:
            return parsed[0]
        # 兜底:整体是一个对象但逐对象扫描漏掉(极少见)时,用首{到末}
        start, end = candidate.find("{"), candidate.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(candidate[start : end + 1])
            except Exception:  # noqa: BLE001
                pass
    return {}


def recover_sql_action(text: str) -> Dict[str, Any] | None:
    """模型未用 JSON 协议、而把要执行的 SELECT 放进 ```sql 围栏或 <run_query> 标签时,
    把它**纠错为一次 run_query 探查动作**。仅在 extract_json 拿不到合法 action 后作兜底,
    且仅当上层 profile 允许 run_query 时才会被采用。

    只识别**单条只读 SELECT/WITH 查询意图**(工具执行仍照常走 is_select_only + SQL guard +
    EXPLAIN;非只读会被拒成 observation)。这只是把"跑这条查询"的明确意图映射回协议——
    绝不把模型的**最终答案**当成功结果:最终答案仍须走 final 动作与 output_model 校验。
    非查询意图返回 None。
    """
    if not text:
        return None
    fences = re.findall(r"```(?:sql)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    tags = re.findall(r"<run_query>\s*(.*?)\s*</run_query>", text, re.DOTALL | re.IGNORECASE)

    def _is_read_query(s: str) -> bool:
        head = s.lstrip("(").lstrip().upper()
        return head.startswith("SELECT") or head.startswith("WITH")

    candidates = [s.strip().rstrip(";").strip()
                  for s in (fences + tags) if s.strip() and _is_read_query(s.strip())]
    # 多条候选 SQL:不任意选取,返回 None 交由 reformat(避免猜错跑错查询)。
    # 零候选(纯散文 / 非 SELECT 写语句)也返回 None,交上层 reformat/拒绝。
    if len(candidates) != 1:
        return None
    return {"action": "run_query", "args": {"sql": candidates[0]}}
