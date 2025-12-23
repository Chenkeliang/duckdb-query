/**
 * 异步任务发起对话框
 * 
 * 用于提交异步查询任务，支持自定义表名和联邦查询
 */

import React, { useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertCircle, Info, Database } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/new/components/ui/button';
import { Input } from '@/new/components/ui/input';
import { Label } from '@/new/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/new/components/ui/dialog';
import {
  Alert,
  AlertDescription,
} from '@/new/components/ui/alert';
import { submitAsyncQuery } from '@/services/apiClient';

// 异步任务查询 key
const ASYNC_TASKS_QUERY_KEY = ['async-tasks'] as const;

/** 附加数据库配置 */
export interface AttachDatabase {
  alias: string;
  connectionId: string;
  connectionName?: string;
}

export interface AsyncTaskDialogProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onOpenChange: (open: boolean) => void;
  /** SQL 语句 */
  sql: string;
  /** 数据源信息（可选，用于外部数据库查询） */
  datasource?: {
    id: string;
    type: string;
    name?: string;
  };
  /** 需要附加的外部数据库列表（联邦查询） */
  attachDatabases?: AttachDatabase[];
  /** 提交成功回调 */
  onSuccess?: (taskId: string) => void;
}

/**
 * 表名校验规则
 * - 只能包含字母、数字、下划线
 * - 不能以数字开头
 * - 最大 64 字符
 */
function validateTableName(name: string): { valid: boolean; error?: string } {
  if (!name || !name.trim()) {
    return { valid: true }; // 空表名是允许的（使用自动生成）
  }

  const trimmed = name.trim();

  if (trimmed.length > 64) {
    return { valid: false, error: '表名最多 64 个字符' };
  }

  if (/^\d/.test(trimmed)) {
    return { valid: false, error: '表名不能以数字开头' };
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    return { valid: false, error: '表名只能包含字母、数字和下划线' };
  }

  // 检查保留字（简化版）
  const reservedWords = ['select', 'from', 'where', 'table', 'create', 'drop', 'insert', 'update', 'delete'];
  if (reservedWords.includes(trimmed.toLowerCase())) {
    return { valid: false, error: '表名不能使用 SQL 保留字' };
  }

  return { valid: true };
}

/**
 * 截断 SQL 显示
 */
function truncateSQL(sql: string, maxLength: number = 200): string {
  const singleLine = sql.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) return singleLine;
  return singleLine.substring(0, maxLength) + '...';
}

/**
 * 异步任务发起对话框
 */
export const AsyncTaskDialog: React.FC<AsyncTaskDialogProps> = ({
  open,
  onOpenChange,
  sql,
  datasource,
  attachDatabases,
  onSuccess,
}) => {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();

  // 表单状态
  const [customTableName, setCustomTableName] = useState('');
  const [tableNameError, setTableNameError] = useState<string | undefined>();

  // 是否为联邦查询
  const isFederatedQuery = attachDatabases && attachDatabases.length > 0;

  // 重置表单
  useEffect(() => {
    if (open) {
      setCustomTableName('');
      setTableNameError(undefined);
    }
  }, [open]);

  // 表名校验
  const handleTableNameChange = useCallback((value: string) => {
    setCustomTableName(value);
    const validation = validateTableName(value);
    setTableNameError(validation.error);
  }, []);

  // 提交异步任务
  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload: {
        sql: string;
        custom_table_name?: string;
        task_type: string;
        datasource?: { id: string; type: string; name?: string };
        attach_databases?: Array<{ alias: string; connection_id: string }>;
      } = {
        sql,
        task_type: 'query',
      };

      if (customTableName.trim()) {
        payload.custom_table_name = customTableName.trim();
      }

      if (datasource) {
        payload.datasource = datasource;
      }

      // 添加联邦查询的附加数据库配置
      if (attachDatabases && attachDatabases.length > 0) {
        payload.attach_databases = attachDatabases.map(db => ({
          alias: db.alias,
          connection_id: db.connectionId,
        }));
      }

      return submitAsyncQuery(payload);
    },
    onSuccess: (response) => {
      toast.success(t('async.submitSuccess', '异步任务已提交'));
      queryClient.invalidateQueries({ queryKey: ASYNC_TASKS_QUERY_KEY });
      onOpenChange(false);
      onSuccess?.(response.task_id);
    },
    onError: (error: Error) => {
      toast.error(t('async.submitFailed', '提交失败: {{message}}', { message: error.message }));
    },
  });

  // 提交处理
  const handleSubmit = useCallback(() => {
    // 校验表名
    const validation = validateTableName(customTableName);
    if (!validation.valid) {
      setTableNameError(validation.error);
      return;
    }

    submitMutation.mutate();
  }, [customTableName, submitMutation]);

  // 是否可以提交
  const canSubmit = !tableNameError && sql.trim().length > 0 && !submitMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('async.dialog.title', '提交异步任务')}</DialogTitle>
          <DialogDescription>
            {t('async.dialog.description', '异步任务将在后台执行，结果保存到 DuckDB 表中')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* SQL 预览 */}
          <div className="space-y-2">
            <Label>{t('async.dialog.sql', 'SQL 语句')}</Label>
            <div className="p-3 bg-muted rounded-md">
              <code className="text-xs font-mono text-muted-foreground break-all">
                {truncateSQL(sql)}
              </code>
            </div>
          </div>

          {/* 数据源信息 */}
          {datasource && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {t('async.dialog.externalSource', '数据来自外部数据库: {{name}} ({{type}})', {
                  name: datasource.name || datasource.id,
                  type: datasource.type,
                })}
              </AlertDescription>
            </Alert>
          )}

          {/* 联邦查询附加数据库列表 */}
          {isFederatedQuery && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                {t('async.dialog.attachedDatabases', '附加的外部数据库')}
              </Label>
              <div className="p-3 bg-muted rounded-md space-y-1">
                {attachDatabases!.map((db, index) => (
                  <div key={index} className="text-sm flex items-center gap-2">
                    <span className="font-mono text-primary">{db.alias}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-muted-foreground">
                      {db.connectionName || db.connectionId}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('async.dialog.federatedQueryHint', '这些数据库将在查询执行期间临时附加')}
              </p>
            </div>
          )}

          {/* 自定义表名 */}
          <div className="space-y-2">
            <Label htmlFor="tableName">
              {t('async.dialog.tableName', '结果表名')}
              <span className="text-muted-foreground text-xs ml-2">
                ({t('async.dialog.tableNameOptional', '可选')})
              </span>
            </Label>
            <Input
              id="tableName"
              placeholder={t('async.dialog.tableNamePlaceholder', '留空则自动生成')}
              value={customTableName}
              onChange={(e) => handleTableNameChange(e.target.value)}
              className={tableNameError ? 'border-destructive' : ''}
            />
            {tableNameError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {tableNameError}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t('async.dialog.tableNameHint', '表名只能包含字母、数字和下划线，不能以数字开头')}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitMutation.isPending}
          >
            {t('actions.cancel', '取消')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {submitMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {t('async.dialog.submit', '提交任务')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AsyncTaskDialog;
