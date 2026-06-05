import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { executeDuckDBSQL } from '@/api';
import { cleanErrorMessage } from '@/utils/toastHelpers';

/**
 * 数据画像对话框
 *
 * 对一张 DuckDB 表运行 `SUMMARIZE "表名"`，把每列的统计
 * （类型 / min / max / 均值 / 标准差 / 分位数 / distinct / null%）
 * 以表格形式展示。SUMMARIZE 是 DuckDB 原生语句，纯前端调用即可。
 */

interface TableProfileDialogProps {
  tableName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 数值类列右对齐（SUMMARIZE 输出里的统计列） */
const NUMERIC_HEADERS = new Set([
  'min',
  'max',
  'approx_unique',
  'avg',
  'std',
  'q25',
  'q50',
  'q75',
  'count',
  'null_percentage',
]);

export const TableProfileDialog: React.FC<TableProfileDialogProps> = ({
  tableName,
  open,
  onOpenChange,
}) => {
  const { t } = useTranslation('common');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<Record<string, unknown>[]>([]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHeaders([]);
    setRows([]);

    executeDuckDBSQL({ sql: `SUMMARIZE "${tableName}"`, isPreview: false })
      .then((res) => {
        if (cancelled) return;
        const data = res.data ?? [];
        setRows(data);
        setHeaders(data[0] ? Object.keys(data[0]) : []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(cleanErrorMessage(err instanceof Error ? err.message : String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, tableName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-5xl flex-col gap-3 p-0">
        <DialogHeader className="px-6 pt-6 pr-10">
          <DialogTitle className="text-lg font-semibold">
            {t('dataSource.profileTitle', { tableName })}
          </DialogTitle>
          <DialogDescription>
            {t('dataSource.profileDesc', '每列的统计画像（SUMMARIZE）')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t('common.noData', '无数据')}
            </div>
          ) : (
            <div className="overflow-auto rounded-md border border-border">
              <table className="dq-grid-table w-full">
                <thead>
                  <tr>
                    {headers.map((h) => (
                      <th
                        key={h}
                        className={NUMERIC_HEADERS.has(h) ? 'text-right' : undefined}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i}>
                      {headers.map((h) => {
                        const v = row[h];
                        return (
                          <td
                            key={h}
                            className={NUMERIC_HEADERS.has(h) ? 'text-right' : undefined}
                          >
                            {v === null || v === undefined ? '' : String(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
