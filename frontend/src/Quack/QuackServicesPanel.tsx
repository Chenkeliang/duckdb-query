import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Ellipsis, Loader2, Plus, RefreshCw, Server } from 'lucide-react';
import { testSavedQuackService, type QuackService } from '@/api';
import { quackMetadataKey, useQuackServiceMutations, useQuackServices } from '@/hooks/useQuackServices';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { TreeNode } from '@/Query/DataSourcePanel/TreeNode';
import { QuackServiceForm } from './QuackServiceForm';
import { QuackServiceBrowser, type OpenQuackQuery } from './QuackServiceBrowser';

export interface QuackServicesPanelProps {
  mode?: 'tree' | 'manage';
  search?: string;
  onOpenQuery: OpenQuackQuery;
}

function ServiceRow({ service, mode, onOpenQuery, onEdit, onDelete }: {
  service: QuackService;
  mode: 'tree' | 'manage';
  onOpenQuery: OpenQuackQuery;
  onEdit: (service: QuackService) => void;
  onDelete: (service: QuackService) => void;
}) {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const browserId = useId();
  const client = useQueryClient();
  const test = useMutation({ mutationFn: () => testSavedQuackService(service.id) });
  const refresh = useMutation({ mutationFn: () => client.invalidateQueries({ queryKey: quackMetadataKey(service.id) }) });
  const actions = [
    { key: 'openQuery', run: () => onOpenQuery(service) },
    { key: 'testConnection', run: () => test.mutate(), disabled: test.isPending },
    { key: 'refreshStructure', run: () => refresh.mutate(), disabled: refresh.isPending },
    { key: 'edit', run: () => onEdit(service) },
    { key: 'delete', run: () => onDelete(service), className: 'text-error focus:text-error' },
  ];
  return <div role="group" aria-label={service.name} className={mode === 'manage' ? 'border-b border-border py-2 last:border-b-0' : 'py-0.5'}>
    <ContextMenu><ContextMenuTrigger asChild>
    <div className="flex h-8 min-w-0 items-center gap-1 rounded-lg pl-0.5 hover:bg-surface-hover">
      <Button variant="ghost" size="sm" aria-label={service.name} aria-expanded={open} aria-controls={browserId} onClick={() => setOpen(!open)} className="mr-1 size-4 shrink-0 p-0">
        <ChevronRight className={`size-4 text-muted-foreground ${open ? 'rotate-90' : ''}`} />
      </Button>
      <Server className="size-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-sm" title={service.name}>{service.name}</span>
      {mode === 'manage' && <Button size="sm" variant="subtle" onClick={() => onOpenQuery(service)}>{t('quack.openQuery')}</Button>}
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="w-7 shrink-0 px-0" aria-label={t('quack.serviceActions', { name: service.name })}><Ellipsis className="size-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map(action => <DropdownMenuItem key={action.key} disabled={action.disabled} className={action.className} onSelect={action.run}>{t(`quack.${action.key}`)}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    </ContextMenuTrigger><ContextMenuContent>
      {actions.map(action => <ContextMenuItem key={action.key} disabled={action.disabled} className={action.className} onSelect={action.run}>{t(`quack.${action.key}`)}</ContextMenuItem>)}
    </ContextMenuContent></ContextMenu>
    {mode === 'manage' && <p className="ml-6 truncate font-mono text-xs text-muted-foreground" title={service.uri}>{service.uri}</p>}
    {test.isPending && <p role="status" className="px-6 py-1 text-xs text-muted-foreground">{t('quack.testing')}</p>}
    {test.error && <p role="alert" className="break-words px-6 py-1 text-xs text-error">{test.error.message}</p>}
    {test.data && <p role="status" className={`px-6 py-1 text-xs ${test.data.connected ? 'text-success' : 'text-error'}`}>{t(test.data.connected ? 'quack.testSucceeded' : 'quack.testFailed')}</p>}
    {open && <div id={browserId} className="ml-3 border-l border-border pl-2"><QuackServiceBrowser key={`${service.id}:${service.uri}:${service.updated_at ?? ''}`} service={service} onOpenQuery={onOpenQuery} /></div>}
  </div>;
}

export function QuackServicesPanel({ mode = 'manage', search = '', onOpenQuery }: QuackServicesPanelProps) {
  const { t } = useTranslation('common');
  const { services, isPending, isFetching, error, refetch } = useQuackServices();
  const [expanded, setExpanded] = useState(mode === 'manage');
  const [form, setForm] = useState<QuackService | 'new' | null>(null);
  const [deleting, setDeleting] = useState<QuackService | null>(null);
  const { remove } = useQuackServiceMutations();
  const groupId = useId();
  const visible = services.filter(service => `${service.name} ${service.uri}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const headerActions = <>
      <Button variant={mode === 'tree' ? 'quiet' : 'ghost'} size="sm" className="w-7 shrink-0 px-0" disabled={isFetching} onClick={() => void refetch()} aria-label={t('quack.refreshServices')}><RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} /></Button>
      <Button variant={mode === 'tree' ? 'quiet' : 'subtle'} size="sm" className={mode === 'tree' ? 'w-7 shrink-0 px-0' : ''} onClick={() => setForm('new')} aria-label={t('quack.addService')}><Plus className="size-3.5" />{mode === 'manage' && t('quack.addService')}</Button>
  </>;
  const content = <div className={mode === 'manage' ? 'mt-2' : ''}>
      {mode === 'manage' && <p className="mb-3 text-sm text-muted-foreground">{t('quack.managementHint')}</p>}
      {isPending ? <p role="status" className="px-2 py-3 text-xs text-muted-foreground">{t('quack.loading')}</p> : error ? <div className="space-y-2 p-2"><p role="alert" className="break-words text-sm text-error">{error.message}</p><Button size="sm" variant="subtle" onClick={() => void refetch()}>{t('quack.retry')}</Button></div> : visible.length ? visible.map(service => <ServiceRow key={`${service.id}:${service.updated_at ?? service.uri}`} service={service} mode={mode} onOpenQuery={onOpenQuery} onEdit={setForm} onDelete={service => { remove.reset(); setDeleting(service); }} />) : <p className="px-2 py-3 text-xs text-muted-foreground">{t(search.trim() ? 'quack.noMatches' : 'quack.emptyServices')}</p>}
    </div>;

  return <section aria-label={t('quack.title')} className="min-w-0">
    {mode === 'tree' ? <TreeNode id={groupId} label={t('quack.title')} level={0} isExpandable isExpanded={expanded || !!search.trim()} badge={services.length} onToggle={() => setExpanded(!expanded)} actions={headerActions}>{content}</TreeNode> : <><div className="flex items-center gap-1"><h2 className="flex-1 text-base font-semibold">{t('quack.title')}</h2>{headerActions}</div>{content}</>}
    <Dialog open={form !== null} onOpenChange={open => { if (!open) setForm(null); }}><DialogContent className="max-h-dvh overflow-y-auto"><DialogHeader><DialogTitle>{t(form === 'new' ? 'quack.addService' : 'quack.editService')}</DialogTitle><DialogDescription>{t('quack.readOnlyNote')}</DialogDescription></DialogHeader>{form !== null && <QuackServiceForm key={form === 'new' ? 'new' : form.id} service={form === 'new' ? undefined : form} onSaved={() => setForm(null)} onCancel={() => setForm(null)} />}</DialogContent></Dialog>
    <Dialog open={deleting !== null} onOpenChange={open => { if (!open && !remove.isPending) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>{t('quack.deleteService')}</DialogTitle><DialogDescription>{t('quack.deleteHint', { name: deleting?.name ?? '' })}</DialogDescription></DialogHeader>{remove.error && <p role="alert" className="text-sm text-error">{remove.error.message}</p>}<div className="flex justify-end gap-2"><Button variant="subtle" disabled={remove.isPending} onClick={() => setDeleting(null)}>{t('quack.cancel')}</Button><Button variant="destructive" disabled={remove.isPending} onClick={() => { if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) }); }}>{remove.isPending && <Loader2 className="size-4 animate-spin" />}{t('quack.delete')}</Button></div></DialogContent></Dialog>
  </section>;
}
