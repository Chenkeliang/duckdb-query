import { useEffect, useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { ChartSpec } from './chartSpec';
import { formatChartValue } from './chartNumbers';

function readChartColors() {
  if (typeof document === 'undefined') return { series: Array<string>(7).fill('currentColor'), axis: 'currentColor', grid: 'currentColor' };
  const css = getComputedStyle(document.documentElement);
  return {
    series: Array.from({ length: 7 }, (_, i) => css.getPropertyValue(`--chart-${i + 1}`).trim() || 'currentColor'),
    axis: `hsl(${css.getPropertyValue('--muted-foreground').trim()})`,
    grid: `hsl(${css.getPropertyValue('--border').trim()})`,
  };
}

function useChartColors() {
  const [colors, setColors] = useState(readChartColors);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readChartColors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return colors;
}

interface TooltipEntry {
  dataKey?: string | number | ((...args: unknown[]) => unknown);
  name?: string | number;
  value?: unknown;
  payload?: Record<string, unknown>;
}
export interface ChartTooltipProps {
  active?: boolean;
  label?: unknown;
  payload?: readonly TooltipEntry[];
  labels?: Record<string, string>;
  locale?: string;
  unit?: string;
}

/** SVG coordinates may be approximate; tooltip text uses the original backend scalar. */
export function ChartTooltipContent({ active, label, payload, labels = {}, locale = 'zh', unit = '' }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const title = label ?? payload[0]?.payload?.dim;
  return <div className="min-w-40 rounded-md border border-border-strong bg-surface-elevated px-3 py-2 text-xs text-foreground shadow-md">
    {title != null && <p className="mb-2 font-medium">{String(title)}</p>}
    <dl className="space-y-1.5">{payload.map((entry, index) => {
      const key = String(entry.dataKey ?? entry.name ?? index);
      const raw = entry.payload?.rawValues;
      const value = raw && typeof raw === 'object' && key in raw ? (raw as Record<string, unknown>)[key] : entry.value;
      return <div key={key} className="flex items-center justify-between gap-6">
        <dt className="text-muted-foreground">{labels[key] ?? String(entry.name ?? key)}</dt>
        <dd className="font-mono font-medium tabular-nums">{formatChartValue(value, locale)}{unit ? ` ${unit}` : ''}</dd>
      </div>;
    })}</dl>
  </div>;
}

export interface ChartCanvasProps {
  spec: ChartSpec;
  data: Array<Record<string, unknown>>;
  metricKeys: string[];
  labels?: Record<string, string>;
  kpi?: unknown;
  locale?: 'zh' | 'en';
  unit?: string;
  onElementClick?: (dim: string, event: { clientX: number; clientY: number }) => void;
}

export function ChartCanvas({ spec, data, metricKeys, labels = {}, kpi, locale = 'zh', unit = '', onElementClick }: ChartCanvasProps) {
  const colors = useChartColors();
  const { t } = useTranslation('common');
  if (spec.type === 'kpi') return <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-4">
    <p className="text-sm text-muted-foreground">{labels[metricKeys[0]] ?? spec.y[0] ?? t('query.chart.resultRows')}</p>
    <p className="max-w-full break-all text-center font-mono text-4xl font-semibold tabular-nums" title={String(kpi ?? '')}>{formatChartValue(kpi, locale)}{unit && <span className="ml-2 text-lg font-normal">{unit}</span>}</p>
  </div>;
  const tooltip = <Tooltip cursor={{ fill: colors.grid, fillOpacity: 0.2, stroke: colors.grid, strokeOpacity: 0.4 }} content={<ChartTooltipContent labels={labels} locale={locale} unit={unit} />} />;
  const legend = <Legend formatter={(value: string) => <span className="text-xs text-foreground">{labels[value] ?? value}</span>} />;
  if (spec.type === 'pie' || spec.type === 'donut') return <ResponsiveContainer width="100%" height="100%">
    <PieChart accessibilityLayer>
      {tooltip}{legend}
      <Pie data={data} dataKey={metricKeys[0]} nameKey="dim" innerRadius={spec.type === 'donut' ? '55%' : 0} outerRadius="80%"
        cursor={onElementClick ? 'pointer' : undefined}
        onClick={onElementClick ? (entry: { payload?: { dim?: unknown }; name?: unknown }, _index: number, event: MouseEvent) => {
          const dim = entry.payload?.dim ?? entry.name;
          if (dim != null) onElementClick(String(dim), { clientX: event.clientX, clientY: event.clientY });
        } : undefined}>
        {data.map((_, index) => <Cell key={index} fill={colors.series[index % colors.series.length]} />)}
      </Pie>
    </PieChart>
  </ResponsiveContainer>;
  const common = <>
    <CartesianGrid vertical={false} stroke={colors.grid} />
    <XAxis dataKey="dim" tick={{ fill: colors.axis }} tickLine={false} axisLine={false} minTickGap={24} tickMargin={10}
      tickFormatter={(value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[T ]/.test(value) ? value.slice(0, 10) : String(value)} />
    <YAxis tick={{ fill: colors.axis }} tickLine={false} axisLine={false} tickMargin={8} width={72} unit={unit}
      tickFormatter={(value: number) => Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)} />
    {tooltip}{legend}
  </>;
  const onClick = onElementClick ? (state: { activeLabel?: string | number }, event: { clientX?: number; clientY?: number }) => {
    if (state?.activeLabel != null) onElementClick(String(state.activeLabel), { clientX: event?.clientX ?? 0, clientY: event?.clientY ?? 0 });
  } : undefined;
  if (spec.type === 'line') return <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} onClick={onClick} accessibilityLayer>
      {common}{metricKeys.map((key, index) => <Line key={key} type="linear" dataKey={key} name={key} stroke={colors.series[index % colors.series.length]} strokeWidth={2} dot={false} connectNulls={false} />)}
    </LineChart>
  </ResponsiveContainer>;
  if (spec.type === 'area') return <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} onClick={onClick} accessibilityLayer>
      {common}{metricKeys.map((key, index) => <Area key={key} type="linear" dataKey={key} name={key} stackId={spec.stacked ? 'a' : undefined}
        stroke={colors.series[index % colors.series.length]} fill={colors.series[index % colors.series.length]} fillOpacity={0.15} connectNulls={false} />)}
    </AreaChart>
  </ResponsiveContainer>;
  return <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data} accessibilityLayer>
      {common}{metricKeys.map((key, index) => <Bar key={key} dataKey={key} name={key} stackId={spec.stacked ? 'a' : undefined}
        fill={colors.series[index % colors.series.length]} radius={4} cursor={onElementClick ? 'pointer' : undefined}
        onClick={onElementClick ? (entry: { payload?: { dim?: unknown } }, _index: number, event: MouseEvent) => {
          if (entry.payload?.dim != null) onElementClick(String(entry.payload.dim), { clientX: event.clientX, clientY: event.clientY });
        } : undefined} />)}
    </BarChart>
  </ResponsiveContainer>;
}
