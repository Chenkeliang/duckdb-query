"""extract_json 容错回归:用真实模型抓到的非法回复形态锁定行为。

数据来源:1.3.0 冻结版对 scenario 03/20/24/跨表发现连跑时,_log_protocol_miss 记录的
原始非法响应(engine-stderr.log)。observed protocol_violation 100% 是"合法 action JSON
末尾多一个 }",故必须能配平恢复;真正非 JSON(散文/<action>XML/```sql)仍返回空 dict,
交上层 reformat,绝不臆造动作。
"""

from core.services.ai_json_protocol import extract_json, recover_sql_action


# ---- 真实非法形态:必须配平恢复(这些是实测 protocol_violation 的根因) ----

def test_trailing_extra_brace_recovered():
    """实测 give_up 形态:合法 action JSON 末尾多一个 }。旧解析 json.loads 整体失败。"""
    raw = ('{"action":"run_query","args":{"sql":"SELECT order_id, note, amount '
           'FROM agent_eval_orders WHERE order_id = 113"}}}')
    out = extract_json(raw)
    assert out.get("action") == "run_query"
    assert out["args"]["sql"].startswith("SELECT order_id")


def test_trailing_brace_with_multiline_sql_recovered():
    """实测:多行 SQL(含 \\n、单引号)+ 末尾多一个 }。字符串内不得误配平。"""
    raw = ('{"action":"run_query","args":{"sql":"WITH ca AS (\\n  SELECT order_city, '
           "AVG(amount) AS a FROM agent_eval_orders WHERE status = '已支付' GROUP BY order_city\\n)"
           '\\nSELECT o.order_id FROM agent_eval_orders o JOIN ca ON o.order_city=ca.order_city"}}}')
    out = extract_json(raw)
    assert out.get("action") == "run_query"
    assert "WITH ca AS" in out["args"]["sql"]


def test_prose_prefix_then_json_recovered():
    """实测:模型先写分析散文,再给 JSON 动作。配平扫描从首 { 起,忽略前缀噪声。"""
    raw = ('分析：需要按 order_city 计算已支付均值再筛选。已支付状态为 "已支付"。'
           '{"action":"run_query","args":{"sql":"SELECT 1"}}')
    out = extract_json(raw)
    assert out.get("action") == "run_query"


def test_fenced_json_with_nested_result_recovered():
    """```json 围栏 + 嵌套 result 对象(data_qa final 常态)。"""
    raw = ('```json\n{"action":"final","result":{"content":"共 9 笔","sql":"SELECT 1",'
           '"evidence":["t1"]}}\n```')
    out = extract_json(raw)
    assert out.get("action") == "final"
    assert out["result"]["content"] == "共 9 笔"


def test_braces_inside_string_not_miscounted():
    """字符串值里的 { } 不参与配平(否则会提前截断)。"""
    raw = '{"action":"final","result":{"content":"用 {x} 占位 } 符号","sql":null,"evidence":[]}}'
    out = extract_json(raw)
    assert out["result"]["content"] == "用 {x} 占位 } 符号"


# ---- 真正非 JSON:必须返回空 dict(→ reformat),绝不臆造 ----

def test_prose_only_returns_empty():
    assert extract_json("我来查询已支付订单扣除关联退款后的净额。先验证一下关联情况。") == {}


def test_sql_fence_without_json_returns_empty():
    assert extract_json("```sql\nSELECT order_id FROM agent_eval_orders\n```") == {}


def test_xml_action_form_returns_empty():
    raw = "<action>\n<run_query>\nSELECT 1\n</run_query>\n</action>"
    assert extract_json(raw) == {}


def test_empty_and_garbage_return_empty():
    assert extract_json("") == {}
    assert extract_json("no braces here") == {}
    assert extract_json("{ not valid json ]") == {}


# ---- 基础形态仍正常 ----

def test_plain_valid_json():
    assert extract_json('{"action":"final","result":{}}')["action"] == "final"


def test_trailing_prose_after_object_ignored():
    """对象后跟解释性散文:配平扫描只取对象本身。"""
    out = extract_json('{"action":"run_query","args":{"sql":"SELECT 1"}}\n\n以上是我的查询。')
    assert out.get("action") == "run_query"


# ---- Bug 6a:多个顶层对象时优先含 action 键的那个(数据 JSON 在前、动作在后) ----

def test_data_object_before_action_object_prefers_action():
    """实测形态:模型先吐一段数据/思考 JSON,再给合法 action 对象。
    旧 extract_json 只取第一个 {...} → 拿到无 action 的对象 → 误判 protocol_violation。"""
    raw = ('{"summary":"已支付订单共 9 笔","rows":3} '
           '{"action":"final","result":{"content":"共 9 笔","sql":"SELECT 1","evidence":["t1"]}}')
    out = extract_json(raw)
    assert out.get("action") == "final"
    assert out["result"]["content"] == "共 9 笔"


def test_no_action_anywhere_falls_back_to_first_object():
    """都没有 action 键时,回退第一个可解析对象(交上层判 json_without_action_key)。"""
    out = extract_json('{"foo":1} {"bar":2}')
    assert out == {"foo": 1}


# ---- Bug 3:normalize_sql 只去首尾空白+尾分号,内部严格保留(防"执行 A 回答 B"绕过) ----

def test_normalize_sql_preserves_internal_whitespace():
    from core.services.ai_sql_validation import normalize_sql
    a = normalize_sql("SELECT 'a  b'")   # 字面量内两个空格
    b = normalize_sql("SELECT 'a b'")    # 一个空格
    assert a != b                        # 绝不折叠内部空白 → 不碰撞
    assert normalize_sql("  SELECT 1 ;  ") == "SELECT 1"  # 仅去首尾空白+尾分号
    assert normalize_sql("SELECT 1\n-- c  d\n") == "SELECT 1\n-- c  d"  # 注释内空白保留


# ---- recover_sql_action:把 ```sql/<run_query> 意图纠错为 run_query 探查(实测残余形态) ----

def test_recover_run_query_from_prose_plus_sql_fence():
    """实测残余 protocol_violation:散文 + ```sql 围栏 → 恢复为 run_query 探查。"""
    raw = ("我先查看订单和退款的关联情况，再计算净额。\n\n```sql\n"
           "SELECT o.order_id, o.amount, r.refund_amount\n"
           "FROM agent_eval_orders o LEFT JOIN agent_eval_refunds r ON o.order_id = r.order_id\n```")
    act = recover_sql_action(raw)
    assert act["action"] == "run_query"
    assert act["args"]["sql"].startswith("SELECT o.order_id")


def test_recover_run_query_from_with_cte_fence():
    raw = "```sql\nWITH ca AS (SELECT order_city, AVG(amount) a FROM t GROUP BY order_city)\nSELECT * FROM ca\n```"
    act = recover_sql_action(raw)
    assert act["action"] == "run_query" and act["args"]["sql"].startswith("WITH")


def test_recover_run_query_from_xml_tag():
    raw = "<action>\n<run_query>\nSELECT 1\n</run_query>\n</action>"
    act = recover_sql_action(raw)
    assert act["action"] == "run_query" and act["args"]["sql"] == "SELECT 1"


def test_recover_returns_none_for_prose_only():
    assert recover_sql_action("我来查询已支付订单扣除退款后的净额。先验证关联情况。") is None


def test_recover_rejects_write_sql_in_fence():
    """安全边界:代码块里的写 SQL(DELETE/UPDATE/DROP/INSERT/TRUNCATE)不恢复。"""
    for stmt in ("DELETE FROM t", "UPDATE t SET x=1", "DROP TABLE t",
                 "INSERT INTO t VALUES (1)", "TRUNCATE t"):
        assert recover_sql_action(f"```sql\n{stmt}\n```") is None, stmt


def test_recover_multiple_candidates_returns_none():
    """安全边界:多条候选 SQL 不任意选取,返回 None 交由 reformat。"""
    raw = "先看 A：\n```sql\nSELECT 1\n```\n再看 B：\n```sql\nSELECT 2\n```"
    assert recover_sql_action(raw) is None


def test_recover_with_cte_write_still_recovered_but_tool_rejects():
    """WITH...DELETE 能骗过头部判断(以 WITH 开头),但恢复出的 SQL 仍非只读——
    工具层 is_select_only 会拒绝(纵深防御,见 test_ai_agent_tools 工具级回归)。"""
    from core.services.ai_sql_validation import is_select_only
    act = recover_sql_action("```sql\nWITH c AS (SELECT 1) DELETE FROM t\n```")
    assert act is not None and act["action"] == "run_query"
    assert is_select_only(act["args"]["sql"]) is False  # 下游必拒
