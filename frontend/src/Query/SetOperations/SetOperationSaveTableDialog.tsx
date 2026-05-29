/**
 * 集合运算保存为 DuckDB 表
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  cancelSyncQuery,
  executeSetOperation,
  type SetOperationRequestPayload,
} from '@/api';
import { invalidateAfterTableCreate } from '@/utils/cacheInvalidation';
import { showSuccessToast, handleApiErrorToast } from '@/utils/toastHelpers';

function validateTableName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: '表名不能为空' };
  }
  if (trimmed.length > 64) {
    return { valid: false, error: '表名最多 64 个字符' };
  }
  if (/^\d/.test(trimmed)) {
    return { valid: false, error: '表名不能以数字开头' };
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
    return { valid: false, error: '表名只能包含字母、数字和下划线' };
  }
  return { valid: true };
}

export interface SetOperationSaveTableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getPayload: () => SetOperationRequestPayload | null;
  defaultTableName?: string;
  onSuccess?: (tableName: string) => void;
}

export const SetOperationSaveTableDialog: React.FC<SetOperationSaveTableDialogProps> = ({
  open,
  onOpenChange,
  getPayload,
  defaultTableName = 'set_op_result',
  onSuccess,
}) => {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const [tableName, setTableName] = useState(defaultTableName);
  const [tableNameError, setTableNameError] = useState<string | undefined>();
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (open) {
      setTableName(defaultTableName);
      setTableNameError(undefined);
    }
  }, [open, defaultTableName]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const base = getPayload();
      if (!base) {
        throw new Error(t('query.set.saveNoConfig', '请先配置至少两张表'));
      }
      const validation = validateTableName(tableName);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      const requestId = crypto.randomUUID();
      requestIdRef.current = requestId;
      return executeSetOperation(
        {
          ...base,
          preview: false,
          save_as_table: tableName.trim(),
          include_metadata: false,
        },
        { requestId }
      );
    },
    onSuccess: (result) => {
      const saved = result.saved_table ?? result.table_alias ?? tableName.trim();
      showSuccessToast(
        t,
        'TABLE_CREATED',
        t('query.set.savedToTable', '已保存到表 {{table}}（{{count}} 行）', {
          table: saved,
          count: result.row_count ?? 0,
        })
      );
      void invalidateAfterTableCreate(queryClient);
      onOpenChange(false);
      onSuccess?.(saved);
    },
    onError: (error: Error) => {
      handleApiErrorToast(t, error, t('query.set.saveFailed', '保存为表失败'));
    },
  });

  const handleTableNameChange = useCallback((value: string) => {
    setTableName(value);
    const validation = validateTableName(value);
    setTableNameError(validation.valid ? undefined : validation.error);
  }, []);

  const handleSubmit = useCallback(() => {
    const validation = validateTableName(tableName);
    if (!validation.valid) {
      setTableNameError(validation.error);
      return;
    }
    saveMutation.mutate();
  }, [tableName, saveMutation]);

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && saveMutation.isPending && requestIdRef.current) {
        void cancelSyncQuery(requestIdRef.current);
        requestIdRef.current = null;
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, saveMutation.isPending]
  );

  const canSubmit =
    getPayload() != null && !tableNameError && tableName.trim() && !saveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {t('query.set.saveTableTitle', '保存集合运算结果为表')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'query.set.saveTableDescription',
              '在 DuckDB 中创建新表并写入完整集合运算结果（无行数预览限制）。'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label>{t('query.set.tableName', '表名')}</Label>
          <Input
            value={tableName}
            onChange={(e) => handleTableNameChange(e.target.value)}
            placeholder="set_op_result"
          />
          {tableNameError ? (
            <p className="text-xs text-destructive">{tableNameError}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleDialogOpenChange(false)}
          >
            {t('common.cancel', '取消')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('query.set.saving', '保存中…')}
              </>
            ) : (
              t('query.set.saveSubmit', '保存')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SetOperationSaveTableDialog;
