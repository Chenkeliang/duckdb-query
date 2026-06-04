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
  /** 自动编号结果 Tab 的序号；存在时标签在渲染期按当前语言翻译（结果_N / Result_N） */
  labelSeq?: number;
  query: LastQuery;
  result: QueryResult;
  /** 是否固定：固定的 Tab 不被「关闭其他/左侧/右侧」与超额淘汰移除，且排在最前 */
  pinned?: boolean;
}
