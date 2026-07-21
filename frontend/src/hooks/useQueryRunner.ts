/**
 * 统一同步查询执行入口（本地 DuckDB / 联邦 ATTACH）。
 * 各 Query Panel 应优先使用本 Hook，避免直接调用 executeDuckDBSQL。
 */

import { useCallback } from "react";
import {
  useQueryWorkspace,
  type TableSource,
} from "@/hooks/useQueryWorkspace";

export interface QueryRunnerExecuteOptions {
  requestId?: string;
  signal?: AbortSignal;
  isPreview?: boolean;
  /** 无系统 LIMIT 的基础 SQL(异步/导出用它才是真全量);见 LastQuery.baseSql */
  baseSql?: string;
}

export function useQueryRunner() {
  const workspace = useQueryWorkspace();

  const execute = useCallback(
    async (
      sql: string,
      source?: TableSource,
      options?: QueryRunnerExecuteOptions
    ) => {
      await workspace.handleQueryExecute(sql, source, { baseSql: options?.baseSql });
    },
    [workspace.handleQueryExecute]
  );

  return {
    ...workspace,
    execute,
    cancel: workspace.cancelQuery,
    results: workspace.queryResults,
    displayPreview: workspace.displayQueryPreview,
  };
}

export type { TableSource };
