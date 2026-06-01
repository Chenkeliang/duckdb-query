/** 查询结果图表 —— 纯函数:列分类 / 默认 spec / 校验 / 生成聚合 SQL / 客户端聚合。 */

export type ChartType = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'kpi';
export type AggFn = 'sum' | 'count' | 'avg' | 'min' | 'max';

export interface ChartSpec {
  type: ChartType;
  x: string | null;
  y: string[];
  agg: AggFn;
  xBin?: 'day' | 'month' | null;
  stacked?: boolean;
}

export interface ColumnInfo {
  name: string;
  type: string;
}

const NUMERIC_RE = /^(int|integer|bigint|smallint|mediumint|tinyint|decimal|numeric|double|float|real)\b/i;

export function isNumericType(type: string): boolean {
  const t = (type || '').trim().toLowerCase();
  if (t.startsWith('bool')) return false;
  return NUMERIC_RE.test(t);
}

export function isDateType(type: string): boolean {
  const t = (type || '').toUpperCase().replace(/\(.*\)/g, '').trim();
  if (t === 'DATE' || t === 'DATETIME') return true;
  if (t.startsWith('TIMESTAMP')) return true;
  return false; // 排除 TIME
}

export function classifyColumns(columns: ColumnInfo[]): {
  dims: string[];
  metrics: string[];
  dates: string[];
} {
  const metrics: string[] = [];
  const dates: string[] = [];
  const dims: string[] = [];
  for (const c of columns || []) {
    if (isNumericType(c.type)) metrics.push(c.name);
    else if (isDateType(c.type)) {
      dates.push(c.name);
      dims.push(c.name);
    } else dims.push(c.name);
  }
  return { dims, metrics, dates };
}

const CHART_TYPES: ChartType[] = ['bar', 'line', 'area', 'pie', 'donut', 'kpi'];
const AGG_FNS: AggFn[] = ['sum', 'count', 'avg', 'min', 'max'];

export function defaultSpec(columns: ColumnInfo[]): ChartSpec {
  const { dims, metrics, dates } = classifyColumns(columns);
  const x = dates[0] ?? dims[0] ?? null;
  const y = metrics.slice(0, 1);
  return {
    type: dates[0] ? 'line' : 'bar',
    x,
    y,
    agg: y.length ? 'sum' : 'count',
    xBin: dates[0] && x === dates[0] ? 'day' : null,
    stacked: false,
  };
}

export function validateSpec(spec: ChartSpec, columns: ColumnInfo[]): ChartSpec {
  const names = new Set((columns || []).map((c) => c.name));
  const typeOk = CHART_TYPES.includes(spec?.type);
  const aggOk = AGG_FNS.includes(spec?.agg);
  const xOk = spec?.type === 'kpi' || (spec?.x != null && names.has(spec.x));
  const yOk = Array.isArray(spec?.y) && spec.y.every((c) => names.has(c));
  if (typeOk && aggOk && xOk && yOk) {
    return spec;
  }
  return defaultSpec(columns);
}
