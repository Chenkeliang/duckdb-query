import { useState, useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { executeDuckDBSQL } from '@/api';
import { invalidateAfterTableCreate } from '@/new/utils/cacheInvalidation';
import type {
  QueryConfig,
  FilterConfig,
  AggregationConfig,
  SortConfig,
  JoinConfig,
} from '../QueryBuilder';

/**
 * 根据查询配置生成 SQL
 */
function buildSQL(config: QueryConfig): string {
  if (!config.table) {
    throw new Error('No table selected');
  }

  // 获取表名（支持字符串和对象格式）
  const tableName = typeof config.table === 'string' ? config.table : config.table.name;
  const hasJoins = config.joins && config.joins.length > 0;

  const parts: string[] = [];

  // SELECT 子句
  const selectParts: string[] = [];

  // 添加普通列
  if (config.columns.length > 0) {
    // 如果有 JOIN，需要为列添加表前缀以避免歧义
    if (hasJoins) {
      selectParts.push(...config.columns.map((col) => `"${tableName}"."${col}"`));
    } else {
      selectParts.push(...config.columns.map((col) => `"${col}"`));
    }
  }

  // 添加聚合列
  config.aggregations.forEach((agg) => {
    let aggExpr: string;
    const colRef = hasJoins ? `"${tableName}"."${agg.column}"` : `"${agg.column}"`;
    if (agg.function === 'COUNT_DISTINCT') {
      aggExpr = `COUNT(DISTINCT ${colRef})`;
    } else {
      aggExpr = `${agg.function}(${colRef})`;
    }
    if (agg.alias) {
      aggExpr += ` AS "${agg.alias}"`;
    }
    selectParts.push(aggExpr);
  });

  // 如果没有选择任何列，使用 *
  if (selectParts.length === 0) {
    selectParts.push('*');
  }

  parts.push(`SELECT ${selectParts.join(', ')}`);

  // FROM 子句
  parts.push(`FROM "${tableName}"`);

  // JOIN 子句
  if (hasJoins) {
    config.joins.forEach((join) => {
      if (join.targetTable && join.sourceColumn && join.targetColumn) {
        const joinType = join.joinType || 'LEFT';
        parts.push(
          `${joinType} JOIN "${join.targetTable}" ON "${tableName}"."${join.sourceColumn}" = "${join.targetTable}"."${join.targetColumn}"`
        );
      }
    });
  }

  // WHERE 子句
  if (config.filters.length > 0) {
    const whereParts: string[] = [];
    config.filters.forEach((filter, index) => {
      let condition = '';

      // 添加逻辑操作符（第一个条件除外）
      if (index > 0) {
        condition += ` ${filter.logicOperator} `;
      }

      // 构建条件表达式（如果有 JOIN，需要表前缀）
      const column = hasJoins ? `"${tableName}"."${filter.column}"` : `"${filter.column}"`;
      switch (filter.operator) {
        case 'IS NULL':
          condition += `${column} IS NULL`;
          break;
        case 'IS NOT NULL':
          condition += `${column} IS NOT NULL`;
          break;
        case 'BETWEEN':
          condition += `${column} BETWEEN ${escapeValue(filter.value)} AND ${escapeValue(filter.value2)}`;
          break;
        case 'IN':
          const values = String(filter.value).split(',').map((v) => escapeValue(v.trim()));
          condition += `${column} IN (${values.join(', ')})`;
          break;
        case 'LIKE':
        case 'ILIKE':
          condition += `${column} ${filter.operator} ${escapeValue(filter.value)}`;
          break;
        default:
          condition += `${column} ${filter.operator} ${escapeValue(filter.value)}`;
      }

      whereParts.push(condition);
    });
    parts.push(`WHERE ${whereParts.join('')}`);
  }

  // GROUP BY 子句
  if (config.groupBy.length > 0) {
    const groupByParts = config.groupBy.map((col) =>
      hasJoins ? `"${tableName}"."${col}"` : `"${col}"`
    );
    parts.push(`GROUP BY ${groupByParts.join(', ')}`);
  }

  // ORDER BY 子句
  if (config.orderBy.length > 0) {
    const orderParts = config.orderBy.map((sort) => {
      const colRef = hasJoins ? `"${tableName}"."${sort.column}"` : `"${sort.column}"`;
      return `${colRef} ${sort.direction}`;
    });
    parts.push(`ORDER BY ${orderParts.join(', ')}`);
  }

  // LIMIT 子句
  if (config.limit !== undefined && config.limit > 0) {
    parts.push(`LIMIT ${config.limit}`);
  }

  return parts.join('\n');
}

/**
 * 转义 SQL 值
 */
function escapeValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  // 字符串值需要用单引号包裹，并转义内部的单引号
  return `'${String(value).replace(/'/g, "''")}'`;
}

// 初始查询配置
const initialQueryConfig: QueryConfig = {
  table: null,
  columns: [],
  joins: [],
  filters: [],
  aggregations: [],
  groupBy: [],
  orderBy: [],
  limit: 1000,
};

// 查询历史记录类型
export interface QueryHistoryItem {
  id: string;
  sql: string;
  config: QueryConfig;
  timestamp: number;
  executionTime?: number;
  rowCount?: number;
}

// 查询历史记录存储 key
const QUERY_HISTORY_KEY = 'duckquery_query_history';
const MAX_HISTORY_ITEMS = 50;

// 查询历史记录工具函数
function loadQueryHistory(): QueryHistoryItem[] {
  try {
    const stored = localStorage.getItem(QUERY_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveQueryHistory(history: QueryHistoryItem[]): void {
  try {
    // 只保留最近的 MAX_HISTORY_ITEMS 条记录
    const trimmed = history.slice(0, MAX_HISTORY_ITEMS);
    localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // 忽略存储错误
  }
}

function addToHistory(
  sql: string,
  config: QueryConfig,
  executionTime?: number,
  rowCount?: number
): QueryHistoryItem[] {
  const history = loadQueryHistory();
  const newItem: QueryHistoryItem = {
    id: `query_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    sql,
    config,
    timestamp: Date.now(),
    executionTime,
    rowCount,
  };
  // 添加到开头
  const updated = [newItem, ...history];
  saveQueryHistory(updated);
  return updated;
}

// 查询验证结果
export interface QueryValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Hook 返回类型
export interface UseQueryBuilderReturn {
  // 状态
  config: QueryConfig;
  generatedSQL: string | null;
  validation: QueryValidation;
  queryHistory: QueryHistoryItem[];

  // 操作
  updateConfig: (updates: Partial<QueryConfig>) => void;
  resetConfig: () => void;
  setTable: (tableName: string | null) => void;
  setColumns: (columns: string[]) => void;
  setFilters: (filters: FilterConfig[]) => void;
  setAggregations: (aggregations: AggregationConfig[]) => void;
  setGroupBy: (groupBy: string[]) => void;
  setJoins: (joins: JoinConfig[]) => void;
  setOrderBy: (orderBy: SortConfig[]) => void;
  setLimit: (limit: number | undefined) => void;

  // SQL 生成
  generateSQL: () => Promise<string | null>;
  isGeneratingSQL: boolean;

  // 查询执行
  executeQuery: (options?: { saveAsTable?: string; isPreview?: boolean }) => Promise<unknown>;
  isExecuting: boolean;

  // 历史记录
  loadFromHistory: (item: QueryHistoryItem) => void;
  clearHistory: () => void;
}

/**
 * 查询构建器 Hook
 * 
 * 管理查询配置状态，提供 SQL 生成和查询执行功能
 * 
 * @example
 * ```tsx
 * const {
 *   config,
 *   updateConfig,
 *   generateSQL,
 *   executeQuery,
 *   isExecuting,
 * } = useQueryBuilder();
 * ```
 */
export function useQueryBuilder(
  initialConfig?: Partial<QueryConfig>
): UseQueryBuilderReturn {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();

  // 查询配置状态
  const [config, setConfig] = useState<QueryConfig>({
    ...initialQueryConfig,
    ...initialConfig,
  });

  // 生成的 SQL
  const [generatedSQL, setGeneratedSQL] = useState<string | null>(null);

  // 查询历史记录
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>(() => loadQueryHistory());

  // 验证查询配置
  const validation = useMemo((): QueryValidation => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 必须选择表
    if (!config.table) {
      errors.push(t('query.validation.noTable', '请选择一个表'));
    }

    // 必须选择至少一列（除非有聚合）
    if (config.columns.length === 0 && config.aggregations.length === 0) {
      errors.push(t('query.validation.noColumns', '请选择至少一列或添加聚合函数'));
    }

    // 验证过滤条件
    config.filters.forEach((filter, index) => {
      if (!filter.column) {
        errors.push(t('query.validation.filterNoColumn', '过滤条件 {{index}} 未选择列', { index: index + 1 }));
      }
      if (filter.operator !== 'IS NULL' && filter.operator !== 'IS NOT NULL') {
        if (filter.value === null || filter.value === undefined || filter.value === '') {
          warnings.push(t('query.validation.filterNoValue', '过滤条件 {{index}} 未设置值', { index: index + 1 }));
        }
      }
      if (filter.operator === 'BETWEEN') {
        if (filter.value2 === null || filter.value2 === undefined || filter.value2 === '') {
          errors.push(t('query.validation.filterNoBetweenValue', '过滤条件 {{index}} BETWEEN 需要两个值', { index: index + 1 }));
        }
      }
    });

    // 验证聚合配置
    config.aggregations.forEach((agg, index) => {
      if (!agg.column) {
        errors.push(t('query.validation.aggNoColumn', '聚合 {{index}} 未选择列', { index: index + 1 }));
      }
    });

    // 如果有聚合但没有 GROUP BY，给出警告
    if (config.aggregations.length > 0 && config.groupBy.length === 0 && config.columns.length > 0) {
      warnings.push(t('query.validation.aggNoGroupBy', '使用聚合函数时，非聚合列应添加到 GROUP BY'));
    }

    // 验证排序配置
    config.orderBy.forEach((sort, index) => {
      if (!sort.column) {
        errors.push(t('query.validation.sortNoColumn', '排序 {{index}} 未选择列', { index: index + 1 }));
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }, [config, t]);

  // 更新配置
  const updateConfig = useCallback((updates: Partial<QueryConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
    setGeneratedSQL(null); // 清除已生成的 SQL
  }, []);

  // 重置配置
  const resetConfig = useCallback(() => {
    setConfig(initialQueryConfig);
    setGeneratedSQL(null);
  }, []);

  // 设置表
  const setTable = useCallback((tableName: string | null) => {
    setConfig((prev) => ({
      ...prev,
      table: tableName,
      columns: [],
      joins: [],
      filters: [],
      aggregations: [],
      groupBy: [],
      orderBy: [],
    }));
    setGeneratedSQL(null);
  }, []);

  // 设置列
  const setColumns = useCallback((columns: string[]) => {
    updateConfig({ columns });
  }, [updateConfig]);

  // 设置过滤条件
  const setFilters = useCallback((filters: FilterConfig[]) => {
    updateConfig({ filters });
  }, [updateConfig]);

  // 设置聚合
  const setAggregations = useCallback((aggregations: AggregationConfig[]) => {
    updateConfig({ aggregations });
  }, [updateConfig]);

  // 设置分组
  const setGroupBy = useCallback((groupBy: string[]) => {
    updateConfig({ groupBy });
  }, [updateConfig]);

  // 设置排序
  const setOrderBy = useCallback((orderBy: SortConfig[]) => {
    updateConfig({ orderBy });
  }, [updateConfig]);

  // 设置 JOIN
  const setJoins = useCallback((joins: JoinConfig[]) => {
    updateConfig({ joins });
  }, [updateConfig]);

  // 设置限制
  const setLimit = useCallback((limit: number | undefined) => {
    updateConfig({ limit });
  }, [updateConfig]);

  // 从历史记录加载
  const loadFromHistory = useCallback((item: QueryHistoryItem) => {
    setConfig(item.config);
    setGeneratedSQL(item.sql);
  }, []);

  // 清除历史记录
  const clearHistory = useCallback(() => {
    localStorage.removeItem(QUERY_HISTORY_KEY);
    setQueryHistory([]);
  }, []);

  // SQL 生成 mutation
  const generateSQLMutation = useMutation({
    mutationFn: async () => {
      if (!config.table) {
        throw new Error(t('query.validation.noTable', '请选择一个表'));
      }

      // 使用本地 SQL 生成函数
      const sql = buildSQL(config);
      return sql;
    },
    onSuccess: (sql) => {
      setGeneratedSQL(sql);
    },
    onError: (error: Error) => {
      toast.error(t('query.sql.generateError', 'SQL 生成失败: {{message}}', { message: error.message }));
    },
  });

  // 查询执行 mutation
  const executeQueryMutation = useMutation({
    mutationFn: async (options?: { saveAsTable?: string; isPreview?: boolean }) => {
      const startTime = Date.now();

      // 先生成 SQL
      let sql = generatedSQL;
      if (!sql) {
        sql = await generateSQLMutation.mutateAsync();
      }

      if (!sql) {
        throw new Error(t('query.sql.noSQL', '无法生成 SQL'));
      }

      // 执行查询
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (executeDuckDBSQL as any)(
        sql,
        options?.saveAsTable || null,
        options?.isPreview ?? true
      );

      const executionTime = Date.now() - startTime;
      const rowCount = result?.data?.length || result?.row_count || 0;

      // 添加到历史记录
      const updatedHistory = addToHistory(sql, config, executionTime, rowCount);
      setQueryHistory(updatedHistory);

      return { result, saveAsTable: options?.saveAsTable };
    },
    onSuccess: (data) => {
      // 如果保存为表，刷新数据源缓存
      if (data.saveAsTable) {
        invalidateAfterTableCreate(queryClient);
        toast.success(t('query.sql.savedToTable', { table: data.saveAsTable }));
      } else {
        toast.success(t('query.sql.executeSuccess', '查询执行成功'));
      }
    },
    onError: (error: Error) => {
      toast.error(t('query.sql.executeError', '查询执行失败: {{message}}', { message: error.message }));
    },
  });

  // 生成 SQL
  const generateSQL = useCallback(async () => {
    if (!validation.isValid) {
      validation.errors.forEach((error) => toast.error(error));
      return null;
    }
    return generateSQLMutation.mutateAsync();
  }, [validation, generateSQLMutation]);

  // 执行查询
  const executeQuery = useCallback(
    async (options?: { saveAsTable?: string; isPreview?: boolean }) => {
      if (!validation.isValid) {
        validation.errors.forEach((error) => toast.error(error));
        return null;
      }
      return executeQueryMutation.mutateAsync(options);
    },
    [validation, executeQueryMutation]
  );

  return {
    // 状态
    config,
    generatedSQL,
    validation,
    queryHistory,

    // 操作
    updateConfig,
    resetConfig,
    setTable,
    setColumns,
    setFilters,
    setAggregations,
    setGroupBy,
    setJoins,
    setOrderBy,
    setLimit,

    // SQL 生成
    generateSQL,
    isGeneratingSQL: generateSQLMutation.isPending,

    // 查询执行
    executeQuery,
    isExecuting: executeQueryMutation.isPending,

    // 历史记录
    loadFromHistory,
    clearHistory,
  };
}

export default useQueryBuilder;
