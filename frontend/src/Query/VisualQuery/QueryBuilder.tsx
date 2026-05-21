import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Eye, RotateCcw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { TableSelector } from './TableSelector';
import { ColumnSelector } from './ColumnSelector';
import { FilterBuilder } from './FilterBuilder';
import { AggregationBuilder } from './AggregationBuilder';
import { SortBuilder } from './SortBuilder';
import { JoinBuilder } from './JoinBuilder';
import type { SelectedTable } from '@/types/SelectedTable';
import { getTableName, DATABASE_TYPE_ICONS } from '@/utils/tableUtils';
import { getSourceFromSelectedTable } from '@/utils/sqlUtils';

// 查询配置类型
export interface QueryConfig {
  /** 选中的表（支持新旧格式） */
  table: SelectedTable | null;
  columns: string[];
  joins: JoinConfig[];
  filters: FilterConfig[];
  aggregations: AggregationConfig[];
  groupBy: string[];
  orderBy: SortConfig[];
  limit?: number;
}

// 过滤条件类型
export interface FilterConfig {
  id: string;
  column: string;
  operator: FilterOperator;
  value: string | number | null;
  value2?: string | number; // BETWEEN 操作符的第二个值
  logicOperator: 'AND' | 'OR';
}

// 过滤操作符
export type FilterOperator =
  | '='
  | '!='
  | '>'
  | '<'
  | '>='
  | '<='
  | 'LIKE'
  | 'ILIKE'
  | 'IS NULL'
  | 'IS NOT NULL'
  | 'BETWEEN'
  | 'IN';

// 聚合配置类型
export interface AggregationConfig {
  id: string;
  column: string;
  function: AggregateFunction;
  alias?: string;
}

// 聚合函数
export type AggregateFunction =
  | 'SUM'
  | 'AVG'
  | 'COUNT'
  | 'MIN'
  | 'MAX'
  | 'COUNT_DISTINCT';

// 排序配置类型
export interface SortConfig {
  id: string;
  column: string;
  direction: 'ASC' | 'DESC';
}

// JOIN 类型
export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';

// JOIN 配置类型
export interface JoinConfig {
  id: string;
  joinType: JoinType;
  targetTable: string;
  sourceColumn: string;
  targetColumn: string;
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

/** 与查询工作台一致的表源（含联邦 ATTACH） */
export type { TableSource } from '@/hooks/useQueryWorkspace';
import type { TableSource } from '@/hooks/useQueryWorkspace';

export interface QueryBuilderProps {
  /** 初始查询配置 */
  initialConfig?: Partial<QueryConfig>;
  /** 外部选中的表（从数据源面板选择） */
  selectedTable?: SelectedTable | null;
  /** 查询配置变更回调 */
  onConfigChange?: (config: QueryConfig) => void;
  /** 执行查询回调 */
  onExecute?: (config: QueryConfig, source?: TableSource) => void;
  /** 预览 SQL 回调 */
  onPreview?: (config: QueryConfig, source?: TableSource) => void;
  /** 是否正在执行 */
  isExecuting?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 查询构建器主组件
 * 
 * 提供可视化查询构建界面，支持表选择、列选择、过滤、聚合、排序
 * 
 * @example
 * ```tsx
 * <QueryBuilder
 *   onExecute={(config) => executeQuery(config)}
 *   onPreview={(config) => previewSQL(config)}
 * />
 * ```
 */
export const QueryBuilder: React.FC<QueryBuilderProps> = ({
  initialConfig,
  selectedTable,
  onConfigChange,
  onExecute,
  onPreview,
  isExecuting = false,
  className,
}) => {
  const { t } = useTranslation('common');
  const [config, setConfig] = useState<QueryConfig>({
    ...initialQueryConfig,
    ...initialConfig,
  });

  // 响应外部表选择变化
  React.useEffect(() => {
    if (selectedTable) {
      const selectedName = getTableName(selectedTable);
      const currentName = config.table ? getTableName(config.table) : null;
      if (selectedName !== currentName) {
        const newConfig = {
          ...config,
          table: selectedTable,
          columns: [],
          joins: [],
          filters: [],
          aggregations: [],
          groupBy: [],
          orderBy: [],
        };
        setConfig(newConfig);
        onConfigChange?.(newConfig);
      }
    }
  }, [selectedTable]); // 只依赖 selectedTable，避免循环
  const [activeTab, setActiveTab] = useState('basic');

  // 分析当前表的来源
  const tableSource = useMemo((): TableSource | undefined => {
    if (!config.table) return undefined;
    return getSourceFromSelectedTable(config.table);
  }, [config.table]);

  const isExternal = tableSource?.type === 'external' || tableSource?.type === 'federated';
  const externalJoinBlocked = isExternal && config.joins.length > 0;

  // 更新配置
  const updateConfig = useCallback(
    (updates: Partial<QueryConfig>) => {
      const newConfig = { ...config, ...updates };
      setConfig(newConfig);
      onConfigChange?.(newConfig);
    },
    [config, onConfigChange]
  );

  // 表选择变更
  const handleTableSelect = useCallback(
    (table: SelectedTable) => {
      // 切换表时清空列选择
      updateConfig({
        table,
        columns: [],
        joins: [],
        filters: [],
        aggregations: [],
        groupBy: [],
        orderBy: [],
      });
    },
    [updateConfig]
  );

  // 列选择变更
  const handleColumnsChange = useCallback(
    (columns: string[]) => {
      updateConfig({ columns });
    },
    [updateConfig]
  );

  // 过滤条件变更
  const handleFiltersChange = useCallback(
    (filters: FilterConfig[]) => {
      updateConfig({ filters });
    },
    [updateConfig]
  );

  // 聚合配置变更
  const handleAggregationsChange = useCallback(
    (aggregations: AggregationConfig[]) => {
      updateConfig({ aggregations });
    },
    [updateConfig]
  );

  // GROUP BY 变更
  const handleGroupByChange = useCallback(
    (groupBy: string[]) => {
      updateConfig({ groupBy });
    },
    [updateConfig]
  );

  // 排序变更
  const handleOrderByChange = useCallback(
    (orderBy: SortConfig[]) => {
      updateConfig({ orderBy });
    },
    [updateConfig]
  );

  // JOIN 变更
  const handleJoinsChange = useCallback(
    (joins: JoinConfig[]) => {
      updateConfig({ joins });
    },
    [updateConfig]
  );

  // 重置查询
  const handleReset = useCallback(() => {
    setConfig(initialQueryConfig);
    onConfigChange?.(initialQueryConfig);
  }, [onConfigChange]);

  // 执行查询
  const handleExecute = useCallback(() => {
    if (config.table && config.columns.length > 0 && !externalJoinBlocked) {
      onExecute?.(config, tableSource);
    }
  }, [config, externalJoinBlocked, onExecute, tableSource]);

  const handlePreview = useCallback(() => {
    if (config.table && !externalJoinBlocked) {
      onPreview?.(config, tableSource);
    }
  }, [config, externalJoinBlocked, onPreview, tableSource]);

  const canExecute =
    !!config.table &&
    config.columns.length > 0 &&
    !externalJoinBlocked;

  // 获取表名用于子组件
  const tableName = config.table ? getTableName(config.table) : null;

  return (
    <Card className={cn('h-full flex flex-col', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">
              {t('query.builder.title', '可视化查询')}
            </CardTitle>
            {/* 外部数据库指示器 */}
            {isExternal && tableSource && (
              <Badge variant="outline" className="text-warning border-warning/50">
                {DATABASE_TYPE_ICONS[tableSource.databaseType as keyof typeof DATABASE_TYPE_ICONS] || '📊'}{' '}
                {tableSource.connectionName}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isExecuting}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              {t('actions.reset', '重置')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreview}
              disabled={!config.table || isExecuting}
            >
              <Eye className="h-4 w-4 mr-1" />
              {t('query.builder.preview', '预览 SQL')}
            </Button>
            <Button
              size="sm"
              onClick={handleExecute}
              disabled={!canExecute || isExecuting}
            >
              <Play className="h-4 w-4 mr-1" />
              {isExecuting
                ? t('query.sql.executing', '执行中...')
                : t('query.builder.execute', '执行查询')}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="basic">
              {t('query.builder.tabBasic', '基础')}
            </TabsTrigger>
            <TabsTrigger value="join" disabled={!config.table || isExternal}>
              {t('query.builder.tabJoin', '关联')}
            </TabsTrigger>
            <TabsTrigger value="filter" disabled={!config.table}>
              {t('query.builder.tabFilter', '过滤')}
            </TabsTrigger>
            <TabsTrigger value="aggregate" disabled={!config.table}>
              {t('query.builder.tabAggregate', '聚合')}
            </TabsTrigger>
            <TabsTrigger value="sort" disabled={!config.table}>
              {t('query.builder.tabSort', '排序')}
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto mt-4">
            {/* 基础标签页：表选择和列选择 */}
            <TabsContent value="basic" className="h-full space-y-4 mt-0">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {t('query.builder.selectTable', '选择表')}
                </label>
                <TableSelector
                  selectedTable={config.table}
                  onTableSelect={handleTableSelect}
                  disabled={isExecuting}
                />
              </div>

              {/* 外部表警告 */}
              {isExternal && (
                <Alert className="border-border bg-muted/30">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <AlertDescription className="text-muted-foreground">
                    {t(
                      'query.builder.externalFederatedHint',
                      '外部表将通过联邦查询（ATTACH）执行。可视化 JOIN 暂不支持，请使用 SQL 或连接查询。'
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {externalJoinBlocked && (
                <Alert variant="destructive">
                  <AlertDescription>
                    {t(
                      'query.builder.externalJoinBlocked',
                      '外部表不支持在可视化构建器中添加 JOIN，请清空关联配置或改用 SQL 面板。'
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {tableName && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {t('query.builder.selectColumns', '选择列')}
                  </label>
                  <ColumnSelector
                    tableName={tableName}
                    selectedColumns={config.columns}
                    onColumnsChange={handleColumnsChange}
                    disabled={isExecuting}
                  />
                </div>
              )}
            </TabsContent>

            {/* 关联标签页 */}
            <TabsContent value="join" className="h-full mt-0">
              {isExternal ? (
                <Alert className="border-warning/50 bg-warning/10">
                  <AlertDescription className="text-muted-foreground">
                    {t(
                      'query.builder.externalJoinTabDisabled',
                      '外部表请在 SQL 或连接查询中配置 JOIN。'
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <JoinBuilder
                  tableName={tableName}
                  joins={config.joins}
                  onJoinsChange={handleJoinsChange}
                  disabled={isExecuting}
                />
              )}
            </TabsContent>

            <TabsContent value="filter" className="h-full mt-0">
              <FilterBuilder
                tableName={tableName}
                filters={config.filters}
                onFiltersChange={handleFiltersChange}
                disabled={isExecuting}
              />
            </TabsContent>

            <TabsContent value="aggregate" className="h-full mt-0">
              <AggregationBuilder
                tableName={tableName}
                aggregations={config.aggregations}
                groupBy={config.groupBy}
                onAggregationsChange={handleAggregationsChange}
                onGroupByChange={handleGroupByChange}
                disabled={isExecuting}
              />
            </TabsContent>

            <TabsContent value="sort" className="h-full mt-0">
              <SortBuilder
                tableName={tableName}
                orderBy={config.orderBy}
                onOrderByChange={handleOrderByChange}
                disabled={isExecuting}
              />
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default QueryBuilder;
