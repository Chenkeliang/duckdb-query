import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Code2, Copy, ArrowLeft, RefreshCw, MoreHorizontal, Table2, Trash2 } from 'lucide-react';
import { DataSourceActions, type DataSourceMethod } from './DataSourceActions';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useDuckDBTables } from '@/hooks/useDuckDBTables';
import { deleteDuckDBTable } from '@/api';
import { invalidateAfterTableDelete } from '@/utils/cacheInvalidation';
import { showErrorToast, showSuccessToast } from '@/utils/toastHelpers';

interface DataSourcePageProps {
  savedConnectionsPanel: ReactNode;
  onAddData: (method: DataSourceMethod) => void;
  onBackToWorkbench: () => void;
  onQueryTable: (name: string) => void;
}

/** Connections and local tables share an overview; imports live in Add data. */
export default function DataSourcePage({ savedConnectionsPanel, onAddData, onBackToWorkbench, onQueryTable }: DataSourcePageProps) {
  const { t, i18n } = useTranslation('common');
  const queryClient = useQueryClient();
  const { tables, isLoading, refresh } = useDuckDBTables();
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const deletion = useMutation({
    mutationFn: deleteDuckDBTable,
    onSuccess: () => { invalidateAfterTableDelete(queryClient); setDeleteTarget(null); },
    onError: (error) => showErrorToast(t, error),
  });
  const visibleTables = tables.filter((table) => table.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="h-full overflow-auto px-4 py-7 md:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-xl font-semibold tracking-tight">{t('nav.datasource')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('page.datasource.overviewIntro')}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="quiet" size="sm" onClick={onBackToWorkbench}><ArrowLeft className="size-3.5" />{t('page.datasource.flow.backToWorkbench')}</Button>
            <Button variant="quiet" size="icon" aria-label={t('actions.refresh')} title={t('actions.refresh')} onClick={() => { void refresh(); void queryClient.invalidateQueries({ queryKey: ['database-connections'] }); }}><RefreshCw className="size-4" /></Button>
            <DataSourceActions onAddData={onAddData} />
          </div>
        </header>
        <section>{savedConnectionsPanel}</section>
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">{t('page.datasource.localTables')} <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{tables.length}</span></h2>
            <Input className="w-60" value={search} onChange={(event) => setSearch(event.target.value)} aria-label={t('page.datasource.searchLocal')} placeholder={t('page.datasource.searchLocal')} />
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="dq-grid-table w-full">
              <thead><tr><th>{t('page.datasource.tableName')}</th><th className="text-right">{t('page.datasource.rows')}</th><th className="text-right">{t('page.datasource.columns')}</th><th>{t('page.datasource.created')}</th><th className="text-right">{t('actions.actions')}</th></tr></thead>
              <tbody>{visibleTables.map((table) => <tr key={table.name}>
                <td><span className="flex items-center gap-2 font-mono"><Table2 className="size-4 shrink-0 text-muted-foreground" />{table.name}</span></td>
                <td className="text-right font-mono">{table.row_count?.toLocaleString() ?? '—'}</td>
                <td className="text-right font-mono">{table.column_count ?? '—'}</td>
                <td className="whitespace-nowrap text-xs text-muted-foreground">{table.created_at ? new Date(table.created_at).toLocaleString(i18n.language) : '—'}</td>
                <td><div className="flex justify-end gap-1">
                  <Button variant="quiet" size="sm" onClick={() => onQueryTable(table.name)}><Code2 className="size-3.5" />{t('page.datasource.query')}</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="quiet" size="icon" className="size-7" aria-label={t('actions.actions')}><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => { void navigator.clipboard.writeText(table.name).then(() => showSuccessToast(t, undefined, t('common.copied'))).catch((error) => showErrorToast(t, error)); }}><Copy className="mr-2 size-3.5" />{t('common.copyTableName')}</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setDeleteTarget(table.name)}><Trash2 className="mr-2 size-3.5" />{t('actions.delete')}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div></td>
              </tr>)}</tbody>
            </table>
            {!visibleTables.length && <p className="p-8 text-center text-sm text-muted-foreground">{isLoading ? t('actions.loading') : t('page.datasource.noLocalTables')}</p>}
          </div>
        </section>
      </div>
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deletion.isPending) setDeleteTarget(null); }}>
        <DialogContent><DialogHeader><DialogTitle>{t('page.datasource.deleteTitle')}</DialogTitle><DialogDescription>{t('page.datasource.deleteDescription', { name: deleteTarget })}</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="subtle" disabled={deletion.isPending} onClick={() => setDeleteTarget(null)}>{t('actions.cancel')}</Button><Button variant="destructive" disabled={deletion.isPending} onClick={() => { if (deleteTarget) deletion.mutate(deleteTarget); }}>{t('actions.delete')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
