import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Table2, Play, Plus, Trash2, GripVertical, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDuckDBTables } from '@/hooks/useDuckDBTables';
import { useDataSources } from '@/hooks/useDataSources';
import { useTableColumns } from '@/hooks/useTableColumns';
import { useAppConfig } from '@/hooks/useAppConfig';
import type { SelectedTable, SelectedTableObject } from '@/types/SelectedTable';
import {
  normalizeSelectedTable,
  getTableName,
  DATABASE_TYPE_ICONS,
  isSameTable,
} from '@/utils/tableUtils';
import { getDialectFromSource, quoteIdent, quoteQualifiedTable } from '@/utils/sqlUtils';
import { SQLHighlight } from '@/components/SQLHighlight';

/**
 * 透视表面板
 * 
 * 功能：
 * - 选择数据源表
 * - 配置行字段（GROUP BY）
 * - 配置列字段（PIVOT）
 * - 配置值字段（聚合函数）
 * - 生成并执行 SQL
 * - 支持外部数据库表
 */

type AggFunction = 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX';

interface ValueField {
  id: string;
  column: string;
  aggFunction: AggFunction;
}

// 使用统一的 TableSource 类型
import type { TableSource } from '@/hooks/useQueryWorkspace';
export type { TableSource };

interface PivotTablePanelProps {
  selectedTables?: SelectedTable[];
  onExecute?: (sql: string, source?: TableSource) => Promise<void>;
}

const AGG_FUNCTIONS: { value: AggFunction; label: string }[] = [
  { value: 'SUM', label: 'SUM (求和)' },
  { value: 'COUNT', label: 'COUNT (计数)' },
  { value: 'AVG', label: 'AVG (平均值)' },
  { value: 'MIN', label: 'MIN (最小值)' },
  { value: 'MAX', label: 'MAX (最大值)' },
];

export const PivotTablePanel: React.FC<PivotTablePanelProps> = ({ selectedTables = [], onExecute }) => {
  const { t } = useTranslation('common');
  const { tables: duckdbTables } = useDuckDBTables();
  const { dataSources } = useDataSources();
  const { maxQueryRows } = useAppConfig();
  const [isExecuting, setIsExecuting] = React.useState(false);

  // 数据源表（支持新旧格式）
  const [sourceTable, setSourceTable] = React.useState<SelectedTable | null>(null);
  const sourceTableRef = React.useRef<SelectedTable | null>(null);
  sourceTableRef.current = sourceTable;

  const selectedPrimaryRef = React.useRef<SelectedTable | null>(null);
  selectedPrimaryRef.current = selectedTables[0] ?? null;

  const getTableKey = React.useCallback((table: SelectedTable): string => {
    const normalized = normalizeSelectedTable(table);
    if (normalized.source === 'external') {
      return `external:${normalized.connection?.id ?? ''}:${normalized.schema ?? ''}:${normalized.name}`;
    }
    return `duckdb:${normalized.schema ?? ''}:${normalized.name}`;
  }, []);

  const getTableOptionValue = React.useCallback((table: SelectedTable): string => {
    const normalized = normalizeSelectedTable(table);
    if (normalized.source === 'external' && normalized.connection) {
      return `external:${normalized.connection.id}:${normalized.schema ?? ''}:${normalized.name}`;
    }
    return `duckdb:${normalized.schema ?? ''}:${normalized.name}`;
  }, []);

  const resetConfig = React.useCallback(() => {
    setRowFields([]);
    setColumnField('');
    setValueFields([]);
  }, []);

  // 与工作台的全局选表同步（首个表作为当前数据源表）
  const selectedPrimaryKey = React.useMemo(() => {
    if (selectedTables.length === 0) return null;
    return getTableKey(selectedTables[0]);
  }, [getTableKey, selectedTables]);

  React.useEffect(() => {
    if (!selectedPrimaryKey) {
      setSourceTable(null);
      resetConfig();
      return;
    }

    const next = selectedPrimaryRef.current;
    if (!next) return;

    // 避免因为引用变化导致重复重置
    const current = sourceTableRef.current;
    if (current && isSameTable(current, next)) return;

    setSourceTable(next);
    resetConfig();
  }, [selectedPrimaryKey, resetConfig]);

  // 分析当前表的来源
  const tableSource = React.useMemo((): TableSource | undefined => {
    if (!sourceTable) return undefined;

    const normalized = normalizeSelectedTable(sourceTable);
    if (normalized.source === 'external' && normalized.connection) {
      return {
        type: 'external',
        connectionId: normalized.connection.id,
        connectionName: normalized.connection.name,
        databaseType: normalized.connection.type,
      };
    }
    return { type: 'duckdb' };
  }, [sourceTable]);

  // 是否为外部表
  const isExternal = tableSource?.type === 'external';

  // 获取所有可用表
  interface TableOption {
    value: string;
    label: string;
    table: SelectedTable;
    isExternal: boolean;
    connectionName?: string;
    databaseType?: string;
  }

  const allTables = React.useMemo(() => {
    const result: TableOption[] = [];
    const seen = new Set<string>();

    const pushOption = (table: SelectedTable, label: string) => {
      const value = getTableOptionValue(table);
      if (seen.has(value)) return;
      seen.add(value);

      const normalized = normalizeSelectedTable(table);
      result.push({
        value,
        label,
        table,
        isExternal: normalized.source === 'external',
        connectionName: normalized.connection?.name,
        databaseType: normalized.connection?.type,
      });
    };

    // DuckDB 表
    duckdbTables.forEach((table) => {
      pushOption(table.name, table.name);
    });

    // 外部数据库表
    dataSources?.forEach((ds: any) => {
      if (ds.type === 'database' && ds.tables) {
        ds.tables.forEach((table: { name: string; schema?: string }) => {
          const dbType = ds.subtype || ds.dbType || 'mysql';
          const icon = DATABASE_TYPE_ICONS[dbType as keyof typeof DATABASE_TYPE_ICONS] || '📊';
          const selectedTable: SelectedTableObject = {
            name: table.name,
            source: 'external',
            connection: {
              id: ds.id,
              name: ds.name,
              type: dbType as 'mysql' | 'postgresql' | 'sqlite',
            },
            schema: table.schema,
          };
          pushOption(selectedTable, `${icon} ${table.name} (${ds.name})`);
        });
      }
    });

    // 兜底：确保当前工作台选中的表可显示（即使不在列表中）
    selectedTables.forEach((table) => {
      const normalized = normalizeSelectedTable(table);
      const label =
        normalized.source === 'external' && normalized.connection
          ? `${DATABASE_TYPE_ICONS[normalized.connection.type] || '📊'} ${normalized.schema ? `${normalized.schema}.` : ''}${normalized.name} (${normalized.connection.name})`
          : normalized.name;
      pushOption(table, label);
    });

    return result;
  }, [duckdbTables, dataSources, getTableOptionValue, selectedTables]);

  // 行字段（GROUP BY）
  const [rowFields, setRowFields] = React.useState<string[]>([]);

  // 列字段（PIVOT）
  const [columnField, setColumnField] = React.useState<string>('');

  // 值字段
  const [valueFields, setValueFields] = React.useState<ValueField[]>([]);

  // 获取表的列信息 - 使用统一的 useTableColumns Hook
  const tableName = sourceTable ? getTableName(sourceTable) : '';
  const { columns: tableColumns, isLoading: isLoadingColumns, isError: hasColumnError, isEmpty: hasEmptyColumns } = useTableColumns(sourceTable || null);

  const columns = tableColumns || [];

  // 获取列字段的 distinct 值（用于透视）
  const MAX_PIVOT_VALUES = 20;
  const { data: distinctValues, isLoading: isLoadingDistinct } = useQuery({
    queryKey: ['pivot-distinct-values', tableName, columnField, isExternal ? tableSource?.connectionId : 'duckdb'],
    queryFn: async () => {
      if (!columnField || !tableName) return { values: [], hasMore: false };

      // TODO: 对于外部表，需要调用不同的 API
      if (isExternal) {
        return { values: [], hasMore: false };
      }

      // 查询 distinct 值（限制数量 + 1 来检测是否超过阈值）
      const { executeDuckDBSQL } = await import('@/api');
      const normalized = normalizeSelectedTable(sourceTable!);
      const fullTableName = quoteQualifiedTable(
        { name: normalized.name, schema: normalized.schema },
        'duckdb'
      );

      const quotedColumn = quoteIdent(columnField, 'duckdb');
      const sql = `SELECT DISTINCT ${quotedColumn} FROM ${fullTableName} ORDER BY ${quotedColumn} LIMIT ${MAX_PIVOT_VALUES + 1}`;
      const result = await executeDuckDBSQL(sql);

      const values = (result?.data || []).map((row: any) => row[columnField]);
      const hasMore = values.length > MAX_PIVOT_VALUES;

      return {
        values: hasMore ? values.slice(0, MAX_PIVOT_VALUES) : values,
        hasMore,
      };
    },
    enabled: !!columnField && !!tableName && !isExternal,
    staleTime: 5 * 60 * 1000,
  });

  // 透视值警告
  const pivotWarning = React.useMemo(() => {
    if (distinctValues?.hasMore) {
      return t('query.pivot.tooManyValues', `列字段 "${columnField}" 的唯一值超过 ${MAX_PIVOT_VALUES} 个，只显示前 ${MAX_PIVOT_VALUES} 个`);
    }
    return null;
  }, [distinctValues, columnField, t]);

  // 生成唯一 ID
  const generateId = () => `value_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // 添加行字段
  const handleAddRowField = (column: string) => {
    if (!rowFields.includes(column)) {
      setRowFields([...rowFields, column]);
    }
  };

  // 删除行字段
  const handleRemoveRowField = (column: string) => {
    setRowFields(rowFields.filter(f => f !== column));
  };

  // 添加值字段
  const handleAddValueField = () => {
    const newField: ValueField = {
      id: generateId(),
      column: '',
      aggFunction: 'SUM',
    };
    setValueFields([...valueFields, newField]);
  };

  // 删除值字段
  const handleRemoveValueField = (id: string) => {
    setValueFields(valueFields.filter(f => f.id !== id));
  };

  // 更新值字段
  const handleUpdateValueField = (id: string, updates: Partial<ValueField>) => {
    setValueFields(valueFields.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  // 重置表选择时清空配置
  const handleTableChange = (value: string) => {
    const selected = allTables.find((t) => t.value === value);
    if (selected) {
      setSourceTable(selected.table);
    } else {
      setSourceTable(null);
    }
    resetConfig();
  };

  // 生成 SQL（使用 CASE WHEN 实现透视）
  const generateSQL = (): string | null => {
    if (!sourceTable || rowFields.length === 0 || valueFields.length === 0) {
      return null;
    }

    const dialect = getDialectFromSource(tableSource);

    // 获取表名（支持外部表的 schema）
    const getFullTableName = (): string => {
      const normalized = normalizeSelectedTable(sourceTable);
      return quoteQualifiedTable(
        { name: normalized.name, schema: normalized.schema },
        dialect
      );
    };

    const selectParts: string[] = [];

    // 行字段
    rowFields.forEach((field) => {
      selectParts.push(quoteIdent(field, dialect));
    });

    // 如果有列字段和 distinct 值，使用 CASE WHEN 透视
    if (columnField && distinctValues?.values && distinctValues.values.length > 0) {
      const pivotColumn = quoteIdent(columnField, dialect);
      // 为每个 distinct 值生成 CASE WHEN 表达式
      valueFields.forEach((vf) => {
        if (vf.column) {
          const valueColumn = quoteIdent(vf.column, dialect);
          distinctValues.values.forEach((pivotValue: any) => {
            // 处理 null 值
            const valueStr = pivotValue === null ? 'NULL' : String(pivotValue);
            const safeAlias = valueStr.replace(/[^a-zA-Z0-9_]/g, '_');
            const condition =
              pivotValue === null
                ? `${pivotColumn} IS NULL`
                : `${pivotColumn} = '${String(pivotValue).replace(/'/g, "''")}'`;

            const alias = `${vf.aggFunction}_${vf.column}_${safeAlias}`;
            selectParts.push(
              `${vf.aggFunction}(CASE WHEN ${condition} THEN ${valueColumn} END) AS ${quoteIdent(alias, dialect)}`
            );
          });
        }
      });
    } else {
      // 没有列字段时，简单聚合
      valueFields.forEach((vf) => {
        if (vf.column) {
          const valueColumn = quoteIdent(vf.column, dialect);
          const alias = `${vf.aggFunction}_${vf.column}`;
          selectParts.push(`${vf.aggFunction}(${valueColumn}) AS ${quoteIdent(alias, dialect)}`);
        }
      });
    }

    const parts: string[] = [];
    parts.push(`SELECT ${selectParts.join(',\n       ')}`);
    parts.push(`FROM ${getFullTableName()}`);
    parts.push(`GROUP BY ${rowFields.map((f) => quoteIdent(f, dialect)).join(', ')}`);
    parts.push(`ORDER BY ${rowFields.map((f) => quoteIdent(f, dialect)).join(', ')}`);
    parts.push(`LIMIT ${maxQueryRows}`);

    return parts.join('\n');
  };

  // 执行查询
  const handleExecute = async () => {
    const sql = generateSQL();
    if (!sql || !onExecute) return;

    setIsExecuting(true);
    try {
      await onExecute(sql, tableSource);
    } finally {
      setIsExecuting(false);
    }
  };

  const sql = generateSQL();

  // 可用于行/列字段的列（排除已选择的）
  const availableColumns = columns.filter(
    (col) => !rowFields.includes(col.name) && col.name !== columnField
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface">
      {/* 头部工具栏 */}
      {/* 头部工具栏 - 单行紧凑布局 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0 bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleExecute}
              disabled={!sql || isExecuting}
              className="gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {t('query.execute', '执行')}
            </Button>

            <div className="w-[1px] h-4 bg-border mx-1" />

            <Button
              variant="ghost"
              size="sm"
              onClick={resetConfig}
              disabled={!sourceTable || (rowFields.length === 0 && !columnField && valueFields.length === 0)}
              className="text-muted-foreground hover:text-foreground gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('common.clear', '清空')}
            </Button>
          </div>

        </div>

        <div className="flex items-center gap-2">
          {/* 标题 - 移至右侧 */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-background/50 text-xs text-muted-foreground">
            <Table2 className="w-3.5 h-3.5" />
            <span>{t('query.pivot.title', '透视表')}</span>
          </div>

          {/* 外部数据库指示器 */}
          {isExternal && tableSource && (
            <Badge variant="outline" className="text-warning border-warning/50 text-[10px] h-5 px-1.5 gap-1">
              <span className="opacity-70">{DATABASE_TYPE_ICONS[tableSource.databaseType as keyof typeof DATABASE_TYPE_ICONS] || '📊'}</span>
              {tableSource.connectionName}
            </Badge>
          )}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* 数据源选择 */}
          <div className="bg-muted/30 border border-border rounded-xl p-6">
            <h3 className="text-base font-semibold mb-4">{t('query.pivot.dataSource', '数据源')}</h3>
            <Select
              value={sourceTable ? getTableOptionValue(sourceTable) : ''}
              onValueChange={handleTableChange}
            >
              <SelectTrigger className="w-full max-w-md">
                <SelectValue placeholder={t('query.pivot.selectTable', '选择数据表')} />
              </SelectTrigger>
              <SelectContent>
                {allTables.map((tableOption) => (
                  <SelectItem key={tableOption.value} value={tableOption.value}>
                    {tableOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 外部表列信息提示 */}
          {isExternal && (
            <Alert className="border-muted bg-muted/30">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              <AlertDescription className="text-muted-foreground">
                {t(
                  'query.pivot.externalNotSupported',
                  '外部数据库表暂不支持透视表。请先将外部表导入到 DuckDB 后再使用透视表功能。'
                )}
              </AlertDescription>
            </Alert>
          )}

          {sourceTable && (
            <>
              {/* 行字段配置 */}
              <div className="bg-muted/30 border border-border rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold">{t('query.pivot.rowFields', '行字段')}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('query.pivot.rowFieldsHint', '选择用于分组的字段')}
                    </p>
                  </div>
                </div>

                {/* 已选择的行字段 */}
                {rowFields.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {rowFields.map(field => (
                      <div
                        key={field}
                        className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg"
                      >
                        <GripVertical className="w-3 h-3 text-muted-foreground" />
                        <span className="text-sm">{field}</span>
                        <button
                          onClick={() => handleRemoveRowField(field)}
                          className="text-muted-foreground hover:text-error"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 添加行字段 */}
                <Select onValueChange={handleAddRowField} value="">
                  <SelectTrigger className="w-full max-w-md">
                    <SelectValue placeholder={t('query.pivot.addRowField', '添加行字段')} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableColumns.map((col) => (
                      <SelectItem key={col.name} value={col.name}>
                        {col.name} ({col.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 列字段配置（透视列） */}
              <div className="bg-muted/30 border border-border rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold">{t('query.pivot.columnField', '列字段（透视）')}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('query.pivot.columnFieldHint', '选择用于透视的字段，其唯一值将成为新的列')}
                    </p>
                  </div>
                </div>

                <Select
                  value={columnField || '__NO_COLUMN__'}
                  onValueChange={(val) => setColumnField(val === '__NO_COLUMN__' ? '' : val)}
                >
                  <SelectTrigger className="w-full max-w-md">
                    <SelectValue placeholder={t('query.pivot.selectColumnField', '选择列字段（可选）')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NO_COLUMN__">
                      {t('query.pivot.noColumnField', '不使用透视列')}
                    </SelectItem>
                    {availableColumns.map((col) => (
                      <SelectItem key={col.name} value={col.name}>
                        {col.name} ({col.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* 透视值预览 */}
                {columnField && (
                  <div className="mt-4">
                    {isLoadingDistinct ? (
                      <p className="text-xs text-muted-foreground">{t('common.loading', '加载中...')}</p>
                    ) : distinctValues?.values && distinctValues.values.length > 0 ? (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">
                          {t('query.pivot.distinctValues', '唯一值预览')}：
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {distinctValues.values.map((value: any, index: number) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {value === null ? 'NULL' : String(value)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t('query.pivot.noDistinctValues', '无唯一值')}</p>
                    )}

                    {/* 警告：值过多 */}
                    {pivotWarning && (
                      <div className="mt-2 p-2 bg-warning/10 border border-warning/30 rounded text-xs text-warning">
                        {pivotWarning}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 值字段配置 */}
              <div className="bg-muted/30 border border-border rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold">{t('query.pivot.valueFields', '值字段')}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('query.pivot.valueFieldsHint', '选择要聚合的数值字段')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddValueField}
                    className="gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('query.pivot.addValue', '添加')}
                  </Button>
                </div>

                {valueFields.length === 0 ? (
                  <div className="flex items-center justify-center h-20 text-muted-foreground border border-dashed border-border rounded-lg">
                    <p className="text-sm">{t('query.pivot.noValues', '暂无值字段，点击上方按钮添加')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {valueFields.map(vf => (
                      <div key={vf.id} className="flex items-center gap-3 p-3 bg-surface border border-border rounded-lg">
                        <Select
                          value={vf.aggFunction}
                          onValueChange={(value: AggFunction) => handleUpdateValueField(vf.id, { aggFunction: value })}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AGG_FUNCTIONS.map(fn => (
                              <SelectItem key={fn.value} value={fn.value}>
                                {fn.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select
                          value={vf.column}
                          onValueChange={(value) => handleUpdateValueField(vf.id, { column: value })}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder={t('query.pivot.selectColumn', '选择列')} />
                          </SelectTrigger>
                          <SelectContent>
                            {columns.map((col) => (
                              <SelectItem key={col.name} value={col.name}>
                                {col.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveValueField(vf.id)}
                          className="shrink-0 text-muted-foreground hover:text-error"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* SQL 预览 */}
          {sql && (
            <div className="bg-muted/30 border border-border rounded-xl p-6">
              <h3 className="text-base font-semibold mb-4">{t('query.sqlPreview', 'SQL 预览')}</h3>
              <SQLHighlight sql={sql} minHeight="120px" maxHeight="300px" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PivotTablePanel;
