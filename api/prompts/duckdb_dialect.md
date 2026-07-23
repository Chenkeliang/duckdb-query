# DuckDB SQL dialect notes (for NL→SQL)

- DuckDB speaks standard ANSI SQL; prefer plain SELECT.
- String concat uses `||`. Use single quotes for string literals, double quotes for identifiers.
- Date/time: `CURRENT_DATE`, `date_trunc('month', ts)`, `ts - INTERVAL 7 DAY`.
- Top-N: `... ORDER BY x DESC LIMIT 10`. Use `QUALIFY` with window functions when needed.
- Pivoting: use conditional aggregation, e.g. `SELECT k, sum(CASE WHEN status = 'paid' THEN amount END) AS paid ... GROUP BY k`. NEVER use the `PIVOT` keyword (it is rewritten to CREATE+SELECT internally and rejected by the read-only gate).
- List/struct types exist; `UNNEST(list)` to expand.
- Federated tables (MySQL/PostgreSQL via ATTACH) are queried as `db_alias.schema.table`.
- Read-only only: never emit INSERT/UPDATE/DELETE/DROP/CREATE/ALTER/COPY/ATTACH.
