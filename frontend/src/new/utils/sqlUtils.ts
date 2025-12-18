import type { DatabaseType, SelectedTable } from "@/new/types/SelectedTable";
import type { TableSource } from "@/new/hooks/useQueryWorkspace";
import { normalizeSelectedTable } from "@/new/utils/tableUtils";

export type SqlDialect = DatabaseType | "duckdb";

function escapeIdentifier(identifier: string, dialect: SqlDialect): string {
  if (dialect === "mysql") {
    return identifier.replace(/`/g, "``");
  }
  if (dialect === "sqlserver") {
    return identifier.replace(/]/g, "]]");
  }
  return identifier.replace(/"/g, '""');
}

export function quoteIdent(identifier: string, dialect: SqlDialect): string {
  const escaped = escapeIdentifier(identifier, dialect);
  if (dialect === "mysql") return `\`${escaped}\``;
  if (dialect === "sqlserver") return `[${escaped}]`;
  return `"${escaped}"`;
}

export function quoteQualifiedTable(
  table: { name: string; schema?: string },
  dialect: SqlDialect
): string {
  if (table.schema) {
    return `${quoteIdent(table.schema, dialect)}.${quoteIdent(table.name, dialect)}`;
  }
  return quoteIdent(table.name, dialect);
}

export function getDialectFromSource(source?: TableSource): SqlDialect {
  if (source?.type === "external") {
    return source.databaseType ?? "mysql";
  }
  return "duckdb";
}

export function getSourceFromSelectedTable(table: SelectedTable): TableSource {
  const normalized = normalizeSelectedTable(table);
  if (normalized.source === "external" && normalized.connection) {
    return {
      type: "external",
      connectionId: normalized.connection.id,
      connectionName: normalized.connection.name,
      databaseType: normalized.connection.type,
      schema: normalized.schema,
    };
  }
  return { type: "duckdb" };
}

