"""Typed MySQL candidate predicates without changing DuckDB relational semantics.

Source identifiers are patched at tokenizer spans; unsupported expressions stay
local. Exact count compilation is separately guarded and transports BIGINT text.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import datetime
from decimal import Decimal, InvalidOperation
import re
from typing import Any, Optional

import sqlglot
from sqlglot import exp
from sqlglot.optimizer.scope import Scope, traverse_scope

from core.common.sql_identifiers import escape_string_literal, quote_identifier
from core.common.utils import _ASCII_FOLD

MAX_CANDIDATE_SQL_BYTES = 1_000_000
_TEXT_TYPES = {"varchar", "tinytext", "text", "mediumtext", "longtext"}
_CHARSETS = {"utf8", "utf8mb3", "utf8mb4"}
_INTEGER_TYPES = {"TINYINT", "UTINYINT", "SMALLINT", "USMALLINT", "INTEGER", "UINTEGER", "BIGINT", "UBIGINT"}
_DIRECT_TYPES = {"FLOAT", "DOUBLE", "BLOB", "DATE", "TIMESTAMP", "TIME"}


def fold_identifier(value: str) -> str:
    return value.translate(_ASCII_FOLD)


def mysql_identifier(value: str) -> str:
    return exp.to_identifier(value, quoted=True).sql(dialect="mysql")


def mysql_text_literal(value: str) -> str:
    """Encode constants independently of MySQL backslash and quote SQL modes."""
    return "_utf8mb4 X'" + value.encode("utf-8").hex() + "'"


def mysql_query_sql(alias: str, sql: str) -> str:
    return (
        f"mysql_query('{escape_string_literal(alias)}', "
        f"'{escape_string_literal(sql)}', stream_results=true)"
    )


@dataclass
class MySQLColumn:
    name: str
    duckdb_type: str
    mysql_type: str
    charset: Optional[str]


@dataclass
class MySQLSource:
    node: exp.Table
    scope: Scope
    alias: str
    connection_alias: str
    database: str
    table: str
    span: tuple[int, int]
    columns: list[MySQLColumn] = field(default_factory=list)
    predicates: list[tuple[str, list[str]]] = field(default_factory=list)
    temporary_name: Optional[str] = None
    conditions: list[exp.Expression] = field(default_factory=list)
    numeric_keys: list[tuple[str, list[Any]]] = field(default_factory=list)
    replacement_sql: Optional[str] = None
    key_ranges: list[tuple[str, Any, Any]] = field(default_factory=list)


def _identifier_span(parts: list[exp.Expression]) -> Optional[tuple[int, int]]:
    if not parts or any("start" not in part.meta or "end" not in part.meta for part in parts):
        return None
    return min(part.meta["start"] for part in parts), max(part.meta["end"] for part in parts) + 1


def _and_terms(node: Optional[exp.Expression]):
    if isinstance(node, exp.Paren):
        yield from _and_terms(node.this)
    elif isinstance(node, exp.And):
        yield from _and_terms(node.left)
        yield from _and_terms(node.right)
    elif node is not None:
        yield node


def _column_belongs(column: exp.Column, source: MySQLSource) -> bool:
    if column.table:
        if fold_identifier(column.table) != fold_identifier(source.alias):
            return False
        if column.db or column.catalog:
            if source.node.alias:
                return False
            actual = [fold_identifier(part.name) for part in column.parts[:-1]]
            expected = [fold_identifier(part.name) for part in source.node.parts]
            return actual == expected[-len(actual):]
        return True
    return len(source.scope.selected_sources) == 1


def _is_null_constant(value: exp.Expression) -> bool:
    """Recognize typed NULL without evaluating or folding non-NULL expressions."""
    value = value.unnest()
    if isinstance(value, exp.Cast) and value.to.this not in {exp.DataType.Type.TEXT, exp.DataType.Type.VARCHAR}:
        # A numeric typed NULL can coerce the entire IN list: '1' IN
        # ('01', NULL::INTEGER) is true. Do not narrow that comparison as text.
        return False
    while isinstance(value, (exp.Paren, exp.Cast)):
        value = value.this
    return isinstance(value, exp.Null)


def source_predicates(source: MySQLSource, key_limit: int) -> list[tuple[str, list[str]]]:
    """Collect positive literal necessities; never descend through OR or NOT."""
    where = source.scope.expression.args.get("where")
    output = []
    for term in _and_terms(where.this if where is not None else None):
        column = None
        values = []
        if isinstance(term, exp.EQ):
            if isinstance(term.left, exp.Column) and (isinstance(term.right, exp.Literal) or _is_null_constant(term.right)):
                column, values = term.left, [term.right]
            elif isinstance(term.right, exp.Column) and (isinstance(term.left, exp.Literal) or _is_null_constant(term.left)):
                column, values = term.right, [term.left]
        elif isinstance(term, exp.In) and isinstance(term.this, exp.Column) and not term.args.get("query"):
            column, values = term.this, list(term.expressions)
        if column is None or not _column_belongs(column, source) or not values or len(values) > key_limit:
            continue
        if any(not _is_null_constant(value) and not (isinstance(value, exp.Literal) and value.is_string) for value in values):
            continue
        output.append((column.name, [str(value.this) for value in values if isinstance(value, exp.Literal)]))
    return output


def find_mysql_sources(
    sql: str, attach_configs: list[tuple[str, dict[str, Any]]], key_limit: int,
) -> tuple[list[MySQLSource], Optional[exp.Expression]]:
    """Resolve physical sources with scope-aware CTE and alias handling."""
    tree = sqlglot.parse_one(sql, read="duckdb")
    if not isinstance(tree, exp.Query) or tree.find(exp.TableSample) is not None:
        return [], tree
    scopes = list(traverse_scope(tree))
    if any(scope.is_correlated_subquery for scope in scopes):
        return [], tree
    configs = {
        fold_identifier(alias): (alias, config)
        for alias, config in attach_configs
        if str(config.get("type", "")).lower() == "mysql"
    }
    sources = []
    for scope in scopes:
        for alias, (_node, table) in scope.selected_sources.items():
            if not isinstance(table, exp.Table) or not isinstance(table.this, exp.Identifier):
                continue
            table_alias = table.args.get("alias")
            if table_alias is not None and table_alias.args.get("columns"):
                # Positional aliases can rename a different physical column to
                # the predicate's name. Do not infer that mapping here.
                continue
            if any(value for key, value in table.args.items() if key not in {"this", "db", "catalog", "alias"}):
                continue
            binding = configs.get(fold_identifier(table.catalog or table.db or ""))
            if binding is None:
                continue
            connection_alias, config = binding
            span = _identifier_span(table.parts)
            if span is None:
                continue
            # Check tokenizer offsets before changing source text (including Unicode).
            parsed_ref = sqlglot.parse_one(sql[span[0]:span[1]], into=exp.Table, read="duckdb")
            if [part.name for part in parsed_ref.parts] != [part.name for part in table.parts]:
                continue
            source = MySQLSource(
                node=table, scope=scope, alias=alias,
                connection_alias=connection_alias,
                database=table.db if table.catalog else str(config.get("database", "")),
                table=table.name, span=span,
            )
            if any(
                fold_identifier(column.table) == fold_identifier(alias)
                and (column.db or column.catalog) and not _column_belongs(column, source)
                for column in scope.columns
            ):
                continue
            source.predicates = source_predicates(source, key_limit)
            where = scope.expression.args.get("where")
            source.conditions = list(_and_terms(where.this if where is not None else None))
            sources.append(source)
    return sources, tree


def read_source_columns(connection, source: MySQLSource) -> list[MySQLColumn]:
    """Use metadata only; reject ambiguous or unsupported schema descriptions."""
    table = source.node.copy()
    table.set("alias", None)
    described = connection.execute("DESCRIBE " + table.sql(dialect="duckdb")).fetchall()
    metadata_sql = (
        "SELECT c.COLUMN_NAME, c.DATA_TYPE, c.CHARACTER_SET_NAME "
        "FROM information_schema.COLUMNS c JOIN information_schema.TABLES t "
        "ON c.TABLE_SCHEMA=t.TABLE_SCHEMA AND c.TABLE_NAME=t.TABLE_NAME "
        "WHERE t.TABLE_TYPE='BASE TABLE' AND c.TABLE_SCHEMA=" + mysql_text_literal(source.database)
        + " AND c.TABLE_NAME=" + mysql_text_literal(source.table) + " ORDER BY c.ORDINAL_POSITION"
    )
    metadata = connection.execute("SELECT * FROM " + mysql_query_sql(source.connection_alias, metadata_sql)).fetchall()
    if not described or [row[0] for row in described] != [row[0] for row in metadata]:
        return []
    return [MySQLColumn(str(d[0]), str(d[1]), str(m[1]).lower(), m[2]) for d, m in zip(described, metadata)]


def needed_columns(source: MySQLSource) -> list[MySQLColumn]:
    """Keep every potentially referenced column; do not narrow ambiguous names."""
    if any(join.args.get("using") or str(join.args.get("method", "")).upper() == "NATURAL" for join in source.scope.expression.args.get("joins", [])):
        return source.columns
    if any(not column.table and fold_identifier(column.name) == fold_identifier(source.alias) for column in source.scope.columns):
        # SELECT alias / to_json(alias) observes the complete row struct.
        return source.columns
    for expression in source.scope.expression.expressions:
        if isinstance(expression, exp.Star):
            return source.columns
        if isinstance(expression, exp.Column) and expression.is_star and fold_identifier(expression.table) == fold_identifier(source.alias):
            return source.columns
        if any(isinstance(node, exp.Columns) for node in expression.walk()):
            return source.columns
    names = {
        fold_identifier(column.name)
        for column in source.scope.columns
        if not column.table or fold_identifier(column.table) == fold_identifier(source.alias)
    }
    names.update(fold_identifier(name) for name, _values in source.predicates)
    return [column for column in source.columns if fold_identifier(column.name) in names]


def _projection(column: MySQLColumn) -> Optional[tuple[str, str]]:
    remote_name = mysql_identifier(column.name)
    local_name = quote_identifier(column.name)
    dtype = column.duckdb_type.upper()
    if dtype == "VARCHAR" and column.mysql_type in _TEXT_TYPES and column.charset in _CHARSETS:
        return (
            f"CAST({remote_name} AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_general_ci AS {remote_name}",
            local_name,
        )
    if dtype in _INTEGER_TYPES or dtype.startswith("DECIMAL("):
        return f"CAST({remote_name} AS CHAR) AS {remote_name}", f"CAST({local_name} AS {dtype}) AS {local_name}"
    if dtype in _DIRECT_TYPES:
        return remote_name, f"CAST({local_name} AS {dtype}) AS {local_name}"
    return None


def _number_literal(value: Any) -> Optional[str]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return str(value)
    if isinstance(value, Decimal) and value.is_finite():
        return format(value, "f")
    return None


def _constant_value(connection, node: exp.Expression, dtype: str):
    """Use DuckDB's literal cast rules, not MySQL's implicit string coercion."""
    node = node.unnest()
    cast_sql = None
    parameters = []
    if isinstance(node, exp.Literal) and node.is_string:
        cast_sql, parameters = f"CAST(? AS {dtype})", [node.this]
    elif isinstance(node, exp.Cast) and isinstance(node.this, (exp.Literal, exp.Null)):
        target = node.to.sql(dialect="duckdb").upper()
        if target != dtype and not (target == "DATE" and dtype == "TIMESTAMP"):
            return NotImplemented
        cast_sql = f"CAST({node.sql(dialect='duckdb')} AS {dtype})"
    if cast_sql is not None:
        finite_check = ', isfinite(value)' if dtype in {'DATE', 'TIMESTAMP'} else ''
        row = connection.execute(f"SELECT value{finite_check} FROM (SELECT {cast_sql} AS value)", parameters).fetchone()
        return NotImplemented if finite_check and row[1] is False else row[0]
    if isinstance(node, exp.Null):
        return None
    text = node.sql(dialect="duckdb")
    if not re.fullmatch(r"-?\d+(?:\.\d+)?", text):
        return NotImplemented
    try:
        number = Decimal(text)
    except InvalidOperation:
        return NotImplemented
    scale = max(0, -number.as_tuple().exponent)
    integer_digits = max(1, number.adjusted() + 1)
    match = re.fullmatch(r"DECIMAL\((\d+),\s*(\d+)\)", dtype)
    if match:
        source_integer, source_scale = int(match[1]) - int(match[2]), int(match[2])
    elif dtype in _INTEGER_TYPES:
        source_integer = 20 if dtype.startswith("U") else 19
        source_scale = 0
    else:
        return NotImplemented
    if max(source_integer, integer_digits) + max(source_scale, scale) > 38:
        return NotImplemented
    return number


def _incomplete_date_sql(name: str) -> str:
    return f"MONTH({name})=0 OR DAY({name})=0"


def _invalid_date_sql(name: str, *, incomplete_as_null: bool) -> str:
    incomplete = _incomplete_date_sql(name)
    invalid = f"DAY({name})>COALESCE(DAY(LAST_DAY({name})),0)"
    return f"NOT ({incomplete}) AND ({invalid})" if incomplete_as_null else f"({incomplete}) OR ({invalid})"


def _invalid_dates_as_null(connection) -> bool:
    return bool(connection.execute("SELECT current_setting('mysql_incomplete_dates_as_nulls')").fetchone()[0])


def compile_condition(connection, source: MySQLSource, condition: exp.Expression, *, exact: bool) -> Optional[str]:
    """Compile a positive necessity; exact mode additionally supports binary text equality."""
    condition = condition.unnest()
    if isinstance(condition, exp.Or):
        left = compile_condition(connection, source, condition.left, exact=True)
        right = compile_condition(connection, source, condition.right, exact=True)
        return f"(({left}) OR ({right}))" if left and right else None
    negative = isinstance(condition, exp.Not)
    null_test = condition.this if negative else condition
    if isinstance(null_test, exp.Is) and isinstance(null_test.this, exp.Column) and isinstance(null_test.expression, exp.Null):
        column = next((c for c in source.columns if fold_identifier(c.name) == fold_identifier(null_test.this.name)), None)
        if not _column_belongs(null_test.this, source) or column is None:
            return None
        safe_type = column.duckdb_type == 'VARCHAR' or column.duckdb_type in _INTEGER_TYPES or column.duckdb_type.startswith('DECIMAL(')
        if not safe_type or (not negative and source.scope.expression.args.get('joins')):
            return None
        return f"{mysql_identifier(column.name)} IS {'NOT ' if negative else ''}NULL"
    operators = {exp.EQ: "=", exp.NEQ: "!=", exp.GT: ">", exp.GTE: ">=", exp.LT: "<", exp.LTE: "<="}
    if isinstance(condition, exp.Between) and isinstance(condition.this, exp.Column):
        lower = compile_condition(connection, source, exp.GTE(this=condition.this.copy(), expression=condition.args['low'].copy()), exact=exact)
        upper = compile_condition(connection, source, exp.LTE(this=condition.this.copy(), expression=condition.args['high'].copy()), exact=exact)
        return f"({lower}) AND ({upper})" if lower and upper else None
    if type(condition) in operators:
        left, right = condition.left, condition.right
        operator = operators[type(condition)]
        if not isinstance(left, exp.Column) and isinstance(right, exp.Column):
            left, right = right, left
            operator = {">": "<", ">=": "<=", "<": ">", "<=": ">=", "=": "=", "!=": "!="}[operator]
        values = [right]
    elif isinstance(condition, exp.In) and isinstance(condition.this, exp.Column) and not condition.args.get('query'):
        left, values, operator = condition.this, list(condition.expressions), "IN"
        if not values or len(values) > 10000:
            return None
    elif isinstance(condition, exp.Like) or (negative and isinstance(condition.this, exp.Like)):
        like = condition.this if negative else condition
        operator = 'NOT LIKE' if bool(like.args.get('negate')) != negative else 'LIKE'
        left, values = like.this, [like.expression]
    else:
        return None
    if not isinstance(left, exp.Column) or not _column_belongs(left, source):
        return None
    column = next((item for item in source.columns if fold_identifier(item.name) == fold_identifier(left.name)), None)
    if column is None:
        return None
    name = mysql_identifier(column.name)
    dtype = column.duckdb_type.upper()
    numeric = dtype in _INTEGER_TYPES or dtype.startswith("DECIMAL(")
    temporal = dtype in {"DATE", "TIMESTAMP"} and column.mysql_type in {"date", "datetime", "timestamp"}
    textual = dtype == "VARCHAR" and column.mysql_type in _TEXT_TYPES and column.charset in _CHARSETS
    if textual:
        if any(not _is_null_constant(value) and not (isinstance(value, exp.Literal) and value.is_string) for value in values):
            return None
        if operator in {'LIKE', 'NOT LIKE'}:
            if not isinstance(values[0], exp.Literal):
                return 'FALSE'
            pattern = str(values[0].this)
            marker = next((char for char in '!#^~|@' if char not in pattern), None)
            if marker is None:
                return None
            return f"CONVERT({name} USING utf8mb4) COLLATE utf8mb4_bin {operator} {mysql_text_literal(pattern)} ESCAPE {mysql_text_literal(marker)}"
        if not exact and operator in {'=', 'IN'}:
            return None  # existing indexable broad candidate handles equality
        literals = [f"CAST({mysql_text_literal(str(value.this))} AS BINARY)" for value in values if isinstance(value, exp.Literal)]
        name = f"CAST({name} AS BINARY)"
    elif numeric or temporal:
        literals = []
        for node in values:
            try:
                value = _constant_value(connection, node, dtype)
            except Exception:  # invalid constants stay on DuckDB's original error path
                return None
            if value is NotImplemented:
                return None
            if value is None:
                continue
            if numeric:
                literal = _number_literal(value)
                if literal is None:
                    return None
            else:
                if not isinstance(value, (datetime.date, datetime.datetime)):
                    return None
                literal = "'" + value.isoformat(sep=' ') + "'" if isinstance(value, datetime.datetime) else "'" + value.isoformat() + "'"
                if column.mysql_type == 'timestamp':
                    if operator == 'IN':
                        return None
                    if not isinstance(value, datetime.datetime):
                        return None
                    lower = max(value, datetime.datetime.min + datetime.timedelta(days=2)) - datetime.timedelta(days=2)
                    upper = min(value, datetime.datetime.max - datetime.timedelta(days=2)) + datetime.timedelta(days=2)
                    guard = ('TRUE' if operator == '!=' else f"{name} >= '{lower.isoformat(sep=' ')}'" if operator in {'>', '>='}
                             else f"{name} <= '{upper.isoformat(sep=' ')}'" if operator in {'<', '<='}
                             else f"{name} BETWEEN '{lower.isoformat(sep=' ')}' AND '{upper.isoformat(sep=' ')}'")
                    # TIMESTAMP is exposed as a naive wall-clock value. Keep an
                    # indexable superset across timezone/DST offsets; exact mode
                    # verifies the wall-clock comparison on the server as well.
                    comparison = f"({guard}) AND (CAST({name} AS DATETIME(6)) {operator} {literal})"
                    if exact and _invalid_dates_as_null(connection):
                        comparison = f"NOT ({_incomplete_date_sql(name)}) AND ({comparison})"
                    return comparison if exact else guard
            literals.append(literal)
    else:
        return None
    if not literals:
        return "FALSE"
    if operator == "IN":
        return f"{name} IN ({','.join(literals)})"
    comparison = f"{name} {operator} {literals[0]}"
    if temporal and exact and _invalid_dates_as_null(connection):
        comparison = f"NOT ({_incomplete_date_sql(name)}) AND ({comparison})"
    return comparison


def build_remote_count_query(connection, sql: str, source: MySQLSource, tree: exp.Select) -> Optional[str]:
    """Offload only simple counts with fully equivalent predicates and BIGINT output."""
    if not source.columns or source.scope.expression is not tree or tree.args.get('joins') or any(
        tree.args.get(key) for key in ('with_', 'group', 'having', 'qualify', 'distinct', 'order', 'sample')
    ) or not isinstance(tree.args.get('from_').this, exp.Table):
        return None
    expressions = []
    for item in tree.expressions:
        aggregate = item.this if isinstance(item, exp.Alias) else item
        if not isinstance(aggregate, exp.Count) or aggregate.args.get('expressions'):
            return None
        operand = aggregate.this
        distinct = isinstance(operand, exp.Distinct)
        if distinct:
            if len(operand.expressions) != 1:
                return None
            operand = operand.expressions[0]
        if isinstance(operand, exp.Star) and not distinct:
            argument = '*'
        elif isinstance(operand, exp.Column) and _column_belongs(operand, source):
            column = next((c for c in source.columns if fold_identifier(c.name) == fold_identifier(operand.name)), None)
            if column is None:
                return None
            dtype = column.duckdb_type.upper()
            if dtype == 'VARCHAR' and column.mysql_type in _TEXT_TYPES and column.charset in _CHARSETS:
                argument = f"CAST({mysql_identifier(column.name)} AS BINARY)" if distinct else mysql_identifier(column.name)
            elif dtype in _INTEGER_TYPES or dtype.startswith('DECIMAL('):
                argument = mysql_identifier(column.name)
            else:
                return None
        else:
            return None
        expressions.append(f"CAST(COUNT({'DISTINCT ' if distinct else ''}{argument}) AS CHAR) AS {mysql_identifier('__count_'+str(len(expressions)))}")
    if not expressions:
        return None
    where = tree.args.get('where')
    conditions = list(_and_terms(where.this if where else None))
    compiled = [compile_condition(connection, source, term, exact=True) for term in conditions]
    if any(term is None for term in compiled):
        return None
    date_names = {
        column.name for column in source.columns if column.mysql_type in {'date', 'datetime', 'timestamp'}
        and any(isinstance(node, exp.Column) and _column_belongs(node, source)
                and fold_identifier(node.name) == fold_identifier(column.name) for term in conditions for node in term.walk())
    }
    validate_dates = bool(date_names)
    if validate_dates:
        incomplete_as_null = _invalid_dates_as_null(connection)
        invalid = ' OR '.join(f'({_invalid_date_sql(mysql_identifier(name), incomplete_as_null=incomplete_as_null)})' for name in date_names)
        expressions.append(f"CAST(COALESCE(SUM(CASE WHEN {invalid} THEN 1 ELSE 0 END),0) AS CHAR) AS {mysql_identifier('__invalid_dates')}")
    remote = f"SELECT {','.join(expressions)} FROM {mysql_identifier(source.database)}.{mysql_identifier(source.table)}"
    if compiled:
        remote += ' WHERE ' + ' AND '.join(f'({term})' for term in compiled)
    if len(remote.encode('utf-8')) > MAX_CANDIDATE_SQL_BYTES:
        return None
    described = connection.execute(f"DESCRIBE ({sql})").fetchall()
    count_size = len(expressions) - int(validate_dates)
    if (len(described) != count_size or any(str(row[1]) != 'BIGINT' for row in described)
            or len({fold_identifier(str(row[0])) for row in described}) != len(described)):
        return None
    projections = []
    for i, row in enumerate(described):
        value = f"CAST({quote_identifier('__count_'+str(i))} AS BIGINT)"
        if validate_dates:
            value = (f"CASE WHEN CAST({quote_identifier('__invalid_dates')} AS BIGINT)>0 "
                     "THEN error('Invalid MySQL date in filtered input') "
                     f"ELSE {value} END")
        projections.append(f"{value} AS {quote_identifier(row[0])}")
    output = f"SELECT {','.join(projections)} FROM {mysql_query_sql(source.connection_alias, remote)}"
    for key in ('limit', 'offset'):
        clause = tree.args.get(key)
        if clause is not None:
            output += ' ' + clause.sql(dialect='duckdb')
    return output


def build_candidate_select(source: MySQLSource, connection=None, *, row_limit: Optional[int] = None) -> Optional[str]:
    """Return a typed, untruncated candidate read, or decline the optimization."""
    by_name = {fold_identifier(column.name): column for column in source.columns}
    if "rowid" not in by_name and any(
        fold_identifier(column.name) == "rowid"
        and (not column.table or fold_identifier(column.table) == fold_identifier(source.alias))
        for column in source.scope.columns
    ):
        # A new temporary table has its own synthetic rowid, not the source's.
        return None
    predicates = []
    for name, values in source.predicates:
        column = by_name.get(fold_identifier(name))
        if column is None or column.duckdb_type != "VARCHAR" or column.mysql_type not in _TEXT_TYPES or column.charset not in _CHARSETS:
            continue
        representable = [value for value in values if column.charset == "utf8mb4" or all(ord(char) <= 0xFFFF for char in value)]
        if not representable:
            predicates.append("FALSE")
        else:
            predicates.append(mysql_identifier(column.name) + " IN (" + ",".join(mysql_text_literal(value) for value in dict.fromkeys(representable)) + ")")
    for name, values in source.numeric_keys:
        column = by_name.get(fold_identifier(name))
        if column is None or not (column.duckdb_type in _INTEGER_TYPES or column.duckdb_type.startswith("DECIMAL(")):
            continue
        literals = [_number_literal(value) for value in values]
        if any(value is None for value in literals):
            continue
        predicates.append(
            mysql_identifier(column.name) + " IN (" + ",".join(dict.fromkeys(literals)) + ")"
            if literals else "FALSE"
        )
    for name, lower, upper in source.key_ranges:
        column = by_name.get(fold_identifier(name))
        if column is None or lower is None or upper is None:
            continue
        reference = mysql_identifier(column.name)
        if isinstance(lower, str) and isinstance(upper, str) and column.duckdb_type == 'VARCHAR' and column.mysql_type in _TEXT_TYPES and column.charset in _CHARSETS:
            predicates.append(f"CAST({reference} AS BINARY) BETWEEN CAST({mysql_text_literal(lower)} AS BINARY) AND CAST({mysql_text_literal(upper)} AS BINARY)")
        elif column.duckdb_type in _INTEGER_TYPES or column.duckdb_type.startswith('DECIMAL('):
            low_literal, high_literal = _number_literal(lower), _number_literal(upper)
            if low_literal is None or high_literal is None:
                continue
            if column.duckdb_type.startswith('U') and upper < 0:
                predicates.append('FALSE')
            elif column.duckdb_type.startswith('U') and lower < 0:
                predicates.append(f"{reference} <= {high_literal}")
            else:
                predicates.append(f"{reference} BETWEEN {low_literal} AND {high_literal}")
    if connection is not None:
        for condition in source.conditions:
            compiled = compile_condition(connection, source, condition, exact=False)
            if compiled:
                predicates.append(compiled)
    if not predicates:
        return None
    exact_conditions = ([compile_condition(connection, source, term, exact=True) for term in source.conditions]
                        if row_limit is not None and connection is not None else [])
    can_limit = row_limit is not None and all(term is not None for term in exact_conditions)
    if can_limit:
        predicates.extend(term for term in exact_conditions if term)
    columns = needed_columns(source)
    projections = [_projection(column) for column in columns]
    if not columns or any(projection is None for projection in projections):
        return None
    remote = (
        "SELECT " + ",".join(projection[0] for projection in projections)
        + " FROM " + mysql_identifier(source.database) + "." + mysql_identifier(source.table)
        + " WHERE " + " AND ".join(predicates)
    )
    if can_limit:
        remote += f" LIMIT {int(row_limit)}"
    if len(remote.encode("utf-8")) > MAX_CANDIDATE_SQL_BYTES:
        return None
    return "SELECT " + ",".join(projection[1] for projection in projections) + " FROM " + mysql_query_sql(source.connection_alias, remote)


def patch_sources(sql: str, sources: list[MySQLSource]) -> str:
    """Replace source references only; keep original expressions and literals."""
    edits: dict[tuple[int, int], str] = {}
    for source in sources:
        if source.temporary_name is None and source.replacement_sql is None:
            continue
        replacement = (f"({source.replacement_sql})" if source.replacement_sql
                       else quote_identifier(source.temporary_name))
        if not source.node.alias:
            replacement += " AS " + quote_identifier(source.alias)
        edits[source.span] = replacement
        for column in source.scope.columns:
            if fold_identifier(column.table) != fold_identifier(source.alias) or not (column.db or column.catalog):
                continue
            span = _identifier_span(column.parts[:-1])
            if span is None:
                raise ValueError("Cannot safely map qualified MySQL column reference")
            edits[span] = quote_identifier(source.alias)
    previous_start = len(sql)
    for (start, end), replacement in sorted(edits.items(), reverse=True):
        if end > previous_start:
            raise ValueError("Overlapping MySQL source mappings")
        sql = sql[:start] + replacement + sql[end:]
        previous_start = start
    return sql
