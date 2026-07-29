import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { generateSetOperation, validateSetOperation, toAttachDatabasesPayload } from '@/api';
import { Layers, Play, X, Database, Table, Trash2, AlertTriangle, Star, Timer, CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState as UiEmptyState } from '@/components/EmptyState';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useMultipleTableColumns } from '@/hooks/useTableColumns';
import { useAppConfig } from '@/hooks/useAppConfig';
import type { SelectedTable } from '@/types/SelectedTable';
import {
  normalizeSelectedTable,
  getTableName,
  isExternalTable,
  hasMixedSources,
  isSameConnection,
} from '@/utils/tableUtils';
import { getDatabaseTypeIcon } from '@/utils/databaseTypeIcon';
import {
  extractAttachDatabases,
  generateExternalTableReference,
  getSourceFromSelectedTable,
  resolveBusinessSql,
} from '@/utils/sqlUtils';
import { SQLHighlight } from '@/components/SQLHighlight';
import { SaveQueryDialog } from '../Bookmarks/SaveQueryDialog';
import { AsyncTaskDialog } from '../AsyncTasks/AsyncTaskDialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAiStatus } from '@/hooks/useAiStatus';
import { ChatToggleButton } from '@/Query/SQLQuery/ai/AiChatDrawer';
import { agentChatBus, useAgentChatBus } from '@/Query/SQLQuery/ai/agentChatBus';

/**
 * 集合操作面板 - 按照 Demo 设计重构
 * 
 * 功能：
 * - 横向卡片布局显示选中的表
 * - 顶部操作类型切换按钮
 * - 支持从左侧数据源面板双击添加表
 * - 支持外部数据库表（同一连接内）
 */

type SetOperationType = 'UNION' | 'UNION ALL' | 'INTERSECT' | 'EXCEPT';

interface TableColumn {
  name: string;
  type: string;
}

// 使用统一的 TableSource 类型
import type { TableSource } from '@/hooks/useQueryWorkspace';
export type { TableSource };

interface SetOperationsPanelProps {
  selectedTables?: SelectedTable[];
  onExecute?: (sql: string, source?: TableSource, options?: { baseSql?: string }) => Promise<void>;
  onRemoveTable?: (table: SelectedTable) => void;
}

const SET_OPERATIONS: {
  value: SetOperationType;
  labelKey: string;
  labelFallback: string;
  tooltipKey: string;
  tooltipFallback: string;
}[] = [
  {
    value: 'UNION',
    labelKey: 'query.set.operationUnion',
    labelFallback: '合并去重',
    tooltipKey: 'query.set.operationUnionHint',
    tooltipFallback: '合并并去除重复行',
  },
  {
    value: 'UNION ALL',
    labelKey: 'query.set.operationUnionAll',
    labelFallback: '合并并保留重复',
    tooltipKey: 'query.set.operationUnionAllHint',
    tooltipFallback: '合并并保留重复行',
  },
  {
    value: 'INTERSECT',
    labelKey: 'query.set.operationIntersect',
    labelFallback: '交集',
    tooltipKey: 'query.set.operationIntersectHint',
    tooltipFallback: '仅保留各表共有的行',
  },
  {
    value: 'EXCEPT',
    labelKey: 'query.set.operationExcept',
    labelFallback: '差集',
    tooltipKey: 'query.set.operationExceptHint',
    tooltipFallback: '仅保留第一张表中未出现在其他表的行',
  },
];

// 表卡片组件
interface TableCardProps {
  table: SelectedTable;
  columns: TableColumn[];
  selectedColumns: string[];
  onColumnToggle: (column: string) => void;
  onRemove: () => void;
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
}

const TableCard: React.FC<TableCardProps> = ({
  table,
  columns,
  selectedColumns,
  onColumnToggle,
  onRemove,
  isLoading,
  isError,
  isEmpty,
}) => {
  const { t } = useTranslation('common');
  const checkboxRef = React.useRef<HTMLInputElement>(null);

  const normalized = normalizeSelectedTable(table);
  const tableName = normalized.name;
  const isExternal = normalized.source === 'external';
  const DbIcon = isExternal && normalized.connection
    ? getDatabaseTypeIcon(normalized.connection.type)
    : null;

  const allSelected =
    columns.length > 0 && columns.every((col) => selectedColumns.includes(col.name));
  const someSelected =
    columns.some((col) => selectedColumns.includes(col.name)) && !allSelected;

  React.useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const handleSelectAll = () => {
    if (allSelected) {
      columns.forEach((col) => {
        if (selectedColumns.includes(col.name)) {
          onColumnToggle(col.name);
        }
      });
    } else {
      columns.forEach((col) => {
        if (!selectedColumns.includes(col.name)) {
          onColumnToggle(col.name);
        }
      });
    }
  };

  return (
    <div className={`bg-surface border rounded-xl shrink-0 min-w-64 max-w-72 ${isExternal ? 'border-warning/50' : 'border-border'}`}>
      {/* 头部 */}
      <div className="p-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isExternal && DbIcon ? (
            <DbIcon className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <Table className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <span className="font-medium text-sm truncate" title={tableName}>{tableName}</span>
        </div>
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-error p-1 rounded hover:bg-error/10"
          title={t('query.set.remove', '移除')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 列列表 */}
      <div className="p-3">
        <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
          {isExternal && DbIcon ? (
            <>
              <DbIcon className="w-3 h-3" />
              <span>{normalized.connection?.name || t('query.set.externalTable', '外部表')}</span>
            </>
          ) : (
            <>
              <Database className="w-3 h-3" />
              {t('query.set.duckdbTable', 'DuckDB 表')}
            </>
          )}
        </div>
        {isLoading ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {t('common.loading', '加载中...')}
          </div>
        ) : isError ? (
          <div className="text-xs text-error py-4 text-center">
            <AlertTriangle className="w-4 h-4 mx-auto mb-1" />
            {t('query.set.columnLoadError', '无法获取列信息')}
          </div>
        ) : isEmpty || columns.length === 0 ? (
          <div className="text-xs text-warning py-4 text-center">
            <AlertTriangle className="w-4 h-4 mx-auto mb-1" />
            {t('query.set.noColumns', '无可用列')}
          </div>
        ) : (
          <div className="space-y-0.5 max-h-48 overflow-auto">
            <label className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer border-b border-border/50 mb-1 sticky top-0 bg-surface z-10">
              <input
                ref={checkboxRef}
                type="checkbox"
                className="accent-primary w-3 h-3 cursor-pointer"
                checked={allSelected}
                onChange={handleSelectAll}
              />
              <span className="flex-1 font-medium text-muted-foreground">
                {allSelected
                  ? t('query.join.deselectAll', '取消全选')
                  : t('query.join.selectAll', '全选')}
              </span>
              <span className="text-xs text-muted-foreground/70">
                {selectedColumns.length}/{columns.length}
              </span>
            </label>
            {columns.map((col) => (
              <label
                key={col.name}
                className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted/50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  className="accent-primary w-3 h-3"
                  checked={selectedColumns.includes(col.name)}
                  onChange={() => onColumnToggle(col.name)}
                />
                <span className="flex-1 truncate">{col.name}</span>
                <span className="text-muted-foreground text-xs">{col.type}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// 集合操作连接器组件
interface SetConnectorProps {
  operationType: SetOperationType;
  byName?: boolean;
}

const SetConnector: React.FC<SetConnectorProps> = ({ operationType, byName }) => {
  const { t } = useTranslation('common');
  const showByName = byName && (operationType === 'UNION' || operationType === 'UNION ALL');
  const operation = SET_OPERATIONS.find((item) => item.value === operationType);
  const operationLabel = operation
    ? t(operation.labelKey, operation.labelFallback)
    : operationType;
  const displayText = showByName
    ? `${operationLabel} · ${t('query.set.byNameLabel', '按列名对齐')}`
    : operationLabel;

  return (
    <div className="flex items-center justify-center px-4 shrink-0">
      <div className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-full whitespace-nowrap">
        {displayText}
      </div>
    </div>
  );
};

// 空状态组件
const EmptyState: React.FC = () => {
  const { t } = useTranslation('common');
  return (
    <UiEmptyState
      variant="dashed"
      className="flex-1"
      icon={Layers}
      title={t('query.set.emptyTitle', '开始集合操作')}
      description={t('query.set.emptyDescription', '双击左侧数据源中的表开始集合操作，可添加多张表进行合并、交集或差集。')}
    />
  );
};

export const SetOperationsPanel: React.FC<SetOperationsPanelProps> = ({
  selectedTables = [],
  onExecute,
  onRemoveTable,
}) => {
  const { t } = useTranslation('common');
  const { maxQueryRows } = useAppConfig();
  const chatStatus = useAiStatus('data_qa');
  const { open: chatOpen } = useAgentChatBus();
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = React.useState(false);
  const [asyncDialogOpen, setAsyncDialogOpen] = React.useState(false);

  // 内部状态：如果没有外部传入 selectedTables，使用内部状态
  const [internalTables, setInternalTables] = React.useState<SelectedTable[]>([]);
  const activeTables = selectedTables.length > 0 ? selectedTables : internalTables;
  // 操作类型
  const [operationType, setOperationType] = React.useState<SetOperationType>('UNION');

  // BY NAME 模式（仅对 UNION 和 UNION ALL 有效）
  const [byName, setByName] = React.useState(false);

  // 每个表的选中列
  const [selectedColumns, setSelectedColumns] = React.useState<Record<string, string[]>>({});

  // 分析表来源
  const sourceAnalysis = React.useMemo(() => {
    const mixed = hasMixedSources(activeTables);
    const sameConn = isSameConnection(activeTables);
    const hasExternal = activeTables.some(isExternalTable);

    // 获取当前数据源信息
    const externalTables = activeTables.filter(isExternalTable);
    const currentSource = externalTables.length > 0
      ? normalizeSelectedTable(externalTables[0]).connection
      : undefined;

    return { mixed, sameConn, hasExternal, currentSource };
  }, [activeTables]);

  // 获取表源信息
  const tableSource = React.useMemo((): TableSource | undefined => {
    if (sourceAnalysis.hasExternal) {
      const externalTables = activeTables.filter(isExternalTable);
      if (externalTables.length > 0) {
        return getSourceFromSelectedTable(externalTables[0]);
      }
    }
    return { type: 'duckdb' };
  }, [sourceAnalysis.hasExternal, activeTables]);

  // 是否是 BY NAME 模式（不需要列数量一致）
  const isByNameMode = byName && (operationType === 'UNION' || operationType === 'UNION ALL');

  // 当前操作是否支持 BY NAME
  const currentOpSupportsByName = operationType === 'UNION' || operationType === 'UNION ALL';

  // 列一致性验证
  const columnValidation = React.useMemo(() => {
    if (activeTables.length < 2) {
      return { isValid: true, tableIndex: 0, tableCount: 0, baseCount: 0 };
    }

    // BY NAME 模式不需要列数量一致
    if (isByNameMode) {
      return { isValid: true, tableIndex: 0, tableCount: 0, baseCount: 0 };
    }

    // 获取每个表的选中列
    const tableColumnLists = activeTables.map((table) => {
      const tableName = getTableName(table);
      return selectedColumns[tableName] || [];
    });

    // 以第一个表的列作为基准
    const baseColumns = tableColumnLists[0];
    const baseCount = baseColumns.length;

    // 检查所有表的列数量是否一致
    for (let i = 1; i < tableColumnLists.length; i++) {
      const currentColumns = tableColumnLists[i];
      if (currentColumns.length !== baseCount) {
        return {
          isValid: false,
          // Store indices and counts for i18n interpolation
          tableIndex: i + 1,
          tableCount: currentColumns.length,
          baseCount: baseCount,
        };
      }
    }

    return { isValid: true, tableIndex: 0, tableCount: 0, baseCount: 0 };
  }, [activeTables, selectedColumns, isByNameMode]);

  // 获取每个表的列信息 - 用 useQueries 并行获取（支持任意表数量，无固定上限）
  const tableColumnsResults = useMultipleTableColumns(activeTables);

  // 计算加载和错误状态
  // 构建表列映射 - 使用稳定的 key 来避免无限循环
  const tableColumnsMapKey = tableColumnsResults
    .map((r, i) => activeTables[i] ? `${getTableName(activeTables[i])}:${r.columns.length}` : '')
    .filter(Boolean)
    .join(',');

  const tableColumnsMap = React.useMemo(() => {
    const map: Record<string, TableColumn[]> = {};
    activeTables.forEach((table, index) => {
      const tableName = getTableName(table);
      const result = tableColumnsResults[index];
      if (tableName && result?.columns) {
        map[tableName] = result.columns;
      }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableColumnsMapKey]);

  // 计算活动表名的稳定 key
  const activeTableNamesKey = activeTables.map(getTableName).sort().join(',');

  // 初始化选中列（默认全选）
  React.useEffect(() => {
    // 获取当前活动表名列表
    const activeTableNames = new Set(activeTables.map(getTableName));

    setSelectedColumns((prev) => {
      const updated: Record<string, string[]> = {};
      let hasChanges = false;

      // 只保留当前活动表的列选择
      activeTables.forEach((table) => {
        const tableName = getTableName(table);
        if (prev[tableName]) {
          // 保留已有的列选择
          updated[tableName] = prev[tableName];
        } else if (tableColumnsMap[tableName]) {
          // 新表：默认全选
          updated[tableName] = tableColumnsMap[tableName].map((c) => c.name);
          hasChanges = true;
        }
      });

      // 检查是否有表被移除
      const prevTableNames = Object.keys(prev);
      if (prevTableNames.some(name => !activeTableNames.has(name))) {
        hasChanges = true;
      }

      return hasChanges || Object.keys(updated).length !== Object.keys(prev).length ? updated : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTableNamesKey, tableColumnsMapKey]);

  // 处理列选择切换
  const handleColumnToggle = (table: SelectedTable, column: string) => {
    const tableName = getTableName(table);
    setSelectedColumns((prev) => {
      const current = prev[tableName] || [];
      if (current.includes(column)) {
        return { ...prev, [tableName]: current.filter((c) => c !== column) };
      } else {
        return { ...prev, [tableName]: [...current, column] };
      }
    });
  };

  // 处理移除表
  const handleRemoveTable = (table: SelectedTable) => {
    const tableName = getTableName(table);
    if (onRemoveTable) {
      onRemoveTable(table);
    } else {
      setInternalTables((prev) => prev.filter((t) => getTableName(t) !== tableName));
    }
    // 清理相关状态
    setSelectedColumns((prev) => {
      const { [tableName]: _, ...rest } = prev;
      return rest;
    });
  };

  // 处理清空
  const handleClear = () => {
    if (onRemoveTable) {
      activeTables.forEach((t) => onRemoveTable(t));
    } else {
      setInternalTables([]);
    }
    setSelectedColumns({});
  };

  const attachDatabases = React.useMemo(
    () => extractAttachDatabases(activeTables),
    [activeTables]
  );

  const canGenerateServerSql =
    activeTables.length >= 2 &&
    !sourceAnalysis.mixed &&
    columnValidation.isValid;

  const buildSetOperationRequest = React.useCallback(() => {
    if (activeTables.length < 2) return null;
    const attachForPayload = toAttachDatabasesPayload(attachDatabases);
    return {
      config: {
        operation_type: operationType,
        use_by_name: isByNameMode,
        tables: activeTables.map((table) => {
          const tableName = isExternalTable(table)
            ? generateExternalTableReference(table).qualifiedName
            : getTableName(table);
          return {
            table_name: tableName,
            selected_columns: selectedColumns[getTableName(table)] || [],
          };
        }),
      },
      attach_databases: attachForPayload,
      include_metadata: false,
    };
  }, [activeTables, operationType, isByNameMode, selectedColumns, attachDatabases]);

  const setOpQueryKey = React.useMemo(
    () => [
      'set-operation-sql',
      operationType,
      isByNameMode,
      activeTableNamesKey,
      JSON.stringify(selectedColumns),
    ] as const,
    [operationType, isByNameMode, activeTableNamesKey, selectedColumns]
  );

  const {
    data: serverValidation,
    isFetching: isValidatingServer,
  } = useQuery({
    queryKey: ['set-operation-validate', ...setOpQueryKey] as const,
    queryFn: async () => {
      const payload = buildSetOperationRequest();
      if (!payload) return null;
      return validateSetOperation(payload);
    },
    enabled: canGenerateServerSql,
    staleTime: 30_000,
  });

  const serverValidationBlocked =
    serverValidation != null && serverValidation.is_valid === false;

  const canExecute = React.useMemo(() => {
    if (activeTables.length < 2) return false;
    if (sourceAnalysis.mixed) return false;
    if (sourceAnalysis.mixed) return false;
    if (!columnValidation.isValid) return false;
    if (serverValidationBlocked) return false;
    if (isValidatingServer) return false;
    return true;
  }, [
    activeTables.length,
    sourceAnalysis,
    columnValidation.isValid,
    serverValidationBlocked,
    isValidatingServer,
  ]);

  const {
    data: generatedBaseSql,
    isFetching: isGeneratingSql,
    error: generateSqlError,
  } = useQuery({
    queryKey: setOpQueryKey,
    queryFn: async () => {
      const payload = buildSetOperationRequest();
      if (!payload) return '';
      const result = await generateSetOperation(payload);
      return result.sql?.trim() ?? '';
    },
    enabled: canGenerateServerSql && !serverValidationBlocked,
    staleTime: 30_000,
  });

  const sqlForExecute = React.useMemo(() => {
    if (!generatedBaseSql) return null;
    return `${generatedBaseSql}\nLIMIT ${maxQueryRows}`;
  }, [generatedBaseSql, maxQueryRows]);

  const handleExecute = async () => {
    if (!sqlForExecute || !onExecute || !canExecute) return;

    setIsExecuting(true);
    try {
      // baseSql = 无系统 LIMIT 的基础 SQL:异步/导出用它才是真全量(复审 P1)
      await onExecute(sqlForExecute, tableSource, { baseSql: generatedBaseSql ?? undefined });
    } finally {
      setIsExecuting(false);
    }
  };

  const sql = sqlForExecute;

  // 全局对话抽屉在集合 Tab 激活时以本面板生成的 SQL 作为「当前 SQL」
  React.useEffect(() => {
    agentChatBus.setSql('set', sql ?? '');
  }, [sql]);
  const CurrentSourceIcon = sourceAnalysis.currentSource
    ? getDatabaseTypeIcon(sourceAnalysis.currentSource.type)
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border shrink-0 bg-muted/30">
        <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="default"
              size="sm"
              onClick={handleExecute}
              disabled={!canExecute || isExecuting}
              className="gap-1.5 shrink-0"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {t('query.execute', '执行')}
            </Button>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAsyncDialogOpen(true)}
                    disabled={!canExecute || isExecuting || !sql?.trim()}
                    className="gap-1.5 shrink-0"
                    aria-label={t('query.sql.asyncExecute', '异步执行')}
                  >
                    <Timer className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {t('query.sql.asyncExecute', '异步执行')}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('query.sql.asyncExecuteHint', '按当前 SQL 异步写入 DuckDB 表')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={activeTables.length === 0}
              className="text-muted-foreground hover:text-foreground gap-1.5 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('query.set.clear', '清空')}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSaveDialogOpen(true)}
              disabled={!sql}
              className="text-muted-foreground hover:text-yellow-500 gap-1.5 shrink-0"
              title={t('query.bookmark.save', '收藏查询')}
            >
              <Star className="w-3.5 h-3.5" />
              {t('query.bookmark.save', '收藏')}
            </Button>

            {chatStatus.configured && (
              <ChatToggleButton active={chatOpen} onClick={() => agentChatBus.toggle()} />
            )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-l border-border pl-2">
          <div
            className="flex h-8 flex-wrap rounded-md bg-muted p-0.5 gap-0.5"
            role="tablist"
            aria-label={t('query.set.operationType', '集合运算类型')}
          >
            {SET_OPERATIONS.map((op) => (
              <button
                key={op.value}
                type="button"
                role="tab"
                aria-selected={operationType === op.value}
                onClick={() => setOperationType(op.value)}
                title={t(op.tooltipKey, op.tooltipFallback)}
                className={`shrink-0 whitespace-nowrap px-2.5 text-xs font-medium rounded transition-colors ${operationType === op.value
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                {t(op.labelKey, op.labelFallback)}
              </button>
            ))}
          </div>
          <label
            className={`flex shrink-0 items-center gap-1.5 text-xs cursor-pointer select-none ${currentOpSupportsByName ? 'text-foreground' : 'text-muted-foreground opacity-50 cursor-not-allowed'
              }`}
          >
            <input
              type="checkbox"
              className="accent-primary w-3.5 h-3.5"
              checked={byName}
              onChange={(e) => setByName(e.target.checked)}
              disabled={!currentOpSupportsByName}
            />
            <span className="whitespace-nowrap">
              {t('query.set.byNameLabel', '按列名对齐')}
            </span>
          </label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={t('query.set.byNameTooltip', '合并字段不同的数据：同名列自动对齐，缺失列补 NULL')}
                >
                  <CircleHelp className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{t('query.set.byNameTooltip', '合并字段不同的数据：同名列自动对齐，缺失列补 NULL')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex shrink-0 items-center gap-2 ml-auto">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-background/50 text-xs text-muted-foreground hidden lg:flex">
            <Layers className="w-3.5 h-3.5" />
            <span className="whitespace-nowrap">{t('query.set.title', '集合操作')}</span>
          </div>

          {/* 外部数据库指示器 */}
          {sourceAnalysis.hasExternal && sourceAnalysis.currentSource && CurrentSourceIcon && (
            <Badge variant="outline" className="text-warning border-warning/50 text-xs h-5 px-1.5 gap-1">
              <CurrentSourceIcon className="w-3 h-3 opacity-70" />
              {sourceAnalysis.currentSource.name}
            </Badge>
          )}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-6">
        {sourceAnalysis.mixed && (
          <Alert className="mb-4 border-warning/50 bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-warning">
              {t(
                'query.set.mixedSources',
                '不能混用 DuckDB 本地表与外部库表。请只选择同一来源的表。'
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* BY NAME 模式提示 */}
        {isByNameMode && activeTables.length >= 2 && (
          <Alert className="mb-4 border-primary/50 bg-primary/10">
            <Layers className="h-4 w-4 text-primary" />
            <AlertDescription className="text-primary">
              {t('query.set.byNameModeHint', '已按列名对齐：可合并字段不同的数据，缺失列补 NULL。')}
            </AlertDescription>
          </Alert>
        )}

        {/* 服务端校验错误 */}
        {serverValidationBlocked && serverValidation?.errors?.length ? (
          <Alert className="mb-4 border-destructive/50 bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-destructive">
              <ul className="list-disc pl-4 space-y-1">
                {serverValidation.errors.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {serverValidation?.warnings?.length ? (
          <Alert className="mb-4 border-warning/50 bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-warning">
              <ul className="list-disc pl-4 space-y-1">
                {serverValidation.warnings.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {/* 列一致性警告 */}
        {!columnValidation.isValid && (
          <Alert className="mb-4 border-warning/50 bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-warning">
              {t('query.set.columnMismatchWarning', 'Set operations require the same number of selected columns across all tables.')}
              {' '}
              {t('query.set.columnMismatchDetail', 'Table {{tableIndex}} has {{tableCount}} columns, but the first table has {{baseCount}} columns.', {
                tableIndex: columnValidation.tableIndex,
                tableCount: columnValidation.tableCount,
                baseCount: columnValidation.baseCount,
              })}
            </AlertDescription>
          </Alert>
        )}

        {/* 表卡片区域 - 横向排列 */}
        <div className="flex items-start gap-4 min-h-72 pb-4 overflow-x-auto">
          {activeTables.length === 0 ? (
            <EmptyState />
          ) : (
            activeTables.map((table, index) => {
              const tableName = getTableName(table);
              const columnResult = tableColumnsResults[index];
              const columns = tableColumnsMap[tableName] || [];

              return (
                <React.Fragment key={`${tableName}-${index}`}>
                  <TableCard
                    table={table}
                    columns={columns}
                    selectedColumns={selectedColumns[tableName] || []}
                    onColumnToggle={(col) => handleColumnToggle(table, col)}
                    onRemove={() => handleRemoveTable(table)}
                    isLoading={columnResult?.isLoading}
                    isError={columnResult?.isError}
                    isEmpty={columnResult?.isEmpty}
                  />
                  {/* 集合操作连接器 */}
                  {index < activeTables.length - 1 && (
                    <SetConnector operationType={operationType} byName={byName} />
                  )}
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* SQL 预览 */}
        {(sql || isGeneratingSql || generateSqlError) && canGenerateServerSql && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <span className="text-primary">SQL</span>
                {isGeneratingSql
                  ? t('query.set.generatingSql', '生成中…')
                  : t('query.set.generatedSql', '生成的 SQL')}
              </label>
              <button
                className="text-xs text-primary hover:underline"
                onClick={() => sql && navigator.clipboard.writeText(sql)}
              >
                {t('common.copy', '复制')}
              </button>
            </div>
            {generateSqlError ? (
              <Alert variant="destructive">
                <AlertDescription>{(generateSqlError as Error).message}</AlertDescription>
              </Alert>
            ) : sql ? (
              <SQLHighlight sql={sql} minHeight="120px" maxHeight="300px" scrollable />
            ) : null}
          </div>
        )}
      </div>

      {/* 收藏查询对话框 */}
      <SaveQueryDialog
        open={isSaveDialogOpen}
        onOpenChange={setIsSaveDialogOpen}
        sql={resolveBusinessSql(generatedBaseSql, sql)}
      />

      {/* 异步任务对话框:提交无系统 LIMIT 的基础 SQL——sqlForExecute 把 LIMIT maxQueryRows
          烤进了文本,后端"全量"会原样保留它、导不出全表(复审 P1) */}
      <AsyncTaskDialog
        open={asyncDialogOpen}
        onOpenChange={setAsyncDialogOpen}
        sql={generatedBaseSql?.trim() ?? ''}
        onSuccess={() => {
          setAsyncDialogOpen(false);
        }}
      />

    </div>
  );
};

export default SetOperationsPanel;
