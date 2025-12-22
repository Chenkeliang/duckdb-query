/**
 * SQL 查询面板组件
 * 整合 SQL 编辑器、工具栏和历史记录
 * 支持 DuckDB 表和外部数据库表
 * 支持联邦查询（自动检测 SQL 中的外部表引用）
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { SQLEditor } from './SQLEditor';
import { SQLToolbar } from './SQLToolbar';
import { SQLHistory } from './SQLHistory';
import { useSQLEditor } from './hooks/useSQLEditor';
import { useDuckDBTables } from '@/new/hooks/useDuckDBTables';
import { useSchemaTables } from '@/new/hooks/useSchemaTables';
import { useAppConfig } from '@/new/hooks/useAppConfig';
import { useTableColumns } from '@/new/hooks/useTableColumns';
import { useFederatedQueryDetection } from '@/new/hooks/useFederatedQueryDetection';
import { useEnhancedAutocomplete } from '@/new/hooks/useEnhancedAutocomplete';
import { Alert, AlertDescription } from '@/new/components/ui/alert';
import { AttachedDatabasesIndicator } from '@/new/Query/components/AttachedDatabasesIndicator';
import { UnrecognizedPrefixWarning } from '@/new/Query/components/UnrecognizedPrefixWarning';
import { FederatedQueryStatusBar } from '@/new/Query/components/FederatedQueryStatusBar';
import { AsyncTaskDialog } from '@/new/Query/AsyncTasks/AsyncTaskDialog';
import { cn } from '@/lib/utils';
import type { TableSource } from '@/new/hooks/useQueryWorkspace';
import type { SelectedTable } from '@/new/types/SelectedTable';
import { normalizeSelectedTable } from '@/new/utils/tableUtils';
import { generateExternalTableReference } from '@/new/utils/sqlUtils';

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
  const [dismissedWarning, setDismissedWarning] = useState(false);
  const [asyncDialogOpen, setAsyncDialogOpen] = useState(false);

  // 获取 DuckDB 表列表用于自动补全
  const { tables: duckdbTables } = useDuckDBTables();

  // 增强的自动补全 - 合并 DuckDB 表和外部数据库表
  const { tableNames: enhancedTableNames } = useEnhancedAutocomplete();

  // 获取应用配置（包含 max_query_rows）
  const { maxQueryRows } = useAppConfig();

  // SQL 编辑器状态（提前声明，供联邦查询检测使用）
  const {
    sql,
    setSQL,
    execute,
    isExecuting: internalExecuting,
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

  // 联邦查询检测 - 自动分析 SQL 中的外部表引用
  const {
    attachDatabases,
    unrecognizedPrefixes,
    requiresFederatedQuery,
    tableSource: detectedTableSource,
    addManualDatabase,
    removeManualDatabase,
    availableConnections,
  } = useFederatedQueryDetection({
    sql,
    selectedTables,
    debounceMs: 300,
    enabled: true,
  });

  // 规范化选中的表并分析来源（提前计算，供后续使用）
  const tableSourceInfo = useMemo(() => {
    const normalizedTables = selectedTables.map(t => normalizeSelectedTable(t));
    const externalTables = normalizedTables.filter(t => t.source === 'external');
    const duckdbSelectedTables = normalizedTables.filter(t => t.source !== 'external');
    
    // 使用联邦查询检测的结果来判断是否混合数据源
    // 如果检测到需要联邦查询，则不再视为"混合数据源错误"
    const hasMixedSources = !requiresFederatedQuery && 
      externalTables.length > 0 && duckdbSelectedTables.length > 0;
    
    const connectionIds = new Set(
      externalTables.map(t => t.connection?.id).filter(Boolean)
    );
    const isSameConnection = connectionIds.size <= 1;
    
    // 优先使用检测到的 tableSource
    let currentSource: TableSource | undefined = detectedTableSource;
    if (!currentSource || currentSource.type === 'duckdb') {
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
  }, [selectedTables, requiresFederatedQuery, detectedTableSource]);

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
  // 使用增强的自动补全，支持 DuckDB 表和外部数据库表
  // 外部表会显示完整限定名（如 mysql_prod.users）
  const autocompleteTables = useMemo(() => {
    // 如果是联邦查询模式，使用增强的表名列表（包含外部表的完整限定名）
    if (requiresFederatedQuery || attachDatabases.length > 0) {
      return enhancedTableNames;
    }
    
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
  }, [
    tableSourceInfo.isExternal, 
    tableSourceInfo.externalTables, 
    duckdbTables, 
    externalSchemaTables,
    requiresFederatedQuery,
    attachDatabases.length,
    enhancedTableNames,
  ]);

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

  // 获取当前选中表的列信息 - 使用统一的 useTableColumns Hook
  // 支持 DuckDB 表和外部表
  const tableForColumns = useMemo(() => {
    if (selectedTables.length === 0) return null;
    return selectedTables[0]; // 使用第一个选中的表
  }, [selectedTables]);
  
  const { columns: tableColumns } = useTableColumns(tableForColumns);

  // 构建列信息映射（表名 -> 列名列表）
  const autocompleteColumns = useMemo(() => {
    const columnMap: Record<string, string[]> = {};
    
    if (tableColumns && tableColumns.length > 0) {
      const tableName = currentDuckDBTable || (tableForColumns ? 
        (typeof tableForColumns === 'string' ? tableForColumns : tableForColumns.name) : null);
      if (tableName) {
        columnMap[tableName] = tableColumns.map((col) => col.name).filter(Boolean);
      }
    }
    
    return columnMap;
  }, [tableColumns, currentDuckDBTable, tableForColumns]);

  // 计算当前选中表的唯一标识（用于检测表变化）
  const currentTableKey = useMemo(() => {
    if (selectedTables.length === 0) return selectedTable;
    const normalized = normalizeSelectedTable(selectedTables[0]);
    if (normalized.source === 'external') {
      return `${normalized.connection?.id ?? 'external'}:${normalized.schema ?? ''}:${normalized.name}`;
    }
    return normalized.name;
  }, [selectedTables, selectedTable]);

  // 当选中表变化时，自动生成 SQL（包含默认 LIMIT）
  // 统一使用 ATTACH 模式：外部表生成带别名前缀的完整限定名
  React.useEffect(() => {
    if (currentTableKey && currentTableKey !== lastSelectedTableKey && selectedTables.length > 0) {
      const { qualifiedName } = generateExternalTableReference(selectedTables[0]);
      const defaultSQL = `SELECT * FROM ${qualifiedName} LIMIT ${maxQueryRows}`;
      setSQL(defaultSQL);
      setLastSelectedTableKey(currentTableKey);
    }
  }, [currentTableKey, lastSelectedTableKey, setSQL, maxQueryRows, selectedTables]);

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

  // 计算查询类型
  const queryType = useMemo(() => {
    if (requiresFederatedQuery && attachDatabases.length > 0) {
      return 'federated' as const;
    }
    if (tableSourceInfo.isExternal) {
      return 'external' as const;
    }
    return 'duckdb' as const;
  }, [requiresFederatedQuery, attachDatabases.length, tableSourceInfo.isExternal]);

  // 执行 SQL - 优先使用统一的 onExecute，支持外部数据源和联邦查询
  const handleExecute = useCallback(async () => {
    if (!sql.trim()) return;
    
    // 检查是否有未识别的前缀且未被忽略
    if (unrecognizedPrefixes.length > 0 && !dismissedWarning) {
      // 显示警告，等待用户确认
      return;
    }
    
    // 检查是否混合了不同数据源（非联邦查询模式）
    if (tableSourceInfo.hasMixedSources && !requiresFederatedQuery) {
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
        // 构建执行时的 TableSource，包含联邦查询信息
        const executeSource: TableSource = requiresFederatedQuery
          ? {
              type: 'federated',
              connectionId: attachDatabases[0]?.connectionId,
              connectionName: attachDatabases[0]?.alias,
              attachDatabases: attachDatabases,
            }
          : tableSourceInfo.currentSource;
        
        await onExecute(displaySql, executeSource);
        addToHistory({
          sql: displaySql,
          executionTime: Date.now() - startTime,
        });
        // 重置警告状态
        setDismissedWarning(false);
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
  }, [sql, onExecute, execute, onExecuteError, tableSourceInfo, applyDisplayLimit, 
      requiresFederatedQuery, attachDatabases, unrecognizedPrefixes, dismissedWarning]);

  // 处理忽略未识别前缀并执行
  const handleIgnoreAndExecute = useCallback(() => {
    setDismissedWarning(true);
    // 延迟执行，等待状态更新
    setTimeout(() => {
      handleExecute();
    }, 0);
  }, [handleExecute]);

  // 合并执行状态
  const executing = isExecuting || internalExecuting;

  // 处理异步执行按钮点击
  const handleAsyncExecute = useCallback(() => {
    if (!sql.trim()) return;
    setAsyncDialogOpen(true);
  }, [sql]);

  // 异步任务提交成功回调
  const handleAsyncTaskSuccess = useCallback((taskId: string) => {
    console.log('Async task submitted:', taskId);
    // 可以在这里添加额外的处理，比如切换到异步任务面板
  }, []);

  // 键盘快捷键：Ctrl+Shift+Enter 异步执行
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        handleAsyncExecute();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleAsyncExecute]);

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

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* 未识别前缀警告 */}
      {unrecognizedPrefixes.length > 0 && !dismissedWarning && (
        <div className="mx-3 mt-3">
          <UnrecognizedPrefixWarning
            prefixes={unrecognizedPrefixes}
            onConfigureConnection={(prefix) => {
              // TODO: 打开连接配置对话框
              console.log('Configure connection for prefix:', prefix);
            }}
            onIgnore={handleIgnoreAndExecute}
            onDismiss={() => setDismissedWarning(true)}
          />
        </div>
      )}

      {/* 混合数据源警告（非联邦查询模式） */}
      {tableSourceInfo.hasMixedSources && !requiresFederatedQuery && (
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
        onAsyncExecute={handleAsyncExecute}
        onFormat={formatSQL}
        onHistory={() => setHistoryOpen(true)}
        isExecuting={executing}
        disableExecute={!sql.trim() || (tableSourceInfo.hasMixedSources && !requiresFederatedQuery)}
        executionTime={executionTime}
      />

      {/* 联邦查询状态栏 */}
      <div className="px-3 py-1.5 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* 查询类型和状态 */}
          <FederatedQueryStatusBar
            queryType={queryType}
            attachDatabases={attachDatabases}
            isExecuting={executing}
            executionTime={executionTime}
          />
        </div>

        {/* 附加数据库管理 */}
        <AttachedDatabasesIndicator
          attachDatabases={attachDatabases}
          variant="expandable"
          editable={true}
          availableConnections={availableConnections}
          onAddDatabase={addManualDatabase}
          onRemoveDatabase={removeManualDatabase}
        />
      </div>

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

      {/* 异步任务对话框 */}
      <AsyncTaskDialog
        open={asyncDialogOpen}
        onOpenChange={setAsyncDialogOpen}
        sql={sql}
        datasource={tableSourceInfo.isExternal && tableSourceInfo.currentSource ? {
          id: tableSourceInfo.currentSource.connectionId || '',
          type: tableSourceInfo.currentSource.databaseType || '',
          name: tableSourceInfo.currentSource.connectionName,
        } : undefined}
        onSuccess={handleAsyncTaskSuccess}
      />
    </div>
  );
};

export default SQLQueryPanel;
