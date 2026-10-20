import { useTranslation } from 'react-i18next';
import { ChevronDown, Database, Download, File, Link, Clipboard, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { IS_DEMO } from '@/demo/isDemo';
import { isTauri } from '@/desktop/openExternal';

export type DataSourceMethod = 'local' | 'url' | 'server' | 'paste' | 'database';

/** Shared direct entry points for the manager and workbench explorer. */
export function DataSourceActions({ onAddData }: { onAddData: (method: DataSourceMethod) => void }) {
  const { t } = useTranslation('common');
  return <div className="flex flex-wrap items-center gap-2">
    <div className="flex items-center">
      <Button variant="default" size="sm" className="rounded-r-none border-r-0" onClick={() => onAddData('local')}>
        <Download className="size-3.5" />{t('page.datasource.flow.importData')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="default" size="sm" className="rounded-l-none px-1.5" aria-label={t('page.datasource.flow.importOther')}><ChevronDown className="size-3.5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => onAddData('local')}><File className="mr-2 size-4" />{t('page.datasource.sourceLocal')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAddData('paste')}><Clipboard className="mr-2 size-4" />{t('page.datasource.tabPaste')}</DropdownMenuItem>
          {!IS_DEMO && <DropdownMenuItem onSelect={() => onAddData('url')}><Link className="mr-2 size-4" />{t('page.datasource.cardRemoteTitle')}</DropdownMenuItem>}
          {!IS_DEMO && !isTauri() && <DropdownMenuItem onSelect={() => onAddData('server')}><Folder className="mr-2 size-4" />{t('page.datasource.cardServerTitle')}</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    {!IS_DEMO && <Button variant="subtle" size="sm" onClick={() => onAddData('database')}><Database className="size-3.5" />{t('page.datasource.list.newConnection')}</Button>}
  </div>;
}
