import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Maximize2, Loader2, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { showErrorToast } from '@/utils/toastHelpers';
import { suggestChart } from '@/api/aiApi';
import { executeDuckDBSQL, executeFederatedQuery } from '@/api/queryApi';
import {
  classifyColumns, defaultSpec, validateSpec, buildChartSql, buildDrilldownSql, aggregateRows, capCategories,
  type ChartSpec, type ChartType, type AggFn, type ColumnInfo,
} from './chartSpec';
import { ChartCanvas } from './ChartCanvas';

export interface ChartSource {
  sql: string | null;
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
  /** 点击图表元素下钻:收到明细 SQL 后由调用方负责填入编辑器(不自动执行)。 */
  onDrilldown?: (sql: string) => void;
}

const TYPES: ChartType[] = ['bar', 'line', 'area', 'pie', 'donut', 'kpi'];
const AGGS: AggFn[] = ['sum', 'count', 'avg', 'min', 'max'];

export function ChartView({ columns, rows, truncated, source, aiEnabled, locale = 'zh', onDrilldown }: ChartViewProps) {
  const { t } = useTranslation('common');
  const { metrics, dates } = React.useMemo(() => classifyColumns(columns), [columns]);
  const [spec, setSpec] = React.useState<ChartSpec>(() => defaultSpec(columns));
  const [full, setFull] = React.useState(false);
  const [suggesting, setSuggesting] = React.useState(false);
  const [serverAgg, setServerAgg] = React.useState<{ data: any[]; metricKeys: string[]; kpi?: number } | null>(null);
  const [loadingAgg, setLoadingAgg] = React.useState(false);
  const [drilldownClick, setDrilldownClick] = React.useState<{ dim: string; sql: string; x: number; y: number } | null>(null);

  React.useEffect(() => {
    let alive = true;
    setSpec(defaultSpec(columns));
    setServerAgg(null);
    if (aiEnabled && columns.length) {
      setSuggesting(true);
      suggestChart(columns, rows.slice(0, 5), { locale })
        .then((s) => { if (alive) setSpec(validateSpec(s as ChartSpec, columns)); })
        .catch(() => {})
        .finally(() => { if (alive) setSuggesting(false); });
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(columns.map((c) => c.name))]);

  React.useEffect(() => {
    if (!truncated || !source.sql) { setServerAgg(null); return; }
    let alive = true;
    const chartSql = buildChartSql(source.sql, spec);
    setLoadingAgg(true);
    const run = source.requiresFederated && source.attachDatabases?.length
      ? executeFederatedQuery({ sql: chartSql, attachDatabases: source.attachDatabases, isPreview: true })
      : executeDuckDBSQL(chartSql);
    Promise.resolve(run)
      .then((resp: any) => {
        if (!alive) return;
        // QueryResponse uses .data (not .rows) for result rows
        const rs: any[] = resp.data || [];
        if (spec.type === 'kpi') {
          setServerAgg({ data: [], metricKeys: spec.y.length ? spec.y : ['count'], kpi: Number(rs[0]?.metric ?? 0) });
        } else {
          const metricKeys = spec.y.length ? spec.y : ['count'];
          const rawData = rs.map((r) => {
            const item: Record<string, any> = { dim: r.dim };
            if (spec.y.length) spec.y.forEach((y, i) => (item[y] = Number(r[`m_${i}`])));
            else item['count'] = Number(r['m_0']);
            return item;
          });
          // 饼/环类目过多无法读 → 封顶 12 + 其它(柱/线无需)
          const data =
            spec.type === 'pie' || spec.type === 'donut'
              ? capCategories(rawData, metricKeys, spec.agg, 12)
              : rawData;
          setServerAgg({ data, metricKeys });
        }
      })
      .catch((e) => { if (alive) { setServerAgg(null); showErrorToast(t, e as Error, t('query.chart.empty', '无可视化数据')); } })
      .finally(() => { if (alive) setLoadingAgg(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truncated, source.sql, JSON.stringify(spec)]);

  const clientAgg = React.useMemo(() => aggregateRows(rows, spec), [rows, spec]);
  const usingServer = truncated && !!source.sql && !!serverAgg;
  const agg = usingServer ? serverAgg! : clientAgg;
  const basis = usingServer
    ? t('query.chart.basisFull', '全量(聚合)')
    : truncated
      ? t('query.chart.basisRows', '基于前 {{n}} 行(可能不全)', { n: rows.length })
      : t('query.chart.basisFull', '全量(聚合)');

  // Hooks must run unconditionally, so this is declared before the early return below.
  const handleElementClick = React.useCallback(
    (dim: string, event: { clientX: number; clientY: number }) => {
      const sql = buildDrilldownSql(spec, dim, source.sql);
      if (!sql) return;
      setDrilldownClick({ dim, sql, x: event.clientX, y: event.clientY });
    },
    [spec, source.sql],
  );

  if (!columns.length || !rows.length) {
    return <div className="p-6 text-sm text-muted-foreground">{t('query.chart.empty', '无可视化数据')}</div>;
  }

  // 维度(X)开放全部列:业务表里 TINYINT/INT 编码字段(类型/渠道等)是常用分组维度,
  // 只是默认选中仍偏向日期/文本列(defaultSpec 用 dims)
  const xOptions = spec.type === 'kpi' ? [] : columns.map((c) => c.name);

  const renderChart = () => (
    <ChartCanvas
      spec={spec}
      data={agg.data}
      metricKeys={agg.metricKeys}
      kpi={agg.kpi}
      onElementClick={onDrilldown ? handleElementClick : undefined}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
        <Select value={spec.type} onValueChange={(v) => setSpec((s) => ({ ...s, type: v as ChartType }))}>
          <SelectTrigger className="h-7 w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{TYPES.map((tp) => <SelectItem key={tp} value={tp}>{t(`query.chart.${tp}`, tp)}</SelectItem>)}</SelectContent>
        </Select>
        {spec.type !== 'kpi' && (
          <Select value={spec.x ?? ''} onValueChange={(v) => setSpec((s) => ({ ...s, x: v, xBin: dates.includes(v) ? (s.xBin ?? 'day') : null }))}>
            <SelectTrigger className="h-7 w-32"><SelectValue placeholder={t('query.chart.dimension', '维度(X)')} /></SelectTrigger>
            <SelectContent>{xOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {metrics.length > 0 && (
          <Select value={spec.y[0] ?? ''} onValueChange={(v) => setSpec((s) => ({ ...s, y: v ? [v] : [] }))}>
            <SelectTrigger className="h-7 w-32"><SelectValue placeholder={t('query.chart.metric', '指标(Y)')} /></SelectTrigger>
            <SelectContent>{metrics.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Select value={spec.agg} onValueChange={(v) => setSpec((s) => ({ ...s, agg: v as AggFn }))}>
          <SelectTrigger className="h-7 w-20"><SelectValue /></SelectTrigger>
          <SelectContent>{AGGS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
        </Select>
        {spec.x && dates.includes(spec.x) && spec.type !== 'kpi' && (
          <Select value={spec.xBin ?? 'day'} onValueChange={(v) => setSpec((s) => ({ ...s, xBin: v as 'day' | 'month' }))}>
            <SelectTrigger className="h-7 w-20"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="day">{t('query.chart.day', '按天')}</SelectItem><SelectItem value="month">{t('query.chart.month', '按月')}</SelectItem></SelectContent>
          </Select>
        )}
        {aiEnabled && (
          <Button variant="ghost" size="sm" disabled={suggesting} onClick={() => {
            setSuggesting(true);
            suggestChart(columns, rows.slice(0, 5), { locale })
              .then((s) => setSpec(validateSpec(s as ChartSpec, columns)))
              .catch((e) => showErrorToast(t, e as Error, t('query.chart.suggest', 'AI 推荐')))
              .finally(() => setSuggesting(false));
          }}>
            {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="ml-1">{t('query.chart.suggest', 'AI 推荐')}</span>
          </Button>
        )}
        <span className="ml-auto flex items-center gap-2 text-muted-foreground">
          <span className="rounded bg-muted px-1.5 py-0.5">{basis}</span>
          <Button variant="ghost" size="sm" onClick={() => setFull(true)} title={t('query.chart.fullscreen', '全屏')}>
            <Maximize2 className="h-4 w-4" />
          </Button>
        </span>
      </div>
      <div className="relative min-h-0 flex-1 p-2">
        {loadingAgg && <div className="absolute right-3 top-3 z-10"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
        {renderChart()}
      </div>
      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent className="h-[85vh] w-[92vw] max-w-none p-4">
          <div className="h-full w-full">{renderChart()}</div>
        </DialogContent>
      </Dialog>
      <Popover open={!!drilldownClick} onOpenChange={(open) => { if (!open) setDrilldownClick(null); }}>
        <PopoverAnchor asChild>
          <div style={{ position: 'fixed', left: drilldownClick?.x ?? 0, top: drilldownClick?.y ?? 0, width: 0, height: 0 }} />
        </PopoverAnchor>
        <PopoverContent className="w-auto p-1" side="top" align="center">
          {drilldownClick && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onDrilldown?.(drilldownClick.sql);
                setDrilldownClick(null);
              }}
            >
              <Table2 className="h-4 w-4 mr-1" />
              {t('query.chart.drilldownView', '查看 "{{value}}" 的明细', { value: drilldownClick.dim })}
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
