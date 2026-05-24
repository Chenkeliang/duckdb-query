import { useState, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  executeDuckDBSQL,
  executeFederatedQuery,
  cancelSyncQuery,
  type ColumnInfo,
} from "@/api";
import { showSuccessToast, showErrorToast } from "@/utils/toastHelpers";
import { toast } from "sonner";
import type {
  SelectedTable,
  SelectedTableObject,
  DatabaseType
} from '../types/SelectedTable';
import { normalizeSelectedTable } from '../utils/tableUtils';
import type { JoinWorkspaceSnapshot } from '@/Query/JoinQuery/joinWorkspaceSnapshot';
import type {
  AttachDatabase,
  LastQuery,
  QueryResult,
  ResultTabEntry,
  TableSource,
} from '@/types/queryWorkspace';
import { loadQueryResultSettings } from '@/utils/queryResultSettingsStorage';
import {
  appendResultTab,
  closeOtherResultTabs,
  closeResultTab,
  closeResultTabsToLeft,
  closeResultTabsToRight,
  deriveSingleResultSlotLabel,
  pickAdjacentActiveTabId,
} from '@/Query/ResultPanel/resultTabUtils';

export type {
  AttachDatabase,
  TableSource,
  LastQuery,
  QueryResult,
  ResultTabEntry,
};

export interface JoinRestoreRequest {
  token: number;
  snapshot: JoinWorkspaceSnapshot;
}

export interface UseQueryWorkspaceReturn {
  selectedTables: Record<string, SelectedTable[]>;
  currentTab: string;
  queryResults: QueryResult | null;
  /** 新查询执行中（多 Tab 模式下不清空当前表格，仅用于工具栏 loading） */
  isResultLoading: boolean;
  lastQuery: LastQuery | null;
  retainQueryResults: boolean;
  resultTabs: ResultTabEntry[];
  activeResultTabId: string | null;
  singleResultSlotLabel: string;
  handleTableSelect: (table: SelectedTable) => void;
  handleRemoveTable: (table: SelectedTable) => void;
  handleTabChange: (tab: string) => void;
  handleQueryExecute: (sql: string, source?: TableSource) => Promise<void>;
  refreshActiveResult: () => Promise<void>;
  /** 仅刷新指定结果 Tab（默认当前选中 Tab） */
  refreshResultTab: (tabId?: string) => Promise<void>;
  selectResultTab: (id: string) => void;
  closeResultTabById: (id: string) => void;
  closeOtherResultTabsById: (id: string) => void;
  closeResultTabsToLeftOf: (id: string) => void;
  closeResultTabsToRightOf: (id: string) => void;
  displayQueryPreview: (
    response: {
      data?: unknown[];
      columns?: string[] | ColumnInfo[] | Array<{ name: string }>;
      row_count?: number;
      execTime?: number;
      preview_limit_applied?: number | null;
    },
    sql?: string,
    source?: TableSource
  ) => void;
  cancelQuery: () => Promise<void>;
  isCancelling: boolean;
  isCancelled: boolean;
  joinRestoreRequest: JoinRestoreRequest | null;
  restoreJoinWorkspace: (snapshot: JoinWorkspaceSnapshot) => void;
  clearJoinRestoreRequest: () => void;
}

const isSameTable = (a: SelectedTable, b: SelectedTable): boolean => {
  const normalizedA = normalizeSelectedTable(a);
  const normalizedB = normalizeSelectedTable(b);

  if (normalizedA.source !== normalizedB.source) return false;
  if (normalizedA.name !== normalizedB.name) return false;

  if (normalizedA.source === 'external' && normalizedB.source === 'external') {
    return (
      normalizedA.connection?.id === normalizedB.connection?.id &&
      normalizedA.schema === normalizedB.schema
    );
  }

  return true;
};

const emptyResult: QueryResult = {
  data: null,
  columns: null,
  loading: false,
  error: null,
};

export const useQueryWorkspace = (): UseQueryWorkspaceReturn => {
  const { t } = useTranslation('common');
  const retainQueryResults = loadQueryResultSettings().retainQueryResults;

  const [selectedTables, setSelectedTables] = useState<Record<string, SelectedTable[]>>({
    sql: [],
    join: [],
    set: [],
    pivot: [],
  });

  const [currentTab, setCurrentTab] = useState<string>("sql");
  const [joinRestoreRequest, setJoinRestoreRequest] = useState<JoinRestoreRequest | null>(null);

  const [resultTabs, setResultTabs] = useState<ResultTabEntry[]>([]);
  const [activeResultTabId, setActiveResultTabId] = useState<string | null>(null);
  const resultTabSequenceRef = useRef(0);

  const [singleResult, setSingleResult] = useState<QueryResult | null>(null);
  const [singleLastQuery, setSingleLastQuery] = useState<LastQuery | null>(null);
  const [singleResultSlotLabel, setSingleResultSlotLabel] = useState('');

  const [isResultLoading, setIsResultLoading] = useState(false);

  const [isCancelling, setIsCancelling] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const currentRequestIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const buildQueryResult = useCallback((
    response: {
      data?: unknown[];
      columns?: string[] | ColumnInfo[] | Array<{ name: string }>;
      execTime?: number;
      execution_time_ms?: number;
      preview_limit_applied?: number | null;
      row_count?: number;
    }
  ): QueryResult => {
    const rawCols = response.columns || [];
    const columns = rawCols.map((col) =>
      typeof col === 'string' ? col : String((col as { name: string }).name)
    );
    const rawData = response.data || [];

    let objectData: Record<string, unknown>[];

    if (rawData.length > 0 && typeof rawData[0] === 'object' && !Array.isArray(rawData[0])) {
      objectData = rawData as Record<string, unknown>[];
    } else {
      objectData = (rawData as unknown[][]).map((row) => {
        const obj: Record<string, unknown> = {};
        columns.forEach((col: string, index: number) => {
          obj[col] = row[index];
        });
        return obj;
      });
    }

    return {
      data: objectData,
      columns,
      loading: false,
      error: null,
      execTime: response.execTime || response.execution_time_ms,
      previewLimitApplied:
        response.preview_limit_applied === undefined
          ? null
          : response.preview_limit_applied,
    };
  }, []);

  const runSqlQuery = useCallback(
    async (
      sql: string,
      source: TableSource,
      requestId: string
    ): Promise<{
      data?: unknown[];
      columns?: string[] | ColumnInfo[];
      execTime?: number;
      preview_limit_applied?: number | null;
    }> => {
      if (source.type === 'federated') {
        const attachDatabases = [...(source.attachDatabases ?? [])];

        if (attachDatabases.length === 0 && source.connectionId) {
          attachDatabases.push({
            alias: source.connectionName || `db_${source.connectionId}`,
            connectionId: source.connectionId,
          });
        }

        if (attachDatabases.length === 0) {
          throw new Error('Federated query requires attach databases');
        }

        const startTime = Date.now();
        const result = await executeFederatedQuery({
          sql,
          attachDatabases,
          isPreview: false,
          requestId,
          signal: abortControllerRef.current?.signal,
        });
        const execTime = Date.now() - startTime;
        return {
          data: result.data || [],
          columns: result.columns || [],
          execTime,
          preview_limit_applied: result.preview_limit_applied ?? null,
        };
      }

      const startTime = Date.now();
      const result = await executeDuckDBSQL(sql, {
        requestId,
        signal: abortControllerRef.current?.signal,
      });
      const execTime = Date.now() - startTime;
      return { ...result, execTime };
    },
    []
  );

  const commitSuccessfulResult = useCallback(
    (sql: string, source: TableSource, response: Parameters<typeof buildQueryResult>[0]) => {
      const result = buildQueryResult(response);
      const query: LastQuery = { sql, source };
      const slotLabel = deriveSingleResultSlotLabel(sql);

      if (retainQueryResults) {
        resultTabSequenceRef.current += 1;
        const id = crypto.randomUUID();
        const label = t('query.result.tabLabel', { n: resultTabSequenceRef.current });
        const entry: ResultTabEntry = { id, label, query, result };
        setResultTabs((prev) => appendResultTab(prev, entry));
        setActiveResultTabId(id);
      } else {
        setSingleResult(result);
        setSingleLastQuery(query);
        setSingleResultSlotLabel(slotLabel || t('query.result.defaultTitle', '查询结果'));
      }

      setIsResultLoading(false);
      const rowCount = response.data?.length ?? 0;
      showSuccessToast(t, 'QUERY_SUCCESS', t('query.success', { count: rowCount }));
    },
    [buildQueryResult, retainQueryResults, t]
  );

  const updateActiveTabResult = useCallback(
    (
      sql: string,
      source: TableSource,
      response: Parameters<typeof buildQueryResult>[0],
      tabId: string
    ) => {
      const result = buildQueryResult(response);
      const query: LastQuery = { sql, source };

      if (retainQueryResults) {
        setResultTabs((prev) =>
          prev.map((tab) =>
            tab.id === tabId ? { ...tab, query, result } : tab
          )
        );
      } else {
        setSingleResult(result);
        setSingleLastQuery(query);
        setSingleResultSlotLabel(
          deriveSingleResultSlotLabel(sql) || t('query.result.defaultTitle', '查询结果')
        );
      }

      setIsResultLoading(false);
      const rowCount = response.data?.length ?? 0;
      showSuccessToast(t, 'QUERY_SUCCESS', t('query.success', { count: rowCount }));
    },
    [buildQueryResult, retainQueryResults, t]
  );

  const activeTabEntry = useMemo(
    () => resultTabs.find((tab) => tab.id === activeResultTabId) ?? null,
    [resultTabs, activeResultTabId]
  );

  const queryResults = useMemo((): QueryResult | null => {
    if (retainQueryResults) {
      // 多 Tab：各 Tab 自带 loading；切换 Tab 时不受其他 Tab 刷新影响
      return activeTabEntry?.result ?? null;
    }
    if (singleResult) {
      return singleResult;
    }
    if (isResultLoading) {
      return { ...emptyResult, loading: true };
    }
    return null;
  }, [retainQueryResults, isResultLoading, activeTabEntry, singleResult]);

  const lastQuery = useMemo((): LastQuery | null => {
    if (retainQueryResults) {
      return activeTabEntry?.query ?? null;
    }
    return singleLastQuery;
  }, [retainQueryResults, activeTabEntry, singleLastQuery]);

  const beginQueryExecution = useCallback(
    (options?: { refresh?: boolean; tabId?: string }) => {
      const requestId = crypto.randomUUID();
      currentRequestIdRef.current = requestId;
      abortControllerRef.current = new AbortController();
      setIsCancelled(false);

      if (retainQueryResults && options?.refresh && options.tabId) {
        setResultTabs((prev) =>
          prev.map((tab) =>
            tab.id === options.tabId
              ? {
                  ...tab,
                  result: { ...tab.result, loading: true, error: null },
                }
              : tab
          )
        );
      } else {
        setIsResultLoading(true);
        if (!retainQueryResults) {
          setSingleResult({
            data: null,
            columns: null,
            loading: true,
            error: null,
          });
        }
      }

      return requestId;
    },
    [retainQueryResults]
  );

  const executeQuery = useCallback(
    async (
      sql: string,
      source?: TableSource,
      options?: { refresh?: boolean; tabId?: string }
    ) => {
      const querySource: TableSource = source || { type: 'duckdb' };
      const requestId = beginQueryExecution(options);

      try {
        const response = await runSqlQuery(sql, querySource, requestId);

        if (currentRequestIdRef.current !== requestId) {
          return;
        }

        if (options?.refresh && options.tabId) {
          updateActiveTabResult(sql, querySource, response, options.tabId);
        } else {
          commitSuccessfulResult(sql, querySource, response);
        }
      } catch (error) {
        if (currentRequestIdRef.current !== requestId) {
          return;
        }

        setIsResultLoading(false);

        if (retainQueryResults && options?.refresh && options.tabId) {
          setResultTabs((prev) =>
            prev.map((tab) =>
              tab.id === options.tabId
                ? {
                    ...tab,
                    result: {
                      ...tab.result,
                      loading: false,
                      error: error as Error,
                    },
                  }
                : tab
            )
          );
        } else if (!retainQueryResults) {
          setSingleResult({
            data: null,
            columns: null,
            loading: false,
            error: error as Error,
          });
        }

        showErrorToast(t, undefined, t('query.error', { message: (error as Error).message }));
      }
    },
    [beginQueryExecution, commitSuccessfulResult, retainQueryResults, runSqlQuery, t, updateActiveTabResult]
  );

  const handleQueryExecute = useCallback(
    async (sql: string, source?: TableSource) => {
      await executeQuery(sql, source);
    },
    [executeQuery]
  );

  const refreshResultTab = useCallback(
    async (tabId?: string) => {
      const targetId = tabId ?? activeResultTabId;
      if (!targetId) return;

      const tab = resultTabs.find((entry) => entry.id === targetId);
      if (!tab?.query?.sql) return;

      await executeQuery(tab.query.sql, tab.query.source, {
        refresh: true,
        tabId: targetId,
      });
    },
    [activeResultTabId, executeQuery, resultTabs]
  );

  const refreshActiveResult = useCallback(async () => {
    await refreshResultTab(activeResultTabId ?? undefined);
  }, [activeResultTabId, refreshResultTab]);

  const selectResultTab = useCallback((id: string) => {
    setActiveResultTabId(id);
  }, []);

  const closeResultTabById = useCallback((id: string) => {
    setResultTabs((prev) => {
      const next = closeResultTab(prev, id);
      setActiveResultTabId((current) => {
        if (current !== id) return current;
        return pickAdjacentActiveTabId(prev, id);
      });
      return next;
    });
  }, []);

  const closeOtherResultTabsById = useCallback((id: string) => {
    setResultTabs((prev) => closeOtherResultTabs(prev, id));
    setActiveResultTabId(id);
  }, []);

  const closeResultTabsToLeftOf = useCallback((id: string) => {
    setResultTabs((prev) => closeResultTabsToLeft(prev, id));
    setActiveResultTabId(id);
  }, []);

  const closeResultTabsToRightOf = useCallback((id: string) => {
    setResultTabs((prev) => closeResultTabsToRight(prev, id));
    setActiveResultTabId(id);
  }, []);

  const handleTableSelect = useCallback(
    (table: SelectedTable) => {
      const normalized = normalizeSelectedTable(table);

      setSelectedTables((prev) => {
        const currentTables = prev[currentTab] || [];

        if (currentTab === "sql" || currentTab === "pivot") {
          return {
            ...prev,
            [currentTab]: [normalized],
          };
        }

        const existingIndex = currentTables.findIndex((tbl) => isSameTable(tbl, normalized));

        if (existingIndex >= 0) {
          return {
            ...prev,
            [currentTab]: currentTables.filter((_, i) => i !== existingIndex),
          };
        }

        return {
          ...prev,
          [currentTab]: [...currentTables, normalized],
        };
      });
    },
    [currentTab]
  );

  const handleRemoveTable = useCallback(
    (table: SelectedTable) => {
      setSelectedTables((prev) => {
        const currentTables = prev[currentTab] || [];
        return {
          ...prev,
          [currentTab]: currentTables.filter((tbl) => !isSameTable(tbl, table)),
        };
      });
    },
    [currentTab]
  );

  const restoreJoinWorkspace = useCallback((snapshot: JoinWorkspaceSnapshot) => {
    setSelectedTables((prev) => ({
      ...prev,
      join: snapshot.tables,
    }));
    setJoinRestoreRequest({ token: Date.now(), snapshot });
    setCurrentTab('join');
  }, []);

  const clearJoinRestoreRequest = useCallback(() => {
    setJoinRestoreRequest(null);
  }, []);

  const handleTabChange = useCallback((tab: string) => {
    setCurrentTab(tab);
  }, []);

  const cancelQuery = useCallback(async () => {
    setIsCancelling(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (currentRequestIdRef.current) {
      try {
        await cancelSyncQuery(currentRequestIdRef.current);
      } catch (e) {
        console.warn('Cancel request failed:', e);
      }
      currentRequestIdRef.current = null;
    }

    setIsCancelled(true);
    setIsCancelling(false);
    setIsResultLoading(false);

    if (retainQueryResults && activeResultTabId) {
      setResultTabs((prev) =>
        prev.map((tab) =>
          tab.id === activeResultTabId
            ? {
                ...tab,
                result: {
                  ...tab.result,
                  loading: false,
                  error: new Error(t('query.cancelled')),
                },
              }
            : tab
        )
      );
    } else if (!retainQueryResults) {
      setSingleResult((prev) =>
        prev
          ? { ...prev, loading: false, error: new Error(t('query.cancelled')) }
          : null
      );
    }

    toast.info(t('query.cancelled'));
  }, [activeResultTabId, retainQueryResults, t]);

  const displayQueryPreview = useCallback(
    (
      response: {
        data?: unknown[];
        columns?: string[] | ColumnInfo[] | Array<{ name: string }>;
        row_count?: number;
        execTime?: number;
        preview_limit_applied?: number | null;
      },
      sql?: string,
      source: TableSource = { type: 'duckdb' }
    ) => {
      if (!sql) {
        const built = buildQueryResult({
          ...response,
          columns:
            response.columns ??
            (response.data?.length
              ? Object.keys(response.data[0] as Record<string, unknown>)
              : []),
        });
        if (retainQueryResults && activeResultTabId) {
          setResultTabs((prev) =>
            prev.map((tab) =>
              tab.id === activeResultTabId ? { ...tab, result: built } : tab
            )
          );
        } else {
          setSingleResult(built);
        }
        return;
      }

      commitSuccessfulResult(sql, source, {
        ...response,
        columns:
          response.columns ??
          (response.data?.length
            ? Object.keys(response.data[0] as Record<string, unknown>)
            : []),
      });
    },
    [activeResultTabId, buildQueryResult, commitSuccessfulResult, retainQueryResults]
  );

  return {
    selectedTables,
    currentTab,
    queryResults,
    isResultLoading,
    lastQuery,
    retainQueryResults,
    resultTabs,
    activeResultTabId,
    singleResultSlotLabel,
    handleTableSelect,
    handleRemoveTable,
    handleTabChange,
    handleQueryExecute,
    refreshActiveResult,
    refreshResultTab,
    selectResultTab,
    closeResultTabById,
    closeOtherResultTabsById,
    closeResultTabsToLeftOf,
    closeResultTabsToRightOf,
    displayQueryPreview,
    cancelQuery,
    isCancelling,
    isCancelled,
    joinRestoreRequest,
    restoreJoinWorkspace,
    clearJoinRestoreRequest,
  };
};

export type { SelectedTable, SelectedTableObject, DatabaseType };
