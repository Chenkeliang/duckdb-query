import { useTranslation } from 'react-i18next';
import { Columns3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTableColumns } from '@/hooks/useTableColumns';
import type { SelectedTableObject } from '@/types/SelectedTable';

/** Mounted only for an expanded table so collapsed rows never request metadata. */
export function TableColumns({ table }: { table: SelectedTableObject }) {
  const { t } = useTranslation('common');
  const { columns, isLoading, isError, error, refetch } = useTableColumns(table, { columnsOnly: true });
  if (isLoading) return <p role="status" className="px-2 py-2 text-xs text-muted-foreground">{t('common.loading')}</p>;
  if (isError) return <div className="space-y-1 px-2 py-2"><p role="alert" className="break-words text-xs text-error">{error?.message || t('dataSource.fieldsLoadFailed')}</p><Button variant="subtle" size="sm" onClick={() => void refetch()}>{t('dataSource.retryFields')}</Button></div>;
  if (!columns.length) return <p className="px-2 py-2 text-xs text-muted-foreground">{t('dataSource.noFields')}</p>;
  return <>{columns.map(column => <div key={column.name} className="flex min-w-0 items-center gap-2 px-2 py-1 text-xs">
    <Columns3 className="size-3 shrink-0 text-muted-foreground" /><span className="truncate font-mono" title={column.name}>{column.name}</span><span className="ml-auto truncate font-mono text-muted-foreground" title={column.type}>{column.type}</span>
  </div>)}</>;
}
