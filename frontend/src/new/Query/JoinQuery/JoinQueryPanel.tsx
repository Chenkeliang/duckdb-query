import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { GitMerge, Play, X, Database, Table, Trash2, AlertTriangle, Link2, Columns, ArrowRightLeft, Edit2 } from 'lucide-react';
import { Input } from '@/new/components/ui/input';
import { Button } from '@/new/components/ui/button';
import { Alert, AlertDescription } from '@/new/components/ui/alert';
import { Badge } from '@/new/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/new/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/new/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/new/components/ui/tooltip';
import { parseFederatedQueryError } from '@/services/apiClient';
import { useTableColumns } from '@/new/hooks/useTableColumns';
import { useAppConfig } from '@/new/hooks/useAppConfig';
import { useTypeConflict, type ColumnPair } from '@/new/hooks/useTypeConflict';
import { TypeConflictDialog } from '@/new/Query/components/TypeConflictDialog';
import { SQLHighlight } from '@/new/components/SQLHighlight';
import { generateConflictKey } from '@/new/utils/duckdbTypes';
import type { SelectedTable } from '@/new/types/SelectedTable';
import {
  normalizeSelectedTable,
  getTableName,
  isExternalTable,
  hasMixedSources,
  isSameConnection,
  DATABASE_TYPE_ICONS,
} from '@/new/utils/tableUtils';
import {
  quoteIdent,
  extractAttachDatabases,
  formatTableReference,
  createTableReference,
} from '@/new/utils/sqlUtils';
import {
  FilterBar,
  createEmptyGroup,
  generateFilterSQL,
  cloneTreeWithoutOnConditions,
  getOnConditionsTreeForTable,
  type FilterGroup,
  type ColumnInfo,
} from './FilterBar';


/**
 * JOIN 查询面板 - 按照 Demo 设计重构
 * 
 * 功能：
 * - 横向卡片布局显示选中的表
 * - 可视化 JOIN 连接器
 * - 列选择下拉菜单
 * - 支持从左侧数据源面板双击添加表
 * - 支持外部数据库表（同一连接内）
 */

type JoinType = 'INNER JOIN' | 'LEFT JOIN' | 'RIGHT JOIN' | 'FULL JOIN';

/** 条件侧模式 */
type ConditionSideMode = 'column' | 'expression';

/** 单个 Join 条件 */
interface JoinCondition {
  leftColumn: string;
  leftExpression?: string;  // 自定义表达式
  leftMode?: ConditionSideMode;  // 默认 'column'
  rightColumn: string;
  rightExpression?: string;
  rightMode?: ConditionSideMode;
  operator: '=' | '!=' | '<' | '>' | '<=' | '>=';
}

interface JoinConfig {
  joinType: JoinType;
  conditions: JoinCondition[];
}

// 向后兼容：将旧格式转换为新格式
const normalizeJoinConfig = (config: any): JoinConfig => {
  if (config.conditions) {
    // 确保每个条件都有 mode 字段
    return {
      ...config,
      conditions: config.conditions.map((c: JoinCondition) => ({
        ...c,
        leftMode: c.leftMode || 'column',
        rightMode: c.rightMode || 'column',
      })),
    };
  }
  // 旧格式：{ leftColumn, rightColumn, joinType }
  return {
    joinType: config.joinType || 'LEFT JOIN',
    conditions: [{
      leftColumn: config.leftColumn || '',
      rightColumn: config.rightColumn || '',
      operator: '=',
      leftMode: 'column',
      rightMode: 'column',
    }],
  };
};

interface TableColumn {
  name: string;
  type: string;
}

// 使用统一的 TableSource 类型
import type { TableSource } from '@/new/hooks/useQueryWorkspace';
export type { TableSource };

interface JoinQueryPanelProps {
  selectedTables?: SelectedTable[];
  onExecute?: (sql: string, source?: TableSource) => Promise<void>;
  onRemoveTable?: (table: SelectedTable) => void;
}

const JOIN_TYPES: { value: JoinType; label: string }[] = [
  { value: 'INNER JOIN', label: 'INNER JOIN' },
  { value: 'LEFT JOIN', label: 'LEFT JOIN' },
  { value: 'RIGHT JOIN', label: 'RIGHT JOIN' },
  { value: 'FULL JOIN', label: 'FULL JOIN' },
];

// 表卡片组件
interface TableCardProps {
  table: SelectedTable;
  isPrimary?: boolean;
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
  isPrimary,
  columns,
  selectedColumns,
  onColumnToggle,
  onRemove,
  isLoading,
  isError,
  isEmpty,
}) => {
  const { t } = useTranslation('common');
  const [showAllColumnsDialog, setShowAllColumnsDialog] = React.useState(false);
  const displayColumns = columns.slice(0, 6);
  const moreCount = columns.length - 6;

  const normalized = normalizeSelectedTable(table);
  const tableName = normalized.name;
  const isExternal = normalized.source === 'external';
  const dbIcon = isExternal && normalized.connection
    ? DATABASE_TYPE_ICONS[normalized.connection.type] || '📊'
    : null;

  // 全选/取消全选
  const handleSelectAll = () => {
    const allSelected = columns.every((col) => selectedColumns.includes(col.name));
    if (allSelected) {
      // 取消全选
      columns.forEach((col) => {
        if (selectedColumns.includes(col.name)) {
          onColumnToggle(col.name);
        }
      });
    } else {
      // 全选
      columns.forEach((col) => {
        if (!selectedColumns.includes(col.name)) {
          onColumnToggle(col.name);
        }
      });
    }
  };

  const allSelected = columns.length > 0 && columns.every((col) => selectedColumns.includes(col.name));
  const someSelected = columns.some((col) => selectedColumns.includes(col.name)) && !allSelected;

  // 引用 checkbox 以设置 indefinite 状态
  const checkboxRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  return (
    <>
      <div className={`bg-surface border rounded-xl shrink-0 min-w-64 max-w-72 ${isExternal ? 'border-warning/50' : 'border-border'}`}>
        {/* 头部 */}
        <div className="p-3 border-b border-border flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isExternal ? (
              <span className="text-sm shrink-0">{dbIcon}</span>
            ) : (
              <Table className={`w-4 h-4 shrink-0 ${isPrimary ? 'text-primary' : 'text-muted-foreground'}`} />
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="font-medium text-sm truncate block">{tableName}</span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[400px] z-[100]">
                  <p className="font-mono text-xs break-all">{tableName}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {isPrimary && (
              <span className="text-xs px-1.5 py-0.5 bg-primary/20 text-primary rounded shrink-0">
                {t('query.join.primaryTable', '主表')}
              </span>
            )}
          </div>
          <div className="flex items-center shrink-0">
            <button
              onClick={onRemove}
              className="text-muted-foreground hover:text-error p-1 rounded hover:bg-error/10"
              title={t('query.join.remove', '移除')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 列列表 */}
        <div className="p-3">
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            {isExternal ? (
              <>
                <span>{dbIcon}</span>
                <span>{normalized.connection?.name || t('query.join.externalTable', '外部表')}</span>
              </>
            ) : (
              <>
                <Database className="w-3 h-3" />
                {t('query.join.duckdbTable', 'DuckDB 表')}
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
              {t('query.join.columnLoadError', '无法获取列信息')}
            </div>
          ) : isEmpty || columns.length === 0 ? (
            <div className="text-xs text-warning py-4 text-center">
              <AlertTriangle className="w-4 h-4 mx-auto mb-1" />
              {t('query.join.noColumns', '无可用列')}
            </div>
          ) : (
            <div className="space-y-0.5 max-h-40 overflow-auto">
              {/* 全选行 */}
              <label className="flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer border-b border-border/50 mb-1 sticky top-0 bg-surface z-10">
                <input
                  ref={checkboxRef}
                  type="checkbox"
                  className="accent-primary w-3 h-3 cursor-pointer"
                  checked={allSelected}
                  onChange={handleSelectAll}
                />
                <span className="flex-1 font-medium text-muted-foreground">
                  {allSelected ? t('query.join.deselectAll', '取消全选') : t('query.join.selectAll', '全选')}
                </span>
                <span className="text-xs text-muted-foreground/70">
                  {selectedColumns.length}/{columns.length}
                </span>
              </label>

              {displayColumns.map((col) => (
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
                  <span className="flex-1 truncate text-foreground">{col.name}</span>
                  <span className="text-muted-foreground/70 text-xs">{col.type}</span>
                </label>
              ))}
              {moreCount > 0 && (
                <button
                  onClick={() => setShowAllColumnsDialog(true)}
                  className="w-full text-xs text-primary hover:text-primary/80 text-center py-1 hover:bg-muted/30 rounded cursor-pointer flex items-center justify-center gap-1"
                >
                  <Columns className="w-3 h-3" />
                  +{moreCount} {t('query.join.moreColumns', '更多字段')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 全部字段对话框 */}
      <Dialog open={showAllColumnsDialog} onOpenChange={setShowAllColumnsDialog}>
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Columns className="w-4 h-4" />
              {tableName} - {t('query.join.allColumns', '全部字段')}
              <span className="text-xs text-muted-foreground font-normal">
                ({columns.length} {t('query.join.columnsCount', '列')})
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {/* 全选/取消全选 */}
            <div className="border-b border-border pb-2 mb-2">
              <label className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-primary w-3.5 h-3.5"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={handleSelectAll}
                />
                <span className="font-medium">
                  {allSelected
                    ? t('query.join.deselectAll', '取消全选')
                    : t('query.join.selectAll', '全选')}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {selectedColumns.length}/{columns.length}
                </span>
              </label>
            </div>
            {/* 列列表 */}
            <div className="space-y-0.5">
              {columns.map((col) => (
                <label
                  key={col.name}
                  className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="accent-primary w-3.5 h-3.5"
                    checked={selectedColumns.includes(col.name)}
                    onChange={() => onColumnToggle(col.name)}
                  />
                  <span className="flex-1 truncate text-foreground">{col.name}</span>
                  <span className="text-muted-foreground/70 text-xs">{col.type}</span>
                </label>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

// 操作符选项
const OPERATORS: { value: JoinCondition['operator']; label: string }[] = [
  { value: '=', label: '=' },
  { value: '!=', label: '!=' },
  { value: '<', label: '<' },
  { value: '>', label: '>' },
  { value: '<=', label: '<=' },
  { value: '>=', label: '>=' },
];

// JOIN 连接器组件
interface JoinConnectorProps {
  leftTable: string;
  rightTable: string;
  leftColumns: TableColumn[];
  rightColumns: TableColumn[];
  config: JoinConfig;
  onConfigChange: (config: JoinConfig) => void;
  onSwap: () => void;
}

const JoinConnector: React.FC<JoinConnectorProps> = ({
  leftColumns,
  rightColumns,
  config,
  onConfigChange,
  onSwap,
}) => {
  const { t } = useTranslation('common');
  const normalizedConfig = normalizeJoinConfig(config);
  const conditions = normalizedConfig.conditions;

  // 添加条件
  const handleAddCondition = () => {
    const newCondition: JoinCondition = {
      leftColumn: leftColumns[0]?.name || '',
      rightColumn: rightColumns[0]?.name || '',
      operator: '=',
    };
    onConfigChange({
      ...normalizedConfig,
      conditions: [...conditions, newCondition],
    });
  };

  // 移除条件
  const handleRemoveCondition = (index: number) => {
    if (conditions.length <= 1) return; // 至少保留一个条件
    const newConditions = conditions.filter((_, i) => i !== index);
    onConfigChange({
      ...normalizedConfig,
      conditions: newConditions,
    });
  };

  // 更新条件
  const handleConditionChange = (index: number, updates: Partial<JoinCondition>) => {
    const newConditions = conditions.map((cond, i) =>
      i === index ? { ...cond, ...updates } : cond
    );
    onConfigChange({
      ...normalizedConfig,
      conditions: newConditions,
    });
  };

  return (
    <div className="flex flex-col items-center gap-2 px-2 shrink-0">
      {/* 交换按钮 */}
      <button
        onClick={onSwap}
        className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
        title={t('query.join.swapTables', '交换表顺序')}
      >
        <ArrowRightLeft className="w-3.5 h-3.5" />
      </button>

      {/* JOIN 类型选择 */}
      <Select
        value={normalizedConfig.joinType}
        onValueChange={(value: JoinType) => onConfigChange({ ...normalizedConfig, joinType: value })}
      >
        <SelectTrigger className="w-28 text-xs text-center h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {JOIN_TYPES.map((type) => (
            <SelectItem key={type.value} value={type.value} className="text-xs">
              {type.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 连接线 */}
      <div className="w-16 h-0.5 bg-primary/50" />

      {/* ON 标签 */}
      <div className="text-xs text-muted-foreground">ON</div>

      {/* 条件列表 */}
      <div className="flex flex-col gap-1">
        {conditions.map((condition, index) => {
          const leftMode = condition.leftMode || 'column';
          const rightMode = condition.rightMode || 'column';

          return (
            <div key={index} className="flex items-center gap-1 text-xs">
              {index > 0 && (
                <span className="text-muted-foreground text-xs mr-1">AND</span>
              )}

              {/* 左侧条件 */}
              <div className="flex items-center gap-0.5">
                {leftMode === 'column' ? (
                  <Select
                    value={condition.leftColumn}
                    onValueChange={(value) => handleConditionChange(index, { leftColumn: value })}
                  >
                    <SelectTrigger className="w-20 text-xs h-7 px-2">
                      <SelectValue placeholder={t('query.join.column', '列')} />
                    </SelectTrigger>
                    <SelectContent>
                      {leftColumns.map((col) => (
                        <SelectItem key={col.name} value={col.name} className="text-xs">
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={condition.leftExpression || ''}
                    onChange={(e) => handleConditionChange(index, { leftExpression: e.target.value })}
                    placeholder="CONCAT(...)"
                    className="w-32 h-7 text-xs px-2 font-mono"
                  />
                )}
                <button
                  onClick={() => handleConditionChange(index, {
                    leftMode: leftMode === 'column' ? 'expression' : 'column'
                  })}
                  className={`p-1 rounded hover:bg-muted ${leftMode === 'expression' ? 'text-primary' : 'text-muted-foreground'}`}
                  title={leftMode === 'column' ? t('query.join.switchToExpression', '切换到表达式模式') : t('query.join.switchToColumn', '切换到列模式')}
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>

              {/* 操作符 */}
              <Select
                value={condition.operator}
                onValueChange={(value: JoinCondition['operator']) => handleConditionChange(index, { operator: value })}
              >
                <SelectTrigger className="w-12 text-xs h-7 px-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((op) => (
                    <SelectItem key={op.value} value={op.value} className="text-xs">
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 右侧条件 */}
              <div className="flex items-center gap-0.5">
                {rightMode === 'column' ? (
                  <Select
                    value={condition.rightColumn}
                    onValueChange={(value) => handleConditionChange(index, { rightColumn: value })}
                  >
                    <SelectTrigger className="w-20 text-xs h-7 px-2">
                      <SelectValue placeholder={t('query.join.column', '列')} />
                    </SelectTrigger>
                    <SelectContent>
                      {rightColumns.map((col) => (
                        <SelectItem key={col.name} value={col.name} className="text-xs">
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={condition.rightExpression || ''}
                    onChange={(e) => handleConditionChange(index, { rightExpression: e.target.value })}
                    placeholder="CONCAT(...)"
                    className="w-32 h-7 text-xs px-2 font-mono"
                  />
                )}
                <button
                  onClick={() => handleConditionChange(index, {
                    rightMode: rightMode === 'column' ? 'expression' : 'column'
                  })}
                  className={`p-1 rounded hover:bg-muted ${rightMode === 'expression' ? 'text-primary' : 'text-muted-foreground'}`}
                  title={rightMode === 'column' ? t('query.join.switchToExpression', '切换到表达式模式') : t('query.join.switchToColumn', '切换到列模式')}
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>

              {conditions.length > 1 && (
                <button
                  onClick={() => handleRemoveCondition(index)}
                  className="text-muted-foreground hover:text-error p-0.5 rounded hover:bg-error/10"
                  title={t('query.join.removeCondition', '移除条件')}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 添加条件按钮 */}
      <button
        onClick={handleAddCondition}
        className="text-xs text-primary hover:underline"
      >
        + {t('query.join.addCondition', '添加条件')}
      </button>
    </div>
  );
};

// Memoized JOIN 连接器组件 - 接受 index 作为 prop 以避免闭包问题
interface MemoizedJoinConnectorProps extends Omit<JoinConnectorProps, 'onConfigChange' | 'onSwap'> {
  index: number;
  onConfigChange: (index: number, config: JoinConfig) => void;
  onSwap: (index: number) => void;
}

const MemoizedJoinConnector = React.memo<MemoizedJoinConnectorProps>(({
  index,
  leftTable,
  rightTable,
  leftColumns,
  rightColumns,
  config,
  onConfigChange,
  onSwap,
}) => {
  // 创建稳定的回调
  const handleConfigChange = React.useCallback((newConfig: JoinConfig) => {
    onConfigChange(index, newConfig);
  }, [index, onConfigChange]);

  const handleSwap = React.useCallback(() => {
    onSwap(index);
  }, [index, onSwap]);

  return (
    <JoinConnector
      leftTable={leftTable}
      rightTable={rightTable}
      leftColumns={leftColumns}
      rightColumns={rightColumns}
      config={config}
      onConfigChange={handleConfigChange}
      onSwap={handleSwap}
    />
  );
});

MemoizedJoinConnector.displayName = 'MemoizedJoinConnector';

// 空状态组件
const EmptyState: React.FC = () => {
  const { t } = useTranslation('common');
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-12 border-2 border-dashed border-border rounded-xl">
      <GitMerge className="w-12 h-12 text-muted-foreground mb-4" />
      <h3 className="text-sm font-medium mb-2">
        {t('query.join.emptyTitle', '开始关联查询')}
      </h3>
      <p className="text-xs text-muted-foreground max-w-xs">
        {t('query.join.emptyDescription', '双击左侧数据源面板中的表来添加到关联查询。第一个添加的表将作为主表。')}
      </p>
    </div>
  );
};

export const JoinQueryPanel: React.FC<JoinQueryPanelProps> = ({
  selectedTables = [],
  onExecute,
  onRemoveTable,
}) => {
  const { t } = useTranslation('common');
  const { maxQueryRows } = useAppConfig();
  const [isExecuting, setIsExecuting] = React.useState(false);

  // 内部状态：如果没有外部传入 selectedTables，使用内部状态
  const [internalTables, setInternalTables] = React.useState<SelectedTable[]>([]);
  // 表顺序状态
  const [tableOrder, setTableOrder] = React.useState<string[]>([]);

  const rawTables = selectedTables.length > 0 ? selectedTables : internalTables;

  // 计算活动表（应用排序）
  const activeTables = React.useMemo(() => {
    if (tableOrder.length === 0) return rawTables;

    return [...rawTables].sort((a, b) => {
      const nameA = getTableName(a);
      const nameB = getTableName(b);
      const indexA = tableOrder.indexOf(nameA);
      const indexB = tableOrder.indexOf(nameB);

      // 如果两个都在排序列表中，按列表顺序
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      // 如果只有一个在，在列表中的排前面
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      // 都不在，保持原相对顺序
      return 0;
    });
  }, [rawTables, tableOrder]);

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
    if (sourceAnalysis.hasExternal && sourceAnalysis.currentSource) {
      return {
        type: 'external',
        connectionId: sourceAnalysis.currentSource.id,
        connectionName: sourceAnalysis.currentSource.name,
        databaseType: sourceAnalysis.currentSource.type,
      };
    }
    return { type: 'duckdb' };
  }, [sourceAnalysis]);

  // 每个表的选中列
  const [selectedColumns, setSelectedColumns] = React.useState<Record<string, string[]>>({});

  // JOIN 配置（表之间的连接）
  const [joinConfigs, setJoinConfigs] = React.useState<JoinConfig[]>([]);

  // 筛选条件树（FilterBar）
  const [filterTree, setFilterTree] = React.useState<FilterGroup>(() => createEmptyGroup());

  // 获取每个表的列信息 - 使用 useTableColumns Hook
  // 为每个表单独调用 Hook（最多支持 10 个表）
  const table0Columns = useTableColumns(activeTables[0] || null);
  const table1Columns = useTableColumns(activeTables[1] || null);
  const table2Columns = useTableColumns(activeTables[2] || null);
  const table3Columns = useTableColumns(activeTables[3] || null);
  const table4Columns = useTableColumns(activeTables[4] || null);
  const table5Columns = useTableColumns(activeTables[5] || null);
  const table6Columns = useTableColumns(activeTables[6] || null);
  const table7Columns = useTableColumns(activeTables[7] || null);
  const table8Columns = useTableColumns(activeTables[8] || null);
  const table9Columns = useTableColumns(activeTables[9] || null);

  // 组合所有结果
  const tableColumnsResults = [
    table0Columns,
    table1Columns,
    table2Columns,
    table3Columns,
    table4Columns,
    table5Columns,
    table6Columns,
    table7Columns,
    table8Columns,
    table9Columns,
  ].slice(0, activeTables.length);

  // 计算加载和错误状态
  const isLoadingColumns = tableColumnsResults.some((result) => result.isLoading);
  const hasColumnErrors = tableColumnsResults.some((result) => result.isError);
  const columnErrorMessages = tableColumnsResults
    .filter((result) => result.isError && result.error)
    .map((result) => result.error?.message || '未知错误');

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

  // 构建可用列信息（用于 FilterBar）
  // 使用 tableColumnsMapKey 作为依赖以确保列加载后重新计算
  const availableColumns = React.useMemo((): ColumnInfo[] => {
    const columns: ColumnInfo[] = [];
    Object.entries(tableColumnsMap).forEach(([tableName, cols]) => {
      cols.forEach((col) => {
        columns.push({
          table: tableName,
          column: col.name,
          type: col.type,
        });
      });
    });
    // DEBUG: 打印可用列信息
    console.log('[JoinQueryPanel] availableColumns:', columns.length, 'columns from', Object.keys(tableColumnsMap).length, 'tables');
    console.log('[JoinQueryPanel] tableColumnsMap:', tableColumnsMap);
    return columns;
  }, [tableColumnsMap, tableColumnsMapKey]);

  // 计算活动表名的稳定 key
  const activeTableNamesKey = activeTables
    .filter((t) => t != null)
    .map(getTableName)
    .sort()
    .join(',');

  // 构建列对用于类型冲突检测
  const columnPairs = React.useMemo<ColumnPair[]>(() => {
    const pairs: ColumnPair[] = [];

    for (let i = 0; i < joinConfigs.length; i++) {
      const leftTable = activeTables[i];
      const rightTable = activeTables[i + 1];
      if (!leftTable || !rightTable) continue;

      const config = normalizeJoinConfig(joinConfigs[i]);
      const leftTableName = getTableName(leftTable);
      const rightTableName = getTableName(rightTable);
      const leftCols = tableColumnsMap[leftTableName] || [];
      const rightCols = tableColumnsMap[rightTableName] || [];

      for (const condition of config.conditions) {
        if (!condition.leftColumn || !condition.rightColumn) continue;

        const leftCol = leftCols.find(c => c.name === condition.leftColumn);
        const rightCol = rightCols.find(c => c.name === condition.rightColumn);

        pairs.push({
          leftLabel: leftTableName,
          leftColumn: condition.leftColumn,
          leftType: leftCol?.type || 'UNKNOWN',
          rightLabel: rightTableName,
          rightColumn: condition.rightColumn,
          rightType: rightCol?.type || 'UNKNOWN',
        });
      }
    }

    return pairs;
  }, [joinConfigs, activeTables, tableColumnsMap]);

  // 类型冲突检测和管理
  const {
    conflicts,
    hasConflicts,
    allResolved,
    unresolvedCount,
    resolveConflict,
    resolveAllWithRecommendations,
    resolvedTypes,
    getConflict,
  } = useTypeConflict(columnPairs);

  // 类型冲突对话框状态
  const [showTypeConflictDialog, setShowTypeConflictDialog] = React.useState(false);

  // 初始化选中列和 JOIN 配置
  // 注意：故意不将 selectedColumns/joinConfigs 放入依赖数组
  // 因为我们只想在表或列信息变化时初始化，而不是在用户修改选择时重新初始化
  // 使用函数式更新避免 stale closure 问题
  React.useEffect(() => {
    // 获取当前活动表名列表
    const activeTableNames = new Set(activeTables.map(getTableName));

    // 初始化选中列（默认全选）- 只对新表初始化，同时清理已移除表的列
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

    // 初始化 JOIN 配置 - 支持扩展和收缩
    setJoinConfigs((prev) => {
      const requiredLength = Math.max(0, activeTables.length - 1);

      // 如果表数量为 0 或 1，清空配置
      if (requiredLength === 0) {
        return prev.length === 0 ? prev : [];
      }

      // 收缩：如果当前配置多于需要的数量，截断
      if (prev.length > requiredLength) {
        return prev.slice(0, requiredLength);
      }

      // 扩展：如果当前配置少于需要的数量，添加新配置
      if (prev.length < requiredLength) {
        const newConfigs: JoinConfig[] = [...prev];
        for (let i = prev.length; i < requiredLength; i++) {
          // 尝试自动匹配 id 列
          const leftTableName = getTableName(activeTables[i]);
          const rightTableName = getTableName(activeTables[i + 1]);
          const leftCols = tableColumnsMap[leftTableName] || [];
          const rightCols = tableColumnsMap[rightTableName] || [];
          const leftIdCol = leftCols.find((c) => c.name.toLowerCase() === 'id')?.name || leftCols[0]?.name || '';
          const rightIdCol = rightCols.find((c) => c.name.toLowerCase() === 'id')?.name || rightCols[0]?.name || '';
          newConfigs.push({
            joinType: 'LEFT JOIN',
            conditions: [{
              leftColumn: leftIdCol,
              rightColumn: rightIdCol,
              operator: '=',
            }],
          });
        }
        return newConfigs;
      }

      // 数量相同，保持不变
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTableNamesKey, tableColumnsMapKey]);

  // 处理列选择切换 - 使用 tableName 作为参数以避免闭包问题
  const handleColumnToggle = React.useCallback((tableName: string, column: string) => {
    setSelectedColumns((prev) => {
      const current = prev[tableName] || [];
      if (current.includes(column)) {
        return { ...prev, [tableName]: current.filter((c) => c !== column) };
      } else {
        return { ...prev, [tableName]: [...current, column] };
      }
    });
  }, []);

  // 处理 JOIN 配置变更 - 使用 useCallback 稳定引用
  const handleJoinConfigChange = React.useCallback((index: number, config: JoinConfig) => {
    setJoinConfigs((prev) => {
      const newConfigs = [...prev];
      newConfigs[index] = config;
      return newConfigs;
    });
  }, []);

  // 处理移除表 - 使用 tableName 作为参数以避免闭包问题
  const handleRemoveTableByName = React.useCallback((tableName: string, table: SelectedTable) => {
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
    // 从排序列表中移除
    setTableOrder((prev) => prev.filter((t) => t !== tableName));
  }, [onRemoveTable]);

  // 处理交换表
  const handleSwapTables = React.useCallback((index: number) => {
    setTableOrder(prevOrder => {
      // 确保有当前的顺序列表
      let currentOrder = prevOrder.length > 0
        ? [...prevOrder]
        : activeTables.map(t => getTableName(t));

      // 补全可能缺失的表名
      if (currentOrder.length < activeTables.length) {
        const missing = activeTables.map(t => getTableName(t)).filter(n => !currentOrder.includes(n));
        currentOrder = [...currentOrder, ...missing];
      }

      // 交换
      if (index >= 0 && index < currentOrder.length - 1) {
        [currentOrder[index], currentOrder[index + 1]] = [currentOrder[index + 1], currentOrder[index]];

        // 重置该连接的配置
        // 注意：这里需要通过 side effect 更新 configs，或者在这里直接 setJoinConfigs
        // 由于 setState 是异步的，这里只返回新的 order，Config 更新放在下面
        return currentOrder;
      }
      return prevOrder;
    });

    // 必须同步更新 Config，否则会导致列匹配错误
    setJoinConfigs(prev => {
      const newConfigs = [...prev];
      // 重置为默认配置
      newConfigs[index] = {
        joinType: 'LEFT JOIN',
        conditions: [{ leftColumn: '', rightColumn: '', operator: '=' }]
      };
      return newConfigs;
    });
  }, [activeTables]);

  // 处理清空
  const handleClear = () => {
    if (onRemoveTable) {
      activeTables.forEach((t) => onRemoveTable(t));
    } else {
      setInternalTables([]);
    }
    setSelectedColumns({});
    setJoinConfigs([]);
  };

  // 计算 attach_databases（用于联邦查询）
  const attachDatabases = React.useMemo(() => {
    return extractAttachDatabases(activeTables);
  }, [activeTables]);

  // 检查是否所有 JOIN 配置都有有效的关联列
  const hasValidJoinConditions = React.useMemo(() => {
    if (activeTables.length < 2) return false;

    // 检查每个 JOIN 配置是否至少有一个有效条件
    for (let i = 0; i < activeTables.length - 1; i++) {
      const config = joinConfigs[i];
      if (!config) return false;

      const normalizedConfig = normalizeJoinConfig(config);
      const hasValidCondition = normalizedConfig.conditions.some((c) => {
        // 列模式需要列名，表达式模式需要表达式
        const leftValid = c.leftMode === 'expression'
          ? c.leftExpression?.trim()
          : c.leftColumn;
        const rightValid = c.rightMode === 'expression'
          ? c.rightExpression?.trim()
          : c.rightColumn;
        return leftValid && rightValid;
      });

      if (!hasValidCondition) return false;
    }

    return true;
  }, [activeTables.length, joinConfigs]);

  // 检查是否可以执行
  // 现在支持跨数据库联邦查询，但必须有有效的关联条件
  const canExecute = React.useMemo(() => {
    if (activeTables.length < 2) return false;
    if (!hasValidJoinConditions) return false;
    return true;
  }, [activeTables.length, hasValidJoinConditions]);

  // 生成 SQL
  const generateSQL = (): string | null => {
    if (activeTables.length === 0) return null;

    // 联邦查询使用 DuckDB 方言
    const dialect = 'duckdb';

    // 获取表引用（支持联邦查询的 alias.schema.table 格式）
    const getFullTableRef = (table: SelectedTable): string => {
      const ref = createTableReference(table, attachDatabases);
      return formatTableReference(ref, dialect);
    };

    // 获取表别名（用于列引用）
    const getTableAlias = (table: SelectedTable): string => {
      const ref = createTableReference(table, attachDatabases);
      // 对于外部表，使用数据库别名；对于 DuckDB 表，使用表名
      if (ref.isExternal && ref.alias) {
        // 外部表：使用 alias.table 或 alias.schema.table 的最后部分作为别名
        return ref.name;
      }
      return ref.name;
    };

    const parts: string[] = [];

    // 如果是联邦查询，添加注释说明数据库来源
    if (attachDatabases.length > 0) {
      parts.push(`-- 联邦查询: ${attachDatabases.map(db => db.alias).join(', ')}`);
      parts.push('');
    }

    // SELECT - 收集所有选中的列
    const selectParts: string[] = [];
    activeTables.forEach((table) => {
      const tableName = getTableName(table);
      const tableAlias = getTableAlias(table);
      const cols = selectedColumns[tableName] || [];
      cols.forEach((col) => {
        selectParts.push(`${quoteIdent(tableAlias, dialect)}.${quoteIdent(col, dialect)}`);
      });
    });
    if (selectParts.length === 0) {
      parts.push('SELECT *');
    } else {
      parts.push(`SELECT ${selectParts.join(', ')}`);
    }

    // FROM - 主表
    const firstTableRef = getFullTableRef(activeTables[0]);
    const firstTableAlias = getTableAlias(activeTables[0]);
    parts.push(`FROM ${firstTableRef} AS ${quoteIdent(firstTableAlias, dialect)}`);

    // JOIN - 其他表
    for (let i = 1; i < activeTables.length; i++) {
      const rawConfig = joinConfigs[i - 1];
      const leftTableName = getTableName(activeTables[i - 1]);
      const rightTableName = getTableName(activeTables[i]);
      const rightTableRef = getFullTableRef(activeTables[i]);
      const leftTableAlias = getTableAlias(activeTables[i - 1]);
      const rightTableAlias = getTableAlias(activeTables[i]);

      // 如果没有配置，使用默认的 LEFT JOIN
      const config = rawConfig ? normalizeJoinConfig(rawConfig) : {
        joinType: 'LEFT JOIN' as JoinType,
        conditions: [{
          leftColumn: tableColumnsMap[leftTableName]?.[0]?.name || '',
          rightColumn: tableColumnsMap[rightTableName]?.[0]?.name || '',
          operator: '=' as const,
        }],
      };

      // 生成多条件 ON 子句
      // 验证条件：列模式需要列名，表达式模式需要表达式
      const validConditions = config.conditions.filter((c) => {
        const leftValid = c.leftMode === 'expression'
          ? c.leftExpression?.trim()
          : c.leftColumn;
        const rightValid = c.rightMode === 'expression'
          ? c.rightExpression?.trim()
          : c.rightColumn;
        return leftValid && rightValid;
      });

      if (validConditions.length > 0) {
        const onClause = validConditions
          .map((c) => {
            // 生成左侧引用
            let leftRef: string;
            if (c.leftMode === 'expression' && c.leftExpression?.trim()) {
              // 表达式模式：直接使用用户输入的表达式
              leftRef = c.leftExpression.trim();
            } else {
              // 列模式：使用表别名.列名
              leftRef = `${quoteIdent(leftTableAlias, dialect)}.${quoteIdent(c.leftColumn, dialect)}`;
            }

            // 生成右侧引用
            let rightRef: string;
            if (c.rightMode === 'expression' && c.rightExpression?.trim()) {
              rightRef = c.rightExpression.trim();
            } else {
              rightRef = `${quoteIdent(rightTableAlias, dialect)}.${quoteIdent(c.rightColumn, dialect)}`;
            }

            // 检查是否有类型冲突需要 TRY_CAST（仅对列模式生效）
            if (c.leftMode !== 'expression' && c.rightMode !== 'expression') {
              const conflictKey = generateConflictKey(
                leftTableName,
                c.leftColumn,
                rightTableName,
                c.rightColumn
              );
              const castType = resolvedTypes[conflictKey];
              if (castType) {
                return `TRY_CAST(${leftRef} AS ${castType}) ${c.operator} TRY_CAST(${rightRef} AS ${castType})`;
              }
            }

            return `${leftRef} ${c.operator} ${rightRef}`;
          })
          .join(' AND ');
        parts.push(`${config.joinType} ${rightTableRef} AS ${quoteIdent(rightTableAlias, dialect)} ON ${onClause}`);

        // 附加用户在 FilterBar 中设置的 ON 条件（placement='on' 的筛选条件）
        // 使用树结构保留 AND/OR 逻辑
        const tableOnTree = getOnConditionsTreeForTable(filterTree, rightTableName);
        if (tableOnTree.children.length > 0) {
          const additionalOnSQL = generateFilterSQL(tableOnTree);
          if (additionalOnSQL) {
            // 更新最后一个 parts 条目，追加 AND 条件
            parts[parts.length - 1] = parts[parts.length - 1] + ' AND ' + additionalOnSQL;
            console.log('[JoinQueryPanel] generateSQL appended ON conditions for', rightTableName, ':', additionalOnSQL);
          }
        }
      } else {
        // 即使没有有效条件，也生成 JOIN 子句（使用 CROSS JOIN 或带空条件的 JOIN）
        // 这样用户可以看到 JOIN 结构并手动选择条件
        const tableOnTree = getOnConditionsTreeForTable(filterTree, rightTableName);
        if (tableOnTree.children.length > 0) {
          // 有筛选器中的 ON 条件，使用它们作为 ON 子句（保留 AND/OR 逻辑）
          const additionalOnSQL = generateFilterSQL(tableOnTree);
          if (additionalOnSQL) {
            parts.push(`${config.joinType} ${rightTableRef} AS ${quoteIdent(rightTableAlias, dialect)} ON ${additionalOnSQL}`);
          } else {
            parts.push(`${config.joinType} ${rightTableRef} AS ${quoteIdent(rightTableAlias, dialect)} ON 1=1 /* 请选择关联条件 */`);
          }
        } else {
          // 没有任何 ON 条件，使用 1=1
          parts.push(`${config.joinType} ${rightTableRef} AS ${quoteIdent(rightTableAlias, dialect)} ON 1=1 /* 请选择关联条件 */`);
        }
      }
    }

    // WHERE - 生成筛选条件
    // onConditions 已在 JOIN 循环前声明，这里直接使用

    // 使用移除了 ON 条件的树生成 WHERE 子句
    const whereOnlyTree = cloneTreeWithoutOnConditions(filterTree);
    console.log('[JoinQueryPanel] generateSQL whereOnlyTree:', JSON.stringify(whereOnlyTree));
    const whereClause = generateFilterSQL(whereOnlyTree);
    console.log('[JoinQueryPanel] generateSQL whereClause:', whereClause);
    if (whereClause && whereClause.trim()) {
      parts.push(`WHERE ${whereClause}`);
    }

    // 使用配置的 max_query_rows 而不是硬编码的 1000
    parts.push(`LIMIT ${maxQueryRows}`);
    return parts.join('\n');
  };

  // 联邦查询错误状态
  const [federatedError, setFederatedError] = React.useState<{
    type: string;
    message: string;
    connectionName?: string;
  } | null>(null);

  // 执行查询
  const handleExecute = async () => {
    // 如果有未解决的类型冲突，打开对话框
    if (hasConflicts && !allResolved) {
      setShowTypeConflictDialog(true);
      return;
    }

    const sql = generateSQL();
    if (!sql || !canExecute) return;

    if (!onExecute) return;

    setIsExecuting(true);
    setFederatedError(null);

    try {
      // 构建数据源信息
      const source: TableSource = attachDatabases.length > 0
        ? {
          type: 'federated',
          attachDatabases,
        }
        : tableSource || { type: 'duckdb' };

      // 通过统一的 onExecute 回调执行查询
      await onExecute(sql, source);
    } catch (error) {
      // 解析联邦查询错误
      const parsedError = parseFederatedQueryError(error as Error);
      setFederatedError({
        type: parsedError.type,
        message: parsedError.message,
        connectionName: parsedError.connectionName,
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const sql = generateSQL();

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface">
      {/* 头部工具栏 */}
      <div className="h-12 px-6 border-b border-border shrink-0 flex items-center justify-between bg-muted/20">
        <div className="flex items-center gap-3">
          <GitMerge className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{t('query.join.title', '关联查询')}</span>
          <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded">
            {t('query.join.hint', '双击左侧数据源添加表')}
          </span>
          {/* 附加数据库指示器 */}
          {attachDatabases.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Badge variant="outline" className="text-primary border-primary/50 cursor-help">
                      <Link2 className="w-3 h-3 mr-1" />
                      {t('query.join.attachedDatabases', '{{count}} 个外部数据库', { count: attachDatabases.length })}
                    </Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="text-xs space-y-1">
                    <div className="font-medium mb-1">{t('query.join.attachedDatabasesTitle', '将连接的数据库:')}</div>
                    {attachDatabases.map((db) => (
                      <div key={db.connectionId} className="flex items-center gap-2">
                        <span className="text-muted-foreground">{db.alias}</span>
                      </div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={activeTables.length === 0}
            className="text-muted-foreground"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            {t('query.join.clear', '清空')}
          </Button>
          <Button
            size="sm"
            onClick={handleExecute}
            disabled={!canExecute || isExecuting}
            className="gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            {t('query.execute', '执行')}
          </Button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-6">
        {/* 联邦查询错误提示 */}
        {federatedError && (
          <Alert className="mb-4 border-error/50 bg-error/10">
            <AlertTriangle className="h-4 w-4 text-error" />
            <AlertDescription className="text-error">
              {federatedError.connectionName
                ? t('query.join.federatedError', '连接 {{name}} 失败: {{message}}', {
                  name: federatedError.connectionName,
                  message: federatedError.message,
                })
                : federatedError.message
              }
            </AlertDescription>
          </Alert>
        )}

        {/* 列信息加载错误提示 */}
        {hasColumnErrors && columnErrorMessages.length > 0 && (
          <Alert className="mb-4 border-warning/50 bg-warning/10">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertDescription className="text-warning">
              {t('query.join.columnLoadWarning', '部分表的列信息加载失败，可能影响查询结果。')}
            </AlertDescription>
          </Alert>
        )}

        {/* 联邦查询提示 */}
        {sourceAnalysis.hasExternal && attachDatabases.length > 0 && (
          <Alert className="mb-4 border-primary/50 bg-primary/10">
            <Link2 className="h-4 w-4 text-primary" />
            <AlertDescription className="text-primary">
              {t(
                'query.join.federatedQueryInfo',
                '此查询将连接 {{count}} 个外部数据库进行联邦查询。',
                { count: attachDatabases.length }
              )}
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
                    isPrimary={index === 0}
                    columns={columns}
                    selectedColumns={selectedColumns[tableName] || []}
                    onColumnToggle={(col) => handleColumnToggle(tableName, col)}
                    onRemove={() => handleRemoveTableByName(tableName, table)}
                    isLoading={columnResult?.isLoading}
                    isError={columnResult?.isError}
                    isEmpty={columnResult?.isEmpty}
                  />
                  {/* JOIN 连接器 */}
                  {index < activeTables.length - 1 && (
                    <MemoizedJoinConnector
                      index={index}
                      leftTable={tableName}
                      rightTable={getTableName(activeTables[index + 1])}
                      leftColumns={columns}
                      rightColumns={tableColumnsMap[getTableName(activeTables[index + 1])] || []}
                      config={joinConfigs[index] || { joinType: 'LEFT JOIN', conditions: [] }}
                      onConfigChange={handleJoinConfigChange}
                      onSwap={handleSwapTables}
                    />
                  )}
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* 筛选条件栏 (FilterBar) */}
        {activeTables.length > 0 && (
          <FilterBar
            filterTree={filterTree}
            onFilterChange={setFilterTree}
            availableColumns={availableColumns}
            disabled={isExecuting}
            enableDragDrop
          />
        )}

        {/* SQL 预览 */}
        {sql && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <span className="text-primary">SQL</span>
                {t('query.sqlPreview', '预览')}
                {/* 类型冲突指示器 */}
                {hasConflicts && (
                  <Badge
                    variant={allResolved ? 'success' : 'warning'}
                    className="text-xs cursor-pointer"
                    onClick={() => setShowTypeConflictDialog(true)}
                  >
                    {allResolved
                      ? t('query.typeConflict.allResolvedShort', '类型已转换')
                      : `${unresolvedCount} ${t('query.typeConflict.conflicts', '个类型冲突')}`}
                  </Badge>
                )}
              </label>
              <button
                className="text-xs text-primary hover:underline"
                onClick={() => navigator.clipboard.writeText(sql)}
              >
                {t('common.copy', '复制')}
              </button>
            </div>
            <SQLHighlight sql={sql} minHeight="120px" maxHeight="300px" />
          </div>
        )}
      </div>

      {/* 类型冲突解决对话框 */}
      <TypeConflictDialog
        open={showTypeConflictDialog}
        conflicts={conflicts}
        onResolve={resolveConflict}
        onResolveAll={resolveAllWithRecommendations}
        onClose={() => setShowTypeConflictDialog(false)}
        onConfirm={() => {
          setShowTypeConflictDialog(false);
          // 冲突已解决，继续执行查询
          handleExecute();
        }}
        sqlPreview={sql || undefined}
      />
    </div>
  );
};

export default JoinQueryPanel;
