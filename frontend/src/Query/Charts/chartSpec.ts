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
