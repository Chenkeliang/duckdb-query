"""Result-column provenance from the original SQL and bound table schemas."""

from typing import Any

import sqlglot
from sqlglot import exp
from sqlglot.lineage import lineage
from sqlglot.optimizer.qualify import qualify
from sqlglot.optimizer.scope import traverse_scope
from sqlglot.schema import MappingSchema


def describe_column_lineage(connection: Any, sql: str, count: int) -> list[dict]:
    """Resolve by output position, never guessing provenance from result names.

    Schema reads only bind named relations. Unsupported table functions, macros,
    or unresolvable scopes are reported as unresolved, not invented origins.
    """
    unknown = [{"kind": "unresolved", "sources": []} for _ in range(count)]
    try:
        tree = sqlglot.parse_one(sql, read="duckdb")
        if not isinstance(tree, exp.Query):
            return unknown
        schema = MappingSchema(dialect="duckdb")
        origins = {}
        for scope in traverse_scope(tree):
            for _node, source in scope.selected_sources.values():
                if not isinstance(source, exp.Table):
                    continue
                if not isinstance(source.this, exp.Identifier):
                    return unknown
                relation = source.copy()
                relation.set("alias", None)
                rows = connection.execute(
                    f"DESCRIBE SELECT * FROM {relation.sql(dialect='duckdb')}"
                ).fetchall()
                origin = {"table": source.name}
                if source.catalog:
                    origin["catalog"] = source.catalog
                if source.db:
                    origin["schema"] = source.db
                # A uniform schema depth lets the upstream qualifier resolve a
                # mix of bare local and three-part federated table references.
                # Synthetic missing qualifiers are internal and never returned.
                source.set("catalog", source.args.get("catalog") or exp.to_identifier("_dq_local"))
                source.set("db", source.args.get("db") or exp.to_identifier("_dq_default"))
                key = (source.catalog, source.db, source.name)
                origins[key] = origin
                schema.add_table(source, {str(row[0]): str(row[1]) for row in rows})
        by_name = any(union.args.get("by_name") for union in tree.find_all(exp.Union))
        qualified = qualify(
            tree, dialect="duckdb", schema=schema,
            allow_partial_qualification=by_name, validate_qualify_columns=not by_name,
        )
        if by_name:
            # SQLGlot lineage follows set-operation positions. Project each
            # branch into DuckDB's named output order, padding absent columns
            # with NULL. This AST is metadata only; the original SQL is executed.
            for union in reversed(list(qualified.find_all(exp.Union))):
                if not union.args.get("by_name"):
                    continue
                names = list(dict.fromkeys(union.this.named_selects + union.expression.named_selects))
                for key in ("this", "expression"):
                    branch = union.args[key]
                    available = set(branch.named_selects)
                    selections = [
                        exp.alias_(
                            exp.column(name, table="_dq_union", quoted=True)
                            if name in available else exp.Null(),
                            name, quoted=True,
                        ) for name in names
                    ]
                    union.set(key, exp.select(*selections).from_(branch.subquery(alias="_dq_union")))
                union.set("by_name", False)
            qualified = qualify(qualified, dialect="duckdb", schema=schema)
        selections = qualified.selects
        if len(selections) != count:
            return unknown
        # Unique internal output aliases keep duplicate result names positional.
        for index, selection in enumerate(selections):
            selection.replace(exp.alias_(selection.unalias().copy(), f"_dq_output_{index}", quoted=True))
        nodes = lineage(None, qualified, schema=schema, dialect="duckdb")
        result = []
        for index in range(count):
            root = nodes[f"_dq_output_{index}"]
            sources = []
            unresolved = False
            derived = False
            for node in root.walk():
                expression = node.expression.unalias()
                if isinstance(expression, exp.Table):
                    origin = origins.get((expression.catalog, expression.db, expression.name))
                    if origin is None:
                        unresolved = True
                        continue
                    column = sqlglot.parse_one(node.name, into=exp.Column, read="duckdb").name
                    item = {**origin, "column": column}
                    if item not in sources:
                        sources.append(item)
                elif isinstance(expression, exp.Placeholder):
                    unresolved = True
                elif not isinstance(expression, exp.Column):
                    derived = True
            if unresolved:
                kind = "unresolved"
            elif sources:
                kind = "derived" if derived or len(sources) > 1 else "direct"
            elif isinstance(root.expression.unalias(), (exp.Literal, exp.Boolean, exp.Null)):
                kind = "constant"
            else:
                kind = "derived"
            result.append({"kind": kind, "sources": sources})
        return result
    except (sqlglot.errors.SqlglotError, ValueError, KeyError, TypeError, AttributeError):
        return unknown
    except Exception:  # pylint: disable=broad-exception-caught
        # Metadata may be unavailable even though the actual query completed.
        # Provenance must not turn a successful result into a failed query.
        return unknown


def with_column_lineage(connection: Any, sql: str, column_types: list[dict]) -> list[dict]:
    """Attach positional lineage to the existing authoritative type metadata."""
    provenance = describe_column_lineage(connection, sql, len(column_types))
    return [{**column, "lineage": source} for column, source in zip(column_types, provenance)]
