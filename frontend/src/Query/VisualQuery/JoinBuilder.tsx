import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTableColumns } from '@/hooks/useTableColumns';
import { useDuckDBTables } from '@/hooks/useDuckDBTables';
import type { JoinConfig, JoinType } from './QueryBuilder';

// JOIN 类型选项
const JOIN_TYPES: { value: JoinType; label: string; description: string }[] = [
  { value: 'INNER', label: 'INNER JOIN', description: '仅返回匹配的行' },
  { value: 'LEFT', label: 'LEFT JOIN', description: '返回左表所有行' },
  { value: 'RIGHT', label: 'RIGHT JOIN', description: '返回右表所有行' },
  { value: 'FULL', label: 'FULL JOIN', description: '返回两表所有行' },
];

export interface JoinBuilderProps {
  /** 主表名 */
  tableName: string | null;
  /** JOIN 配置列表 */
  joins: JoinConfig[];
  /** JOIN 配置变更回调 */
  onJoinsChange: (joins: JoinConfig[]) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * JOIN 构建器组件
 *
 * 支持多表关联，支持 INNER/LEFT/RIGHT/FULL JOIN
 */
export const JoinBuilder: React.FC<JoinBuilderProps> = ({
  tableName,
  joins,
  onJoinsChange,
  disabled = false,
  className,
}) => {
  const { t } = useTranslation('common');

  // 获取所有表列表
  const { tables } = useDuckDBTables();

  // 获取主表的列信息 - 使用统一的 useTableColumns Hook
  const { columns: rawMainColumns } = useTableColumns(tableName || null);

  // 转换为组件期望的格式
  const mainColumns = useMemo(() => 
    (rawMainColumns || []).map(col => ({ column_name: col.name, data_type: col.type })),
    [rawMainColumns]
  );

  // 过滤掉主表，获取可用的关联表
  const availableTables = useMemo(() => {
    return tables.filter((t) => t.name !== tableName);
  }, [tables, tableName]);

  // 生成唯一 ID
  const generateId = () =>
    `join_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  // 添加 JOIN
  const handleAddJoin = useCallback(() => {
    const newJoin: JoinConfig = {
      id: generateId(),
      joinType: 'LEFT',
      targetTable: availableTables[0]?.name || '',
      sourceColumn: mainColumns[0]?.column_name || '',
      targetColumn: '',
    };
    onJoinsChange([...joins, newJoin]);
  }, [joins, availableTables, mainColumns, onJoinsChange]);

  // 删除 JOIN
  const handleRemoveJoin = useCallback(
    (id: string) => {
      onJoinsChange(joins.filter((j) => j.id !== id));
    },
    [joins, onJoinsChange]
  );

  // 更新 JOIN
  const handleUpdateJoin = useCallback(
    (id: string, updates: Partial<JoinConfig>) => {
      onJoinsChange(joins.map((j) => (j.id === id ? { ...j, ...updates } : j)));
    },
    [joins, onJoinsChange]
  );

  // 无表选择时的提示
  if (!tableName) {
    return (
      <div
        className={cn(
          'flex items-center justify-center h-40 text-muted-foreground',
          className
        )}
      >
        <p className="text-sm">
          {t('query.join.selectTableFirst', '请先选择一个主表')}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* 标题和添加按钮 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          <span className="font-medium">
            {t('query.join.title', '表关联')}
          </span>
          <span className="text-xs text-muted-foreground">({joins.length})</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddJoin}
          disabled={disabled || availableTables.length === 0}
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('query.join.addJoin', '添加关联')}
        </Button>
      </div>

      {/* 主表信息 */}
      <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
        <div className="text-sm">
          <span className="text-muted-foreground">
            {t('query.join.mainTable', '主表')}:
          </span>{' '}
          <span className="font-medium">{tableName}</span>
        </div>
      </div>

      {/* JOIN 列表 */}
      <div className="space-y-3">
        {joins.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-muted-foreground border border-dashed border-border rounded-md">
            <p className="text-sm">
              {t('query.join.noJoins', '暂无表关联')}
            </p>
          </div>
        ) : (
          joins.map((join) => (
            <JoinRow
              key={join.id}
              join={join}
              mainTableName={tableName}
              mainColumns={mainColumns}
              availableTables={availableTables}
              onUpdate={(updates) => handleUpdateJoin(join.id, updates)}
              onRemove={() => handleRemoveJoin(join.id)}
              disabled={disabled}
            />
          ))
        )}
      </div>

      {/* 提示信息 */}
      {joins.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t(
            'query.join.hint',
            '提示：关联后可以在列选择中选择关联表的列'
          )}
        </p>
      )}
    </div>
  );
};

// 单个 JOIN 行
interface JoinRowProps {
  join: JoinConfig;
  mainTableName: string;
  mainColumns: Array<{ column_name: string; data_type: string }>;
  availableTables: Array<{ name: string }>;
  onUpdate: (updates: Partial<JoinConfig>) => void;
  onRemove: () => void;
  disabled: boolean;
}

const JoinRow: React.FC<JoinRowProps> = ({
  join,
  mainTableName,
  mainColumns,
  availableTables,
  onUpdate,
  onRemove,
  disabled,
}) => {
  const { t } = useTranslation('common');

  // 获取目标表的列信息 - 使用统一的 useTableColumns Hook
  const { columns: rawTargetColumns } = useTableColumns(join.targetTable || null);

  // 转换为组件期望的格式
  const targetColumns = useMemo(() => 
    (rawTargetColumns || []).map(col => ({ column_name: col.name, data_type: col.type })),
    [rawTargetColumns]
  );

  // 当目标表变化时，重置目标列
  const handleTargetTableChange = (newTable: string) => {
    onUpdate({ targetTable: newTable, targetColumn: '' });
  };

  return (
    <div className="p-4 bg-surface border border-border rounded-lg space-y-3">
      {/* JOIN 类型选择 */}
      <div className="flex items-center gap-2">
        <Select
          value={join.joinType}
          onValueChange={(value: JoinType) => onUpdate({ joinType: value })}
          disabled={disabled}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {JOIN_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                <div>
                  <div className="font-medium">{type.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {type.description}
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 目标表选择 */}
        <Select
          value={join.targetTable}
          onValueChange={handleTargetTableChange}
          disabled={disabled}
        >
          <SelectTrigger className="flex-1">
            <SelectValue
              placeholder={t('query.join.selectTargetTable', '选择关联表')}
            />
          </SelectTrigger>
          <SelectContent>
            {availableTables.map((table) => (
              <SelectItem key={table.name} value={table.name}>
                {table.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 删除按钮 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled}
          className="shrink-0 text-muted-foreground hover:text-error"
          aria-label={t('query.join.removeJoin', '删除关联')}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* 关联条件 */}
      <div className="flex items-center gap-2 pl-4">
        <span className="text-sm text-muted-foreground">ON</span>

        {/* 主表列 */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">{mainTableName}.</span>
          <Select
            value={join.sourceColumn}
            onValueChange={(value) => onUpdate({ sourceColumn: value })}
            disabled={disabled}
          >
            <SelectTrigger className="w-36">
              <SelectValue
                placeholder={t('query.join.selectColumn', '选择列')}
              />
            </SelectTrigger>
            <SelectContent>
              {mainColumns.map((col) => (
                <SelectItem key={col.column_name} value={col.column_name}>
                  {col.column_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="text-sm">=</span>

        {/* 目标表列 */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">
            {join.targetTable || '?'}.
          </span>
          <Select
            value={join.targetColumn}
            onValueChange={(value) => onUpdate({ targetColumn: value })}
            disabled={disabled || !join.targetTable}
          >
            <SelectTrigger className="w-36">
              <SelectValue
                placeholder={t('query.join.selectColumn', '选择列')}
              />
            </SelectTrigger>
            <SelectContent>
              {targetColumns.map((col: { column_name: string; data_type: string }) => (
                <SelectItem key={col.column_name} value={col.column_name}>
                  {col.column_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default JoinBuilder;
