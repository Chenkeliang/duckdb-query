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

// ============================================================================
// 联邦查询支持
// ============================================================================

/**
 * 附加数据库信息
 */
export interface AttachDatabase {
  /** 数据库别名，用于 SQL 中引用 */
  alias: string;
  /** 数据库连接 ID */
  connectionId: string;
}

/**
 * 数据库连接信息
 */
export interface DatabaseConnection {
  id: string;
  name: string;
  type: DatabaseType;
  host?: string;
  port?: number;
  database?: string;
}

/**
 * 表引用信息
 */
export interface TableReference {
  name: string;
  schema?: string;
  alias?: string;
  isExternal: boolean;
  connectionId?: string;
}

/**
 * 生成唯一的数据库别名
 *
 * @param connection - 数据库连接信息
 * @param existingAliases - 已存在的别名集合（用于避免冲突）
 * @returns 唯一的数据库别名
 *
 * @example
 * generateDatabaseAlias({ id: '1', name: 'orders_db', type: 'mysql' })
 * // => 'mysql_orders_db'
 */
export function generateDatabaseAlias(
  connection: DatabaseConnection,
  existingAliases?: Set<string>
): string {
  // 基础别名: 类型_名称，如 mysql_orders_db
  const baseAlias = `${connection.type}_${connection.name}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_") // 合并连续下划线
    .replace(/^_|_$/g, ""); // 移除首尾下划线

  // 确保以字母开头
  const safeAlias = /^[a-z]/.test(baseAlias) ? baseAlias : `db_${baseAlias}`;

  if (!existingAliases || !existingAliases.has(safeAlias)) {
    return safeAlias;
  }

  // 如果有冲突，添加数字后缀
  let counter = 1;
  while (existingAliases.has(`${safeAlias}_${counter}`)) {
    counter++;
  }
  return `${safeAlias}_${counter}`;
}

/**
 * 从选中的表列表中提取需要 ATTACH 的外部数据库
 *
 * @param tables - 选中的表列表
 * @returns 需要 ATTACH 的数据库列表（去重）
 *
 * @example
 * extractAttachDatabases([
 *   { name: 'users', source: 'duckdb' },
 *   { name: 'orders', source: 'external', connection: { id: '1', name: 'mysql_db', type: 'mysql' } },
 *   { name: 'products', source: 'external', connection: { id: '1', name: 'mysql_db', type: 'mysql' } },
 * ])
 * // => [{ alias: 'mysql_mysql_db', connectionId: '1' }]
 */
export function extractAttachDatabases(tables: SelectedTable[]): AttachDatabase[] {
  const seen = new Set<string>();
  const existingAliases = new Set<string>();
  const result: AttachDatabase[] = [];

  for (const table of tables) {
    const normalized = normalizeSelectedTable(table);

    // 只处理外部表
    if (normalized.source !== "external" || !normalized.connection) {
      continue;
    }

    const connectionId = normalized.connection.id;

    // 跳过已处理的连接
    if (seen.has(connectionId)) {
      continue;
    }

    seen.add(connectionId);

    // 生成唯一别名
    const alias = generateDatabaseAlias(
      {
        id: connectionId,
        name: normalized.connection.name,
        type: normalized.connection.type,
      },
      existingAliases
    );

    existingAliases.add(alias);

    result.push({
      alias,
      connectionId,
    });
  }

  return result;
}

/**
 * 格式化表引用（用于 SQL 生成）
 *
 * @param table - 表引用信息
 * @param dialect - SQL 方言
 * @returns 格式化后的表引用字符串
 *
 * @example
 * // 外部表
 * formatTableReference({ name: 'users', alias: 'mysql_db', isExternal: true }, 'duckdb')
 * // => '"mysql_db"."users"'
 *
 * // 外部表带 schema
 * formatTableReference({ name: 'users', schema: 'public', alias: 'pg_db', isExternal: true }, 'duckdb')
 * // => '"pg_db"."public"."users"'
 *
 * // DuckDB 本地表
 * formatTableReference({ name: 'local_users', isExternal: false }, 'duckdb')
 * // => '"local_users"'
 */
export function formatTableReference(
  table: TableReference,
  dialect: SqlDialect
): string {
  if (table.isExternal && table.alias) {
    // 外部表: alias.schema.table 或 alias.table
    const parts = [table.alias];
    if (table.schema) {
      parts.push(table.schema);
    }
    parts.push(table.name);
    return parts.map((p) => quoteIdent(p, dialect)).join(".");
  }

  // DuckDB 本地表: 直接使用表名（可能带 schema）
  if (table.schema) {
    return `${quoteIdent(table.schema, dialect)}.${quoteIdent(table.name, dialect)}`;
  }
  return quoteIdent(table.name, dialect);
}

/**
 * 从选中的表创建表引用
 *
 * @param table - 选中的表
 * @param attachDatabases - 已生成的 attach_databases 列表（用于查找别名）
 * @returns 表引用信息
 */
export function createTableReference(
  table: SelectedTable,
  attachDatabases: AttachDatabase[]
): TableReference {
  const normalized = normalizeSelectedTable(table);

  if (normalized.source === "external" && normalized.connection) {
    // 查找对应的别名
    const attachDb = attachDatabases.find(
      (db) => db.connectionId === normalized.connection?.id
    );

    return {
      name: normalized.name,
      schema: normalized.schema,
      alias: attachDb?.alias,
      isExternal: true,
      connectionId: normalized.connection.id,
    };
  }

  // DuckDB 本地表
  return {
    name: normalized.name,
    schema: normalized.schema,
    isExternal: false,
  };
}

