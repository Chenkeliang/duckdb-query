/**
 * Parse a pasted database connection string into structured fields, so the
 * "新建连接" form can auto-fill. Supports the shapes users actually paste:
 *
 *   jdbc:mysql://host:3306/db
 *   mysql://user:pass@host:3306/db
 *   postgresql://user@host/db?currentSchema=reporting
 *   postgres://host/db                 (port defaults to 5432)
 *   jdbc:sqlite:/path/to/app.db
 *   /Users/me/data/local.sqlite        (bare SQLite file path)
 *
 * Returns null when the input is empty or not recognizable as a connection
 * string (so the caller can simply do nothing).
 */
export type ParsedConnectionType = "mysql" | "postgresql" | "sqlite";

export interface ParsedConnection {
  type: ParsedConnectionType;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  schema?: string;
}

const DEFAULT_PORT: Record<"mysql" | "postgresql", number> = {
  mysql: 3306,
  postgresql: 5432,
};

const safeDecode = (v: string): string => {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

export function parseConnectionString(raw: string): ParsedConnection | null {
  const input = (raw ?? "").trim();
  if (!input) return null;

  // --- SQLite: explicit sqlite URI (with optional jdbc: / sqlite:// prefixes) ---
  const sqliteUri = input.match(/^(?:jdbc:)?sqlite:(?:\/\/)?(.+)$/i);
  if (sqliteUri) {
    const path = sqliteUri[1].trim();
    return path ? { type: "sqlite", database: path } : null;
  }
  // --- SQLite: a bare file path ending in a sqlite extension (no scheme) ---
  if (!/:\/\//.test(input) && /\.(db|sqlite|sqlite3)$/i.test(input)) {
    return { type: "sqlite", database: input };
  }

  // --- MySQL / PostgreSQL URI (strip a leading jdbc: if present) ---
  const s = input.replace(/^jdbc:/i, "");
  const m = s.match(
    /^(mysql|postgresql|postgres):\/\/(?:([^:@/]+)(?::([^@/]+))?@)?([^:/?#]+)(?::(\d+))?(?:\/([^?#]*))?(?:\?(.*))?$/i
  );
  if (!m) return null;

  const scheme = m[1].toLowerCase();
  const type: ParsedConnectionType = scheme.startsWith("postgres") ? "postgresql" : "mysql";

  const result: ParsedConnection = { type, host: m[4] };
  result.port = m[5] ? Number(m[5]) : DEFAULT_PORT[type];
  if (m[2]) result.username = safeDecode(m[2]);
  if (m[3]) result.password = safeDecode(m[3]);
  if (m[6]) result.database = safeDecode(m[6]);

  if (m[7]) {
    const q = new URLSearchParams(m[7]);
    const schema = q.get("currentSchema") || q.get("schema");
    if (schema) result.schema = schema;
  }

  return result;
}
