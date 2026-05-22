/**
 * 集合运算结果导出对话框（CSV / Excel / Parquet 异步任务）
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  exportSetOperation,
  type SetOperationExportFormat,
  type SetOperationRequestPayload,
} from '@/api';
import { showSuccessToast, handleApiErrorToast } from '@/utils/toastHelpers';

const ASYNC_TASKS_QUERY_KEY = ['async-tasks'] as const;

export interface SetOperationExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getPayload: () => SetOperationRequestPayload | null;
  onSuccess?: (taskId: string) => void;
}

export const SetOperationExportDialog: React.FC<SetOperationExportDialogProps> = ({
  open,
  onOpenChange,
  getPayload,
  onSuccess,
}) => {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<SetOperationExportFormat>('csv');
  const [filename, setFilename] = useState('');

  useEffect(() => {
    if (open) {
      setFormat('csv');
      setFilename('');
    }
  }, [open]);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const payload = getPayload();
      if (!payload) {
        throw new Error(t('query.set.exportNoConfig', '请先配置至少两张表'));
      }
      return exportSetOperation({
        config: payload.config,
        format,
        filename: filename.trim() || undefined,
      });
    },
    onSuccess: (result) => {
      showSuccessToast(
        t,
        'SET_OPERATION_EXPORTED',
        t('query.set.exportStarted', '导出任务已创建，请在异步任务面板查看进度')
      );
      queryClient.invalidateQueries({ queryKey: ASYNC_TASKS_QUERY_KEY });
      onOpenChange(false);
      onSuccess?.(result.task_id);
    },
    onError: (error: Error) => {
      handleApiErrorToast(t, error, t('query.set.exportFailed', '创建导出任务失败'));
    },
  });

  const handleSubmit = useCallback(() => {
    exportMutation.mutate();
  }, [exportMutation]);

  const canSubmit = getPayload() != null && !exportMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('query.set.exportTitle', '导出集合运算结果')}</DialogTitle>
          <DialogDescription>
            {t(
              'query.set.exportDescription',
              '在后台执行完整集合运算并导出为文件，可在异步任务中下载。'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('query.set.exportFormat', '文件格式')}</Label>
            <Select
              value={format}
              onValueChange={(v) => setFormat(v as SetOperationExportFormat)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="excel">Excel</SelectItem>
                <SelectItem value="parquet">Parquet</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('query.set.exportFilename', '文件名（可选）')}</Label>
            <Input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder={t('query.set.exportFilenamePlaceholder', '不含扩展名')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', '取消')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {exportMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t('query.set.exporting', '提交中…')}
              </>
            ) : (
              t('query.set.exportSubmit', '开始导出')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SetOperationExportDialog;
