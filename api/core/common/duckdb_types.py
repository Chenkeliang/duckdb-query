"""DuckDB 类型词表与判定 —— 后端唯一入口(与 frontend/src/utils/duckdbTypes.ts 镜像)。

三层原则(改动需前后端同步):
1. 机器层(SQL 生成/存储/传输)只使用 DuckDB 规范类型名;
2. 判定层先经 normalize_duckdb_type 把任何来路的类型名(DuckDB 别名、
   MySQL/PG 源库原生名)归一到规范名,再按家族集合判定;
3. cast 目标必须过 validate_cast_type 白名单——它们最终原样拼进
   TRY_CAST(... AS X),白名单同时挡注入形串与"裸 DECIMAL"(隐性 18,3)。

规范名与别名均以 DuckDB 1.5.3 实测为准(duckdb_types() + typeof() 探测)。
禁止在其他模块另建类型名列表。
"""
from __future__ import annotations

import re
from typing import Optional

# 别名/源库原生名 -> DuckDB 规范名。
# 上半部:DuckDB 自身别名(实测归宿)。注意 INT1/2/4/8 按字节数命名:
# INT8 = 8 字节 = BIGINT,不是 8 位整数。
# 下半部:联邦场景的源库原生名(表详情接口直读源库 information_schema)。
TYPE_ALIASES = {
    # —— DuckDB 别名(实测) ——
    "INT": "INTEGER", "INT4": "INTEGER", "INT32": "INTEGER", "SIGNED": "INTEGER",
    "INT8": "BIGINT", "INT64": "BIGINT", "LONG": "BIGINT", "OID": "BIGINT",
    "INT2": "SMALLINT", "INT16": "SMALLINT", "SHORT": "SMALLINT",
    "INT1": "TINYINT",
    "INT128": "HUGEINT",
    "UINT8": "UTINYINT", "UINT16": "USMALLINT", "UINT32": "UINTEGER",
    "UINT64": "UBIGINT", "UINT128": "UHUGEINT",
    "FLOAT4": "FLOAT", "REAL": "FLOAT",
    "FLOAT8": "DOUBLE",
    "DEC": "DECIMAL", "NUMERIC": "DECIMAL",
    "CHAR": "VARCHAR", "BPCHAR": "VARCHAR", "TEXT": "VARCHAR",
    "STRING": "VARCHAR", "NVARCHAR": "VARCHAR",
    "DATETIME": "TIMESTAMP",
    "TIMESTAMPTZ": "TIMESTAMP WITH TIME ZONE",
    "TIMETZ": "TIME WITH TIME ZONE",
    "BOOL": "BOOLEAN", "LOGICAL": "BOOLEAN",
    "BYTEA": "BLOB", "BINARY": "BLOB", "VARBINARY": "BLOB",
    "GUID": "UUID", "BITSTRING": "BIT", "VARINT": "BIGNUM",
    # —— 源库原生名(MySQL / PostgreSQL) ——
    "TIMESTAMP WITHOUT TIME ZONE": "TIMESTAMP",
    "TIME WITHOUT TIME ZONE": "TIME",
    "CHARACTER VARYING": "VARCHAR", "CHARACTER": "VARCHAR",
    "DOUBLE PRECISION": "DOUBLE",
    "MEDIUMINT": "INTEGER",
    "SERIAL": "INTEGER", "BIGSERIAL": "BIGINT", "SMALLSERIAL": "SMALLINT",
    "TINYINT UNSIGNED": "UTINYINT", "SMALLINT UNSIGNED": "USMALLINT",
    "MEDIUMINT UNSIGNED": "UINTEGER", "INT UNSIGNED": "UINTEGER",
    "INTEGER UNSIGNED": "UINTEGER", "BIGINT UNSIGNED": "UBIGINT",
    "TINYTEXT": "VARCHAR", "MEDIUMTEXT": "VARCHAR", "LONGTEXT": "VARCHAR",
    "TINYBLOB": "BLOB", "MEDIUMBLOB": "BLOB", "LONGBLOB": "BLOB",
}

_INTEGER_TYPES = frozenset({
    "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT",
    "UTINYINT", "USMALLINT", "UINTEGER", "UBIGINT", "UHUGEINT",
    "BIGNUM",
})
_FLOAT_TYPES = frozenset({"FLOAT", "DOUBLE"})

# 数字参数括号(DECIMAL(18,4)/VARCHAR(255)/TIMESTAMP(0) WITHOUT TIME ZONE)
_PARAM_PARENS = re.compile(r"\(\s*\d[^)]*\)")


def normalize_duckdb_type(type_str: Optional[str]) -> str:
    """任何来路的类型串 -> DuckDB 规范名(与前端 normalizeTypeName 同步)。

    normalize_duckdb_type('datetime') == 'TIMESTAMP'          # MySQL
    normalize_duckdb_type('timestamp(0) without time zone') == 'TIMESTAMP'
    normalize_duckdb_type('bigint unsigned') == 'UBIGINT'
    normalize_duckdb_type('INT8') == 'BIGINT'                 # 8 字节!
    normalize_duckdb_type('DECIMAL(18,4)') == 'DECIMAL'
    normalize_duckdb_type('INTEGER[]') == 'ARRAY'
    """
    if not type_str:
        return "UNKNOWN"
    upper = type_str.strip().upper()
    if not upper:
        return "UNKNOWN"
    if "[" in upper:
        return "ARRAY"
    upper = _PARAM_PARENS.sub(" ", upper)
    paren = upper.find("(")
    if paren > 0:  # STRUCT(...)/MAP(...)/ENUM(...) 截断到主名
        upper = upper[:paren]
    upper = " ".join(upper.split())
    if not upper:
        return "UNKNOWN"
    return TYPE_ALIASES.get(upper, upper)


def is_numeric_type(type_str: Optional[str]) -> bool:
    """整数/浮点/DECIMAL/BIGNUM(别名与源库名先归一)。"""
    normalized = normalize_duckdb_type(type_str)
    return (
        normalized in _INTEGER_TYPES
        or normalized in _FLOAT_TYPES
        or normalized == "DECIMAL"
    )


def is_integer_type(type_str: Optional[str]) -> bool:
    return normalize_duckdb_type(type_str) in _INTEGER_TYPES


def is_date_or_timestamp_type(type_str: Optional[str]) -> bool:
    """日期或时间戳(排除 TIME/INTERVAL)。MySQL datetime / PG
    timestamp without time zone 归一后同样命中。"""
    normalized = normalize_duckdb_type(type_str)
    return normalized == "DATE" or normalized.startswith("TIMESTAMP")


# TRY_CAST 合法目标:可作转换目标的规范标量类型(复杂/嵌套类型不可作
# cast 目标;ENUM 需类型定义也排除)。白名单管"是不是合法 DuckDB 类型",
# UI 的 DUCKDB_CAST_TYPES 管"推荐给用户什么"——两层分离,故 INTEGER
# 等未在 UI 列表的规范类型在此仍合法。
_CAST_TARGET_TYPES = frozenset({
    "BOOLEAN",
    "TINYINT", "SMALLINT", "INTEGER", "BIGINT", "HUGEINT",
    "UTINYINT", "USMALLINT", "UINTEGER", "UBIGINT", "UHUGEINT",
    "FLOAT", "DOUBLE", "BIGNUM",
    "VARCHAR",
    "DATE", "TIME", "TIMESTAMP",
    "TIMESTAMP WITH TIME ZONE", "TIME WITH TIME ZONE",
    "TIMESTAMP_S", "TIMESTAMP_MS", "TIMESTAMP_NS",
    "INTERVAL", "BLOB", "UUID", "JSON", "BIT",
})

# DECIMAL/NUMERIC/DEC 必须带完整 (precision, scale)
_DECIMAL_FORM = re.compile(
    r"^(?:DECIMAL|NUMERIC|DEC)\s*\(\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)$"
)


def validate_cast_type(raw: str) -> str:
    """校验 TRY_CAST 目标类型并返回规范拼写;非法抛 ValueError。

    这些串最终原样拼进 SQL,必须白名单化:
    - 只接受规范标量类型(别名先归一,如 int8 -> BIGINT、numeric 带参 -> DECIMAL);
    - DECIMAL 必须带完整 (p,s) 且 p<=38、s<=p —— 裸 DECIMAL 是隐性
      DECIMAL(18,3),对金额/高精度值有损,直接拒绝;
    - 其余一切串(含注入形如 "VARCHAR),(1")拒绝。
    """
    cleaned = " ".join((raw or "").strip().upper().split())
    if not cleaned:
        raise ValueError("Cast type cannot be empty")

    decimal_match = _DECIMAL_FORM.match(cleaned)
    if decimal_match:
        precision, scale = int(decimal_match.group(1)), int(decimal_match.group(2))
        if not 1 <= precision <= 38:
            raise ValueError(f"DECIMAL precision must be 1..38, got {precision}")
        if scale > precision:
            raise ValueError(
                f"DECIMAL scale {scale} exceeds precision {precision}"
            )
        return f"DECIMAL({precision},{scale})"

    normalized = normalize_duckdb_type(cleaned)
    if normalized == "DECIMAL":
        raise ValueError(
            "Bare DECIMAL is implicitly DECIMAL(18,3) and silently lossy; "
            "specify full form like DECIMAL(38,6)"
        )
    if normalized in _CAST_TARGET_TYPES:
        return normalized
    raise ValueError(f"Unsupported cast type: {raw!r}")
