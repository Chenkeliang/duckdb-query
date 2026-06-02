/**
 * 浏览器内 DuckDB-Wasm 引擎 —— 仅 Demo 模式加载。
 *
 * 本模块只被 `queryApi` 在 `if (IS_DEMO)` 分支里 `await import()`,正常构建不打包它,
 * 也不会下载 duckdb-wasm 的 .wasm。查询结果适配成与后端一致的 `QueryResponse`,
 * 使表格/图表/透视等下游零改动。
 */
import * as duckdb from '@duckdb/duckdb-wasm';
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type { QueryResponse } from '@/api/types';

let connPromise: Promise<AsyncDuckDBConnection> | null = null;

async function initDB(): Promise<AsyncDuckDB> {
  // 从 jsDelivr CDN 选择并实例化合适的 wasm bundle(gh-pages 单线程版即可)
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }),
  );
  const worker = new Worker(workerUrl);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker ?? undefined);
  URL.revokeObjectURL(workerUrl);
  return db;
}

/** 预置示例表:订单/用户/商品 —— 够演示 file↔file JOIN、透视、图表。 */
const SEED_SQL = `
CREATE TABLE users AS SELECT * FROM (VALUES
  (1,'Alice','Shanghai'),(2,'Bob','Beijing'),(3,'Carol','Shenzhen'),
  (4,'Dan','Shanghai'),(5,'Eve','Hangzhou'))
  AS t(user_id, name, city);
CREATE TABLE products AS SELECT * FROM (VALUES
  (101,'Keyboard','Accessories',199.0),(102,'Monitor','Display',1299.0),
  (103,'Mouse','Accessories',89.0),(104,'Laptop','Computer',7999.0))
  AS t(product_id, product_name, category, price);
CREATE TABLE orders AS SELECT * FROM (VALUES
  (1001,1,101,2,DATE '2026-05-02'),(1002,1,104,1,DATE '2026-05-05'),
  (1003,2,102,1,DATE '2026-05-06'),(1004,3,103,3,DATE '2026-05-09'),
  (1005,3,101,1,DATE '2026-05-11'),(1006,4,104,1,DATE '2026-05-15'),
  (1007,5,102,2,DATE '2026-05-20'),(1008,2,103,1,DATE '2026-05-22'))
  AS t(order_id, user_id, product_id, qty, created_at);
`;

async function getConn(): Promise<AsyncDuckDBConnection> {
  if (!connPromise) {
    connPromise = (async () => {
      const db = await initDB();
      const conn = await db.connect();
      await conn.query(SEED_SQL);
      return conn;
    })();
  }
  return connPromise;
}

/** Arrow 类型名 → DuckDB 风格类型名,使图表的数值/日期列识别正常工作。 */
function mapType(arrow: string): string {
  const s = arrow.toLowerCase();
  if (s.includes('bool')) return 'BOOLEAN';
  if (s.includes('timestamp')) return 'TIMESTAMP';
  if (s.includes('date')) return 'DATE';
  if (s.includes('int')) return s.includes('64') ? 'BIGINT' : 'INTEGER';
  if (s.includes('float') || s.includes('double') || s.includes('decimal')) return 'DOUBLE';
  return 'VARCHAR';
}

/** Arrow 单元格 → JSON 可序列化值(BigInt→Number/字符串,Date→ISO)。 */
function cell(v: unknown): unknown {
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
  if (v instanceof Date) return v.toISOString();
  return v;
}

/** 执行 SQL,返回与后端 `/api/duckdb/execute` 一致的 QueryResponse。 */
export async function runWasm(sql: string): Promise<QueryResponse> {
  const conn = await getConn();
  const start = performance.now();
  const result = await conn.query(sql);
  const fields = result.schema.fields;
  const columns = fields.map((f) => ({ name: f.name, type: mapType(String(f.type)) }));
  const data = result.toArray().map((row) => {
    const r = row as unknown as Record<string, unknown>;
    const o: Record<string, unknown> = {};
    for (const f of fields) o[f.name] = cell(r[f.name]);
    return o;
  });
  return {
    success: true,
    data,
    columns,
    row_count: data.length,
    execution_time_ms: Math.round(performance.now() - start),
  };
}

/** 联邦查询(连 MySQL/Postgres)在浏览器内不可用。 */
export function demoFederatedUnsupported(): Error {
  return new Error('在线 Demo 不支持连接外部数据库(MySQL/Postgres),请使用自托管版');
}
