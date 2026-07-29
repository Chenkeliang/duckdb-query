/**
 * 异步任务发起对话框
 * 
 * 用于提交异步查询任务，支持自定义表名和联邦查询
 */

import React, { useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertCircle, Database } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SQLHighlight } from '@/components/SQLHighlight';
import { submitAsyncQuery, toAttachDatabasesPayload, type CreateTaskRequest, type DataSource } from '@/api';
import { showSuccessToast, handleApiErrorToast } from '@/utils/toastHelpers';

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
  // 行数范围以当前选择为准:默认忽略页面最外层 LIMIT;勾选后保留或补系统默认值。
  const [applyRowLimit, setApplyRowLimit] = useState(false);

  // 是否为联邦查询
  const isFederatedQuery = attachDatabases && attachDatabases.length > 0;

  // 重置表单(组件常驻挂载,重开须显式复位;否则上次勾的"限制行数"会残留到下个查询,复审)
  useEffect(() => {
    if (open) {
      setCustomTableName('');
      setTableNameError(undefined);
      setApplyRowLimit(false);
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
      const payload: CreateTaskRequest = {
        sql,
        task_type: 'query',
        apply_row_limit: applyRowLimit,
      };

      if (customTableName.trim()) {
        payload.custom_table_name = customTableName.trim();
      }

      if (datasource) {
        payload.datasource = {
          id: datasource.id,
          type: datasource.type as DataSource['type'],
          name: datasource.name,
        };
      }

      const attachPayload = toAttachDatabasesPayload(attachDatabases);
      if (attachPayload) {
        payload.attach_databases = attachPayload;
      }

      return submitAsyncQuery(payload);
    },
    onSuccess: (response) => {
      showSuccessToast(t, 'TASK_SUBMITTED', t('async.submitSuccess', '异步任务已提交'));
      queryClient.invalidateQueries({ queryKey: ASYNC_TASKS_QUERY_KEY });
      onOpenChange(false);
      onSuccess?.(response.task_id);
    },
    onError: (error: Error) => {
      handleApiErrorToast(t, error, t('async.submitFailed', '提交失败'));
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
        <DialogHeader className="flex-row flex-wrap items-baseline gap-x-2 gap-y-1 space-y-0">
          <DialogTitle>{t('async.dialog.title', '提交异步任务')}</DialogTitle>
          <DialogDescription>
            {t('async.dialog.description', '后台执行 · 结果保存为 DuckDB 表')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* SQL 预览 */}
          <Accordion type="single" collapsible>
            <AccordionItem value="sql-preview" className="border-0">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                {t('async.dialog.sql', 'SQL 语句')}
              </AccordionTrigger>
              <AccordionContent className="pb-0">
                <SQLHighlight
                  sql={sql}
                  compact
                  minHeight="4rem"
                  maxHeight="6rem"
                  scrollable
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* 数据源信息 */}
          {(datasource || isFederatedQuery) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border px-3 py-2 text-xs">
              <Database className="h-4 w-4 text-muted-foreground" />
              {datasource && (
                <>
                  <span className="font-medium text-foreground">
                    {datasource.name || datasource.id}
                  </span>
                  <span className="text-muted-foreground">{datasource.type.toUpperCase()}</span>
                </>
              )}
              {datasource && isFederatedQuery && (
                <span className="text-muted-foreground">·</span>
              )}
              {isFederatedQuery && (
                <>
                  <span className="text-muted-foreground">
                    {t('async.dialog.attachedDatabases', '附加数据库')}:
                  </span>
                  {attachDatabases!.map((db) => (
                    <span key={`${db.alias}-${db.connectionId}`} className="whitespace-nowrap">
                      <span className="font-mono text-primary">{db.alias}</span>
                      <span className="mx-1 text-muted-foreground">→</span>
                      <span className="text-foreground">
                        {db.connectionName || db.connectionId}
                      </span>
                    </span>
                  ))}
                </>
              )}
            </div>
          )}

          {/* 自定义表名 */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <Label htmlFor="tableName">
                {t('async.dialog.tableName', '结果表名')}
                <span className="ml-2 text-xs text-muted-foreground">
                  ({t('async.dialog.tableNameOptional', '可选')})
                </span>
              </Label>
              <span className="text-xs text-muted-foreground">
                {t('async.dialog.tableNameHint', '字母或 _ 开头；仅限字母、数字、_；最多 64 字符')}
              </span>
            </div>
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
          </div>

          {/* 行数范围以当前选择为准:默认忽略外层 LIMIT;勾选后保留或补默认值 */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Checkbox
              id="applyRowLimit"
              checked={applyRowLimit}
              onCheckedChange={(v) => setApplyRowLimit(v === true)}
            />
            <Label htmlFor="applyRowLimit" className="cursor-pointer whitespace-nowrap">
              {t('async.dialog.limitRows', '限制行数')}
            </Label>
            <p className="min-w-0 text-xs text-muted-foreground">
              {applyRowLimit
                ? t('async.dialog.rowLimitLimited', '限制结果行数：保留 SQL 最外层 LIMIT；未设置时限制为 10,000 行')
                : t('async.dialog.rowLimitFull', '不限结果行数：移除 SQL 最外层 LIMIT，保留子查询 LIMIT')}
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
