import { useTranslation } from 'react-i18next';
import { GitMerge, HardDrive, Server } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface FederationChipProps {
  queryType: 'duckdb' | 'external' | 'federated';
  attachDatabases: Array<{ alias: string; connectionId: string }>;
  connections?: Array<{ id: string; name: string }>;
}

/**
 * Toolbar chip stating where this SQL will run: local DuckDB only, an external
 * database, or a federated query with the attached aliases (graphite redesign —
 * "where data lives is always legible").
 */
export function FederationChip({ queryType, attachDatabases, connections = [] }: FederationChipProps) {
  const { t } = useTranslation('common');
  const Icon = queryType === 'federated' ? GitMerge : queryType === 'external' ? Server : HardDrive;
  const label =
    queryType === 'federated'
      ? t('query.federated.queryTypeFederated', '联邦查询')
      : queryType === 'external'
        ? t('query.federated.queryTypeExternal', '外部数据库')
        : t('query.federated.queryTypeDuckDB', 'DuckDB 本地');
  const description =
    queryType === 'federated'
      ? t('query.federated.queryTypeFederatedDesc', '查询跨多个数据源')
      : queryType === 'external'
        ? t('query.federated.queryTypeExternalDesc', '查询使用外部数据库')
        : t('query.federated.queryTypeDuckDBDesc', '查询仅使用 DuckDB 本地数据');

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex h-7 max-w-80 shrink-0 whitespace-nowrap items-center gap-2 rounded-md border border-border px-2.5 text-xs text-muted-foreground"
            data-testid="federation-chip"
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium text-foreground">{label}</span>
            {attachDatabases.length > 0 && (
              <span className="flex min-w-0 items-center gap-1 overflow-hidden">
                {attachDatabases.map((db) => (
                  <span
                    key={db.alias}
                    className="truncate rounded border border-border-strong px-1 font-mono text-xs leading-4 text-secondary-foreground"
                  >
                    {db.alias}
                  </span>
                ))}
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div>{description}</div>
          {attachDatabases.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {attachDatabases.map((db) => (
                <li key={db.alias} className="font-mono">
                  {db.alias}
                  {connections.find((c) => c.id === db.connectionId)?.name
                    ? ` → ${connections.find((c) => c.id === db.connectionId)?.name}`
                    : ''}
                </li>
              ))}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default FederationChip;
