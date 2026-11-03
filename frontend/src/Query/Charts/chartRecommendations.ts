import { capCategories, classifyColumns, defaultSpec, isDateType, metricCandidates, type ChartSpec, type ColumnInfo } from './chartSpec';

export type ChartGoal = 'auto' | 'trend' | 'compare' | 'share' | 'metric';
export interface ChartRecommendation { id: string; spec: ChartSpec; reason: string; titleKey?: string }
export interface ChartPlot {
  data: Array<Record<string, unknown>>;
  metricKeys: string[];
  labels: Record<string, string>;
  kpi?: unknown;
  omitted: number;
  excludedDates?: number;
  duplicateDates?: number;
  timeSampled?: boolean;
  temporal?: boolean;
}

function chartCoordinate(value: unknown): number | null {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function chartResultSummary(columns: ColumnInfo[], rows: Array<Record<string, unknown>>, truncated: boolean) {
  return {
    row_count: rows.length, truncated, measure_candidates: metricCandidates(columns, rows),
    columns: columns.slice(0, 64).map((column) => {
      const values = rows.map((row) => row[column.name]).filter((value) => value != null).map(String);
      const dates = isDateType(column.type) ? [...values].sort() : [];
      return { ...column, distinct_count: new Set(values).size, null_count: rows.length - values.length,
        ...(dates.length ? { observed_min: dates[0], observed_max: dates[dates.length - 1] } : {}) };
    }),
  };
}

export function chartSamples(rows: Array<Record<string, unknown>>, columns: ColumnInfo[]) {
  const indexes = new Set(Array.from({ length: Math.min(5, rows.length) }, (_, i) => Math.floor(i * (rows.length - 1) / Math.max(1, Math.min(5, rows.length) - 1))));
  return [...indexes].map((index) => Object.fromEntries(columns.slice(0, 64).map(({ name }) => {
    const value = rows[index][name];
    return [name, typeof value === 'string' ? value.slice(0, 160) : typeof value === 'number' || typeof value === 'boolean' || value == null ? value : null];
  })));
}

export function chartRecommendations(columns: ColumnInfo[], rows: Array<Record<string, unknown>>, goal: ChartGoal): ChartRecommendation[] {
  const initial = defaultSpec(columns, rows);
  const base: ChartSpec = initial.y.length ? initial : { ...initial, dataMode: 'aggregate', agg: 'count' };
  const { dates, dims } = classifyColumns(columns);
  const category = dims.find((name) => !dates.includes(name));
  const options: ChartRecommendation[] = [];
  if ((goal === 'auto' || goal === 'trend') && dates.length) {
    if (base.y.length && rows.length > 200) options.push({ id: 'daily-count', titleKey: 'dailyCountTitle', spec: { ...base, type: 'line', x: dates[0], y: [], agg: 'count', xBin: 'day', dataMode: 'aggregate' }, reason: 'dailyCountReason' });
    options.push({ id: 'trend', spec: { ...base, type: 'line', x: dates[0], xBin: base.y.length ? null : 'day' }, reason: base.y.length ? 'trendReason' : 'dailyCountReason' });
    options.push({ id: 'area', spec: { ...base, type: 'area', x: dates[0], xBin: base.y.length ? null : 'day' }, reason: base.y.length ? 'areaReason' : 'dailyCountReason' });
  }
  if ((goal === 'auto' || goal === 'compare') && (category || base.x)) {
    options.push({ id: 'compare', spec: { ...base, type: 'bar', x: category ?? base.x, xBin: null }, reason: base.y.length ? 'compareReason' : 'countReason' });
  }
  if (goal === 'share' && category && base.y.length) {
    const values = rows.map((row) => row[category]);
    const unique = new Set(values.map(String)).size;
    if (unique >= 2 && unique <= 12 && unique === rows.length && rows.every((row) => row[base.y[0]] != null && Number(row[base.y[0]]) >= 0)) {
      for (const type of ['bar', 'donut', 'pie'] as const) options.push({ id: type, spec: { ...base, type, x: category, xBin: null }, reason: 'shareReason' });
    }
  }
  if ((goal === 'auto' || goal === 'metric') && rows.length === 1 && base.y.length) {
    options.push({ id: 'metric', spec: { ...base, type: 'kpi', x: null, xBin: null }, reason: 'metricReason' });
  }
  if ((goal === 'auto' || goal === 'metric') && !base.y.length) {
    options.push({ id: 'row-count', spec: { ...base, type: 'kpi', x: null, xBin: null }, reason: 'countReason' });
  }
  return options.slice(0, 3);
}

/** No reaggregation, casts or sampling beyond the explicit chart point limit. */
export function plotQueryRows(rows: Array<Record<string, unknown>>, spec: ChartSpec, rowLabel: string, temporal = false): ChartPlot {
  const metricKeys = spec.y.map((_, i) => `value_${i}`);
  const labels = Object.fromEntries(metricKeys.map((key, i) => [key, spec.y[i]]));
  if (spec.type === 'kpi') return { data: [], metricKeys, labels, kpi: rows.length === 1 ? rows[0]?.[spec.y[0]] : undefined, omitted: 0 };
  const limit = spec.type === 'pie' || spec.type === 'donut' ? (spec.dataMode === 'aggregate' ? 13 : 12) : 200;
  const timePlot = temporal && !!spec.x && !['pie', 'donut'].includes(spec.type);
  let ordered = rows;
  let excludedDates = 0;
  let duplicateDates = 0;
  if (timePlot) {
    const valid = rows.map((row) => {
      const value = row[spec.x!];
      const text = value == null ? '' : String(value).trim();
      return { row, text, time: text ? Date.parse(text.replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T')) : NaN };
    }).filter((point) => Number.isFinite(point.time));
    valid.sort((a, b) => a.time - b.time || a.text.localeCompare(b.text));
    ordered = valid.map((point) => point.row);
    excludedDates = rows.length - ordered.length;
    duplicateDates = valid.length - new Set(valid.map((point) => point.text)).size;
  }
  const sampled = timePlot && ordered.length > limit;
  const selected = sampled ? Array.from({ length: limit }, (_, index) => ordered[Math.floor(index * (ordered.length - 1) / (limit - 1))]) : ordered.slice(0, limit);
  return {
    metricKeys, labels, omitted: Math.max(0, ordered.length - limit), excludedDates, duplicateDates, timeSampled: sampled, temporal: timePlot,
    data: selected.map((row, index) => ({
      dim: spec.x ? String(row[spec.x] ?? '∅') : `${rowLabel} ${index + 1}`,
      ...Object.fromEntries(metricKeys.map((key, i) => [key, chartCoordinate(row[spec.y[i]])])),
      rawValues: Object.fromEntries(metricKeys.map((key, i) => [key, row[spec.y[i]]])),
    })),
  };
}

export function plotAggregation(rows: Array<Record<string, unknown>>, spec: ChartSpec, rowLabel: string, temporal = false): ChartPlot {
  if (spec.type === 'kpi') return { data: [], metricKeys: ['value_0'], labels: { value_0: spec.y[0] ?? rowLabel }, kpi: rows[0]?.metric, omitted: 0 };
  const names = spec.y.length ? spec.y : [rowLabel];
  const keys = names.map((_, index) => `value_${index}`);
  const values = rows.map((row) => Object.fromEntries([
    ['dim', String(row.dim ?? '∅')], ...keys.map((key, i) => [key, row[`m_${i}`] as string | number | null]),
  ]));
  const limited = spec.type === 'pie' || spec.type === 'donut' ? capCategories(values, keys, spec.agg, 12) : values;
  const specForPlot = { ...spec, dataMode: 'aggregate' as const, x: 'dim', y: keys };
  const plot = plotQueryRows(limited, specForPlot, rowLabel, temporal);
  return { ...plot, labels: Object.fromEntries(plot.metricKeys.map((key, i) => [key, names[i]])), omitted: 0 };
}
