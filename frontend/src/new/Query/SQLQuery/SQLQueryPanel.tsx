/**
 * SQL 查询面板组件
 * 整合 SQL 编辑器、工具栏和历史记录
 * 支持 DuckDB 表和外部数据库表
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { SQLEditor } from './SQLEditor';
import { SQLToolbar } from './SQLToolbar';
import { SQLHistory } from './SQLHistory';
import { useSQLEditor } from './hooks/useSQLEditor';
import { useDuckDBTables } from '@/new/hooks/useDuckDBTables';
import { useSchemaTables } from '@/new/hooks/useSchemaTables';
import { useAppConfig } from '@/new/hooks/useAppConfig';
import { getDuckDBTableDetail } from '@/services/apiClient';
import { Alert, AlertDescription } from '@/new/components/ui/alert';
import { cn } from '@/lib/utils';
import type { TableSource } from '@/new/hooks/useQueryWorkspace';
import type { SelectedTable } from '@/new/types/SelectedTable';
import { normalizeSelectedTable, getTableName } from '@/new/utils/tableUtils';
import { getDialectFromSource, quoteQualifiedTable } from '@/new/utils/sqlUtils';

export interface SQLQueryPanelProps {
  /** 初始 SQL */
  initialSQL?: string;
  /** 选中的表名（用于自动生成 SQL）- 旧接口，保留兼容 */
  selectedTable?: string | null;
  /** 选中的表（支持 SelectedTable[] 或 string[]） */
  selectedTables?: SelectedTable[];
  /** 执行回调（统一执行入口） */
  onExecute?: (sql: string, source?: TableSource) => Promise<void>;
  /** 执行成功回调（旧接口，保留兼容） */
  onExecuteSuccess?: (data: any, sql: string) => void;
  /** 执行失败回调 */
  onExecuteError?: (error: Error, sql: string) => void;
  /** 自定义类名 */
  className?: string;
  /** 编辑器最小高度 */
  editorMinHeight?: string;
  /** 编辑器最大高度 */
  editorMaxHeight?: string;
  /** 预览 SQL（来自异步任务等，仅预填不自动执行） */
  previewSQL?: string;
}

/**
 * SQL 查询面板组件
 */
export const SQLQueryPanel: React.FC<SQLQueryPanelProps> = ({
  initialSQL = '',
  selectedTable,
  selectedTables = [],
  onExecute,
  onExecuteSuccess,
  onExecuteError,
  className,
  editorMinHeight = '200px',
  editorMaxHeight = '400px',
  previewSQL,
}) => {
  const { t } = useTranslation('common');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lastSelectedTableKey, setLastSelectedTableKey] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // 获取 DuckDB 表列表用于自动补全
  const { tables: duckdbTables } = useDuckDBTables();

  // 获取应用配置（包含 max_query_rows）
  const { maxQueryRows } = useAppConfig();

  // 规范化选中的表并分析来源（提前计算，供后续使用）
  const tableSourceInfo = useMemo(() => {
    const normalizedTables = selectedTables.map(t => normalizeSelectedTable(t));
    const externalTables = normalizedTables.filter(t => t.source === 'external');
    const duckdbSelectedTables = normalizedTables.filter(t => t.source !== 'external');
    const hasMixedSources = externalTables.length > 0 && duckdbSelectedTables.length > 0;
    
    const connectionIds = new Set(
      externalTables.map(t => t.connection?.id).filter(Boolean)
    );
    const isSameConnection = connectionIds.size <= 1;
    
    let currentSource: TableSource | undefined;
    if (externalTables.length > 0) {
      const ext = externalTables[0];
      currentSource = {
        type: 'external',
        connectionId: ext.connection?.id,
        connectionName: ext.connection?.name,
        databaseType: ext.connection?.type,
        schema: ext.schema,
      };
    }
    
    return {
      normalizedTables,
      externalTables,
      duckdbTables: duckdbSelectedTables,
      hasMixedSources,
      isSameConnection,
      currentSource,
      isExternal: externalTables.length > 0 && duckdbSelectedTables.length === 0,
    };
  }, [selectedTables]);

  // 获取外部数据库连接的所有表（用于自动补全）
  const externalConnectionId = tableSourceInfo.isExternal 
    ? tableSourceInfo.currentSource?.connectionId 
    : undefined;
  const externalSchema = tableSourceInfo.isExternal 
    ? tableSourceInfo.currentSource?.schema || '' 
    : '';
  
  const { tables: externalSchemaTables } = useSchemaTables(
    externalConnectionId || '',
    externalSchema,
    tableSourceInfo.isExternal && !!externalConnectionId
  );

  // 根据数据源类型决定自动补全的表名列表
  // DuckDB 模式：提示所有 DuckDB 表
  // 外部数据库模式：提示该连接下的所有表
  const autocompleteTables = useMemo(() => {
    if (tableSourceInfo.isExternal) {
      // 外部数据源：提示该连接下的所有表
      if (externalSchemaTables.length > 0) {
        return externalSchemaTables.map(t => t.name);
      }
      // 如果还没加载完成，先显示选中的表
      return tableSourceInfo.externalTables.map(t => t.name);
    }
    // DuckDB：提示所有 DuckDB 表
    return duckdbTables.map(t => t.name);
  }, [tableSourceInfo.isExternal, tableSourceInfo.externalTables, duckdbTables, externalSchemaTables]);

  // 获取选中 DuckDB 表的列信息（用于自动补全）
  const currentDuckDBTable = useMemo(() => {
    if (!tableSourceInfo.isExternal && selectedTables.length > 0) {
      const normalized = normalizeSelectedTable(selectedTables[0]);
      if (normalized.source !== 'external') {
        return normalized.name;
      }
    }
    return null;
  }, [tableSourceInfo.isExternal, selectedTables]);

  // 获取 DuckDB 表的列信息
  const { data: duckdbTableDetail } = useQuery({
    queryKey: ['table-columns', currentDuckDBTable, 'duckdb'],
    queryFn: () => getDuckDBTableDetail(currentDuckDBTable!),
    enabled: !!currentDuckDBTable,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // 构建列信息映射（表名 -> 列名列表）
  const autocompleteColumns = useMemo(() => {
    const result: Record<string, string[]> = {};
    
    if (duckdbTableDetail?.table?.columns) {
      const tableName = currentDuckDBTable;
      if (tableName) {
        result[tableName] = duckdbTableDetail.table.columns.map(
          (col: { column_name?: string; name?: string }) => col.column_name || col.name || ''
        ).filter(Boolean);
      }
    }
    
    return result;
  }, [duckdbTableDetail, currentDuckDBTable]);

  // SQL 编辑器状态
  const {
    sql,
    setSQL,
    execute,
    isExecuting: internalExecuting,
    result,
    error,
    executionTime,
    history,
    addToHistory,
    loadFromHistory,
    removeFromHistory,
    clearHistory,
    formatSQL,
  } = useSQLEditor({
    initialSQL,
    onSuccess: onExecuteSuccess,
    onError: onExecuteError,
  });

  // 计算当前选中的表
  const currentTable = useMemo(() => {
    if (selectedTables.length > 0) {
      return getTableName(selectedTables[0]);
    }
    return selectedTable;
  }, [selectedTables, selectedTable]);

  const currentTableKey = useMemo(() => {
    if (selectedTables.length === 0) return selectedTable;
    const normalized = normalizeSelectedTable(selectedTables[0]);
    if (normalized.source === 'external') {
      return `${normalized.connection?.id ?? 'external'}:${normalized.schema ?? ''}:${normalized.name}`;
    }
    return normalized.name;
  }, [selectedTables, selectedTable]);

  // 当选中表变化时，自动生成 SQL（包含默认 LIMIT）
  React.useEffect(() => {
    if (currentTable && currentTableKey && currentTableKey !== lastSelectedTableKey) {
      const dialect = getDialectFromSource(tableSourceInfo.currentSource);
      const defaultSQL = `SELECT * FROM ${quoteQualifiedTable(
        { name: currentTable, schema: tableSourceInfo.currentSource?.schema },
        dialect
      )} LIMIT ${maxQueryRows}`;
      setSQL(defaultSQL);
      setLastSelectedTableKey(currentTableKey);
    }
  }, [currentTable, currentTableKey, lastSelectedTableKey, setSQL, tableSourceInfo.currentSource, maxQueryRows]);

  // 处理预览 SQL（仅预填不自动执行）
  useEffect(() => {
    if (previewSQL && previewSQL !== sql) {
      setSQL(previewSQL);
    }
  }, [previewSQL, setSQL]);

  // 智能 LIMIT 处理（参考老 UI 的 applyDisplayLimit 逻辑）
  // - 用户无 LIMIT：添加配置的 max_query_rows
  // - 用户 LIMIT ≤ max_query_rows：保留用户设置
  // - 用户 LIMIT > max_query_rows：前端显示限制为 max_query_rows
  const applyDisplayLimit = useCallback((sqlStr: string): { displaySql: string; originalSql: string } => {
    const sqlTrimmed = sqlStr.trim().replace(/;$/, '');
    
    // 只对 SELECT 语句处理
    if (!/^\s*SELECT\b/i.test(sqlTrimmed)) {
      return { displaySql: sqlTrimmed, originalSql: sqlTrimmed };
    }

    // 检查是否已有 LIMIT
    const limitMatch = sqlTrimmed.match(/\bLIMIT\s+(\d+)(\s+OFFSET\s+\d+)?\s*$/i);

    if (limitMatch) {
      const userLimit = parseInt(limitMatch[1], 10);
      if (userLimit > maxQueryRows) {
        // 用户 LIMIT > maxQueryRows，前端显示限制为 maxQueryRows
        const displaySql = sqlTrimmed.replace(
          /\bLIMIT\s+\d+(\s+OFFSET\s+\d+)?\s*$/i,
          `LIMIT ${maxQueryRows}`
        );
        return { displaySql, originalSql: sqlTrimmed };
      } else {
        // 用户 LIMIT ≤ maxQueryRows，保留用户设置
        return { displaySql: sqlTrimmed, originalSql: sqlTrimmed };
      }
    } else {
      // 用户无 LIMIT，添加默认 LIMIT
      return {
        displaySql: `${sqlTrimmed} LIMIT ${maxQueryRows}`,
        originalSql: sqlTrimmed,
      };
    }
  }, [maxQueryRows]);

  // 执行 SQL - 优先使用统一的 onExecute，支持外部数据源
  const handleExecute = useCallback(async () => {
    if (!sql.trim()) return;
    
    // 检查是否混合了不同数据源
    if (tableSourceInfo.hasMixedSources) {
      onExecuteError?.(
        new Error('不能在同一查询中混合 DuckDB 表和外部数据库表，请先将外部表导入到 DuckDB'),
        sql
      );
      return;
    }
    
    if (onExecute) {
      // 使用统一的执行入口，传递数据源信息
      setIsExecuting(true);
      // 智能处理 LIMIT：前端显示限制，保留用户原始 SQL
      const { displaySql } = applyDisplayLimit(sql.trim());
      const startTime = Date.now();
      try {
        await onExecute(displaySql, tableSourceInfo.currentSource);
        addToHistory({
          sql: displaySql,
          executionTime: Date.now() - startTime,
        });
      } catch (err) {
        console.error('SQL execution failed:', err);
        addToHistory({
          sql: displaySql,
          error: (err as Error)?.message || String(err),
        });
        onExecuteError?.(err as Error, displaySql);
      } finally {
        setIsExecuting(false);
      }
    } else {
      // 回退到内部执行（仅支持 DuckDB）
      execute({ isPreview: true });
    }
  }, [sql, onExecute, execute, onExecuteError, tableSourceInfo, applyDisplayLimit]);

  // 合并执行状态
  const executing = isExecuting || internalExecuting;

  // 从历史加载并执行
  const handleExecuteFromHistory = useCallback(async (sqlFromHistory: string) => {
    setSQL(sqlFromHistory);
    setHistoryOpen(false);
    // 延迟执行，等待 SQL 更新
    setTimeout(async () => {
      if (onExecute) {
        setIsExecuting(true);
        // 智能处理 LIMIT
        const { displaySql } = applyDisplayLimit(sqlFromHistory.trim());
        const startTime = Date.now();
        try {
          await onExecute(displaySql, tableSourceInfo.currentSource);
          addToHistory({
            sql: displaySql,
            executionTime: Date.now() - startTime,
          });
        } catch (err) {
          console.error('SQL execution failed:', err);
          addToHistory({
            sql: displaySql,
            error: (err as Error)?.message || String(err),
          });
          onExecuteError?.(err as Error, displaySql);
        } finally {
          setIsExecuting(false);
        }
      } else {
        execute({ isPreview: true });
      }
    }, 100);
  }, [setSQL, execute, onExecute, onExecuteError, tableSourceInfo.currentSource, applyDisplayLimit]);

  // 从历史加载
  const handleLoadFromHistory = useCallback((id: string) => {
    loadFromHistory(id);
    setHistoryOpen(false);
  }, [loadFromHistory]);

  // 获取数据源显示信息
  const sourceLabel = useMemo(() => {
    if (tableSourceInfo.isExternal && tableSourceInfo.currentSource) {
      const dbType = tableSourceInfo.currentSource.databaseType?.toUpperCase() || 'External';
      const connName = tableSourceInfo.currentSource.connectionName || '';
      return `${dbType}: ${connName}`;
    }
    return 'DuckDB';
  }, [tableSourceInfo]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* 混合数据源警告 */}
      {tableSourceInfo.hasMixedSources && (
        <Alert variant="destructive" className="mx-3 mt-3">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t('query.sql.mixedSourceWarning', '不能在同一查询中混合 DuckDB 表和外部数据库表。请先将外部表导入到 DuckDB。')}
          </AlertDescription>
        </Alert>
      )}

      {/* 工具栏 */}
      <SQLToolbar
        onExecute={handleExecute}
        onFormat={formatSQL}
        onHistory={() => setHistoryOpen(true)}
        isExecuting={executing}
        disableExecute={!sql.trim() || tableSourceInfo.hasMixedSources}
        executionTime={executionTime}
      />

      {/* 数据源指示器 */}
      {tableSourceInfo.currentSource && (
        <div className="px-3 py-1 text-xs text-muted-foreground border-b border-border flex items-center gap-2">
          <span className="font-medium">{t('query.sql.targetDatabase', '目标数据库')}:</span>
          <span className={cn(
            'px-2 py-0.5 rounded text-xs font-medium',
            tableSourceInfo.isExternal 
              ? 'bg-warning/10 text-warning' 
              : 'bg-primary/10 text-primary'
          )}>
            {sourceLabel}
          </span>
        </div>
      )}

      {/* 编辑器 */}
      <div className="flex-1 min-h-0 p-3">
        <SQLEditor
          value={sql}
          onChange={setSQL}
          onExecute={handleExecute}
          placeholder={t('query.sql.placeholder', '输入 SQL 查询语句...')}
          minHeight={editorMinHeight}
          maxHeight={editorMaxHeight}
          tables={autocompleteTables}
          columns={autocompleteColumns}
          autoFocus
        />
      </div>

      {/* 历史记录抽屉 */}
      <SQLHistory
        history={history}
        onLoad={handleLoadFromHistory}
        onDelete={removeFromHistory}
        onClear={clearHistory}
        onExecute={handleExecuteFromHistory}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
};

export default SQLQueryPanel;
