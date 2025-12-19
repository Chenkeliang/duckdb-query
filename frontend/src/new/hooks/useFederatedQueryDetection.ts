/**
 * 联邦查询检测 Hook
 *
 * 自动检测 SQL 中的外部表引用，结合选中的表列表，
 * 构建需要 ATTACH 的数据库列表。
 *
 * @example
 * ```tsx
 * const {
 *   attachDatabases,
 *   unrecognizedPrefixes,
 *   requiresFederatedQuery,
 *   addManualDatabase,
 *   removeManualDatabase,
 * } = useFederatedQueryDetection({
 *   sql: 'SELECT * FROM mysql_orders.users',
 *   selectedTables: [],
 * });
 * ```
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { SelectedTable } from '@/new/types/SelectedTable';
import type { TableSource } from '@/new/hooks/useQueryWorkspace';
import {
  parseSQLTableReferences,
  buildAttachDatabasesFromParsedRefs,
  extractAttachDatabases,
  mergeAttachDatabases,
  type AttachDatabase,
  type ParsedTableReference,
  type DatabaseConnection,
} from '@/new/utils/sqlUtils';
import { useDatabaseConnections } from './useDatabaseConnections';
import { normalizeSelectedTable } from '@/new/utils/tableUtils';

/**
 * Hook 配置选项
 */
export interface UseFederatedQueryDetectionOptions {
  /** SQL 查询字符串 */
  sql: string;
  /** 选中的表列表 */
  selectedTables: SelectedTable[];
  /** 防抖延迟（毫秒），默认 300ms */
  debounceMs?: number;
  /** 是否启用自动检测，默认 true */
  enabled?: boolean;
}

/**
 * 检测结果
 */
export interface FederatedQueryDetectionResult {
  /** 需要 ATTACH 的数据库列表 */
  attachDatabases: AttachDatabase[];
  /** 未识别的前缀列表 */
  unrecognizedPrefixes: string[];
  /** 是否需要联邦查询 */
  requiresFederatedQuery: boolean;
  /** 解析出的表引用 */
  parsedTableReferences: ParsedTableReference[];
  /** 数据源类型 */
  tableSource: TableSource;
  /** 是否正在解析 */
  isParsing: boolean;
}

/**
 * Hook 返回值
 */
export interface UseFederatedQueryDetectionReturn extends FederatedQueryDetectionResult {
  /** 手动添加数据库 */
  addManualDatabase: (database: AttachDatabase) => void;
  /** 手动移除数据库 */
  removeManualDatabase: (connectionId: string) => void;
  /** 清空手动添加的数据库 */
  clearManualDatabases: () => void;
  /** 手动添加的数据库列表 */
  manualDatabases: AttachDatabase[];
  /** 数据库连接列表（用于 UI 选择） */
  availableConnections: DatabaseConnection[];
  /** 连接列表是否正在加载 */
  isLoadingConnections: boolean;
  /** 强制重新解析 SQL */
  reparse: () => void;
}

/**
 * 联邦查询检测 Hook
 *
 * 自动检测 SQL 中的外部表引用，结合选中的表列表，
 * 构建需要 ATTACH 的数据库列表。
 */
export function useFederatedQueryDetection(
  options: UseFederatedQueryDetectionOptions
): UseFederatedQueryDetectionReturn {
  const { sql, selectedTables, debounceMs = 300, enabled = true } = options;

  // 获取数据库连接列表
  const { connections, isLoading: isLoadingConnections } = useDatabaseConnections();

  // 手动添加的数据库
  const [manualDatabases, setManualDatabases] = useState<AttachDatabase[]>([]);

  // 解析状态
  const [isParsing, setIsParsing] = useState(false);

  // 防抖后的 SQL
  const [debouncedSql, setDebouncedSql] = useState(sql);

  // 防抖定时器
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 解析版本号（用于强制重新解析）
  const [parseVersion, setParseVersion] = useState(0);

  // 防抖处理 SQL 变化
  useEffect(() => {
    if (!enabled) return;

    setIsParsing(true);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSql(sql);
      setIsParsing(false);
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [sql, debounceMs, enabled]);

  // 解析 SQL 中的表引用
  const parsedTableReferences = useMemo(() => {
    if (!enabled || !debouncedSql.trim()) {
      return [];
    }
    // parseVersion 用于强制重新解析
    void parseVersion;
    return parseSQLTableReferences(debouncedSql);
  }, [debouncedSql, enabled, parseVersion]);

  // 从 SQL 解析结果构建 attachDatabases
  const sqlAttachResult = useMemo(() => {
    if (!enabled || parsedTableReferences.length === 0) {
      return { attachDatabases: [], unrecognizedPrefixes: [] };
    }
    return buildAttachDatabasesFromParsedRefs(
      parsedTableReferences,
      connections as DatabaseConnection[]
    );
  }, [parsedTableReferences, connections, enabled]);

  // 从选中的表提取 attachDatabases
  const selectedTablesAttach = useMemo(() => {
    return extractAttachDatabases(selectedTables);
  }, [selectedTables]);

  // 合并所有来源的 attachDatabases
  const mergedResult = useMemo(() => {
    return mergeAttachDatabases(
      selectedTablesAttach,
      sqlAttachResult.attachDatabases,
      manualDatabases
    );
  }, [selectedTablesAttach, sqlAttachResult.attachDatabases, manualDatabases]);

  // 计算 TableSource
  const tableSource = useMemo((): TableSource => {
    // 检查是否有外部表
    const hasExternalFromSelected = selectedTables.some((table) => {
      const normalized = normalizeSelectedTable(table);
      return normalized.source === 'external';
    });

    const hasExternalFromSQL = sqlAttachResult.attachDatabases.length > 0;
    const hasManual = manualDatabases.length > 0;

    if (hasExternalFromSelected || hasExternalFromSQL || hasManual) {
      // 获取第一个外部连接的信息
      const firstAttach = mergedResult.attachDatabases[0];
      if (firstAttach) {
        const connection = connections.find((c) => c.id === firstAttach.connectionId);
        if (connection) {
          return {
            type: 'external',
            connectionId: connection.id,
            connectionName: connection.name,
            databaseType: connection.type,
          };
        }
      }
      return { type: 'external' };
    }

    return { type: 'duckdb' };
  }, [selectedTables, sqlAttachResult.attachDatabases, manualDatabases, mergedResult.attachDatabases, connections]);

  // 手动添加数据库
  const addManualDatabase = useCallback((database: AttachDatabase) => {
    setManualDatabases((prev) => {
      // 检查是否已存在
      if (prev.some((db) => db.connectionId === database.connectionId)) {
        return prev;
      }
      return [...prev, database];
    });
  }, []);

  // 手动移除数据库
  const removeManualDatabase = useCallback((connectionId: string) => {
    setManualDatabases((prev) => prev.filter((db) => db.connectionId !== connectionId));
  }, []);

  // 清空手动添加的数据库
  const clearManualDatabases = useCallback(() => {
    setManualDatabases([]);
  }, []);

  // 强制重新解析
  const reparse = useCallback(() => {
    setParseVersion((v) => v + 1);
  }, []);

  return {
    // 检测结果
    attachDatabases: mergedResult.attachDatabases,
    unrecognizedPrefixes: [
      ...sqlAttachResult.unrecognizedPrefixes,
      ...mergedResult.unrecognizedPrefixes,
    ],
    requiresFederatedQuery: mergedResult.requiresFederatedQuery,
    parsedTableReferences,
    tableSource,
    isParsing,

    // 手动管理
    addManualDatabase,
    removeManualDatabase,
    clearManualDatabases,
    manualDatabases,

    // 连接信息
    availableConnections: connections as DatabaseConnection[],
    isLoadingConnections,

    // 工具方法
    reparse,
  };
}

export default useFederatedQueryDetection;
