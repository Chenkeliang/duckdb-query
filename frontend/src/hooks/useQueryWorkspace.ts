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
  toggleResultTabPin,
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
  /** 最近一次执行失败(两种结果模式都记录):供自愈横幅等"针对失败的操作"使用,成功后清空 */
  lastFailure: { sql: string; source: TableSource; errorMessage: string } | null;
  /** 用失败时的 SQL/source 原样重跑 */
  retryLastFailure: () => Promise<void>;
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
  toggleResultTabPinById: (id: string) => void;
  displayQueryPreview: (
    response: {
      data?: unknown[];
      columns?: string[] | ColumnInfo[] | Array<{ name: string }>;
      column_types?: Array<{ name: string; duckdb_type: string }>;
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

// 结果"槽位"的稳定 key：多 Tab 保留模式下每个刷新的 Tab 是一个独立槽位
// (`tab:${tabId}`)，其余（新查询 / 单结果模式）共用单结果槽 SINGLE_SLOT_KEY。
// 请求的时效性必须按槽位判断，而不是全局最新——否则 Tab A 的慢查询在飞时刷新
// Tab B，会把全局 requestId 覆盖成 B 的，A 的响应回来因对不上被丢弃、loading
// 永不清除（回归 #10）。
const SINGLE_SLOT_KEY = '__single__';
const requestSlotKey = (options?: { refresh?: boolean; tabId?: string }): string =>
  options?.refresh && options.tabId ? `tab:${options.tabId}` : SINGLE_SLOT_KEY;

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
  // 最近一次失败:多 Tab 模式下失败的新查询不会生成结果 Tab(只有 toast),
  // 必须在工作区级记录,自愈横幅才有渲染依据(单结果模式也统一走这里)
  const [lastFailure, setLastFailure] = useState<{
    sql: string;
    source: TableSource;
    errorMessage: string;
  } | null>(null);
  const [singleResultSlotLabel, setSingleResultSlotLabel] = useState('');

  const [isResultLoading, setIsResultLoading] = useState(false);

  const [isCancelling, setIsCancelling] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  // 每个结果槽位（Tab / 单结果槽）独立追踪"最新请求 id"与"中止控制器"，避免
  // 多 Tab 并发刷新时相互覆盖（回归 #10，详见 requestSlotKey 上方注释）。
  const latestRequestByKeyRef = useRef<Map<string, string>>(new Map());
  const abortByKeyRef = useRef<Map<string, AbortController>>(new Map());

  const buildQueryResult = useCallback((
    response: {
      data?: unknown[];
      columns?: string[] | ColumnInfo[] | Array<{ name: string }>;
      column_types?: Array<{ name: string; duckdb_type: string }>;
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
      duckdbColumnTypes: response.column_types,
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
      requestId: string,
      signal?: AbortSignal
    ): Promise<{
      data?: unknown[];
      columns?: string[] | ColumnInfo[];
      column_types?: Array<{ name: string; duckdb_type: string }>;
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
          signal,
        });
        const execTime = Date.now() - startTime;
        return {
          data: result.data || [],
          columns: result.columns || [],
          column_types: result.column_types,
          execTime,
          preview_limit_applied: result.preview_limit_applied ?? null,
        };
      }

      const startTime = Date.now();
      const result = await executeDuckDBSQL(sql, {
        requestId,
        signal,
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
        const seq = resultTabSequenceRef.current;
        const label = t('query.result.tabLabel', { n: seq });
        const entry: ResultTabEntry = { id, label, labelSeq: seq, query, result };
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
      const key = requestSlotKey(options);
      // 同一槽位若已有在飞请求，先中止它——同一个 Tab 再次刷新取代上一次
      abortByKeyRef.current.get(key)?.abort();
      const controller = new AbortController();
      abortByKeyRef.current.set(key, controller);
      latestRequestByKeyRef.current.set(key, requestId);
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

      return { requestId, key, signal: controller.signal };
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
      const { requestId, key, signal } = beginQueryExecution(options);
      // 该请求所属槽位是否已被更新的请求取代（同一 Tab 又刷新了一次）——只按本
      // 槽位判断，不看全局，这样其它 Tab 的并发请求不会误伤本请求（回归 #10）
      const isStale = () => latestRequestByKeyRef.current.get(key) !== requestId;

      try {
        const response = await runSqlQuery(sql, querySource, requestId, signal);

        if (isStale()) {
          return;
        }

        if (options?.refresh && options.tabId) {
          updateActiveTabResult(sql, querySource, response, options.tabId);
        } else {
          commitSuccessfulResult(sql, querySource, response);
        }
        setLastFailure(null);
      } catch (error) {
        if (isStale()) {
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
          // 失败时也记录本次查询（sql/source），否则首次查询即失败时 lastQuery 仍是
          // 上一次成功查询（或 null），导致"重跑/AI 修复"等依赖 lastQuery 的功能取不到 SQL
          setSingleLastQuery({ sql, source: querySource });
        }
        setLastFailure({ sql, source: querySource, errorMessage: (error as Error).message });

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
      // 单结果槽（不保留多 Tab）没有 activeResultTabId/resultTabs 记录，靠 singleLastQuery 重跑
      if (!retainQueryResults) {
        if (!singleLastQuery?.sql) return;
        await executeQuery(singleLastQuery.sql, singleLastQuery.source, { refresh: true });
        return;
      }

      const targetId = tabId ?? activeResultTabId;
      if (!targetId) return;

      const tab = resultTabs.find((entry) => entry.id === targetId);
      if (!tab?.query?.sql) return;

      await executeQuery(tab.query.sql, tab.query.source, {
        refresh: true,
        tabId: targetId,
      });
    },
    [retainQueryResults, singleLastQuery, activeResultTabId, executeQuery, resultTabs]
  );

  const refreshActiveResult = useCallback(async () => {
    await refreshResultTab(activeResultTabId ?? undefined);
  }, [activeResultTabId, refreshResultTab]);

  const retryLastFailure = useCallback(async () => {
    if (!lastFailure) return;
    await executeQuery(lastFailure.sql, lastFailure.source);
  }, [lastFailure, executeQuery]);

  const selectResultTab = useCallback((id: string) => {
    setActiveResultTabId(id);
  }, []);

  const closeResultTabById = useCallback((id: string) => {
    // 关闭结果 Tab 前先释放它的刷新槽位:中止可能在跑的 fetch,并清掉两个 Map 里
    // 的 tab:${id} 记录。否则每次"刷新某 Tab 后又关闭它"都会永久残留一条
    // AbortController + requestId(Map 泄漏),且已关闭 Tab 的请求仍在后台空跑。
    // 删掉 latestRequest 记录后,该请求的结果回来时 isStale 判定为真、被丢弃。
    const key = `tab:${id}`;
    abortByKeyRef.current.get(key)?.abort();
    abortByKeyRef.current.delete(key);
    latestRequestByKeyRef.current.delete(key);

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

  const toggleResultTabPinById = useCallback((id: string) => {
    setResultTabs((prev) => toggleResultTabPin(prev, id));
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

    // 取消当前正在运行的查询：单结果槽，以及（保留模式下）当前激活 Tab 的槽位。
    // 只中止这两个槽位、不动其它 Tab 的并发刷新——取消当前查询不应连累别的 Tab。
    const keys = new Set<string>([SINGLE_SLOT_KEY]);
    if (retainQueryResults && activeResultTabId) {
      keys.add(`tab:${activeResultTabId}`);
    }
    for (const key of keys) {
      const controller = abortByKeyRef.current.get(key);
      if (controller) {
        controller.abort();
        abortByKeyRef.current.delete(key);
      }
      const requestId = latestRequestByKeyRef.current.get(key);
      if (requestId) {
        try {
          await cancelSyncQuery(requestId);
        } catch (e) {
          console.warn('Cancel request failed:', e);
        }
        latestRequestByKeyRef.current.delete(key);
      }
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
        column_types?: Array<{ name: string; duckdb_type: string }>;
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
    lastFailure,
    retryLastFailure,
    selectResultTab,
    closeResultTabById,
    closeOtherResultTabsById,
    closeResultTabsToLeftOf,
    closeResultTabsToRightOf,
    toggleResultTabPinById,
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
