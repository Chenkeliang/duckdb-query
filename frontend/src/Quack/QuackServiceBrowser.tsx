import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Database, Folder, Table2, Columns3, Eye } from 'lucide-react';
import type { QuackService, QuackTable } from '@/api';
import { useQuackCatalogs, useQuackSchemas, useQuackTables, useQuackColumns } from '@/hooks/useQuackServices';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { quoteIdent } from '@/utils/sqlUtils';

export type OpenQuackQuery = (service: QuackService, sql?: string) => void;

export interface QuackServiceBrowserProps {
  service: QuackService;
  onOpenQuery: OpenQuackQuery;
}

/** Always preserve all three identifier parts and leave execution to the bound SQL tab. */
export function quackTableSQL(catalog: string, schema: string, table: string): string {
  return `SELECT * FROM ${[catalog, schema, table].map(part => quoteIdent(part, 'duckdb')).join('.')} LIMIT 100;`;
}

function Branch({ name, icon, detail, children, onPreview }: { name: string; icon: ReactNode; detail?: string; children: ReactNode; onPreview?: () => void }) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const id = useId();
  const toggleLabel = t(open ? 'quack.collapseNode' : 'quack.expandNode', { name });
  const label = <>{icon}<span className={onPreview ? 'truncate font-medium' : 'truncate'} title={name}>{name}</span>{detail && <span className="ml-auto truncate pr-1 text-xs text-muted-foreground">{detail}</span>}</>;
  return <div className="min-w-0">
    <ContextMenu><ContextMenuTrigger asChild>
      <div className="flex h-8 min-w-0 items-center rounded-lg pl-0.5 hover:bg-surface-hover">
        <Button variant="ghost" size="sm" aria-label={toggleLabel} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="mr-1 size-4 shrink-0 p-0">
          <ChevronRight className={`size-4 text-muted-foreground ${open ? 'rotate-90' : ''}`} />
        </Button>
        {onPreview ? <Button variant="ghost" size="sm" title={t('quack.previewHint')}
          onDoubleClick={onPreview}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPreview(); } }}
          className="h-8 min-w-0 flex-1 justify-start gap-2 px-0 text-sm font-normal hover:bg-transparent">
          {label}
        </Button> : <div className="flex h-8 min-w-0 flex-1 items-center gap-2 text-sm">{label}</div>}
      </div>
    </ContextMenuTrigger><ContextMenuContent>
      {onPreview && <ContextMenuItem onSelect={onPreview}>{t('quack.openPreview')}</ContextMenuItem>}
      <ContextMenuItem onSelect={() => setOpen(!open)}>{toggleLabel}</ContextMenuItem>
    </ContextMenuContent></ContextMenu>
    {open && <div id={id} className="ml-3 border-l border-border pl-2">{children}</div>}
  </div>;
}

function QueryState({ loading, error, empty, retry }: { loading: boolean; error: Error | null; empty: boolean; retry: () => void }) {
  const { t } = useTranslation('common');
  if (loading) return <p role="status" className="px-2 py-2 text-xs text-muted-foreground">{t('quack.loading')}</p>;
  if (error) return <div className="space-y-1 px-2 py-2"><p role="alert" className="break-words text-xs text-error">{error.message || t('quack.loadFailed')}</p><Button variant="subtle" size="sm" onClick={retry}>{t('quack.retry')}</Button></div>;
  return empty ? <p className="px-2 py-2 text-xs text-muted-foreground">{t('quack.emptyBranch')}</p> : null;
}

function Columns({ service, catalog, schema, table }: { service: QuackService; catalog: string; schema: string; table: string }) {
  const query = useQuackColumns(service.id, catalog, schema, table);
  return <><QueryState loading={query.isPending} error={query.error} empty={!query.data?.length} retry={() => void query.refetch()} />{query.data?.map(column => <div key={column.name} className="flex min-w-0 items-center gap-2 px-2 py-1 text-xs">
    <Columns3 className="size-3 shrink-0 text-muted-foreground" /><span className="truncate font-mono" title={column.name}>{column.name}</span><span className="ml-auto truncate font-mono text-muted-foreground" title={column.type}>{column.type}</span>
  </div>)}</>;
}

function TableRow({ service, catalog, schema, table, onOpenQuery }: { service: QuackService; catalog: string; schema: string; table: QuackTable; onOpenQuery: OpenQuackQuery }) {
  const { t } = useTranslation('common');
  return <div>
    <Branch name={table.name} icon={table.type === 'VIEW' ? <Eye className="size-3.5 shrink-0 text-muted-foreground" /> : <Table2 className="size-3.5 shrink-0 text-muted-foreground" />} detail={table.type === 'VIEW' ? t('quack.view') : undefined}
      onPreview={() => onOpenQuery(service, quackTableSQL(catalog, schema, table.name))}>
      <Columns service={service} catalog={catalog} schema={schema} table={table.name} />
    </Branch>
  </div>;
}

function Tables({ service, catalog, schema, onOpenQuery }: QuackServiceBrowserProps & { catalog: string; schema: string }) {
  const query = useQuackTables(service.id, catalog, schema);
  return <><QueryState loading={query.isPending} error={query.error} empty={!query.data?.length} retry={() => void query.refetch()} />{query.data?.map(table => <TableRow key={table.name} service={service} catalog={catalog} schema={schema} table={table} onOpenQuery={onOpenQuery} />)}</>;
}

function Schemas({ service, catalog, onOpenQuery }: QuackServiceBrowserProps & { catalog: string }) {
  const query = useQuackSchemas(service.id, catalog);
  return <><QueryState loading={query.isPending} error={query.error} empty={!query.data?.length} retry={() => void query.refetch()} />{query.data?.map(schema => <Branch key={schema.name} name={schema.name} icon={<Folder className="size-3.5 shrink-0 text-muted-foreground" />}><Tables service={service} catalog={catalog} schema={schema.name} onOpenQuery={onOpenQuery} /></Branch>)}</>;
}

export function QuackServiceBrowser({ service, onOpenQuery }: QuackServiceBrowserProps) {
  const query = useQuackCatalogs(service.id);
  return <div className="min-w-0"><QueryState loading={query.isPending} error={query.error} empty={!query.data?.length} retry={() => void query.refetch()} />{query.data?.map(catalog => <Branch key={catalog.name} name={catalog.name} icon={<Database className="size-3.5 shrink-0 text-muted-foreground" />} detail={catalog.type}><Schemas service={service} catalog={catalog.name} onOpenQuery={onOpenQuery} /></Branch>)}</div>;
}
