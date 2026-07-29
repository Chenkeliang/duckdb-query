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
import { useSQLEditor } from './hooks/useSQLEditor';
import { useDuckDBTables } from '@/hooks/useDuckDBTables';
import { useSchemaTables } from '@/hooks/useSchemaTables';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useSqlColumnAutocomplete } from '@/hooks/useSqlColumnAutocomplete';
import { useFederatedQueryDetection } from '@/hooks/useFederatedQueryDetection';
import { useEnhancedAutocomplete } from '@/hooks/useEnhancedAutocomplete';
import { useGlobalHistory } from '@/Query/hooks/useGlobalHistory';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UnrecognizedPrefixWarning } from '@/Query/components/UnrecognizedPrefixWarning';
import { AsyncTaskDialog } from '@/Query/AsyncTasks/AsyncTaskDialog';
import { SaveQueryDialog } from '@/Query/Bookmarks/SaveQueryDialog';
import { cn } from '@/lib/utils';
import type { TableSource } from '@/hooks/useQueryWorkspace';
import type { SelectedTable } from '@/types/SelectedTable';
import { getTableName, normalizeSelectedTable } from '@/utils/tableUtils';
import {
  generateExternalTableReference,
  getSourceFromSelectedTable,
  parseSQLTableReferences,
} from '@/utils/sqlUtils';
import { tokenizeSQL } from '@/utils/sqlTokenizer';
import { formatSQLDataGrip } from '@/utils/sqlFormatter';
import { useAiStatus } from '@/hooks/useAiStatus';
import { ChatToggleButton } from './ai/AiChatDrawer';
import { agentChatBus, useAgentChatBus } from './ai/agentChatBus';

export interface SQLQueryPanelProps {
  /** 初始 SQL */
  initialSQL?: string;
  /** 选中的表名（用于自动生成 SQL）- 旧接口，保留兼容 */
  selectedTable?: string | null;
  /** 选中的表（支持 SelectedTable[] 或 string[]） */
  selectedTables?: SelectedTable[];
  /** 执行回调（统一执行入口） */
  onExecute?: (
    sql: string,
    source?: TableSource,
    options?: { baseSql?: string }
  ) => Promise<void>;
  /** 执行成功回调（旧接口，保留兼容） */
  onExecuteSuccess?: (data: any, sql: string) => void;
  /** 执行失败回调 */
  onExecuteError?: (error: Error, sql: string) => void;
  /** 取消当前同步查询 */
  onCancel?: () => void;
  /** 是否正在向后端提交取消 */
  isCancelling?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 编辑器最小高度 */
  editorMinHeight?: string;
  /** 编辑器最大高度 */
  editorMaxHeight?: string;
  /** 预览 SQL（来自异步任务等，仅预填不自动执行） */
  previewSQL?: string;
  /** 预填序号：同一串 SQL 重复加载（如重复下钻同一桶）时靠它强制触发回填 */
  previewNonce?: number;
  /** 打开设置·AI 标签页(未配置引导用) */
  onOpenAiSettings?: () => void;
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
  onCancel,
  isCancelling = false,
  className,
  editorMinHeight = '200px',
  editorMaxHeight = '400px',
  previewSQL,
  previewNonce,
  onOpenAiSettings,
}) => {
  const { t } = useTranslation('common');
  // const [historyOpen, setHistoryOpen] = useState(false); // Removed
  const [lastSelectedTableKey, setLastSelectedTableKey] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [dismissedWarning, setDismissedWarning] = useState(false);
  const [asyncDialogOpen, setAsyncDialogOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [systemLimitedSql, setSystemLimitedSql] = useState<{
    displaySql: string;
    baseSql: string;
  } | null>(null);

  // Global History
  const { addToHistory } = useGlobalHistory();

  // 获取 DuckDB 表列表用于自动补全
  const { tables: duckdbTables } = useDuckDBTables();

  // 增强的自动补全 - 合并 DuckDB 表和外部数据库表
  const { tableNames: enhancedTableNames } = useEnhancedAutocomplete();

  // 获取应用配置（包含 max_query_rows）
  const { maxQueryRows } = useAppConfig();

  // SQL 编辑器状态
  const {
    sql,
    setSQL,
    execute,
    isExecuting: internalExecuting,
    executionTime,
    formatSQL,
  } = useSQLEditor({
    initialSQL,
    onSuccess: onExecuteSuccess,
    onError: onExecuteError,
  });

  // ===== AI:统一对话(解释/优化/问数据 收敛到对话,三态门控) =====
  const chatStatus = useAiStatus('data_qa');
  const openAiSettings = onOpenAiSettings ?? (() => {});
  const { open: chatOpen } = useAgentChatBus();

  // 联邦查询检测 - 自动分析 SQL 中的外部表引用
  const {
    attachDatabases,
    unrecognizedPrefixes,
    requiresFederatedQuery,
    tableSource: detectedTableSource,
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
        currentSource = getSourceFromSelectedTable(ext);
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

  // 按左侧选中表 + SQL 中 FROM/JOIN 解析出的表拉取列，供 CodeMirror schema 与列前缀补全
  const duckdbTableNameList = useMemo(
    () => duckdbTables.map((t) => t.name),
    [duckdbTables]
  );
  const { columnMap: autocompleteColumns, flatColumnNames } = useSqlColumnAutocomplete({
    sql,
    selectedTables,
    duckdbTableNames: duckdbTableNameList,
  });

  const completionDefaultTable = useMemo(() => {
    if (selectedTables.length > 0) {
      return getTableName(selectedTables[0]);
    }
    const refs = parseSQLTableReferences(sql);
    return refs[0]?.tableName;
  }, [sql, selectedTables]);

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
      const baseSql = `SELECT * FROM ${qualifiedName}`;
      const displaySql = `${baseSql} LIMIT ${maxQueryRows}`;
      setSystemLimitedSql({ displaySql, baseSql });
      setSQL(displaySql);
      setLastSelectedTableKey(currentTableKey);
    }
  }, [currentTableKey, lastSelectedTableKey, setSQL, maxQueryRows, selectedTables]);

  // 处理预览 SQL（仅预填不自动执行）；previewNonce 保证同串重复加载也能回填
  useEffect(() => {
    if (previewSQL) {
      setSystemLimitedSql(null);
      if (previewSQL !== sql) {
        setSQL(previewSQL);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSQL, previewNonce, setSQL]);

  // 页面预览只在最外层没有 LIMIT 时追加系统默认值；用户 LIMIT 永不改写。
  const applyDisplayLimit = useCallback((sqlStr: string): {
    displaySql: string;
    baseSql: string;
    systemLimitApplied: boolean;
  } => {
    const baseSql = sqlStr.trim();
    if (systemLimitedSql?.displaySql === baseSql) {
      return { ...systemLimitedSql, systemLimitApplied: true };
    }

    const tokens = tokenizeSQL(baseSql);
    const firstToken = tokens[0];
    const firstKeyword = firstToken?.type === 'keyword'
      ? firstToken.value.toUpperCase()
      : '';

    let depth = 0;
    let hasTopLevelLimit = false;
    let hasMultipleStatements = false;
    let withStatementType: string | undefined;
    tokens.forEach((token, index) => {
      if (token.type === 'lparen') {
        depth += 1;
      } else if (token.type === 'rparen') {
        depth = Math.max(0, depth - 1);
      } else if (depth === 0 && token.type === 'keyword') {
        const keyword = token.value.toUpperCase();
        if (
          firstKeyword === 'WITH' &&
          index > 0 &&
          !withStatementType &&
          ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].includes(keyword)
        ) {
          withStatementType = keyword;
        }
        if (keyword === 'LIMIT') {
          hasTopLevelLimit = true;
        }
      } else if (
        depth === 0 &&
        token.type === 'semicolon' &&
        index !== tokens.length - 1
      ) {
        hasMultipleStatements = true;
      }
    });

    const isSelectQuery = firstKeyword === 'SELECT' ||
      (firstKeyword === 'WITH' && withStatementType === 'SELECT');
    if (!isSelectQuery) {
      return { displaySql: baseSql, baseSql, systemLimitApplied: false };
    }

    if (hasTopLevelLimit || hasMultipleStatements || tokens.length === 0) {
      return { displaySql: baseSql, baseSql, systemLimitApplied: false };
    }

    const lastToken = tokens[tokens.length - 1];
    const insertAt = lastToken.type === 'semicolon'
      ? lastToken.position
      : lastToken.position + lastToken.raw.length;
    const displaySql = `${baseSql.slice(0, insertAt).trimEnd()} LIMIT ${maxQueryRows}${baseSql.slice(insertAt)}`;
    return { displaySql, baseSql, systemLimitApplied: true };
  }, [maxQueryRows, systemLimitedSql]);

  const handleSQLChange = useCallback((nextSql: string) => {
    if (systemLimitedSql) {
      const tokens = tokenizeSQL(nextSql);
      let depth = 0;
      let limitIndex = -1;

      tokens.forEach((token, index) => {
        if (token.type === 'lparen') {
          depth += 1;
        } else if (token.type === 'rparen') {
          depth = Math.max(0, depth - 1);
        } else if (
          depth === 0 &&
          token.type === 'keyword' &&
          token.value.toUpperCase() === 'LIMIT'
        ) {
          limitIndex = index;
        }
      });

      const limitToken = tokens[limitIndex];
      const valueToken = tokens[limitIndex + 1];
      const hasUnchangedSystemLimit =
        limitToken?.type === 'keyword' &&
        valueToken?.type === 'number' &&
        valueToken.raw === String(maxQueryRows) &&
        tokens.slice(limitIndex + 2).every((token) => token.type === 'semicolon');

      if (hasUnchangedSystemLimit) {
        const baseSql = `${nextSql.slice(0, limitToken.position).trimEnd()}${
          nextSql.slice(valueToken.position + valueToken.raw.length)
        }`.trim();
        setSystemLimitedSql({ displaySql: nextSql.trim(), baseSql });
      } else {
        setSystemLimitedSql(null);
      }
    }
    setSQL(nextSql);
  }, [maxQueryRows, setSQL, systemLimitedSql]);

  // 全局对话抽屉的「插入编辑器」经总线回填到本编辑器;编辑器内容同步给
  // 抽屉的「解释/优化当前 SQL」快捷动作
  useEffect(() => {
    agentChatBus.registerInserter(handleSQLChange);
    return () => agentChatBus.registerInserter(null);
  }, [handleSQLChange]);
  useEffect(() => {
    agentChatBus.setSql('sql', sql);
  }, [sql]);

  const businessSql = systemLimitedSql?.displaySql === sql.trim()
    ? systemLimitedSql.baseSql
    : sql;

  const handleFormat = useCallback(() => {
    if (systemLimitedSql?.displaySql === sql.trim()) {
      const formattedBaseSql = formatSQLDataGrip(systemLimitedSql.baseSql);
      const { displaySql, baseSql } = applyDisplayLimit(formattedBaseSql);
      setSystemLimitedSql({ displaySql, baseSql });
      setSQL(displaySql);
      return;
    }
    setSystemLimitedSql(null);
    formatSQL();
  }, [applyDisplayLimit, formatSQL, setSQL, sql, systemLimitedSql]);

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
      const { displaySql, baseSql, systemLimitApplied } = applyDisplayLimit(sql);
      if (systemLimitApplied) {
        setSystemLimitedSql({ displaySql, baseSql });
        if (displaySql !== sql.trim()) {
          setSQL(displaySql);
        }
      } else {
        setSystemLimitedSql(null);
      }
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

        await onExecute(displaySql, executeSource, { baseSql });
        addToHistory({
          type: 'sql',
          sql: displaySql,
          executionTime: Date.now() - startTime,
        });
        // 重置警告状态
        setDismissedWarning(false);
      } catch (err) {
        console.error('SQL execution failed:', err);
        addToHistory({
          type: 'sql',
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
    requiresFederatedQuery, attachDatabases, unrecognizedPrefixes, dismissedWarning, addToHistory, setSQL]);

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
        onCancel={onCancel}
        onAsyncExecute={handleAsyncExecute}
        onFormat={handleFormat}
        onSave={() => setSaveDialogOpen(true)}
        isExecuting={executing}
        isCancelling={isCancelling}
        disableExecute={!sql.trim() || (tableSourceInfo.hasMixedSources && !requiresFederatedQuery)}
        executionTime={executionTime}
        aiSlot={
          chatStatus.enabled ? (
            <ChatToggleButton
              active={chatOpen}
              onClick={() =>
                chatStatus.configured ? agentChatBus.toggle() : openAiSettings()
              }
            />
          ) : undefined
        }
      />


      {/* 编辑器 */}
      <div className="flex-1 min-h-0 p-3">
        <SQLEditor
          value={sql}
          onChange={handleSQLChange}
          onExecute={handleExecute}
          placeholder={t('query.sql.placeholder')}
          minHeight={editorMinHeight}
          maxHeight={editorMaxHeight}
          tables={autocompleteTables}
          columns={autocompleteColumns}
          columnNameHints={flatColumnNames}
          defaultTable={completionDefaultTable}
          autoFocus
        />
      </div>

      {/* 保存查询对话框 */}
      <SaveQueryDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        sql={businessSql}
        type={queryType === 'external' && tableSourceInfo.currentSource ? tableSourceInfo.currentSource.databaseType : queryType}
      />

      {/* 异步任务对话框 */}
      <AsyncTaskDialog
        open={asyncDialogOpen}
        onOpenChange={setAsyncDialogOpen}
        sql={businessSql}
        datasource={tableSourceInfo.isExternal && tableSourceInfo.currentSource ? {
          id: tableSourceInfo.currentSource.connectionId || '',
          type: tableSourceInfo.currentSource.databaseType || '',
          name: tableSourceInfo.currentSource.connectionName,
        } : undefined}
        attachDatabases={attachDatabases.map(db => {
          // 查找连接名称
          const connection = availableConnections.find(c => c.id === db.connectionId);
          return {
            alias: db.alias,
            connectionId: db.connectionId,
            connectionName: connection?.name,
          };
        })}
        onSuccess={handleAsyncTaskSuccess}
      />
    </div>
  );
};

export default SQLQueryPanel;
