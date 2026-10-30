import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Search, ScanSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SQLHighlight } from '@/components/SQLHighlight';
import { Separator } from '@/components/ui/separator';
import { QueryExecutionButtons } from '@/Query/SQLQuery/SQLToolbar';
import { PushdownStatus } from '@/Query/components/PushdownStatus';
import {
  getColumnInsights, getJsonPaths, generateColumnInsightQuery, toAttachDatabasesPayload,
  type InsightMetric, type JsonExtraction, type JsonExtractionType, type InsightAggregation,
} from '@/api';
import type { SelectedTable } from '@/types/SelectedTable';
import type { TableSource } from '@/types/queryWorkspace';
import { generateExternalTableReference } from '@/utils/sqlUtils';
import { PivotFilters, pivotFiltersToApi, type PivotFilterRow } from '@/Query/PivotTable/PivotFilters';
import { showErrorToast } from '@/utils/toastHelpers';

interface InsightsPanelProps {
  onCancel?: () => void;
  isCancelling?: boolean;
  selectedTables: SelectedTable[];
  onExecute: (sql: string, source?: TableSource, options?: { baseSql?: string }) => Promise<void>;
  onResultViewRequest?: (view: 'metrics' | 'table') => void;
}

const EXTRACTION_TYPES: JsonExtractionType[] = ['VARCHAR', 'BIGINT', 'DOUBLE', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'JSON'];

/** Type-driven configuration; sampling and execution are separate explicit actions. */
export function InsightsPanel(props: InsightsPanelProps) {
  const { t } = useTranslation('common');
  const table = props.selectedTables[0];
  if (!table) return <div className="p-6 text-sm text-muted-foreground">{t('insights.selectTable')}</div>;
  const identity = JSON.stringify(table ?? null);
  return <InsightsEditor key={identity} table={table} onExecute={props.onExecute} onResultViewRequest={props.onResultViewRequest} onCancel={props.onCancel} isCancelling={props.isCancelling} />;
}

function InsightsEditor({ table, onExecute, onResultViewRequest, onCancel, isCancelling }: Omit<InsightsPanelProps, 'selectedTables'> & { table: SelectedTable }) {
  const { t } = useTranslation('common');
  const [mode, setMode] = React.useState('metrics');
  const [metrics, setMetrics] = React.useState<InsightMetric[]>([{ aggregation: 'COUNT_ROWS', alias: 'row_count' }]);
  const [column, setColumn] = React.useState('');
  const [sampleContext, setSampleContext] = React.useState<string | null>(null);
  const [extractions, setExtractions] = React.useState<JsonExtraction[]>([]);
  const [keepOriginal, setKeepOriginal] = React.useState(true);
  const [filters, setFilters] = React.useState<PivotFilterRow[]>([]);
  const apiFilters = React.useMemo(() => pivotFiltersToApi(filters), [filters]);
  const changeFilters = (next: PivotFilterRow[]) => {
    setFilters(next);
    setSampleContext(null);
    setExtractions([]);
  };
  const [executing, setExecuting] = React.useState(false);
  const reference = table ? generateExternalTableReference(table) : null;
  const payload = {
    table_name: reference?.qualifiedName ?? '',
    attach_databases: toAttachDatabasesPayload(reference?.attachDatabase ? [reference.attachDatabase] : undefined),
  };
  const schema = useQuery({
    queryKey: ['column-insights', payload], queryFn: () => getColumnInsights(payload), enabled: !!table, retry: false,
  });
  const columns = schema.data?.columns ?? [];
  const sampleKey = JSON.stringify([payload, column, apiFilters]);
  const sampleRequested = sampleContext === sampleKey;
  const paths = useQuery({
    queryKey: ['column-json-paths', payload, column, apiFilters],
    queryFn: () => getJsonPaths({ ...payload, column, filters: apiFilters }),
    enabled: mode === 'json' && !!column && sampleRequested, retry: false,
  });
  const config = {
    ...payload, metrics: mode === 'metrics' ? metrics : [],
    extractions: mode === 'json' ? extractions : [],
    filters: apiFilters, keep_original: keepOriginal,
  };
  const valid = mode === 'metrics' ? metrics.length > 0 : extractions.length > 0;
  const query = useQuery({
    queryKey: ['column-insight-query', config], queryFn: () => generateColumnInsightQuery(config),
    enabled: !!schema.data && valid, retry: false,
  });
  const updateMetric = (index: number, changes: Partial<InsightMetric>) => setMetrics((items) => items.map((item, i) => i === index ? { ...item, ...changes } : item));
  const updateExtraction = (pointer: string, changes: Partial<JsonExtraction>) => setExtractions((items) => items.map((item) => item.pointer === pointer ? { ...item, ...changes } : item));
  const execute = async () => {
    if (!query.data || !reference || query.isFetching) return;
    setExecuting(true);
    try {
      const source: TableSource = reference.attachDatabase
        ? { type: 'federated', attachDatabases: [reference.attachDatabase] } : { type: 'duckdb' };
      await onExecute(query.data.sql, source, { baseSql: query.data.sql });
      onResultViewRequest?.(mode === 'metrics' ? 'metrics' : 'table');
    } catch (error) { showErrorToast(t, error as Error); }
    finally { setExecuting(false); }
  };

  return <div className="flex h-full min-h-0 flex-col">
    <div className="@container flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-3 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        <QueryExecutionButtons onExecute={() => void execute()} isExecuting={executing}
          onCancel={onCancel} isCancelling={isCancelling}
          disabled={!query.data || query.isFetching || !valid} />
        <Separator orientation="vertical" className="mx-1 h-4" />
        <Tabs value={mode} onValueChange={setMode}><TabsList className="h-7">
          <TabsTrigger value="metrics">{t('insights.metrics')}</TabsTrigger>
          <TabsTrigger value="json">{t('insights.json')}</TabsTrigger>
        </TabsList></Tabs>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-background/50 px-2 py-1 text-xs text-muted-foreground">
        <ScanSearch className="size-3.5 shrink-0" /><span>{t('insights.title')}</span>
        <span className="ml-1 truncate" title={payload.table_name}>· {payload.table_name}</span>
      </div>
    </div>
    {valid && query.data && !query.isFetching && <PushdownStatus report={query.data.pushdown} planned />}
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3">
      <p className="text-xs text-muted-foreground">{t(mode === 'metrics' ? 'insights.metricsHint' : 'insights.jsonHint')}</p>
      {schema.isPending && <p role="status" className="text-sm">{t('insights.loading')}</p>}
      {schema.error && <p role="alert" className="text-sm text-destructive">{schema.error.message}</p>}
      {mode === 'metrics' && <div className="space-y-2">
        {metrics.map((metric, index) => {
          const available = metric.aggregation === 'COUNT_ROWS' ? ['COUNT_ROWS'] : columns.find((entry) => entry.name === metric.column)?.aggregations ?? [];
          return <div key={index} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-4">
            <Select value={metric.aggregation === 'COUNT_ROWS' ? 'rows' : `field:${metric.column}`} onValueChange={(value) => {
              const name = value === 'rows' ? null : value.slice('field:'.length);
              const aggregation = name === null ? 'COUNT_ROWS' : columns.find((entry) => entry.name === name)?.aggregations.includes('AVG') ? 'AVG' : 'COUNT_DISTINCT';
              const allowed = columns.find((entry) => entry.name === name)?.aggregations ?? [];
              const operation = name === null || allowed.includes(aggregation) ? aggregation : 'COUNT';
              updateMetric(index, { column: name ?? undefined, aggregation: operation, alias: name === null ? 'row_count' : `${operation.toLowerCase()}_${name}` });
            }}><SelectTrigger aria-label={t('insights.metricColumn', { index: index + 1 })}><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="rows">{t('insights.rowCount')}</SelectItem>
              {columns.map((entry) => <SelectItem key={entry.name} value={`field:${entry.name}`}>{entry.name} · {entry.type}</SelectItem>)}
            </SelectContent></Select>
            <Select value={metric.aggregation} onValueChange={(aggregation: InsightAggregation) => updateMetric(index, { aggregation, alias: `${aggregation.toLowerCase()}_${metric.column ?? 'rows'}` })}>
              <SelectTrigger aria-label={t('insights.metricOperation', { index: index + 1 })}><SelectValue /></SelectTrigger><SelectContent>
                {available.map((operation) => <SelectItem key={operation} value={operation}>{t(`insights.operations.${operation}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input aria-label={t('insights.outputName', { index: index + 1 })} value={metric.alias} onChange={(event) => updateMetric(index, { alias: event.target.value })} />
            <Button variant="ghost" size="sm" aria-label={t('insights.removeMetric', { index: index + 1 })} onClick={() => setMetrics((items) => items.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button>
          </div>;
        })}
        <Button variant="outline" size="sm" disabled={!columns.length || metrics.length >= 16} onClick={() => {
          const entry = columns.find((item) => item.aggregations.includes('AVG')) ?? columns[0];
          const aggregation = entry.aggregations.includes('AVG') ? 'AVG' : entry.aggregations.includes('COUNT_DISTINCT') ? 'COUNT_DISTINCT' : 'COUNT';
          setMetrics((items) => [...items, { column: entry.name, aggregation, alias: `${aggregation.toLowerCase()}_${entry.name}_${items.length}` }]);
        }}><Plus className="mr-2 size-4" />{t('insights.addMetric')}</Button>
      </div>}
      {mode === 'json' && <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={column} onValueChange={(value) => { setColumn(value); setExtractions([]); setSampleContext(null); }}>
            <SelectTrigger className="w-64" aria-label={t('insights.jsonColumn')}><SelectValue placeholder={t('insights.jsonColumn')} /></SelectTrigger><SelectContent>
              {columns.filter((entry) => entry.json_candidate).map((entry) => <SelectItem key={entry.name} value={entry.name}>{entry.name} · {entry.type}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={!column || paths.isFetching} onClick={() => { if (sampleRequested) void paths.refetch(); else setSampleContext(sampleKey); }}><Search className="mr-2 size-4" />{t(paths.isFetching ? 'insights.loading' : 'insights.discover')}</Button>
        </div>
        {paths.error && <p role="alert" className="text-sm text-destructive">{paths.error.message}</p>}
        {sampleRequested && paths.data && <>
          <p className="text-xs text-muted-foreground">{t('insights.sample', { sampled: paths.data.sampled_rows, valid: paths.data.valid_rows, skipped: paths.data.skipped_rows })} {paths.data.truncated && t('insights.pathsTruncated')}</p>
          <div className="max-h-48 space-y-2 overflow-auto rounded-md border border-border p-2">
            {paths.data.paths.length === 0 && <p className="text-sm text-muted-foreground">{t('insights.noPaths')}</p>}
            {paths.data.paths.map((path) => {
              const extraction = extractions.find((entry) => entry.pointer === path.pointer);
              return <div key={path.pointer} className="flex flex-wrap items-center gap-2">
                <Checkbox aria-label={t('insights.selectPath', { path: path.pointer || '$' })} checked={!!extraction} disabled={!extraction && extractions.length >= 16} onCheckedChange={(checked) => {
                  setExtractions((items) => checked ? [...items, { column, pointer: path.pointer, alias: `${column}_${path.pointer || 'value'}`, target_type: 'VARCHAR' }] : items.filter((entry) => entry.pointer !== path.pointer));
                }} />
                <span className="min-w-0 flex-1 break-all font-mono text-xs">{path.pointer || '$'} <span className="text-muted-foreground">({path.types.join(', ')}, {path.occurrences}/{paths.data?.valid_rows})</span></span>
                {extraction && <>
                  <Input className="w-40" aria-label={t('insights.pathAlias', { path: path.pointer || '$' })} value={extraction.alias} onChange={(event) => updateExtraction(path.pointer, { alias: event.target.value })} />
                  <Select value={extraction.target_type} onValueChange={(target_type: JsonExtractionType) => updateExtraction(path.pointer, { target_type })}><SelectTrigger className="w-36" aria-label={t('insights.pathType', { path: path.pointer || '$' })}><SelectValue /></SelectTrigger><SelectContent>
                    {EXTRACTION_TYPES.map((kind) => <SelectItem key={kind} value={kind}>{t(`insights.types.${kind}`)}</SelectItem>)}
                  </SelectContent></Select>
                </>}
              </div>;
            })}
          </div>
        </>}
        <Label className="flex items-center gap-2"><Checkbox checked={keepOriginal} onCheckedChange={(value) => setKeepOriginal(value === true)} />{t('insights.keepOriginal')}</Label>
        <p className="text-xs text-muted-foreground">{t('insights.conversionHint')}</p>
      </div>}
      {!!columns.length && <PivotFilters filters={filters} onChange={changeFilters} columnNames={columns.map((entry) => entry.name)} />}
      {query.error && valid && <p role="alert" className="text-sm text-destructive">{query.error.message}</p>}
      {valid && query.isFetching && <p role="status" className="text-xs text-muted-foreground">{t('insights.preparing')}</p>}
      {valid && query.data && !query.isFetching && <section className="space-y-2"><h3 className="text-sm font-medium">{t('insights.sqlPreview')}</h3><SQLHighlight sql={query.data.sql} minHeight="80px" maxHeight="240px" /></section>}
    </div>
  </div>;
}
