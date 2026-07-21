"""Shared SQL helpers for join-query and pivot-query routers."""

from __future__ import annotations

import logging
import re

import sqlglot
from sqlglot import exp

logger = logging.getLogger(__name__)
_sqlglot_logger = logging.getLogger("sqlglot")


def apply_row_limit_choice(sql: str, apply_limit: bool) -> str:
    """按用户【显式选择】决定异步/导出/保存的行数范围,不从 SQL 文本猜测来源。

    - apply_limit=False(全量):逐字执行——"全量"的准确含义是【不应用系统自动 LIMIT】,
      不是删除用户写的 LIMIT;用户自带的 LIMIT 原样生效;
    - apply_limit=True(限制):最外层缺 LIMIT 时补默认 max_query_rows;用户已写(5000/12000)
      则用用户值——默认值是"未写时的兜底",不是硬上限,绝不把 12000 压成 10000。
      判定走 has_top_level_limit(AST),不用正则/replace/数值猜测。

    旧的 remove_auto_added_limit 仅凭 "LIMIT 值 == max_query_rows" 就判为系统追加并删除,会误删
    用户手写的等值 LIMIT(复审 P1)。行数范围是用户意图,由请求显式携带。"""
    if not apply_limit:
        return sql.strip()
    from core.common.config_manager import config_manager

    try:
        max_rows = config_manager.get_app_config().max_query_rows
    except Exception:  # pylint: disable=broad-except
        max_rows = 10000
    return ensure_query_has_limit(sql.strip(), max_rows)


def get_join_type_sql(join_type: str) -> str:
    """Convert frontend join type to SQL JOIN syntax."""
    join_type = join_type.lower()
    if join_type == "inner":
        return "INNER JOIN"
    if join_type == "left":
        return "LEFT JOIN"
    if join_type == "right":
        return "RIGHT JOIN"
    if join_type in ("outer", "full_outer"):
        return "FULL OUTER JOIN"
    if join_type == "cross":
        return "CROSS JOIN"
    return "INNER JOIN"


# 解析后顶层落在这些 AST 类型上,才认为"能在末尾追加 LIMIT"。
# 白名单而非黑名单:sqlglot 认不出的 DuckDB 专有语句(RESET/LOAD/EXPLAIN/CALL/
# VACUUM 等)会退化成 Command 节点或直接解析失败,天然落在"未列出"里——不必像
# 过去那样每出现一种新语句就先在生产环境炸一次语法错误才能补上黑名单条目。
_LIMIT_ACCEPTING_TYPES = (
    exp.Select, exp.Union, exp.Except, exp.Intersect, exp.Values, exp.Pivot, exp.Subquery,
)
# sqlglot 不认识 DuckDB `TABLE t` 简写(会误解析成对字面量 "TABLE" 取别名的表达式),
# 只能单独识别这一种写法,避免相对旧黑名单实现的行为回归
_BARE_TABLE_RE = re.compile(r"^TABLE\s+\S+\s*;?\s*$", re.IGNORECASE)


def _strip_trailing_semicolon_segment(sql: str) -> str:
    """剥掉末尾分号(及其后注释段)供 AST 分类/判定使用——tokenizer 定位,字面量安全。
    `SELECT 1; -- note` 直接 parse_one 会得到 Block(多语句)而被分类拒绝、rstrip(';')
    又剥不掉注释后的分号;此处按【末 token 是否分号】裁掉该段,其余场景原样返回。"""
    prev_level = _sqlglot_logger.level
    _sqlglot_logger.setLevel(logging.ERROR)
    try:
        tokens = sqlglot.tokenize(sql, read="duckdb")
    except Exception:  # pylint: disable=broad-except
        return sql
    finally:
        _sqlglot_logger.setLevel(prev_level)
    if (
        tokens
        and tokens[-1].token_type == sqlglot.TokenType.SEMICOLON
        and (len(tokens) < 2 or tokens[-2].token_type != sqlglot.TokenType.SEMICOLON)
    ):
        # 仅剥【单个】末尾分号段;连续分号(;;)按多语句对待,交由分类拒绝(保持旧行为)
        return sql[: tokens[-1].start].rstrip()
    return sql


def statement_accepts_limit(query: str) -> bool:
    """该语句能否在末尾追加 LIMIT(SELECT/WITH/VALUES/PIVOT/UNPIVOT/集合运算等可以;
    DDL/扩展管理/PRAGMA 等不行)。

    用 AST 分类判定,未识别的语句一律判定为"不接受"——宁可不补 LIMIT,也不对
    看不懂的语句盲目追加可能引发语法错误的后缀。
    """
    stripped = _strip_trailing_semicolon_segment(query.strip())
    if _BARE_TABLE_RE.match(stripped):
        return True
    prev_level = _sqlglot_logger.level
    _sqlglot_logger.setLevel(logging.ERROR)  # 抑制"退化成 Command"告警刷屏,这里只取分类结果
    try:
        tree = sqlglot.parse_one(stripped, read="duckdb")
    except Exception:
        return False
    finally:
        _sqlglot_logger.setLevel(prev_level)
    return isinstance(tree, _LIMIT_ACCEPTING_TYPES)


def has_top_level_limit(query: str) -> bool:
    """最外层语句是否已带 LIMIT——按 sqlglot AST 判定,不用文本正则(复审 P2:
    末尾数字正则会把 `LIMIT 5 -- comment` 误判为无 LIMIT、再追加出双 LIMIT 语法错误)。

    - CTE(WITH…SELECT…LIMIT)/UNION 等集合运算的 LIMIT 归属由 AST 决定;
    - 仅子查询内的 LIMIT 属于用户业务 SQL,不算"最外层已有"(外层默认仍可应用);
    - 解析失败 → 保守返回 True(宁可不追加,也不对看不懂的语句盲目改写)。
    """
    stripped = _strip_trailing_semicolon_segment(query.strip())
    prev_level = _sqlglot_logger.level
    _sqlglot_logger.setLevel(logging.ERROR)
    try:
        tree = sqlglot.parse_one(stripped, read="duckdb")
    except Exception:  # pylint: disable=broad-except
        return True
    finally:
        _sqlglot_logger.setLevel(prev_level)
    if tree is None:
        return True
    return tree.args.get("limit") is not None


def _append_top_level_limit(sql: str, default_limit: int) -> str:
    """把 `LIMIT n` 插到语句末尾的正确位置——用 sqlglot tokenizer 定位【末尾分号】:
    - `SELECT 1; -- note`:endswith(';') 为假、rstrip(';') 也剥不掉,直接尾拼会落在分号
      之后变成第二条语句(语法错误);tokenizer 给出分号的真实下标,LIMIT 插到分号前、
      分号与其后注释原样保留(复审:分号+注释);
    - 字面量安全:分号/注释符若在字符串字面量内,属于 STRING token,不会被误认;
    - 无末尾分号则换行追加(行尾注释只吞到行末,不影响下一行的 LIMIT)。
    """
    clause = f"LIMIT {default_limit}"
    prev_level = _sqlglot_logger.level
    _sqlglot_logger.setLevel(logging.ERROR)
    try:
        tokens = sqlglot.tokenize(sql, read="duckdb")
    except Exception:  # pylint: disable=broad-except
        tokens = None
    finally:
        _sqlglot_logger.setLevel(prev_level)
    if (
        tokens
        and tokens[-1].token_type == sqlglot.TokenType.SEMICOLON
        and (len(tokens) < 2 or tokens[-2].token_type != sqlglot.TokenType.SEMICOLON)
    ):
        i = tokens[-1].start
        head = sql[:i].rstrip()
        return f"{head}\n{clause}{sql[i:]}"
    return f"{sql.rstrip()}\n{clause}"


def ensure_query_has_limit(query: str, default_limit: int = 1000) -> str:
    """最外层缺 LIMIT 时追加默认值(仅对可接受 LIMIT 的语句)。

    默认值语义:用户【未写】最外层 LIMIT 时的兜底,不是硬上限——用户写了 12000 就用 12000,
    绝不压缩。追加用换行分隔(`\\nLIMIT n`):原 SQL 以行尾注释结尾时,同行拼接会把 LIMIT
    吞进注释里。判定走 has_top_level_limit(AST),不用正则。
    """
    query_stripped = query.strip()

    if not statement_accepts_limit(query_stripped):
        return query
    if has_top_level_limit(query_stripped):
        return query

    return _append_top_level_limit(query_stripped, default_limit)


def prepare_query_for_embedding(query: str) -> str:
    """Return one query without its terminal delimiter, ready for ``COPY (...)``."""
    return _strip_trailing_semicolon_segment(query.strip())
