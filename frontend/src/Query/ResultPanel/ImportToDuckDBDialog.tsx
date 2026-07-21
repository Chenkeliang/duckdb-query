/**
 * 导入到 DuckDB 对话框组件
 * 
 * 允许用户将外部数据库查询结果导入到 DuckDB 中
 */

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SQLHighlight } from '@/components/SQLHighlight';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { showSuccessToast, showErrorToast } from '@/utils/toastHelpers';
import { invalidateAfterTableCreate } from '@/utils/cacheInvalidation';
import { saveQueryToDuckDB, toAttachDatabasesPayload } from '@/api';
import type { TableSource } from '@/hooks/useQueryWorkspace';

export interface ImportToDuckDBDialogProps {
  /** 对话框是否打开 */
  open: boolean;
  /** 关闭对话框回调 */
  onOpenChange: (open: boolean) => void;
  /** 要导入的 SQL */
  sql: string;
  /** 数据源信息 */
  source?: TableSource;
  /** 默认表名 */
  defaultTableName?: string;
}

/**
 * 验证表名是否有效
 * 只允许字母、数字和下划线，且必须以字母或下划线开头
 */
const validateTableName = (name: string): { valid: boolean; error?: string } => {
  if (!name || !name.trim()) {
    return { valid: false, error: 'Table name cannot be empty' };
  }
  
  const trimmed = name.trim();
  
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    return { 
      valid: false, 
      error: 'Table name can only contain letters, numbers and underscores, and must start with a letter or underscore' 
    };
  }
  
  if (trimmed.length > 64) {
    return { valid: false, error: 'Table name cannot exceed 64 characters' };
  }
  
  return { valid: true };
};

/**
 * 生成默认表名
 */
const generateDefaultTableName = (source?: TableSource): string => {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  if (source?.connectionName) {
    const safeName = source.connectionName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    return `imported_${safeName}_${timestamp}`;
  }
  return `imported_data_${timestamp}`;
};

export const ImportToDuckDBDialog: React.FC<ImportToDuckDBDialogProps> = ({
  open,
  onOpenChange,
  sql,
  source,
  defaultTableName,
}) => {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  
  const [tableName, setTableName] = useState(
    defaultTableName || generateDefaultTableName(source)
  );
  const [isImporting, setIsImporting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  // 行数范围:默认全量落表(保存查询结果本就应落全量);勾选则限制。始终保留用户自己写的 LIMIT。
  const [applyRowLimit, setApplyRowLimit] = useState(false);

  // 验证表名
  const handleTableNameChange = useCallback((value: string) => {
    setTableName(value);
    const validation = validateTableName(value);
    setValidationError(validation.valid ? null : validation.error || null);
  }, []);

  // 执行导入
  const handleImport = useCallback(async () => {
    if (!source || source.type !== 'federated') {
      showErrorToast(t, 'INVALID_REQUEST', t('query.import.externalOnly', 'Only external database query results can be imported to DuckDB'));
      return;
    }

    if (!source.connectionId) {
      showErrorToast(t, 'INVALID_REQUEST', t('query.import.missingConnection', 'Missing external database connection info'));
      return;
    }

    const validation = validateTableName(tableName);
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid table name');
      return;
    }

    setIsImporting(true);
    try {
      const datasource = {
        // Ensure ID doesn't have db_ prefix
        id: source.connectionId?.replace(/^db_/, '') || source.connectionId,
        type: source.databaseType as 'mysql' | 'postgresql' | 'sqlite' | 'duckdb' | 'file',
      };

      const attachDatabases = toAttachDatabasesPayload(source.attachDatabases);

      const result = await saveQueryToDuckDB(
        sql,
        datasource,
        tableName.trim(),
        null,
        attachDatabases,
        applyRowLimit
      );

      if (!result.success) {
        throw new Error(result.message || 'Import failed');
      }

      await invalidateAfterTableCreate(queryClient);

      showSuccessToast(
        t,
        result.messageCode || 'TABLE_CREATED',
        t('query.import.success', { 
          defaultValue: 'Data successfully imported to table "{{tableName}}"',
          tableName,
        })
      );

      onOpenChange(false);
    } catch (error) {
      console.error('Import failed:', error);
      const errorMessage = (error as Error).message;
      showErrorToast(
        t,
        error as Error,
        t('query.import.error', { 
          defaultValue: 'Import failed: {{message}}',
          message: errorMessage
        })
      );
    } finally {
      setIsImporting(false);
    }
  }, [tableName, sql, source, queryClient, onOpenChange, t, applyRowLimit]);

  // 仅在对话框打开瞬间重置：弹窗开着时 source/defaultTableName 引用变化
  // （如后台任务轮询触发的父级重渲染）不应清掉用户已输入的表名
  React.useEffect(() => {
    if (open) {
      setTableName(defaultTableName || generateDefaultTableName(source));
      setValidationError(null);
      setIsImporting(false);
      setApplyRowLimit(false); // 常驻挂载,重开须复位(否则上次的"限制行数"残留,复审)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {t('query.import.title', '导入到 DuckDB')}
          </DialogTitle>
          <DialogDescription>
            {t('query.import.description', '将查询结果保存为 DuckDB 表，以便进行进一步分析')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 数据源信息 */}
          {source && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">{t('query.import.source', '数据来源')}:</span>{' '}
              <span className="text-foreground">
                {source.databaseType?.toUpperCase()} - {source.connectionName}
              </span>
            </div>
          )}

          {/* 表名输入 */}
          <div className="space-y-2">
            <Label htmlFor="tableName">
              {t('query.import.tableName', '表名')}
            </Label>
            <Input
              id="tableName"
              value={tableName}
              onChange={(e) => handleTableNameChange(e.target.value)}
              placeholder={t('query.import.tableNamePlaceholder', '输入表名')}
              disabled={isImporting}
              className={validationError ? 'border-destructive' : ''}
            />
            {validationError && (
              <p className="text-sm text-destructive">{validationError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {t('query.import.tableNameHint', '表名只能包含字母、数字和下划线')}
            </p>
          </div>

          {/* 行数范围:默认全量落表;勾选则限制。任何情况下都保留用户自己写的 LIMIT */}
          <div className="flex items-start gap-2">
            <Checkbox
              id="importApplyRowLimit"
              checked={applyRowLimit}
              onCheckedChange={(v) => setApplyRowLimit(v === true)}
              disabled={isImporting}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="importApplyRowLimit" className="cursor-pointer">
                {t('query.import.limitRows', '限制行数')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('query.import.limitRowsHint', '默认落全部行;勾选则限制到系统预览上限。无论如何都保留你在 SQL 里写的 LIMIT')}
              </p>
            </div>
          </div>

          {/* SQL 预览 */}
          <div className="space-y-2">
            <Label>{t('query.import.sqlPreview', 'SQL 预览')}</Label>
            <SQLHighlight
              sql={sql.length > 200 ? `${sql.slice(0, 200)}...` : sql}
              compact
              minHeight="4rem"
              maxHeight="6rem"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isImporting}
          >
            {t('common.cancel', '取消')}
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || !!validationError || !tableName.trim()}
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('query.import.importing', '导入中...')}
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {t('query.import.import', '导入')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportToDuckDBDialog;
