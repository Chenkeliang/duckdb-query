import { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { executeDuckDBSQL, executeFederatedQuery } from "@/api";
import { showSuccessToast, showErrorToast } from "@/utils/toastHelpers";
import { toast } from "sonner";
import type {
  SelectedTable,
  SelectedTableObject,
  DatabaseType
} from '../types/SelectedTable';
import { normalizeSelectedTable } from '../utils/tableUtils';

/**
 * 查询工作台状态管理 Hook
 *
 * 职责：
 * - 管理选中的表（每个查询模式独立）
 * - 管理当前查询模式
 * - 管理查询结果
 * - 提供表选择、Tab 切换、查询执行等操作
 */

/**
 * 附加数据库信息（用于联邦查询）
 */
export interface AttachDatabase {
  connectionId: string;
  alias: string;
}

/**
 * 表数据源信息（用于查询执行和导入）
 */
export interface TableSource {
  type: 'duckdb' | 'external' | 'federated';
  connectionId?: string;
  connectionName?: string;
  databaseType?: DatabaseType;
  schema?: string;
  /** 联邦查询需要附加的数据库列表 */
  attachDatabases?: AttachDatabase[];
}

/**
 * 最后执行的查询信息（用于导入功能）
 */
export interface LastQuery {
  sql: string;
  source: TableSource;
}

export interface QueryResult {
  /** 转换后的对象数组数据 */
  data: Record<string, unknown>[] | null;
  /** 列名列表 */
  columns: string[] | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: Error | null;
  /** 行数 */
  rowCount?: number;
  /** 执行时间（毫秒） */
  execTime?: number;
}

export interface UseQueryWorkspaceReturn {
  /** 每个 Tab 的选中表（使用 SelectedTable 对象） */
  selectedTables: Record<string, SelectedTable[]>;
  /** 当前 Tab */
  currentTab: string;
  /** 查询结果 */
  queryResults: QueryResult | null;
  /** 最后执行的查询信息（用于导入） */
  lastQuery: LastQuery | null;
  /** 选择表 */
  handleTableSelect: (table: SelectedTable) => void;
  /** 移除表 */
  handleRemoveTable: (table: SelectedTable) => void;
  /** 切换 Tab */
  handleTabChange: (tab: string) => void;
  /** 执行查询 */
  handleQueryExecute: (sql: string, source?: TableSource) => Promise<void>;
  /** 取消当前查询 */
  cancelQuery: () => Promise<void>;
  /** 是否正在取消 */
  isCancelling: boolean;
  /** 查询是否已被取消 */
  isCancelled: boolean;
}

/**
 * 比较两个 SelectedTable 是否相同
 */
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

export const useQueryWorkspace = (): UseQueryWorkspaceReturn => {
  const { t } = useTranslation('common');

  // 每个查询模式的选中表（使用 SelectedTable 对象）
  const [selectedTables, setSelectedTables] = useState<Record<string, SelectedTable[]>>({
    sql: [],
    join: [],
    set: [],
    pivot: [],
    visual: [],
  });

  // 当前查询模式
  const [currentTab, setCurrentTab] = useState<string>("sql");

  // 查询结果
  const [queryResults, setQueryResults] = useState<QueryResult | null>(null);

  // 最后执行的查询信息（用于导入功能）
  const [lastQuery, setLastQuery] = useState<LastQuery | null>(null);

  // 取消状态管理
  const [isCancelling, setIsCancelling] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const currentRequestIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // DuckDB 查询执行 mutation
  const duckdbMutation = useMutation({
    mutationFn: async (sql: string) => {
      const startTime = Date.now();
      const response = await executeDuckDBSQL(sql);
      const execTime = Date.now() - startTime;
      return { ...response, execTime };
    },
  });

  // 处理查询结果
  const processQueryResult = useCallback((
    response: { data?: unknown[]; columns?: string[]; execTime?: number; execution_time_ms?: number }
  ) => {
    const columns = response.columns || [];
    const rawData = response.data || [];

    // 检测数据格式：如果第一行是对象，则已经是对象数组；否则是二维数组
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

    const resultData: QueryResult = {
      data: objectData,
      columns: columns,
      loading: false,
      error: null,
      rowCount: rawData.length,
      execTime: response.execTime || response.execution_time_ms,
    };

    setQueryResults(resultData);
    showSuccessToast(t, 'QUERY_SUCCESS', t('query.success', { count: rawData.length }));
  }, [t]);

  // 表选择处理
  const handleTableSelect = useCallback(
    (table: SelectedTable) => {
      const normalized = normalizeSelectedTable(table);

      setSelectedTables((prev) => {
        const currentTables = prev[currentTab] || [];

        // 单选模式（sql, pivot, visual）
        if (currentTab === "sql" || currentTab === "pivot" || currentTab === "visual") {
          return {
            ...prev,
            [currentTab]: [normalized],
          };
        }

        // 多选模式（join, set）
        const existingIndex = currentTables.findIndex(t => isSameTable(t, normalized));

        if (existingIndex >= 0) {
          // 取消选择
          return {
            ...prev,
            [currentTab]: currentTables.filter((_, i) => i !== existingIndex),
          };
        } else {
          // 添加选择
          return {
            ...prev,
            [currentTab]: [...currentTables, normalized],
          };
        }
      });
    },
    [currentTab]
  );

  // 移除表处理
  const handleRemoveTable = useCallback(
    (table: SelectedTable) => {
      setSelectedTables((prev) => {
        const currentTables = prev[currentTab] || [];
        return {
          ...prev,
          [currentTab]: currentTables.filter((t) => !isSameTable(t, table)),
        };
      });
    },
    [currentTab]
  );

  // Tab 切换处理
  const handleTabChange = useCallback((tab: string) => {
    setCurrentTab(tab);
  }, []);

  // 查询执行处理
  // 统一使用两种模式：
  // 1. DuckDB 本地查询：直接执行
  // 2. 联邦查询（包括外部表）：通过 ATTACH 机制执行
  const handleQueryExecute = useCallback(
    async (sql: string, source?: TableSource) => {
      // 默认为 DuckDB 数据源
      const querySource: TableSource = source || { type: 'duckdb' };

      // 生成请求 ID 并设置取消相关状态
      const requestId = crypto.randomUUID();
      currentRequestIdRef.current = requestId;
      abortControllerRef.current = new AbortController();
      setIsCancelled(false);
      console.log('[useQueryWorkspace] Starting query with requestId:', requestId);

      // 设置加载状态
      setQueryResults({
        data: null,
        columns: null,
        loading: true,
        error: null,
      });

      try {
        let response: { data?: unknown[]; columns?: string[]; execTime?: number; execution_time_ms?: number };

        if (querySource.type === 'federated' || querySource.type === 'external') {
          // 联邦查询（包括单外部表查询，统一使用 ATTACH 模式）
          const attachDatabases = querySource.attachDatabases || [];

          // 如果是旧的 external 类型但没有 attachDatabases，尝试构建
          if (attachDatabases.length === 0 && querySource.connectionId) {
            attachDatabases.push({
              alias: querySource.connectionName || `db_${querySource.connectionId}`,
              connectionId: querySource.connectionId,
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
            requestId,  // 传递请求 ID 以支持取消
            signal: abortControllerRef.current?.signal,  // 传递 signal 以支持本地取消
          } as any) as { data?: unknown[]; columns?: string[] };
          const execTime = Date.now() - startTime;
          response = {
            data: result.data || [],
            columns: result.columns || [],
            execTime,
          };
        } else {
          // DuckDB 本地查询 - 直接调用 API 以传递 requestId 和 signal
          const startTime = Date.now();
          const result = await executeDuckDBSQL(sql, {
            requestId,
            signal: abortControllerRef.current?.signal,
          });
          const execTime = Date.now() - startTime;
          response = { ...result, execTime };
        }

        // 检查请求是否已被取消（通过比较 requestId）
        // 如果 currentRequestIdRef 已被清除或与当前请求不同，说明已取消
        if (currentRequestIdRef.current !== requestId) {
          console.log('[useQueryWorkspace] Query was cancelled, ignoring result');
          return;
        }

        // 保存最后执行的查询信息（用于导入）
        setLastQuery({ sql, source: querySource });

        // 处理结果
        processQueryResult(response);
      } catch (error) {
        // 检查是否是取消导致的错误
        if (currentRequestIdRef.current !== requestId) {
          console.log('[useQueryWorkspace] Query was cancelled, ignoring error');
          return;
        }

        setQueryResults({
          data: null,
          columns: null,
          loading: false,
          error: error as Error,
        });
        showErrorToast(t, undefined, t('query.error', { message: (error as Error).message }));
      }
    },
    [duckdbMutation, processQueryResult, t]
  );

  // 取消当前查询
  const cancelQuery = useCallback(async () => {
    console.log('[useQueryWorkspace] cancelQuery called, currentRequestId:', currentRequestIdRef.current);
    setIsCancelling(true);

    // 本地中止请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // 调用后端取消 API（如果有 requestId）
    if (currentRequestIdRef.current) {
      try {
        await fetch(`/api/query/cancel/${currentRequestIdRef.current}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        console.warn('Cancel request failed:', e);
      }
      currentRequestIdRef.current = null;
    }

    setIsCancelled(true);
    setIsCancelling(false);
    setQueryResults(prev => prev ? {
      ...prev,
      loading: false,
      error: new Error(t('query.cancelled')),
    } : null);

    toast.info(t('query.cancelled'));
  }, [t]);

  return {
    selectedTables,
    currentTab,
    queryResults,
    lastQuery,
    handleTableSelect,
    handleRemoveTable,
    handleTabChange,
    handleQueryExecute,
    cancelQuery,
    isCancelling,
    isCancelled,
  };
};

// 重新导出类型以便其他组件使用
export type { SelectedTable, SelectedTableObject, DatabaseType };
