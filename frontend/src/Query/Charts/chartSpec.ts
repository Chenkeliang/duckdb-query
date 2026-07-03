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

const NUMERIC_RE = /^(u?int(eger)?|u?bigint|u?smallint|mediumint|u?tinyint|u?hugeint|int[248]|decimal|numeric|double|float|real)\b/i;

/** DuckDB 标识符转义:内部双引号翻倍,避免列名注入。 */
function q(id: string): string {
  return `"${String(id).replace(/"/g, '""')}"`;
}

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
  const binOk = spec?.xBin == null || spec.xBin === 'day' || spec.xBin === 'month';
  if (typeOk && aggOk && xOk && yOk && binOk) {
    // 护栏:日期维度不该用饼/环(占比图),日期是趋势 → 自动改折线
    if ((spec.type === 'pie' || spec.type === 'donut') && spec.x) {
      const col = (columns || []).find((c) => c.name === spec.x);
      if (col && isDateType(col.type)) {
        return { ...spec, type: 'line' };
      }
    }
    return spec;
  }
  return defaultSpec(columns);
}

export function stripTrailingLimit(sql: string): string {
  return (sql || '')
    .replace(/;\s*$/, '')
    .replace(/\s+limit\s+\d+\s*(offset\s+\d+\s*)?$/i, '')
    .trim();
}

function xExpr(spec: ChartSpec): string {
  // xBin 仅 day/month(由 validateSpec/UI 保证),x 转义防注入
  if (spec.xBin && spec.x) return `date_trunc('${spec.xBin}', ${q(spec.x)})`;
  return q(spec.x as string);
}

/** 把用户 SQL 包成子查询做全量聚合(截断时用)。返回值由调用方按本地/联邦端点执行。 */
export function buildChartSql(userSql: string, spec: ChartSpec): string {
  const inner = stripTrailingLimit(userSql);
  if (spec.type === 'kpi') {
    const metric = spec.y[0] ? `${spec.agg}(${q(spec.y[0])})` : 'count(*)';
    return `SELECT ${metric} AS metric FROM (${inner}) AS _src`;
  }
  const metricSql = spec.y.length
    ? spec.y.map((col, i) => `${spec.agg}(${q(col)}) AS m_${i}`).join(', ')
    : 'count(*) AS m_0';
  // 无维度(空列等退化场景)用常量单桶,避免生成 "null" 列
  const dimExpr = spec.x ? xExpr(spec) : `'全部'`;
  return `SELECT ${dimExpr} AS dim, ${metricSql} FROM (${inner}) AS _src GROUP BY 1 ORDER BY 1 LIMIT 200`;
}

function escapeSqlString(v: string): string {
  return v.replace(/'/g, "''");
}

/** 把 dim 值(两种形态:服务端 date_trunc 结果 / 客户端 binDim 截断串)归一化为 {y,m,d}。 */
function parseBinValue(v: string): { y: number; m: number; d: number } | null {
  const m = v.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3] ?? 1) };
}

function fmtDate(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

/** day|month bin 的 dim 值 → 半开区间 [start, end)(用 UTC Date 运算天然处理跨月/跨年)。 */
function binRange(v: string, xBin: 'day' | 'month'): { start: string; end: string } | null {
  const parsed = parseBinValue(v);
  if (!parsed) return null;
  const { y, m, d } = parsed;
  if (xBin === 'month') {
    return { start: fmtDate(new Date(Date.UTC(y, m - 1, 1))), end: fmtDate(new Date(Date.UTC(y, m, 1))) };
  }
  return { start: fmtDate(new Date(Date.UTC(y, m - 1, d))), end: fmtDate(new Date(Date.UTC(y, m - 1, d + 1))) };
}

/**
 * 图表点击下钻:把被点的维度值转成明细 SQL(包裹子查询,复用 buildChartSql 的既有模式)。
 * 不可下钻(KPI / 无维度 / 「其它」「全部」合并桶)时返回 null。
 */
export function buildDrilldownSql(spec: ChartSpec, clickedDim: string, sourceSql: string | null): string | null {
  if (!sourceSql || !spec.x || spec.type === 'kpi') return null;
  if (clickedDim === '其它' || clickedDim === '全部') return null;

  let cond: string;
  if (clickedDim === '∅') {
    cond = `${q(spec.x)} IS NULL`;
  } else if (spec.xBin === 'day' || spec.xBin === 'month') {
    const range = binRange(clickedDim, spec.xBin);
    if (!range) return null;
    cond = `${q(spec.x)} >= DATE '${range.start}' AND ${q(spec.x)} < DATE '${range.end}'`;
  } else {
    cond = `${q(spec.x)} = '${escapeSqlString(clickedDim)}'`;
  }

  const inner = stripTrailingLimit(sourceSql);
  // 源 SQL 本身已是同条件的下钻结果(在明细图表上再次点击同一桶)时,不再嵌套包裹
  if (inner.endsWith(`AS _src WHERE ${cond}`)) {
    return `${inner} LIMIT 500`;
  }
  return `SELECT * FROM (${inner}) AS _src WHERE ${cond} LIMIT 500`;
}

export interface AggResult {
  data: Array<Record<string, string | number>>;
  metricKeys: string[];
  kpi?: number;
}

function applyAgg(values: number[], counts: number, agg: AggFn): number {
  if (agg === 'count') return counts;
  if (!values.length) return 0;
  if (agg === 'sum') return values.reduce((a, b) => a + b, 0);
  if (agg === 'avg') return values.reduce((a, b) => a + b, 0) / values.length;
  if (agg === 'min') return Math.min(...values);
  if (agg === 'max') return Math.max(...values);
  return 0;
}

function binDim(v: unknown, xBin?: 'day' | 'month' | null): string {
  const s = v == null ? '∅' : String(v);
  if (!xBin) return s;
  if (xBin === 'day') return s.slice(0, 10);
  if (xBin === 'month') return s.slice(0, 7);
  return s;
}

const MAX_CATS = 200;
const MAX_PIE_CATS = 12; // 饼/环类目过多无法读,封顶 12 + 其它

/** 类目超过 max 时:按首指标降序取 Top-max,其余按聚合方式合并为「其它」(avg 不可合并→截断)。 */
export function capCategories(
  data: Array<Record<string, string | number>>,
  metricKeys: string[],
  agg: AggFn,
  max: number,
): Array<Record<string, string | number>> {
  if (data.length <= max) return data;
  const key = metricKeys[0];
  const sorted = [...data].sort((a, b) => Number(b[key]) - Number(a[key]));
  const top = sorted.slice(0, max);
  const rest = sorted.slice(max);
  if (agg === 'avg') return top;
  const other: Record<string, string | number> = { dim: '其它' };
  for (const k of metricKeys) {
    const vals = rest.map((d) => Number(d[k] || 0));
    other[k] =
      agg === 'min' ? Math.min(...vals) : agg === 'max' ? Math.max(...vals) : vals.reduce((a, b) => a + b, 0);
  }
  return [...top, other];
}

export function aggregateRows(rows: Array<Record<string, unknown>>, spec: ChartSpec): AggResult {
  const metricKeys = spec.y.length ? spec.y : ['count'];
  if (spec.type === 'kpi') {
    const col = spec.y[0];
    const vals = col ? (rows || []).map((r) => Number(r[col])).filter((n) => !Number.isNaN(n)) : [];
    return { data: [], metricKeys, kpi: applyAgg(vals, rows?.length ?? 0, spec.agg) };
  }
  const groups = new Map<string, { count: number; valsByY: Record<string, number[]> }>();
  for (const row of rows || []) {
    const dim = binDim(spec.x ? row[spec.x] : '', spec.xBin);
    let g = groups.get(dim);
    if (!g) {
      g = { count: 0, valsByY: {} };
      spec.y.forEach((y) => (g!.valsByY[y] = []));
      groups.set(dim, g);
    }
    g.count += 1;
    for (const y of spec.y) {
      const n = Number(row[y]);
      if (!Number.isNaN(n)) g.valsByY[y].push(n);
    }
  }
  let data = Array.from(groups.entries()).map(([dim, g]) => {
    const item: Record<string, string | number> = { dim };
    if (spec.y.length) for (const y of spec.y) item[y] = applyAgg(g.valsByY[y], g.count, spec.agg);
    else item['count'] = g.count;
    return item;
  });
  const max = spec.type === 'pie' || spec.type === 'donut' ? MAX_PIE_CATS : MAX_CATS;
  if (data.length > max) {
    data = capCategories(data, metricKeys, spec.agg, max);
  } else {
    data.sort((a, b) => String(a.dim).localeCompare(String(b.dim)));
  }
  return { data, metricKeys };
}
