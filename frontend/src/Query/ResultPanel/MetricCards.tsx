import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { SQLHighlight } from '@/components/SQLHighlight';

interface MetricCardsProps {
  row: Record<string, unknown>;
  columns: string[];
  sql?: string;
}

/** Render backend scalars verbatim: never round DECIMAL or HUGEINT through Number. */
export function MetricCards({ row, columns, sql }: MetricCardsProps) {
  const { t } = useTranslation('common');
  return <div className="h-full space-y-3 overflow-auto p-3">
    <p className="text-xs text-muted-foreground">{t('insights.cardHint')}</p>
    {sql && <Accordion type="single" collapsible><AccordionItem value="executed-sql" className="border-0">
      <AccordionTrigger className="py-2 text-xs">{t('insights.executedSql')}</AccordionTrigger>
      <AccordionContent><SQLHighlight sql={sql} minHeight="64px" maxHeight="200px" /></AccordionContent>
    </AccordionItem></Accordion>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {columns.map((column) => <Card key={column} className="min-w-0 shadow-none">
        <CardHeader className="p-3 pb-2"><CardTitle className="break-all text-sm font-medium">{column}</CardTitle></CardHeader>
        <CardContent className="p-3 pt-0"><p className="break-all font-mono text-2xl tabular-nums" title={String(row[column] ?? 'NULL')}>
          {row[column] == null ? 'NULL' : String(row[column])}
        </p></CardContent>
      </Card>)}
    </div>
  </div>;
}
