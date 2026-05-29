import type { DatabaseType } from '@/types/SelectedTable';

export interface AttachDatabase {
  connectionId: string;
  alias: string;
}

export interface TableSource {
  type: 'duckdb' | 'federated';
  connectionId?: string;
  connectionName?: string;
  databaseType?: DatabaseType;
  schema?: string;
  attachDatabases?: AttachDatabase[];
}

export interface LastQuery {
  sql: string;
  source: TableSource;
}

export interface DuckdbColumnType {
  name: string;
  duckdb_type: string;
}

export interface QueryResult {
  data: Record<string, unknown>[] | null;
  columns: string[] | null;
  duckdbColumnTypes?: DuckdbColumnType[];
  loading: boolean;
  error: Error | null;
  execTime?: number;
  previewLimitApplied?: number | null;
}

export interface ResultTabEntry {
  id: string;
  label: string;
  query: LastQuery;
  result: QueryResult;
}
