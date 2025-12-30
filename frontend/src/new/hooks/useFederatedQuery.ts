/**
 * 联邦查询 Hook
 *
 * 管理跨数据库联邦查询的状态和操作
 *
 * @example
 * ```tsx
 * const { attachDatabases, addTable, removeTable, executeQuery } = useFederatedQuery();
 *
 * // 添加表
 * addTable(externalTable);
 *
 * // 执行查询
 * const result = await executeQuery('SELECT * FROM mysql_db.users');
 * ```
 */

import { useState, useCallback, useMemo } from 'react';
import type { SelectedTable } from '@/new/types/SelectedTable';
import {
  extractAttachDatabases,
  formatTableReference,
  createTableReference,
  type AttachDatabase,
  type SqlDialect,
} from '@/new/utils/sqlUtils';
import { getTableName, normalizeSelectedTable } from '@/new/utils/tableUtils';
import { executeFederatedQuery, parseFederatedQueryError } from '@/api';

/**
 * 联邦查询状态
 */
export interface FederatedQueryState {
  /** 需要 ATTACH 的数据库列表 */
  attachDatabases: AttachDatabase[];
  /** 是否包含外部表 */
  hasExternalTables: boolean;
  /** 是否混合了 DuckDB 和外部表 */
  hasMixedSources: boolean;
  /** 选中的表列表 */
  selectedTables: SelectedTable[];
}

/**
 * 联邦查询错误
 */
export interface FederatedQueryError {
  type: 'connection' | 'authentication' | 'timeout' | 'network' | 'query';
  message: string;
  connectionId?: string;
  connectionName?: string;
  host?: string;
}

/**
 * 查询结果
 */
export interface QueryResult {
  success: boolean;
  data?: unknown[];
  columns?: Array<{ name: string; type: string }>;
  error?: FederatedQueryError;
  rowCount?: number;
}

/**
 * useFederatedQuery Hook 返回值
 */
export interface UseFederatedQueryReturn {
  /** 当前状态 */
  state: FederatedQueryState;

  /** 添加表 */
  addTable: (table: SelectedTable) => void;

  /** 移除表 */
  removeTable: (table: SelectedTable) => void;

  /** 清空所有表 */
  clearTables: () => void;

  /** 设置表列表 */
  setTables: (tables: SelectedTable[]) => void;

  /** 获取 attach_databases 参数 */
  getAttachDatabases: () => AttachDatabase[];

  /** 生成 SQL（用于预览） */
  generateSelectSQL: (options: {
    columns?: Array<{ table: string; column: string }>;
    dialect?: SqlDialect;
    maxQueryRows?: number;
  }) => string;

  /** 执行查询 */
  executeQuery: (sql: string, options?: { isPreview?: boolean }) => Promise<QueryResult>;

  /** 是否正在执行 */
  isExecuting: boolean;

  /** 最后的错误 */
  lastError: FederatedQueryError | null;
}

/**
 * 联邦查询 Hook
 *
 * 管理跨数据库联邦查询的状态和操作
 */
export function useFederatedQuery(
  initialTables: SelectedTable[] = []
): UseFederatedQueryReturn {
  // 选中的表列表
  const [selectedTables, setSelectedTables] = useState<SelectedTable[]>(initialTables);

  // 执行状态
  const [isExecuting, setIsExecuting] = useState(false);

  // 最后的错误
  const [lastError, setLastError] = useState<FederatedQueryError | null>(null);

  // 计算 attach_databases
  const attachDatabases = useMemo(() => {
    return extractAttachDatabases(selectedTables);
  }, [selectedTables]);

  // 计算状态
  const state = useMemo((): FederatedQueryState => {
    const hasExternalTables = selectedTables.some((table) => {
      const normalized = normalizeSelectedTable(table);
      return normalized.source === 'external';
    });

    const hasDuckDBTables = selectedTables.some((table) => {
      const normalized = normalizeSelectedTable(table);
      return normalized.source === 'duckdb';
    });

    return {
      attachDatabases,
      hasExternalTables,
      hasMixedSources: hasExternalTables && hasDuckDBTables,
      selectedTables,
    };
  }, [selectedTables, attachDatabases]);

  // 添加表
  const addTable = useCallback((table: SelectedTable) => {
    setSelectedTables((prev) => {
      const tableName = getTableName(table);
      // 检查是否已存在
      const exists = prev.some((t) => getTableName(t) === tableName);
      if (exists) {
        return prev;
      }
      return [...prev, table];
    });
  }, []);

  // 移除表
  const removeTable = useCallback((table: SelectedTable) => {
    const tableName = getTableName(table);
    setSelectedTables((prev) => prev.filter((t) => getTableName(t) !== tableName));
  }, []);

  // 清空所有表
  const clearTables = useCallback(() => {
    setSelectedTables([]);
    setLastError(null);
  }, []);

  // 设置表列表
  const setTables = useCallback((tables: SelectedTable[]) => {
    setSelectedTables(tables);
  }, []);

  // 获取 attach_databases 参数
  const getAttachDatabases = useCallback(() => {
    return attachDatabases;
  }, [attachDatabases]);

  // 生成 SELECT SQL
  const generateSelectSQL = useCallback(
    (options: {
      columns?: Array<{ table: string; column: string }>;
      dialect?: SqlDialect;
      maxQueryRows?: number;
    }): string => {
      const { columns, dialect = 'duckdb', maxQueryRows = 10000 } = options;

      if (selectedTables.length === 0) {
        return '';
      }

      const parts: string[] = [];

      // SELECT 子句
      if (columns && columns.length > 0) {
        const columnRefs = columns.map((col) => {
          const table = selectedTables.find((t) => getTableName(t) === col.table);
          if (table) {
            const ref = createTableReference(table, attachDatabases);
            const tableAlias = ref.isExternal && ref.alias ? ref.alias : ref.name;
            return `"${tableAlias}"."${col.column}"`;
          }
          return `"${col.table}"."${col.column}"`;
        });
        parts.push(`SELECT ${columnRefs.join(', ')}`);
      } else {
        parts.push('SELECT *');
      }

      // FROM 子句（第一个表）
      const firstTable = selectedTables[0];
      const firstRef = createTableReference(firstTable, attachDatabases);
      parts.push(`FROM ${formatTableReference(firstRef, dialect)}`);

      // JOIN 子句（其他表）
      for (let i = 1; i < selectedTables.length; i++) {
        const table = selectedTables[i];
        const ref = createTableReference(table, attachDatabases);
        parts.push(`CROSS JOIN ${formatTableReference(ref, dialect)}`);
      }

      parts.push(`LIMIT ${maxQueryRows}`);

      return parts.join('\n');
    },
    [selectedTables, attachDatabases]
  );

  // 执行查询
  const executeQuery = useCallback(
    async (sql: string, options?: { isPreview?: boolean }): Promise<QueryResult> => {
      const { isPreview = true } = options || {};

      setIsExecuting(true);
      setLastError(null);

      try {
        const result = (await executeFederatedQuery({
          sql,
          attachDatabases: attachDatabases.length > 0 ? attachDatabases : undefined,
          isPreview,
        })) as {
          data?: unknown[];
          rows?: unknown[];
          columns?: Array<{ name: string; type: string }>;
          row_count?: number;
          rowCount?: number;
        };

        return {
          success: true,
          data: result.data || result.rows || [],
          columns: result.columns || [],
          rowCount: result.row_count || result.rowCount,
        };
      } catch (error) {
        const parsedError = parseFederatedQueryError(error as Error);
        const federatedError: FederatedQueryError = {
          type: parsedError.type as FederatedQueryError['type'],
          message: parsedError.message,
          connectionId: parsedError.connectionId,
          connectionName: parsedError.connectionName,
          host: parsedError.host,
        };

        setLastError(federatedError);

        return {
          success: false,
          error: federatedError,
        };
      } finally {
        setIsExecuting(false);
      }
    },
    [attachDatabases]
  );

  return {
    state,
    addTable,
    removeTable,
    clearTables,
    setTables,
    getAttachDatabases,
    generateSelectSQL,
    executeQuery,
    isExecuting,
    lastError,
  };
}

export default useFederatedQuery;
