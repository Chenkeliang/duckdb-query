import { useTranslation } from 'react-i18next';
import { AlertTriangle, Info } from 'lucide-react';
import type { PushdownInfo } from '@/api';

interface PushdownStatusProps {
  report?: PushdownInfo | null;
  planned?: boolean;
}

/** Distinguish planned execution from the strategy of a completed result. */
export function PushdownStatus({ report, planned = false }: PushdownStatusProps) {
  const { t } = useTranslation('common');
  if (!report || (report.mode === 'local' && report.sources === 0)) return null;
  const Icon = report.mode === 'local' ? AlertTriangle : Info;
  return <div role="status" className="flex items-start gap-2 border-b border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
    <Icon className="mt-0.5 size-3.5 shrink-0" />
    <span>{t(planned ? 'pushdown.planned' : 'pushdown.executed')} {t(`pushdown.modes.${report.mode}`, { count: report.pushed_sources, total: report.sources })} {report.key_strategy === 'range' && t('pushdown.keyRange')}</span>
  </div>;
}
