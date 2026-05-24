export interface QueryResultSettings {
  /** 每次成功 SQL 执行保留独立结果 Tab（最多 20 个） */
  retainQueryResults: boolean;
}

const STORAGE_KEY = 'duckquery-query-result-settings';

export const DEFAULT_QUERY_RESULT_SETTINGS: QueryResultSettings = {
  retainQueryResults: false,
};

export function loadQueryResultSettings(): QueryResultSettings {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_QUERY_RESULT_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_QUERY_RESULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<QueryResultSettings>;
    return {
      retainQueryResults: Boolean(parsed.retainQueryResults),
    };
  } catch {
    return { ...DEFAULT_QUERY_RESULT_SETTINGS };
  }
}

export function saveQueryResultSettings(settings: QueryResultSettings): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
