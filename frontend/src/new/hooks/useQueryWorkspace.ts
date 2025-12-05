import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { executeDuckDBSQL } from "@/services/apiClient";
import { toast } from "sonner";

/**
 * 查询工作台状态管理 Hook
 * 
 * 职责：
 * - 管理选中的表（每个查询模式独立）
 * - 管理当前查询模式
 * - 管理查询结果
 * - 提供表选择、Tab 切换、查询执行等操作
 */

export interface TableSource {
  type: 'duckdb' | 'external';
  connectionId?: string;
  schema?: string;
}

export interface SelectedTable {
  name: string;
  source: TableSource;
}

export interface QueryResult {
  data: any[][] | null;
  columns: string[] | null;
  loading: boolean;
  error: Error | null;
  rowCount?: number;
  execTime?: number;
}

export interface UseQueryWorkspaceReturn {
  selectedTables: Record<string, string[]>;
  currentTab: string;
  queryResults: QueryResult | null;
  handleTableSelect: (table: string, source?: TableSource) => void;
  handleTabChange: (tab: string) => void;
  handleQueryExecute: (sql: string) => Promise<void>;
}

export const useQueryWorkspace = (): UseQueryWorkspaceReturn => {
  // 每个查询模式的选中表
  const [selectedTables, setSelectedTables] = useState<Record<string, string[]>>({
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

  // 查询执行 mutation
  const queryMutation = useMutation({
    mutationFn: async (sql: string) => {
      const startTime = Date.now();
      const response = await executeDuckDBSQL(sql);
      const execTime = Date.now() - startTime;
      return { ...response, execTime };
    },
    onMutate: () => {
      setQueryResults({
        data: null,
        columns: null,
        loading: true,
        error: null,
      });
    },
    onSuccess: (data) => {
      setQueryResults({
        data: data.data || [],
        columns: data.columns || [],
        loading: false,
        error: null,
        rowCount: data.data?.length || 0,
        execTime: data.execTime,
      });
      toast.success(`查询成功，返回 ${data.data?.length || 0} 行数据`);
    },
    onError: (error: Error) => {
      setQueryResults({
        data: null,
        columns: null,
        loading: false,
        error,
      });
      toast.error(`查询失败: ${error.message}`);
    },
  });

  // 表选择处理
  const handleTableSelect = useCallback(
    (table: string, source?: TableSource) => {
      // 如果没有提供 source，默认为 DuckDB 表
      const tableSource = source || { type: 'duckdb' };
      
      // 生成完整的表标识符
      // 外部表格式: connectionId.schema.table 或 connectionId.table
      // DuckDB 表格式: table
      const tableIdentifier = tableSource.type === 'external'
        ? `${tableSource.connectionId}.${tableSource.schema ? tableSource.schema + '.' : ''}${table}`
        : table;

      setSelectedTables((prev) => {
        const currentTables = prev[currentTab] || [];

        // 单选模式（sql, pivot, visual）
        if (currentTab === "sql" || currentTab === "pivot" || currentTab === "visual") {
          return {
            ...prev,
            [currentTab]: [tableIdentifier],
          };
        }

        // 多选模式（join, set）
        if (currentTables.includes(tableIdentifier)) {
          // 取消选择
          return {
            ...prev,
            [currentTab]: currentTables.filter((t) => t !== tableIdentifier),
          };
        } else {
          // 添加选择
          return {
            ...prev,
            [currentTab]: [...currentTables, tableIdentifier],
          };
        }
      });
    },
    [currentTab]
  );

  // Tab 切换处理
  const handleTabChange = useCallback((tab: string) => {
    setCurrentTab(tab);
  }, []);

  // 查询执行处理
  const handleQueryExecute = useCallback(
    async (sql: string) => {
      await queryMutation.mutateAsync(sql);
    },
    [queryMutation]
  );

  return {
    selectedTables,
    currentTab,
    queryResults,
    handleTableSelect,
    handleTabChange,
    handleQueryExecute,
  };
};
