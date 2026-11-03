// Regression 2026-11-02: full-chart aggregation must not silently discard an intentional LIMIT.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildChartSql, buildDrilldownSql } from '../chartSpec';

const python = process.env.DUCKQUERY_TEST_PYTHON ?? resolve(process.cwd(), '../.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
function execute(sql: string): unknown[][] {
  const result = spawnSync(python, ['-c', `
import duckdb,json,sys
with duckdb.connect(':memory:') as con:
    con.execute("CREATE TABLE chart_fixture AS SELECT * FROM (VALUES ('a','9007199254740993.1234'::DECIMAL(20,4)),('b','2.0000'::DECIMAL(20,4)),('c','3.0000'::DECIMAL(20,4))) t(category,amount)")
    print(json.dumps(con.execute(json.load(sys.stdin)['sql']).fetchall(),default=str))
`], { input: JSON.stringify({ sql }), encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.error?.message ?? result.stderr);
  return JSON.parse(result.stdout) as unknown[][];
}
describe('generated chart SQL on real DuckDB', () => {
  /** Regression 2026-11-03: wrapping a trailing line comment swallowed the closing parenthesis. */
  it.each([' -- preview', '; -- preview', '; /* preview */'])('executes aggregation and drilldown after trailing comments: %s', (suffix) => {
    const source = `SELECT * FROM chart_fixture ORDER BY category LIMIT 2${suffix}`;
    expect(execute(buildChartSql(source, { type: 'kpi', x: null, y: ['amount'], agg: 'sum' }))).toEqual([['9007199254740995.1234']]);
    expect(execute(buildDrilldownSql({ type: 'bar', x: 'category', y: ['amount'], agg: 'sum' }, 'b', source)!)).toEqual([['b', '2.0000']]);
  });

  /** Regression 2026-11-03: expanded charts removed user LIMITs instead of only system preview limits. */
  it.each([
    'SELECT * FROM chart_fixture ORDER BY category LIMIT 2',
    'SELECT * FROM chart_fixture ORDER BY category FETCH FIRST 2 ROWS ONLY',
    'SELECT * FROM (SELECT * FROM chart_fixture ORDER BY category LIMIT 2) business_subset',
  ])('keeps business restrictions when wrapping the base SQL: %s', (source) => {
    expect(execute(buildChartSql(source, { type: 'kpi', x: null, y: ['amount'], agg: 'sum' }))).toEqual([['9007199254740995.1234']]);
    expect(execute(buildDrilldownSql({ type: 'bar', x: 'category', y: ['amount'], agg: 'sum' }, 'c', source)!)).toEqual([]);
  });

  /** Regression 2026-11-03: a server-capped result was aggregated without its actual preview range. */
  it('caps the current scope before aggregation, retaining exact decimals and source restrictions', () => {
    const source = 'SELECT * FROM chart_fixture ORDER BY category';
    expect(execute(buildChartSql(source, { type: 'kpi', x: null, y: ['amount'], agg: 'sum' }, [], { previewLimit: 2 }))).toEqual([['9007199254740995.1234']]);
    expect(execute(buildDrilldownSql({ type: 'bar', x: 'category', y: ['amount'], agg: 'sum' }, 'c', source, { previewLimit: 2 })!)).toEqual([]);
  });

  it('retains the original LIMIT by default in the new current-result scope', () => {
    const sql = buildChartSql('SELECT * FROM chart_fixture ORDER BY category LIMIT 2;', { type: 'kpi', x: null, y: ['amount'], agg: 'sum' });
    expect(execute(sql)).toEqual([['9007199254740995.1234']]);
  });
  it('aggregates the limit-free base SQL only when explicitly supplied for the expanded scope', () => {
    const sql = buildChartSql('SELECT * FROM chart_fixture ORDER BY category', { type: 'kpi', x: null, y: ['amount'], agg: 'sum' });
    expect(execute(sql)).toEqual([['9007199254740998.1234']]);
  });
  it('counts result rows and executes grouped SQL without Binder errors', () => {
    expect(execute(buildChartSql('SELECT * FROM chart_fixture LIMIT 2', { type: 'bar', x: 'category', y: [], agg: 'count' }))).toEqual([['a', 1], ['b', 1]]);
  });
  it('keeps current-result drilldown inside the same original LIMIT', () => {
    const spec = { type: 'bar' as const, x: 'category', y: ['amount'], agg: 'sum' as const };
    const source = 'SELECT * FROM chart_fixture ORDER BY category LIMIT 2';
    expect(execute(buildDrilldownSql(spec, 'c', source)!)).toEqual([]);
    expect(execute(buildDrilldownSql(spec, 'b', source)!)).toEqual([['b', '2.0000']]);
  });
  it('executes explicit daily result-row counts and keeps missing dates as a separate result group', () => {
    const source = "SELECT CASE WHEN category IN ('a','b') THEN DATE '2023-10-20' ELSE NULL END AS day FROM chart_fixture LIMIT 3";
    const result = execute(buildChartSql(source, { type: 'line', x: 'day', y: [], agg: 'count', xBin: 'day' }));
    expect(String(result[0][0])).toMatch(/^2023-10-20/);
    expect(result[0][1]).toBe(2);
    expect(result[1]).toEqual([null, 1]);
  });
});
