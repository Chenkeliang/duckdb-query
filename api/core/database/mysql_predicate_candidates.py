"""Plan necessary MySQL text predicates without changing DuckDB semantics.

Only positive equality/IN under AND is eligible. Source text is patched at
identifier spans rather than reserializing arbitrary DuckDB SQL with sqlglot.
"""
from __future__ import annotations

from dataclasses import dataclass, field
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


def build_candidate_select(source: MySQLSource) -> Optional[str]:
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
    if not predicates:
        return None
    columns = needed_columns(source)
    projections = [_projection(column) for column in columns]
    if not columns or any(projection is None for projection in projections):
        return None
    remote = (
        "SELECT " + ",".join(projection[0] for projection in projections)
        + " FROM " + mysql_identifier(source.database) + "." + mysql_identifier(source.table)
        + " WHERE " + " AND ".join(predicates)
    )
    if len(remote.encode("utf-8")) > MAX_CANDIDATE_SQL_BYTES:
        return None
    return "SELECT " + ",".join(projection[1] for projection in projections) + " FROM " + mysql_query_sql(source.connection_alias, remote)


def patch_sources(sql: str, sources: list[MySQLSource]) -> str:
    """Replace source references only; keep original expressions and literals."""
    edits: dict[tuple[int, int], str] = {}
    for source in sources:
        if source.temporary_name is None:
            continue
        replacement = quote_identifier(source.temporary_name)
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
