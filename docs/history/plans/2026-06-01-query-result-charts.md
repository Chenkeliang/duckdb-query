# 查询结果图表 v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给查询结果区加「图表」视图——AI 推荐起手图、可手动调轴、支持全屏;数据走混合(未截断客户端聚合 / 截断时 wrap 用户 SQL 重跑全量聚合),联邦与 4 个 Tab 都不因 limit 少数据。

**Architecture:** 一个无副作用的纯函数模块 `chartSpec.ts`(列分类 / 默认 spec / 校验 / 生成聚合 SQL / 客户端聚合)是可测核心;`recharts` 纯渲染组件 `ChartCanvas`;容器 `ChartView`(轴选择器 + 混合取数 + AI 推荐 + 全屏);后端 `POST /api/ai/suggest-chart` 给结构化 ChartSpec。先把 SQL Tab 接通,其余 Tab 用同一 `source` 契约接入。

**Tech Stack:** React + TS + recharts ^3 + vitest(前端);FastAPI + LiteLLM + pytest(后端)。

**Spec:** `docs/history/designs/2026-06-01-query-result-charts-design.md`
**Branch:** `feat_result_charts`(已创建)

---

## 关键事实(实现前必读)

- 前端命令在 `frontend/` 下:单测 `npx vitest run <file>`;类型 `npx tsc --noEmit`;构建 `npm run build`。提交从**仓库根目录**执行(`cd /Users/keliang/mypy/duckdb-query`),否则 `git add frontend/...` 路径会错。
- 后端:`cd /Users/keliang/mypy/duckdb-query/api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest <file> -q`。
- 提交署名=用户本人,**禁止** `Co-Authored-By: Claude` / `Generated with Claude Code` trailer。
- `recharts ^3`、`react-markdown` 已装。`recharts` 用 `ResponsiveContainer` + `BarChart/LineChart/AreaChart/PieChart`。
- 执行 API(`src/api/queryApi.ts`):`executeDuckDBSQL(sql)` 和 `executeFederatedQuery({ sql, attachDatabases, isPreview })`,都返回 `QueryResponse`(含 `rows`/`columns`)。图表重跑必须按"本地用前者、联邦用后者+attach"。
- Dialog 组件:`@/components/ui/dialog`(导出 `Dialog, DialogContent` 等)。
- AI 端点模式参照已有 `api/routers/ai.py` 的 `chat_route`/`explain_sql_route`(错误码 `ai_disabled`/`ai_not_configured`/502),服务参照 `api/core/services/ai_chat.py`。
- 列类型字符串是源库原生(MySQL `int(11)`/`varchar(191)`/`datetime`、DuckDB `BIGINT`/`DOUBLE` 等),类型判断要大小写不敏感、去括号。

---

## File Structure

- Create `frontend/src/Query/Charts/chartSpec.ts` — 纯函数:类型/列分类/默认/校验/生成 SQL/客户端聚合。
- Create `frontend/src/Query/Charts/__tests__/chartSpec.test.ts`。
- Create `frontend/src/Query/Charts/ChartCanvas.tsx` — 纯渲染:ChartSpec + data → recharts 图。
- Create `frontend/src/Query/Charts/ChartView.tsx` — 容器:轴选择器 + 混合取数 + AI 推荐 + 来源徽标 + 全屏入口。
- Create `frontend/src/Query/Charts/__tests__/ChartCanvas.test.tsx`。
- Create `frontend/src/api/aiApi.ts`(改)— `suggestChart()`。
- Create `api/core/services/ai_suggest_chart.py` + `api/routers/ai.py`(改)+ `api/tests/test_ai_router.py`(改)。
- Modify 结果区组件(接入 表格|图表 切换 + 传 source)。
- Modify `frontend/src/i18n/locales/{zh,en}/common.json` — `query.chart.*`。

---

## Task 1: chartSpec 类型 + 列分类(纯函数)

**Files:**
- Create: `frontend/src/Query/Charts/chartSpec.ts`
- Test: `frontend/src/Query/Charts/__tests__/chartSpec.test.ts`

- [ ] **Step 1: 写失败测试** — 创建 `__tests__/chartSpec.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isNumericType, isDateType, classifyColumns } from '../chartSpec';

describe('isNumericType', () => {
  it('matches numeric DB types, not text/date', () => {
    ['int(11)', 'BIGINT', 'decimal(11,2)', 'double', 'float', 'tinyint(4)', 'numeric'].forEach((t) =>
      expect(isNumericType(t)).toBe(true),
    );
    ['varchar(191)', 'text', 'datetime', 'date', 'timestamp', 'boolean'].forEach((t) =>
      expect(isNumericType(t)).toBe(false),
    );
  });
});

describe('isDateType', () => {
  it('matches date/datetime/timestamp', () => {
    ['date', 'datetime', 'DATETIME', 'timestamp', 'TIMESTAMP WITH TIME ZONE'].forEach((t) =>
      expect(isDateType(t)).toBe(true),
    );
    ['int(11)', 'varchar(10)', 'time'].forEach((t) => expect(isDateType(t)).toBe(false));
  });
});

describe('classifyColumns', () => {
  it('splits into dims (text+date) / metrics (numeric) / dates', () => {
    const cols = [
      { name: 'category', type: 'varchar(50)' },
      { name: 'created_at', type: 'datetime' },
      { name: 'amount', type: 'decimal(11,2)' },
      { name: 'qty', type: 'int(11)' },
    ];
    const r = classifyColumns(cols);
    expect(r.metrics).toEqual(['amount', 'qty']);
    expect(r.dates).toEqual(['created_at']);
    expect(r.dims).toEqual(['category', 'created_at']); // 文本+日期可作 X
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `cd /Users/keliang/mypy/duckdb-query/frontend && npx vitest run src/Query/Charts/__tests__/chartSpec.test.ts` → FAIL(模块不存在)。

- [ ] **Step 3: 写实现** — 创建 `frontend/src/Query/Charts/chartSpec.ts`:

```ts
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
```

- [ ] **Step 4: 跑测试确认通过** — 同 Step 1 命令 → PASS。

- [ ] **Step 5: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add frontend/src/Query/Charts/chartSpec.ts frontend/src/Query/Charts/__tests__/chartSpec.test.ts && git commit -m "feat(charts): column classification (numeric/date/dim) pure fns"
```

---

## Task 2: defaultSpec + validateSpec(纯函数)

**Files:**
- Modify: `frontend/src/Query/Charts/chartSpec.ts`
- Test: `frontend/src/Query/Charts/__tests__/chartSpec.test.ts`

- [ ] **Step 1: 追加失败测试**

```ts
import { defaultSpec, validateSpec } from '../chartSpec';

describe('defaultSpec', () => {
  it('date dim -> line; first numeric as metric', () => {
    const s = defaultSpec([
      { name: 'created_at', type: 'datetime' },
      { name: 'amount', type: 'decimal(11,2)' },
    ]);
    expect(s.type).toBe('line');
    expect(s.x).toBe('created_at');
    expect(s.y).toEqual(['amount']);
    expect(s.agg).toBe('sum');
  });

  it('no date -> bar; no numeric -> count', () => {
    const s = defaultSpec([{ name: 'category', type: 'varchar(20)' }]);
    expect(s.type).toBe('bar');
    expect(s.x).toBe('category');
    expect(s.y).toEqual([]); // 无数值列 -> count(*)
    expect(s.agg).toBe('count');
  });
});

describe('validateSpec', () => {
  const cols = [
    { name: 'category', type: 'varchar(20)' },
    { name: 'amount', type: 'decimal(11,2)' },
  ];
  it('keeps a valid spec', () => {
    const spec = { type: 'bar' as const, x: 'category', y: ['amount'], agg: 'sum' as const };
    expect(validateSpec(spec, cols)).toEqual(spec);
  });
  it('falls back to defaultSpec on hallucinated columns', () => {
    const bad = { type: 'bar' as const, x: 'nope', y: ['ghost'], agg: 'sum' as const };
    const r = validateSpec(bad, cols);
    expect(r.x).toBe('category'); // 回退 default
  });
  it('falls back on illegal type/agg', () => {
    const bad = { type: 'spiral' as any, x: 'category', y: ['amount'], agg: 'wat' as any };
    const r = validateSpec(bad, cols);
    expect(['bar', 'line', 'area', 'pie', 'donut', 'kpi']).toContain(r.type);
    expect(['sum', 'count', 'avg', 'min', 'max']).toContain(r.agg);
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — FAIL(`defaultSpec`/`validateSpec` 未导出)。

- [ ] **Step 3: 追加实现** — 在 `chartSpec.ts` 末尾追加:

```ts
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
    return {
      type: spec.type,
      x: spec.x ?? null,
      y: spec.y ?? [],
      agg: spec.agg,
      xBin: spec.xBin ?? null,
      stacked: Boolean(spec.stacked),
    };
  }
  return defaultSpec(columns);
}
```

- [ ] **Step 4: 跑测试确认通过** — PASS。
- [ ] **Step 5: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add frontend/src/Query/Charts/chartSpec.ts frontend/src/Query/Charts/__tests__/chartSpec.test.ts && git commit -m "feat(charts): defaultSpec + validateSpec (anti-hallucination fallback)"
```

---

## Task 3: buildChartSql —— 截断时全量重跑的聚合 SQL(纯函数)

**Files:**
- Modify: `frontend/src/Query/Charts/chartSpec.ts`
- Test: `frontend/src/Query/Charts/__tests__/chartSpec.test.ts`

- [ ] **Step 1: 追加失败测试**

```ts
import { buildChartSql, stripTrailingLimit } from '../chartSpec';

describe('stripTrailingLimit', () => {
  it('removes trailing LIMIT / LIMIT OFFSET / trailing ;', () => {
    expect(stripTrailingLimit('SELECT * FROM t LIMIT 10000')).toBe('SELECT * FROM t');
    expect(stripTrailingLimit('SELECT * FROM t limit 50 offset 10')).toBe('SELECT * FROM t');
    expect(stripTrailingLimit('SELECT * FROM t;')).toBe('SELECT * FROM t');
    expect(stripTrailingLimit('SELECT * FROM t')).toBe('SELECT * FROM t');
  });
});

describe('buildChartSql', () => {
  it('wraps user SQL into a GROUP BY aggregation', () => {
    const sql = buildChartSql('SELECT * FROM orders LIMIT 10000', {
      type: 'bar', x: 'status', y: ['amount'], agg: 'sum',
    });
    expect(sql).toContain('FROM (SELECT * FROM orders) AS _src');
    expect(sql).toContain('"status" AS dim');
    expect(sql).toMatch(/sum\("amount"\) AS m_0/);
    expect(sql).toContain('GROUP BY 1');
    expect(sql).toMatch(/LIMIT 200\s*$/);
  });

  it('date x uses date_trunc bin', () => {
    const sql = buildChartSql('SELECT * FROM t', {
      type: 'line', x: 'created_at', y: ['amount'], agg: 'sum', xBin: 'month',
    });
    expect(sql).toContain(`date_trunc('month', "created_at") AS dim`);
  });

  it('no y -> count(*)', () => {
    const sql = buildChartSql('SELECT * FROM t', { type: 'bar', x: 'status', y: [], agg: 'count' });
    expect(sql).toContain('count(*) AS m_0');
  });

  it('kpi -> single metric, no group by', () => {
    const sql = buildChartSql('SELECT * FROM t', { type: 'kpi', x: null, y: ['amount'], agg: 'sum' });
    expect(sql).toContain('sum("amount") AS metric');
    expect(sql).not.toContain('GROUP BY');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**。

- [ ] **Step 3: 追加实现** — 在 `chartSpec.ts` 末尾追加:

```ts
export function stripTrailingLimit(sql: string): string {
  return (sql || '')
    .replace(/;\s*$/, '')
    .replace(/\s+limit\s+\d+\s*(offset\s+\d+\s*)?$/i, '')
    .trim();
}

function xExpr(spec: ChartSpec): string {
  if (spec.xBin && spec.x) return `date_trunc('${spec.xBin}', "${spec.x}")`;
  return `"${spec.x}"`;
}

/** 把用户 SQL 包成子查询做全量聚合(截断时用)。返回值由调用方按本地/联邦端点执行。 */
export function buildChartSql(userSql: string, spec: ChartSpec): string {
  const inner = stripTrailingLimit(userSql);
  if (spec.type === 'kpi') {
    const metric = spec.y[0] ? `${spec.agg}("${spec.y[0]}")` : 'count(*)';
    return `SELECT ${metric} AS metric FROM (${inner}) AS _src`;
  }
  const metricSql = spec.y.length
    ? spec.y.map((col, i) => `${spec.agg}("${col}") AS m_${i}`).join(', ')
    : 'count(*) AS m_0';
  return `SELECT ${xExpr(spec)} AS dim, ${metricSql} FROM (${inner}) AS _src GROUP BY 1 ORDER BY 1 LIMIT 200`;
}
```

- [ ] **Step 4: 跑测试确认通过**。
- [ ] **Step 5: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add frontend/src/Query/Charts/chartSpec.ts frontend/src/Query/Charts/__tests__/chartSpec.test.ts && git commit -m "feat(charts): buildChartSql wraps user SQL into full-data GROUP BY aggregation"
```

---

## Task 4: aggregateRows —— 客户端聚合(未截断时用)

**Files:**
- Modify: `frontend/src/Query/Charts/chartSpec.ts`
- Test: `frontend/src/Query/Charts/__tests__/chartSpec.test.ts`

- [ ] **Step 1: 追加失败测试**

```ts
import { aggregateRows } from '../chartSpec';

describe('aggregateRows', () => {
  const rows = [
    { status: 'paid', amount: 10 },
    { status: 'paid', amount: 30 },
    { status: 'new', amount: 5 },
  ];
  it('groups by x and sums each metric -> recharts data', () => {
    const r = aggregateRows(rows, { type: 'bar', x: 'status', y: ['amount'], agg: 'sum' });
    expect(r.metricKeys).toEqual(['amount']);
    // 排序后:new=5, paid=40
    const paid = r.data.find((d) => d.dim === 'paid');
    expect(paid?.amount).toBe(40);
  });
  it('no y -> count', () => {
    const r = aggregateRows(rows, { type: 'bar', x: 'status', y: [], agg: 'count' });
    expect(r.metricKeys).toEqual(['count']);
    expect(r.data.find((d) => d.dim === 'paid')?.count).toBe(2);
  });
  it('kpi -> single value', () => {
    const r = aggregateRows(rows, { type: 'kpi', x: null, y: ['amount'], agg: 'sum' });
    expect(r.kpi).toBe(45);
  });
  it('caps to Top-200 by total metric, merging the rest into 其它', () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ status: `s${i}`, amount: i }));
    const r = aggregateRows(many, { type: 'bar', x: 'status', y: ['amount'], agg: 'sum' });
    expect(r.data.length).toBeLessThanOrEqual(201);
    expect(r.data.some((d) => d.dim === '其它')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**。

- [ ] **Step 3: 追加实现** — 在 `chartSpec.ts` 末尾追加:

```ts
export interface AggResult {
  data: Array<Record<string, string | number>>; // 每项 { dim, <metricKey>: number, ... }
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
  // 'YYYY-MM-DD...' -> day 取前10位, month 取前7位
  if (xBin === 'day') return s.slice(0, 10);
  if (xBin === 'month') return s.slice(0, 7);
  return s;
}

const MAX_CATS = 200;

export function aggregateRows(rows: Array<Record<string, unknown>>, spec: ChartSpec): AggResult {
  const metricKeys = spec.y.length ? spec.y : spec.agg === 'count' ? ['count'] : ['count'];
  if (spec.type === 'kpi') {
    const col = spec.y[0];
    const vals = col ? (rows || []).map((r) => Number(r[col])).filter((n) => !Number.isNaN(n)) : [];
    return { data: [], metricKeys, kpi: applyAgg(vals, rows?.length ?? 0, spec.agg) };
  }
  // 分组
  const groups = new Map<string, { count: number; valsByY: Record<string, number[]> }>();
  for (const row of rows || []) {
    const dim = binDim(spec.x ? row[spec.x] : '', spec.xBin);
    let g = groups.get(dim);
    if (!g) {
      g = { count: 0, valsByY: {} };
      (spec.y.length ? spec.y : []).forEach((y) => (g!.valsByY[y] = []));
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
  // Top-N(按第一指标降序),其余合并为「其它」
  const key = metricKeys[0];
  if (data.length > MAX_CATS) {
    data.sort((a, b) => Number(b[key]) - Number(a[key]));
    const top = data.slice(0, MAX_CATS);
    const rest = data.slice(MAX_CATS);
    const other: Record<string, string | number> = { dim: '其它' };
    for (const k of metricKeys) other[k] = rest.reduce((s, d) => s + Number(d[k] || 0), 0);
    data = [...top, other];
  } else {
    data.sort((a, b) => String(a.dim).localeCompare(String(b.dim)));
  }
  return { data, metricKeys };
}
```

- [ ] **Step 4: 跑测试确认通过** + 类型检查 `npx tsc --noEmit`(应 0)。
- [ ] **Step 5: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add frontend/src/Query/Charts/chartSpec.ts frontend/src/Query/Charts/__tests__/chartSpec.test.ts && git commit -m "feat(charts): client-side aggregateRows (group/agg/bin/Top-N + KPI)"
```

---

## Task 5: 后端 AI 推荐图表 `POST /api/ai/suggest-chart`

**Files:**
- Create: `api/core/services/ai_suggest_chart.py`
- Modify: `api/routers/ai.py`
- Test: `api/tests/test_ai_router.py`

- [ ] **Step 1: 写失败测试** — 在 `api/tests/test_ai_router.py` 末尾追加:

```python
def test_suggest_chart_returns_spec(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-x",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {}})
    fake = MagicMock()
    fake.choices = [MagicMock(message=MagicMock(
        content='{"type":"bar","x":"status","y":["amount"],"agg":"sum","reason":"按状态汇总金额"}'))]
    with patch("core.services.llm_service.litellm.completion", return_value=fake):
        resp = client.post("/api/ai/suggest-chart", json={
            "columns": [{"name": "status", "type": "varchar(20)"},
                        {"name": "amount", "type": "decimal(11,2)"}],
            "sample": [{"status": "paid", "amount": 10}], "locale": "zh"})
    assert resp.status_code == 200
    d = resp.json()["data"]
    assert d["type"] == "bar"
    assert d["x"] == "status"
    assert d["y"] == ["amount"]
    assert d["agg"] == "sum"


def test_suggest_chart_disabled_has_stable_code(tmp_path, monkeypatch):
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    resp = client.post("/api/ai/suggest-chart", json={
        "columns": [{"name": "x", "type": "int"}], "sample": [], "locale": "zh"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "ai_disabled"
```

- [ ] **Step 2: 跑测试确认失败** — `cd /Users/keliang/mypy/duckdb-query/api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_ai_router.py -q` → FAIL(端点 404)。

- [ ] **Step 3: 写服务** — 创建 `api/core/services/ai_suggest_chart.py`:

```python
"""LLM 推荐图表:给定结果列(名+类型)+样本,产出结构化 ChartSpec。"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List

_TYPES = {"bar", "line", "area", "pie", "donut", "kpi"}
_AGGS = {"sum", "count", "avg", "min", "max"}


def _extract_json(text: str) -> Dict[str, Any]:
    t = (text or "").strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", t, re.DOTALL)
    raw = fence.group(1) if fence else t[t.find("{"): t.rfind("}") + 1]
    try:
        return json.loads(raw)
    except Exception:  # noqa: BLE001
        return {}


def suggest_chart(
    llm,
    columns: List[Dict[str, str]],
    sample: List[Dict[str, Any]],
    locale: str = "zh",
) -> Dict[str, Any]:
    lang = "中文" if locale == "zh" else "English"
    cols_text = ", ".join(f"{c.get('name')}({c.get('type')})" for c in columns)
    system = (
        "You pick ONE chart for a SQL result. Output ONLY JSON: "
        '{"type": one of bar|line|area|pie|donut|kpi, "x": dimension column name or null, '
        '"y": [metric column names], "agg": one of sum|count|avg|min|max, '
        '"xBin": "day"|"month"|null, "reason": short text}. '
        "x/y MUST be real column names from the list. Prefer a date column as x with line; "
        "else a text column as x with bar; numeric column as y. "
        f"Reason in {lang}."
    )
    user = f"Columns: {cols_text}\nSample rows: {json.dumps(sample[:5], ensure_ascii=False)}"
    raw = llm.complete(
        "suggest_chart",
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
    )
    data = _extract_json(raw)
    # 轻校验(详细回退在前端 validateSpec 再做一次)
    out = {
        "type": data.get("type") if data.get("type") in _TYPES else "bar",
        "x": data.get("x"),
        "y": data.get("y") if isinstance(data.get("y"), list) else [],
        "agg": data.get("agg") if data.get("agg") in _AGGS else "sum",
        "xBin": data.get("xBin") if data.get("xBin") in ("day", "month") else None,
        "reason": str(data.get("reason") or ""),
    }
    return out
```

- [ ] **Step 4: 加端点** — 在 `api/routers/ai.py`:把 `ai_suggest_chart` 加入顶部 `from core.services import (...)` 列表(与 `ai_chat` 并列);在文件末尾追加:

```python
class SuggestChartPayload(BaseModel):
    columns: list[Dict[str, Any]] = []
    sample: list[Dict[str, Any]] = []
    locale: str = "zh"


@router.post("/api/ai/suggest-chart", tags=["AI"])
def suggest_chart_route(payload: SuggestChartPayload):
    cfg = ai_config.load_ai_settings()
    try:
        result = ai_suggest_chart.suggest_chart(
            LLMService(cfg), payload.columns, payload.sample, payload.locale
        )
    except (AIDisabledError, AIConfigError) as exc:
        return _ai_error_response(exc)
    except Exception as exc:  # noqa: BLE001
        return error_json_response(
            502, MessageCode.OPERATION_FAILED, f"AI suggest-chart failed: {exc}"
        )
    return create_success_response(data=result, message_code=MessageCode.OPERATION_SUCCESS)
```

(`ai_suggest_chart` 需出现在那个 `from core.services import (...)` 多行 import 中。)

- [ ] **Step 5: 跑测试确认通过** — `cd /Users/keliang/mypy/duckdb-query/api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_ai_router.py -q` → 全绿(含 2 个新用例)。

- [ ] **Step 6: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add api/core/services/ai_suggest_chart.py api/routers/ai.py api/tests/test_ai_router.py && git commit -m "feat(charts): POST /api/ai/suggest-chart -> structured ChartSpec"
```

---

## Task 6: 前端 API `suggestChart()`

**Files:**
- Modify: `frontend/src/api/aiApi.ts`

- [ ] **Step 1: 加实现**(无独立单测,tsc+被组件用) — 在 `aiApi.ts` 末尾追加:

```ts
export interface SuggestChartResult {
  type: 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'kpi';
  x: string | null;
  y: string[];
  agg: 'sum' | 'count' | 'avg' | 'min' | 'max';
  xBin?: 'day' | 'month' | null;
  reason?: string;
}

export async function suggestChart(
  columns: { name: string; type: string }[],
  sample: Record<string, unknown>[],
  opts?: { locale?: 'zh' | 'en' }
): Promise<SuggestChartResult> {
  try {
    const res = await apiClient.post('/api/ai/suggest-chart', {
      columns,
      sample: sample.slice(0, 5),
      locale: opts?.locale ?? 'zh',
    });
    return normalizeResponse<SuggestChartResult>(res).data;
  } catch (e) {
    throw handleApiError(e as never, 'AI 推荐图表失败');
  }
}
```

- [ ] **Step 2: tsc** — `cd /Users/keliang/mypy/duckdb-query/frontend && npx tsc --noEmit` → 0。
- [ ] **Step 3: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add frontend/src/api/aiApi.ts && git commit -m "feat(charts): suggestChart api client"
```

---

## Task 7: `ChartCanvas` 纯渲染组件

**Files:**
- Create: `frontend/src/Query/Charts/ChartCanvas.tsx`
- Test: `frontend/src/Query/Charts/__tests__/ChartCanvas.test.tsx`

- [ ] **Step 1: 写失败测试** — 创建 `__tests__/ChartCanvas.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ChartCanvas } from '../ChartCanvas';

// recharts 在 jsdom 里需要尺寸;mock ResponsiveContainer 为固定尺寸容器
vi.mock('recharts', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 300 }}>{children}</div>
    ),
  };
});

const data = [
  { dim: 'a', amount: 10 },
  { dim: 'b', amount: 20 },
];

describe('ChartCanvas', () => {
  it('renders a bar chart without crashing', () => {
    const { container } = render(
      <ChartCanvas
        spec={{ type: 'bar', x: 'status', y: ['amount'], agg: 'sum' }}
        data={data}
        metricKeys={['amount']}
      />,
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('renders kpi as a big number', () => {
    const { getByText } = render(
      <ChartCanvas
        spec={{ type: 'kpi', x: null, y: ['amount'], agg: 'sum' }}
        data={[]}
        metricKeys={['amount']}
        kpi={45}
      />,
    );
    expect(getByText('45')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**。

- [ ] **Step 3: 写实现** — 创建 `frontend/src/Query/Charts/ChartCanvas.tsx`:

```tsx
import {
  ResponsiveContainer,
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import type { ChartSpec } from './chartSpec';

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#a855f7', '#ef4444', '#eab308', '#06b6d4', '#ec4899'];

export interface ChartCanvasProps {
  spec: ChartSpec;
  data: Array<Record<string, string | number>>;
  metricKeys: string[];
  kpi?: number;
}

export function ChartCanvas({ spec, data, metricKeys, kpi }: ChartCanvasProps) {
  if (spec.type === 'kpi') {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="text-4xl font-semibold tabular-nums">
          {kpi != null ? kpi.toLocaleString() : '-'}
        </div>
      </div>
    );
  }
  if (spec.type === 'pie' || spec.type === 'donut') {
    const key = metricKeys[0];
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip />
          <Legend />
          <Pie
            data={data}
            dataKey={key}
            nameKey="dim"
            innerRadius={spec.type === 'donut' ? '55%' : 0}
            outerRadius="80%"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }
  const common = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="dim" tick={{ fontSize: 11 }} />
      <YAxis tick={{ fontSize: 11 }} />
      <Tooltip />
      <Legend />
    </>
  );
  if (spec.type === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          {common}
          {metricKeys.map((k, i) => (
            <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }
  if (spec.type === 'area') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          {common}
          {metricKeys.map((k, i) => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              stackId={spec.stacked ? 'a' : undefined}
              stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.25}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        {common}
        {metricKeys.map((k, i) => (
          <Bar key={k} dataKey={k} stackId={spec.stacked ? 'a' : undefined} fill={COLORS[i % COLORS.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: 跑测试确认通过**(若 jsdom 下 recharts 仍报尺寸告警但 svg 存在即可)。
- [ ] **Step 5: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add frontend/src/Query/Charts/ChartCanvas.tsx frontend/src/Query/Charts/__tests__/ChartCanvas.test.tsx && git commit -m "feat(charts): ChartCanvas pure renderer (bar/line/area/pie/donut/kpi)"
```

---

## Task 8: i18n `query.chart.*`

**Files:**
- Modify: `frontend/src/i18n/locales/zh/common.json`, `frontend/src/i18n/locales/en/common.json`

- [ ] **Step 1: 加键** — 用脚本安全合并(避免破坏大 JSON):

```bash
cd /Users/keliang/mypy/duckdb-query/frontend && node -e '
const fs=require("fs");
const add={zh:{table:"表格",chart:"图表",type:"类型",dimension:"维度(X)",metric:"指标(Y)",agg:"聚合",bin:"日期分桶",suggest:"AI 推荐",fullscreen:"全屏",basisFull:"全量(聚合)",basisPivot:"全量(透视)",basisRows:"基于前 {{n}} 行(可能不全)",empty:"无可视化数据",bar:"柱状",line:"折线",area:"面积",pie:"饼图",donut:"环形",kpi:"大数字",day:"按天",month:"按月"},
en:{table:"Table",chart:"Chart",type:"Type",dimension:"Dimension (X)",metric:"Metric (Y)",agg:"Aggregate",bin:"Date bin",suggest:"AI suggest",fullscreen:"Fullscreen",basisFull:"Full data (aggregated)",basisPivot:"Full data (pivot)",basisRows:"Based on first {{n}} rows (may be partial)",empty:"No chartable data",bar:"Bar",line:"Line",area:"Area",pie:"Pie",donut:"Donut",kpi:"Big number",day:"By day",month:"By month"}};
for(const lc of ["zh","en"]){const p=`./src/i18n/locales/${lc}/common.json`;const j=JSON.parse(fs.readFileSync(p,"utf8"));j.query=j.query||{};j.query.chart=add[lc];fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n");}
console.log("done");'
```

- [ ] **Step 2: 校验** — `cd /Users/keliang/mypy/duckdb-query/frontend && node -e "require('./src/i18n/locales/zh/common.json').query.chart.bar; require('./src/i18n/locales/en/common.json').query.chart.bar; console.log('ok')"` → `ok`。

- [ ] **Step 3: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add frontend/src/i18n/locales/zh/common.json frontend/src/i18n/locales/en/common.json && git commit -m "feat(charts): query.chart.* i18n (zh/en)"
```

---

## Task 9: `ChartView` 容器(轴选择器 + 混合取数 + AI 推荐 + 全屏 + 来源徽标)

**Files:**
- Create: `frontend/src/Query/Charts/ChartView.tsx`

> 本任务是集成胶水,无独立单测;验证靠 tsc + build + 手动。组件契约见下,务必稳定(供 Task 10 接入)。

- [ ] **Step 1: 写组件** — 创建 `frontend/src/Query/Charts/ChartView.tsx`:

```tsx
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Maximize2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { showErrorToast } from '@/utils/toastHelpers';
import { suggestChart } from '@/api/aiApi';
import { executeDuckDBSQL, executeFederatedQuery } from '@/api/queryApi';
import {
  classifyColumns, defaultSpec, validateSpec, buildChartSql, aggregateRows,
  type ChartSpec, type ChartType, type AggFn, type ColumnInfo,
} from './chartSpec';
import { ChartCanvas } from './ChartCanvas';

export interface ChartSource {
  sql: string | null;                  // 可 wrap 的 SQL(无则只能客户端)
  attachDatabases?: { alias: string; connectionId: string }[];
  requiresFederated?: boolean;
}
export interface ChartViewProps {
  columns: ColumnInfo[];
  rows: Array<Record<string, unknown>>;
  truncated: boolean;                  // 结果是否可能被 maxQueryRows 截断
  source: ChartSource;
  aiEnabled: boolean;                  // 来自 useAiStatus('suggest_chart' 等价).configured;未配置则跳过 AI
  locale?: 'zh' | 'en';
}

const TYPES: ChartType[] = ['bar', 'line', 'area', 'pie', 'donut', 'kpi'];
const AGGS: AggFn[] = ['sum', 'count', 'avg', 'min', 'max'];

export function ChartView({ columns, rows, truncated, source, aiEnabled, locale = 'zh' }: ChartViewProps) {
  const { t } = useTranslation('common');
  const { dims, metrics, dates } = React.useMemo(() => classifyColumns(columns), [columns]);
  const [spec, setSpec] = React.useState<ChartSpec>(() => defaultSpec(columns));
  const [full, setFull] = React.useState(false);
  const [suggesting, setSuggesting] = React.useState(false);
  // 全量聚合数据(截断时重跑得到);未截断则用客户端聚合
  const [serverAgg, setServerAgg] = React.useState<{ data: any[]; metricKeys: string[]; kpi?: number } | null>(null);
  const [loadingAgg, setLoadingAgg] = React.useState(false);

  // 列变化 → 重置 spec(并尝试 AI 推荐)
  React.useEffect(() => {
    let alive = true;
    const base = defaultSpec(columns);
    setSpec(base);
    setServerAgg(null);
    if (aiEnabled && columns.length) {
      setSuggesting(true);
      suggestChart(columns, rows.slice(0, 5), { locale })
        .then((s) => { if (alive) setSpec(validateSpec(s as ChartSpec, columns)); })
        .catch(() => {/* 静默,用 default */})
        .finally(() => { if (alive) setSuggesting(false); });
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(columns.map((c) => c.name))]);

  // 截断时:spec 变 → 重跑聚合 SQL 取全量
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
        const rs: any[] = resp.rows || [];
        if (spec.type === 'kpi') {
          setServerAgg({ data: [], metricKeys: spec.y.length ? spec.y : ['count'], kpi: Number(rs[0]?.metric ?? 0) });
        } else {
          const metricKeys = spec.y.length ? spec.y : ['count'];
          const data = rs.map((r) => {
            const item: Record<string, any> = { dim: r.dim };
            if (spec.y.length) spec.y.forEach((y, i) => (item[y] = Number(r[`m_${i}`])));
            else item['count'] = Number(r['m_0']);
            return item;
          });
          setServerAgg({ data, metricKeys });
        }
      })
      .catch((e) => { if (alive) { setServerAgg(null); showErrorToast(t, e as Error, t('query.chart.empty', '无可视化数据')); } })
      .finally(() => { if (alive) setLoadingAgg(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truncated, source.sql, JSON.stringify(spec)]);

  // 客户端聚合(未截断,或截断但无 source.sql 的兜底)
  const clientAgg = React.useMemo(() => aggregateRows(rows, spec), [rows, spec]);
  const usingServer = truncated && !!source.sql && !!serverAgg;
  const agg = usingServer ? serverAgg! : clientAgg;
  const basis = usingServer
    ? t('query.chart.basisFull', '全量(聚合)')
    : truncated
      ? t('query.chart.basisRows', '基于前 {{n}} 行(可能不全)', { n: rows.length })
      : t('query.chart.basisFull', '全量(聚合)');

  if (!columns.length || !rows.length) {
    return <div className="p-6 text-sm text-muted-foreground">{t('query.chart.empty', '无可视化数据')}</div>;
  }

  const xOptions = spec.type === 'kpi' ? [] : dims;
  const renderChart = () => <ChartCanvas spec={spec} data={agg.data} metricKeys={agg.metricKeys} kpi={agg.kpi} />;

  return (
    <div className="flex h-full flex-col">
      {/* 轴选择器 */}
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
      {/* 画布 */}
      <div className="relative min-h-0 flex-1 p-2">
        {loadingAgg && <div className="absolute right-3 top-3 z-10"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
        {renderChart()}
      </div>
      {/* 全屏 */}
      <Dialog open={full} onOpenChange={setFull}>
        <DialogContent className="h-[85vh] w-[92vw] max-w-none p-4">
          <div className="h-full w-full">{renderChart()}</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: tsc** — `cd /Users/keliang/mypy/duckdb-query/frontend && npx tsc --noEmit`。若 `@/components/ui/dialog` 的导出名不符(应为 `Dialog`/`DialogContent`),或 `executeFederatedQuery` 的入参类型不符,按实际签名修正(读对应文件)。Expected: 0。

- [ ] **Step 3: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add frontend/src/Query/Charts/ChartView.tsx && git commit -m "feat(charts): ChartView container (axis pickers + hybrid fetch + AI suggest + fullscreen + basis badge)"
```

---

## Task 10: 接入结果区(表格 | 图表 切换 + 传 source)

**Files:**
- Modify: 查询结果渲染处(定位:含结果表格 + 「导出」按钮的组件,候选 `frontend/src/Query/SQLQuery/` 下的结果面板 / `frontend/src/Query/DataGrid/`;以及 `SQLQueryPanel.tsx` 持有 `sql`/`attachDatabases`/`requiresFederatedQuery`/结果 `rows`/`columns` 的地方)。

- [ ] **Step 1: 定位结果渲染 + 数据来源**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && grep -rn "rows=\|columns=\|<DataGrid\|结果\|truncat\|maxQueryRows\|queryResult" src/Query/SQLQuery/SQLQueryPanel.tsx | head -30`
确认:结果的 `rows`/`columns` 在哪个 state、是否有"截断"信息(若无,用 `rows.length >= maxQueryRows` 推断 `truncated`)、`sql`(执行用的 displaySql 去 LIMIT 前的原 SQL)、`attachDatabases`、`requiresFederatedQuery`。

- [ ] **Step 2: 在结果区加 表格|图表 切换**

在结果渲染容器外层加一个视图 state `const [resultView, setResultView] = useState<'table'|'chart'>('table')` 和两个小 Tab 按钮(复用 `Button` ghost/active 模式,文案 `t('query.chart.table','表格')` / `t('query.chart.chart','图表')`)。`table` 时渲染原有结果表格;`chart` 时渲染:

```tsx
<ChartView
  columns={resultColumns /* {name,type}[] */}
  rows={resultRows}
  truncated={resultRows.length >= maxQueryRows}
  source={{
    sql: lastExecutedSql,                 // 执行的 SQL(可为去LIMIT前的原 SQL;ChartView 内部会 stripTrailingLimit)
    attachDatabases: attachDatabases.map((d) => ({ alias: d.alias, connectionId: d.connectionId })),
    requiresFederated: requiresFederatedQuery,
  }}
  aiEnabled={askStatus.configured}        // 复用现有 useAiStatus；未配置则不出 AI 推荐按钮
  locale={aiLocale}
/>
```

`import { ChartView } from '@/Query/Charts/ChartView';`。`resultColumns` 需是 `{name,type}[]`;若现有结果列只有名字没类型,从 `tableColumnsMap`/结果 schema 补类型,缺失则给 `''`(`classifyColumns` 会把无类型当维度,可用但 metric 识别弱——尽量带上类型)。

- [ ] **Step 3: tsc + build**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx tsc --noEmit && npm run build`
Expected: tsc 0;build 成功。

- [ ] **Step 4: 提交**

```bash
cd /Users/keliang/mypy/duckdb-query && git add frontend/src/Query/SQLQuery && git commit -m "feat(charts): wire table|chart toggle + source into SQL result panel"
```

- [ ] **Step 5(可选,后续):JOIN / 集合 / 透视 Tab**

同 source 契约接入:JOIN 传 `buildJoinPreviewSql` 的生成 SQL + attach;集合传生成 base SQL;透视传 `{ sql: null }`(结果即全量聚合,走客户端)。若这些 Tab 与 SQL Tab 共用同一结果渲染容器,则只需把当前 Tab 的 `source` 传入即可,无需逐个改。本步可拆为独立后续任务。

---

## Task 11: 全量回归 + 收尾

- [ ] **Step 1: 后端 AI 测试**

Run: `cd /Users/keliang/mypy/duckdb-query/api && /Users/keliang/mypy/duckdb-query/.venv/bin/python -m pytest tests/test_ai_router.py -q`
Expected: 全绿。

- [ ] **Step 2: 前端类型 + 单测 + 构建**

Run: `cd /Users/keliang/mypy/duckdb-query/frontend && npx tsc --noEmit && npx vitest run src/Query/Charts && npm run build`
Expected: tsc 0;Charts 测试全绿;build 成功。

- [ ] **Step 3: 后端重启(加载 /api/ai/suggest-chart)+ 前端重建**

Run: `cd /Users/keliang/mypy/duckdb-query && docker restart dataquery-backend && docker compose up -d --build frontend`
Expected: backend healthy;frontend started。

- [ ] **Step 4: 手动核验清单**

1. 跑一个 `SELECT status, amount FROM ...`(本地或联邦,结果 < 1万)→ 切「图表」→ 出柱/线图;来源徽标=全量(聚合)。
2. 改类型/X/Y/聚合 → 实时重画;⤢ 全屏 → 大图。
3. AI 推荐(已配置)→ 给一个合理起手图。
4. 跑一个会截断的大联邦查询(结果=1万)→ 切图表 → 看到"全量(聚合)"且数值正确(聚合在远端算、不只是前1万)。
5. 透视表结果 → 图表能画。

- [ ] **Step 5: 完成分支** — 调用 finishing-a-development-branch(合并回 main 由用户定;合并后 `docker compose up -d --build` 从 main 重建)。

---

## Self-Review(计划自审)

- **Spec 覆盖**:§2 决策→全任务;§3 ChartSpec→Task1-4 类型;§4 混合→Task3/4 + Task9 取数逻辑;§4.1 各 Tab/全量保证→Task10(SQL 接入 + Step5 其余 Tab + truncated 判定 + basis 徽标);§5 AI 推荐→Task5/6/9(含 validateSpec 防幻觉);§6 UI→Task9(轴选择器/全屏)+Task10(切换);§7 边界→Task2/3/4(无数值→count、日期分桶、Top-N、幻觉回退)+Task9(空态、客户端兜底+徽标);§8 测试→Task1-7;§9 文件→对应;i18n→Task8。无遗漏。
- **占位符扫描**:无 TBD;每个改码步骤含完整代码/命令。Task10 是集成,给了定位命令 + 明确 source 契约 + 具体 JSX(非占位)。
- **类型一致**:`ChartSpec`/`ChartType`/`AggFn`/`ColumnInfo` 在 Task1-2 定义,Task3/4/7/9 一致引用;`buildChartSql` 产出 `dim`/`m_i`,Task9 解析 `r.dim`/`r['m_i']` 一致;`ChartSource`/`ChartViewProps` 在 Task9 定义、Task10 按契约传入;`suggestChart` 签名 Task6 定义、Task9 使用一致;后端 `suggest_chart` 出参字段与前端 `SuggestChartResult`/`validateSpec` 一致。
- **风险标注**:Task9 标注了 dialog 导出名/federated 入参需按实际签名核;Task10 标注 truncated 判定与 resultColumns 带类型的注意点。
