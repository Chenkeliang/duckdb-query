import type { SelectedTable } from '@/types/SelectedTable';
import type { ParsedTableReference } from '@/utils/sqlUtils';
import { generateDatabaseAlias } from '@/utils/sqlUtils';
import { normalizeSelectedTable } from '@/utils/tableUtils';

/**
 * 将列名注册到 CodeMirror schema 的多个可能表键（短名、限定名、别名）
 */
export function registerAutocompleteColumnKeys(
  columnMap: Record<string, string[]>,
  columnNames: string[],
  options: {
    table?: SelectedTable;
    parsedRef?: ParsedTableReference;
  }
): void {
  if (columnNames.length === 0) return;

  const register = (key: string | null | undefined) => {
    if (key) {
      columnMap[key] = columnNames;
    }
  };

  const { table, parsedRef } = options;

  if (table) {
    const norm = normalizeSelectedTable(table);
    register(norm.name);
    if (norm.source === 'external' && norm.connection) {
      const alias = generateDatabaseAlias(norm.connection);
      if (norm.schema) {
        register(`${alias}.${norm.schema}.${norm.name}`);
      }
      register(`${alias}.${norm.name}`);
    }
  }

  if (parsedRef) {
    register(parsedRef.fullName);
    register(parsedRef.tableName);
    if (parsedRef.tableAlias) {
      register(parsedRef.tableAlias);
    }
  }
}

/**
 * 将 SQL 解析出的表引用解析为 SelectedTable（优先已选表，其次 DuckDB 本地表名）
 */
export function resolveParsedTableReference(
  ref: ParsedTableReference,
  duckdbTableNames: ReadonlySet<string>,
  selectedTables: SelectedTable[]
): SelectedTable | null {
  for (const table of selectedTables) {
    const norm = normalizeSelectedTable(table);
    if (norm.name === ref.tableName || norm.name === ref.fullName) {
      return table;
    }
    if (ref.prefix && norm.source === 'external' && norm.connection) {
      const alias = generateDatabaseAlias(norm.connection);
      const qualified = norm.schema
        ? `${alias}.${norm.schema}.${norm.name}`
        : `${alias}.${norm.name}`;
      if (qualified === ref.fullName) {
        return table;
      }
    }
  }

  if (!ref.prefix && duckdbTableNames.has(ref.tableName)) {
    return { name: ref.tableName, source: 'duckdb' };
  }

  return null;
}

/**
 * 列名前缀匹配（ASCII 不区分大小写；中文等 Unicode 用 startsWith）
 */
export function matchesColumnNamePrefix(columnName: string, prefix: string): boolean {
  if (!prefix) return true;
  if (columnName.startsWith(prefix)) return true;
  if (/^[a-zA-Z0-9_]+$/.test(prefix)) {
    return columnName.toLowerCase().startsWith(prefix.toLowerCase());
  }
  return false;
}
