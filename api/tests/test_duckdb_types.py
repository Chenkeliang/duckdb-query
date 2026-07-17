"""类型词表与 cast 白名单回归(core.common.duckdb_types)。

背景:早期前后端散落多套类型词表,混入伪类型名与有损转换目标;
cast 目标仅字符集正则校验,挡不住括号构形注入与裸 DECIMAL(隐性 18,3)。
本套测试钉死:别名/源库原生名归一、家族判定、白名单校验三件事。
"""
import pytest

from core.common.duckdb_types import (
    is_date_or_timestamp_type,
    is_integer_type,
    is_numeric_type,
    normalize_duckdb_type,
    validate_cast_type,
)


class TestNormalize:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            # DuckDB 别名(1.5.3 实测):INT8 是 8 字节 = BIGINT,不是 8 位
            ("INT8", "BIGINT"),
            ("int64", "BIGINT"),
            ("LONG", "BIGINT"),
            ("INT4", "INTEGER"),
            ("INT2", "SMALLINT"),
            ("INT128", "HUGEINT"),
            ("UINT64", "UBIGINT"),
            ("FLOAT8", "DOUBLE"),
            ("REAL", "FLOAT"),
            ("NUMERIC", "DECIMAL"),
            ("TEXT", "VARCHAR"),
            ("CHAR(10)", "VARCHAR"),
            ("BOOL", "BOOLEAN"),
            ("BYTEA", "BLOB"),
            ("GUID", "UUID"),
            ("TIMESTAMPTZ", "TIMESTAMP WITH TIME ZONE"),
            # 源库原生名(联邦表详情直读 information_schema)
            ("datetime", "TIMESTAMP"),
            ("timestamp without time zone", "TIMESTAMP"),
            ("timestamp(3) without time zone", "TIMESTAMP"),
            ("time without time zone", "TIME"),
            ("character varying", "VARCHAR"),
            ("character varying(255)", "VARCHAR"),
            ("double precision", "DOUBLE"),
            ("bigint unsigned", "UBIGINT"),
            ("int unsigned", "UINTEGER"),
            ("mediumtext", "VARCHAR"),
            ("mediumint", "INTEGER"),
            # 参数/数组/嵌套
            ("DECIMAL(38,19)", "DECIMAL"),
            ("INTEGER[]", "ARRAY"),
            ("DECIMAL(18,3)[]", "ARRAY"),
            ("STRUCT(a INTEGER)", "STRUCT"),
            ("MAP(VARCHAR, INTEGER)", "MAP"),
            # 规范名原样通过
            ("TIMESTAMP_NS", "TIMESTAMP_NS"),
            ("HUGEINT", "HUGEINT"),
            ("VARIANT", "VARIANT"),
        ],
    )
    def test_normalizes_to_canonical(self, raw, expected):
        assert normalize_duckdb_type(raw) == expected

    def test_empty_and_none(self):
        assert normalize_duckdb_type(None) == "UNKNOWN"
        assert normalize_duckdb_type("  ") == "UNKNOWN"


class TestPredicates:
    def test_numeric_covers_aliases_and_source_native(self):
        for t in ("BIGINT", "DECIMAL(38,2)", "numeric", "int8",
                  "bigint unsigned", "double precision", "FLOAT4"):
            assert is_numeric_type(t), t
        for t in ("VARCHAR", "TIMESTAMP", "INTERVAL", "BOOLEAN", "JSON"):
            assert not is_numeric_type(t), t

    def test_integer_family_excludes_interval(self):
        # 回归:前端曾用 includes('INT') 判整数,INTERVAL/VARINT 被误伤
        assert is_integer_type("BIGINT")
        assert is_integer_type("int8")
        assert not is_integer_type("INTERVAL")
        assert not is_integer_type("DECIMAL(18,2)")

    def test_date_or_timestamp_recognizes_source_native(self):
        # 回归:曾不认 MySQL datetime / PG timestamp without time zone,
        # 联邦 JOIN 误报类型冲突
        for t in ("DATE", "TIMESTAMP", "TIMESTAMP_NS", "datetime",
                  "timestamp(0) without time zone", "TIMESTAMPTZ"):
            assert is_date_or_timestamp_type(t), t
        for t in ("TIME", "INTERVAL", "VARCHAR", "time without time zone"):
            assert not is_date_or_timestamp_type(t), t


class TestValidateCastType:
    def test_accepts_canonical_scalars(self):
        assert validate_cast_type("VARCHAR") == "VARCHAR"
        assert validate_cast_type(" bigint ") == "BIGINT"
        assert validate_cast_type("timestamp") == "TIMESTAMP"

    def test_normalizes_aliases_to_canonical_spelling(self):
        assert validate_cast_type("int8") == "BIGINT"
        assert validate_cast_type("text") == "VARCHAR"
        assert validate_cast_type("datetime") == "TIMESTAMP"

    def test_accepts_full_decimal_and_normalizes_numeric(self):
        assert validate_cast_type("DECIMAL(38,6)") == "DECIMAL(38,6)"
        assert validate_cast_type("decimal( 18 , 4 )") == "DECIMAL(18,4)"
        assert validate_cast_type("NUMERIC(10,2)") == "DECIMAL(10,2)"

    def test_rejects_bare_decimal_as_silently_lossy(self):
        # 裸 DECIMAL 是隐性 DECIMAL(18,3):金额/高精度值静默截断
        for raw in ("DECIMAL", "decimal", "NUMERIC", "DEC"):
            with pytest.raises(ValueError):
                validate_cast_type(raw)

    def test_rejects_decimal_capacity_violations(self):
        with pytest.raises(ValueError):
            validate_cast_type("DECIMAL(39,2)")   # p > 38
        with pytest.raises(ValueError):
            validate_cast_type("DECIMAL(10,11)")  # s > p

    def test_rejects_injection_shaped_strings(self):
        # 旧字符集正则 [A-Z0-9_(),\s]+ 全部放行这些——白名单必须拒绝
        for raw in ("VARCHAR),(1", "BIGINT) AS X FROM T --",
                    "DECIMAL(18,4)) OR (1", "INTEGER, 2"):
            with pytest.raises(ValueError):
                validate_cast_type(raw)

    def test_rejects_unknown_and_non_castable(self):
        for raw in ("NAME", "SUPERTYPE", "", "STRUCT", "MAP", "ENUM"):
            with pytest.raises(ValueError):
                validate_cast_type(raw)


class TestModelIntegration:
    def test_join_condition_cast_whitelisted(self):
        from models.query_models import JoinCondition

        good = JoinCondition.model_validate({
            "left_column": "id", "right_column": "id",
            "left_cast": "text", "right_cast": "DECIMAL(18,4)",
        })
        assert good.left_cast == "VARCHAR"          # 别名归一到规范拼写
        assert good.right_cast == "DECIMAL(18,4)"

        with pytest.raises(Exception):
            JoinCondition.model_validate({
                "left_column": "id", "right_column": "id",
                "left_cast": "VARCHAR),(1",          # 旧字符集正则放行的注入形串
            })
        with pytest.raises(Exception):
            JoinCondition.model_validate({
                "left_column": "id", "right_column": "id",
                "left_cast": "DECIMAL",              # 裸 DECIMAL 拒绝
            })

    def test_pivot_type_conversion_validated(self):
        from models.pivot_query_models import PivotValueConfig

        v = PivotValueConfig.model_validate({
            "column": "amt", "aggregation": "SUM", "typeConversion": "decimal(38,6)",
        })
        assert v.typeConversion == "DECIMAL(38,6)"

        auto = PivotValueConfig.model_validate({
            "column": "amt", "aggregation": "SUM", "typeConversion": "auto",
        })
        assert auto.typeConversion == "auto"        # 哨兵原样放行

        with pytest.raises(Exception):
            PivotValueConfig.model_validate({
                "column": "amt", "aggregation": "SUM", "typeConversion": "decimal",
            })

    def test_resolved_type_cast_validated(self):
        from models.pivot_query_models import ResolvedTypeCast

        ok = ResolvedTypeCast.model_validate({"column": "c", "cast": "int8"})
        assert ok.cast == "BIGINT"
        with pytest.raises(Exception):
            ResolvedTypeCast.model_validate({"column": "c", "cast": "VARCHAR),(1"})
