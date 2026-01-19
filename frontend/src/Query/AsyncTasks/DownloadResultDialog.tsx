/**
 * 下载结果对话框
 * 
 * 用于下载异步任务的结果文件（CSV/Parquet）
 */

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileSpreadsheet, FileArchive, Loader2, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { downloadAsyncResult } from '@/api';
import { showSuccessToast, handleApiErrorToast } from '@/utils/toastHelpers';

export type DownloadFormat = 'csv' | 'parquet';

export interface DownloadResultDialogProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onOpenChange: (open: boolean) => void;
  /** 任务 ID */
  taskId: string;
  /** 任务表名（用于显示） */
  tableName?: string;
  /** 行数（用于显示） */
  rowCount?: number;
  /** 下载成功回调 */
  onSuccess?: () => void;
}

interface FormatOption {
  value: DownloadFormat;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * 下载结果对话框
 */
export const DownloadResultDialog: React.FC<DownloadResultDialogProps> = ({
  open,
  onOpenChange,
  taskId,
  tableName,
  rowCount,
  onSuccess,
}) => {
  const { t } = useTranslation('common');
  const [format, setFormat] = useState<DownloadFormat>('csv');
  const [isDownloading, setIsDownloading] = useState(false);

  // 格式选项
  const formatOptions: FormatOption[] = [
    {
      value: 'csv',
      label: 'CSV',
      description: t('async.download.csvDescription', '通用格式，可用 Excel 打开'),
      icon: FileSpreadsheet,
    },
    {
      value: 'parquet',
      label: 'Parquet',
      description: t('async.download.parquetDescription', '高效压缩格式，适合大数据分析'),
      icon: FileArchive,
    },
  ];

  // 下载处理
  const handleDownload = useCallback(async () => {
    setIsDownloading(true);

    try {
      // API 返回的是原始 Blob，不是 { blob, filename } 对象
      const blob = await downloadAsyncResult(taskId, { format });

      // 创建下载链接
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableName || taskId}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showSuccessToast(t, 'TASK_DOWNLOAD_SUCCESS', t('async.download.success', '下载成功'));
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      handleApiErrorToast(t, error, t('async.download.failed', '下载失败'));
    } finally {
      setIsDownloading(false);
    }
  }, [taskId, format, tableName, onOpenChange, onSuccess, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {t('async.download.title', '下载结果')}
          </DialogTitle>
          <DialogDescription>
            {tableName && (
              <span className="font-mono text-xs">{tableName}</span>
            )}
            {rowCount !== undefined && (
              <span className="ml-2 text-muted-foreground">
                ({rowCount.toLocaleString()} {t('query.result.rows', '行')})
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Label className="mb-3 block">
            {t('async.download.selectFormat', '选择下载格式')}
          </Label>
          <div className="space-y-3">
            {formatOptions.map((option) => {
              const Icon = option.icon;
              const isSelected = format === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormat(option.value)}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border w-full text-left transition-colors',
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50'
                  )}
                >
                  <div className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border',
                    isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'
                  )}>
                    {isSelected && <Check className="h-3 w-3" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Icon className={cn(
                        'h-4 w-4',
                        isSelected ? 'text-primary' : 'text-foreground'
                      )} />
                      <span className="font-medium text-foreground">{option.label}</span>
                    </div>
                    <p className={cn(
                      'text-xs mt-1',
                      isSelected ? 'text-foreground/80' : 'text-foreground/60'
                    )}>
                      {option.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDownloading}
          >
            {t('actions.cancel', '取消')}
          </Button>
          <Button onClick={handleDownload} disabled={isDownloading}>
            {isDownloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {t('async.download.download', '下载')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DownloadResultDialog;
