"""One execution scope for exact, cancellable federated queries.

Call after ATTACH and consume the prepared SQL before leaving the scope.
Publication remains outside: the remote transaction must finish before the
existing atomic staging-table publication starts its own transaction.
"""
from __future__ import annotations

import logging
import sys
import threading
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field, replace
from typing import Any, Iterator, Optional

import duckdb
import sqlglot
from sqlglot import exp
from sqlglot.optimizer.scope import Scope

from core.common.config_manager import config_manager
from core.common.sql_error_location import structured_duckdb_errors
from core.common.sql_identifiers import quote_identifier
from core.database.connection_registry import connection_registry
from core.database.federated_attach import (
    remote_cancellation_scope,
    single_threaded_mysql_persistence,
)
from core.database.federated_optimizer import optimize_federated_sql
from core.database.mysql_predicate_candidates import (
    MySQLSource,
    _and_terms,
    build_candidate_select,
    build_remote_count_query,
    find_mysql_sources,
    fold_identifier,
    patch_sources,
    read_source_columns,
    _INTEGER_TYPES,
)

logger = logging.getLogger(__name__)
_LOCAL_FILTER_OPTIMIZERS = {"filter_pushdown", "join_filter_pushdown", "in_clause", "cte_filter_pusher"}


@dataclass
class PreparedFederatedQuery:
    """Internal executable SQL plus reusable, non-temporary public diagnostics."""
    sql: str
    display_sql: str
    candidate_count: int = 0
    suggestions: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    opaque: bool = field(default=False, repr=False)
    pushdown: Optional[dict] = None


def _raise_if_cancelled(query_id: Optional[str]) -> None:
    if query_id and connection_registry.is_cancel_requested(query_id):
        raise duckdb.InterruptException("INTERRUPT Error: cancelled during query preparation")


def _execute_internal(connection, sql: str):
    try:
        return connection.execute(sql)
    except duckdb.Error as error:
        error.duckquery_execution_sql = sql
        raise


def _temporary_table(connection, query: str, names: list[str]) -> str:
    name = "__mysql_candidate_" + uuid.uuid4().hex
    names.append(name)
    _execute_internal(connection, f"CREATE TEMP TABLE {quote_identifier(name)} AS (\n{query}\n)")
    return name


def _materialize_source(connection, source: MySQLSource, names: list[str], *, stream: bool = False) -> bool:
    if not source.columns:
        source.columns = read_source_columns(connection, source)
    limit = source.scope.expression.args.get('limit') if stream else None
    row_limit = int(limit.expression.this) if limit is not None and isinstance(limit.expression, exp.Literal) and limit.expression.is_int else None
    candidate_sql = build_candidate_select(source, connection, row_limit=row_limit)
    if candidate_sql is None:
        return False
    if stream:
        source.replacement_sql = candidate_sql
        return True
    source.temporary_name = _temporary_table(connection, candidate_sql, names)
    return True


def _projection_input(scope: Scope):
    """Expose only unchanged columns; never cross a relational/volatile boundary."""
    tree = scope.expression
    wrapper = tree.parent
    wrapper_alias = wrapper.args.get('alias') if isinstance(wrapper, exp.Subquery) else None
    if wrapper_alias is not None and wrapper_alias.args.get('columns'):
        return None
    if scope.is_cte or not isinstance(tree, exp.Select) or len(scope.selected_sources) != 1:
        return None
    if any(tree.args.get(key) for key in ('joins', 'group', 'having', 'qualify', 'distinct', 'limit', 'offset', 'order', 'sample')):
        return None
    if not all(isinstance(item, (exp.Column, exp.Star)) for item in tree.expressions):
        return None
    if any(any(star.args.values()) for item in tree.expressions for star in item.find_all(exp.Star)):
        return None
    return next(iter(scope.selected_sources.values()))[1]


def _join_binding(source: MySQLSource):
    scope, alias = source.scope, source.alias
    while scope.parent and _projection_input(scope) is not None:
        matches = [name for name, (_, selected) in scope.parent.selected_sources.items() if selected is scope]
        if len(matches) != 1:
            break
        alias, scope = matches[0], scope.parent
    return scope, alias


def _local_key_source(connection, target: MySQLSource, alias: str, sources: list[MySQLSource], attachments: set[str]) -> Optional[str]:
    selected = target.scope.selected_sources.get(alias)
    if selected is None:
        return None
    selected_source = selected[1]
    while isinstance(selected_source, Scope):
        selected_source = _projection_input(selected_source)
        if selected_source is None:
            return None
        for source in sources:
            if isinstance(selected_source, exp.Table) and source.node is selected_source:
                return quote_identifier(source.temporary_name) if source.temporary_name else None
    for source in sources:
        if source.scope is target.scope and fold_identifier(source.alias) == fold_identifier(alias):
            return quote_identifier(source.temporary_name) if source.temporary_name else None
    if not isinstance(selected_source, exp.Table):
        return None
    table = selected_source
    table_alias = table.args.get("alias")
    if table_alias is not None and table_alias.args.get("columns"):
        return None
    if fold_identifier(table.catalog or table.db or "") in attachments:
        return None
    # Only actual local tables are sampled. Views/CTEs can contain volatile
    # expressions and must not be evaluated once for keys and again for rows.
    if table.catalog or (table.db and fold_identifier(table.db) != "main"):
        return None
    temporary_names = connection.execute(
        "SELECT table_name FROM duckdb_tables() WHERE temporary "
        "UNION ALL SELECT view_name FROM duckdb_views() WHERE temporary"
    ).fetchall()
    if any(fold_identifier(str(row[0])) == fold_identifier(table.name) for row in temporary_names):
        return None
    exists = connection.execute(
        "SELECT sql FROM duckdb_tables() WHERE database_name=current_database() "
        "AND schema_name='main' AND table_name=? LIMIT 1", [table.name],
    ).fetchone()
    if not exists or not isinstance(exists[0], str) or "COLLATE" in exists[0].upper():
        return None
    return table.sql(dialect="duckdb")


def _semijoin_keys(connection, target: MySQLSource, sources: list[MySQLSource], attachments: set[str], key_limit: int) -> bool:
    if key_limit <= 0:
        return False
    scope, alias = _join_binding(target)
    for join in scope.expression.args.get("joins", []):
        side = (join.side or "").upper()
        target_is_right = fold_identifier(join.this.alias_or_name) == fold_identifier(alias)
        if side == 'FULL' or (side == 'LEFT' and not target_is_right) or (side == 'RIGHT' and target_is_right):
            continue
        if (join.kind or "").upper() in {"CROSS", "ANTI", "SEMI"}:
            continue
        for term in _and_terms(join.args.get("on")):
            if not isinstance(term, exp.EQ) or not isinstance(term.left, exp.Column) or not isinstance(term.right, exp.Column):
                continue
            remote_column, local_column = term.left, term.right
            if fold_identifier(remote_column.table) != fold_identifier(alias):
                remote_column, local_column = local_column, remote_column
            if fold_identifier(remote_column.table) != fold_identifier(alias) or not local_column.table:
                continue
            local_ref = _local_key_source(connection, replace(target, scope=scope), local_column.table, sources, attachments)
            if local_ref is None:
                continue
            column = quote_identifier(local_column.name)
            description = connection.execute(f"DESCRIBE SELECT {column} FROM {local_ref}").fetchall()
            if not description:
                continue
            dtype = str(description[0][1])
            if not target.columns:
                target.columns = read_source_columns(connection, target)
            remote = next((c for c in target.columns if fold_identifier(c.name) == fold_identifier(remote_column.name)), None)
            if remote is None:
                continue
            textual = dtype == 'VARCHAR' and remote.duckdb_type == 'VARCHAR'
            numeric = ((dtype in _INTEGER_TYPES and remote.duckdb_type in _INTEGER_TYPES)
                       or (dtype.startswith('DECIMAL(') and dtype == remote.duckdb_type))
            if not textual and not numeric:
                continue
            keys = connection.execute(
                f"SELECT DISTINCT {column} FROM {local_ref} WHERE {column} IS NOT NULL LIMIT {key_limit + 1}"
            ).fetchall()
            if textual and any(not isinstance(row[0], str) for row in keys):
                continue
            if len(keys) > key_limit:
                lower, upper = connection.execute(f"SELECT min({column}),max({column}) FROM {local_ref}").fetchone()
                target.key_ranges.append((remote_column.name, lower, upper))
                return True
            if textual:
                target.predicates.append((remote_column.name, [row[0] for row in keys]))
            else:
                target.numeric_keys.append((remote_column.name, [row[0] for row in keys]))
            return True
    return False


def _ordered_result(connection, sql: str, names: list[str]) -> str:
    """Execute opaque table-function SQL once, preserving order and all types."""
    ordinal = "__mysql_result_order_" + uuid.uuid4().hex
    wrapped = (
        f"SELECT row_number() OVER () AS {quote_identifier(ordinal)}, source.* "
        f"FROM (\n{sql.rstrip().rstrip(';')}\n) AS source"
    )
    name = _temporary_table(connection, wrapped, names)
    return (
        f"SELECT * EXCLUDE ({quote_identifier(ordinal)}) FROM {quote_identifier(name)} "
        f"ORDER BY {quote_identifier(ordinal)}"
    )


def _has_mysql_function(tree: exp.Expression) -> bool:
    return any(node.name.lower() == "mysql_query" for node in tree.find_all(exp.Anonymous))


def _prepare_mysql_sources(
    connection, prepared: PreparedFederatedQuery, sql: str,
    attach_configs: list[tuple[str, dict[str, Any]]], mysql_aliases: set[str],
    query_id: Optional[str], names: list[str], materialize_result: bool,
    *, stream_candidates: bool = False, plan_only: bool = False,
) -> None:
    """Materialize eligible sources while leaving relational semantics local."""
    key_limit = max(0, int(getattr(config_manager.get_app_config(), "federated_semijoin_threshold", 10000)))
    row = connection.execute("SELECT current_setting('default_collation')").fetchone()
    default_collation = str(row[0]) if isinstance(row, (tuple, list)) and row else ""
    row = connection.execute("SELECT current_setting('search_path')").fetchone()
    search_path = str(row[0]) if isinstance(row, (tuple, list)) and row else ""
    try:
        sources, tree = find_mysql_sources(sql, attach_configs, key_limit)
    except (sqlglot.errors.SqlglotError, ValueError, UnicodeError):
        sources, tree = [], None
    if isinstance(tree, exp.Query):
        if default_collation or search_path:
            prepared.warnings.append("Custom DuckDB collation or search path requires unmodified local evaluation.")
        else:
            local_schemas = {
                fold_identifier(str(row[0]))
                for row in connection.execute(
                    "SELECT schema_name FROM duckdb_schemas() WHERE database_name=current_database()"
                ).fetchall()
            }
            sources = [
                source for source in sources
                if source.node.catalog or fold_identifier(source.node.db) not in local_schemas
            ]
            if len(sources) == 1 and isinstance(tree, exp.Select):
                source = sources[0]
                source.columns = read_source_columns(connection, source)
                remote_count = build_remote_count_query(connection, sql, source, tree)
                if remote_count:
                    # mysql_query executes while binding. Materialize its one
                    # result once so later DESCRIBE/type inspection cannot run
                    # the remote aggregate a second time.
                    prepared.sql = (remote_count if plan_only else
                                    'SELECT * FROM ' + quote_identifier(_temporary_table(connection, remote_count, names)))
                    prepared.pushdown = {'mode': 'remote-count', 'sources': 1, 'pushed_sources': 1}
                    return
            for source in sources:
                _raise_if_cancelled(query_id)
                if not source.predicates and not source.conditions:
                    continue
                if not plan_only:
                    can_stream = (stream_candidates and len(sources) == 1 and source.scope.expression is tree
                                  and not any(tree.args.get(key) for key in ('joins', 'group', 'having', 'qualify', 'distinct', 'order', 'offset'))
                                  and not any(tree.find_all(exp.AggFunc)) and not any(tree.find_all(exp.Window)))
                    _materialize_source(connection, source, names,
                                        stream=can_stream)
                    continue
                if not source.columns:
                    source.columns = read_source_columns(connection, source)
                if build_candidate_select(source, connection):
                    prepared.candidate_count += 1
            attachments = {fold_identifier(alias) for alias, _ in attach_configs}
            for source in ([] if plan_only else sources):
                if source.temporary_name is None and source.replacement_sql is None and _semijoin_keys(connection, source, sources, attachments, key_limit):
                    _raise_if_cancelled(query_id)
                    _materialize_source(connection, source, names)
        prepared.sql = patch_sources(sql, sources)
        if not plan_only:
            prepared.candidate_count = sum(source.temporary_name is not None or source.replacement_sql is not None for source in sources)
        if prepared.candidate_count:
            prepared.warnings.append(
                f"MySQL candidate filtering applied to {prepared.candidate_count} source(s); exact filtering remains in DuckDB."
            )
        if _has_mysql_function(tree):
            prepared.opaque = True
            if materialize_result:
                prepared.sql = _ordered_result(connection, prepared.sql, names)
    elif isinstance(tree, exp.Describe) or (
        isinstance(tree, exp.Command) and str(tree.this).upper() == "EXPLAIN"
    ):
        prepared.warnings.append("EXPLAIN does not materialize MySQL candidates; this plan uses local filtering.")
    native_references = (
        sum(fold_identifier(table.catalog or table.db or "") in {fold_identifier(alias) for alias in mysql_aliases} for table in tree.find_all(exp.Table))
        if tree is not None else 0
    )
    if native_references > prepared.candidate_count or tree is None:
        prepared.warnings.append("Unsupported MySQL candidate predicates or types are evaluated locally.")
    prepared.pushdown = {'mode': 'candidate' if prepared.candidate_count else 'explicit-remote' if prepared.opaque else 'local',
                         'sources': native_references, 'pushed_sources': prepared.candidate_count}
    if prepared.candidate_count and isinstance(tree, exp.Query) and any(source.key_ranges for source in sources):
        prepared.pushdown['key_strategy'] = 'range'


def inspect_federated_pushdown(connection, sql: str, attach_configs: list[tuple[str, dict]]) -> Optional[dict]:
    """Metadata-only preview of the same planner; never read keys or materialize rows."""
    aliases = {alias for alias, config in attach_configs if config.get('type') == 'mysql'}
    if not aliases:
        return None
    prepared = PreparedFederatedQuery(sql, sql)
    _prepare_mysql_sources(connection, prepared, sql, attach_configs, aliases, None, [], False, plan_only=True)
    return prepared.pushdown


@contextmanager
def federated_execution_scope(
    connection,
    sql: str,
    attach_configs: list[tuple[str, dict[str, Any]]],
    query_id: Optional[str] = None,
    *,
    include_suggestions: bool = False,
    materialize_result: bool = True,
    stream_candidates: bool = False,
) -> Iterator[PreparedFederatedQuery]:
    """Prepare, execute and clean a query under one remote cancellation lease.

    Callers authorize and apply their final row limit to the original SQL first.
    Only internal source identifiers change; exact predicates and row limits
    remain in DuckDB. Unsupported native filters execute locally instead of
    using the extension's unsafe collation/constant translation.
    """
    mysql_aliases = {
        alias for alias, config in attach_configs
        if str(config.get("type", "")).lower() == "mysql"
    }
    prepared = PreparedFederatedQuery(sql=sql, display_sql=sql)
    if not attach_configs:
        _raise_if_cancelled(query_id)
        yield prepared
        _raise_if_cancelled(query_id)
        return
    names: list[str] = []
    previous_optimizers = None
    yielded = False
    cleanup_failed = False
    owns_registration = bool(mysql_aliases and query_id is None)
    effective_id = query_id or ("prepared:" + uuid.uuid4().hex if mysql_aliases else None)
    timer = None
    timed_out = threading.Event()
    if owns_registration:
        connection_registry.register(effective_id, connection, sql)

        def timeout() -> None:
            timed_out.set()
            connection_registry.interrupt_with_remote(effective_id)

        timer = threading.Timer(config_manager.get_app_config().federated_query_timeout or 300, timeout)
        timer.start()
    try:
        _raise_if_cancelled(effective_id)
        with single_threaded_mysql_persistence(attach_configs, connection=connection):
            _raise_if_cancelled(effective_id)
            with structured_duckdb_errors(connection):
                try:
                    with remote_cancellation_scope(connection, effective_id, attach_configs):
                        if include_suggestions:
                            logical_sql, suggestions, warnings = optimize_federated_sql(
                                connection, sql, {alias for alias, _ in attach_configs},
                                config_manager.get_app_config(), mysql_aliases=mysql_aliases,
                            )
                            prepared.sql = logical_sql
                            prepared.display_sql = logical_sql
                            prepared.suggestions = suggestions
                            prepared.warnings.extend(str(warning) for warning in warnings)
                        if mysql_aliases:
                            row = connection.execute("SELECT current_setting('disabled_optimizers')").fetchone()
                            previous_optimizers = str(row[0]) if isinstance(row, (tuple, list)) and row else ""
                            disabled = {item.strip() for item in previous_optimizers.split(",") if item.strip()}
                            # Retain these guards through metadata and execution;
                            # unchanged sources must not receive lossy predicates.
                            connection.execute("SET disabled_optimizers=?", [",".join(sorted(disabled | _LOCAL_FILTER_OPTIMIZERS))])
                            _prepare_mysql_sources(
                                connection, prepared, sql, attach_configs, mysql_aliases,
                                effective_id, names, materialize_result,
                                stream_candidates=stream_candidates,
                            )
                        _raise_if_cancelled(effective_id)
                        yielded = True
                        yield prepared
                        _raise_if_cancelled(effective_id)
                    if owns_registration and not connection_registry.commit_if_not_cancelled(effective_id, lambda: None):
                        raise duckdb.InterruptException("INTERRUPT Error: cancelled before query completion")
                except duckdb.Error as error:
                    if prepared.sql != sql and not hasattr(error, "duckquery_execution_sql"):
                        error.duckquery_execution_sql = prepared.sql
                    error.duckquery_retry_safe = not prepared.opaque and (not yielded or prepared.sql == sql)
                    if timed_out.is_set() and isinstance(error, duckdb.InterruptException):
                        raise TimeoutError("Federated query preparation exceeded its execution budget") from error
                    raise
                finally:
                    # The remote scope has committed or rolled back before cleanup.
                    active_error = sys.exc_info()[0] is not None
                    try:
                        for name in reversed(names):
                            connection.execute(f"DROP TABLE IF EXISTS {quote_identifier(name)}")
                        if previous_optimizers is not None:
                            connection.execute("SET disabled_optimizers=?", [previous_optimizers])
                    except Exception as cleanup_error:
                        logger.error("Failed to clean federated execution state: %s", cleanup_error)
                        cleanup_failed = True
                        if not active_error:
                            raise RuntimeError("Connection error while cleaning federated execution state") from cleanup_error
    finally:
        if timer:
            timer.cancel()
            timer.join(timeout=5)
            if timer.is_alive():
                cleanup_failed = True
                logger.error("Discarding connection while its cancellation callback is still running")
        if cleanup_failed:
            connection.close()
        if owns_registration:
            connection_registry.unregister(effective_id)
            connection_registry.forget_publication(effective_id)
