"""Compare logical database contents before promoting a migration candidate."""

from core.common.sql_identifiers import quote_identifier


def migration_manifest(connection, catalog: str) -> dict:
    """Capture object definitions and exact table counts without reading sample data."""
    projections = {
        "tables": "schema_name, table_name, column_count, index_count, check_constraint_count",
        "columns": "schema_name, table_name, column_name, column_index, data_type, is_nullable, column_default",
        "indexes": "schema_name, index_name, table_name, is_unique, expressions",
        "views": "schema_name, view_name, column_count, sql",
        "sequences": "schema_name, sequence_name, min_value, max_value, increment_by, cycle",
        "functions": "schema_name, function_name, function_type, parameters, macro_definition",
        "constraints": "schema_name, table_name, constraint_type, constraint_text",
    }
    manifest = {}
    for kind, fields in projections.items():
        rows = connection.execute(
            f"SELECT {fields} FROM duckdb_{kind}() WHERE database_name = ?",
            [catalog],
        ).fetchall()
        manifest[kind] = sorted(rows, key=repr)
    counts = []
    for schema, table, *_ in manifest["tables"]:
        reference = ".".join(quote_identifier(part) for part in (catalog, schema, table))
        counts.append((schema, table, connection.execute(f"SELECT count(*) FROM {reference}").fetchone()[0]))
    manifest["row_counts"] = sorted(counts)
    return manifest


def verify_migration(connection, source: str, candidate: str) -> None:
    """Reject any object/row-count mismatch before backup and file replacement."""
    before = migration_manifest(connection, source)
    after = migration_manifest(connection, candidate)
    mismatches = [kind for kind, value in before.items() if value != after[kind]]
    if mismatches:
        raise ValueError(f"Migration validation failed: {', '.join(mismatches)}")
