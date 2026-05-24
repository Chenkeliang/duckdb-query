import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getDuckDBTableDetail, getExternalTableDetail } from '@/api';
import type { SelectedTable } from '@/types/SelectedTable';
import {
  parseSQLTableReferences,
  type ParsedTableReference,
} from '@/utils/sqlUtils';
import { getTableName, normalizeSelectedTable } from '@/utils/tableUtils';
import {
  registerAutocompleteColumnKeys,
  resolveParsedTableReference,
} from '@/utils/sqlAutocompleteSchema';
import {
  TABLE_COLUMNS_QUERY_KEY,
  transformDuckDBColumns,
  transformExternalColumns,
  type TableColumn,
} from '@/hooks/useTableColumns';

export interface UseSqlColumnAutocompleteOptions {
  sql: string;
  selectedTables?: SelectedTable[];
  duckdbTableNames?: string[];
  enabled?: boolean;
}

export interface UseSqlColumnAutocompleteResult {
  columnMap: Record<string, string[]>;
  flatColumnNames: string[];
  isLoading: boolean;
}

function tableDedupeKey(table: SelectedTable): string {
  const norm = normalizeSelectedTable(table);
  if (norm.source === 'external' && norm.connection) {
    return `ext:${norm.connection.id}:${norm.schema ?? ''}:${norm.name}`;
  }
  return `duckdb:${norm.name}`;
}

function collectTablesForColumnFetch(
  sql: string,
  selectedTables: SelectedTable[],
  duckdbTableNames: ReadonlySet<string>
): Array<{ table: SelectedTable; parsedRef?: ParsedTableReference }> {
  const entries: Array<{ table: SelectedTable; parsedRef?: ParsedTableReference }> = [];
  const seen = new Set<string>();

  const add = (table: SelectedTable, parsedRef?: ParsedTableReference) => {
    const key = tableDedupeKey(table);
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ table, parsedRef });
  };

  selectedTables.forEach((table) => add(table));

  const refs = parseSQLTableReferences(sql);
  for (const ref of refs) {
    const resolved = resolveParsedTableReference(ref, duckdbTableNames, selectedTables);
    if (resolved) {
      add(resolved, ref);
    }
  }

  return entries;
}

export function useSqlColumnAutocomplete(
  options: UseSqlColumnAutocompleteOptions
): UseSqlColumnAutocompleteResult {
  const {
    sql,
    selectedTables = [],
    duckdbTableNames = [],
    enabled = true,
  } = options;

  const duckdbNameSet = useMemo(
    () => new Set(duckdbTableNames),
    [duckdbTableNames]
  );

  const tableEntries = useMemo(
    () =>
      enabled
        ? collectTablesForColumnFetch(sql, selectedTables, duckdbNameSet)
        : [],
    [sql, selectedTables, duckdbNameSet, enabled]
  );

  const columnQueries = useQueries({
    queries: tableEntries.map(({ table }) => {
      const normalized = normalizeSelectedTable(table);
      const tableName = getTableName(table);
      const isExternal = normalized.source === 'external';
      const connectionId = normalized.connection?.id;
      const schema = normalized.schema;

      return {
        queryKey: [
          ...TABLE_COLUMNS_QUERY_KEY,
          tableName,
          isExternal ? connectionId : 'duckdb',
          schema,
        ] as const,
        queryFn: async (): Promise<TableColumn[]> => {
          if (!tableName) return [];
          if (isExternal && connectionId) {
            const response = await getExternalTableDetail(
              connectionId,
              tableName,
              schema
            );
            return transformExternalColumns(response?.columns);
          }
          const response = await getDuckDBTableDetail(tableName);
          return transformDuckDBColumns(response?.columns);
        },
        enabled: enabled && !!tableName,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: 1,
      };
    }),
  });

  const columnMap = useMemo(() => {
    const map: Record<string, string[]> = {};

    tableEntries.forEach((entry, index) => {
      const cols = columnQueries[index]?.data ?? [];
      const names = cols.map((c) => c.name).filter(Boolean);
      if (names.length === 0) return;
      registerAutocompleteColumnKeys(map, names, {
        table: entry.table,
        parsedRef: entry.parsedRef,
      });
    });

    return map;
  }, [tableEntries, columnQueries]);

  const flatColumnNames = useMemo(() => {
    const unique = new Set<string>();
    Object.values(columnMap).forEach((names) => {
      names.forEach((name) => unique.add(name));
    });
    return [...unique];
  }, [columnMap]);

  const isLoading = columnQueries.some((q) => q.isLoading);

  return { columnMap, flatColumnNames, isLoading };
}

export default useSqlColumnAutocomplete;
