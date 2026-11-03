import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart3, Check, ChevronRight, Loader2, Maximize2, RotateCcw, SlidersHorizontal, Sparkles, Table2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { runAgent, executeDuckDBSQL, executeFederatedQuery, executeQuackQuery } from '@/api';
import { buildChartSql, buildDrilldownSql, classifyColumns, defaultSpec, metricCandidates, validateSpec, type ChartSpec, type ChartType, type AggFn, type ColumnInfo } from './chartSpec';
import { chartRecommendations, chartResultSummary, chartSamples, plotAggregation, plotQueryRows, type ChartGoal, type ChartPlot } from './chartRecommendations';
import { ChartCanvas } from './ChartCanvas';

export interface ChartSource {
  quackServiceId?: string;
  sql: string | null;
  /** Business SQL before a known system preview LIMIT; user limits remain part of it. */
  baseSql?: string | null;
  attachDatabases?: { alias: string; connectionId: string }[];
  requiresFederated?: boolean;
}
export interface ChartViewProps {
  columns: ColumnInfo[];
  rows: Array<Record<string, unknown>>;
  truncated: boolean;
  source: ChartSource;
  aiEnabled: boolean;
  locale?: 'zh' | 'en';
  onDrilldown?: (sql: string) => void;
}

const TYPES: ChartType[] = ['bar', 'line', 'area', 'pie', 'donut', 'kpi'];
const AGGS: AggFn[] = ['sum', 'count', 'avg', 'min', 'max'];
const GOALS: ChartGoal[] = ['auto', 'trend', 'compare', 'share', 'metric'];
interface ChartState { spec: ChartSpec; plot: ChartPlot; scope: 'current' | 'query' }
const unitKey = (spec: ChartSpec) => JSON.stringify([spec.dataMode === 'aggregate' && spec.agg === 'count' ? 'count' : 'value', spec.y]);

export function ChartView({ columns, rows, truncated, source, aiEnabled, locale = 'zh', onDrilldown }: ChartViewProps) {
  const { t } = useTranslation('common');
  const rowLabel = t('query.chart.resultRows');
  const { dates } = classifyColumns(columns);
  const initial = React.useMemo(() => defaultSpec(columns, rows), [columns, rows]);
  const suggestedMetrics = React.useMemo(() => metricCandidates(columns, rows), [columns, rows]);
  const [applied, setApplied] = React.useState<ChartState>(() => ({ spec: initial, plot: plotQueryRows(rows, initial, rowLabel, dates.includes(initial.x ?? '')), scope: 'current' }));
  const [draft, setDraft] = React.useState(initial);
  const [preview, setPreview] = React.useState<ChartState | null>(null);
  const [goal, setGoal] = React.useState<ChartGoal>('auto');
  const [scope, setScope] = React.useState<'current' | 'query'>('current');
  const [settings, setSettings] = React.useState(false);
  const [sections, setSections] = React.useState<string[]>([]);
  const [full, setFull] = React.useState(false);
  const [customTitle, setCustomTitle] = React.useState('');
  const [units, setUnits] = React.useState<Record<string, string>>({});
  const [aiSuggestion, setAiSuggestion] = React.useState<ChartSpec | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [drilldown, setDrilldown] = React.useState<{ sql: string; dim: string; x: number; y: number } | null>(null);
  const aiEpoch = React.useRef(0);
  const previewEpoch = React.useRef(0);
  const formId = React.useId();
  const workspaceRef = React.useRef<HTMLDivElement>(null);
  const focusButtonRef = React.useRef<HTMLButtonElement>(null);
  const columnSignature = JSON.stringify(columns);
  const sourceSignature = JSON.stringify(source);

  const ai = useMutation({
    mutationFn: async (request: { ticket: number; goal: ChartGoal; columns: ColumnInfo[]; rows: typeof rows; sql: string | null; truncated: boolean }) => {
      const response = await runAgent<ChartSpec>({
        mode: 'suggest_chart', input: { columns: request.columns, sample: chartSamples(request.rows, request.columns) },
        context: { locale, current_sql: request.sql ?? undefined, chart_goal: request.goal, chart_summary: chartResultSummary(request.columns, request.rows, request.truncated) },
      });
      if (!response.result) throw new Error(response.message || t('query.chart.suggestFailed'));
      if (response.result.dataMode === 'aggregate' && response.result.y.length && !response.result.agg) throw new Error(t('query.chart.invalidSuggestion'));
      const proposal = { ...response.result, dataMode: response.result.dataMode ?? 'rows', agg: response.result.y.length ? response.result.agg ?? 'sum' : 'count' } as ChartSpec;
      const validated = validateSpec(proposal, request.columns);
      if (validated !== proposal) throw new Error(t('query.chart.invalidSuggestion'));
      if (proposal.dataMode === 'rows' && (!proposal.y.length || (proposal.type === 'kpi' && request.rows.length !== 1))) throw new Error(t('query.chart.invalidSuggestion'));
      return proposal.dataMode === 'rows' ? { ...proposal, xBin: null } : proposal;
    },
    onSuccess: (proposal, request) => { if (request.ticket === aiEpoch.current) { setAiSuggestion(proposal); setError(null); } },
    onError: (failure, request) => { if (request.ticket === aiEpoch.current) setError(failure instanceof Error ? failure.message : t('query.chart.suggestFailed')); },
  });
  const aggregation = useMutation({
    mutationFn: async (request: { ticket: number; spec: ChartSpec; scope: 'current' | 'query'; source: ChartSource; previewLimit: number }) => {
      const sql = buildChartSql(request.scope === 'query' ? request.source.baseSql ?? request.source.sql! : request.source.sql!, request.spec, columns,
        { previewLimit: request.scope === 'current' ? request.previewLimit : undefined });
      const response = request.source.quackServiceId
        ? await executeQuackQuery(request.source.quackServiceId, sql, { isPreview: true })
        : request.source.requiresFederated && request.source.attachDatabases?.length
        ? await executeFederatedQuery({ sql, attachDatabases: request.source.attachDatabases, isPreview: true })
        : await executeDuckDBSQL(sql);
      return plotAggregation(response.data ?? [], request.spec, rowLabel, dates.includes(request.spec.x ?? ''));
    },
    onSuccess: (plot, request) => {
      if (request.ticket === previewEpoch.current) {
        setPreview({ spec: request.spec, plot, scope: request.scope }); setError(null);
        const width = workspaceRef.current?.clientWidth ?? 0;
        if (width > 0 && width < 768) setSettings(false);
      }
    },
    onError: (failure, request) => { if (request.ticket === previewEpoch.current) setError(failure instanceof Error ? failure.message : t('query.chart.previewFailed')); },
  });

  React.useEffect(() => {
    aiEpoch.current += 1;
    previewEpoch.current += 1;
    const next = initial;
    setApplied({ spec: next, plot: plotQueryRows(rows, next, rowLabel, dates.includes(next.x ?? '')), scope: 'current' });
    setDraft(next); setPreview(null); setAiSuggestion(null); setError(null); setScope('current'); setDrilldown(null);
    setCustomTitle(''); setUnits({});
    ai.reset(); aggregation.reset();
    // Result identity includes values, types and source, not just column names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, columnSignature, sourceSignature]);

  const changeDraft = (changes: Partial<ChartSpec>) => {
    previewEpoch.current += 1;
    setDraft((current) => ({ ...current, ...changes }));
    setPreview(null); setError(null); aggregation.reset();
  };
  const previewChart = (proposal: ChartSpec) => {
    const ticket = ++previewEpoch.current;
    setDraft(proposal); setPreview(null); setError(null); setDrilldown(null);
    if (proposal.dataMode === 'aggregate') {
      if (!source.sql) { setError(t('query.chart.noSource')); return; }
      aggregation.mutate({ ticket, spec: proposal, scope, source, previewLimit: rows.length });
    } else {
      if (!proposal.y.length) { setError(t('query.chart.chooseMetric')); return; }
      if (proposal.type === 'kpi' && rows.length !== 1) { setError(t('query.chart.singleRowRequired')); return; }
      setPreview({ spec: proposal, plot: plotQueryRows(rows, proposal, rowLabel, dates.includes(proposal.x ?? '')), scope: 'current' });
      const width = workspaceRef.current?.clientWidth ?? 0;
      if (width > 0 && width < 768) setSettings(false);
    }
  };
  const recommend = () => {
    setError(null);
    ai.mutate({ ticket: ++aiEpoch.current, goal, columns, rows, sql: source.sql, truncated });
  };
  const shown = preview ?? applied;
  const canExpand = truncated || (source.baseSql != null && source.baseSql !== source.sql);
  const unit = units[unitKey(shown.spec)] ?? '';
  const suggestions = React.useMemo(() => chartRecommendations(columns, rows, goal), [columns, rows, goal]);
  const recipe = (spec: ChartSpec) => JSON.stringify([spec.type, spec.x, spec.y, spec.dataMode ?? 'rows',
    spec.dataMode === 'aggregate' ? spec.agg : null, spec.dataMode === 'aggregate' ? spec.xBin ?? null : null,
    (spec.type === 'bar' || spec.type === 'area') && !!spec.stacked]);
  const draftDirty = recipe(draft) !== recipe(applied.spec) || (draft.dataMode === 'aggregate' && scope !== applied.scope);
  const basis = shown.spec.dataMode === 'aggregate'
    ? t(shown.scope === 'query' ? 'query.chart.queryScope' : 'query.chart.currentScope')
    : t(truncated ? 'query.chart.previewRows' : 'query.chart.currentRows', { count: rows.length });
  const measureTitle = shown.spec.y.length ? shown.spec.y.join(' · ') : shown.spec.dataMode === 'aggregate' ? rowLabel : t('query.chart.chooseMetric');
  const title = customTitle.trim() || `${measureTitle}${shown.spec.x ? ` · ${shown.spec.x}` : ''}`;
  const observedDates = shown.spec.x && dates.includes(shown.spec.x)
    ? shown.plot.data.map((point) => String(point.dim)).filter((value) => /^\d{4}-\d{2}-\d{2}/.test(value)).sort() : [];
  const chart = () => !shown.spec.y.length && shown.spec.dataMode !== 'aggregate'
    ? <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground"><BarChart3 className="size-8" /><p className="text-sm">{t('query.chart.chooseMetric')}</p><p className="max-w-md text-xs">{t('query.chart.metricGuidance')}</p><Button variant="outline" size="sm" onClick={() => setSettings(true)}>{t('query.chart.configure')}</Button></div>
    : shown.plot.temporal && !shown.plot.data.length
      ? <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">{t('query.chart.noValidDates')}</div>
      : <ChartCanvas spec={shown.spec} {...shown.plot} locale={locale} unit={unit.trim()} onElementClick={onDrilldown ? (dim, event) => {
      const sql = buildDrilldownSql(shown.spec, dim, shown.scope === 'query' ? source.baseSql ?? source.sql : source.sql,
        { previewLimit: shown.scope === 'current' ? rows.length : undefined });
      if (sql) setDrilldown({ sql, dim, x: event.clientX, y: event.clientY });
    } : undefined} />;

  if (!rows.length || !columns.length) return <div className="p-6 text-sm text-muted-foreground">{t('query.chart.empty')}</div>;

  const workspace = <div ref={workspaceRef} className={`@container flex h-full min-h-80 flex-col bg-background ${full ? 'rounded-md' : 'rounded-md border border-border'}`}>
    <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 ${full ? 'pr-12' : ''}`}>
      <div className="min-w-0"><h3 className="truncate text-sm font-medium">{title}</h3><p className="mt-1 text-xs text-muted-foreground">{basis}</p>{observedDates.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{t('query.chart.dateRange', { start: observedDates[0].slice(0, 10), end: observedDates[observedDates.length - 1].slice(0, 10) })}</p>}</div>
      <div className="flex items-center gap-1">
        {(settings || draftDirty) && <Button variant="secondary" size="sm" disabled={!draftDirty || !!preview || aggregation.isPending} onClick={() => previewChart(draft)}>{aggregation.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}{t('query.chart.preview')}</Button>}
        <Button variant={settings ? 'secondary' : 'ghost'} size="sm" aria-expanded={settings} onClick={() => setSettings((open) => !open)}><SlidersHorizontal className="mr-2 size-4" />{t('query.chart.configure')}</Button>
        {!full && <Button ref={focusButtonRef} variant="ghost" size="sm" aria-label={t('query.chart.focus')} onClick={() => setFull(true)}><Maximize2 className="mr-2 size-4" />{t('query.chart.focus')}</Button>}
      </div>
    </div>
    {preview && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2" role="status">
      <span className="text-xs font-medium">{t('query.chart.previewHint')}</span>
      <div className="flex gap-1"><Button size="sm" onClick={() => { setApplied(preview); setPreview(null); }}><Check className="mr-1 size-4" />{t('query.chart.apply')}</Button>
        <Button size="sm" variant="ghost" onClick={() => setPreview(null)}><RotateCcw className="mr-1 size-4" />{t('query.chart.discard')}</Button></div>
    </div>}
    {!preview && draftDirty && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-2" role="status">
      <p className="min-w-0 flex-1 text-xs">{t('query.chart.draftHint', { x: applied.spec.x ?? t('query.chart.noDimension'), y: applied.spec.y.join(' · ') || rowLabel })}</p>
      <Button variant="ghost" size="sm" onClick={() => { previewEpoch.current += 1; setDraft(applied.spec); setScope(applied.scope); setError(null); setPreview(null); aggregation.reset(); }}>{t('query.chart.resetDraft')}</Button>
    </div>}
    <div className="flex min-h-0 flex-1 flex-col overflow-auto @3xl:flex-row @3xl:overflow-hidden">
      <div className="relative order-2 flex min-h-48 min-w-0 flex-1 flex-col px-3 pb-3 pt-4 @3xl:order-1">
        {aggregation.isPending && <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded bg-background px-2 py-1 text-xs" role="status"><Loader2 className="size-4 animate-spin" />{t('query.chart.loadingPreview')}</div>}
        <div className="min-h-0 flex-1 text-xs">{chart()}</div>
        {shown.plot.timeSampled ? <p className="mt-2 text-xs text-muted-foreground">{t('query.chart.timeSample', { count: shown.plot.data.length, total: shown.plot.data.length + shown.plot.omitted })}</p>
          : shown.plot.omitted > 0 && <p className="mt-2 text-xs text-muted-foreground">{t('query.chart.pointLimit', { count: shown.plot.omitted })}</p>}
        {!!shown.plot.excludedDates && <p className="mt-2 text-xs text-muted-foreground">{t('query.chart.excludedDates', { count: shown.plot.excludedDates })}</p>}
        {!!shown.plot.duplicateDates && <p className="mt-2 text-xs text-muted-foreground">{t('query.chart.duplicateDates')}</p>}
        {shown.spec.dataMode === 'aggregate' && <p className="mt-2 text-xs text-muted-foreground">{t('query.chart.groupLimit')}</p>}
      </div>
      {settings && <aside className="order-1 max-h-80 w-full shrink-0 space-y-4 overflow-auto border-b border-border p-4 @3xl:order-2 @3xl:max-h-none @3xl:w-72 @3xl:border-b-0 @3xl:border-l" aria-label={t('query.chart.configure')}>
        <div className="flex items-center justify-between"><h4 className="text-sm font-medium">{t('query.chart.settingsTitle')}</h4><Button variant="ghost" size="icon" aria-label={t('query.chart.closeSettings')} onClick={() => setSettings(false)}><X className="size-4" /></Button></div>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor={`${formId}-type`}>{t('query.chart.type')}</Label><Select value={draft.type} onValueChange={(value) => changeDraft({ type: value as ChartType })}>
            <SelectTrigger id={`${formId}-type`} aria-label={t('query.chart.type')}><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((value) => <SelectItem key={value} value={value}>{t(`query.chart.${value}`)}</SelectItem>)}</SelectContent>
          </Select></div>
          {draft.type !== 'kpi' && <div className="space-y-1.5"><Label htmlFor={`${formId}-x`}>{t('query.chart.dimension')}</Label><Select value={draft.x ?? ''} onValueChange={(value) => changeDraft({ x: value, xBin: null })}>
            <SelectTrigger id={`${formId}-x`} aria-label={t('query.chart.dimension')}><SelectValue /></SelectTrigger><SelectContent>{columns.map((column) => <SelectItem key={column.name} value={column.name}>{column.name}</SelectItem>)}</SelectContent>
          </Select></div>}
          {goal === 'trend' && draft.x && !dates.includes(draft.x) && <p className="text-xs text-muted-foreground">{t('query.chart.nonDateTrend')}</p>}
          <div className="space-y-1.5"><Label htmlFor={`${formId}-y`}>{t('query.chart.metric')}</Label><Select value={draft.y[0] ? `field:${draft.y[0]}` : 'rows'} onValueChange={(value) => changeDraft({ y: value === 'rows' ? [] : [value.slice(6)], ...(value === 'rows' ? { dataMode: 'aggregate' as const, agg: 'count' as const } : {}) })}>
            <SelectTrigger id={`${formId}-y`} aria-label={t('query.chart.metric')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="rows">{rowLabel}</SelectItem>{columns.map((column) => <SelectItem key={column.name} value={`field:${column.name}`}>{column.name}</SelectItem>)}</SelectContent>
          </Select></div>
          {draft.y.some((name) => !suggestedMetrics.includes(name)) && (draft.dataMode !== 'aggregate' || draft.agg !== 'count') && <p className="text-xs text-muted-foreground">{t('query.chart.manualMetricHint')}</p>}
        </div>
        {draft.dataMode === 'aggregate' && <p className="text-xs text-muted-foreground" aria-label={t('query.chart.calculation')}>
          {t('query.chart.regroup')} · {t(`query.chart.aggregations.${draft.agg}`)}{draft.xBin ? ` · ${t(`query.chart.${draft.xBin}`)}` : ''}
          {scope === 'query' && <span className="block">{t('query.chart.expandScope')}</span>}
        </p>}
        <Accordion type="multiple" value={sections} onValueChange={setSections}>
          <AccordionItem value="advanced"><AccordionTrigger className="py-3 text-sm">{t('query.chart.advanced')}</AccordionTrigger><AccordionContent className="space-y-3 pt-2">
            <div className="space-y-1.5"><Label htmlFor={`${formId}-mode`}>{t('query.chart.calculation')}</Label><Select value={draft.dataMode ?? 'rows'} onValueChange={(value) => changeDraft({ dataMode: value as ChartSpec['dataMode'], xBin: null })}>
              <SelectTrigger id={`${formId}-mode`} aria-label={t('query.chart.calculation')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="rows">{t('query.chart.direct')}</SelectItem><SelectItem value="aggregate" disabled={!source.sql}>{t('query.chart.regroup')}</SelectItem></SelectContent>
            </Select></div>
            {draft.dataMode === 'aggregate' && <>
              <div className="space-y-1.5"><Label htmlFor={`${formId}-agg`}>{t('query.chart.agg')}</Label><Select value={draft.agg} disabled={!draft.y.length} onValueChange={(value) => changeDraft({ agg: value as AggFn })}>
                <SelectTrigger id={`${formId}-agg`} aria-label={t('query.chart.agg')}><SelectValue /></SelectTrigger><SelectContent>{AGGS.map((value) => <SelectItem key={value} value={value}>{t(`query.chart.aggregations.${value}`)}</SelectItem>)}</SelectContent>
              </Select></div>
              {draft.x && dates.includes(draft.x) && draft.type !== 'kpi' && <div className="space-y-1.5"><Label htmlFor={`${formId}-bin`}>{t('query.chart.bin')}</Label><Select value={draft.xBin ?? 'none'} onValueChange={(value) => changeDraft({ xBin: value === 'none' ? null : value as 'day' | 'month' })}>
                <SelectTrigger id={`${formId}-bin`} aria-label={t('query.chart.bin')}><SelectValue /></SelectTrigger><SelectContent>{['none', 'day', 'month'].map((value) => <SelectItem key={value} value={value}>{t(`query.chart.${value}`)}</SelectItem>)}</SelectContent>
              </Select></div>}
              {canExpand && <div className="flex items-start gap-2"><Checkbox id={`${formId}-scope`} checked={scope === 'query'} onCheckedChange={(checked) => { previewEpoch.current += 1; setScope(checked ? 'query' : 'current'); setPreview(null); }} /><Label className="text-xs leading-relaxed" htmlFor={`${formId}-scope`}>{t('query.chart.expandScope')}</Label></div>}
              <p className="text-xs text-muted-foreground">{t('query.chart.queryWarning')}</p>
            </>}
            {(draft.type === 'bar' || draft.type === 'area') && <div className="flex items-center gap-2"><Checkbox id={`${formId}-stack`} checked={!!draft.stacked} onCheckedChange={(checked) => changeDraft({ stacked: !!checked })} /><Label htmlFor={`${formId}-stack`}>{t('query.chart.stacked')}</Label></div>}
            <div className="space-y-1.5"><Label htmlFor={`${formId}-title`}>{t('query.chart.title')}</Label><Input id={`${formId}-title`} value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} placeholder={t('query.chart.autoTitle')} maxLength={80} /></div>
            <div className="space-y-1.5"><Label htmlFor={`${formId}-unit`}>{t('query.chart.unit')}</Label><Input id={`${formId}-unit`} value={units[unitKey(draft)] ?? ''} onChange={(event) => { const value = event.target.value; setUnits((current) => ({ ...current, [unitKey(draft)]: value })); }} placeholder={t('query.chart.unitHint')} maxLength={16} /></div>
          </AccordionContent></AccordionItem>
          <AccordionItem value="recommendations" className="border-0"><AccordionTrigger className="py-3 text-sm">{t('query.chart.recommendations')}</AccordionTrigger><AccordionContent className="space-y-4 pt-2">
            <div className="space-y-2"><Label htmlFor={`${formId}-goal`}>{t('query.chart.goal')}</Label>
              <div className="flex items-center gap-2"><Select value={goal} onValueChange={(value) => { aiEpoch.current += 1; setGoal(value as ChartGoal); setAiSuggestion(null); ai.reset(); }}>
                <SelectTrigger className="min-w-0 flex-1" id={`${formId}-goal`} aria-label={t('query.chart.goal')}><SelectValue /></SelectTrigger>
                <SelectContent>{GOALS.map((value) => <SelectItem key={value} value={value}>{t(`query.chart.goals.${value}`)}</SelectItem>)}</SelectContent>
              </Select>{aiEnabled && <Button variant="outline" size="sm" className="shrink-0" disabled={ai.isPending} onClick={recommend}>{ai.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Sparkles className="mr-1 size-4" />}{t('query.chart.suggest')}</Button>}</div>
            </div>
            {aiEnabled ? <p className="text-xs text-muted-foreground">{t('query.chart.aiScope')}</p> : <p className="text-xs text-muted-foreground">{t('query.chart.aiDisabled')}</p>}
            {aiSuggestion && <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
              <p className="text-sm font-medium">{t('query.chart.aiCandidate', { type: t(`query.chart.${aiSuggestion.type}`) })}</p>
              <p className="text-xs">{t(aiSuggestion.dataMode === 'aggregate' ? 'query.chart.regroup' : 'query.chart.direct')} · {aiSuggestion.y.join(' · ') || rowLabel}{aiSuggestion.dataMode === 'aggregate' ? ` · ${t(`query.chart.aggregations.${aiSuggestion.agg}`)}` : ''}</p>
              <p className="text-xs text-muted-foreground">{aiSuggestion.reason || t('query.chart.noReason')}</p>
              {aiSuggestion.dataMode === 'aggregate' && <p className="text-xs text-muted-foreground">{t('query.chart.queryWarning')}</p>}
              <Button size="sm" variant="secondary" className="w-full" onClick={() => previewChart(aiSuggestion)}>{t('query.chart.previewAi')}</Button>
            </div>}
            <div className="divide-y divide-border">{suggestions.map((candidate) => <Button key={candidate.id} variant="ghost" className="h-auto w-full justify-between gap-2 rounded-none px-0 py-3 text-left" aria-label={t('query.chart.previewCandidate', { type: t(`query.chart.${candidate.titleKey ?? candidate.spec.type}`) })} onClick={() => previewChart(candidate.spec)}>
              <span className="min-w-0"><span className="block text-sm font-medium">{t(`query.chart.${candidate.titleKey ?? candidate.spec.type}`)}</span><span className="mt-1 block whitespace-normal text-xs font-normal text-muted-foreground">{t(`query.chart.${candidate.reason}`)}</span></span><ChevronRight className="size-4 shrink-0" />
            </Button>)}</div>
            {!suggestions.length && <p className="text-xs text-muted-foreground">{t('query.chart.noCandidates')}</p>}
          </AccordionContent></AccordionItem>
        </Accordion>
      </aside>}
    </div>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-destructive"><span>{error}</span><Button size="sm" variant="ghost" onClick={() => setError(null)}>{t('query.chart.dismiss')}</Button></div>}
  </div>;
  return <>
    {!full && workspace}
    <Dialog open={full} onOpenChange={setFull}><DialogContent className="flex h-5/6 w-full max-w-7xl flex-col gap-0 p-0 sm:max-w-7xl" onCloseAutoFocus={(event) => { event.preventDefault(); focusButtonRef.current?.focus(); }}><DialogHeader className="sr-only"><DialogTitle>{title}</DialogTitle><DialogDescription>{basis}</DialogDescription></DialogHeader>{full && workspace}</DialogContent></Dialog>
    <Popover open={!!drilldown} onOpenChange={(open) => { if (!open) setDrilldown(null); }}><PopoverAnchor asChild><div style={{ position: 'fixed', left: drilldown?.x ?? 0, top: drilldown?.y ?? 0, width: 0, height: 0 }} /></PopoverAnchor><PopoverContent className="w-auto p-1" side="top" align="center">{drilldown && <Button size="sm" variant="ghost" onClick={() => { onDrilldown?.(drilldown.sql); setDrilldown(null); }}><Table2 className="mr-1 size-4" />{t('query.chart.drilldownView', { value: drilldown.dim })}</Button>}</PopoverContent></Popover>
  </>;
}
